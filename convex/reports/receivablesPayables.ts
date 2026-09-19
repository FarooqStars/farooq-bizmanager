/**
 * Receivables & Payables Reports — Reports 10–18 (Batch 2).
 *
 * ARCHITECTURE RULES (same as ageing.ts):
 *  - Monetary totals for income/revenue come from journalLines via
 *    getPostedLinesForPeriod — never from invoices.totalAmount or
 *    sales.totalAmount aggregated as a financial statement figure.
 *  - Opening/closing balances for customer/vendor ledgers are derived from
 *    invoices and bills (remaining balance = totalAmount − amountPaid),
 *    which is the same approach used by the existing ageing module.
 *    These are operational sub-ledger figures reconciled to control accounts.
 *  - Revenue in Report 14 (Sales by Customer) and Report 18 (Purchases by Vendor)
 *    comes from journalLines only — using the source linkage
 *    (journalEntries.sourceType / sourceId → invoice / bill) to attribute
 *    ledger credits to customers.
 *  - Never delete financial history.
 */
import { query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { getPostedLinesForPeriod } from "../lib/reportQueries.ts";
import { INCOME_TYPES } from "../lib/ledger.ts";
import { INVOICE_SALE_SOURCE } from "../invoicing.ts";
import { SALE_SOURCE } from "../sales.ts";
import { BILL_SOURCE, GOODS_RECEIPT_SOURCE } from "../lib/payablesPosting.ts";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function requireAuth(ctx: QueryCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
}

type BucketKey = "current" | "days30" | "days60" | "days90" | "over90";

function bucketKey(daysPast: number): BucketKey {
  if (daysPast <= 0) return "current";
  if (daysPast <= 30) return "days30";
  if (daysPast <= 60) return "days60";
  if (daysPast <= 90) return "days90";
  return "over90";
}

function daysPastDue(dueDate: string, asOf: string): number {
  return Math.floor(
    (new Date(asOf).getTime() - new Date(dueDate).getTime()) / 86_400_000,
  );
}

async function findControlAccount(ctx: QueryCtx, type: string) {
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_type", (q) => q.eq("type", type as Parameters<typeof q.eq>[1]))
    .collect();
  const active = accounts.find((a) => a.isActive);
  if (!active) return null;
  return { _id: active._id, balance: round2(active.balance), name: active.name };
}

// ─── Report 10: AR Ageing Detail ─────────────────────────────────────────────
// Every open invoice: customer, invoice #, date, due date, days overdue,
// original amount, amount paid, balance, ageing bucket.
// Totals must equal AR Ageing Summary totals and AR control account.

export type ARAgingDetailRow = {
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  daysPast: number;
  originalAmount: number;
  amountPaid: number;
  balance: number;
  bucket: BucketKey;
};

export type ARAgingDetailResult = {
  asOfDate: string;
  rows: ARAgingDetailRow[];
  totalOriginal: number;
  totalPaid: number;
  totalBalance: number;
  summaryByBucket: Record<BucketKey, number>;
  controlBalance: number;
  controlAccountName: string;
  reconciliationDiff: number;
  isReconciled: boolean;
};

export const getARAgingDetail = query({
  args: {
    asOfDate: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    bucket: v.optional(v.union(
      v.literal("current"), v.literal("days30"), v.literal("days60"),
      v.literal("days90"), v.literal("over90")
    )),
  },
  handler: async (ctx, args): Promise<ARAgingDetailResult> => {
    await requireAuth(ctx);
    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);

    const allInvoices = args.customerId
      ? await ctx.db.query("invoices").withIndex("by_customer", (q) => q.eq("customerId", args.customerId!)).collect()
      : await ctx.db.query("invoices").collect();

    const customers = await ctx.db.query("customers").collect();
    const customerMap = new Map(customers.map((c) => [c._id as string, c.name]));

    const openInvoices = allInvoices.filter(
      (inv) =>
        inv.status !== "void" &&
        inv.status !== "paid" &&
        inv.status !== "written_off" &&
        inv.status !== "draft" &&
        inv.date <= asOf,
    );

    const rows: ARAgingDetailRow[] = [];
    for (const inv of openInvoices) {
      const balance = round2(inv.totalAmount - (inv.amountPaid ?? 0) - (inv.amountWrittenOff ?? 0));
      if (balance === 0) continue;
      const dp = daysPastDue(inv.dueDate ?? inv.date, asOf);
      const bk = bucketKey(Math.max(0, dp));
      if (args.bucket && bk !== args.bucket) continue;
      rows.push({
        customerId: inv.customerId as string,
        customerName: customerMap.get(inv.customerId as string) ?? "Unknown",
        invoiceId: inv._id as string,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: inv.dueDate ?? inv.date,
        daysPast: Math.max(0, dp),
        originalAmount: round2(inv.totalAmount),
        amountPaid: round2(inv.amountPaid ?? 0),
        balance,
        bucket: bk,
      });
    }

    rows.sort((a, b) => b.daysPast - a.daysPast);

    const summaryByBucket: Record<BucketKey, number> = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    for (const r of rows) summaryByBucket[r.bucket] = round2(summaryByBucket[r.bucket] + r.balance);

    const totalBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
    const totalOriginal = round2(rows.reduce((s, r) => s + r.originalAmount, 0));
    const totalPaid = round2(rows.reduce((s, r) => s + r.amountPaid, 0));

    const ctrl = await findControlAccount(ctx, "accounts_receivable");
    const controlBalance = ctrl?.balance ?? 0;
    const reconciliationDiff = round2(totalBalance - controlBalance);

    return {
      asOfDate: asOf,
      rows,
      totalOriginal,
      totalPaid,
      totalBalance,
      summaryByBucket,
      controlBalance,
      controlAccountName: ctrl?.name ?? "Accounts Receivable",
      reconciliationDiff,
      isReconciled: Math.abs(reconciliationDiff) < 0.01,
    };
  },
});

