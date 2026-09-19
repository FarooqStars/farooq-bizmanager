import { v, ConvexError } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.d.ts";
import { postBalancedEntry, findOrCreateAccount, round2 } from "./lib/ledger.ts";
import { BANK_ADJUSTMENT_SOURCE, BANK_IMPORT_SOURCE } from "./lib/sourceTypes.ts";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

async function requireUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

/**
 * Offsetting account for manual bank-register entries and statement imports.
 * These have no explicit counter-account, so they post against a single
 * "Bank Adjustments" equity account to keep the ledger balanced.
 */
async function getBankAdjustmentAccountId(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    type: "equity",
    code: "3950",
    name: "Bank Adjustments",
    subType: "Bank Adjustments",
    matchSubType: "Bank Adjustments",
  });
  return acc._id;
}

// ─── Currency Queries ────────────────────────────────────────

export const listCurrencies = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let currencies = await ctx.db.query("currencies").collect();
    if (args.activeOnly) {
      currencies = currencies.filter((c) => c.isActive);
    }
    // Sort: base currency first, then alphabetical
    currencies.sort((a, b) => {
      if (a.isBase && !b.isBase) return -1;
      if (!a.isBase && b.isBase) return 1;
      return a.code.localeCompare(b.code);
    });
    return currencies;
  },
});

export const getBaseCurrency = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("currencies")
      .withIndex("by_is_base", (q) => q.eq("isBase", true))
      .first();
  },
});

// ─── Currency Mutations ──────────────────────────────────────

export const createCurrency = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    symbol: v.string(),
    decimalPlaces: v.number(),
    isBase: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Check unique code
    const existing = await ctx.db
      .query("currencies")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) {
      throw new ConvexError({ message: `Currency ${args.code} already exists`, code: "CONFLICT" });
    }
    // If setting as base, unset current base
    if (args.isBase) {
      const currentBase = await ctx.db
        .query("currencies")
        .withIndex("by_is_base", (q) => q.eq("isBase", true))
        .first();
      if (currentBase) {
        await ctx.db.patch(currentBase._id, { isBase: false });
      }
    }
    const id = await ctx.db.insert("currencies", {
      code: args.code.toUpperCase(),
      name: args.name,
      symbol: args.symbol,
      decimalPlaces: args.decimalPlaces,
      isBase: args.isBase ?? false,
      isActive: true,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:createCurrency",
      resourceType: "currency",
      resourceId: id,
      action: "currency_created",
      afterValue: JSON.stringify({ code: args.code.toUpperCase(), name: args.name }),
      details: `Created currency ${args.code.toUpperCase()}`,
    });

    return id;
  },
});

export const updateCurrency = mutation({
  args: {
    id: v.id("currencies"),
    name: v.optional(v.string()),
    symbol: v.optional(v.string()),
    decimalPlaces: v.optional(v.number()),
    isBase: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const currency = await ctx.db.get(args.id);
    if (!currency) throw new ConvexError({ message: "Currency not found", code: "NOT_FOUND" });

    const beforeValue = JSON.stringify(currency);

    // If setting as base, unset current base
    if (args.isBase) {
      const currentBase = await ctx.db
        .query("currencies")
        .withIndex("by_is_base", (q) => q.eq("isBase", true))
        .first();
      if (currentBase && currentBase._id !== args.id) {
        await ctx.db.patch(currentBase._id, { isBase: false });
      }
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.symbol !== undefined) updates.symbol = args.symbol;
    if (args.decimalPlaces !== undefined) updates.decimalPlaces = args.decimalPlaces;
    if (args.isBase !== undefined) updates.isBase = args.isBase;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.id, updates);

    const updated = await ctx.db.get(args.id);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:updateCurrency",
      resourceType: "currency",
      resourceId: args.id,
      action: "currency_updated",
      beforeValue,
      afterValue: JSON.stringify(updated),
      details: `Updated currency ${currency.code}`,
    });
  },
});

export const deleteCurrency = mutation({
  args: { id: v.id("currencies") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const currency = await ctx.db.get(args.id);
    if (!currency) throw new ConvexError({ message: "Currency not found", code: "NOT_FOUND" });
    if (currency.isBase) {
      throw new ConvexError({ message: "Cannot delete base currency. Set another currency as base first.", code: "CONFLICT" });
    }

    const beforeValue = JSON.stringify(currency);
    await ctx.db.delete(args.id);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:deleteCurrency",
      resourceType: "currency",
      resourceId: args.id,
      action: "currency_deleted",
      beforeValue,
      details: `Deleted currency ${currency.code}`,
    });
  },
});

