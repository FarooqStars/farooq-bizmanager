/**
 * Report 9 — Day Book
 *
 * All posted journal entries and their lines for a date range, grouped by
 * source type (Sales & Invoices, Customer Receipts, Purchases & Bills,
 * Vendor Payments, Banking, Manual Journal Entries).
 *
 * Rules:
 *  - Drafts and voided entries are excluded.
 *  - Figures come only from journalLines (posted, by date index).
 *  - Cash = all bank/cash accounts (type === "bank").
 *  - Document reference links back to the source document.
 *  - Returns summary strip: cashIn, cashOut, netCash, documentCount.
 *  - Returns total debits and credits for the range (must be equal).
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  INVOICE_SALE_SOURCE,
  INVOICE_COGS_SOURCE,
  SALE_SOURCE,
  SALE_COGS_SOURCE,
  SALE_ADJUSTMENT_SOURCE,
  CREDIT_MEMO_SOURCE,
  RETURN_RESTOCK_SOURCE,
  PAYMENT_SOURCE,
  CUSTOMER_ADVANCE_SOURCE,
  ADVANCE_SETTLEMENT_SOURCE,
  CUSTOMER_DEPOSIT_SOURCE,
  DEPOSIT_APPLICATION_SOURCE,
  RETURN_REFUND_SOURCE,
  ADVANCE_REFUND_SOURCE,
  CUSTOMER_DEPOSIT_REFUND_SOURCE,
  BILL_SOURCE,
  GOODS_RECEIPT_SOURCE,
  BILL_PAYMENT_SOURCE,
  VENDOR_ADVANCE_SOURCE,
  BANK_CHECK_SOURCE,
  BANK_EXPENSE_SOURCE,
  PETTY_CASH_EXPENSE_SOURCE,
  BANK_PAYMENT_SOURCE,
  PETTY_CASH_REPLENISH_SOURCE,
  BANK_TRANSFER_SOURCE,
  BANK_ADJUSTMENT_SOURCE,
  BANK_IMPORT_SOURCE,
  PAYROLL_ACCRUAL_SOURCE,
  PAYROLL_EMPLOYER_SI_SOURCE,
  PAYROLL_PAYMENT_SOURCE,
  GRATUITY_ACCRUAL_SOURCE,
  GRATUITY_PAYMENT_SOURCE,
  FUEL_LOG_SOURCE,
  MAINTENANCE_LOG_SOURCE,
  DEPRECIATION_SOURCE,
  VEHICLE_PURCHASE_SOURCE,
  ASSET_PURCHASE_SOURCE,
  ASSET_DISPOSAL_SOURCE,
  BAD_DEBT_WRITE_OFF_SOURCE,
  BAD_DEBT_RECOVERY_SOURCE,
} from "../lib/sourceTypes.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DayBookRow = {
  journalEntryId: string;
  entryNumber: string;
  time: string;       // ISO string of _creationTime
  date: string;
  reference?: string;
  party?: string;     // customer or vendor name
  description: string;
  debit: number;
  credit: number;
  sourceType: string;
  sourceId?: string;
};

export type DayBookGroup = {
  label: string;
  sourceTypes: string[];
  rows: DayBookRow[];
  subtotalDebit: number;
  subtotalCredit: number;
};

export type DayBookDaySummary = {
  date: string;
  totalDebit: number;
  totalCredit: number;
};

export type DayBookSummaryStrip = {
  cashIn: number;
  cashOut: number;
  netCash: number;
  documentCount: number;
};

export type DayBookResult = {
  startDate: string;
  endDate: string;
  groups: DayBookGroup[];
  totalDebit: number;
  totalCredit: number;
  inBalance: boolean;
  daySummaries: DayBookDaySummary[];     // per-day totals when range > 1 day
  summary: DayBookSummaryStrip;
};

// ─── Group definitions ────────────────────────────────────────────────────────
//
// Groups are ordered; the index here is the groupIndex used in SOURCE_TYPE_TO_GROUP.
// "Manual Journal Entries" is always appended last as the fallback (index -1).

export const GROUP_DEFS: Array<{ label: string }> = [
  { label: "Sales & Invoices" },       // 0
  { label: "Customer Receipts" },      // 1
  { label: "Purchases & Bills" },      // 2
  { label: "Vendor Payments" },        // 3
  { label: "Banking" },               // 4
  { label: "Payroll" },               // 5
  { label: "Fleet & Assets" },         // 6
];

/** Label used for entries that fall through to the Manual bucket. */
export const MANUAL_GROUP_LABEL = "Manual Journal Entries";