// ─── Report 11: Customer Balance Summary ─────────────────────────────────────
// Per customer: opening, invoiced, received, credited, closing.
// opening + invoiced − received − credited = closing (enforced).

export type CustomerBalanceRow = {
  customerId: string;
  customerName: string;
  opening: number;
  invoiced: number;
  received: number;
  credited: number;
  closing: number;
};

export type CustomerBalanceSummaryResult = {
  startDate: string;
  endDate: string;
  rows: CustomerBalanceRow[];
  totals: Omit<CustomerBalanceRow, "customerId" | "customerName">;
};

export const getCustomerBalanceSummary = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args): Promise<CustomerBalanceSummaryResult> => {
    await requireAuth(ctx);
    const { startDate, endDate } = args;

    const customers = await ctx.db.query("customers").collect();
    const allInvoices = await ctx.db.query("invoices").collect();
    const allPayments = await ctx.db.query("payments").collect();
    const allCreditMemos = await ctx.db.query("creditMemos").collect();

    const rows: CustomerBalanceRow[] = [];

    for (const cust of customers) {
      const custId = cust._id as string;
      const custInvoices = allInvoices.filter((inv) => (inv.customerId as string) === custId && inv.status !== "void");

      // Opening: unpaid balance of invoices dated before startDate
      const opening = round2(
        custInvoices
          .filter((inv) => inv.date < startDate && inv.status !== "paid" && inv.status !== "written_off")
          .reduce((s, inv) => s + round2(inv.totalAmount - (inv.amountPaid ?? 0) - (inv.amountWrittenOff ?? 0)), 0),
      );

      // Invoiced: total of invoices issued in period (all statuses except void)
      const invoiced = round2(
        custInvoices.filter((inv) => inv.date >= startDate && inv.date <= endDate).reduce((s, inv) => s + inv.totalAmount, 0),
      );

      // Received: payments received in period for this customer's invoices
      const custInvIds = new Set(custInvoices.map((inv) => inv._id as string));
      const received = round2(
        allPayments
          .filter((p) => p.invoiceId && custInvIds.has(p.invoiceId as string) && p.date >= startDate && p.date <= endDate)
          .reduce((s, p) => s + (p.amount ?? 0), 0),
      );

      // Credited: credit memos issued in period
      const credited = round2(
        allCreditMemos
          .filter((cm) => (cm.customerId as string) === custId && cm.date >= startDate && cm.date <= endDate)
          .reduce((s, cm) => s + cm.amount, 0),
      );

      const closing = round2(opening + invoiced - received - credited);

      // Only include customers with any activity or non-zero balance
      if (opening === 0 && invoiced === 0 && received === 0 && credited === 0) continue;

      rows.push({ customerId: custId, customerName: cust.name, opening, invoiced, received, credited, closing });
    }

    rows.sort((a, b) => b.closing - a.closing);

    const totals = {
      opening: round2(rows.reduce((s, r) => s + r.opening, 0)),
      invoiced: round2(rows.reduce((s, r) => s + r.invoiced, 0)),
      received: round2(rows.reduce((s, r) => s + r.received, 0)),
      credited: round2(rows.reduce((s, r) => s + r.credited, 0)),
      closing: round2(rows.reduce((s, r) => s + r.closing, 0)),
    };

    return { startDate, endDate, rows, totals };
  },
});

