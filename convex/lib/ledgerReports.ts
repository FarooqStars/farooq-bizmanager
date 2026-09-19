// ─────────────────────────────────────────────────────────────────────────────
// Ledger-based reporting helpers.
//
// Every financial report (Trial Balance, Balance Sheet, P&L, Cash Flow, Dashboard
// KPIs) reads through these helpers so they all reconcile against the same posted
// journal entries. Reports must NEVER aggregate raw subledger tables (sales,
// expenses, payments) directly — that double-counts a sale and its payment.
// ─────────────────────────────────────────────────────────────────────────────
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel.d.ts";
import {
  ASSET_TYPES,
  LIABILITY_TYPES,
  EQUITY_TYPES,
  INCOME_TYPES,
  EXPENSE_TYPES,
  round2,
} from "./ledger.ts";

export type LedgerAggregation = {
  /** Signed balance per account id, respecting each account's normal side. */
  byAccount: Map<string, number>;
  /** Raw debit total per account id. */
  debitByAccount: Map<string, number>;
  /** Raw credit total per account id. */
  creditByAccount: Map<string, number>;
};

/**
 * Aggregate posted journal activity into per-account balances within an optional
 * inclusive date range. Dates are ISO `YYYY-MM-DD` strings compared lexically.
 * Passing only `endDate` gives "as of" balances; passing both gives period
 * activity (used for P&L and cash flow).
 */
export async function aggregatePostedLines(
  ctx: QueryCtx,
  accounts: Doc<"accounts">[],
  opts: { startDate?: string; endDate?: string } = {},
): Promise<LedgerAggregation> {
  const posted = await ctx.db
    .query("journalEntries")
    .withIndex("by_status", (q) => q.eq("status", "posted"))
    .collect();

  // Which posted entries fall inside the requested range.
  const inRange = new Set<string>();
  for (const e of posted) {
    if (opts.startDate && e.date < opts.startDate) continue;
    if (opts.endDate && e.date > opts.endDate) continue;
    inRange.add(e._id as string);
  }

  const acctById = new Map(accounts.map((a) => [a._id as string, a]));
  const byAccount = new Map<string, number>();
  const debitByAccount = new Map<string, number>();
  const creditByAccount = new Map<string, number>();

  const lines = await ctx.db.query("journalLines").collect();
  for (const line of lines) {
    if (!inRange.has(line.journalEntryId as string)) continue;
    const acct = acctById.get(line.accountId as string);
    if (!acct) continue;
    const key = line.accountId as string;
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    debitByAccount.set(key, (debitByAccount.get(key) ?? 0) + debit);
    creditByAccount.set(key, (creditByAccount.get(key) ?? 0) + credit);
    const delta = acct.normalSide === "debit" ? debit - credit : credit - debit;
    byAccount.set(key, (byAccount.get(key) ?? 0) + delta);
  }

  return { byAccount, debitByAccount, creditByAccount };
}

/** Sum signed balances for every account whose type is in `group`. */
export function sumByGroup(
  accounts: Doc<"accounts">[],
  byAccount: Map<string, number>,
  group: readonly string[],
): number {
  let total = 0;
  for (const a of accounts) {
    if (group.includes(a.type)) total += byAccount.get(a._id as string) ?? 0;
  }
  return round2(total);
}

/**
 * Net income for the given balances, from the ledger. Contributes each income
 * and expense account to equity by its NORMAL SIDE, not its type: credit-normal
 * accounts (revenue) add, debit-normal accounts (expenses AND contra-revenue like
 * Sales Returns) subtract. This is what makes the Balance Sheet's folded net
 * income tie back exactly to the Trial Balance, even with contra accounts.
 */
export function netIncomeFromBalances(
  accounts: Doc<"accounts">[],
  byAccount: Map<string, number>,
): number {
  let net = 0;
  for (const a of accounts) {
    const isIncomeOrExpense =
      INCOME_TYPES.includes(a.type) || EXPENSE_TYPES.includes(a.type);
    if (!isIncomeOrExpense) continue;
    const b = byAccount.get(a._id as string) ?? 0;
    net += a.normalSide === "credit" ? b : -b;
  }
  return round2(net);
}

export { ASSET_TYPES, LIABILITY_TYPES, EQUITY_TYPES, INCOME_TYPES, EXPENSE_TYPES };
