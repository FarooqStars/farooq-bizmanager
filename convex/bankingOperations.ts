import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { round2, postBalancedEntry, findOrCreateAccount } from "./lib/ledger.ts";
import {
  BANK_CHECK_SOURCE,
  BANK_EXPENSE_SOURCE,
  PETTY_CASH_EXPENSE_SOURCE,
  BANK_PAYMENT_SOURCE,
  PETTY_CASH_REPLENISH_SOURCE,
  BANK_TRANSFER_SOURCE,
} from "./lib/sourceTypes.ts";
import { enforcePostingDate } from "./closingDate.ts";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

async function getUser(ctx: MutationCtx | QueryCtx, tokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

async function getDefaultCurrency(ctx: MutationCtx | QueryCtx): Promise<string> {
  const profiles = await ctx.db.query("companyProfile").take(1);
  return profiles[0]?.defaultCurrency ?? "USD";
}

/**
 * Resolve (find or create) the expense account that a bank expense/check should
 * be debited to. Matches an existing expense account by category name, else
 * falls back to a generic "General Expenses" account.
 */
async function resolveExpenseAccount(
  ctx: MutationCtx,
  category?: string,
): Promise<Doc<"accounts">> {
  if (category && category.trim().length > 0) {
    const expenses = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "expense"))
      .collect();
    const active = expenses.filter((a) => a.isActive);
    const lower = category.toLowerCase();
    const match =
      active.find((a) => a.name.toLowerCase() === lower) ??
      active.find((a) => a.subType?.toLowerCase() === lower) ??
      active.find((a) => a.name.toLowerCase().includes(lower));
    if (match) return match;
  }
  return await findOrCreateAccount(ctx, {
    type: "expense",
    code: "6900",
    name: "General Expenses",
    subType: "General",
    matchSubType: "General",
  });
}

/**
 * Find or create the single Petty Cash ledger account (bank type). This
 * replaces the legacy bankAccounts "Petty Cash" record.
 */
async function getPettyCashAccount(ctx: MutationCtx): Promise<Doc<"accounts">> {
  return await findOrCreateAccount(ctx, {
    type: "bank",
    code: "1050",
    name: "Petty Cash",
    subType: "Petty Cash",
    matchSubType: "Petty Cash",
  });
}

// ─── Write Check ─────────────────────────────────────────────

export const writeCheck = mutation({
  args: {
    accountId: v.id("accounts"),
    payee: v.string(),
    amount: v.number(),
    date: v.string(),
    checkNumber: v.string(),
    memo: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    expenseCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    const amount = round2(args.amount);
    if (amount <= 0)
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });
    const currency = await getDefaultCurrency(ctx);
    const description = `Check #${args.checkNumber} to ${args.payee}`;

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    if (!account.isActive)
      throw new ConvexError({ message: "Account is not active", code: "BAD_REQUEST" });

    const expenseAccount = await resolveExpenseAccount(ctx, args.expenseCategory);

    // Balanced posting: Dr Expense / Cr Cash-or-Bank
    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description,
      reference: args.checkNumber,
      createdBy: user._id,
      sourceType: BANK_CHECK_SOURCE,
      lines: [
        { accountId: expenseAccount._id, debit: amount, description: args.memo ?? description },
        { accountId: args.accountId, credit: amount, description },
      ],
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description,
      amount,
      type: "debit",
      reference: args.checkNumber,
      category: args.expenseCategory,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:writeCheck",
      resourceType: "banking",
      resourceId: txnId,
      action: "check_written",
      afterValue: JSON.stringify({ checkNumber: args.checkNumber, payee: args.payee, amount, accountId: args.accountId }),
      details: `Check #${args.checkNumber} to ${args.payee} — ${currency} ${amount.toFixed(2)}`,
    });

    return txnId;
  },
});

// ─── Record Bank Expense ─────────────────────────────────────

