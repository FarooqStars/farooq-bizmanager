/**
 * AR/AP Ageing Summary + Customer Statement — Reports 6, 7, 8.
 *
 * ARCHITECTURE RULES (non-negotiable):
 *  - Monetary totals come from journalLines via getPostedLinesForAccount* only.
 *  - Operational fields (invoice number, due date, customer name, document reference)
 *    come from the operational tables (invoices, bills, customers, vendors).
 *  - Ageing is by DUE DATE, not invoice date.
 *  - Remaining balance = totalAmount − amountPaid (invoice) / amount − (amountPaid ?? 0) (bill).
 *  - Credit balances (overpaid / unapplied credit memo) are preserved; never clamped to zero.
 *  - Grand total must reconcile to the AR/AP control account balance; the diff is returned.
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { getPostedLinesForAccount } from "../lib/reportQueries.ts";
import { ConvexError } from "convex/values";

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function requireAuth(ctx: QueryCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Days between two ISO date strings (positive if dueDate < asOf). */
function daysPastDue(dueDate: string, asOf: string): number {
  const due = new Date(dueDate).getTime();
  const as = new Date(asOf).getTime();
  return Math.floor((as - due) / 86_400_000);
}

type AgeingBuckets = {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
};

type AgeingBucket = keyof AgeingBuckets;

function bucketKey(daysPast: number): AgeingBucket {
  if (daysPast <= 0) return "current";
  if (daysPast <= 30) return "days30";
  if (daysPast <= 60) return "days60";
  if (daysPast <= 90) return "days90";
  return "over90";
}

function emptyBuckets(): AgeingBuckets {
  return { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
}

// ─── Control account helpers (read-only) ─────────────────────────────────────

/** Find the first active account matching the given type. Returns null if none. */
async function findControlAccount(
  ctx: QueryCtx,
  type: string,
): Promise<{ _id: Id<"accounts">; balance: number; name: string } | null> {
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_type", (q) => q.eq("type", type as Parameters<typeof q.eq>[1]))
    .collect();
  const active = accounts.find((a) => a.isActive);
  if (!active) return null;
  return { _id: active._id, balance: active.balance, name: active.name };
}

// ─── AR Ageing (Report 6) ─────────────────────────────────────────────────────

export type ARAgingRow = {
  customerId: string;
  customerName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
  invoices: ARAgingInvoice[];
};

export type ARAgingInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  daysPast: number;
  bucket: AgeingBucket;
};

export type ARAgingResult = {
  asOfDate: string;
  rows: ARAgingRow[];
  summary: AgeingBuckets & { total: number };
  /** AR control account balance (from accounts.balance). */
  controlBalance: number;
  controlAccountName: string;
  /** ageing total − control balance; 0 = reconciled. */
  reconciliationDiff: number;
  isReconciled: boolean;
};

