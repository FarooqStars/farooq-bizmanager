// ─────────────────────────────────────────────────────────────────────────────
// Ledger posting engine.
//
// This module is the ONE place that ever writes `accounts.balance`. Every money
// movement in the app must post a balanced double-entry journal here so the
// books always reconcile:
//   - `applyBalanceDelta` is the ONLY function that patches `accounts.balance`.
//   - `postBalancedEntry` inserts a posted journal entry + lines and applies the
//     balance deltas. It rejects anything where debits != credits.
//   - `reverseEntriesForSource` posts mirror entries when a source document is
//     deleted or voided (never a silent balance delete).
//   - `getControlAccounts` find-or-creates the standard control accounts.
//
// Do NOT patch `accounts.balance` anywhere else in the codebase.
// ─────────────────────────────────────────────────────────────────────────────
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import { nextNumber } from "./docNumber.ts";

// ─── Money rounding ──────────────────────────────────────────────────────────

/** Round to whole cents. All ledger math funnels through this. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Account type classification & normal sides ─────────────────────────────

export type AccountType =
  | "bank"
  | "accounts_receivable"
  | "other_current_asset"
  | "fixed_asset"
  | "other_asset"
  | "asset"
  | "accounts_payable"
  | "credit_card"
  | "other_current_liability"
  | "long_term_liability"
  | "loan"
  | "liability"
  | "equity"
  | "income"
  | "other_income"
  | "cost_of_goods_sold"
  | "expense"
  | "other_expense"
  | "revenue";

/** Default normal balance side for each account type. */
export const NORMAL_SIDES: Record<string, "debit" | "credit"> = {
  // Asset types (debit-normal)
  bank: "debit",
  accounts_receivable: "debit",
  other_current_asset: "debit",
  fixed_asset: "debit",
  other_asset: "debit",
  asset: "debit", // legacy
  // Liability types (credit-normal)
  accounts_payable: "credit",
  credit_card: "credit",
  other_current_liability: "credit",
  long_term_liability: "credit",
  loan: "credit",
  liability: "credit", // legacy
  // Equity (credit-normal)
  equity: "credit",
  // Income / Revenue (credit-normal)
  income: "credit",
  other_income: "credit",
  revenue: "credit", // legacy
  // Expense / COGS (debit-normal)
  cost_of_goods_sold: "debit",
  expense: "debit",
  other_expense: "debit",
};

export const ASSET_TYPES = [
  "bank",
  "accounts_receivable",
  "other_current_asset",
  "fixed_asset",
  "other_asset",
  "asset",
];
export const LIABILITY_TYPES = [
  "accounts_payable",
  "credit_card",
  "other_current_liability",
  "long_term_liability",
  "loan",
  "liability",
];
export const EQUITY_TYPES = ["equity"];
export const INCOME_TYPES = ["income", "other_income", "revenue"];
export const EXPENSE_TYPES = ["cost_of_goods_sold", "expense", "other_expense"];

// ─── The single balance writer ───────────────────────────────────────────────

/**
 * Apply a debit/credit to an account's stored balance. This is the ONLY
 * function permitted to write `accounts.balance`. It respects the account's
 * normal side: debit-normal accounts increase on debit, credit-normal accounts
 * increase on credit.
 */
export async function applyBalanceDelta(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  debit: number,
  credit: number,
): Promise<void> {
  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new ConvexError({ message: "Ledger account not found", code: "NOT_FOUND" });
  }
  const delta =
    account.normalSide === "debit" ? debit - credit : credit - debit;
  await ctx.db.patch(accountId, {
    balance: round2((account.balance ?? 0) + delta),
  });
}

// ─── Balanced journal posting ─────────────────────────────────────────────────

export type LedgerLine = {
  accountId: Id<"accounts">;
  debit?: number;
  credit?: number;
  description?: string;
};

