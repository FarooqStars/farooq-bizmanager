import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { nextNumber } from "./lib/docNumber.ts";
import { applyBalanceDelta, getControlAccounts, postBalancedEntry, findOrCreateAccount, round2 } from "./lib/ledger.ts";
import { assertOwner, getCurrentUser } from "./lib/auth.ts";
import { aggregatePostedLines, netIncomeFromBalances } from "./lib/ledgerReports.ts";
import { YEAR_END_CLOSE_SOURCE, VEHICLE_PURCHASE_SOURCE, ASSET_PURCHASE_SOURCE } from "./lib/sourceTypes.ts";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
  db: unknown;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// Default normal sides for account types
const NORMAL_SIDES: Record<string, "debit" | "credit"> = {
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

// Account type categories for Balance Sheet and P&L grouping
const ASSET_TYPES = [
  "bank",
  "accounts_receivable",
  "other_current_asset",
  "fixed_asset",
  "other_asset",
  "asset",
];
const LIABILITY_TYPES = [
  "accounts_payable",
  "credit_card",
  "other_current_liability",
  "long_term_liability",
  "loan",
  "liability",
];
const EQUITY_TYPES = ["equity"];
const INCOME_TYPES = ["income", "other_income", "revenue"];
const EXPENSE_TYPES = ["cost_of_goods_sold", "expense", "other_expense"];

// ─── Account Queries ─────────────────────────────────────────

export const listAccounts = query({
  args: { type: v.optional(v.string()), activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let accounts = await ctx.db.query("accounts").collect();
    if (args.type) {
      accounts = accounts.filter((a) => a.type === args.type);
    }
    if (args.activeOnly) {
      accounts = accounts.filter((a) => a.isActive);
    }
    // Sort by code
    accounts.sort((a, b) => a.code.localeCompare(b.code));
    return accounts;
  },
});

export const getAccount = query({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const getAccountTransactions = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    // Enrich with journal entry info
    const enriched = await Promise.all(
      lines.map(async (line) => {
        const entry = await ctx.db.get(line.journalEntryId);
        return {
          ...line,
          entryNumber: entry?.entryNumber,
          date: entry?.date,
          entryDescription: entry?.description,
          entryStatus: entry?.status,
        };
      }),
    );
    return enriched.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  },
});

// ─── Account Mutations ───────────────────────────────────────

export const createAccount = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("bank"),
      v.literal("accounts_receivable"),
      v.literal("other_current_asset"),
      v.literal("fixed_asset"),
      v.literal("other_asset"),
      v.literal("asset"),
      v.literal("accounts_payable"),
      v.literal("credit_card"),
      v.literal("other_current_liability"),
      v.literal("long_term_liability"),
      v.literal("loan"),
      v.literal("liability"),
      v.literal("equity"),
      v.literal("income"),
      v.literal("other_income"),
      v.literal("cost_of_goods_sold"),
      v.literal("expense"),
      v.literal("other_expense"),
      v.literal("revenue"),
    ),
    subType: v.optional(v.string()),
    parentId: v.optional(v.id("accounts")),
    description: v.optional(v.string()),
    openingBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    // Only owner/manager can create accounts
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can manage accounts", code: "FORBIDDEN" });
    }
    // Check unique code
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) {
      throw new ConvexError({ message: "Account code already exists", code: "CONFLICT" });
    }
    // Auto-calculate balance for AR/AP accounts from real transaction data
    let initialBalance = args.openingBalance ?? 0;
    if (args.type === "accounts_receivable" && !args.openingBalance) {
      const invoices = await ctx.db.query("invoices").collect();
      initialBalance = invoices
        .filter((inv) => inv.status !== "paid" && inv.status !== "void" && inv.status !== "draft")
        .reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);
    }
    if (args.type === "accounts_payable" && !args.openingBalance) {
      const bills = await ctx.db.query("bills").collect();
      initialBalance = bills
        .filter((b) => b.status !== "paid")
        .reduce((sum, b) => sum + (b.amount - (b.amountPaid ?? 0)), 0);
    }

    const accountId = await ctx.db.insert("accounts", {
      code: args.code,
      name: args.name,
      type: args.type,
      subType: args.subType,
      parentId: args.parentId,
      description: args.description,
      isActive: true,
      balance: initialBalance,
      normalSide: NORMAL_SIDES[args.type] ?? "debit",
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:createAccount",
      resourceType: "account",
      resourceId: accountId,
      action: "account_created",
      afterValue: JSON.stringify({ code: args.code, name: args.name, type: args.type }),
      details: `Created account ${args.code} – ${args.name}`,
    });

    return accountId;
  },
});

export const updateAccount = mutation({
  args: {
    id: v.id("accounts"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("bank"),
        v.literal("accounts_receivable"),
        v.literal("other_current_asset"),
        v.literal("fixed_asset"),
        v.literal("other_asset"),
        v.literal("asset"),
        v.literal("accounts_payable"),
        v.literal("credit_card"),
        v.literal("other_current_liability"),
        v.literal("long_term_liability"),
        v.literal("loan"),
        v.literal("liability"),
        v.literal("equity"),
        v.literal("income"),
        v.literal("other_income"),
        v.literal("cost_of_goods_sold"),
        v.literal("expense"),
        v.literal("other_expense"),
        v.literal("revenue"),
      ),
    ),
    subType: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    parentId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    // Only owner/manager can edit accounts
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can manage accounts", code: "FORBIDDEN" });
    }
    const { id, ...updates } = args;
    const account = await ctx.db.get(id);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });

    // Block code change on accounts with transactions (renaming is always free)
    const changingCode = updates.code !== undefined && updates.code !== account.code;
    const changingType = updates.type !== undefined && updates.type !== account.type;
    if (changingCode || changingType) {
      const existingLine = await ctx.db
        .query("journalLines")
        .withIndex("by_account", (q) => q.eq("accountId", id))
        .first();
      if (existingLine) {
        if (changingType) {
          throw new ConvexError({
            message: "Cannot change the type of an account that has transactions. Create a new account and merge instead.",
            code: "CONFLICT",
          });
        }
        throw new ConvexError({
          message: "Cannot renumber an account that has transactions. Renaming is still allowed.",
          code: "CONFLICT",
        });
      }
    }

    // If changing code, check uniqueness
    if (updates.code && updates.code !== account.code) {
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", updates.code!))
        .first();
      if (existing) throw new ConvexError({ message: `Account code ${updates.code} already exists`, code: "CONFLICT" });
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) cleaned[key] = val;
    }
    // If type is changing, update normalSide accordingly
    if (updates.type) {
      cleaned.normalSide = NORMAL_SIDES[updates.type] ?? "debit";
    }
    const before = JSON.stringify(account);
    await ctx.db.patch(id, cleaned);
    const after = await ctx.db.get(id);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:updateAccount",
      resourceType: "account",
      resourceId: id,
      action: "account_updated",
      beforeValue: before,
      afterValue: JSON.stringify(after),
      details: `Updated account ${account.code} – ${account.name}`,
    });
  },
});

