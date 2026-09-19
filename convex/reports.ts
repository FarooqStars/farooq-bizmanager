import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import { INCOME_TYPES, EXPENSE_TYPES } from "./lib/ledger.ts";
import { getPostedLinesForPeriod } from "./lib/reportQueries.ts";
import type { QueryCtx } from "./_generated/server";

async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ── Expenses by category ──────────────────────────────────────────────────────

export const expensesByCategory = query({
  args: {},
  handler: async (ctx): Promise<Array<{ name: string; amount: number; color: string }>> => {
    await requireAuth(ctx);
    const expenses = await ctx.db.query("expenses").collect();
    const categories = await ctx.db.query("expenseCategories").collect();
    const catMap = new Map(categories.map((c) => [c._id, c]));

    const totals: Record<string, { name: string; amount: number; color: string }> = {};

    for (const e of expenses) {
      const catId = e.categoryId ?? "uncategorized";
      const cat = e.categoryId ? catMap.get(e.categoryId) : null;
      const name = cat?.name ?? "Uncategorized";
      const color = cat?.color ?? "#94a3b8";
      if (!totals[catId]) totals[catId] = { name, amount: 0, color };
      totals[catId].amount += e.amount;
    }

    return Object.values(totals).sort((a, b) => b.amount - a.amount);
  },
});

// ── Top products by sales volume (unit count only — not monetary revenue) ─────
// Revenue ranking belongs to the P&L. This query ranks by units-sold so the
// dashboard's "Top Products" widget stays informational without deriving a
// second, possibly conflicting revenue figure from the operational sales table.

export const topProducts = query({
  args: { limit: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ name: string; quantity: number }>> => {
    await requireAuth(ctx);
    const items = await ctx.db.query("saleItems").collect();
    const sales = await ctx.db.query("sales").collect();
    const refundedIds = new Set(sales.filter((s) => s.status === "refunded").map((s) => s._id));

    const map: Record<string, { name: string; quantity: number }> = {};
    for (const item of items) {
      if (refundedIds.has(item.saleId)) continue;
      if (!map[item.productName])
        map[item.productName] = { name: item.productName, quantity: 0 };
      map[item.productName].quantity += item.quantity;
    }

    return Object.values(map)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, args.limit);
  },
});

// ── Inventory summary ─────────────────────────────────────────────────────────

export const inventorySummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const products = await ctx.db.query("products").collect();
    const inventory = await ctx.db.query("inventory").collect();

    let totalValue = 0;
    let lowStockCount = 0;
    const lowStockItems: Array<{ name: string; quantity: number; threshold: number }> = [];

    for (const product of products) {
      if (!product.isActive) continue;
      const totalQty = inventory
        .filter((i) => i.productId === product._id)
        .reduce((s, i) => s + i.quantity, 0);
      totalValue += totalQty * (product.costPrice ?? 0);
      if (product.lowStockThreshold !== undefined && totalQty <= product.lowStockThreshold) {
        lowStockCount++;
        lowStockItems.push({
          name: product.name,
          quantity: totalQty,
          threshold: product.lowStockThreshold,
        });
      }
    }

    return {
      totalProducts: products.filter((p) => p.isActive).length,
      totalValue,
      lowStockCount,
      lowStockItems: lowStockItems.slice(0, 5),
    };
  },
});

// ── Bills summary ──────────────────────────────────────────────────────────────

export const billsSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const bills = await ctx.db.query("bills").collect();
    const today = new Date().toISOString().split("T")[0];

    const unpaid = bills.filter((b) => b.status === "unpaid");
    const overdue = bills.filter((b) => b.status !== "paid" && b.dueDate < today);
    const dueSoon = unpaid.filter((b) => {
      const diff = (new Date(b.dueDate).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= 7;
    });

    return {
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, b) => s + b.amount, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, b) => s + b.amount, 0),
      dueSoonCount: dueSoon.length,
      dueSoonAmount: dueSoon.reduce((s, b) => s + b.amount, 0),
    };
  },
});

// ── Revenue KPIs (ledger-based, indexed) ──────────────────────────────────────
// Revenue and expenses come exclusively from POSTED journal lines via
// getPostedLinesForPeriod — the same indexed helper used by getProfitAndLoss.
// Using the same source guarantees the dashboard and the P&L always agree.
// Five indexed reads replace the old full-table scan of journalLines.