// ─── Report 12: Open Invoices ─────────────────────────────────────────────────
// All unpaid and partially-paid invoices with days outstanding.
// Filterable by customer and by ageing bucket.
// Excludes draft, void, and fully-paid invoices.

export type OpenInvoiceRow = {
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  daysOutstanding: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
  bucket: BucketKey;
};

export type OpenInvoicesResult = {
  asOfDate: string;
  rows: OpenInvoiceRow[];
  totalBalance: number;
  totalCount: number;
};

export const getOpenInvoices = query({
  args: {
    asOfDate: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    bucket: v.optional(v.union(
      v.literal("current"), v.literal("days30"), v.literal("days60"),
      v.literal("days90"), v.literal("over90")
    )),
  },
  handler: async (ctx, args): Promise<OpenInvoicesResult> => {
    await requireAuth(ctx);
    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);

    const allInvoices = args.customerId
      ? await ctx.db.query("invoices").withIndex("by_customer", (q) => q.eq("customerId", args.customerId!)).collect()
      : await ctx.db.query("invoices").collect();

    const customers = await ctx.db.query("customers").collect();
    const customerMap = new Map(customers.map((c) => [c._id as string, c.name]));

    const openInvoices = allInvoices.filter(
      (inv) =>
        inv.status !== "void" &&
        inv.status !== "paid" &&
        inv.status !== "written_off" &&
        inv.status !== "draft",
    );

    const rows: OpenInvoiceRow[] = [];
    for (const inv of openInvoices) {
      const balance = round2(inv.totalAmount - (inv.amountPaid ?? 0) - (inv.amountWrittenOff ?? 0));
      if (balance <= 0) continue;
      const dp = Math.max(0, daysPastDue(inv.dueDate ?? inv.date, asOf));
      const bk = bucketKey(dp);
      if (args.bucket && bk !== args.bucket) continue;
      rows.push({
        customerId: inv.customerId as string,
        customerName: customerMap.get(inv.customerId as string) ?? "Unknown",
        invoiceId: inv._id as string,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: inv.dueDate ?? inv.date,
        daysOutstanding: dp,
        totalAmount: round2(inv.totalAmount),
        amountPaid: round2(inv.amountPaid ?? 0),
        balance,
        status: inv.status,
        bucket: bk,
      });
    }

    rows.sort((a, b) => b.daysOutstanding - a.daysOutstanding);

    return {
      asOfDate: asOf,
      rows,
      totalBalance: round2(rows.reduce((s, r) => s + r.balance, 0)),
      totalCount: rows.length,
    };
  },
});

// ─── Report 13: Collections / Overdue ────────────────────────────────────────
// Overdue invoices only (daysPast > 0), sorted by days overdue desc.
// Includes customer phone and email for one-click WhatsApp/email reminder.

export type OverdueInvoiceRow = {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  daysPast: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  bucket: BucketKey;
};

export type OverdueInvoicesResult = {
  asOfDate: string;
  rows: OverdueInvoiceRow[];
  totalBalance: number;
  overdueCustomerCount: number;
};