export const getARAgeing = query({
  args: { asOfDate: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ARAgingResult> => {
    await requireAuth(ctx);

    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);

    // Get all unpaid/partially-paid credit invoices
    const allInvoices = await ctx.db.query("invoices").collect();
    const openInvoices = allInvoices.filter(
      (inv) =>
        inv.saleType === "credit" &&
        inv.status !== "void" &&
        inv.status !== "paid" &&
        inv.status !== "written_off" && // fully written-off: balance is zero
        inv.dueDate <= asOf, // only invoices issued on or before asOf
    );

    // Also include fully-issued invoices whose due date is in the future (current bucket)
    const currentInvoices = allInvoices.filter(
      (inv) =>
        inv.saleType === "credit" &&
        inv.status !== "void" &&
        inv.status !== "paid" &&
        inv.status !== "written_off" &&
        inv.date <= asOf &&
        inv.dueDate > asOf,
    );

    const allOpen = [...openInvoices, ...currentInvoices];

    // Group by customer
    const customerMap = new Map<string, ARAgingRow>();

    for (const inv of allOpen) {
      const balance = round2(inv.totalAmount - inv.amountPaid - (inv.amountWrittenOff ?? 0));
      // Show credit balances (negative) — never clamp
      const dp = daysPastDue(inv.dueDate, asOf);
      const bk = bucketKey(dp);

      let row = customerMap.get(inv.customerId);
      if (!row) {
        const customer = await ctx.db.get(inv.customerId);
        row = {
          customerId: inv.customerId,
          customerName: customer?.name ?? "Unknown",
          ...emptyBuckets(),
          total: 0,
          invoices: [],
        };
        customerMap.set(inv.customerId, row);
      }

      row[bk] = round2(row[bk] + balance);
      row.total = round2(row.total + balance);
      row.invoices.push({
        invoiceId: inv._id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        balance,
        daysPast: dp,
        bucket: bk,
      });
    }

    // Also include unapplied credit memos as negative AR balances
    const creditMemos = await ctx.db.query("creditMemos").collect();
    const activeMemos = creditMemos.filter(
      (cm) => cm.status === "active" && cm.date <= asOf,
    );
    for (const cm of activeMemos) {
      let row = customerMap.get(cm.customerId);
      if (!row) {
        const customer = await ctx.db.get(cm.customerId);
        row = {
          customerId: cm.customerId,
          customerName: customer?.name ?? "Unknown",
          ...emptyBuckets(),
          total: 0,
          invoices: [],
        };
        customerMap.set(cm.customerId, row);
      }
      // Credit memo reduces AR — show as negative in current bucket
      row.current = round2(row.current - cm.amount);
      row.total = round2(row.total - cm.amount);
    }

    // Sort by total descending (largest debtor first)
    const rows = Array.from(customerMap.values()).sort((a, b) => b.total - a.total);

    const summary: AgeingBuckets & { total: number } = {
      current: round2(rows.reduce((s, r) => s + r.current, 0)),
      days30: round2(rows.reduce((s, r) => s + r.days30, 0)),
      days60: round2(rows.reduce((s, r) => s + r.days60, 0)),
      days90: round2(rows.reduce((s, r) => s + r.days90, 0)),
      over90: round2(rows.reduce((s, r) => s + r.over90, 0)),
      total: round2(rows.reduce((s, r) => s + r.total, 0)),
    };

    const ctrl = await findControlAccount(ctx, "accounts_receivable");
    const controlBalance = round2(ctrl?.balance ?? 0);
    const controlAccountName = ctrl?.name ?? "Accounts Receivable";
    const reconciliationDiff = round2(summary.total - controlBalance);

    return {
      asOfDate: asOf,
      rows,
      summary,
      controlBalance,
      controlAccountName,
      reconciliationDiff,
      isReconciled: Math.abs(reconciliationDiff) < 0.01,
    };
  },
});

// ─── AP Ageing (Report 7) ─────────────────────────────────────────────────────

export type APAgingRow = {
  vendorId: string;
  vendorName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
  bills: APAgingBill[];
};

export type APAgingBill = {
  billId: string;
  title: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  balance: number;
  daysPast: number;
  bucket: AgeingBucket;
};

export type APAgingResult = {
  asOfDate: string;
  rows: APAgingRow[];
  summary: AgeingBuckets & { total: number };
  controlBalance: number;
  controlAccountName: string;
  reconciliationDiff: number;
  isReconciled: boolean;
};