export const deleteAccount = mutation({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    // Only owner/manager can delete accounts
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can manage accounts", code: "FORBIDDEN" });
    }
    const account = await ctx.db.get(args.id);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    // Check if account has transactions
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_account", (q) => q.eq("accountId", args.id))
      .first();
    if (lines) {
      throw new ConvexError({
        message: "Cannot delete account with transactions. Deactivate it instead.",
        code: "CONFLICT",
      });
    }
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:deleteAccount",
      resourceType: "account",
      resourceId: args.id,
      action: "account_deleted",
      beforeValue: JSON.stringify(account),
      details: `Deleted account ${account.code} – ${account.name}`,
    });
    await ctx.db.delete(args.id);
  },
});

// ─── Seed Default Chart of Accounts ─────────────────────────

export const seedDefaultAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    // Check if already seeded
    const existing = await ctx.db.query("accounts").first();
    if (existing) {
      throw new ConvexError({
        message: "Accounts already exist. Clear them first to re-seed.",
        code: "CONFLICT",
      });
    }

    const defaults = [
      // Bank Accounts (bank)
      { code: "1000", name: "Cash", type: "bank" as const, subType: "Cash" },
      { code: "1010", name: "Bank Account - Primary", type: "bank" as const, subType: "Checking" },
      { code: "1020", name: "Bank Account - Savings", type: "bank" as const, subType: "Savings" },
      // Accounts Receivable
      {
        code: "1100",
        name: "Accounts Receivable",
        type: "accounts_receivable" as const,
        subType: "Trade Receivables",
      },
      // Other Current Assets
      {
        code: "1200",
        name: "Inventory",
        type: "other_current_asset" as const,
        subType: "Inventory",
      },
      {
        code: "1300",
        name: "Prepaid Expenses",
        type: "other_current_asset" as const,
        subType: "Prepaid",
      },
      // Fixed Assets
      {
        code: "1500",
        name: "Fixed Assets",
        type: "fixed_asset" as const,
        subType: "Property & Equipment",
      },
      {
        code: "1510",
        name: "Furniture & Equipment",
        type: "fixed_asset" as const,
        subType: "Furniture",
      },
      { code: "1520", name: "Vehicles", type: "fixed_asset" as const, subType: "Vehicles" },
      // ── Asset Disposal ────────────────────────────────────────────────────────
      { code: "7100", name: "Loss on Asset Disposal", type: "other_expense" as const, subType: "Asset Disposal Loss" },
      { code: "8100", name: "Gain on Asset Disposal", type: "other_income" as const, subType: "Asset Disposal Gain" },
      {
        code: "1600",
        name: "Accumulated Depreciation",
        type: "fixed_asset" as const,
        subType: "Depreciation",
      },
      // Accounts Payable
      {
        code: "2000",
        name: "Accounts Payable",
        type: "accounts_payable" as const,
        subType: "Trade Payables",
      },
      // Credit Card
      {
        code: "2050",
        name: "Credit Card Payable",
        type: "credit_card" as const,
        subType: "Credit Card",
      },
      // Other Current Liabilities
      {
        code: "2100",
        name: "Accrued Expenses",
        type: "other_current_liability" as const,
        subType: "Accruals",
      },
      {
        code: "2200",
        name: "Salaries Payable",
        type: "other_current_liability" as const,
        subType: "Payroll",
      },
      {
        code: "2300",
        name: "Tax Payable",
        type: "other_current_liability" as const,
        subType: "Taxes",
      },
      // Loans
      { code: "2500", name: "Short-term Loan", type: "loan" as const, subType: "Short-term" },
      { code: "2600", name: "Long-term Loan", type: "loan" as const, subType: "Long-term" },
      // Equity
      { code: "3000", name: "Owner's Equity", type: "equity" as const, subType: "Equity" },
      {
        code: "3100",
        name: "Retained Earnings",
        type: "equity" as const,
        subType: "Retained Earnings",
      },
      { code: "3200", name: "Owner's Drawings", type: "equity" as const, subType: "Drawings" },
      // Income
      { code: "4000", name: "Sales Revenue", type: "income" as const, subType: "Sales" },
      { code: "4100", name: "Service Revenue", type: "income" as const, subType: "Services" },
      // Other Income
      { code: "4200", name: "Interest Income", type: "other_income" as const, subType: "Interest" },
      {
        code: "4300",
        name: "Other Income",
        type: "other_income" as const,
        subType: "Miscellaneous",
      },
      // Cost of Goods Sold
      {
        code: "5000",
        name: "Cost of Goods Sold",
        type: "cost_of_goods_sold" as const,
        subType: "Materials",
      },
      {
        code: "5010",
        name: "Purchases",
        type: "cost_of_goods_sold" as const,
        subType: "Purchases",
      },
      {
        code: "5020",
        name: "Freight & Delivery",
        type: "cost_of_goods_sold" as const,
        subType: "Shipping",
      },
      // Expenses
      { code: "6000", name: "Salaries & Wages", type: "expense" as const, subType: "Payroll" },
      { code: "6100", name: "Rent Expense", type: "expense" as const, subType: "Occupancy" },
      { code: "6200", name: "Utilities", type: "expense" as const, subType: "Utilities" },
      { code: "6300", name: "Office Supplies", type: "expense" as const, subType: "Office" },
      {
        code: "6400",
        name: "Depreciation Expense",
        type: "expense" as const,
        subType: "Depreciation",
      },
      { code: "6500", name: "Insurance", type: "expense" as const, subType: "Insurance" },
      {
        code: "6600",
        name: "Marketing & Advertising",
        type: "expense" as const,
        subType: "Marketing",
      },
      { code: "6700", name: "Vehicle Expenses", type: "expense" as const, subType: "Vehicle" },
      { code: "6800", name: "Bank Charges", type: "expense" as const, subType: "Bank Fees" },
      // ── Payroll accounts (added with payroll ledger integration) ──────────
      { code: "6010", name: "Employer Social Insurance Expense", type: "expense" as const, subType: "Payroll" },
      { code: "6020", name: "End-of-Service Expense", type: "expense" as const, subType: "Payroll" },
      { code: "2250", name: "Social Insurance Payable", type: "other_current_liability" as const, subType: "Payroll" },
      { code: "2260", name: "Payroll Deductions Payable", type: "other_current_liability" as const, subType: "Payroll" },
      { code: "2700", name: "End-of-Service Benefits Payable", type: "long_term_liability" as const, subType: "Payroll" },
      // Other Expense
      {
        code: "7000",
        name: "Interest Expense",
        type: "other_expense" as const,
        subType: "Interest",
      },
      { code: "7100", name: "Loss on Disposal", type: "other_expense" as const, subType: "Losses" },
    ];

    for (const acc of defaults) {
      // Idempotent: skip if an account with this code already exists.
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", acc.code))
        .first();
      if (existing) continue;
      await ctx.db.insert("accounts", {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        isActive: true,
        balance: 0,
        normalSide: NORMAL_SIDES[acc.type],
      });
    }
    return defaults.length;
  },
});