export type PostEntryArgs = {
  date: string;
  description: string;
  reference?: string;
  notes?: string;
  createdBy: Id<"users">;
  /** Source document kind, e.g. "invoice", "payment", "bill_payment". */
  sourceType?: string;
  /** Source document id (stringified) for later reversal lookups. */
  sourceId?: string;
  lines: LedgerLine[];
};

/**
 * Insert a balanced, posted journal entry and apply every line's balance delta
 * atomically (mutations are transactional). Rejects unless total debits equal
 * total credits and the entry is non-zero.
 */
export async function postBalancedEntry(
  ctx: MutationCtx,
  args: PostEntryArgs,
): Promise<Id<"journalEntries">> {
  // Normalize + round every line to cents.
  const lines = args.lines
    .map((l) => ({
      accountId: l.accountId,
      debit: round2(l.debit ?? 0),
      credit: round2(l.credit ?? 0),
      description: l.description,
    }))
    // Drop empty lines (both sides zero) to keep the entry clean.
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new ConvexError({
      message: `Unbalanced journal entry: debits (${totalDebit}) must equal credits (${totalCredit})`,
      code: "BAD_REQUEST",
    });
  }
  if (totalDebit <= 0) {
    throw new ConvexError({
      message: "Journal entry must move a positive amount",
      code: "BAD_REQUEST",
    });
  }

  const allEntries = await ctx.db.query("journalEntries").collect();
  const entryNumber = nextNumber(allEntries, (e) => e.entryNumber, "JE-", 5);

  const entryId = await ctx.db.insert("journalEntries", {
    entryNumber,
    date: args.date,
    description: args.description,
    reference: args.reference,
    status: "posted",
    totalDebit,
    totalCredit,
    createdBy: args.createdBy,
    postedAt: new Date().toISOString(),
    notes: args.notes,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
  });

  for (const line of lines) {
    // RULE: every insert("journalLines", ...) MUST stamp both `date` and `status`.
    // Omitting either field makes the line invisible to the by_status_and_date and
    // by_account_and_date indexes, which silently excludes it from every financial report.
    await ctx.db.insert("journalLines", {
      journalEntryId: entryId,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
      date: args.date,
      status: "posted",
    });
    await applyBalanceDelta(ctx, line.accountId, line.debit, line.credit);
  }

  return entryId;
}

// ─── Reversing entries (for deletes / voids) ─────────────────────────────────

/**
 * Post reversing (mirror) journal entries for every posted entry that was
 * created for a given source document. Never deletes balances silently — it
 * swaps each line's debit/credit and re-posts so the audit trail is preserved.
 * Returns the number of source entries reversed.
 */
export async function reverseEntriesForSource(
  ctx: MutationCtx,
  sourceType: string,
  sourceId: string,
  opts: { date?: string; createdBy?: Id<"users">; description?: string } = {},
): Promise<number> {
  const posted = await ctx.db
    .query("journalEntries")
    .withIndex("by_status", (q) => q.eq("status", "posted"))
    .collect();

  // Only reverse original source entries, never a previous reversal.
  const reversalType = `${sourceType}_reversal`;
  const matches = posted.filter(
    (e) => e.sourceType === sourceType && e.sourceId === sourceId,
  );

  let count = 0;
  for (const entry of matches) {
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
      .collect();
    if (lines.length === 0) continue;

    await postBalancedEntry(ctx, {
      date: opts.date ?? entry.date,
      description: opts.description ?? `Reversal of ${entry.entryNumber}`,
      reference: entry.reference,
      createdBy: opts.createdBy ?? entry.createdBy,
      sourceType: reversalType,
      sourceId,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        // swap sides to reverse the original posting
        debit: l.credit,
        credit: l.debit,
        description: l.description,
      })),
    });
    count++;
  }

  return count;
}

// ─── Control accounts (find or create) ───────────────────────────────────────

