import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { ConvexError } from "convex/values";

// ─── Budgets CRUD ──────────────────────────────────────────────

export const list = query({
  args: { period: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    if (args.period) {
      return await ctx.db
        .query("budgets")
        .withIndex("by_period", (q) => q.eq("period", args.period!))
        .collect();
    }
    return await ctx.db.query("budgets").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("monthly"), v.literal("quarterly"), v.literal("yearly")),
    period: v.string(),
    accountId: v.optional(v.id("accounts")),
    department: v.optional(v.string()),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    return await ctx.db.insert("budgets", { ...args, createdBy: user._id });
  },
});

export const update = mutation({
  args: {
    id: v.id("budgets"),
    name: v.optional(v.string()),
    amount: v.optional(v.number()),
    notes: v.optional(v.string()),
    department: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("budgets") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    await ctx.db.delete(args.id);
  },
});

// ─── Budget vs Actual ──────────────────────────────────────────

export const getBudgetVsActual = query({
  args: { period: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_period", (q) => q.eq("period", args.period))
      .collect();

    // Get actual expenses for the period
    const expenses = await ctx.db.query("expenses").collect();
    const periodExpenses = expenses.filter((e) => e.date.startsWith(args.period));

    // Get journal entries for the period
    const journalEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const periodEntries = journalEntries.filter((je) => je.date.startsWith(args.period));

    const periodEntryIds = new Set(periodEntries.map((e) => e._id));
    const allLines = await ctx.db.query("journalLines").collect();
    const periodLines = allLines.filter((l) => periodEntryIds.has(l.journalEntryId));

    return budgets.map((budget) => {
      let actual = 0;

      if (budget.accountId) {
        // Sum debits to expense accounts from journal lines
        const accountLines = periodLines.filter((l) => l.accountId === budget.accountId);
        actual = accountLines.reduce((sum, l) => sum + l.debit - l.credit, 0);
      } else if (budget.department) {
        // Sum expenses by department (employees linked to department)
        actual = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
      }

      const variance = budget.amount - actual;
      const variancePercent = budget.amount > 0 ? (variance / budget.amount) * 100 : 0;

      return {
        ...budget,
        actual: Math.abs(actual),
        variance,
        variancePercent: Math.round(variancePercent * 10) / 10,
        status: variance >= 0 ? "under" as const : "over" as const,
      };
    });
  },
});

// ─── Cash Flow Forecast ────────────────────────────────────────

export const getCashFlowForecast = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get current cash position from real bank/cash ledger accounts
    const bankAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "bank"))
      .collect();
    const totalBalance = bankAccounts
      .filter((a) => a.isActive)
      .reduce((sum, b) => sum + b.balance, 0);

    // Get upcoming receivables (unpaid invoices)
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "sent"))
      .collect();
    const partialInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "partially_paid"))
      .collect();
    const allReceivables = [...invoices, ...partialInvoices];

    // Get upcoming payables (unpaid bills)
    const unpaidBills = await ctx.db
      .query("bills")
      .withIndex("by_status", (q) => q.eq("status", "unpaid"))
      .collect();

    // Build 6-month forecast
    const now = new Date();
    const forecast: Array<{
      month: string;
      inflow: number;
      outflow: number;
      netCash: number;
      cumulativeBalance: number;
    }> = [];

    let runningBalance = totalBalance;

    for (let i = 0; i < 6; i++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;

      // Receivables due this month
      const monthInflow = allReceivables
        .filter((inv) => inv.dueDate.startsWith(monthStr))
        .reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);

      // Payables due this month
      const monthOutflow = unpaidBills
        .filter((bill) => bill.dueDate.startsWith(monthStr))
        .reduce((sum, bill) => sum + bill.amount, 0);

      const netCash = monthInflow - monthOutflow;
      runningBalance += netCash;

      forecast.push({
        month: monthStr,
        inflow: Math.round(monthInflow * 100) / 100,
        outflow: Math.round(monthOutflow * 100) / 100,
        netCash: Math.round(netCash * 100) / 100,
        cumulativeBalance: Math.round(runningBalance * 100) / 100,
      });
    }

    return {
      currentBalance: totalBalance,
      totalReceivables: allReceivables.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0),
      totalPayables: unpaidBills.reduce((sum, bill) => sum + bill.amount, 0),
      forecast,
    };
  },
});

// ─── Budget Templates ──────────────────────────────────────────

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db.query("budgetTemplates").collect();
  },
});

export const createTemplate = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    items: v.array(v.object({
      accountId: v.optional(v.id("accounts")),
      department: v.optional(v.string()),
      amount: v.number(),
      label: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    return await ctx.db.insert("budgetTemplates", { ...args, createdBy: user._id });
  },
});

export const deleteTemplate = mutation({
  args: { id: v.id("budgetTemplates") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.delete(args.id);
  },
});

export const applyTemplate = mutation({
  args: {
    templateId: v.id("budgetTemplates"),
    period: v.string(),
    type: v.union(v.literal("monthly"), v.literal("quarterly"), v.literal("yearly")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new ConvexError({ message: "Template not found", code: "NOT_FOUND" });

    for (const item of template.items) {
      await ctx.db.insert("budgets", {
        name: item.label,
        type: args.type,
        period: args.period,
        accountId: item.accountId,
        department: item.department,
        amount: item.amount,
        createdBy: user._id,
      });
    }
  },
});