export const getOverdueInvoices = query({
  args: {
    asOfDate: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
  },
  handler: async (ctx, args): Promise<OverdueInvoicesResult> => {
    await requireAuth(ctx);
    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);

    const allInvoices = args.customerId
      ? await ctx.db.query("invoices").withIndex("by_customer", (q) => q.eq("customerId", args.customerId!)).collect()
      : await ctx.db.query("invoices").collect();

    const customers = await ctx.db.query("customers").collect();
    const customerMap = new Map(customers.map((c) => [c._id as string, c]));

    const rows: OverdueInvoiceRow[] = [];
    for (const inv of allInvoices) {
      if (inv.status === "void" || inv.status === "paid" || inv.status === "written_off" || inv.status === "draft") continue;
      const balance = round2(inv.totalAmount - (inv.amountPaid ?? 0) - (inv.amountWrittenOff ?? 0));
      if (balance <= 0) continue;
      const dp = daysPastDue(inv.dueDate ?? inv.date, asOf);
      if (dp <= 0) continue; // not yet overdue
      const bk = bucketKey(dp);
      const cust = customerMap.get(inv.customerId as string);
      rows.push({
        customerId: inv.customerId as string,
        customerName: cust?.name ?? "Unknown",
        customerEmail: cust?.email ?? null,
        customerPhone: cust?.mobile ?? cust?.phone ?? null,
        invoiceId: inv._id as string,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: inv.dueDate ?? inv.date,
        daysPast: dp,
        totalAmount: round2(inv.totalAmount),
        amountPaid: round2(inv.amountPaid ?? 0),
        balance,
        bucket: bk,
      });
    }

    rows.sort((a, b) => b.daysPast - a.daysPast);

    const uniqueCustomers = new Set(rows.map((r) => r.customerId));

    return {
      asOfDate: asOf,
      rows,
      totalBalance: round2(rows.reduce((s, r) => s + r.balance, 0)),
      overdueCustomerCount: uniqueCustomers.size,
    };
  },
});

// ─── Report 14: Sales by Customer ─────────────────────────────────────────────
// Revenue per customer for the period, from posted journal lines.
// Attribution uses INVOICE_SALE_SOURCE (credit invoices) and SALE_SOURCE (POS/cash).
// IMPORTANT: "invoice" is NOT a sourceType this ledger ever stamps — use the
// exported constants only, never hand-typed literals (that was the original bug).
// Comparative column and % of total. Total must equal P&L netRevenue for the period.

export type SalesByCustomerRow = {
  customerId: string | null;
  customerName: string;
  revenue: number;
  comparativeRevenue: number;
  pctOfTotal: number;
};

export type SalesByCustomerResult = {
  startDate: string;
  endDate: string;
  rows: SalesByCustomerRow[];
  totalRevenue: number;
  comparativeTotalRevenue: number;
};

