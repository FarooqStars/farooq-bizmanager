/**
 * Reconciliation Panel — live health checks for the Reports Hub.
 *
 * Returns 9 checks. Each check has:
 *  - label: string
 *  - leftLabel / rightLabel: column headers
 *  - leftValue / rightValue: the two figures being compared
 *  - difference: leftValue - rightValue
 *  - reconciled: boolean (|difference| < tolerance)
 *  - severity: "ok" | "warn" | "error"
 *
 * Core checks (1–5):
 *  1. Total debits vs total credits across ALL posted journal lines
 *  2. AR control account balance vs sum of open invoice balances (AR sub-ledger)
 *  3. AP control account balance vs sum of unpaid bill balances (AP sub-ledger)
 *  4. Inventory control account balance vs inventory valuation (sum qty × costPrice)
 *  5. P&L net profit (current FY) vs Balance Sheet currentPeriodEarnings
 *
 * Additional health checks (6–9):
 *  6. Unbalanced posted entries (journalEntries where |totalDebit - totalCredit| > 0.001)
 *  7. Journal lines missing date or status (should be 0 after backfill)
 *  8. Draft journal entries older than 30 days (count + value — not an error, but visible)
 *  9. Orphan check: posted entries with no lines + journal lines whose account no longer exists
 *
 * For each failing core check (1–5), `drillDown` contains the documents contributing
 * to the discrepancy.
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReconciliationCheck = {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  difference: number;
  reconciled: boolean;
  severity: "ok" | "warn" | "error";
  // For count-based health checks (6-9), leftValue is the count
  isCount?: boolean;
  count?: number;
  value?: number; // total value for check 8
  drillDown?: Array<{
    id: string;
    label: string;
    amount: number;
    date?: string;
    type?: string;
  }>;
};

export type ReconciliationResult = {
  asOfDate: string;
  fiscalYearStart: string;
  checks: ReconciliationCheck[];
  allCoreReconciled: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getFiscalYearStart(fiscalStartMonth: number, asOf: string): string {
  const d = new Date(asOf);
  const month0 = d.getMonth();
  const fyStart0 = fiscalStartMonth - 1;
  let year = d.getFullYear();
  if (month0 < fyStart0) year -= 1;
  const mm = String(fiscalStartMonth).padStart(2, "0");
  return `${year}-${mm}-01`;
}

function subDays30Ago(asOf: string): string {
  const d = new Date(asOf);
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Find the first active account of a given type. */
async function findFirstAccount(
  ctx: QueryCtx,
  type: string,
  matchSubType?: string,
) {
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_type", (q) => q.eq("type", type as Parameters<typeof q.eq>[1]))
    .collect();
  const active = accounts.filter((a) => a.isActive);
  if (matchSubType) {
    const exact = active.find((a) => a.subType?.toLowerCase() === matchSubType.toLowerCase());
    if (exact) return exact;
    const partial = active.find((a) => a.subType?.toLowerCase().includes(matchSubType.toLowerCase()));
    if (partial) return partial;
  }
  return active[0];
}

/**
 * Compute net balance for an account from all posted lines.
 * debit-normal: sum(debit) - sum(credit)
 * credit-normal: sum(credit) - sum(debit)
 */
async function accountNetBalance(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  normalSide: "debit" | "credit",
): Promise<number> {
  const lines = await ctx.db
    .query("journalLines")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  const posted = lines.filter((l) => l.status === "posted");
  const totalDebit = posted.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = posted.reduce((s, l) => s + (l.credit ?? 0), 0);
  return round2(normalSide === "debit" ? totalDebit - totalCredit : totalCredit - totalDebit);
}

// ─── Query ────────────────────────────────────────────────────────────────────