// ─── Classifier ───────────────────────────────────────────────────────────────
//
// Exact lookup only — no prefix matching. Every value here is an imported
// constant from lib/sourceTypes.ts; no string literals.
//
// _reversal variants are NOT entries in this map. lib/ledger.ts:239 stamps
// `${sourceType}_reversal` at runtime for every reversal entry. Those strings
// DO appear in the database. classifyEntry() strips the suffix so they resolve
// to the same group as their base type. Do not remove the stripping logic on
// the grounds that "_reversal" strings are "not in the map" — they are in the
// data, just not in this map.
//
// YEAR_END_CLOSE_SOURCE and OPENING_BALANCES_SOURCE are intentionally absent.
// They fall through to groupIndex === -1 (Manual Journal Entries). See
// MANUAL_SOURCE_TYPES in lib/sourceTypes.ts.

const SOURCE_TYPE_TO_GROUP = new Map<string, number>([
  // 0 — Sales & Invoices
  [INVOICE_SALE_SOURCE,  0],
  [INVOICE_COGS_SOURCE,  0],
  [SALE_SOURCE,          0],
  [SALE_COGS_SOURCE,     0],
  [SALE_ADJUSTMENT_SOURCE, 0],
  [CREDIT_MEMO_SOURCE,   0],
  [RETURN_RESTOCK_SOURCE, 0],
  // Bad debt is a receivables adjustment, not a credit note.
  // Classified with Sales & Invoices so it appears alongside the original AR entry.
  [BAD_DEBT_WRITE_OFF_SOURCE, 0],
  [BAD_DEBT_RECOVERY_SOURCE,  0],

  // 1 — Customer Receipts
  [PAYMENT_SOURCE,                  1],
  [CUSTOMER_ADVANCE_SOURCE,         1],
  [ADVANCE_SETTLEMENT_SOURCE,       1],
  [CUSTOMER_DEPOSIT_SOURCE,         1],
  [DEPOSIT_APPLICATION_SOURCE,      1],
  [RETURN_REFUND_SOURCE,            1],
  [ADVANCE_REFUND_SOURCE,           1],
  [CUSTOMER_DEPOSIT_REFUND_SOURCE,  1],

  // 2 — Purchases & Bills
  [BILL_SOURCE,           2],
  [GOODS_RECEIPT_SOURCE,  2],

  // 3 — Vendor Payments
  [BILL_PAYMENT_SOURCE,   3],
  [VENDOR_ADVANCE_SOURCE, 3],

  // 4 — Banking
  [BANK_CHECK_SOURCE,          4],
  [BANK_EXPENSE_SOURCE,        4],
  [PETTY_CASH_EXPENSE_SOURCE,  4],
  [BANK_PAYMENT_SOURCE,        4],
  [PETTY_CASH_REPLENISH_SOURCE, 4],
  [BANK_TRANSFER_SOURCE,       4],
  [BANK_ADJUSTMENT_SOURCE,     4],
  [BANK_IMPORT_SOURCE,         4],

  // 5 — Payroll
  [PAYROLL_ACCRUAL_SOURCE,     5],
  [PAYROLL_EMPLOYER_SI_SOURCE, 5],
  [PAYROLL_PAYMENT_SOURCE,     5],
  [GRATUITY_ACCRUAL_SOURCE,    5],
  [GRATUITY_PAYMENT_SOURCE,    5],

  // 6 — Fleet & Assets
  [FUEL_LOG_SOURCE,          6],
  [MAINTENANCE_LOG_SOURCE,   6],
  [DEPRECIATION_SOURCE,      6],
  [VEHICLE_PURCHASE_SOURCE,  6],
  [ASSET_PURCHASE_SOURCE,    6],
  [ASSET_DISPOSAL_SOURCE,    6],
]);

/**
 * Returns the GROUP_DEFS index for a sourceType, or -1 for Manual Journal
 * Entries (fallback for unknown / deliberately unmapped types).
 *
 * _reversal variants are stripped before lookup. They occur in the database
 * (lib/ledger.ts:239) and classify identically to their base type.
 */
export function classifyEntry(sourceType: string | undefined): number {
  if (!sourceType) return -1;
  const base = sourceType.endsWith("_reversal")
    ? sourceType.slice(0, -"_reversal".length)
    : sourceType;
  return SOURCE_TYPE_TO_GROUP.get(base) ?? -1;
}

