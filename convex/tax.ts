import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { ConvexError } from "convex/values";

// ─── Tax Settings ─────────────────────────────────────────────

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const settings = await ctx.db.query("taxSettings").first();
    return settings;
  },
});

export const saveSettings = mutation({
  args: {
    isEnabled: v.boolean(),
    country: v.string(),
    taxLabel: v.string(),
    defaultTaxRate: v.number(),
    pricingMode: v.union(v.literal("exclusive"), v.literal("inclusive")),
    taxRegistrationNumber: v.optional(v.string()),
    fiscalYearStart: v.optional(v.string()),
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

    const existing = await ctx.db.query("taxSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedBy: user._id });
      return existing._id;
    }
    return await ctx.db.insert("taxSettings", { ...args, updatedBy: user._id });
  },
});

// ─── Tax Rates ─────────────────────────────────────────────────

export const listRates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db.query("taxRates").collect();
  },
});

export const getActiveRates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("taxRates")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const createRate = mutation({
  args: {
    name: v.string(),
    rate: v.number(),
    category: v.union(
      v.literal("standard"),
      v.literal("reduced"),
      v.literal("zero"),
      v.literal("exempt")
    ),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    appliesTo: v.optional(v.union(
      v.literal("goods"),
      v.literal("services"),
      v.literal("both")
    )),
    country: v.optional(v.string()),
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

    // If this rate is set as default, unset others
    if (args.isDefault) {
      const existing = await ctx.db
        .query("taxRates")
        .collect();
      for (const rate of existing) {
        if (rate.isDefault) {
          await ctx.db.patch(rate._id, { isDefault: false });
        }
      }
    }

    return await ctx.db.insert("taxRates", {
      ...args,
      isActive: true,
    });
  },
});

export const updateRate = mutation({
  args: {
    id: v.id("taxRates"),
    name: v.optional(v.string()),
    rate: v.optional(v.number()),
    category: v.optional(v.union(
      v.literal("standard"),
      v.literal("reduced"),
      v.literal("zero"),
      v.literal("exempt")
    )),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    appliesTo: v.optional(v.union(
      v.literal("goods"),
      v.literal("services"),
      v.literal("both")
    )),
    country: v.optional(v.string()),
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
    const existing = await ctx.db.get(id);
    if (!existing) throw new ConvexError({ message: "Tax rate not found", code: "NOT_FOUND" });

    // If setting as default, unset others
    if (updates.isDefault) {
      const allRates = await ctx.db.query("taxRates").collect();
      for (const rate of allRates) {
        if (rate._id !== id && rate.isDefault) {
          await ctx.db.patch(rate._id, { isDefault: false });
        }
      }
    }

    await ctx.db.patch(id, updates);
  },
});