export const getSalesByCustomer = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    comparativeStartDate: v.optional(v.string()),
    comparativeEndDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SalesByCustomerResult> => {
    await requireAuth(ctx);

    const accounts = await ctx.db.query("accounts").collect();
    const incomeIds = new Set(
      accounts.filter((a) => INCOME_TYPES.includes(a.type)).map((a) => a._id as string),
    );

    const customers = await ctx.db.query("customers").collect();
    const customerMap = new Map(customers.map((c) => [c._id as string, c.name]));

    // Period lines
    const periodLines = await getPostedLinesForPeriod(ctx, args.startDate, args.endDate);
    // Comparative lines
    const compStart = args.comparativeStartDate ?? args.startDate.slice(0, 4) + "-01-01";
    const compEnd = args.comparativeEndDate ?? args.endDate;
    const compLines = await getPostedLinesForPeriod(ctx, compStart, compEnd);

    // Map journalEntryId → customerId using BOTH posting paths:
    //   1. INVOICE_SALE_SOURCE: credit sale via invoice → entry.sourceId = invoiceId → invoice.customerId
    //   2. SALE_SOURCE: POS/cash sale → entry.sourceId = saleId → sale.customerId
    // Entries are bounded to the union of period + comparative date range so this never
    // scans more than the window. Pattern follows lib/reportQueries.ts and dayBook.ts.
    const rangeStart = compStart < args.startDate ? compStart : args.startDate;
    const rangeEnd   = compEnd   > args.endDate   ? compEnd   : args.endDate;
    const allEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_date", (q) => q.gte("date", rangeStart).lte("date", rangeEnd))
      .collect();

    // Path 1: invoice sales — read only the invoices referenced by entries in the window
    const invoiceEntryMap = new Map(
      allEntries
        .filter((e) => e.sourceType === INVOICE_SALE_SOURCE && e.sourceId)
        .map((e) => [e._id as string, e.sourceId as string]),
    );
    const invoiceDocs = await Promise.all(
      [...new Set(invoiceEntryMap.values())].map((id) => ctx.db.get(id as Id<"invoices">)),
    );
    const invoiceCustomerMap = new Map<string, string>();
    for (const inv of invoiceDocs) {
      if (inv) invoiceCustomerMap.set(inv._id as string, inv.customerId as string);
    }

    // Path 2: POS/cash sales — read only the sales referenced by entries in the window
    const saleEntryMap = new Map(
      allEntries
        .filter((e) => e.sourceType === SALE_SOURCE && e.sourceId)
        .map((e) => [e._id as string, e.sourceId as string]),
    );
    const saleDocs = await Promise.all(
      [...new Set(saleEntryMap.values())].map((id) => ctx.db.get(id as Id<"sales">)),
    );
    const saleCustomerMap = new Map<string, string>();
    for (const s of saleDocs) {
      if (s?.customerId) saleCustomerMap.set(s._id as string, s.customerId as string);
    }

    function resolveCustomer(journalEntryId: string): string | null {
      // Try invoice path first
      const invoiceId = invoiceEntryMap.get(journalEntryId);
      if (invoiceId) return invoiceCustomerMap.get(invoiceId) ?? null;
      // Try POS/cash sale path
      const saleId = saleEntryMap.get(journalEntryId);
      if (saleId) return saleCustomerMap.get(saleId) ?? null;
      return null;
    }

    function attributeRevenue(lines: typeof periodLines): Map<string | null, number> {
      const map = new Map<string | null, number>();
      for (const line of lines) {
        if (!incomeIds.has(line.accountId as string)) continue;
        const rev = round2((line.credit ?? 0) - (line.debit ?? 0));
        if (rev === 0) continue;
        const customerId = resolveCustomer(line.journalEntryId as string);
        map.set(customerId, round2((map.get(customerId) ?? 0) + rev));
      }
      return map;
    }

    const periodMap = attributeRevenue(periodLines);
    const compMap = attributeRevenue(compLines);

    const totalRevenue = round2([...periodMap.values()].reduce((s, v) => s + v, 0));
    const comparativeTotalRevenue = round2([...compMap.values()].reduce((s, v) => s + v, 0));

    const allKeys = new Set([...periodMap.keys(), ...compMap.keys()]);
    const rows: SalesByCustomerRow[] = [];

    for (const customerId of allKeys) {
      const revenue = periodMap.get(customerId) ?? 0;
      const comparativeRevenue = compMap.get(customerId) ?? 0;
      rows.push({
        customerId,
        customerName: customerId ? (customerMap.get(customerId) ?? "Unknown") : "Walk-in / Unassigned",
        revenue,
        comparativeRevenue,
        pctOfTotal: totalRevenue > 0 ? round2((revenue / totalRevenue) * 100) : 0,
      });
    }

    rows.sort((a, b) => b.revenue - a.revenue);

    return { startDate: args.startDate, endDate: args.endDate, rows, totalRevenue, comparativeTotalRevenue };
  },
});

// ─── Report 15: AP Ageing Detail ─────────────────────────────────────────────
// Every unpaid bill: vendor, bill #, date, due date, days overdue, amount, paid, balance, bucket.

export type APAgingDetailRow = {
  vendorId: string;
  vendorName: string;
  billId: string;
  billTitle: string;
  date: string;
  dueDate: string;
  daysPast: number;
  originalAmount: number;
  amountPaid: number;
  balance: number;
  bucket: BucketKey;
};

export type APAgingDetailResult = {
  asOfDate: string;
  rows: APAgingDetailRow[];
  totalOriginal: number;
  totalPaid: number;
  totalBalance: number;
  summaryByBucket: Record<BucketKey, number>;
  controlBalance: number;
  controlAccountName: string;
  reconciliationDiff: number;
  isReconciled: boolean;
};