function sumRevAndExp(
  lines: Awaited<ReturnType<typeof getPostedLinesForPeriod>>,
  incomeIds: Set<string>,
  expenseIds: Set<string>,
): { rev: number; exp: number } {
  let rev = 0;
  let exp = 0;
  for (const line of lines) {
    const acctId = line.accountId as string;
    if (incomeIds.has(acctId)) {
      // Credit-normal: revenue = credit − debit
      rev += (line.credit ?? 0) - (line.debit ?? 0);
    } else if (expenseIds.has(acctId)) {
      // Debit-normal: expense = debit − credit
      exp += (line.debit ?? 0) - (line.credit ?? 0);
    }
  }
  return { rev, exp };
}

export const revenueKpis = query({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    todayRev: number;
    monthRev: number;
    yearRev: number;
    allRev: number;
    monthChange: number | null;
    monthExpenses: number;
    monthNetProfit: number;
    totalSales: number;
  }> => {
    await requireAuth(ctx);

    const accounts = await ctx.db.query("accounts").collect();
    const incomeIds = new Set(
      accounts.filter((a) => INCOME_TYPES.includes(a.type)).map((a) => a._id as string),
    );
    const expenseIds = new Set(
      accounts.filter((a) => EXPENSE_TYPES.includes(a.type)).map((a) => a._id as string),
    );

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const today = new Date().toISOString().split("T")[0];

    // Month bounds
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = today;
    // Year bounds
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const yearEnd = today;
    // Previous month bounds
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const prevMonthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const prevMonthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];
    // All time — use a wide range
    const allTimeStart = "2000-01-01";

    const [todayLines, monthLines, prevMonthLines, yearLines, allLines] = await Promise.all([
      getPostedLinesForPeriod(ctx, today, today),
      getPostedLinesForPeriod(ctx, monthStart, monthEnd),
      getPostedLinesForPeriod(ctx, prevMonthStart, prevMonthEnd),
      getPostedLinesForPeriod(ctx, yearStart, yearEnd),
      getPostedLinesForPeriod(ctx, allTimeStart, today),
    ]);

    const { rev: todayRev } = sumRevAndExp(todayLines, incomeIds, expenseIds);
    const { rev: monthRev, exp: monthExpenses } = sumRevAndExp(monthLines, incomeIds, expenseIds);
    const { rev: prevMonthRev } = sumRevAndExp(prevMonthLines, incomeIds, expenseIds);
    const { rev: yearRev } = sumRevAndExp(yearLines, incomeIds, expenseIds);
    const { rev: allRev } = sumRevAndExp(allLines, incomeIds, expenseIds);

    const monthChange = prevMonthRev > 0 ? ((monthRev - prevMonthRev) / prevMonthRev) * 100 : null;

    // Transaction count still reflects sales activity (a count, not money).
    const sales = await ctx.db.query("sales").collect();
    const totalSales = sales.filter((s) => s.status !== "refunded").length;

    return {
      todayRev: r2(todayRev),
      monthRev: r2(monthRev),
      yearRev: r2(yearRev),
      allRev: r2(allRev),
      monthChange,
      monthExpenses: r2(monthExpenses),
      monthNetProfit: r2(monthRev - monthExpenses),
      totalSales,
    };
  },
});

// ── Fleet & asset costs ───────────────────────────────────────────────────────

export const operationalCosts = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const maintenanceLogs = await ctx.db.query("maintenanceLogs").collect();
    const fuelLogs = await ctx.db.query("fuelLogs").collect();
    const assetLogs = await ctx.db.query("assetLogs").collect();
    const expenses = await ctx.db.query("expenses").collect();

    return {
      vehicleMaintenance: maintenanceLogs.reduce((s, l) => s + (l.cost ?? 0), 0),
      vehicleFuel: fuelLogs.reduce((s, l) => s + l.totalCost, 0),
      assetMaintenance: assetLogs.reduce((s, l) => s + (l.cost ?? 0), 0),
      totalExpenses: expenses.reduce((s, e) => s + e.amount, 0),
    };
  },
});

// ── Accounts Receivable summary ───────────────────────────────────────────────

export const receivableSummary = query({
  args: {},
  handler: async (ctx): Promise<{ totalOutstanding: number; overdueCount: number; totalCount: number }> => {
    await requireAuth(ctx);
    const today = new Date().toISOString().split("T")[0];
    const invoices = await ctx.db.query("invoices").collect();
    const unpaid = invoices.filter((i) => i.status === "sent" || i.status === "overdue" || i.status === "partially_paid");
    const totalOutstanding = unpaid.reduce((s, i) => s + ((i.totalAmount ?? 0) - (i.amountPaid ?? 0)), 0);
    const overdueCount = unpaid.filter((i) => i.dueDate && i.dueDate < today).length;
    return {
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      overdueCount,
      totalCount: unpaid.length,
    };
  },
});