export const recordBankExpense = mutation({
  args: {
    accountId: v.id("accounts"),
    payee: v.string(),
    amount: v.number(),
    date: v.string(),
    expenseCategory: v.string(),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    const amount = round2(args.amount);
    if (amount <= 0)
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });
    const currency = await getDefaultCurrency(ctx);
    const expenseDescription = `Expense: ${args.payee} - ${args.expenseCategory}`;

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    if (!account.isActive)
      throw new ConvexError({ message: "Account is not active", code: "BAD_REQUEST" });

    const expenseAccount = await resolveExpenseAccount(ctx, args.expenseCategory);

    // Balanced posting: Dr Expense / Cr Cash-or-Bank
    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description: expenseDescription,
      reference: args.reference,
      createdBy: user._id,
      sourceType: BANK_EXPENSE_SOURCE,
      lines: [
        { accountId: expenseAccount._id, debit: amount, description: expenseDescription },
        { accountId: args.accountId, credit: amount, description: expenseDescription },
      ],
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description: expenseDescription,
      amount,
      type: "debit",
      reference: args.reference,
      category: args.expenseCategory,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:recordBankExpense",
      resourceType: "banking",
      resourceId: txnId,
      action: "bank_expense_recorded",
      afterValue: JSON.stringify({ payee: args.payee, amount, expenseCategory: args.expenseCategory, accountId: args.accountId }),
      details: `Bank expense to ${args.payee} — ${currency} ${amount.toFixed(2)} - ${args.expenseCategory}`,
    });

    return txnId;
  },
});

// ─── Record Petty Cash Expense ───────────────────────────────

export const recordPettyCashExpense = mutation({
  args: {
    amount: v.number(),
    date: v.string(),
    description: v.string(),
    expenseCategory: v.string(),
    paidTo: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    const currency = await getDefaultCurrency(ctx);

    await enforcePostingDate(ctx, args.date);

    const amount = round2(args.amount);
    if (amount <= 0)
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });

    const pettyCash = await getPettyCashAccount(ctx);
    const expenseAccount = await resolveExpenseAccount(ctx, args.expenseCategory);
    const description = `Petty Cash: ${args.description}${args.paidTo ? ` (to ${args.paidTo})` : ""}`;

    // Balanced posting: Dr Expense / Cr Petty Cash
    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description,
      reference: args.reference,
      createdBy: user._id,
      sourceType: PETTY_CASH_EXPENSE_SOURCE,
      lines: [
        { accountId: expenseAccount._id, debit: amount, description },
        { accountId: pettyCash._id, credit: amount, description },
      ],
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: pettyCash._id,
      date: args.date,
      description,
      amount,
      type: "debit",
      reference: args.reference,
      category: args.expenseCategory,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:recordPettyCashExpense",
      resourceType: "banking",
      resourceId: txnId,
      action: "petty_cash_expense_recorded",
      afterValue: JSON.stringify({ description: args.description, amount, expenseCategory: args.expenseCategory }),
      details: `Petty cash expense — ${currency} ${amount.toFixed(2)} - ${args.description}`,
    });

    return txnId;
  },
});

// ─── Make Bank Payment ───────────────────────────────────────

export const makeBankPayment = mutation({
  args: {
    accountId: v.id("accounts"),
    payee: v.string(),
    amount: v.number(),
    date: v.string(),
    paymentMethod: v.union(
      v.literal("check"),
      v.literal("wire"),
      v.literal("ach"),
      v.literal("eft"),
      v.literal("online"),
    ),
    reference: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    billId: v.optional(v.id("bills")),
    expenseCategory: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    const amount = round2(args.amount);
    if (amount <= 0)
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });
    const currency = await getDefaultCurrency(ctx);
    const paymentDescription = `Payment to ${args.payee} via ${args.paymentMethod}`;

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    if (!account.isActive)
      throw new ConvexError({ message: "Account is not active", code: "BAD_REQUEST" });

    // Determine the debit side of this cash outflow.
    // If it pays down a bill, debit Accounts Payable; otherwise debit an expense.
    let debitAccountId: Id<"accounts">;
    let bill: Doc<"bills"> | null = null;
    if (args.billId) {
      bill = await ctx.db.get(args.billId);
      if (!bill) throw new ConvexError({ message: "Bill not found", code: "NOT_FOUND" });
      const ap = await findOrCreateAccount(ctx, {
        type: "accounts_payable",
        code: "2000",
        name: "Accounts Payable",
        subType: "Trade Payables",
        matchAnyOfType: true,
      });
      debitAccountId = ap._id;
    } else {
      const expenseAccount = await resolveExpenseAccount(ctx, args.expenseCategory);
      debitAccountId = expenseAccount._id;
    }

    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description: paymentDescription,
      reference: args.reference,
      createdBy: user._id,
      sourceType: BANK_PAYMENT_SOURCE,
      lines: [
        { accountId: debitAccountId, debit: amount, description: paymentDescription },
        { accountId: args.accountId, credit: amount, description: paymentDescription },
      ],
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description: paymentDescription,
      amount,
      type: "debit",
      reference: args.reference,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    // If billId provided, update the bill's paid amount/status
    if (bill) {
      const newAmountPaid = round2((bill.amountPaid ?? 0) + amount);
      const newStatus = newAmountPaid >= bill.amount ? "paid" : "partially_paid";
      await ctx.db.patch(bill._id, {
        amountPaid: newAmountPaid,
        status: newStatus,
        ...(newStatus === "paid" ? { paidAt: args.date } : {}),
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:makeBankPayment",
      resourceType: "banking",
      resourceId: txnId,
      action: "bank_payment_made",
      afterValue: JSON.stringify({ payee: args.payee, amount, paymentMethod: args.paymentMethod, accountId: args.accountId }),
      details: `Bank payment to ${args.payee} — ${currency} ${amount.toFixed(2)} via ${args.paymentMethod}`,
    });

    return txnId;
  },
});