type AccountSpec = {
  type: AccountType;
  code: string;
  name: string;
  subType?: string;
  /** Preferred subType to match an existing account on. */
  matchSubType?: string;
  /** Fallback: match any active account of this type (single-account types). */
  matchAnyOfType?: boolean;
  /** Explicit normal side (contra accounts differ from their type default). */
  normalSide?: "debit" | "credit";
};

async function freeCode(ctx: MutationCtx, preferred: string): Promise<string> {
  const all = await ctx.db.query("accounts").collect();
  const codes = new Set(all.map((a) => a.code));
  if (!codes.has(preferred)) return preferred;
  let n = parseInt(preferred, 10);
  if (Number.isNaN(n)) n = 9000;
  while (codes.has(String(n))) n++;
  return String(n);
}

/**
 * Follow the replacedBy chain to return the canonical (non-replaced, active) account.
 * Guards against circular references with a depth limit.
 */
async function resolveAccount(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  depth = 0,
): Promise<Doc<"accounts">> {
  if (depth > 10) return account; // safety: break any accidental cycle
  if (!account.replacedBy) return account;
  const next = await ctx.db.get(account.replacedBy);
  if (!next) return account;
  return resolveAccount(ctx, next, depth + 1);
}

/**
 * Find an existing account matching a control-account spec WITHOUT creating it.
 * Matching prefers an exact subType, then a subType substring, then an exact
 * name, then (optionally) any active account of the type. Returns undefined when
 * nothing matches. This is the read-only half of `findOrCreateAccount`, exposed
 * so read-only callers (e.g. dry-run reconciliation) can locate control
 * accounts without mutating the database.
 */
export async function findAccount(
  ctx: MutationCtx,
  spec: AccountSpec,
): Promise<Doc<"accounts"> | undefined> {
  // First try to find by exact code — this ensures user-renamed codes are respected
  if (spec.code) {
    const byCode = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", spec.code))
      .first();
    if (byCode?.isActive) {
      // Follow replacedBy chain to get the canonical account
      return await resolveAccount(ctx, byCode);
    }
  }

  const ofType = await ctx.db
    .query("accounts")
    .withIndex("by_type", (q) => q.eq("type", spec.type))
    .collect();
  // Only consider accounts that haven't been merged into another
  const active = ofType.filter((a) => a.isActive && !a.replacedBy);

  let match: Doc<"accounts"> | undefined;
  const matchSub = (spec.matchSubType ?? spec.subType)?.toLowerCase();
  if (matchSub) {
    match = active.find((a) => a.subType?.toLowerCase() === matchSub);
    if (!match) match = active.find((a) => a.subType?.toLowerCase().includes(matchSub));
  }
  if (!match) {
    match = active.find((a) => a.name.toLowerCase() === spec.name.toLowerCase());
  }
  if (!match && spec.matchAnyOfType) {
    match = active[0];
  }
  return match;
}

/**
 * Find an existing control account or create it if missing. Matching prefers an
 * exact subType, then a name substring, then (optionally) any active account of
 * the type.
 */
export async function findOrCreateAccount(
  ctx: MutationCtx,
  spec: AccountSpec,
): Promise<Doc<"accounts">> {
  const match = await findAccount(ctx, spec);
  if (match) return match;

  const code = await freeCode(ctx, spec.code);
  const id = await ctx.db.insert("accounts", {
    code,
    name: spec.name,
    type: spec.type,
    subType: spec.subType,
    isActive: true,
    balance: 0,
    normalSide: spec.normalSide ?? NORMAL_SIDES[spec.type] ?? "debit",
  });
  const created = await ctx.db.get(id);
  if (!created) {
    throw new ConvexError({ message: "Failed to create control account", code: "BAD_REQUEST" });
  }
  return created;
}

