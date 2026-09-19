import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// receivableAging and payableAging have been removed.
// The canonical AR/AP ageing reports (Milestone 5) live in convex/reports/ageing.ts
// and are accessible as api.reports.ageing.getARAgeing / api.reports.ageing.getAPAgeing.
// Those functions reconcile to the AR/AP control accounts via the ledger.

// ── Payroll Summary Report ──────────────────────────────────────────────────

export const payrollSummary = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const employees = await ctx.db.query("employees").collect();
    const payrollRuns = await ctx.db.query("payrollRuns").collect();
    const payslips = await ctx.db.query("payslips").collect();

    const targetYear = args.year ?? new Date().getFullYear();
    const yearRuns = payrollRuns.filter((r) => {
      const runYear = new Date(r.periodStart).getFullYear();
      return runYear === targetYear;
    });

    const runIds = new Set(yearRuns.map((r) => r._id));
    const yearSlips = payslips.filter((s) => runIds.has(s.payrollRunId));

    // Monthly payroll cost
    const monthlyPayroll: Record<string, number> = {};
    for (const run of yearRuns) {
      const month = run.periodStart.slice(0, 7);
      if (!monthlyPayroll[month]) monthlyPayroll[month] = 0;
      monthlyPayroll[month] += run.totalAmount;
    }

    // Department breakdown (using position as proxy)
    const deptCost: Record<string, { department: string; cost: number; headcount: number }> = {};
    for (const emp of employees) {
      if (!emp.isActive) continue;
      const dept = emp.department ?? emp.position ?? "General";
      if (!deptCost[dept]) deptCost[dept] = { department: dept, cost: 0, headcount: 0 };
      deptCost[dept].cost += emp.baseSalary;
      deptCost[dept].headcount += 1;
    }

    const activeCount = employees.filter((e) => e.isActive).length;
    const totalBasicSalary = employees
      .filter((e) => e.isActive)
      .reduce((s, e) => s + e.baseSalary, 0);
    const totalPaid = yearSlips.reduce((s, sl) => s + sl.netPay, 0);

    return {
      activeEmployees: activeCount,
      totalBasicSalary,
      totalPaidYTD: totalPaid,
      totalRuns: yearRuns.length,
      monthlyPayroll: Object.entries(monthlyPayroll)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      byDepartment: Object.values(deptCost).sort((a, b) => b.cost - a.cost),
      avgSalary: activeCount > 0 ? totalBasicSalary / activeCount : 0,
    };
  },
});

// ── Inventory Valuation Report ──────────────────────────────────────────────

export const inventoryValuation = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const products = await ctx.db.query("products").collect();
    const inventory = await ctx.db.query("inventory").collect();
    const categories = await ctx.db.query("categories").collect();
    const categoryMap = new Map(categories.map((c) => [c._id, c]));

    type ProductVal = {
      name: string;
      sku: string;
      category: string;
      quantity: number;
      unitCost: number;
      totalValue: number;
    };
    const productValues: ProductVal[] = [];
    const categoryTotals: Record<string, { category: string; value: number; items: number }> = {};

    for (const product of products) {
      if (!product.isActive) continue;
      const totalQty = inventory
        .filter((i) => i.productId === product._id)
        .reduce((s, i) => s + i.quantity, 0);
      const unitCost = product.costPrice ?? 0;
      const value = totalQty * unitCost;
      const cat = product.categoryId
        ? (categoryMap.get(product.categoryId)?.name ?? "Uncategorized")
        : "Uncategorized";

      productValues.push({
        name: product.name,
        sku: product.sku ?? "",
        category: cat,
        quantity: totalQty,
        unitCost,
        totalValue: value,
      });

      if (!categoryTotals[cat]) categoryTotals[cat] = { category: cat, value: 0, items: 0 };
      categoryTotals[cat].value += value;
      categoryTotals[cat].items += 1;
    }

    const totalValue = productValues.reduce((s, p) => s + p.totalValue, 0);
    const totalItems = productValues.reduce((s, p) => s + p.quantity, 0);

    return {
      totalValue,
      totalItems,
      totalProducts: productValues.length,
      topByValue: productValues.sort((a, b) => b.totalValue - a.totalValue).slice(0, 15),
      byCategory: Object.values(categoryTotals).sort((a, b) => b.value - a.value),
    };
  },
});

// ── Stock Movement Report ───────────────────────────────────────────────────