export const getAPAgingDetail = query({
  args: {
    asOfDate: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    bucket: v.optional(v.union(
      v.literal("current"), v.literal("days30"), v.literal("days60"),
      v.literal("days90"), v.literal("over90")
    )),
  },
  handler: async (ctx, args): Promise<APAgingDetailResult> => {
    await requireAuth(ctx);
    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);

    const allBills = args.vendorId
      ? await ctx.db.query("bills").withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!)).collect()
      : await ctx.db.query("bills").collect();

    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id as string, v.name]));

    const openBills = allBills.filter((b) => b.status !== "paid");

    const rows: APAgingDetailRow[] = [];
    for (const bill of openBills) {
      const balance = round2(bill.amount - (bill.amountPaid ?? 0));
      if (balance <= 0) continue;
      const dp = Math.max(0, daysPastDue(bill.dueDate, asOf));
      const bk = bucketKey(dp);
      if (args.bucket && bk !== args.bucket) continue;
      rows.push({
        vendorId: bill.vendorId as string,
        vendorName: vendorMap.get(bill.vendorId as string) ?? "Unknown",
        billId: bill._id as string,
        billTitle: bill.title,
        date: bill.dueDate, // bills don't have a separate issue date in schema
        dueDate: bill.dueDate,
        daysPast: dp,
        originalAmount: round2(bill.amount),
        amountPaid: round2(bill.amountPaid ?? 0),
        balance,
        bucket: bk,
      });
    }

    rows.sort((a, b) => b.daysPast - a.daysPast);

    const summaryByBucket: Record<BucketKey, number> = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    for (const r of rows) summaryByBucket[r.bucket] = round2(summaryByBucket[r.bucket] + r.balance);

    const totalBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
    const totalOriginal = round2(rows.reduce((s, r) => s + r.originalAmount, 0));
    const totalPaid = round2(rows.reduce((s, r) => s + r.amountPaid, 0));

    const ctrl = await findControlAccount(ctx, "accounts_payable");
    const controlBalance = ctrl?.balance ?? 0;
    const reconciliationDiff = round2(totalBalance - controlBalance);

    return {
      asOfDate: asOf,
      rows,
      totalOriginal,
      totalPaid,
      totalBalance,
      summaryByBucket,
      controlBalance,
      controlAccountName: ctrl?.name ?? "Accounts Payable",
      reconciliationDiff,
      isReconciled: Math.abs(reconciliationDiff) < 0.01,
    };
  },
});

// ─── Report 16: Vendor Balance Summary ───────────────────────────────────────
// Per vendor: opening, billed, paid, closing.

export type VendorBalanceRow = {
  vendorId: string;
  vendorName: string;
  opening: number;
  billed: number;
  paid: number;
  closing: number;
};

export type VendorBalanceSummaryResult = {
  startDate: string;
  endDate: string;
  rows: VendorBalanceRow[];
  totals: Omit<VendorBalanceRow, "vendorId" | "vendorName">;
};

export const getVendorBalanceSummary = query({
  args: { startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args): Promise<VendorBalanceSummaryResult> => {
    await requireAuth(ctx);
    const { startDate, endDate } = args;

    const vendors = await ctx.db.query("vendors").collect();
    const allBills = await ctx.db.query("bills").collect();
    const allBillPayments = await ctx.db.query("billPayments").collect();

    const rows: VendorBalanceRow[] = [];

    for (const vendor of vendors) {
      const vendId = vendor._id as string;
      const vendBills = allBills.filter((b) => (b.vendorId as string) === vendId);

      // Opening: unpaid balance of bills due before startDate
      const opening = round2(
        vendBills
          .filter((b) => b.dueDate < startDate && b.status !== "paid")
          .reduce((s, b) => s + round2(b.amount - (b.amountPaid ?? 0)), 0),
      );

      // Billed: total of bills created in period
      const billed = round2(
        vendBills
          .filter((b) => b.dueDate >= startDate && b.dueDate <= endDate)
          .reduce((s, b) => s + b.amount, 0),
      );

      // Paid: payments made in period for this vendor's bills
      const vendBillIds = new Set(vendBills.map((b) => b._id as string));
      const paid = round2(
        allBillPayments
          .filter((p) => vendBillIds.has(p.billId as string) && p.paymentDate >= startDate && p.paymentDate <= endDate)
          .reduce((s, p) => s + p.amount, 0),
      );

      const closing = round2(opening + billed - paid);

      if (opening === 0 && billed === 0 && paid === 0) continue;

      rows.push({ vendorId: vendId, vendorName: vendor.name, opening, billed, paid, closing });
    }

    rows.sort((a, b) => b.closing - a.closing);

    const totals = {
      opening: round2(rows.reduce((s, r) => s + r.opening, 0)),
      billed: round2(rows.reduce((s, r) => s + r.billed, 0)),
      paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
      closing: round2(rows.reduce((s, r) => s + r.closing, 0)),
    };

    return { startDate, endDate, rows, totals };
  },
});

// ─── Report 17: Unpaid Bills / Payment Due ────────────────────────────────────
// Bills due within a selectable window (7 / 15 / 30 days).
// Sorted by due date. Total cash required figure.