/**
 * Returns the group label for a sourceType.
 * Exported for use in tests — tests import this rather than duplicating the map.
 */
export function classifyEntryLabel(sourceType: string | undefined): string {
  const idx = classifyEntry(sourceType);
  return idx === -1 ? MANUAL_GROUP_LABEL : GROUP_DEFS[idx].label;
}

/**
 * Build the sourceTypes array for each group from the map.
 * Used to populate DayBookGroup.sourceTypes so the response shape is unchanged.
 */
function buildGroupSourceTypeLists(): string[][] {
  const lists: string[][] = GROUP_DEFS.map(() => []);
  for (const [st, idx] of SOURCE_TYPE_TO_GROUP) {
    lists[idx].push(st);
  }
  return lists;
}

const GROUP_SOURCE_TYPE_LISTS = buildGroupSourceTypeLists();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Build a map of customerId / vendorId → name for party labels.
 * We fetch both tables once and merge.
 */
async function buildPartyMap(
  ctx: QueryCtx,
): Promise<Map<string, string>> {
  const [customers, vendors] = await Promise.all([
    ctx.db.query("customers").collect(),
    ctx.db.query("vendors").collect(),
  ]);
  const map = new Map<string, string>();
  for (const c of customers) map.set(c._id as string, c.companyName ?? c.name);
  for (const v of vendors) map.set(v._id as string, v.companyName ?? v.name);
  return map;
}

/**
 * Given a sourceType and sourceId, resolve the party name and document
 * reference. Only source types that actually set sourceId are handled here.
 *
 * Banking source types (bank_check, bank_expense, bank_payment, bank_transfer,
 * petty_cash_expense, petty_cash_replenish) do NOT set sourceId — the posting
 * call sets `reference` on the journal entry itself instead. No lookup branch
 * exists for those types; the caller uses entry.reference directly.
 */
async function resolveSourceDoc(
  ctx: QueryCtx,
  sourceType: string | undefined,
  sourceId: string | undefined,
  partyMap: Map<string, string>,
): Promise<{ party?: string; reference?: string }> {
  if (!sourceType || !sourceId) return {};

  // Strip reversal suffix so lookup matches the base type's branch.
  const base = sourceType.endsWith("_reversal")
    ? sourceType.slice(0, -"_reversal".length)
    : sourceType;

  try {
    // ── Sales & Invoices ────────────────────────────────────────────────────
    if (base === INVOICE_SALE_SOURCE || base === INVOICE_COGS_SOURCE) {
      const inv = await ctx.db.get(sourceId as Id<"invoices">);
      if (inv) return {
        party: partyMap.get(inv.customerId as string),
        reference: inv.invoiceNumber,
      };
    }

    if (base === SALE_SOURCE || base === SALE_COGS_SOURCE || base === SALE_ADJUSTMENT_SOURCE) {
      const sale = await ctx.db.get(sourceId as Id<"sales">);
      if (sale) return {
        party: partyMap.get((sale.customerId ?? sale.customerName ?? "") as string),
      };
    }

    if (base === CREDIT_MEMO_SOURCE) {
      // credit_memo sourceId points at the invoice the memo was issued against
      const inv = await ctx.db.get(sourceId as Id<"invoices">);
      if (inv) return {
        party: partyMap.get(inv.customerId as string),
        reference: inv.invoiceNumber,
      };
    }

    if (base === RETURN_RESTOCK_SOURCE || base === RETURN_REFUND_SOURCE) {
      // returns sourceId points at the return record; returns table has customerId
      const ret = await ctx.db.get(sourceId as Id<"returns">);
      if (ret) return {
        party: partyMap.get((ret as Doc<"returns"> & { customerId?: string }).customerId ?? ""),
        reference: (ret as Doc<"returns"> & { returnNumber?: string }).returnNumber,
      };
    }

    // ── Customer Receipts ───────────────────────────────────────────────────
    if (base === PAYMENT_SOURCE) {
      const pmt = await ctx.db.get(sourceId as Id<"payments">);
      if (pmt?.invoiceId) {
        const inv = await ctx.db.get(pmt.invoiceId);
        if (inv) return { party: partyMap.get(inv.customerId as string), reference: pmt.reference };
      }
      return { reference: pmt?.reference };
    }

    if (base === CUSTOMER_ADVANCE_SOURCE || base === ADVANCE_SETTLEMENT_SOURCE
        || base === ADVANCE_REFUND_SOURCE) {
      const adv = await ctx.db.get(sourceId as Id<"advancePayments">);
      if (adv) return {
        party: adv.customerId
          ? partyMap.get(adv.customerId as string)
          : adv.vendorId ? partyMap.get(adv.vendorId as string) : undefined,
        reference: (adv as Doc<"advancePayments"> & { referenceNumber?: string }).referenceNumber,
      };
    }

    if (base === CUSTOMER_DEPOSIT_SOURCE || base === DEPOSIT_APPLICATION_SOURCE
        || base === CUSTOMER_DEPOSIT_REFUND_SOURCE) {
      const dep = await ctx.db.get(sourceId as Id<"customerDeposits">);
      if (dep) return {
        party: partyMap.get(dep.customerId as string),
        reference: dep.depositNumber,
      };
    }

    // ── Purchases & Bills ───────────────────────────────────────────────────
    if (base === BILL_SOURCE) {
      const bill = await ctx.db.get(sourceId as Id<"bills">);
      if (bill) return {
        party: partyMap.get(bill.vendorId as string),
        reference: bill.title,
      };
    }

    if (base === GOODS_RECEIPT_SOURCE) {
      const gr = await ctx.db.get(sourceId as Id<"goodsReceipts">);
      if (gr) return {
        party: partyMap.get(gr.vendorId as string),
        reference: gr.referenceNumber,
      };
    }

    // ── Vendor Payments ─────────────────────────────────────────────────────
    if (base === BILL_PAYMENT_SOURCE) {
      const bp = await ctx.db.get(sourceId as Id<"billPayments">);
      if (bp) return {
        party: partyMap.get(bp.vendorId as string),
        reference: bp.referenceNumber,
      };
    }

    if (base === VENDOR_ADVANCE_SOURCE) {
      const adv = await ctx.db.get(sourceId as Id<"advancePayments">);
      if (adv?.vendorId) return {
        party: partyMap.get(adv.vendorId as string),
        reference: (adv as Doc<"advancePayments"> & { referenceNumber?: string }).referenceNumber,
      };
    }

  } catch {
    // sourceId may refer to a deleted document — silently skip
  }
  return {};
}