export const stockMovementReport = query({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const movements = await ctx.db.query("stockMovements").order("desc").collect();
    const products = await ctx.db.query("products").collect();
    const productMap = new Map(products.map((p) => [p._id, p]));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - args.days);
    const cutoffStr = cutoff.toISOString();

    const periodMovements = movements.filter((m) => m.timestamp >= cutoffStr);

    // Daily in/out volumes
    const dailyVolume: Record<string, { date: string; inQty: number; outQty: number }> = {};
    for (const m of periodMovements) {
      const date = m.timestamp.split("T")[0];
      if (!dailyVolume[date]) dailyVolume[date] = { date, inQty: 0, outQty: 0 };
      if (m.type === "in") dailyVolume[date].inQty += m.quantity;
      else dailyVolume[date].outQty += m.quantity;
    }

    // Top movers
    const productMovement: Record<
      string,
      { name: string; inQty: number; outQty: number; net: number }
    > = {};
    for (const m of periodMovements) {
      const prod = productMap.get(m.productId);
      const name = prod?.name ?? "Unknown";
      if (!productMovement[m.productId])
        productMovement[m.productId] = { name, inQty: 0, outQty: 0, net: 0 };
      if (m.type === "in") {
        productMovement[m.productId].inQty += m.quantity;
        productMovement[m.productId].net += m.quantity;
      } else {
        productMovement[m.productId].outQty += m.quantity;
        productMovement[m.productId].net -= m.quantity;
      }
    }

    const totalIn = periodMovements
      .filter((m) => m.type === "in")
      .reduce((s, m) => s + m.quantity, 0);
    const totalOut = periodMovements
      .filter((m) => m.type === "out")
      .reduce((s, m) => s + m.quantity, 0);

    return {
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
      totalMovements: periodMovements.length,
      dailyVolume: Object.values(dailyVolume).sort((a, b) => a.date.localeCompare(b.date)),
      topMovers: Object.values(productMovement)
        .sort((a, b) => b.inQty + b.outQty - (a.inQty + a.outQty))
        .slice(0, 10),
    };
  },
});

// ── Cash Flow Statement ─────────────────────────────────────────────────────

// ── Cash Flow Statement (ledger-based) ──────────────────────────────────────
// Computed from the change in cash/bank ledger account balances over each month.
// Bank accounts are debit-normal: a debit increases cash (inflow), a credit
// decreases it (outflow). This reads posted journal activity only, so it never
// double-counts a sale and its payment and ties back to the Trial Balance.

export const cashFlow = query({
  args: { months: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    totalInflow: number;
    totalOutflow: number;
    netCashFlow: number;
    openingBalance: number;
    closingBalance: number;
    monthly: Array<{ month: string; inflow: number; outflow: number; net: number }>;
  }> => {
    await requireAuth(ctx);

    const accounts = await ctx.db.query("accounts").collect();
    const cashIds = new Set(
      accounts.filter((a) => a.type === "bank").map((a) => a._id as string),
    );

    const posted = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const entryDate = new Map(posted.map((e) => [e._id as string, e.date]));

    const now = new Date();
    const monthlyFlow: Record<
      string,
      { month: string; inflow: number; outflow: number; net: number }
    > = {};
    for (let i = args.months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyFlow[key] = { month: key, inflow: 0, outflow: 0, net: 0 };
    }
    // Window start (first day of the earliest month shown).
    const firstMonthKey = Object.keys(monthlyFlow)[0] ?? now.toISOString().slice(0, 7);
    const windowStart = `${firstMonthKey}-01`;

    // Opening cash balance = net change on cash accounts BEFORE the window.
    let openingBalance = 0;

    const lines = await ctx.db.query("journalLines").collect();
    for (const line of lines) {
      if (!cashIds.has(line.accountId as string)) continue;
      const date = entryDate.get(line.journalEntryId as string);
      if (!date) continue; // not posted
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;

      if (date < windowStart) {
        openingBalance += debit - credit;
        continue;
      }
      const month = date.slice(0, 7);
      const bucket = monthlyFlow[month];
      if (!bucket) continue;
      // Debit to a bank account = cash in; credit = cash out.
      bucket.inflow += debit;
      bucket.outflow += credit;
    }

    for (const key of Object.keys(monthlyFlow)) {
      monthlyFlow[key].net = monthlyFlow[key].inflow - monthlyFlow[key].outflow;
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const data = Object.values(monthlyFlow)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ month: m.month, inflow: r2(m.inflow), outflow: r2(m.outflow), net: r2(m.net) }));
    const totalInflow = r2(data.reduce((s, d) => s + d.inflow, 0));
    const totalOutflow = r2(data.reduce((s, d) => s + d.outflow, 0));
    const netCashFlow = r2(totalInflow - totalOutflow);

    return {
      totalInflow,
      totalOutflow,
      netCashFlow,
      openingBalance: r2(openingBalance),
      closingBalance: r2(openingBalance + netCashFlow),
      monthly: data,
    };
  },
});

// ── Purchase Order Analysis ─────────────────────────────────────────────────