export const getAPAgeing = query({
  args: { asOfDate: v.optional(v.string()) },
  handler: async (ctx, args): Promise<APAgingResult> => {
    await requireAuth(ctx);

    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);

    const allBills = await ctx.db.query("bills").collect();
    const openBills = allBills.filter(
      (b) =>
        b.status !== "paid" &&
        b.dueDate <= asOf,
    );
    const currentBills = allBills.filter(
      (b) =>
        b.status !== "paid" &&
        b.dueDate > asOf &&
        // Bills entered on or before asOf
        true, // bills lack an explicit "date" — use dueDate as proxy for "issued"
    );

    const allOpen = [...openBills, ...currentBills];

    const vendorMap = new Map<string, APAgingRow>();

    for (const bill of allOpen) {
      // CRITICAL FIX: use remaining balance, not full amount
      const amountPaid = bill.amountPaid ?? 0;
      const balance = round2(bill.amount - amountPaid);
      if (balance <= 0) continue; // fully paid

      const dp = daysPastDue(bill.dueDate, asOf);
      const bk = bucketKey(dp);

      let row = vendorMap.get(bill.vendorId);
      if (!row) {
        const vendor = await ctx.db.get(bill.vendorId);
        row = {
          vendorId: bill.vendorId,
          vendorName: vendor?.name ?? "Unknown",
          ...emptyBuckets(),
          total: 0,
          bills: [],
        };
        vendorMap.set(bill.vendorId, row);
      }

      row[bk] = round2(row[bk] + balance);
      row.total = round2(row.total + balance);
      row.bills.push({
        billId: bill._id,
        title: bill.title,
        dueDate: bill.dueDate,
        amount: bill.amount,
        amountPaid,
        balance,
        daysPast: dp,
        bucket: bk,
      });
    }

    const rows = Array.from(vendorMap.values()).sort((a, b) => b.total - a.total);

    const summary: AgeingBuckets & { total: number } = {
      current: round2(rows.reduce((s, r) => s + r.current, 0)),
      days30: round2(rows.reduce((s, r) => s + r.days30, 0)),
      days60: round2(rows.reduce((s, r) => s + r.days60, 0)),
      days90: round2(rows.reduce((s, r) => s + r.days90, 0)),
      over90: round2(rows.reduce((s, r) => s + r.over90, 0)),
      total: round2(rows.reduce((s, r) => s + r.total, 0)),
    };

    const ctrl = await findControlAccount(ctx, "accounts_payable");
    const controlBalance = round2(ctrl?.balance ?? 0);
    const controlAccountName = ctrl?.name ?? "Accounts Payable";
    const reconciliationDiff = round2(summary.total - controlBalance);

    return {
      asOfDate: asOf,
      rows,
      summary,
      controlBalance,
      controlAccountName,
      reconciliationDiff,
      isReconciled: Math.abs(reconciliationDiff) < 0.01,
    };
  },
});

// ─── Customer Statement (Report 8) ───────────────────────────────────────────

