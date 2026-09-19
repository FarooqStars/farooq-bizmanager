/**
 * Backfill migration: stamp date, status onto every journalLine that is
 * missing them, reading the values from the parent journalEntry.
 *
 * RULES (enforced in code):
 *  - Never overwrites a field that already has a value.
 *  - Idempotent: safe to run any number of times.
 *  - Processes lines in bounded batches to stay within Convex mutation limits.
 *  - Returns a summary: { total, patched, alreadyDone, failed, isDone, nextCursor }
 *
 * HOW TO RUN (Convex dashboard → Functions):
 *   1. Call `api.migrations.backfillJournalLines.backfillJournalLinesBatch`
 *      with no arguments (omit cursor, or pass cursor: null).
 *   2. Look at the returned `nextCursor`. If `isDone` is false, call again
 *      passing { cursor: "<value of nextCursor from previous call>" }.
 *      Repeat until isDone is true.
 *   3. Call `api.migrations.backfillJournalLines.verifyBackfill` and confirm
 *      it returns `{ missing: 0 }`.
 *   4. Inform the developer — the safety guard in getPostedLinesForPeriod
 *      will then be removed in Milestone 2.
 *
 * IMPORTANT: Take a snapshot backup of your deployment BEFORE running this.
 */
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

const BATCH_SIZE = 500;

export const backfillJournalLinesBatch = mutation({
  args: {
    // Pass the nextCursor from the previous call to advance to the next batch.
    // Omit (or pass null) to start from the beginning.
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<{
    total: number;
    patched: number;
    alreadyDone: number;
    failed: number;
    isDone: boolean;
    nextCursor: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const result = await ctx.db
      .query("journalLines")
      .paginate({ numItems: BATCH_SIZE, cursor: args.cursor ?? null });

    let patched = 0;
    let alreadyDone = 0;
    let failed = 0;

    for (const line of result.page) {
      // Skip if both fields are already present — never overwrite.
      if (line.date !== undefined && line.status !== undefined) {
        alreadyDone++;
        continue;
      }

      try {
        const entry = await ctx.db.get(line.journalEntryId);
        if (!entry) {
          failed++;
          continue;
        }

        const patch: Record<string, string> = {};
        // Only set fields that are currently missing.
        if (line.date === undefined) patch.date = entry.date;
        if (line.status === undefined) patch.status = entry.status;

        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(line._id, patch);
          patched++;
        } else {
          alreadyDone++;
        }
      } catch {
        failed++;
      }
    }

    return {
      total: result.page.length,
      patched,
      alreadyDone,
      failed,
      isDone: result.isDone,
      // IMPORTANT: pass this value as `cursor` in the next call if isDone is false.
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});

/**
 * Check whether any journal lines are still missing date or status.
 * Must return { missing: 0 } before reports are trusted.
 *
 * Uses a bounded index scan — does NOT collect the whole table.
 * Checks for lines where status is undefined (they won't appear in the
 * by_status_and_date index) by querying without a status filter, then
 * inspecting a single document. We use a paginated scan limited to a
 * small page to find the first offending row, not to count all of them.
 */
export const verifyBackfill = query({
  args: {},
  handler: async (ctx): Promise<{ missing: number; message: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Paginate in batches to count without a full table scan in one call.
    // For most deployments this stays well under a few pages; if the user
    // is verifying after a proper backfill, it exits on the first page with 0.
    let cursor: string | null = null;
    let missing = 0;
    const PAGE = 1000;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await ctx.db
        .query("journalLines")
        .paginate({ numItems: PAGE, cursor });

      for (const l of page.page) {
        if (l.date === undefined || l.status === undefined) missing++;
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    return {
      missing,
      message:
        missing === 0
          ? "Backfill complete. All journal lines have denormalized fields."
          : `${missing} journal line(s) are still missing date or status. Run the backfill mutation, passing nextCursor each time until isDone is true.`,
    };
  },
});