// ─── Get Next Check Number ───────────────────────────────────

export const getNextCheckNumber = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const transactions = await ctx.db
      .query("bankTransactions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Extract check numbers from descriptions like "Check #1234 to ..."
    const checkNumbers: number[] = [];
    for (const txn of transactions) {
      const match = txn.description.match(/^Check #(\d+)/);
      if (match) {
        checkNumbers.push(parseInt(match[1], 10));
      }
    }

    const maxNumber = checkNumbers.length > 0 ? Math.max(...checkNumbers) : 0;
    const next = maxNumber + 1;
    return next.toString().padStart(4, "0");
  },
});

// ─── List Bank Operations ────────────────────────────────────

export const listBankOperations = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    type: v.optional(
      v.union(
        v.literal("check"),
        v.literal("expense"),
        v.literal("payment"),
        v.literal("petty_cash"),
        v.literal("all"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let transactions;
    if (args.accountId) {
      transactions = await ctx.db
        .query("bankTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId!))
        .order("desc")
        .take(200);
    } else {
      transactions = await ctx.db.query("bankTransactions").order("desc").take(200);
    }

    // Filter to debits only
    let debits = transactions.filter((t) => t.type === "debit");

    const filterType = args.type ?? "all";
    if (filterType !== "all") {
      debits = debits.filter((t) => {
        switch (filterType) {
          case "check":
            return t.description.startsWith("Check #");
          case "expense":
            return t.description.startsWith("Expense:");
          case "payment":
            return t.description.startsWith("Payment to");
          case "petty_cash":
            return t.description.startsWith("Petty Cash:");
          default:
            return true;
        }
      });
    }

    debits.sort((a, b) => b.date.localeCompare(a.date));
    return debits.slice(0, 100);
  },
});

// ─── Get Petty Cash Balance ──────────────────────────────────

export const getPettyCashBalance = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "bank"))
      .collect();
    const pettyCash = accounts.find(
      (a) => a.isActive && (a.subType?.toLowerCase().includes("petty cash") || a.name.toLowerCase().includes("petty cash")),
    );
    return pettyCash?.balance ?? 0;
  },
});

// ─── Replenish Petty Cash ────────────────────────────────────

