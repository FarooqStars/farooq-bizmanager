import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

// ─── enforcePostingDate ───────────────────────────────────────────────────────
//
// Single enforcement point for all period/closing-date locks. Every mutation
// that creates, edits, voids, or deletes a dated financial document must call
// this before touching the ledger.
//
// Rules (read before editing):
//
//   1. Global closing date: blocks any date on or before companyProfile.closingDate.
//
//   2. Fiscal period status: if a fiscal period covers the date, its status applies.
//      - "open"   → allowed (global closing date still checked above)
//      - "closed" → blocked; owner must reopen via reopenFiscalPeriod
//      - "locked" → blocked; externally reported period, harder unlock required
//
//   3. INVARIANT — absence of a period is NOT a block.
//      createFiscalPeriod is the only insert path. A fresh install has zero periods.
//      Any check that requires a covering period to exist before allowing a post
//      would block every new client on day one. Do not change this rule.
//
//   4. Error messages name the specific lock and value so the user knows the remedy.
//      Two remedies exist: (a) move the closing date, (b) reopen a fiscal period.
//      "Cannot post to this date" is useless — it must say which one fired.
//
// Exempt mutations (call these without enforcePostingDate — they ARE the closing ops):
//   closeYearEnd, closeFiscalPeriod, lockFiscalPeriod, reopenFiscalPeriod, setClosingDate
//
export async function enforcePostingDate(
  ctx: QueryCtx | MutationCtx,
  transactionDate: string,
): Promise<void> {
  const date = transactionDate.slice(0, 10);

  // ── 1. Global closing date ──────────────────────────────────────────────────
  const profiles = await ctx.db.query("companyProfile").take(1);
  const closingDate = profiles[0]?.closingDate?.slice(0, 10) ?? null;

  const blockedByClosingDate = closingDate !== null && date <= closingDate;

  // ── 2. Fiscal period status ─────────────────────────────────────────────────
  // Query periods whose startDate <= date (index: by_start_date), then filter
  // in JS for endDate >= date. Periods are typically 12–60 rows; this is safe.
  const candidates = await ctx.db
    .query("fiscalPeriods")
    .withIndex("by_start_date", (q) => q.lte("startDate", date))
    .collect();

  const coveringPeriod = candidates.find((p) => p.endDate >= date) ?? null;

  // INVARIANT: if no period covers this date, only the closing date applies.
  // See rule 3 above.
  if (coveringPeriod === null) {
    if (blockedByClosingDate) {
      throw new ConvexError({
        message: `${date} is on or before the global closing date (${closingDate}). Move the closing date to post here.`,
        code: "FORBIDDEN",
      });
    }
    return;
  }

  const periodBlocked =
    coveringPeriod.status === "closed" || coveringPeriod.status === "locked";

  // ── 3. Neither lock fires → allow ──────────────────────────────────────────
  if (!blockedByClosingDate && !periodBlocked) return;

  // ── 4. Build the error message naming which lock(s) fired ──────────────────
  if (periodBlocked && blockedByClosingDate) {
    const action =
      coveringPeriod.status === "locked"
        ? "Owner confirmation and an audit entry are required to unlock it."
        : "The owner can reopen it in Accounting > Fiscal Periods.";
    throw new ConvexError({
      message:
        `${date} falls in '${coveringPeriod.name}', which is ${coveringPeriod.status}. ${action} ` +
        `This date is also on or before the global closing date (${closingDate}).`,
      code: "FORBIDDEN",
    });
  }

  if (periodBlocked) {
    const action =
      coveringPeriod.status === "locked"
        ? "This period has been reported externally. Owner confirmation and an audit entry are required to unlock it."
        : "The owner can reopen it in Accounting > Fiscal Periods.";
    throw new ConvexError({
      message: `${date} falls in '${coveringPeriod.name}', which is ${coveringPeriod.status}. ${action}`,
      code: "FORBIDDEN",
    });
  }

  // Period is open but global closing date fires
  throw new ConvexError({
    message: `${date} is on or before the global closing date (${closingDate}). Move the closing date in Accounting > Settings to post here.`,
    code: "FORBIDDEN",
  });
}

