/**
 * Formal Profit & Loss (Income Statement) report query.
 * Generates P&L from chart of accounts and posted journal entries for a given period,
 * with comparison to the previous period.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

type AccountLine = {
  accountId: string;
  code: string;
  name: string;
  amount: number;
  previousAmount: number;
  change: number;
  changePercent: number | null;
};

type AccountGroup = {
  groupName: string;
  accounts: AccountLine[];
  total: number;
  previousTotal: number;
};

export const getProfitAndLoss = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args): Promise<{
    period: { start: string; end: string };
    previousPeriod: { start: string; end: string };
    revenue: AccountGroup;
    costOfGoodsSold: AccountGroup;
    grossProfit: number;
    previousGrossProfit: number;
    operatingExpenses: AccountGroup;
    netProfit: number;
    previousNetProfit: number;
    grossProfitMargin: number | null;
    netProfitMargin: number | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    // Calculate previous period (same duration, immediately before)
    const startMs = new Date(args.startDate).getTime();
    const endMs = new Date(args.endDate).getTime();
    const durationMs = endMs - startMs;
    const prevStart = new Date(startMs - durationMs).toISOString().split("T")[0];
    const prevEnd = new Date(startMs - 1).toISOString().split("T")[0]; // day before current start

    // Get all accounts
    const allAccounts = await ctx.db.query("accounts").collect();

    // Revenue/Income accounts
    const revenueAccounts = allAccounts.filter((a) =>
      (a.type === "income" || a.type === "other_income" || a.type === "revenue") && a.isActive
    );
    // COGS accounts
    const cogsAccounts = allAccounts.filter(
      (a) => a.type === "cost_of_goods_sold" && a.isActive
    );
    // Operating expense accounts (excludes COGS)
    const operatingExpenseAccounts = allAccounts.filter(
      (a) => (a.type === "expense" || a.type === "other_expense") && a.isActive
    );

    // Get all posted journal entries in the current period
    const allEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();

    const currentPeriodEntries = allEntries.filter(
      (e) => e.date >= args.startDate && e.date <= args.endDate
    );
    const previousPeriodEntries = allEntries.filter(
      (e) => e.date >= prevStart && e.date <= prevEnd
    );

    // Get all journal lines for both periods
    const currentEntryIds = new Set(currentPeriodEntries.map((e) => e._id));
    const previousEntryIds = new Set(previousPeriodEntries.map((e) => e._id));

    const allJournalLines = await ctx.db.query("journalLines").collect();

    const currentLines = allJournalLines.filter((l) => currentEntryIds.has(l.journalEntryId));
    const previousLines = allJournalLines.filter((l) => previousEntryIds.has(l.journalEntryId));

    // Helper: calculate account balance for a set of lines
    function calcAccountBalance(accountId: string, lines: typeof allJournalLines, account: typeof allAccounts[0]): number {
      const accountLines = lines.filter((l) => l.accountId === accountId);
      let total = 0;
      for (const line of accountLines) {
        if (account.type === "revenue" || account.type === "income" || account.type === "other_income") {
          // Revenue/Income: credits increase, debits decrease
          total += line.credit - line.debit;
        } else {
          // Expense/COGS: debits increase, credits decrease
          total += line.debit - line.credit;
        }
      }
      return total;
    }

    // Build revenue group
    const revenueLines: AccountLine[] = revenueAccounts
      .map((acc) => {
        const amount = calcAccountBalance(acc._id, currentLines, acc);
        const previousAmount = calcAccountBalance(acc._id, previousLines, acc);
        const change = amount - previousAmount;
        const changePercent = previousAmount !== 0 ? (change / Math.abs(previousAmount)) * 100 : null;
        return {
          accountId: acc._id,
          code: acc.code,
          name: acc.name,
          amount,
          previousAmount,
          change,
          changePercent,
        };
      })
      .filter((a) => a.amount !== 0 || a.previousAmount !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    const revenueTotal = revenueLines.reduce((sum, a) => sum + a.amount, 0);
    const prevRevenueTotal = revenueLines.reduce((sum, a) => sum + a.previousAmount, 0);

    // Build COGS group
    const cogsLines: AccountLine[] = cogsAccounts
      .map((acc) => {
        const amount = calcAccountBalance(acc._id, currentLines, acc);
        const previousAmount = calcAccountBalance(acc._id, previousLines, acc);
        const change = amount - previousAmount;
        const changePercent = previousAmount !== 0 ? (change / Math.abs(previousAmount)) * 100 : null;
        return {
          accountId: acc._id,
          code: acc.code,
          name: acc.name,
          amount,
          previousAmount,
          change,
          changePercent,
        };
      })
      .filter((a) => a.amount !== 0 || a.previousAmount !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    const cogsTotal = cogsLines.reduce((sum, a) => sum + a.amount, 0);
    const prevCogsTotal = cogsLines.reduce((sum, a) => sum + a.previousAmount, 0);

    // Build operating expenses group
    const opExpLines: AccountLine[] = operatingExpenseAccounts
      .map((acc) => {
        const amount = calcAccountBalance(acc._id, currentLines, acc);
        const previousAmount = calcAccountBalance(acc._id, previousLines, acc);
        const change = amount - previousAmount;
        const changePercent = previousAmount !== 0 ? (change / Math.abs(previousAmount)) * 100 : null;
        return {
          accountId: acc._id,
          code: acc.code,
          name: acc.name,
          amount,
          previousAmount,
          change,
          changePercent,
        };
      })
      .filter((a) => a.amount !== 0 || a.previousAmount !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    const opExpTotal = opExpLines.reduce((sum, a) => sum + a.amount, 0);
    const prevOpExpTotal = opExpLines.reduce((sum, a) => sum + a.previousAmount, 0);

    // Calculate P&L totals
    const grossProfit = revenueTotal - cogsTotal;
    const previousGrossProfit = prevRevenueTotal - prevCogsTotal;
    const netProfit = grossProfit - opExpTotal;
    const previousNetProfit = previousGrossProfit - prevOpExpTotal;

    const grossProfitMargin = revenueTotal !== 0 ? (grossProfit / revenueTotal) * 100 : null;
    const netProfitMargin = revenueTotal !== 0 ? (netProfit / revenueTotal) * 100 : null;

    return {
      period: { start: args.startDate, end: args.endDate },
      previousPeriod: { start: prevStart, end: prevEnd },
      revenue: {
        groupName: "Revenue",
        accounts: revenueLines,
        total: revenueTotal,
        previousTotal: prevRevenueTotal,
      },
      costOfGoodsSold: {
        groupName: "Cost of Goods Sold",
        accounts: cogsLines,
        total: cogsTotal,
        previousTotal: prevCogsTotal,
      },
      grossProfit,
      previousGrossProfit,
      operatingExpenses: {
        groupName: "Operating Expenses",
        accounts: opExpLines,
        total: opExpTotal,
        previousTotal: prevOpExpTotal,
      },
      netProfit,
      previousNetProfit,
      grossProfitMargin,
      netProfitMargin,
    };
  },
});