export const seedDefaultCurrencies = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.query("currencies").first();
    if (existing) {
      throw new ConvexError({ message: "Currencies already exist", code: "CONFLICT" });
    }
    const defaults = [
      { code: "QAR", name: "Qatari Riyal", symbol: "﷼", decimalPlaces: 2, isBase: true },
      { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2, isBase: false },
      { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2, isBase: false },
      { code: "GBP", name: "British Pound", symbol: "£", decimalPlaces: 2, isBase: false },
      { code: "SAR", name: "Saudi Riyal", symbol: "﷼", decimalPlaces: 2, isBase: false },
      { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimalPlaces: 2, isBase: false },
      { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimalPlaces: 2, isBase: false },
      { code: "INR", name: "Indian Rupee", symbol: "₹", decimalPlaces: 2, isBase: false },
      { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimalPlaces: 2, isBase: false },
      { code: "NPR", name: "Nepalese Rupee", symbol: "₨", decimalPlaces: 2, isBase: false },
    ];
    for (const c of defaults) {
      await ctx.db.insert("currencies", { ...c, isActive: true });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:seedDefaultCurrencies",
      resourceType: "currency",
      resourceId: "batch",
      action: "currencies_seeded",
      details: `Seeded ${defaults.length} default currencies`,
    });

    return defaults.length;
  },
});

// ─── Exchange Rates ──────────────────────────────────────────

export const listExchangeRates = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.date) {
      return await ctx.db
        .query("exchangeRates")
        .withIndex("by_date", (q) => q.eq("date", args.date!))
        .collect();
    }
    // Get the latest rates (most recent date)
    const allRates = await ctx.db.query("exchangeRates").order("desc").take(100);
    if (allRates.length === 0) return [];
    const latestDate = allRates[0].date;
    return allRates.filter((r) => r.date === latestDate);
  },
});

export const getExchangeRate = query({
  args: { fromCurrency: v.string(), toCurrency: v.string(), date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.fromCurrency === args.toCurrency) return 1;

    // Try to get rate for the specific date or most recent
    const rates = await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair_and_date", (q) =>
        q.eq("fromCurrency", args.fromCurrency).eq("toCurrency", args.toCurrency)
      )
      .order("desc")
      .take(1);

    if (rates.length > 0) return rates[0].rate;

    // Try reverse
    const reverseRates = await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair_and_date", (q) =>
        q.eq("fromCurrency", args.toCurrency).eq("toCurrency", args.fromCurrency)
      )
      .order("desc")
      .take(1);

    if (reverseRates.length > 0) return 1 / reverseRates[0].rate;

    return null;
  },
});

export const setExchangeRate = mutation({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.rate <= 0) {
      throw new ConvexError({ message: "Rate must be positive", code: "BAD_REQUEST" });
    }
    // Check if a rate already exists for this pair and date
    const existing = await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair_and_date", (q) =>
        q.eq("fromCurrency", args.fromCurrency)
          .eq("toCurrency", args.toCurrency)
          .eq("date", args.date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { rate: args.rate, source: "manual" });

      await logAudit(ctx, {
        userId: user._id,
        mutationName: "banking:setExchangeRate",
        resourceType: "exchangeRate",
        resourceId: existing._id,
        action: "exchange_rate_updated",
        afterValue: JSON.stringify({ fromCurrency: args.fromCurrency, toCurrency: args.toCurrency, rate: args.rate, date: args.date }),
        details: `Updated exchange rate ${args.fromCurrency}/${args.toCurrency} to ${args.rate}`,
      });

      return existing._id;
    }

    const id = await ctx.db.insert("exchangeRates", {
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      rate: args.rate,
      date: args.date,
      source: "manual",
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:setExchangeRate",
      resourceType: "exchangeRate",
      resourceId: id,
      action: "exchange_rate_created",
      afterValue: JSON.stringify({ fromCurrency: args.fromCurrency, toCurrency: args.toCurrency, rate: args.rate, date: args.date }),
      details: `Set exchange rate ${args.fromCurrency}/${args.toCurrency} = ${args.rate}`,
    });

    return id;
  },
});

