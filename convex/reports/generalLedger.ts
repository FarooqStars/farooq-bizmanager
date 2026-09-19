/**
 * General Ledger Detail — Report 5.
 *
 * Returns per-account detail: opening balance, every posted line in date order with
 * running balance, period totals, and closing balance (reconciled against accounts.balance).
 *
 * ARCHITECTURE: amounts from journalLines only. sourceType + sourceId used to build
 * human-readable "source document" labels for each line.
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  getPostedLinesForAccount,
  getPostedLinesForAccountBefore,
  type PostedLine,
} from "../lib/reportQueries.ts";

// ─── Helpers (inline to avoid circular imports) ───────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function netFromLines(
  lines: Array<{ debit: number; credit: number }>,
  normalSide: "debit" | "credit",
): number {
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  return normalSide === "debit" ? d - c : c - d;
}

// ─── Source document label builder ───────────────────────────────────────────

/** Maps sourceType prefix → human-readable label prefix */
const SOURCE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  invoice_reversal: "Invoice Void",
  bill: "Bill",
  bill_reversal: "Bill Void",
  goods_receipt: "Goods Receipt",
  goods_receipt_reversal: "GR Reversal",
  payment: "Payment",
  payment_reversal: "Payment Void",
  credit_memo: "Credit Memo",
  debit_memo: "Debit Memo",
  sale: "Sale",
  sale_reversal: "Sale Void",
  return: "Return",
  bank_transfer: "Bank Transfer",
  bank_reconciliation: "Bank Reconciliation",
  depreciation: "Depreciation",
  payroll: "Payroll",
  adjustment: "Adjustment",
};