export type UnpaidBillRow = {
  vendorId: string;
  vendorName: string;
  billId: string;
  billTitle: string;
  dueDate: string;
  daysToDue: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
};

export type UnpaidBillsResult = {
  asOfDate: string;
  windowDays: number;
  rows: UnpaidBillRow[];
  cashRequired: number;
  totalCount: number;
};

export const getUnpaidBills = query({
  args: {
    asOfDate: v.optional(v.string()),
    windowDays: v.union(v.literal(7), v.literal(15), v.literal(30), v.literal(60), v.literal(90)),
  },
  handler: async (ctx, args): Promise<UnpaidBillsResult> => {
    await requireAuth(ctx);
    const asOf = args.asOfDate ?? new Date().toISOString().slice(0, 10);
    const windowEnd = new Date(new Date(asOf).getTime() + args.windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const allBills = await ctx.db.query("bills").collect();
    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id as string, v.name]));

    const rows: UnpaidBillRow[] = [];
    for (const bill of allBills) {
      if (bill.status === "paid") continue;
      const balance = round2(bill.amount - (bill.amountPaid ?? 0));
      if (balance <= 0) continue;
      if (bill.dueDate > windowEnd) continue; // beyond window
      const daysToDue = Math.floor(
        (new Date(bill.dueDate).getTime() - new Date(asOf).getTime()) / 86_400_000,
      );
      rows.push({
        vendorId: bill.vendorId as string,
        vendorName: vendorMap.get(bill.vendorId as string) ?? "Unknown",
        billId: bill._id as string,
        billTitle: bill.title,
        dueDate: bill.dueDate,
        daysToDue,
        totalAmount: round2(bill.amount),
        amountPaid: round2(bill.amountPaid ?? 0),
        balance,
        status: bill.status,
      });
    }

    rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      asOfDate: asOf,
      windowDays: args.windowDays,
      rows,
      cashRequired: round2(rows.reduce((s, r) => s + r.balance, 0)),
      totalCount: rows.length,
    };
  },
});

// ─── Report 18: Purchases by Vendor ──────────────────────────────────────────
// Spend per vendor for the period, from posted journal lines (AP credits = purchases).
// Comparative column and % of total.

export type PurchasesByVendorRow = {
  vendorId: string | null;
  vendorName: string;
  spend: number;
  comparativeSpend: number;
  pctOfTotal: number;
};

export type PurchasesByVendorResult = {
  startDate: string;
  endDate: string;
  rows: PurchasesByVendorRow[];
  totalSpend: number;
  comparativeTotalSpend: number;
};

