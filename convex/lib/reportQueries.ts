/**
 * Core period query helpers for all financial reports.
 *
 * ARCHITECTURE RULE: Every financial report that shows a monetary figure
 * (revenue, profit, balance, cost, tax) MUST call this module. No report
 * may read amounts from the sales, invoices, bills, or products tables.
 *
 * Backfill was confirmed complete (missing: 0) before Milestone 2 was built.
 * The assertBackfillComplete guard has been removed.
 */
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";

export type PostedLine = Doc<"journalLines"> & {
  date: string;
  status: string;
};

/**
 * Returns all posted journal lines whose denormalized date falls within
 * [startDate, endDate] inclusive (ISO 8601 date strings, e.g. "2025-01-01").
 *
 * Uses the by_status_and_date index: O(lines in period), not O(all lines).
 */
export async function getPostedLinesForPeriod(
  ctx: QueryCtx,
  startDate: string,
  endDate: string,
): Promise<PostedLine[]> {
  const lines = await ctx.db
    .query("journalLines")
    .withIndex("by_status_and_date", (q) =>
      q.eq("status", "posted").gte("date", startDate).lte("date", endDate),
    )
    .collect();

  return lines as PostedLine[];
}

/**
 * Returns all posted journal lines for a single account within a date range.
 * Uses the by_account_and_date index.
 */
export async function getPostedLinesForAccount(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  startDate: string,
  endDate: string,
): Promise<PostedLine[]> {
  const lines = await ctx.db
    .query("journalLines")
    .withIndex("by_account_and_date", (q) =>
      q.eq("accountId", accountId).gte("date", startDate).lte("date", endDate),
    )
    .collect();

  return lines.filter((l) => l.status === "posted") as PostedLine[];
}

/**
 * Returns all posted journal lines for a single account before a given date
 * (used to compute opening balances).
 */
export async function getPostedLinesForAccountBefore(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  beforeDate: string,
): Promise<PostedLine[]> {
  const lines = await ctx.db
    .query("journalLines")
    .withIndex("by_account_and_date", (q) =>
      q.eq("accountId", accountId).lt("date", beforeDate),
    )
    .collect();

  return lines.filter((l) => l.status === "posted") as PostedLine[];
}