function sourceLabel(sourceType?: string | null, sourceId?: string | null): string {
  if (!sourceType) return "Manual Entry";
  const prefix = SOURCE_LABELS[sourceType] ?? sourceType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  // sourceId is often the raw Convex ID — include only the last 6 chars for brevity
  if (sourceId && sourceId.length > 6) {
    return `${prefix} #…${sourceId.slice(-6)}`;
  }
  return prefix;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type GLLineRow = {
  lineId: string;
  journalEntryId: string;
  entryNumber: string;
  date: string;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceLabel: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type GLAccountDetail = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  normalSide: "debit" | "credit";
  openingBalance: number;
  lines: GLLineRow[];
  periodTotalDebit: number;
  periodTotalCredit: number;
  closingBalance: number;
  /** accounts.balance (the running ledger total, never date-filtered) */
  storedBalance: number;
  /** true if closingBalance === storedBalance (reconciliation check) */
  reconciledOk: boolean;
};

export type GLResult = {
  startDate: string;
  endDate: string;
  accounts: GLAccountDetail[];
  includeDrafts: boolean;
};

// ─── Helper: build lines including drafts if requested ───────────────────────

async function getLinesForAccount(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  startDate: string,
  endDate: string,
  includeDrafts: boolean,
): Promise<PostedLine[]> {
  if (!includeDrafts) {
    return getPostedLinesForAccount(ctx, accountId, startDate, endDate);
  }
  // Include posted + draft (status "draft" or "posted")
  const all = await ctx.db
    .query("journalLines")
    .withIndex("by_account_and_date", (q) =>
      q.eq("accountId", accountId).gte("date", startDate).lte("date", endDate),
    )
    .collect();
  return all.filter((l) => l.status === "posted" || l.status === "draft") as PostedLine[];
}

async function getLinesBefore(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  beforeDate: string,
  includeDrafts: boolean,
): Promise<PostedLine[]> {
  if (!includeDrafts) {
    return getPostedLinesForAccountBefore(ctx, accountId, beforeDate);
  }
  const all = await ctx.db
    .query("journalLines")
    .withIndex("by_account_and_date", (q) =>
      q.eq("accountId", accountId).lt("date", beforeDate),
    )
    .collect();
  return all.filter((l) => l.status === "posted" || l.status === "draft") as PostedLine[];
}

// ─── Main query ───────────────────────────────────────────────────────────────

export const getGeneralLedger = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    /** Pass null/undefined to get all accounts */
    accountIds: v.optional(v.array(v.id("accounts"))),
    /** Filter by account type group: "all" | "asset" | "liability" | "equity" | "income" | "expense" */
    accountTypeGroup: v.optional(v.string()),
    /** Include draft entries for troubleshooting (off by default) */
    includeDrafts: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GLResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { startDate, endDate } = args;
    const includeDrafts = args.includeDrafts ?? false;

    const ASSET_TYPES = new Set(["bank", "accounts_receivable", "other_current_asset", "fixed_asset", "other_asset", "asset"]);
    const LIABILITY_TYPES = new Set(["accounts_payable", "credit_card", "other_current_liability", "long_term_liability", "loan", "liability"]);
    const EQUITY_TYPES = new Set(["equity"]);
    const INCOME_TYPES = new Set(["income", "other_income", "revenue"]);
    const EXPENSE_TYPES = new Set(["cost_of_goods_sold", "expense", "other_expense"]);

    const typeGroupFilter = (type: string): boolean => {
      const g = args.accountTypeGroup ?? "all";
      if (g === "all") return true;
      if (g === "asset") return ASSET_TYPES.has(type);
      if (g === "liability") return LIABILITY_TYPES.has(type);
      if (g === "equity") return EQUITY_TYPES.has(type);
      if (g === "income") return INCOME_TYPES.has(type);
      if (g === "expense") return EXPENSE_TYPES.has(type);
      return true;
    };

    // Get relevant accounts
    let accounts: Doc<"accounts">[];
    if (args.accountIds && args.accountIds.length > 0) {
      const fetched = await Promise.all(args.accountIds.map((id) => ctx.db.get(id)));
      accounts = fetched.filter((a): a is Doc<"accounts"> => a !== null);
    } else {
      accounts = await ctx.db.query("accounts").collect();
    }

    accounts = accounts
      .filter((a) => a.isActive && typeGroupFilter(a.type))
      .sort((a, b) => a.code.localeCompare(b.code));

    // Build entry map for enrichment (entry number, sourceType, sourceId, description)
    // We fetch entries lazily per-line to avoid full-table scans
    const entryCache = new Map<string, Doc<"journalEntries">>();
    const getEntry = async (id: Id<"journalEntries">): Promise<Doc<"journalEntries"> | null> => {
      const key = id as string;
      if (entryCache.has(key)) return entryCache.get(key) ?? null;
      const e = await ctx.db.get(id);
      if (e) entryCache.set(key, e);
      return e;
    };

    const result: GLAccountDetail[] = [];

    for (const account of accounts) {
      const openingLines = await getLinesBefore(ctx, account._id, startDate, includeDrafts);
      const openingBalance = round2(netFromLines(openingLines, account.normalSide));

      const periodLines = await getLinesForAccount(ctx, account._id, startDate, endDate, includeDrafts);

      // Sort by date then by creationTime for stable ordering within a day
      periodLines.sort((a, b) => {
        const dateCmp = (a.date ?? "").localeCompare(b.date ?? "");
        if (dateCmp !== 0) return dateCmp;
        return a._creationTime - b._creationTime;
      });

      // Build GL rows with running balance
      let runningBalance = openingBalance;
      const lines: GLLineRow[] = [];

      for (const line of periodLines) {
        const entry = await getEntry(line.journalEntryId);
        const delta = account.normalSide === "debit"
          ? line.debit - line.credit
          : line.credit - line.debit;
        runningBalance = round2(runningBalance + delta);

        lines.push({
          lineId: line._id as string,
          journalEntryId: line.journalEntryId as string,
          entryNumber: entry?.entryNumber ?? "",
          date: line.date ?? "",
          description: line.description ?? entry?.description ?? "",
          sourceType: entry?.sourceType ?? null,
          sourceId: entry?.sourceId ?? null,
          sourceLabel: sourceLabel(entry?.sourceType, entry?.sourceId),
          debit: round2(line.debit),
          credit: round2(line.credit),
          runningBalance,
        });
      }

      const periodTotalDebit = round2(periodLines.reduce((s, l) => s + l.debit, 0));
      const periodTotalCredit = round2(periodLines.reduce((s, l) => s + l.credit, 0));
      const closingBalance = round2(openingBalance + netFromLines(periodLines, account.normalSide));

      // Reconciliation: closingBalance should equal account.balance (the stored running total)
      // Note: account.balance reflects ALL posted lines ever, not just the period.
      // We compare closingBalance to the all-time balance derived from lines (not account.balance)
      // to stay pure. But we also surface account.balance for transparency.
      const reconciledOk = Math.abs(closingBalance - (account.balance ?? 0)) < 0.01;

      // When the caller explicitly selected accounts, always include them even with
      // no activity (zero opening balance + zero lines) — dropping them silently
      // looks broken. When no explicit selection, drop zero-activity accounts to
      // keep the "all accounts" view compact.
      const explicitSelection = args.accountIds && args.accountIds.length > 0;
      if (!explicitSelection && lines.length === 0 && openingBalance === 0) continue;

      result.push({
        accountId: account._id as string,
        code: account.code,
        name: account.name,
        type: account.type,
        normalSide: account.normalSide,
        openingBalance,
        lines,
        periodTotalDebit,
        periodTotalCredit,
        closingBalance,
        storedBalance: account.balance ?? 0,
        reconciledOk,
      });
    }

    return { startDate, endDate, accounts: result, includeDrafts };
  },
});