export const replenishPettyCash = mutation({
  args: {
    fromAccountId: v.id("accounts"),
    amount: v.number(),
    date: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    const currency = await getDefaultCurrency(ctx);

    await enforcePostingDate(ctx, args.date);

    const amount = round2(args.amount);
    if (amount <= 0)
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });

    const fromAccount = await ctx.db.get(args.fromAccountId);
    if (!fromAccount) throw new ConvexError({ message: "Source account not found", code: "NOT_FOUND" });
    if (!fromAccount.isActive)
      throw new ConvexError({ message: "Source account is not active", code: "BAD_REQUEST" });

    const pettyCash = await getPettyCashAccount(ctx);
    if (pettyCash._id === args.fromAccountId) {
      throw new ConvexError({
        message: "Source account cannot be petty cash itself",
        code: "BAD_REQUEST",
      });
    }

    // Balanced transfer: Dr Petty Cash / Cr Source bank account
    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description: `Petty Cash Replenishment from ${fromAccount.name}`,
      reference: args.reference,
      createdBy: user._id,
      sourceType: PETTY_CASH_REPLENISH_SOURCE,
      lines: [
        { accountId: pettyCash._id, debit: amount, description: "Petty cash replenishment" },
        { accountId: args.fromAccountId, credit: amount, description: "Petty cash replenishment" },
      ],
    });

    await ctx.db.insert("bankTransactions", {
      accountId: args.fromAccountId,
      date: args.date,
      description: "Petty Cash Replenishment",
      amount,
      type: "debit",
      reference: args.reference,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });
    await ctx.db.insert("bankTransactions", {
      accountId: pettyCash._id,
      date: args.date,
      description: "Replenishment from bank",
      amount,
      type: "credit",
      reference: args.reference,
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:replenishPettyCash",
      resourceType: "banking",
      resourceId: pettyCash._id,
      action: "petty_cash_replenished",
      afterValue: JSON.stringify({ amount, fromAccountId: args.fromAccountId }),
      details: `Petty cash replenished — ${currency} ${amount.toFixed(2)} from ${fromAccount.name}`,
    });

    return pettyCash._id;
  },
});

// ─── Deposit to Bank ────────────────────────────────────────

export const depositToBank = mutation({
  args: {
    fromAccountId: v.id("accounts"),
    toAccountId: v.id("accounts"),
    amount: v.number(),
    date: v.string(),
    reference: v.optional(v.string()),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    const amount = round2(args.amount);
    if (amount <= 0)
      throw new ConvexError({ message: "Amount must be greater than zero", code: "BAD_REQUEST" });

    const fromAccount = await ctx.db.get(args.fromAccountId);
    if (!fromAccount)
      throw new ConvexError({ message: "Source account not found", code: "NOT_FOUND" });
    if (!fromAccount.isActive)
      throw new ConvexError({ message: "Source account is not active", code: "BAD_REQUEST" });

    const toAccount = await ctx.db.get(args.toAccountId);
    if (!toAccount)
      throw new ConvexError({ message: "Destination account not found", code: "NOT_FOUND" });
    if (!toAccount.isActive)
      throw new ConvexError({ message: "Destination account is not active", code: "BAD_REQUEST" });

    if (args.fromAccountId === args.toAccountId) {
      throw new ConvexError({
        message: "Source and destination accounts must be different",
        code: "BAD_REQUEST",
      });
    }

    // Balanced transfer: Dr Destination / Cr Source
    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description: `Deposit from ${fromAccount.name} to ${toAccount.name}`,
      reference: args.reference,
      createdBy: user._id,
      sourceType: BANK_TRANSFER_SOURCE,
      lines: [
        { accountId: args.toAccountId, debit: amount, description: `Deposit from ${fromAccount.name}` },
        { accountId: args.fromAccountId, credit: amount, description: `Deposit to ${toAccount.name}` },
      ],
    });

    await ctx.db.insert("bankTransactions", {
      accountId: args.fromAccountId,
      date: args.date,
      description: `Deposit to ${toAccount.name}`,
      amount,
      type: "debit",
      reference: args.reference,
      category: "Transfer",
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });
    await ctx.db.insert("bankTransactions", {
      accountId: args.toAccountId,
      date: args.date,
      description: `Deposit from ${fromAccount.name}`,
      amount,
      type: "credit",
      reference: args.reference,
      category: "Transfer",
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:depositToBank",
      resourceType: "banking",
      resourceId: args.toAccountId,
      action: "bank_deposit_made",
      afterValue: JSON.stringify({ fromAccountId: args.fromAccountId, toAccountId: args.toAccountId, amount }),
      details: `Deposited ${amount.toFixed(2)} from ${fromAccount.name} to ${toAccount.name}`,
    });

    return args.toAccountId;
  },
});

// ─── Write Split Payment ─────────────────────────────────────
//
// One bank payment split across multiple expense accounts:
//   Dr Expense (per split line) / Cr Bank (total).