export const getPurchasesByVendor = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    comparativeStartDate: v.optional(v.string()),
    comparativeEndDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PurchasesByVendorResult> => {
    await requireAuth(ctx);

    // Purchases = AP credits. Two posting paths credit AP:
    //   1. BILL_SOURCE: a bill posted directly (no goods receipt). entry.sourceId = billId → bill.vendorId
    //   2. GOODS_RECEIPT_SOURCE, type="with_bill": a goods receipt that created a new bill.
    //      entry.sourceId = receiptId → goodsReceipts.vendorId (one hop, direct FK).
    //      This is case (a) from payablesPosting.ts:postGoodsReceipt.
    //      NB: case (b) — GR linked to an existing bill — posts NO AP line (only reclassifies
    //      Inventory/Uncategorised Expense); that bill's AP was already credited under BILL_SOURCE.
    //      Including case (b) here would double-count. It is intentionally excluded.
    //      NB: case (c) — GR with no bill yet — credits GRNI (other_current_liability), not AP.
    //      getPurchasesByVendor filters a.type === "accounts_payable", so GRNI entries remain
    //      invisible. This is correct accounting: GRNI is an accrual, not a payable.

    // Compute the full date window (period + comparative) before reading entries.
    const periodLines = await getPostedLinesForPeriod(ctx, args.startDate, args.endDate);
    const compStart = args.comparativeStartDate ?? args.startDate.slice(0, 4) + "-01-01";
    const compEnd = args.comparativeEndDate ?? args.endDate;
    const compLines = await getPostedLinesForPeriod(ctx, compStart, compEnd);

    // Bound journalEntries read to the union date range — never scan the full history.
    const rangeStart = compStart < args.startDate ? compStart : args.startDate;
    const rangeEnd   = compEnd   > args.endDate   ? compEnd   : args.endDate;
    const allEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_date", (q) => q.gte("date", rangeStart).lte("date", rangeEnd))
      .collect();

    // Path 1: direct bill entries — read only the bills referenced by entries in the window
    const billEntryMap = new Map(
      allEntries
        .filter((e) => e.sourceType === BILL_SOURCE && e.sourceId)
        .map((e) => [e._id as string, e.sourceId as string]),
    );
    const billDocs = await Promise.all(
      [...new Set(billEntryMap.values())].map((id) => ctx.db.get(id as Id<"bills">)),
    );
    const billVendorMap = new Map<string, string>();
    for (const b of billDocs) {
      if (b) billVendorMap.set(b._id as string, b.vendorId as string);
    }

    // Path 2: goods receipt "with_bill" entries (case a only — these credit AP)
    // Read only the receipts referenced by entries in the window.
    const grEntryMap = new Map(
      allEntries
        .filter((e) => e.sourceType === GOODS_RECEIPT_SOURCE && e.sourceId)
        .map((e) => [e._id as string, e.sourceId as string]),
    );
    const grDocs = await Promise.all(
      [...new Set(grEntryMap.values())].map((id) => ctx.db.get(id as Id<"goodsReceipts">)),
    );
    // Only type="with_bill" receipts credit AP; exclude GRNI accruals (type="without_bill")
    const grVendorMap = new Map<string, string>();
    for (const r of grDocs) {
      if (r?.type === "with_bill") grVendorMap.set(r._id as string, r.vendorId as string);
    }

    function resolveVendor(journalEntryId: string): string | null {
      // Path 1: direct bill
      const billId = billEntryMap.get(journalEntryId);
      if (billId) return billVendorMap.get(billId) ?? null;
      // Path 2: goods receipt that created a bill (type="with_bill")
      const receiptId = grEntryMap.get(journalEntryId);
      if (receiptId) return grVendorMap.get(receiptId) ?? null;
      return null;
    }

    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id as string, v.name]));

    // AP accounts — credits to AP represent the purchase obligation
    const accounts = await ctx.db.query("accounts").collect();
    const apIds = new Set(
      accounts.filter((a) => a.type === "accounts_payable").map((a) => a._id as string),
    );

    function attributeSpend(lines: typeof periodLines): Map<string | null, number> {
      const map = new Map<string | null, number>();
      for (const line of lines) {
        if (!apIds.has(line.accountId as string)) continue;
        // AP is credit-normal: a credit = new purchase obligation
        const spend = round2((line.credit ?? 0) - (line.debit ?? 0));
        if (spend <= 0) continue;
        const vendorId = resolveVendor(line.journalEntryId as string);
        map.set(vendorId, round2((map.get(vendorId) ?? 0) + spend));
      }
      return map;
    }

    const periodMap = attributeSpend(periodLines);
    const compMap = attributeSpend(compLines);

    const totalSpend = round2([...periodMap.values()].reduce((s, v) => s + v, 0));
    const comparativeTotalSpend = round2([...compMap.values()].reduce((s, v) => s + v, 0));

    const allKeys = new Set([...periodMap.keys(), ...compMap.keys()]);
    const rows: PurchasesByVendorRow[] = [];

    for (const vendorId of allKeys) {
      const spend = periodMap.get(vendorId) ?? 0;
      const comparativeSpend = compMap.get(vendorId) ?? 0;
      rows.push({
        vendorId,
        vendorName: vendorId ? (vendorMap.get(vendorId) ?? "Unknown") : "Unassigned",
        spend,
        comparativeSpend,
        pctOfTotal: totalSpend > 0 ? round2((spend / totalSpend) * 100) : 0,
      });
    }

    rows.sort((a, b) => b.spend - a.spend);

    return { startDate: args.startDate, endDate: args.endDate, rows, totalSpend, comparativeTotalSpend };
  },
});

// ─── Helper: list customers and vendors for filter dropdowns ─────────────────

export const listCustomers = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const customers = await ctx.db.query("customers").collect();
    return customers.filter((c) => c.isActive).map((c) => ({ _id: c._id, name: c.name }));
  },
});

export const listVendors = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const vendors = await ctx.db.query("vendors").collect();
    return vendors.filter((v) => v.isActive).map((v) => ({ _id: v._id, name: v.name }));
  },
});