export const deleteRate = mutation({
  args: { id: v.id("taxRates") },
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

// ─── Tax Transactions ──────────────────────────────────────────

export const recordTaxTransaction = mutation({
  args: {
    date: v.string(),
    type: v.union(v.literal("collected"), v.literal("paid")),
    taxRateId: v.id("taxRates"),
    taxAmount: v.number(),
    netAmount: v.number(),
    grossAmount: v.number(),
    referenceType: v.union(
      v.literal("invoice"),
      v.literal("sale"),
      v.literal("purchase_order"),
      v.literal("bill"),
      v.literal("expense")
    ),
    referenceId: v.string(),
    referenceNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    return await ctx.db.insert("taxTransactions", {
      ...args,
      recordedBy: user._id,
    });
  },
});

export const getTransactionsByPeriod = query({
  args: { period: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    return await ctx.db
      .query("taxTransactions")
      .withIndex("by_period", (q) => q.eq("period", args.period))
      .collect();
  },
});

export const getTaxSummary = query({
  args: { period: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const transactions = await ctx.db
      .query("taxTransactions")
      .withIndex("by_period", (q) => q.eq("period", args.period))
      .collect();

    let totalCollected = 0;
    let totalPaid = 0;

    for (const tx of transactions) {
      if (tx.type === "collected") {
        totalCollected += tx.taxAmount;
      } else {
        totalPaid += tx.taxAmount;
      }
    }

    return {
      period: args.period,
      totalCollected,
      totalPaid,
      netLiability: totalCollected - totalPaid,
      transactionCount: transactions.length,
    };
  },
});

// ─── Seed default tax rates ──────────────────────────────────

export const seedDefaultRates = mutation({
  args: { country: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const existing = await ctx.db.query("taxRates").collect();
    if (existing.length > 0) return;

    type RateConfig = {
      name: string;
      rate: number;
      category: "standard" | "reduced" | "zero" | "exempt";
      isDefault: boolean;
      appliesTo: "goods" | "services" | "both";
    };

    const countryRates: Record<string, RateConfig[]> = {
      QA: [
        { name: "Standard (0% - No VAT)", rate: 0, category: "zero", isDefault: true, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      AE: [
        { name: "Standard VAT (5%)", rate: 5, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      SA: [
        { name: "Standard VAT (15%)", rate: 15, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      PK: [
        { name: "Standard GST (18%)", rate: 18, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Reduced GST (5%)", rate: 5, category: "reduced", isDefault: false, appliesTo: "goods" },
        { name: "Further Tax (3%)", rate: 3, category: "reduced", isDefault: false, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      IN: [
        { name: "GST 28% (Luxury)", rate: 28, category: "standard", isDefault: false, appliesTo: "both" },
        { name: "GST 18% (Standard)", rate: 18, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "GST 12%", rate: 12, category: "reduced", isDefault: false, appliesTo: "both" },
        { name: "GST 5%", rate: 5, category: "reduced", isDefault: false, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      BH: [
        { name: "Standard VAT (10%)", rate: 10, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      KW: [
        { name: "Standard (0% - No VAT)", rate: 0, category: "zero", isDefault: true, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      OM: [
        { name: "Standard VAT (5%)", rate: 5, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      EG: [
        { name: "Standard VAT (14%)", rate: 14, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Reduced VAT (5%)", rate: 5, category: "reduced", isDefault: false, appliesTo: "goods" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      JO: [
        { name: "Standard GST (16%)", rate: 16, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "Special Rate (4%)", rate: 4, category: "reduced", isDefault: false, appliesTo: "goods" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      US: [
        { name: "No Federal Tax (State-level)", rate: 0, category: "zero", isDefault: true, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
      CA: [
        { name: "Federal GST (5%)", rate: 5, category: "standard", isDefault: true, appliesTo: "both" },
        { name: "HST Ontario (13%)", rate: 13, category: "standard", isDefault: false, appliesTo: "both" },
        { name: "HST Nova Scotia (15%)", rate: 15, category: "standard", isDefault: false, appliesTo: "both" },
        { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
        { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
      ],
    };

    const defaultRates: RateConfig[] = [
      { name: "Standard Tax", rate: 10, category: "standard", isDefault: true, appliesTo: "both" },
      { name: "Reduced Tax", rate: 5, category: "reduced", isDefault: false, appliesTo: "goods" },
      { name: "Zero-Rated", rate: 0, category: "zero", isDefault: false, appliesTo: "both" },
      { name: "Exempt", rate: 0, category: "exempt", isDefault: false, appliesTo: "both" },
    ];

    const rates = countryRates[args.country] ?? defaultRates;

    for (const rate of rates) {
      await ctx.db.insert("taxRates", {
        ...rate,
        isActive: true,
        country: args.country,
      });
    }
  },
});

// ─── Tax Calculation Helper (used in frontend) ─────────────────

export const calculateTax = query({
  args: {
    amount: v.number(),
    taxRateId: v.optional(v.id("taxRates")),
    pricingMode: v.optional(v.union(v.literal("exclusive"), v.literal("inclusive"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const settings = await ctx.db.query("taxSettings").first();
    if (!settings || !settings.isEnabled) {
      return { netAmount: args.amount, taxAmount: 0, grossAmount: args.amount, rate: 0 };
    }

    let rate = settings.defaultTaxRate;
    if (args.taxRateId) {
      const taxRate = await ctx.db.get(args.taxRateId);
      if (taxRate) rate = taxRate.rate;
    }

    const mode = args.pricingMode ?? settings.pricingMode;
    let netAmount: number;
    let taxAmount: number;
    let grossAmount: number;

    if (mode === "inclusive") {
      // Price already includes tax
      grossAmount = args.amount;
      netAmount = args.amount / (1 + rate / 100);
      taxAmount = grossAmount - netAmount;
    } else {
      // Price excludes tax
      netAmount = args.amount;
      taxAmount = netAmount * (rate / 100);
      grossAmount = netAmount + taxAmount;
    }

    return {
      netAmount: Math.round(netAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      grossAmount: Math.round(grossAmount * 100) / 100,
      rate,
    };
  },
});