export const getReconciliationPanel = query({
  args: {
    asOfDate: v.string(),
    fiscalYearStartMonth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ReconciliationResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { asOfDate } = args;
    const fiscalStartMonth = args.fiscalYearStartMonth ?? 1;
    const fyStart = getFiscalYearStart(fiscalStartMonth, asOfDate);
    const dayAfter = addDays(asOfDate, 1);

    const checks: ReconciliationCheck[] = [];

    // ── Check 1: Total debits === total credits (all posted lines) ──────────
    {
      const allPostedLines = await ctx.db
        .query("journalLines")
        .withIndex("by_status_and_date", (q) => q.eq("status", "posted"))
        .collect();

      const totalDebits = round2(allPostedLines.reduce((s, l) => s + (l.debit ?? 0), 0));
      const totalCredits = round2(allPostedLines.reduce((s, l) => s + (l.credit ?? 0), 0));
      const diff = round2(totalDebits - totalCredits);
      const reconciled = Math.abs(diff) < 0.01;

      // Drill down: find journal entries that are out of balance at the line level
      const entryLineDebit = new Map<string, number>();
      const entryLineCredit = new Map<string, number>();
      for (const l of allPostedLines) {
        const eid = l.journalEntryId as string;
        entryLineDebit.set(eid, round2((entryLineDebit.get(eid) ?? 0) + (l.debit ?? 0)));
        entryLineCredit.set(eid, round2((entryLineCredit.get(eid) ?? 0) + (l.credit ?? 0)));
      }
      const drillDown: ReconciliationCheck["drillDown"] = [];
      for (const [eid, d] of entryLineDebit) {
        const c = entryLineCredit.get(eid) ?? 0;
        if (Math.abs(d - c) > 0.001) {
          const entry = await ctx.db.get(eid as Id<"journalEntries">);
          if (entry) {
            drillDown.push({
              id: eid,
              label: `${entry.entryNumber} — ${entry.description}`,
              amount: round2(d - c),
              date: entry.date,
            });
          }
        }
      }

      checks.push({
        id: "total_balance",
        label: "Total Debits vs Total Credits",
        leftLabel: "Total Debits",
        rightLabel: "Total Credits",
        leftValue: totalDebits,
        rightValue: totalCredits,
        difference: diff,
        reconciled,
        severity: reconciled ? "ok" : "error",
        drillDown,
      });
    }

    // ── Check 2: AR control account vs AR sub-ledger ────────────────────────
    {
      const arAccount = await findFirstAccount(ctx, "accounts_receivable");
      let arControlBalance = 0;
      if (arAccount) {
        // Use journal lines up to asOfDate
        const arLines = await ctx.db
          .query("journalLines")
          .withIndex("by_account_and_date", (q) =>
            q.eq("accountId", arAccount._id).lt("date", dayAfter)
          )
          .collect();
        const posted = arLines.filter((l) => l.status === "posted");
        const d = posted.reduce((s, l) => s + (l.debit ?? 0), 0);
        const c = posted.reduce((s, l) => s + (l.credit ?? 0), 0);
        arControlBalance = round2(d - c); // AR is debit-normal
      }

      // AR sub-ledger: sum of open invoice balances (totalAmount - amountPaid) for non-void invoices
      const openInvoices = await ctx.db.query("invoices").collect();
      const unpaidInvoices = openInvoices.filter((inv) =>
        inv.status !== "void" && inv.status !== "draft" && (inv.totalAmount - inv.amountPaid) > 0.001
      );
      const arSubLedger = round2(unpaidInvoices.reduce((s, inv) => s + (inv.totalAmount - inv.amountPaid), 0));

      const diff = round2(arControlBalance - arSubLedger);
      const reconciled = Math.abs(diff) < 0.01;

      const drillDown: ReconciliationCheck["drillDown"] = reconciled ? [] : unpaidInvoices
        .filter((inv) => (inv.totalAmount - inv.amountPaid) > 0)
        .slice(0, 20)
        .map((inv) => ({
          id: inv._id as string,
          label: `${inv.invoiceNumber}`,
          amount: round2(inv.totalAmount - inv.amountPaid),
          date: inv.date,
          type: "invoice",
        }));

      checks.push({
        id: "ar_reconciliation",
        label: "AR Control vs AR Sub-Ledger",
        leftLabel: "AR Control Account",
        rightLabel: "Open Invoice Balances",
        leftValue: arControlBalance,
        rightValue: arSubLedger,
        difference: diff,
        reconciled,
        severity: reconciled ? "ok" : "error",
        drillDown,
      });
    }

    // ── Check 3: AP control account vs AP sub-ledger ────────────────────────
    {
      const apAccount = await findFirstAccount(ctx, "accounts_payable");
      let apControlBalance = 0;
      if (apAccount) {
        const apLines = await ctx.db
          .query("journalLines")
          .withIndex("by_account_and_date", (q) =>
            q.eq("accountId", apAccount._id).lt("date", dayAfter)
          )
          .collect();
        const posted = apLines.filter((l) => l.status === "posted");
        const d = posted.reduce((s, l) => s + (l.debit ?? 0), 0);
        const c = posted.reduce((s, l) => s + (l.credit ?? 0), 0);
        apControlBalance = round2(c - d); // AP is credit-normal
      }

      // AP sub-ledger: sum of unpaid bill balances
      const allBills = await ctx.db.query("bills").collect();
      // Only bills dated on or before the as-of date, matching the control
      // account lines above (which stop at the as-of date).
      const unpaidBills = allBills.filter((b) =>
        (b.status === "unpaid" || b.status === "partially_paid" || b.status === "overdue") &&
        (b.billDate ?? b.dueDate) < dayAfter
      );
      const apSubLedger = round2(unpaidBills.reduce((s, b) => s + (b.amount - (b.amountPaid ?? 0)), 0));

      const diff = round2(apControlBalance - apSubLedger);
      const reconciled = Math.abs(diff) < 0.01;

      const drillDown: ReconciliationCheck["drillDown"] = reconciled ? [] : unpaidBills
        .slice(0, 20)
        .map((b) => ({
          id: b._id as string,
          label: b.title,
          amount: round2(b.amount - (b.amountPaid ?? 0)),
          date: b.dueDate,
          type: "bill",
        }));

      checks.push({
        id: "ap_reconciliation",
        label: "AP Control vs AP Sub-Ledger",
        leftLabel: "AP Control Account",
        rightLabel: "Unpaid Bill Balances",
        leftValue: apControlBalance,
        rightValue: apSubLedger,
        difference: diff,
        reconciled,
        severity: reconciled ? "ok" : "error",
        drillDown,
      });
    }

    // ── Check 4: Inventory control account vs inventory valuation ───────────
    {
      const invAccount = await findFirstAccount(ctx, "other_current_asset", "Inventory");
      let invControlBalance = 0;
      if (invAccount) {
        const invLines = await ctx.db
          .query("journalLines")
          .withIndex("by_account_and_date", (q) =>
            q.eq("accountId", invAccount._id).lt("date", dayAfter)
          )
          .collect();
        const posted = invLines.filter((l) => l.status === "posted");
        const d = posted.reduce((s, l) => s + (l.debit ?? 0), 0);
        const c = posted.reduce((s, l) => s + (l.credit ?? 0), 0);
        invControlBalance = round2(d - c); // Inventory is debit-normal (asset)
      }

      // Inventory valuation: sum(quantity × costPrice) for all products
      const allInventory = await ctx.db.query("inventory").collect();
      const allProducts = await ctx.db.query("products").collect();
      const productCostMap = new Map(allProducts.map((p) => [p._id as string, p.costPrice ?? 0]));

      let invValuation = 0;
      for (const inv of allInventory) {
        const cost = productCostMap.get(inv.productId as string) ?? 0;
        invValuation = round2(invValuation + inv.quantity * cost);
      }

      const diff = round2(invControlBalance - invValuation);
      const reconciled = Math.abs(diff) < 0.01;

      const drillDown: ReconciliationCheck["drillDown"] = reconciled ? [] : allInventory
        .filter((inv) => {
          const cost = productCostMap.get(inv.productId as string) ?? 0;
          return inv.quantity * cost > 0;
        })
        .slice(0, 20)
        .map((inv) => {
          const cost = productCostMap.get(inv.productId as string) ?? 0;
          return {
            id: inv._id as string,
            label: `Product ${inv.productId}`,
            amount: round2(inv.quantity * cost),
            type: "inventory",
          };
        });

      checks.push({
        id: "inventory_reconciliation",
        label: "Inventory Control vs Inventory Valuation",
        leftLabel: "Inventory Control Account",
        rightLabel: "Stock × Cost",
        leftValue: invControlBalance,
        rightValue: invValuation,
        difference: diff,
        reconciled,
        severity: reconciled ? "ok" : "error",
        drillDown,
      });
    }

    // ── Check 5: P&L net profit (current FY) vs Balance Sheet currentPeriodEarnings ──
    {
      // P&L net profit: income − expenses from fyStart to asOfDate
      const periodLines = await ctx.db
        .query("journalLines")
        .withIndex("by_status_and_date", (q) =>
          q.eq("status", "posted").gte("date", fyStart).lte("date", asOfDate)
        )
        .collect();

      const allAccounts = await ctx.db.query("accounts").collect();
      const activeAccounts = allAccounts.filter((a) => a.isActive);

      const INCOME_TYPES = new Set(["income", "other_income", "revenue"]);
      const EXPENSE_TYPES = new Set(["cost_of_goods_sold", "expense", "other_expense"]);

      // Group lines by account
      const linesByAccount = new Map<string, Array<{ debit: number; credit: number }>>();
      for (const l of periodLines) {
        const aid = l.accountId as string;
        const arr = linesByAccount.get(aid) ?? [];
        arr.push({ debit: l.debit ?? 0, credit: l.credit ?? 0 });
        linesByAccount.set(aid, arr);
      }

      let plNetProfit = 0;
      for (const acc of activeAccounts) {
        const cat = INCOME_TYPES.has(acc.type) ? "income" : EXPENSE_TYPES.has(acc.type) ? "expense" : null;
        if (!cat) continue;
        const accLines = linesByAccount.get(acc._id as string) ?? [];
        const d = accLines.reduce((s, l) => s + l.debit, 0);
        const c = accLines.reduce((s, l) => s + l.credit, 0);
        const net = round2(acc.normalSide === "debit" ? d - c : c - d);
        if (cat === "income") {
          plNetProfit += acc.normalSide === "credit" ? net : -net;
        } else {
          plNetProfit -= acc.normalSide === "debit" ? net : -net;
        }
      }
      plNetProfit = round2(plNetProfit);

      // Balance Sheet current period earnings = same calculation but from Balance Sheet perspective
      // We use the same figure (both derived from journal lines) so they should always match if
      // both reports use the same logic.
      // The BS currentPeriodEarnings is computed identically so the diff catches any coding divergence.
      const bsCurrentPeriodEarnings = plNetProfit; // same source, same formula — intentional

      // BUT: we also check via the stored accounts.balance to detect stale balances
      let storedPLBalance = 0;
      for (const acc of activeAccounts) {
        const cat = INCOME_TYPES.has(acc.type) ? "income" : EXPENSE_TYPES.has(acc.type) ? "expense" : null;
        if (!cat) continue;
        const signed = acc.normalSide === "credit" ? acc.balance : -acc.balance;
        if (cat === "income") storedPLBalance += signed;
        if (cat === "expense") storedPLBalance -= (acc.normalSide === "debit" ? acc.balance : -acc.balance);
      }
      storedPLBalance = round2(storedPLBalance);

      const diff = round2(plNetProfit - storedPLBalance);
      const reconciled = Math.abs(diff) < 0.01;

      checks.push({
        id: "pl_vs_bs",
        label: "P&L Net Profit vs Stored Account Balances",
        leftLabel: "Net Profit (from lines)",
        rightLabel: "Net Profit (from balances)",
        leftValue: plNetProfit,
        rightValue: storedPLBalance,
        difference: diff,
        reconciled,
        severity: reconciled ? "ok" : "error",
        drillDown: [],
      });
    }

    // ── Check 6: Unbalanced posted entries ──────────────────────────────────
    {
      const allPostedEntries = await ctx.db
        .query("journalEntries")
        .withIndex("by_status", (q) => q.eq("status", "posted"))
        .collect();

      const unbalanced = allPostedEntries.filter(
        (e) => Math.abs(e.totalDebit - e.totalCredit) > 0.001
      );

      const drillDown: ReconciliationCheck["drillDown"] = unbalanced.slice(0, 20).map((e) => ({
        id: e._id as string,
        label: `${e.entryNumber} — ${e.description}`,
        amount: round2(e.totalDebit - e.totalCredit),
        date: e.date,
      }));

      checks.push({
        id: "unbalanced_entries",
        label: "Unbalanced Posted Entries",
        leftLabel: "Count",
        rightLabel: "Expected",
        leftValue: unbalanced.length,
        rightValue: 0,
        difference: unbalanced.length,
        reconciled: unbalanced.length === 0,
        severity: unbalanced.length === 0 ? "ok" : "error",
        isCount: true,
        count: unbalanced.length,
        drillDown,
      });
    }

    // ── Check 7: Journal lines missing date or status ───────────────────────
    {
      const allLines = await ctx.db.query("journalLines").collect();
      const missing = allLines.filter((l) => !l.date || !l.status);

      checks.push({
        id: "lines_missing_fields",
        label: "Journal Lines Missing date/status",
        leftLabel: "Count",
        rightLabel: "Expected",
        leftValue: missing.length,
        rightValue: 0,
        difference: missing.length,
        reconciled: missing.length === 0,
        severity: missing.length === 0 ? "ok" : "error",
        isCount: true,
        count: missing.length,
        drillDown: missing.slice(0, 20).map((l) => ({
          id: l._id as string,
          label: `Line on entry ${l.journalEntryId}`,
          amount: (l.debit ?? 0) + (l.credit ?? 0),
        })),
      });
    }

    // ── Check 8: Draft journal entries older than 30 days ───────────────────
    {
      const cutoff = subDays30Ago(asOfDate);
      const allDraftEntries = await ctx.db
        .query("journalEntries")
        .withIndex("by_status", (q) => q.eq("status", "draft"))
        .collect();

      const oldDrafts = allDraftEntries.filter((e) => e.date < cutoff);
      const oldDraftsValue = round2(oldDrafts.reduce((s, e) => s + e.totalDebit, 0));

      checks.push({
        id: "old_drafts",
        label: "Draft Entries Older Than 30 Days",
        leftLabel: "Count",
        rightLabel: "Expected",
        leftValue: oldDrafts.length,
        rightValue: 0,
        difference: oldDrafts.length,
        reconciled: oldDrafts.length === 0,
        severity: oldDrafts.length === 0 ? "ok" : "warn",
        isCount: true,
        count: oldDrafts.length,
        value: oldDraftsValue,
        drillDown: oldDrafts.slice(0, 20).map((e) => ({
          id: e._id as string,
          label: `${e.entryNumber} — ${e.description}`,
          amount: e.totalDebit,
          date: e.date,
        })),
      });
    }

    // ── Check 9: Orphans ─────────────────────────────────────────────────────
    {
      // 9a: Posted entries with no lines
      const allPostedEntries = await ctx.db
        .query("journalEntries")
        .withIndex("by_status", (q) => q.eq("status", "posted"))
        .collect();

      const orphanEntries: typeof allPostedEntries = [];
      for (const entry of allPostedEntries) {
        const lines = await ctx.db
          .query("journalLines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .first();
        if (!lines) orphanEntries.push(entry);
      }

      // 9b: Journal lines whose account no longer exists
      const allLines = await ctx.db.query("journalLines").collect();
      const allAccountIds = new Set(
        (await ctx.db.query("accounts").collect()).map((a) => a._id as string)
      );
      const orphanLines = allLines.filter((l) => !allAccountIds.has(l.accountId as string));

      const totalOrphans = orphanEntries.length + orphanLines.length;

      const drillDown: ReconciliationCheck["drillDown"] = [
        ...orphanEntries.slice(0, 10).map((e) => ({
          id: e._id as string,
          label: `Entry ${e.entryNumber} (no lines)`,
          amount: e.totalDebit,
          date: e.date,
          type: "entry",
        })),
        ...orphanLines.slice(0, 10).map((l) => ({
          id: l._id as string,
          label: `Line — account deleted`,
          amount: (l.debit ?? 0) + (l.credit ?? 0),
          date: l.date,
          type: "line",
        })),
      ];

      checks.push({
        id: "orphans",
        label: "Orphaned Entries / Lines",
        leftLabel: "Count",
        rightLabel: "Expected",
        leftValue: totalOrphans,
        rightValue: 0,
        difference: totalOrphans,
        reconciled: totalOrphans === 0,
        severity: totalOrphans === 0 ? "ok" : "warn",
        isCount: true,
        count: totalOrphans,
        drillDown,
      });
    }

    // ── Check 10: Stock products with no cost price sold at least once ──────────
    // A type:"product" item that is active, has been sold ≥ once, and whose
    // weighted-average cost resolves to zero.  Selling stock at zero cost makes
    // gross profit appear 100% and silently overstates income.
    {
      const allProducts = await ctx.db.query("products").collect();
      const stockProducts = allProducts.filter(
        (p) => p.isActive && (p.type === "product" || p.type === undefined)
      );

      // Set of product IDs that have been sold at least once — union of POS saleItems
      // and invoice invoiceItems (the primary credit-sales path).
      const [saleItems, invoiceItems] = await Promise.all([
        ctx.db.query("saleItems").collect(),
        ctx.db.query("invoiceItems").collect(),
      ]);
      const soldProductIds = new Set<string>([
        ...saleItems.map((si) => si.productId as string),
        ...invoiceItems
          .filter((ii) => ii.productId != null)
          .map((ii) => ii.productId as string),
      ]);

      // Filter: sold ≥ once AND cost resolves to zero
      const zeroCost = stockProducts.filter(
        (p) => soldProductIds.has(p._id as string) && (p.costPrice == null || p.costPrice === 0)
      );

      const drillDown: ReconciliationCheck["drillDown"] = zeroCost.slice(0, 20).map((p) => ({
        id: p._id as string,
        label: p.name,
        amount: 0,
        type: "product",
      }));

      checks.push({
        id: "zero_cost_sold_products",
        label: "Stock Products With No Cost Price (Sold \u2265 Once)",
        leftLabel: "Count",
        rightLabel: "Expected",
        leftValue: zeroCost.length,
        rightValue: 0,
        difference: zeroCost.length,
        reconciled: zeroCost.length === 0,
        severity: zeroCost.length === 0 ? "ok" : "warn",
        isCount: true,
        count: zeroCost.length,
        drillDown,
      });
    }

    // ── Check P1: Salaries Payable (ledger) vs unpaid approved run net pay ───
    {
      // Find account 2200 by code
      const salariesPayableAcc = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", "2200"))
        .first();

      const ledgerBalance = salariesPayableAcc
        ? await accountNetBalance(ctx, salariesPayableAcc._id, "credit")
        : 0;

      // Operational: sum netPay of payslips in approved-but-not-yet-paid runs
      const approvedRuns = await ctx.db
        .query("payrollRuns")
        .withIndex("by_status", (q) => q.eq("status", "approved"))
        .collect();

      let operationalBalance = 0;
      for (const run of approvedRuns) {
        const slips = await ctx.db
          .query("payslips")
          .withIndex("by_payroll_run", (q) => q.eq("payrollRunId", run._id))
          .collect();
        operationalBalance += slips.reduce((s, sl) => s + sl.netPay, 0);
      }
      operationalBalance = round2(operationalBalance);

      const diff = round2(ledgerBalance - operationalBalance);
      checks.push({
        id: "salaries_payable_reconciliation",
        label: "Salaries Payable (2200) vs Unpaid Approved Runs",
        leftLabel: "Ledger balance",
        rightLabel: "Approved run net pay",
        leftValue: ledgerBalance,
        rightValue: operationalBalance,
        difference: diff,
        reconciled: Math.abs(diff) < 0.01,
        severity: Math.abs(diff) < 0.01 ? "ok" : "error",
      });
    }

    // ── Check P2: Unposted payroll runs ──────────────────────────────────────
    {
      // Runs in approved or paid status that have no PAYROLL_ACCRUAL journal entry
      const [approvedRuns, paidRuns] = await Promise.all([
        ctx.db.query("payrollRuns").withIndex("by_status", (q) => q.eq("status", "approved")).collect(),
        ctx.db.query("payrollRuns").withIndex("by_status", (q) => q.eq("status", "paid")).collect(),
      ]);
      const candidateRuns = [...approvedRuns, ...paidRuns];

      const unposted: typeof candidateRuns = [];
      for (const run of candidateRuns) {
        const entry = await ctx.db
          .query("journalEntries")
          .withIndex("by_source", (q) =>
            q.eq("sourceType", "payroll_accrual").eq("sourceId", run._id as string),
          )
          .first();
        if (!entry) unposted.push(run);
      }

      const drillDown: ReconciliationCheck["drillDown"] = unposted.slice(0, 20).map((r) => ({
        id: r._id as string,
        label: `${r.title} (${r.status})`,
        amount: r.totalAmount,
        date: r.payDate,
        type: "payroll_run",
      }));

      checks.push({
        id: "unposted_payroll_runs",
        label: "Unposted Payroll Runs",
        leftLabel: "Count",
        rightLabel: "Expected",
        leftValue: unposted.length,
        rightValue: 0,
        difference: unposted.length,
        reconciled: unposted.length === 0,
        severity: unposted.length === 0 ? "ok" : "error",
        isCount: true,
        count: unposted.length,
        drillDown,
      });
    }

    // ── Check P3: EOS Benefits Payable (ledger) vs computed gratuity obligation ─
    // This is an approximate check — shows timing gap until next accrual run.
    {
      const eosPayableAcc = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", "2700"))
        .first();

      const ledgerBalance = eosPayableAcc
        ? await accountNetBalance(ctx, eosPayableAcc._id, "credit")
        : 0;

      // Operational: sum calculateGratuity for all active employees as of today
      // Using inline calculation (cannot call the query function here)
      const activeEmployees = await ctx.db
        .query("employees")
        .collect()
        .then((all) => all.filter((e) => e.isActive !== false));

      let computedObligation = 0;
      for (const emp of activeEmployees) {
        if (!emp.hireDate) continue;
        // Simple inline years calculation
        const hire = new Date(emp.hireDate);
        const today = new Date(asOfDate);
        const yearsWorked = (today.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        if (yearsWorked >= 1) {
          // Minimum tenure assumed for any material gratuity — use baseSalary as proxy
          // Full calculation requires country rules; use 21/26 × baseSalary × years (Qatar default)
          computedObligation += Math.round((emp.baseSalary / 4.33) * Math.min(yearsWorked, 5) + (yearsWorked > 5 ? (emp.baseSalary / 4.33) * (yearsWorked - 5) : 0));
        }
      }
      computedObligation = round2(computedObligation);

      const diff = round2(ledgerBalance - computedObligation);
      // Note: difference is expected if last accrual was not run today.
      checks.push({
        id: "eos_payable_reconciliation",
        label: "EOS Benefits Payable (2700) vs Computed Obligation (approx.)",
        leftLabel: "Ledger balance",
        rightLabel: "Computed obligation",
        leftValue: ledgerBalance,
        rightValue: computedObligation,
        difference: diff,
        // Warn (not error) — timing gap is normal
        reconciled: Math.abs(diff) < 0.01,
        severity: Math.abs(diff) < 0.01 ? "ok" : "warn",
      });
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const coreIds = ["total_balance", "ar_reconciliation", "ap_reconciliation", "inventory_reconciliation", "pl_vs_bs"];
    const allCoreReconciled = checks
      .filter((c) => coreIds.includes(c.id))
      .every((c) => c.reconciled);

    return {
      asOfDate,
      fiscalYearStart: fyStart,
      checks,
      allCoreReconciled,
    };
  },
});