export const writeSplitPayment = mutation({
  args: {
    accountId: v.id("accounts"),          // bank account to draw from
    payee: v.string(),
    date: v.string(),
    reference: v.optional(v.string()),
    memo: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    splits: v.array(v.object({
      accountId: v.id("accounts"),         // expense account to debit
      amount: v.number(),
      description: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<Id<"bankTransactions">> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    if (args.splits.length === 0) throw new ConvexError({ message: "At least one split line is required", code: "BAD_REQUEST" });

    const total = round2(args.splits.reduce((s, l) => s + l.amount, 0));
    if (total <= 0) throw new ConvexError({ message: "Total amount must be greater than zero", code: "BAD_REQUEST" });

    const bankAccount = await ctx.db.get(args.accountId);
    if (!bankAccount) throw new ConvexError({ message: "Bank account not found", code: "NOT_FOUND" });

    const currency = await getDefaultCurrency(ctx);
    const description = `Split payment to ${args.payee}`;

    // Build lines: one debit per split, one credit to bank
    const lines: Array<{ accountId: Id<"accounts">; debit?: number; credit?: number; description?: string }> = [
      ...args.splits.map((s) => ({
        accountId: s.accountId,
        debit: round2(s.amount),
        description: s.description ?? description,
      })),
      { accountId: args.accountId, credit: total, description },
    ];

    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description,
      reference: args.reference,
      notes: args.memo,
      createdBy: user._id,
      sourceType: BANK_PAYMENT_SOURCE,
      lines,
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description,
      amount: total,
      type: "debit",
      reference: args.reference,
      category: "Split Payment",
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:writeSplitPayment",
      resourceType: "banking",
      resourceId: txnId,
      action: "split_payment_recorded",
      afterValue: JSON.stringify({ payee: args.payee, total, splits: args.splits.length, accountId: args.accountId }),
      details: `Split payment to ${args.payee} — ${currency} ${total.toFixed(2)} (${args.splits.length} lines)`,
    });

    return txnId;
  },
});

// ─── Write Split Check ───────────────────────────────────────
//
// One cheque split across multiple expense accounts:
//   Dr Expense (per split line) / Cr Bank (total).

export const writeSplitCheck = mutation({
  args: {
    accountId: v.id("accounts"),
    payee: v.string(),
    checkNumber: v.string(),
    date: v.string(),
    memo: v.optional(v.string()),
    vendorId: v.optional(v.id("vendors")),
    splits: v.array(v.object({
      accountId: v.id("accounts"),
      amount: v.number(),
      description: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<Id<"bankTransactions">> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    if (args.splits.length === 0) throw new ConvexError({ message: "At least one split line is required", code: "BAD_REQUEST" });

    const total = round2(args.splits.reduce((s, l) => s + l.amount, 0));
    if (total <= 0) throw new ConvexError({ message: "Total amount must be greater than zero", code: "BAD_REQUEST" });

    const bankAccount = await ctx.db.get(args.accountId);
    if (!bankAccount) throw new ConvexError({ message: "Bank account not found", code: "NOT_FOUND" });

    const currency = await getDefaultCurrency(ctx);
    const description = `Check #${args.checkNumber} to ${args.payee}`;

    const lines: Array<{ accountId: Id<"accounts">; debit?: number; credit?: number; description?: string }> = [
      ...args.splits.map((s) => ({
        accountId: s.accountId,
        debit: round2(s.amount),
        description: s.description ?? description,
      })),
      { accountId: args.accountId, credit: total, description },
    ];

    const entryId = await postBalancedEntry(ctx, {
      date: args.date,
      description,
      reference: args.checkNumber,
      notes: args.memo,
      createdBy: user._id,
      sourceType: BANK_CHECK_SOURCE,
      lines,
    });

    const txnId = await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description,
      amount: total,
      type: "debit",
      reference: args.checkNumber,
      category: "Split Check",
      isReconciled: false,
      matchedJournalEntryId: entryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "bankingOperations:writeSplitCheck",
      resourceType: "banking",
      resourceId: txnId,
      action: "split_check_written",
      afterValue: JSON.stringify({ checkNumber: args.checkNumber, payee: args.payee, total, splits: args.splits.length }),
      details: `Split check #${args.checkNumber} to ${args.payee} — ${currency} ${total.toFixed(2)} (${args.splits.length} lines)`,
    });

    return txnId;
  },
});