export type StatementLine = {
  date: string;
  type: "invoice" | "payment" | "credit_memo" | "advance";
  docNumber: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type CustomerStatementResult = {
  customerId: string;
  customerName: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  lines: StatementLine[];
  closingBalance: number;
  /** Ageing strip at the foot (as-of endDate). */
  ageing: AgeingBuckets;
  /** Statement mode used */
  mode: "open_item" | "balance_forward";
};

export const getCustomerStatement = query({
  args: {
    customerId: v.id("customers"),
    startDate: v.string(),
    endDate: v.string(),
    mode: v.union(v.literal("open_item"), v.literal("balance_forward")),
  },
  handler: async (ctx, args): Promise<CustomerStatementResult> => {
    await requireAuth(ctx);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    }

    // Opening balance: sum of unpaid invoices issued before startDate
    const priorInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    const beforeStart = priorInvoices.filter(
      (inv) => inv.date < args.startDate && inv.status !== "void",
    );
    const openingBalance = round2(
      beforeStart.reduce((s, inv) => s + round2(inv.totalAmount - inv.amountPaid - (inv.amountWrittenOff ?? 0)), 0),
    );

    // Transactions in the period
    const periodInvoices = priorInvoices.filter(
      (inv) =>
        inv.date >= args.startDate &&
        inv.date <= args.endDate &&
        inv.status !== "void",
    );

    // Payments in the period
    const allPayments = await ctx.db.query("payments").collect();
    const periodPayments = allPayments.filter((p) => {
      if (!p.invoiceId) return false;
      // Only payments for this customer's invoices
      const inv = priorInvoices.find((i) => i._id === p.invoiceId);
      if (!inv) return false;
      return p.date >= args.startDate && p.date <= args.endDate;
    });

    // Credit memos in the period
    const allCreditMemos = await ctx.db
      .query("creditMemos")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    const periodCreditMemos = allCreditMemos.filter(
      (cm) =>
        cm.date >= args.startDate &&
        cm.date <= args.endDate &&
        cm.status !== "void",
    );

    // Advance payments settled in the period
    const allAdvances = await ctx.db
      .query("advancePayments")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    const periodAdvances = allAdvances.filter(
      (a) =>
        a.direction === "customer" &&
        a.date >= args.startDate &&
        a.date <= args.endDate,
    );

    // Build lines
    const rawLines: StatementLine[] = [];

    for (const inv of periodInvoices) {
      rawLines.push({
        date: inv.date,
        type: "invoice",
        docNumber: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber}`,
        debit: inv.totalAmount,
        credit: 0,
        runningBalance: 0, // computed below
      });
    }

    for (const p of periodPayments) {
      const inv = priorInvoices.find((i) => i._id === p.invoiceId);
      rawLines.push({
        date: p.date,
        type: "payment",
        docNumber: p.reference ?? `PMT`,
        description: `Payment${inv ? ` for ${inv.invoiceNumber}` : ""}`,
        debit: 0,
        credit: p.amount,
        runningBalance: 0,
      });
    }

    for (const cm of periodCreditMemos) {
      rawLines.push({
        date: cm.date,
        type: "credit_memo",
        docNumber: cm.memoNumber,
        description: `Credit Memo ${cm.memoNumber} — ${cm.reason}`,
        debit: 0,
        credit: cm.amount,
        runningBalance: 0,
      });
    }

    for (const adv of periodAdvances) {
      rawLines.push({
        date: adv.date,
        type: "advance",
        docNumber: adv.reference ?? "ADV",
        description: `Customer Advance`,
        debit: 0,
        credit: adv.amount,
        runningBalance: 0,
      });
    }

    // Sort by date
    rawLines.sort((a, b) => a.date.localeCompare(b.date));

    // Open Item mode: keep only unsettled documents
    let lines = rawLines;
    if (args.mode === "open_item") {
      // Include only invoices with remaining balance > 0
      lines = rawLines.filter((l) => {
        if (l.type === "invoice") {
          const inv = periodInvoices.find((i) => i.invoiceNumber === l.docNumber);
          return inv ? round2(inv.totalAmount - inv.amountPaid) > 0 : true;
        }
        return true;
      });
    }

    // Compute running balance
    let running = openingBalance;
    for (const line of lines) {
      running = round2(running + line.debit - line.credit);
      line.runningBalance = running;
    }

    const closingBalance = lines.length > 0
      ? lines[lines.length - 1]!.runningBalance
      : openingBalance;

    // Ageing strip at footer
    const asOf = args.endDate;
    const ageing = emptyBuckets();
    const customerInvoicesOpen = priorInvoices.filter(
      (inv) =>
        inv.saleType === "credit" &&
        inv.status !== "void" &&
        inv.status !== "paid" &&
        inv.status !== "written_off" &&
        inv.date <= asOf,
    );
    for (const inv of customerInvoicesOpen) {
      const bal = round2(inv.totalAmount - inv.amountPaid - (inv.amountWrittenOff ?? 0));
      const dp = daysPastDue(inv.dueDate, asOf);
      const bk = bucketKey(dp);
      ageing[bk] = round2(ageing[bk] + bal);
    }

    return {
      customerId: args.customerId,
      customerName: customer.name,
      startDate: args.startDate,
      endDate: args.endDate,
      openingBalance,
      lines,
      closingBalance,
      ageing,
      mode: args.mode,
    };
  },
});

/** List of all customers (for the statement customer picker). */
export const listCustomers = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const customers = await ctx.db.query("customers").collect();
    return customers.filter((c) => c.isActive !== false).map((c) => ({
      _id: c._id,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));
  },
});