export const purchaseAnalysis = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const purchaseOrders = await ctx.db.query("purchaseOrders").collect();
    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id, v]));

    // By status
    const byStatus: Record<string, number> = {
      draft: 0,
      sent: 0,
      partially_received: 0,
      received: 0,
      cancelled: 0,
    };
    for (const po of purchaseOrders) {
      byStatus[po.status] = (byStatus[po.status] ?? 0) + 1;
    }

    // By vendor
    const vendorSpend: Record<string, { name: string; totalAmount: number; orderCount: number }> =
      {};
    for (const po of purchaseOrders) {
      if (po.status === "cancelled") continue;
      const name = vendorMap.get(po.vendorId)?.name ?? "Unknown";
      if (!vendorSpend[po.vendorId])
        vendorSpend[po.vendorId] = { name, totalAmount: 0, orderCount: 0 };
      vendorSpend[po.vendorId].totalAmount += po.totalAmount;
      vendorSpend[po.vendorId].orderCount += 1;
    }

    // Monthly PO volume
    const monthlyPO: Record<string, { month: string; amount: number; count: number }> = {};
    for (const po of purchaseOrders) {
      if (po.status === "cancelled") continue;
      const month = po.date.slice(0, 7);
      if (!monthlyPO[month]) monthlyPO[month] = { month, amount: 0, count: 0 };
      monthlyPO[month].amount += po.totalAmount;
      monthlyPO[month].count += 1;
    }

    const totalSpend = purchaseOrders
      .filter((p) => p.status !== "cancelled")
      .reduce((s, p) => s + p.totalAmount, 0);

    return {
      totalPOs: purchaseOrders.length,
      totalSpend,
      byStatus,
      topVendors: Object.values(vendorSpend)
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10),
      monthlyVolume: Object.values(monthlyPO).sort((a, b) => a.month.localeCompare(b.month)),
    };
  },
});

// ── Financial Summary (P&L + Balance Sheet indicators) ──────────────────────

export const financialSummary = query({
  args: { period: v.union(v.literal("month"), v.literal("quarter"), v.literal("year")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const accounts = await ctx.db.query("accounts").collect();

    const now = new Date();
    let startDate: Date;
    switch (args.period) {
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter":
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = now.toISOString().split("T")[0];

    // Account-type buckets used both for the balance-sheet indicators and to
    // classify journal lines as revenue vs. expense.
    const ASSET_TYPES = new Set([
      "bank",
      "accounts_receivable",
      "other_current_asset",
      "fixed_asset",
      "other_asset",
      "asset",
    ]);
    const LIABILITY_TYPES = new Set([
      "accounts_payable",
      "credit_card",
      "other_current_liability",
      "long_term_liability",
      "loan",
      "liability",
    ]);
    const EQUITY_TYPES = new Set(["equity"]);
    const INCOME_TYPES = new Set(["income", "other_income", "revenue"]);
    const EXPENSE_TYPES = new Set(["cost_of_goods_sold", "expense", "other_expense"]);

    // Revenue & expenses come from the ledger: sum posted journal lines in the
    // period, so the P&L always ties out to the trial balance.
    const postedEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const periodEntryIds = new Set(
      postedEntries
        .filter((e) => e.date >= startStr && e.date <= endStr)
        .map((e) => e._id),
    );

    const accountTypeById = new Map(accounts.map((a) => [a._id, a.type]));
    const allLines = await ctx.db.query("journalLines").collect();

    let periodRevenue = 0;
    let periodExpenses = 0;
    for (const line of allLines) {
      if (!periodEntryIds.has(line.journalEntryId)) continue;
      const type = accountTypeById.get(line.accountId);
      if (!type) continue;
      if (INCOME_TYPES.has(type)) {
        // Revenue: credits increase, debits decrease.
        periodRevenue += line.credit - line.debit;
      } else if (EXPENSE_TYPES.has(type)) {
        // Expenses (incl. COGS): debits increase, credits decrease.
        periodExpenses += line.debit - line.credit;
      }
    }
    periodRevenue = Math.round(periodRevenue * 100) / 100;
    periodExpenses = Math.round(periodExpenses * 100) / 100;

    // Balance-sheet indicators from live account balances.
    const balanceByType: Record<string, number> = {
      asset: 0,
      liability: 0,
      equity: 0,
      revenue: 0,
      expense: 0,
    };
    let arBalance = 0;
    let apBalance = 0;
    for (const acct of accounts) {
      const bal = acct.balance ?? 0;
      if (ASSET_TYPES.has(acct.type)) balanceByType.asset += bal;
      else if (LIABILITY_TYPES.has(acct.type)) balanceByType.liability += bal;
      else if (EQUITY_TYPES.has(acct.type)) balanceByType.equity += bal;
      else if (INCOME_TYPES.has(acct.type)) balanceByType.revenue += bal;
      else if (EXPENSE_TYPES.has(acct.type)) balanceByType.expense += bal;

      // AR / AP straight from their control accounts.
      if (acct.type === "accounts_receivable") arBalance += bal;
      else if (acct.type === "accounts_payable") apBalance += bal;
    }
    arBalance = Math.round(arBalance * 100) / 100;
    apBalance = Math.round(apBalance * 100) / 100;

    const grossProfit = Math.round((periodRevenue - periodExpenses) * 100) / 100;
    const profitMargin = periodRevenue > 0 ? (grossProfit / periodRevenue) * 100 : 0;

    return {
      periodRevenue,
      periodExpenses,
      grossProfit,
      profitMargin,
      arBalance,
      apBalance,
      netWorkingCapital: Math.round((arBalance - apBalance) * 100) / 100,
      accountBalances: balanceByType,
      totalAssets: balanceByType.asset,
      totalLiabilities: balanceByType.liability,
      totalEquity: balanceByType.equity,
    };
  },
});