export type ControlAccounts = {
  ar: Doc<"accounts">;
  ap: Doc<"accounts">;
  inventory: Doc<"accounts">;
  cogs: Doc<"accounts">;
  revenue: Doc<"accounts">;
  salesReturns: Doc<"accounts">;
  customerDeposits: Doc<"accounts">;
  vendorPrepaid: Doc<"accounts">;
  vatPayable: Doc<"accounts">;
  retainedEarnings: Doc<"accounts">;
  openingBalanceEquity: Doc<"accounts">;
  badDebtExpense: Doc<"accounts">;
};

/**
 * Find-or-create the standard control accounts required by the ledger. Safe to
 * call from any money mutation; existing accounts are reused.
 */
export async function getControlAccounts(ctx: MutationCtx): Promise<ControlAccounts> {
  const ar = await findOrCreateAccount(ctx, {
    type: "accounts_receivable",
    code: "1100",
    name: "Accounts Receivable",
    subType: "Trade Receivables",
    matchAnyOfType: true,
  });
  const ap = await findOrCreateAccount(ctx, {
    type: "accounts_payable",
    code: "2000",
    name: "Accounts Payable",
    subType: "Trade Payables",
    matchAnyOfType: true,
  });
  const inventory = await findOrCreateAccount(ctx, {
    type: "other_current_asset",
    code: "1200",
    name: "Inventory",
    subType: "Inventory",
    matchSubType: "Inventory",
  });
  const cogs = await findOrCreateAccount(ctx, {
    type: "cost_of_goods_sold",
    code: "5000",
    name: "Cost of Goods Sold",
    subType: "Materials",
    matchAnyOfType: true,
  });
  const revenue = await findOrCreateAccount(ctx, {
    type: "income",
    code: "4000",
    name: "Sales Revenue",
    subType: "Sales",
    matchSubType: "Sales",
  });
  const salesReturns = await findOrCreateAccount(ctx, {
    type: "income",
    code: "4900",
    name: "Sales Returns & Allowances",
    subType: "Contra Revenue",
    matchSubType: "Contra",
    normalSide: "debit", // contra-revenue is debit-normal
  });
  const customerDeposits = await findOrCreateAccount(ctx, {
    type: "other_current_liability",
    code: "2400",
    name: "Customer Deposits",
    subType: "Customer Deposits",
    matchSubType: "Customer Deposits",
  });
  const vendorPrepaid = await findOrCreateAccount(ctx, {
    type: "other_current_asset",
    code: "1350",
    name: "Vendor Prepayments",
    subType: "Vendor Prepaid",
    matchSubType: "Vendor Prepaid",
  });
  const vatPayable = await findOrCreateAccount(ctx, {
    type: "other_current_liability",
    code: "2310",
    name: "VAT Payable",
    subType: "VAT",
    matchSubType: "VAT",
  });
  const retainedEarnings = await findOrCreateAccount(ctx, {
    type: "equity",
    code: "3100",
    name: "Retained Earnings",
    subType: "Retained Earnings",
    matchSubType: "Retained Earnings",
  });
  const openingBalanceEquity = await findOrCreateAccount(ctx, {
    type: "equity",
    code: "3900",
    name: "Opening Balance Equity",
    subType: "Opening Balance Equity",
    matchSubType: "Opening Balance",
  });
  // Bad Debt Expense: Dr when writing off an uncollectable receivable.
  // This is an operating expense, NOT a contra-revenue account.
  // Do not merge with Sales Returns & Allowances — writing off a receivable
  // is fundamentally different from reversing a sale.
  const badDebtExpense = await findOrCreateAccount(ctx, {
    type: "expense",
    code: "6300",
    name: "Bad Debt Expense",
    subType: "Bad Debt",
    matchSubType: "Bad Debt",
  });

  return {
    ar,
    ap,
    inventory,
    cogs,
    revenue,
    salesReturns,
    customerDeposits,
    vendorPrepaid,
    vatPayable,
    retainedEarnings,
    openingBalanceEquity,
    badDebtExpense,
  };
}