export const saveApiRates = mutation({
  args: {
    baseCurrency: v.string(),
    rates: v.array(v.object({
      currency: v.string(),
      rate: v.number(),
    })),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let count = 0;
    for (const r of args.rates) {
      const existing = await ctx.db
        .query("exchangeRates")
        .withIndex("by_pair_and_date", (q) =>
          q.eq("fromCurrency", args.baseCurrency)
            .eq("toCurrency", r.currency)
            .eq("date", args.date)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { rate: r.rate, source: "api" });
      } else {
        await ctx.db.insert("exchangeRates", {
          fromCurrency: args.baseCurrency,
          toCurrency: r.currency,
          rate: r.rate,
          date: args.date,
          source: "api",
        });
      }
      count++;
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:saveApiRates",
      resourceType: "exchangeRate",
      resourceId: "batch",
      action: "exchange_rates_imported",
      details: `Imported ${count} exchange rates for ${args.baseCurrency} on ${args.date}`,
    });

    return count;
  },
});

// Action to fetch live exchange rates from a free API
export const fetchLiveRates = action({
  args: { baseCurrency: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean; count: number }> => {
    // Use frankfurter.app (free, no API key needed)
    const resp = await fetch(
      `https://api.frankfurter.app/latest?from=${args.baseCurrency}`
    );
    if (!resp.ok) {
      throw new ConvexError({
        message: `Failed to fetch rates: ${resp.statusText}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
    const data = await resp.json() as { base: string; date: string; rates: Record<string, number> };

    // Also get rates for currencies we track
    const currencies = await ctx.runQuery(api.banking.listCurrencies, { activeOnly: true });
    const trackedCodes = currencies.map((c) => c.code);

    const ratesToSave = Object.entries(data.rates as Record<string, number>)
      .filter(([code]) => trackedCodes.includes(code))
      .map(([currency, rate]) => ({ currency, rate }));

    if (ratesToSave.length === 0) {
      return { success: true, count: 0 };
    }

    const count = await ctx.runMutation(api.banking.saveApiRates, {
      baseCurrency: data.base,
      rates: ratesToSave,
      date: data.date,
    });

    return { success: true, count };
  },
});

// ─── Bank Account Queries (unified: read from Chart of Accounts) ─────────────
// The legacy `bankAccounts` table is deprecated. Real bank/cash accounts live
// in `accounts` with type "bank". These queries map them to the shape the UI
// historically expected so existing callers keep working.

export const listBankAccounts = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let accounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "bank"))
      .collect();
    if (args.activeOnly) {
      accounts = accounts.filter((a) => a.isActive);
    }
    return accounts.map((a) => ({
      _id: a._id,
      name: a.name,
      bankName: a.subType ?? "Bank",
      accountNumber: a.code,
      currency: undefined as string | undefined,
      accountType: "checking" as const,
      currentBalance: a.balance,
      isActive: a.isActive,
    }));
  },
});

export const getBankAccount = query({
  args: { id: v.id("accounts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const listBankTransactions = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    unreconciledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!args.accountId) return [];
    let transactions = await ctx.db
      .query("bankTransactions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
      .order("desc")
      .take(200);

    if (args.unreconciledOnly) {
      transactions = transactions.filter((t) => !t.isReconciled);
    }
    return transactions;
  },
});

// ─── Bank Transaction Mutations ──────────────────────────────

export const createBankTransaction = mutation({
  args: {
    accountId: v.id("accounts"),
    date: v.string(),
    description: v.string(),
    amount: v.number(),
    type: v.union(v.literal("debit"), v.literal("credit")),
    reference: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"bankTransactions">> => {
    const user = await requireUser(ctx);

    const amount = round2(args.amount);
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });

    // A manual register entry has no explicit counter-account, so it posts
    // against the Bank Adjustments account to stay balanced.
    const adjustmentId = await getBankAdjustmentAccountId(ctx);
    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description: args.description,
      reference: args.reference,
      createdBy: user._id,
      sourceType: BANK_ADJUSTMENT_SOURCE,
      lines:
        args.type === "credit"
          ? [
              { accountId: args.accountId, debit: amount, description: args.description },
              { accountId: adjustmentId, credit: amount, description: args.description },
            ]
          : [
              { accountId: adjustmentId, debit: amount, description: args.description },
              { accountId: args.accountId, credit: amount, description: args.description },
            ],
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description: args.description,
      amount,
      type: args.type,
      reference: args.reference,
      category: args.category,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:createBankTransaction",
      resourceType: "bankTransaction",
      resourceId: txnId,
      action: "bank_transaction_created",
      afterValue: JSON.stringify({ amount, type: args.type, accountId: args.accountId }),
      details: `Created bank transaction: ${args.type} ${amount} on ${account.name}`,
    });

    return txnId;
  },
});

export const importBankTransactions = mutation({
  args: {
    accountId: v.id("accounts"),
    transactions: v.array(v.object({
      date: v.string(),
      description: v.string(),
      amount: v.number(),
      type: v.union(v.literal("debit"), v.literal("credit")),
      reference: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<{ count: number; batchId: string }> => {
    const user = await requireUser(ctx);

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });

    const batchId = `IMPORT-${Date.now()}`;
    const adjustmentId = await getBankAdjustmentAccountId(ctx);

    for (const txn of args.transactions) {
      const amount = round2(txn.amount);
      // Each imported line posts a balanced entry against Bank Adjustments.
      const entryId = await postBalancedEntry(ctx, {
        date: txn.date,
        description: txn.description,
        reference: txn.reference,
        createdBy: user._id,
        sourceType: BANK_IMPORT_SOURCE,
        lines:
          txn.type === "credit"
            ? [
                { accountId: args.accountId, debit: amount, description: txn.description },
                { accountId: adjustmentId, credit: amount, description: txn.description },
              ]
            : [
                { accountId: adjustmentId, debit: amount, description: txn.description },
                { accountId: args.accountId, credit: amount, description: txn.description },
              ],
      });
      await ctx.db.insert("bankTransactions", {
        accountId: args.accountId,
        date: txn.date,
        description: txn.description,
        amount,
        type: txn.type,
        reference: txn.reference,
        isReconciled: false,
        importBatchId: batchId,
        matchedJournalEntryId: entryId,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:importBankTransactions",
      resourceType: "bankTransaction",
      resourceId: batchId,
      action: "bank_transactions_imported",
      details: `Imported ${args.transactions.length} transactions into ${account.name} (batch ${batchId})`,
    });

    return { count: args.transactions.length, batchId };
  },
});

export const reconcileTransaction = mutation({
  args: {
    transactionId: v.id("bankTransactions"),
    journalEntryId: v.optional(v.id("journalEntries")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const txn = await ctx.db.get(args.transactionId);
    if (!txn) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.transactionId, {
      isReconciled: true,
      matchedJournalEntryId: args.journalEntryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:reconcileTransaction",
      resourceType: "bankTransaction",
      resourceId: args.transactionId,
      action: "bank_transaction_reconciled",
      details: `Reconciled transaction ${args.transactionId}`,
    });
  },
});

export const unreconcileTransaction = mutation({
  args: { transactionId: v.id("bankTransactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const txn = await ctx.db.get(args.transactionId);
    if (!txn) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.transactionId, {
      isReconciled: false,
      matchedJournalEntryId: undefined,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:unreconcileTransaction",
      resourceType: "bankTransaction",
      resourceId: args.transactionId,
      action: "bank_transaction_unreconciled",
      details: `Unreconciled transaction ${args.transactionId}`,
    });
  },
});

// ─── Reconciliation Summary ──────────────────────────────────

export const getReconciliationSummary = query({
  args: {
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (!args.accountId) return null;
    const account = await ctx.db.get(args.accountId);
    if (!account) return null;
    const bankBalance = account.balance;
    const transactions = await ctx.db
      .query("bankTransactions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
      .collect();

    const reconciled = transactions.filter((t) => t.isReconciled);
    const unreconciled = transactions.filter((t) => !t.isReconciled);

    const unreconciledTotal = unreconciled.reduce((sum, t) =>
      sum + (t.type === "credit" ? t.amount : -t.amount), 0
    );

    const reconciledTotal = reconciled.reduce((sum, t) =>
      sum + (t.type === "credit" ? t.amount : -t.amount), 0
    );

    return {
      totalTransactions: transactions.length,
      reconciledCount: reconciled.length,
      unreconciledCount: unreconciled.length,
      unreconciledAmount: Math.round(unreconciledTotal * 100) / 100,
      reconciledAmount: Math.round(reconciledTotal * 100) / 100,
      bankBalance,
    };
  },
});

// ─── Reconciliation Sessions ────────────────────────────────

export const getReconciliationHistory = query({
  args: {
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (!args.accountId) return [];
    const sessions = await ctx.db
      .query("reconciliationSessions")
      .order("desc")
      .collect();
    return sessions.filter((s) => s.accountId === args.accountId).slice(0, 50);
  },
});

export const completeReconciliation = mutation({
  args: {
    accountId: v.optional(v.id("accounts")),
    statementDate: v.string(),
    statementBalance: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (!args.accountId) {
      throw new ConvexError({ message: "Account ID required", code: "BAD_REQUEST" });
    }
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    const bankBalance = account.balance;
    const transactions = await ctx.db
      .query("bankTransactions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
      .collect();

    const reconciled = transactions.filter((t) => t.isReconciled);
    const clearedBalance = reconciled.reduce((sum, t) =>
      sum + (t.type === "credit" ? t.amount : -t.amount), 0
    );

    const difference = Math.round((args.statementBalance - clearedBalance) * 100) / 100;

    const sessionId = await ctx.db.insert("reconciliationSessions", {
      accountId: args.accountId,
      statementDate: args.statementDate,
      statementBalance: args.statementBalance,
      bookBalance: bankBalance,
      clearedBalance: Math.round(clearedBalance * 100) / 100,
      difference,
      transactionCount: reconciled.length,
      status: "completed",
      completedAt: new Date().toISOString(),
      completedBy: user._id,
      notes: args.notes,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:completeReconciliation",
      resourceType: "reconciliationSession",
      resourceId: sessionId,
      action: "bank_account_reconciled",
      details: `Reconciled account ${args.accountId} with statement balance ${args.statementBalance}, difference ${difference}`,
    });

    return { difference, clearedBalance: Math.round(clearedBalance * 100) / 100 };
  },
});

export const bulkReconcile = mutation({
  args: {
    transactionIds: v.array(v.id("bankTransactions")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    for (const txnId of args.transactionIds) {
      const txn = await ctx.db.get(txnId);
      if (txn && !txn.isReconciled) {
        await ctx.db.patch(txnId, { isReconciled: true });
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:bulkReconcile",
      resourceType: "bankTransaction",
      resourceId: "batch",
      action: "bank_transactions_bulk_reconciled",
      details: `Bulk reconciled ${args.transactionIds.length} transactions`,
    });

    return { count: args.transactionIds.length };
  },
});

export const bulkUnreconcile = mutation({
  args: {
    transactionIds: v.array(v.id("bankTransactions")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    for (const txnId of args.transactionIds) {
      const txn = await ctx.db.get(txnId);
      if (txn && txn.isReconciled) {
        await ctx.db.patch(txnId, { isReconciled: false, matchedJournalEntryId: undefined });
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "banking:bulkUnreconcile",
      resourceType: "bankTransaction",
      resourceId: "batch",
      action: "bank_transactions_bulk_unreconciled",
      details: `Bulk unreconciled ${args.transactionIds.length} transactions`,
    });

    return { count: args.transactionIds.length };
  },
});

// ─── Currency Conversion Helper ──────────────────────────────

export const convertAmount = query({
  args: {
    amount: v.number(),
    fromCurrency: v.string(),
    toCurrency: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.fromCurrency === args.toCurrency) {
      return { convertedAmount: args.amount, rate: 1 };
    }

    // Get latest rate
    const rates = await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair_and_date", (q) =>
        q.eq("fromCurrency", args.fromCurrency).eq("toCurrency", args.toCurrency)
      )
      .order("desc")
      .take(1);

    if (rates.length > 0) {
      return {
        convertedAmount: Math.round(args.amount * rates[0].rate * 100) / 100,
        rate: rates[0].rate,
      };
    }

    // Try reverse
    const reverseRates = await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair_and_date", (q) =>
        q.eq("fromCurrency", args.toCurrency).eq("toCurrency", args.fromCurrency)
      )
      .order("desc")
      .take(1);

    if (reverseRates.length > 0) {
      const rate = 1 / reverseRates[0].rate;
      return {
        convertedAmount: Math.round(args.amount * rate * 100) / 100,
        rate: Math.round(rate * 1000000) / 1000000,
      };
    }

    return { convertedAmount: null, rate: null };
  },
});