/**
 * Ensures all system-required accounts exist without touching existing ones.
 * Safe to call at any time — idempotent by account code.
 * Call this on app init to guarantee new accounts added after the initial seed appear.
 */
export const ensureMissingAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const required: Array<{
      code: string;
      name: string;
      type: "bank" | "accounts_receivable" | "other_current_asset" | "fixed_asset" | "other_asset" | "asset" | "accounts_payable" | "credit_card" | "other_current_liability" | "long_term_liability" | "loan" | "liability" | "equity" | "income" | "other_income" | "cost_of_goods_sold" | "expense" | "other_expense" | "revenue";
      subType: string;
      normalSide?: "debit" | "credit";
    }> = [
      // ── Fleet / Vehicle ───────────────────────────────────────────────────────
      { code: "6300", name: "Vehicle Fuel Expense", type: "expense", subType: "Vehicle Fuel" },
      { code: "6310", name: "Vehicle Maintenance Expense", type: "expense", subType: "Vehicle Maintenance" },
      // ── Assets & Depreciation ────────────────────────────────────────────────
      { code: "6400", name: "Depreciation Expense", type: "expense", subType: "Depreciation" },
      { code: "1490", name: "Accumulated Depreciation", type: "other_asset", subType: "Accumulated Depreciation", normalSide: "credit" },
      { code: "1500", name: "Fixed Assets", type: "fixed_asset", subType: "Property & Equipment" },
      { code: "1510", name: "Furniture & Equipment", type: "fixed_asset", subType: "Furniture" },
      { code: "1520", name: "Vehicles", type: "fixed_asset", subType: "Vehicles" },
      // ── Asset Disposal ────────────────────────────────────────────────────────
      { code: "7100", name: "Loss on Asset Disposal", type: "other_expense" as const, subType: "Asset Disposal Loss" },
      { code: "8100", name: "Gain on Asset Disposal", type: "other_income" as const, subType: "Asset Disposal Gain" },
      // ── Payroll ───────────────────────────────────────────────────────────────
      { code: "6010", name: "Employer Social Insurance Expense", type: "expense", subType: "Payroll" },
      { code: "6020", name: "End-of-Service Expense", type: "expense", subType: "Payroll" },
      { code: "2250", name: "Social Insurance Payable", type: "other_current_liability", subType: "Payroll" },
      { code: "2260", name: "Payroll Deductions Payable", type: "other_current_liability", subType: "Payroll" },
      { code: "2700", name: "End-of-Service Benefits Payable", type: "long_term_liability", subType: "Payroll" },
    ];

    let added = 0;
    for (const acc of required) {
      const existing = await ctx.db
        .query("accounts")
        .withIndex("by_code", (q) => q.eq("code", acc.code))
        .first();
      if (existing) continue;
      await ctx.db.insert("accounts", {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subType: acc.subType,
        isActive: true,
        balance: 0,
        normalSide: acc.normalSide ?? NORMAL_SIDES[acc.type] ?? "debit",
      });
      added++;
    }
    return { added };
  },
});

/**
 * Backfill GL purchase entries for all existing assets and vehicles that have a
 * purchasePrice but no journal entry yet. Idempotent — already-posted entries
 * (matched by sourceId = document _id) are skipped.
 */