// ─── Query ────────────────────────────────────────────────────────────────────

export const getDayBook = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args): Promise<DayBookResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { startDate, endDate } = args;

    // Fetch all posted entries in the date range
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_date", (q) => q.gte("date", startDate).lte("date", endDate))
      .collect();

    const postedEntries = entries.filter((e) => e.status === "posted");

    const emptyGroups: DayBookGroup[] = GROUP_DEFS.map((g, i) => ({
      label: g.label,
      sourceTypes: GROUP_SOURCE_TYPE_LISTS[i],
      rows: [],
      subtotalDebit: 0,
      subtotalCredit: 0,
    })).concat([{
      label: "Manual Journal Entries",
      sourceTypes: [],
      rows: [],
      subtotalDebit: 0,
      subtotalCredit: 0,
    }]);

    if (postedEntries.length === 0) {
      return {
        startDate,
        endDate,
        groups: emptyGroups,
        totalDebit: 0,
        totalCredit: 0,
        inBalance: true,
        daySummaries: [],
        summary: { cashIn: 0, cashOut: 0, netCash: 0, documentCount: 0 },
      };
    }

    // Load party map and bank accounts for cash classification
    const [partyMap, bankAccounts] = await Promise.all([
      buildPartyMap(ctx),
      ctx.db.query("accounts")
        .withIndex("by_type", (q) => q.eq("type", "bank"))
        .collect(),
    ]);
    const bankAccountIds = new Set(bankAccounts.map((a) => a._id as string));

    // Build entry map for quick lookup
    const entryMap = new Map<string, Doc<"journalEntries">>();
    for (const e of postedEntries) entryMap.set(e._id as string, e);

    // Fetch all lines for these entries
    const entryIds = new Set(postedEntries.map((e) => e._id as string));
    const allLines = await ctx.db
      .query("journalLines")
      .withIndex("by_status_and_date", (q) =>
        q.eq("status", "posted").gte("date", startDate).lte("date", endDate)
      )
      .collect();

    // Only lines belonging to our posted entries
    const lines = allLines.filter((l) => entryIds.has(l.journalEntryId as string));

    // Aggregate lines by entry: total debits and credits per entry
    const entryLineMap = new Map<string, { totalDebit: number; totalCredit: number }>();
    const cashByEntry = new Map<string, { cashIn: number; cashOut: number }>();

    for (const line of lines) {
      const eid = line.journalEntryId as string;
      const acc = entryLineMap.get(eid) ?? { totalDebit: 0, totalCredit: 0 };
      acc.totalDebit = round2(acc.totalDebit + (line.debit ?? 0));
      acc.totalCredit = round2(acc.totalCredit + (line.credit ?? 0));
      entryLineMap.set(eid, acc);

      // Track cash movements (bank accounts)
      if (bankAccountIds.has(line.accountId as string)) {
        const c = cashByEntry.get(eid) ?? { cashIn: 0, cashOut: 0 };
        c.cashIn = round2(c.cashIn + (line.debit ?? 0));   // debit to bank = cash in
        c.cashOut = round2(c.cashOut + (line.credit ?? 0)); // credit to bank = cash out
        cashByEntry.set(eid, c);
      }
    }

    // Build rows from posted entries
    const rawRows: Array<DayBookRow & { groupIndex: number }> = [];

    for (const entry of postedEntries) {
      const eid = entry._id as string;
      const lineTotals = entryLineMap.get(eid) ?? { totalDebit: 0, totalCredit: 0 };
      const { party, reference } = await resolveSourceDoc(ctx, entry.sourceType, entry.sourceId, partyMap);

      const row: DayBookRow & { groupIndex: number } = {
        journalEntryId: eid,
        entryNumber: entry.entryNumber,
        time: entry.postedAt ?? entry._creationTime.toString(),
        date: entry.date,
        reference: reference ?? entry.reference,
        party,
        description: entry.description,
        debit: lineTotals.totalDebit,
        credit: lineTotals.totalCredit,
        sourceType: entry.sourceType ?? "manual",
        sourceId: entry.sourceId,
        groupIndex: classifyEntry(entry.sourceType),
      };
      rawRows.push(row);
    }

    // Sort by date then entryNumber
    rawRows.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.entryNumber.localeCompare(b.entryNumber);
    });

    // Distribute rows into groups
    const groups: DayBookGroup[] = GROUP_DEFS.map((g, i) => ({
      label: g.label,
      sourceTypes: GROUP_SOURCE_TYPE_LISTS[i],
      rows: [],
      subtotalDebit: 0,
      subtotalCredit: 0,
    }));
    groups.push({
      label: "Manual Journal Entries",
      sourceTypes: [],
      rows: [],
      subtotalDebit: 0,
      subtotalCredit: 0,
    });
    const manualIndex = groups.length - 1;

    for (const row of rawRows) {
      const { groupIndex, ...cleanRow } = row;
      const idx = groupIndex === -1 ? manualIndex : groupIndex;
      groups[idx].rows.push(cleanRow);
    }

    // Compute subtotals
    for (const g of groups) {
      g.subtotalDebit = round2(g.rows.reduce((s, r) => s + r.debit, 0));
      g.subtotalCredit = round2(g.rows.reduce((s, r) => s + r.credit, 0));
    }

    // Overall totals
    const totalDebit = round2(groups.reduce((s, g) => s + g.subtotalDebit, 0));
    const totalCredit = round2(groups.reduce((s, g) => s + g.subtotalCredit, 0));

    // Per-day summaries (only when range > 1 day)
    const daySummaries: DayBookDaySummary[] = [];
    if (startDate !== endDate) {
      const dayMap = new Map<string, { debit: number; credit: number }>();
      for (const row of rawRows) {
        const d = dayMap.get(row.date) ?? { debit: 0, credit: 0 };
        d.debit = round2(d.debit + row.debit);
        d.credit = round2(d.credit + row.credit);
        dayMap.set(row.date, d);
      }
      for (const [date, totals] of [...dayMap].sort(([a], [b]) => a.localeCompare(b))) {
        daySummaries.push({ date, totalDebit: totals.debit, totalCredit: totals.credit });
      }
    }

    // Summary strip: cash
    let cashIn = 0;
    let cashOut = 0;
    for (const [, c] of cashByEntry) {
      cashIn = round2(cashIn + c.cashIn);
      cashOut = round2(cashOut + c.cashOut);
    }

    return {
      startDate,
      endDate,
      groups,
      totalDebit,
      totalCredit,
      inBalance: Math.abs(totalDebit - totalCredit) < 0.01,
      daySummaries,
      summary: {
        cashIn,
        cashOut,
        netCash: round2(cashIn - cashOut),
        documentCount: postedEntries.length,
      },
    };
  },
});