// ── Query to get the current closing date ────────────────────────────────────

export const getClosingDate = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const profiles = await ctx.db.query("companyProfile").take(1);
    const profile = profiles[0];
    if (!profile) return null;

    return {
      closingDate: profile.closingDate ?? null,
      closingDateSetAt: profile.closingDateSetAt ?? null,
      closingDateSetBy: profile.closingDateSetBy ?? null,
    };
  },
});

// ── Set / update the global closing date (owner only) ────────────────────────

export const setClosingDate = mutation({
  args: { closingDate: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can set the closing date", code: "FORBIDDEN" });
    }

    const profiles = await ctx.db.query("companyProfile").take(1);
    if (!profiles[0]) {
      throw new ConvexError({ message: "Company profile must be set up first", code: "BAD_REQUEST" });
    }

    const before = JSON.stringify({ closingDate: profiles[0].closingDate ?? null });
    await ctx.db.patch(profiles[0]._id, {
      closingDate: args.closingDate ?? undefined,
      closingDateSetBy: user._id,
      closingDateSetAt: new Date().toISOString(),
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "closingDate:setClosingDate",
      resourceType: "companyProfile",
      resourceId: profiles[0]._id,
      action: "closing_date_set",
      beforeValue: before,
      afterValue: JSON.stringify({ closingDate: args.closingDate ?? null }),
      details: args.closingDate
        ? `Global closing date set to ${args.closingDate}`
        : "Global closing date cleared",
    });
  },
});

// ── Reopen a fiscal period (owner only) ──────────────────────────────────────
//
// Allowed transitions:
//   closed → open    owner, reason required
//   locked → closed  owner, reason required + explicit warning; sets reopenedSinceReport
//
// The reopenedSinceReport flag stays true until the period is locked again.
// The Reconciliation Panel shows a red warning for any period where it is true.
//
export const reopenFiscalPeriod = mutation({
  args: {
    id: v.id("fiscalPeriods"),
    reason: v.string(),
    // For locked → closed only. The UI must show a warning naming the period and
    // stating that reported figures may change before this is sent.
    confirmedExternallyReported: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "owner") {
      throw new ConvexError({
        message: "Only owners can reopen fiscal periods",
        code: "FORBIDDEN",
      });
    }

    if (!args.reason || args.reason.trim().length === 0) {
      throw new ConvexError({
        message: "A reason is required to reopen a fiscal period",
        code: "BAD_REQUEST",
      });
    }

    const period = await ctx.db.get(args.id);
    if (!period) throw new ConvexError({ message: "Fiscal period not found", code: "NOT_FOUND" });

    if (period.status === "open") {
      throw new ConvexError({ message: "Period is already open", code: "BAD_REQUEST" });
    }

    const before = JSON.stringify(period);
    let newStatus: "open" | "closed";

    if (period.status === "locked") {
      // Requires explicit UI confirmation that the period was externally reported.
      if (!args.confirmedExternallyReported) {
        throw new ConvexError({
          message:
            `'${period.name}' is locked because it was reported externally (VAT filing, audit, etc). ` +
            `Reopening it means system figures may differ from what was filed. ` +
            `Pass confirmedExternallyReported: true to confirm.`,
          code: "BAD_REQUEST",
        });
      }
      // locked → closed; set standing flag
      await ctx.db.patch(args.id, {
        status: "closed",
        reopenedSinceReport: true,
      });
      newStatus = "closed";
    } else {
      // closed → open
      await ctx.db.patch(args.id, {
        status: "open",
        reopenedSinceReport: undefined,
      });
      newStatus = "open";
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "closingDate:reopenFiscalPeriod",
      resourceType: "fiscalPeriod",
      resourceId: args.id,
      action: "fiscal_period_reopened",
      beforeValue: before,
      afterValue: JSON.stringify({ ...period, status: newStatus }),
      reason: args.reason,
      details: `Reopened fiscal period '${period.name}' from ${period.status} to ${newStatus}. Reason: ${args.reason}`,
    });
  },
});