export const backfillPurchaseEntries = mutation({
  args: {},
  handler: async (ctx): Promise<{ postedAssets: number; postedVehicles: number; skipped: number }> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can run backfill", code: "FORBIDDEN" });
    }

    // Collect all posted sourceIds so we can skip already-posted items
    const existingEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const postedSourceIds = new Set(
      existingEntries
        .filter((e) => e.sourceType === VEHICLE_PURCHASE_SOURCE || e.sourceType === ASSET_PURCHASE_SOURCE)
        .map((e) => e.sourceId),
    );

    const apAccount = await findOrCreateAccount(ctx, {
      type: "accounts_payable",
      code: "2000",
      name: "Accounts Payable",
      subType: "Trade Payables",
      matchAnyOfType: true,
    });

    let postedAssets = 0;
    let postedVehicles = 0;
    let skipped = 0;

    // ── Assets ────────────────────────────────────────────────────────────────
    const assets = await ctx.db.query("assets").collect();
    const fixedAssetAccount = await findOrCreateAccount(ctx, {
      type: "fixed_asset",
      code: "1500",
      name: "Fixed Assets",
      subType: "Property & Equipment",
      matchSubType: "Property & Equipment",
    });

    for (const asset of assets) {
      if (!asset.purchasePrice || asset.purchasePrice <= 0) { skipped++; continue; }
      if (postedSourceIds.has(asset._id)) { skipped++; continue; }

      const cost = round2(asset.purchasePrice);
      const date = asset.purchaseDate ?? new Date(asset._creationTime).toISOString().split("T")[0];

      await postBalancedEntry(ctx, {
        date,
        description: `Asset purchase – ${asset.name}`,
        createdBy: user._id,
        sourceType: ASSET_PURCHASE_SOURCE,
        sourceId: asset._id,
        lines: [
          { accountId: fixedAssetAccount._id, debit: cost, description: asset.name },
          { accountId: apAccount._id, credit: cost, description: asset.name },
        ],
      });
      postedSourceIds.add(asset._id);
      postedAssets++;
    }

    // ── Vehicles ──────────────────────────────────────────────────────────────
    const vehicles = await ctx.db.query("vehicles").collect();
    const vehiclesAccount = await findOrCreateAccount(ctx, {
      type: "fixed_asset",
      code: "1520",
      name: "Vehicles",
      subType: "Vehicles",
      matchSubType: "Vehicles",
    });

    for (const vehicle of vehicles) {
      if (!vehicle.purchasePrice || vehicle.purchasePrice <= 0) { skipped++; continue; }
      if (postedSourceIds.has(vehicle._id)) { skipped++; continue; }

      const cost = round2(vehicle.purchasePrice);
      const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.plate})`;
      const date = vehicle.purchaseDate ?? new Date(vehicle._creationTime).toISOString().split("T")[0];

      await postBalancedEntry(ctx, {
        date,
        description: `Vehicle purchase – ${vehicleName}`,
        createdBy: user._id,
        sourceType: VEHICLE_PURCHASE_SOURCE,
        sourceId: vehicle._id,
        lines: [
          { accountId: vehiclesAccount._id, debit: cost, description: vehicleName },
          { accountId: apAccount._id, credit: cost, description: vehicleName },
        ],
      });
      postedSourceIds.add(vehicle._id);
      postedVehicles++;
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:backfillPurchaseEntries",
      resourceType: "asset",
      resourceId: "batch",
      action: "backfill_purchase_entries",
      details: `Backfill: ${postedAssets} asset(s), ${postedVehicles} vehicle(s) posted; ${skipped} skipped`,
    });

    return { postedAssets, postedVehicles, skipped };
  },
});

/**
 * Deactivate zero-balance duplicate accounts, keeping the one with the highest
 * balance (or if tied, the one with the lower/custom code the user set).
 * Idempotent — accounts already inactive are ignored.
 */
export const cleanupDuplicateAccounts = mutation({
  args: {},
  handler: async (ctx): Promise<{ deactivated: number; kept: number }> => {
    await assertOwner(ctx);
    const all = await ctx.db.query("accounts").collect();
    const active = all.filter((a) => a.isActive);

    // Group by type+subType+name
    const groups = new Map<string, typeof active>();
    for (const a of active) {
      const key = `${a.type}|${(a.subType ?? "").toLowerCase()}|${a.name.toLowerCase()}`;
      const list = groups.get(key) ?? [];
      list.push(a);
      groups.set(key, list);
    }

    let deactivated = 0;
    let kept = 0;

    for (const [, members] of groups) {
      if (members.length <= 1) continue;
      // Keep the one with the highest balance; ties broken by keeping the HIGHER code (user's custom code)
      const sorted = [...members].sort((a, b) => {
        const balDiff = Math.abs(b.balance) - Math.abs(a.balance);
        if (balDiff !== 0) return balDiff;
        // Tiebreak: prefer higher numeric code (user's custom codes tend to be higher)
        const aNum = parseInt(a.code, 10);
        const bNum = parseInt(b.code, 10);
        return (isNaN(bNum) ? 0 : bNum) - (isNaN(aNum) ? 0 : aNum);
      });
      const [keep, ...rest] = sorted;
      kept++;
      for (const dup of rest) {
        if (dup.balance !== 0) continue; // safety: never deactivate accounts with a balance
        await ctx.db.patch(dup._id, { isActive: false });
        deactivated++;
      }
    }

    return { deactivated, kept };
  },
});

export const listBankAccounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const accounts = await ctx.db.query("accounts").collect();
    return accounts.filter(
      (a) => a.isActive && (a.type === "bank" || a.subType === "Petty Cash"),
    );
  },
});

export const listJournalEntries = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let entries;
    if (args.status) {
      entries = await ctx.db
        .query("journalEntries")
        .withIndex("by_status", (q) => q.eq("status", args.status as "draft" | "posted" | "void"))
        .collect();
    } else {
      entries = await ctx.db.query("journalEntries").order("desc").collect();
    }
    return entries;
  },
});

export const getJournalEntry = query({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) return null;
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.id))
      .collect();
    // Enrich lines with account names
    const enrichedLines = await Promise.all(
      lines.map(async (line) => {
        const account = await ctx.db.get(line.accountId);
        return {
          ...line,
          accountCode: account?.code ?? "",
          accountName: account?.name ?? "Unknown",
        };
      }),
    );
    return { ...entry, lines: enrichedLines };
  },
});

// ─── Journal Entry Mutations ─────────────────────────────────

export const createJournalEntry = mutation({
  args: {
    date: v.string(),
    description: v.string(),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.array(
      v.object({
        accountId: v.id("accounts"),
        debit: v.number(),
        credit: v.number(),
        description: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Id<"journalEntries">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Single enforcement point: closing date + fiscal period status
    await enforcePostingDate(ctx, args.date);

    // Validate double-entry: total debits must equal total credits
    const totalDebit = args.lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = args.lines.reduce((sum, l) => sum + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new ConvexError({
        message: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
        code: "BAD_REQUEST",
      });
    }
    if (totalDebit === 0) {
      throw new ConvexError({
        message: "Entry must have at least one debit/credit",
        code: "BAD_REQUEST",
      });
    }

    // Generate entry number
    const allEntries = await ctx.db.query("journalEntries").collect();
    const entryNumber = nextNumber(allEntries, (e) => e.entryNumber, "JE-", 5);

    const entryId = await ctx.db.insert("journalEntries", {
      entryNumber,
      date: args.date,
      description: args.description,
      reference: args.reference,
      status: "draft",
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      createdBy: user._id,
      notes: args.notes,
    });

    for (const line of args.lines) {
      // RULE: every insert("journalLines", ...) MUST stamp both `date` and `status`.
      await ctx.db.insert("journalLines", {
        journalEntryId: entryId,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        date: args.date,
        status: "draft",
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:createJournalEntry",
      resourceType: "journalEntry",
      resourceId: entryId,
      action: "journal_entry_created",
      afterValue: JSON.stringify({ entryNumber, date: args.date, description: args.description, totalDebit, totalCredit }),
      details: `Created journal entry ${entryNumber}`,
    });

    return entryId;
  },
});

export const postJournalEntry = mutation({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const entry = await ctx.db.get(args.id);
    if (!entry) throw new ConvexError({ message: "Journal entry not found", code: "NOT_FOUND" });
    if (entry.status !== "draft") {
      throw new ConvexError({ message: "Only draft entries can be posted", code: "BAD_REQUEST" });
    }

    // Update account balances via the single ledger balance writer.
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.id))
      .collect();

    for (const line of lines) {
      await applyBalanceDelta(ctx, line.accountId, line.debit, line.credit);
    }

    // Stamp status: "posted" on every line so report indexes see them
    for (const line of lines) {
      await ctx.db.patch(line._id, { status: "posted" });
    }

    await ctx.db.patch(args.id, { status: "posted", postedAt: new Date().toISOString() });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:postJournalEntry",
      resourceType: "journalEntry",
      resourceId: args.id,
      action: "journal_entry_posted",
      beforeValue: JSON.stringify({ ...entry, status: "draft" }),
      afterValue: JSON.stringify({ ...entry, status: "posted" }),
      details: `Posted journal entry ${entry.entryNumber}`,
    });
  },
});

export const voidJournalEntry = mutation({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const entry = await ctx.db.get(args.id);
    if (!entry) throw new ConvexError({ message: "Journal entry not found", code: "NOT_FOUND" });
    const before = JSON.stringify(entry);

    // Block voiding into a closed/locked period or before the closing date
    await enforcePostingDate(ctx, entry.date);

    if (entry.status === "posted") {
      // Reverse account balances via the single ledger balance writer
      // (swap debit/credit to undo the original posting).
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.id))
        .collect();

      for (const line of lines) {
        await applyBalanceDelta(ctx, line.accountId, line.credit, line.debit);
      }
    }

    // Stamp status: "void" on every line so they are excluded from report indexes
    const allLines = await ctx.db
      .query("journalLines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.id))
      .collect();
    for (const line of allLines) {
      await ctx.db.patch(line._id, { status: "void" });
    }

    await ctx.db.patch(args.id, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:voidJournalEntry",
      resourceType: "journalEntry",
      resourceId: args.id,
      action: "journal_entry_voided",
      beforeValue: before,
      afterValue: JSON.stringify({ ...entry, status: "void" }),
      details: `Voided journal entry ${entry.entryNumber}`,
    });
  },
});

export const updateJournalEntry = mutation({
  args: {
    id: v.id("journalEntries"),
    date: v.optional(v.string()),
    description: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.optional(
      v.array(
        v.object({
          accountId: v.id("accounts"),
          debit: v.number(),
          credit: v.number(),
          description: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const entry = await ctx.db.get(args.id);
    if (!entry) throw new ConvexError({ message: "Journal entry not found", code: "NOT_FOUND" });
    if (entry.status !== "draft") {
      throw new ConvexError({ message: "Only draft entries can be edited", code: "BAD_REQUEST" });
    }
    const before = JSON.stringify(entry);

    // Check both the existing date and any new date being set
    await enforcePostingDate(ctx, args.date ?? entry.date);

    // Update entry fields
    const updates: Record<string, unknown> = {};
    if (args.date) updates.date = args.date;
    if (args.description) updates.description = args.description;
    if (args.reference !== undefined) updates.reference = args.reference;
    if (args.notes !== undefined) updates.notes = args.notes;

    // If lines are provided, replace them
    if (args.lines) {
      const totalDebit = args.lines.reduce((sum, l) => sum + l.debit, 0);
      const totalCredit = args.lines.reduce((sum, l) => sum + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new ConvexError({
          message: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
          code: "BAD_REQUEST",
        });
      }

      // Delete old lines
      const oldLines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.id))
        .collect();
      for (const line of oldLines) {
        await ctx.db.delete(line._id);
      }

      // Insert new lines with denormalized fields
      const lineDate = args.date ?? entry.date;
      for (const line of args.lines) {
        // RULE: every insert("journalLines", ...) MUST stamp both `date` and `status`.
        // Omitting either field makes the line invisible to the by_status_and_date and
        // by_account_and_date indexes, which silently excludes it from every financial report.
        await ctx.db.insert("journalLines", {
          journalEntryId: args.id,
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          date: lineDate,
          status: "draft",
        });
      }

      updates.totalDebit = Math.round(totalDebit * 100) / 100;
      updates.totalCredit = Math.round(totalCredit * 100) / 100;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }

    // If only the date changed (no lines replaced), propagate the new date to existing lines
    if (args.date && !args.lines) {
      const existingLines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.id))
        .collect();
      for (const line of existingLines) {
        await ctx.db.patch(line._id, { date: args.date });
      }
    }

    const after = await ctx.db.get(args.id);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:updateJournalEntry",
      resourceType: "journalEntry",
      resourceId: args.id,
      action: "journal_entry_updated",
      beforeValue: before,
      afterValue: JSON.stringify(after),
      details: `Updated journal entry ${entry.entryNumber}`,
    });
  },
});

// ─── Financial Reports ───────────────────────────────────────

export const getTrialBalance = query({
  args: { asOfDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const accounts = await ctx.db.query("accounts").collect();

    if (!args.asOfDate) {
      // Return current balances
      return accounts
        .filter((a) => a.isActive && a.balance !== 0)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          id: a._id,
          code: a.code,
          name: a.name,
          type: a.type,
          debit: a.normalSide === "debit" ? Math.max(0, a.balance) : Math.max(0, -a.balance),
          credit: a.normalSide === "credit" ? Math.max(0, a.balance) : Math.max(0, -a.balance),
        }));
    }

    // Calculate balances up to asOfDate from posted entries
    const entries = await ctx.db.query("journalEntries").collect();
    const postedBeforeDate = entries.filter(
      (e) => e.status === "posted" && e.date <= args.asOfDate!,
    );

    const balances: Record<string, number> = {};
    for (const entry of postedBeforeDate) {
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
        .collect();
      for (const line of lines) {
        const account = accounts.find((a) => a._id === line.accountId);
        if (!account) continue;
        const delta =
          account.normalSide === "debit" ? line.debit - line.credit : line.credit - line.debit;
        balances[account._id] = (balances[account._id] ?? 0) + delta;
      }
    }

    return accounts
      .filter((a) => a.isActive && (balances[a._id] ?? 0) !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => {
        const bal = balances[a._id] ?? 0;
        return {
          id: a._id,
          code: a.code,
          name: a.name,
          type: a.type,
          debit: a.normalSide === "debit" ? Math.max(0, bal) : Math.max(0, -bal),
          credit: a.normalSide === "credit" ? Math.max(0, bal) : Math.max(0, -bal),
        };
      });
  },
});

export const getBalanceSheet = query({
  args: { asOfDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const accounts = await ctx.db.query("accounts").collect();

    // Build a signed balance-by-account map. Without an asOfDate we use each
    // account's stored balance (ties to the no-date Trial Balance). With one we
    // aggregate posted journal lines up to and including that date.
    const balances: Record<string, number> = {};
    if (args.asOfDate) {
      const agg = await aggregatePostedLines(ctx, accounts, { endDate: args.asOfDate });
      for (const [id, bal] of agg.byAccount) balances[id] = bal;
    } else {
      for (const a of accounts) balances[a._id] = a.balance ?? 0;
    }

    const activeAccounts = accounts.filter((a) => a.isActive);
    const assets = activeAccounts
      .filter((a) => ASSET_TYPES.includes(a.type) && (balances[a._id] ?? 0) !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ ...a, balance: balances[a._id] ?? 0 }));
    const liabilities = activeAccounts
      .filter((a) => LIABILITY_TYPES.includes(a.type) && (balances[a._id] ?? 0) !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ ...a, balance: balances[a._id] ?? 0 }));
    const equityAccounts = activeAccounts
      .filter((a) => EQUITY_TYPES.includes(a.type) && (balances[a._id] ?? 0) !== 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ ...a, balance: balances[a._id] ?? 0 }));

    // Fold current-year (unclosed) net income into equity. Income − Expenses of
    // every income/expense account that has not yet been swept into Retained
    // Earnings by a year-end closing entry. This is exactly what the Trial
    // Balance leaves outside assets/liabilities/equity, so adding it here makes
    // Assets = Liabilities + Equity tie back to the Trial Balance.
    const netIncome = netIncomeFromBalances(accounts, new Map(Object.entries(balances)));

    // Represent the folded net income as a synthetic equity line so the report
    // stays readable and prints correctly.
    const equity = [...equityAccounts];
    if (Math.abs(netIncome) >= 0.01) {
      equity.push({
        _id: "net-income" as Id<"accounts">,
        _creationTime: 0,
        code: "3150",
        name: "Net Income (Current Year)",
        type: "equity",
        subType: "Current Year Earnings",
        isActive: true,
        balance: Math.round(netIncome * 100) / 100,
        normalSide: "credit",
      });
    }

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

    return {
      asOfDate: args.asOfDate ?? new Date().toISOString().slice(0, 10),
      assets,
      liabilities,
      equity,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      totalEquity: Math.round(totalEquity * 100) / 100,
      totalLiabilitiesAndEquity: Math.round((totalLiabilities + totalEquity) * 100) / 100,
    };
  },
});

// ─── Year-End Closing Entry ──────────────────────────────────
// Sweeps all income and expense account balances into Retained Earnings so the
// new fiscal year starts with zero P&L balances. After closing, the Balance
// Sheet shows the swept profit inside Retained Earnings (a real equity account)
// instead of the synthetic "Net Income (Current Year)" line.

export const closeYearEnd = mutation({
  args: { asOfDate: v.string() },
  handler: async (ctx, args): Promise<{ entryId: Id<"journalEntries"> | null; netIncome: number }> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can close the year", code: "FORBIDDEN" });
    }

    const accounts = await ctx.db.query("accounts").collect();

    // Use posted activity up to and including the closing date so the sweep
    // matches exactly what the P&L and Trial Balance report for the period.
    const agg = await aggregatePostedLines(ctx, accounts, { endDate: args.asOfDate });

    const { retainedEarnings } = await getControlAccounts(ctx);

    // Build closing lines: zero out every income/expense account by posting the
    // opposite of its current signed balance. Retained Earnings absorbs the net.
    const lines: Array<{ accountId: Id<"accounts">; debit: number; credit: number; description?: string }> = [];
    let netIncome = 0;

    for (const acct of accounts) {
      const isPnl = INCOME_TYPES.includes(acct.type) || EXPENSE_TYPES.includes(acct.type);
      if (!isPnl) continue;

      const bal = agg.byAccount.get(acct._id as string) ?? 0;
      if (Math.abs(bal) < 0.01) continue;

      // `bal` is signed on the account's normal side. To zero it, post the same
      // amount on the OPPOSITE side. Credit-normal P&L accounts (revenue) add to
      // net income; debit-normal ones (expenses, contra-revenue) subtract.
      if (acct.normalSide === "credit") {
        lines.push({ accountId: acct._id, debit: bal, credit: 0, description: "Year-end close" });
        netIncome += bal;
      } else {
        lines.push({ accountId: acct._id, debit: 0, credit: bal, description: "Year-end close" });
        netIncome -= bal;
      }
    }

    if (lines.length === 0) {
      return { entryId: null, netIncome: 0 };
    }

    // Balance the entry against Retained Earnings.
    netIncome = Math.round(netIncome * 100) / 100;
    if (netIncome > 0) {
      lines.push({
        accountId: retainedEarnings._id,
        debit: 0,
        credit: netIncome,
        description: "Net income to Retained Earnings",
      });
    } else if (netIncome < 0) {
      lines.push({
        accountId: retainedEarnings._id,
        debit: -netIncome,
        credit: 0,
        description: "Net loss to Retained Earnings",
      });
    }

    const entryId = await postBalancedEntry(ctx, {
      date: args.asOfDate,
      description: `Year-end closing entry (as of ${args.asOfDate})`,
      createdBy: user._id,
      sourceType: YEAR_END_CLOSE_SOURCE,
      sourceId: args.asOfDate,
      lines,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:closeYearEnd",
      resourceType: "journalEntry",
      resourceId: entryId,
      action: "year_end_closed",
      details: `Year-end closing entry posted as of ${args.asOfDate}. Net income: ${netIncome}`,
    });

    return { entryId, netIncome };
  },
});

// ─── Fiscal Period Management ────────────────────────────────
export const listFiscalPeriods = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("fiscalPeriods").collect();
  },
});

export const createFiscalPeriod = mutation({
  args: { name: v.string(), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.insert("fiscalPeriods", {
      name: args.name,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "open",
    });
  },
});

export const closeFiscalPeriod = mutation({
  args: { id: v.id("fiscalPeriods") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can close fiscal periods", code: "FORBIDDEN" });
    }

    const period = await ctx.db.get(args.id);
    if (!period) throw new ConvexError({ message: "Fiscal period not found", code: "NOT_FOUND" });
    if (period.status !== "open") {
      throw new ConvexError({ message: "Only open periods can be closed", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(args.id, {
      status: "closed",
      closedAt: new Date().toISOString(),
      closedBy: user._id,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:closeFiscalPeriod",
      resourceType: "fiscalPeriod",
      resourceId: args.id,
      action: "fiscal_period_closed",
      beforeValue: JSON.stringify(period),
      afterValue: JSON.stringify({ ...period, status: "closed" }),
      details: `Closed fiscal period '${period.name}'`,
    });
  },
});

export const lockFiscalPeriod = mutation({
  args: { id: v.id("fiscalPeriods") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can lock fiscal periods", code: "FORBIDDEN" });
    }
    const period = await ctx.db.get(args.id);
    if (!period) throw new ConvexError({ message: "Fiscal period not found", code: "NOT_FOUND" });
    if (period.status !== "closed") {
      throw new ConvexError({ message: "Only closed periods can be locked", code: "BAD_REQUEST" });
    }
    // Locking clears any standing reopened-since-report flag
    await ctx.db.patch(args.id, { status: "locked", reopenedSinceReport: undefined });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:lockFiscalPeriod",
      resourceType: "fiscalPeriod",
      resourceId: args.id,
      action: "fiscal_period_locked",
      beforeValue: JSON.stringify(period),
      afterValue: JSON.stringify({ ...period, status: "locked", reopenedSinceReport: undefined }),
      details: `Locked fiscal period '${period.name}'`,
    });
  },
});

// ─── Automatic Balance Sync & Essential Account Creation ─────────────────────
// Creates any missing essential accounts AND recalculates balances from real data

// Essential accounts every business needs
const ESSENTIAL_ACCOUNTS = [
  {
    code: "1100",
    name: "Inventory Asset",
    type: "other_current_asset" as const,
    subType: "Inventory",
    normalSide: "debit" as const,
  },
  {
    code: "1200",
    name: "Accounts Receivable",
    type: "accounts_receivable" as const,
    subType: "Trade Receivables",
    normalSide: "debit" as const,
  },
  {
    code: "1300",
    name: "Undeposited Funds",
    type: "other_current_asset" as const,
    subType: "Undeposited Funds",
    normalSide: "debit" as const,
  },
  {
    code: "2000",
    name: "Accounts Payable",
    type: "accounts_payable" as const,
    subType: "Trade Payables",
    normalSide: "credit" as const,
  },
  {
    code: "3000",
    name: "Owner's Equity",
    type: "equity" as const,
    subType: "Owner's Equity",
    normalSide: "credit" as const,
  },
  {
    code: "3100",
    name: "Retained Earnings",
    type: "equity" as const,
    subType: "Retained Earnings",
    normalSide: "credit" as const,
  },
  {
    code: "4000",
    name: "Sales Revenue",
    type: "income" as const,
    subType: "Sales",
    normalSide: "credit" as const,
  },
  {
    code: "4100",
    name: "Service Revenue",
    type: "income" as const,
    subType: "Services",
    normalSide: "credit" as const,
  },
  {
    code: "5000",
    name: "Cost of Goods Sold",
    type: "cost_of_goods_sold" as const,
    subType: "Materials",
    normalSide: "debit" as const,
  },
  {
    code: "6000",
    name: "Rent Expense",
    type: "expense" as const,
    subType: "Rent",
    normalSide: "debit" as const,
  },
  {
    code: "6100",
    name: "Utilities Expense",
    type: "expense" as const,
    subType: "Utilities",
    normalSide: "debit" as const,
  },
  {
    code: "6200",
    name: "Salary Expense",
    type: "expense" as const,
    subType: "Salaries & Wages",
    normalSide: "debit" as const,
  },
  {
    code: "6300",
    name: "Office Supplies",
    type: "expense" as const,
    subType: "Supplies",
    normalSide: "debit" as const,
  },
];

export const syncAccountBalances = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can sync balances", code: "FORBIDDEN" });
    }

    let allAccounts = await ctx.db.query("accounts").collect();
    let createdCount = 0;
    let updatedCount = 0;

    // Step 1: Create any missing essential accounts
    const existingCodes = new Set(allAccounts.map((a) => a.code));

    for (const essential of ESSENTIAL_ACCOUNTS) {
      // Skip if code exists OR if an active account of this exact type+subType combo exists
      const typeMatch = allAccounts.find(
        (a) =>
          a.type === essential.type &&
          a.isActive &&
          (a.subType === essential.subType ||
            essential.type === "accounts_receivable" ||
            essential.type === "accounts_payable"),
      );
      if (existingCodes.has(essential.code) || typeMatch) continue;

      await ctx.db.insert("accounts", {
        code: essential.code,
        name: essential.name,
        type: essential.type,
        subType: essential.subType,
        isActive: true,
        balance: 0,
        normalSide: essential.normalSide,
      });
      createdCount++;
    }

    // Re-fetch accounts after creation
    if (createdCount > 0) {
      allAccounts = await ctx.db.query("accounts").collect();
    }

    // Step 2: Rebuild every account balance from posted journal lines. The
    // ledger is the single source of truth — we no longer compute balances from
    // subledger documents directly. Balance respects each account's normal side.
    const postedEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();

    const debitTotals = new Map<string, number>();
    const creditTotals = new Map<string, number>();
    for (const entry of postedEntries) {
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
        .collect();
      for (const line of lines) {
        const key = line.accountId as string;
        debitTotals.set(key, (debitTotals.get(key) ?? 0) + (line.debit ?? 0));
        creditTotals.set(key, (creditTotals.get(key) ?? 0) + (line.credit ?? 0));
      }
    }

    for (const account of allAccounts) {
      const key = account._id as string;
      const totalDebit = debitTotals.get(key) ?? 0;
      const totalCredit = creditTotals.get(key) ?? 0;
      const delta =
        account.normalSide === "debit" ? totalDebit - totalCredit : totalCredit - totalDebit;
      const calculatedBalance = Math.round(delta * 100) / 100;

      // Update if balance differs
      if (calculatedBalance !== account.balance) {
        await ctx.db.patch(account._id, { balance: calculatedBalance });
        updatedCount++;
      }
    }

    const parts: string[] = [];
    if (createdCount > 0) parts.push(`Created ${createdCount} essential accounts`);
    if (updatedCount > 0) parts.push(`Synced ${updatedCount} balances`);
    if (parts.length === 0) parts.push("All balances are up to date");

    return { createdCount, updatedCount, message: parts.join(". ") };
  },
});

// ─── Migrate legacy bankAccounts → unified Chart of Accounts ─────────────────
// The app previously kept a separate `bankAccounts` table. Everything now uses
// the `accounts` table (type "bank"). This copies any remaining legacy rows
// into `accounts` so no bank/cash account is lost, then deactivates the legacy
// row. Safe to run repeatedly.

export const migrateLegacyBankAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only admins can migrate accounts", code: "FORBIDDEN" });
    }

    const legacy = await ctx.db.query("bankAccounts").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const usedCodes = new Set(accounts.map((a) => a.code));

    let migrated = 0;
    let nextCode = 1050;
    for (const b of legacy) {
      // Already linked to a real ledger account? Just deactivate the legacy row.
      if (b.ledgerAccountId) {
        migrated++;
        continue;
      }
      // Skip if a bank account with the same name already exists.
      const exists = accounts.find(
        (a) => a.type === "bank" && a.name.toLowerCase() === b.name.toLowerCase(),
      );
      if (exists) continue;

      while (usedCodes.has(String(nextCode))) nextCode++;
      const code = String(nextCode);
      usedCodes.add(code);

      const subType =
        b.accountType === "cash"
          ? b.name.toLowerCase().includes("petty")
            ? "Petty Cash"
            : "Cash"
          : b.accountType === "savings"
            ? "Savings"
            : b.accountType === "credit_card"
              ? "Credit Card"
              : "Checking";

      await ctx.db.insert("accounts", {
        code,
        name: b.name,
        type: "bank",
        subType,
        isActive: b.isActive,
        balance: b.currentBalance ?? 0,
        normalSide: "debit",
      });
      migrated++;
    }

    return { migrated, legacyCount: legacy.length };
  },
});

// ─── Owner-only admin corrections (reverse-and-repost) ───────────────────────
//
// These mutations let the account owner correct or void a POSTED journal entry.
// The mechanic is always reverse-and-repost — the original entry is never
// mutated in place. Its balances are reversed (mirror of the original posting),
// its lines and header are stamped "void", and (for corrections) a fresh posted
// entry is created via the single ledger posting engine.
//
// The enforcePostingDate check is intentionally NOT bypassed. If the entry's
// date falls in a locked/closed period, the owner must first reopen the period
// (Accounting > Fiscal Periods) — the mutation throws and says so.

export const adminVoidPostedEntry = mutation({
  args: {
    journalEntryId: v.id("journalEntries"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    if (!args.reason || args.reason.trim().length < 10) {
      throw new ConvexError({
        message: "A reason of at least 10 characters is required",
        code: "BAD_REQUEST",
      });
    }

    const entry = await ctx.db.get(args.journalEntryId);
    if (!entry) throw new ConvexError({ message: "Journal entry not found", code: "NOT_FOUND" });
    if (entry.status !== "posted") {
      throw new ConvexError({ message: "Only posted entries can be voided", code: "BAD_REQUEST" });
    }

    // Enforce posting date — will throw if the period is locked/closed.
    await enforcePostingDate(ctx, entry.date);

    // Reverse balances via the single ledger balance writer (swap debit/credit),
    // mirroring the existing voidJournalEntry behaviour.
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.journalEntryId))
      .collect();
    for (const line of lines) {
      await applyBalanceDelta(ctx, line.accountId, line.credit, line.debit);
      await ctx.db.patch(line._id, { status: "void" });
    }

    await ctx.db.patch(args.journalEntryId, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:adminVoidPostedEntry",
      resourceType: "journalEntry",
      resourceId: args.journalEntryId,
      action: "journal_entry_admin_voided",
      beforeValue: JSON.stringify(entry),
      afterValue: JSON.stringify({ ...entry, status: "void" }),
      reason: args.reason,
      details: `Owner voided posted journal entry ${entry.entryNumber}`,
    });
  },
});

export const adminCorrectJournalEntry = mutation({
  args: {
    journalEntryId: v.id("journalEntries"),
    reason: v.string(),
    date: v.string(),
    description: v.string(),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.array(
      v.object({
        accountId: v.id("accounts"),
        debit: v.number(),
        credit: v.number(),
        description: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Id<"journalEntries">> => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    if (!args.reason || args.reason.trim().length < 10) {
      throw new ConvexError({
        message: "A reason of at least 10 characters is required",
        code: "BAD_REQUEST",
      });
    }

    const original = await ctx.db.get(args.journalEntryId);
    if (!original) throw new ConvexError({ message: "Journal entry not found", code: "NOT_FOUND" });
    if (original.status !== "posted") {
      throw new ConvexError({ message: "Only posted entries can be corrected", code: "BAD_REQUEST" });
    }

    // Enforce posting date on BOTH the original date and the corrected date.
    await enforcePostingDate(ctx, original.date);
    await enforcePostingDate(ctx, args.date);

    // Validate the corrected entry is balanced and non-zero before touching anything.
    const totalDebit = args.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = args.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new ConvexError({
        message: `Debits (${totalDebit}) must equal credits (${totalCredit})`,
        code: "BAD_REQUEST",
      });
    }
    if (totalDebit <= 0) {
      throw new ConvexError({
        message: "Corrected entry must move a positive amount",
        code: "BAD_REQUEST",
      });
    }

    // 1. Reverse the original posting (mirror balances, void lines + header).
    const oldLines = await ctx.db
      .query("journalLines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.journalEntryId))
      .collect();
    for (const line of oldLines) {
      await applyBalanceDelta(ctx, line.accountId, line.credit, line.debit);
      await ctx.db.patch(line._id, { status: "void" });
    }
    await ctx.db.patch(args.journalEntryId, { status: "void" });

    // 2. Post the corrected entry through the single ledger posting engine.
    //    This inserts a balanced, posted entry + lines and applies the balance
    //    deltas atomically. A reference back to the original preserves the trail.
    const correctionRef = args.reference ?? `Correction of ${original.entryNumber}`;
    const newEntryId = await postBalancedEntry(ctx, {
      date: args.date,
      description: args.description,
      reference: correctionRef,
      notes: args.notes,
      createdBy: user._id,
      lines: args.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "accounting:adminCorrectJournalEntry",
      resourceType: "journalEntry",
      resourceId: args.journalEntryId,
      action: "journal_entry_admin_corrected",
      beforeValue: JSON.stringify(original),
      afterValue: JSON.stringify({ newEntryId, date: args.date, totalDebit, totalCredit }),
      reason: args.reason,
      details: `Owner corrected posted journal entry ${original.entryNumber}`,
    });

    return newEntryId;
  },
});

// ─── Merge Accounts ──────────────────────────────────────────────────────────
// Permanently merges `sourceId` into `targetId`. All journal lines from the
// source are re-pointed to the target, balances are transferred, and the source
// is marked replacedBy so findOrCreateAccount will never recreate it.

export const mergeAccounts = mutation({
  args: {
    sourceId: v.id("accounts"),
    targetId: v.id("accounts"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ linesRepointed: number }> => {
    await assertOwner(ctx);
    if (args.sourceId === args.targetId) {
      throw new ConvexError({ message: "Source and target must be different accounts", code: "BAD_REQUEST" });
    }

    const [source, target] = await Promise.all([
      ctx.db.get(args.sourceId),
      ctx.db.get(args.targetId),
    ]);
    if (!source) throw new ConvexError({ message: "Source account not found", code: "NOT_FOUND" });
    if (!target) throw new ConvexError({ message: "Target account not found", code: "NOT_FOUND" });
    if (source.type !== target.type) {
      throw new ConvexError({
        message: `Cannot merge accounts of different types: ${source.type} → ${target.type}`,
        code: "BAD_REQUEST",
      });
    }

    // Bound the read: refuse rather than let the query die above Convex's document limit.
    // 2,000 is chosen as a safe ceiling well below the 16,384-document scan limit; any
    // account with more lines should be handled by a scheduled migration, not a UI action.
    const MERGE_LINE_LIMIT = 2000;
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_account", (q) => q.eq("accountId", args.sourceId))
      .take(MERGE_LINE_LIMIT + 1);
    if (lines.length > MERGE_LINE_LIMIT) {
      throw new ConvexError({
        message: `Cannot merge: source account has more than ${MERGE_LINE_LIMIT} journal lines. Contact support to schedule a batch migration.`,
        code: "BAD_REQUEST",
      });
    }

    // Posting-date check: every affected line must fall in an open period.
    // Load the parent entry for each line and enforce. Any failure aborts the whole merge.
    for (const line of lines) {
      if (line.journalEntryId) {
        const entry = await ctx.db.get(line.journalEntryId);
        if (entry?.date) {
          await enforcePostingDate(ctx, entry.date);
        }
      }
    }

    // Re-point all journal lines from source to target
    for (const line of lines) {
      await ctx.db.patch(line._id, { accountId: args.targetId });
    }

    // Transfer balance from source to target
    await ctx.db.patch(args.targetId, {
      balance: round2(target.balance + source.balance),
    });

    // Mark source as replaced and deactivate
    await ctx.db.patch(args.sourceId, {
      replacedBy: args.targetId,
      isActive: false,
      balance: 0,
    });

    const user = await getCurrentUser(ctx);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "mergeAccounts",
      resourceType: "account",
      resourceId: args.sourceId,
      action: "merge",
      reason: args.reason,
      beforeValue: JSON.stringify({ code: source.code, name: source.name }),
      afterValue: JSON.stringify({ mergedInto: target.code, linesRepointed: lines.length }),
    });

    return { linesRepointed: lines.length };
  },
});
