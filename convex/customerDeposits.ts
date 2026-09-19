import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { postBalancedEntry, getControlAccounts, reverseEntriesForSource, round2 } from "./lib/ledger.ts";
import { enforcePostingDate } from "./closingDate.ts";
import { requireCashAccount } from "./lib/salesPosting.ts";
import { logAudit } from "./lib/audit.ts";

// Source-type tags — values live in lib/sourceTypes.ts, re-exported here for
// existing imports that reference this module directly.
import {
  CUSTOMER_DEPOSIT_SOURCE,
  DEPOSIT_APPLICATION_SOURCE,
  CUSTOMER_DEPOSIT_REFUND_SOURCE,
} from "./lib/sourceTypes.ts";

export const list = query({
  args: {
    customerId: v.optional(v.id("customers")),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("fully_applied"),
      v.literal("refunded"),
      v.literal("void")
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    let deposits;
    if (args.customerId) {
      deposits = await ctx.db
        .query("customerDeposits")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .order("desc")
        .collect();
    } else if (args.status) {
      deposits = await ctx.db
        .query("customerDeposits")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      deposits = await ctx.db
        .query("customerDeposits")
        .withIndex("by_date")
        .order("desc")
        .collect();
    }

    // Enrich with customer name
    const enriched = await Promise.all(
      deposits.map(async (dep) => {
        const customer = await ctx.db.get(dep.customerId);
        return { ...dep, customerName: customer?.name ?? "Unknown" };
      })
    );
    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("customerDeposits") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const deposit = await ctx.db.get(args.id);
    if (!deposit) {
      throw new ConvexError({ message: "Deposit not found", code: "NOT_FOUND" });
    }
    const customer = await ctx.db.get(deposit.customerId);
    return { ...deposit, customerName: customer?.name ?? "Unknown" };
  },
});

export const getCustomerBalance = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const deposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    const totalDeposited = deposits.reduce((sum, d) => sum + d.amount, 0);
    const totalApplied = deposits.reduce((sum, d) => sum + d.appliedAmount, 0);
    const availableBalance = deposits
      .filter((d) => d.status === "active")
      .reduce((sum, d) => sum + d.balance, 0);

    return { totalDeposited, totalApplied, availableBalance, depositCount: deposits.length };
  },
});

export const getApplications = query({
  args: { depositId: v.id("customerDeposits") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const applications = await ctx.db
      .query("depositApplications")
      .withIndex("by_deposit", (q) => q.eq("depositId", args.depositId))
      .collect();

    const enriched = await Promise.all(
      applications.map(async (app) => {
        const invoice = await ctx.db.get(app.invoiceId);
        return { ...app, invoiceNumber: invoice?.invoiceNumber ?? "Unknown" };
      })
    );
    return enriched;
  },
});

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    date: v.string(),
    amount: v.number(),
    type: v.union(v.literal("deposit"), v.literal("retainer")),
    paymentMethod: v.optional(v.union(
      v.literal("cash"),
      v.literal("check"),
      v.literal("bank_transfer"),
      v.literal("credit_card"),
      v.literal("other")
    )),
    referenceNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    }

    // A deposit is money received, so it must land in a real cash/bank account.
    await requireCashAccount(ctx, args.accountId);

    // Generate deposit number
    const allDeposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_date")
      .order("desc")
      .take(1);
    const nextNum = allDeposits.length > 0
      ? parseInt(allDeposits[0].depositNumber.replace("DEP-", ""), 10) + 1
      : 1001;
    const depositNumber = `DEP-${nextNum}`;

    const depositId = await ctx.db.insert("customerDeposits", {
      depositNumber,
      customerId: args.customerId,
      date: args.date,
      amount: args.amount,
      appliedAmount: 0,
      balance: args.amount,
      type: args.type,
      status: "active",
      paymentMethod: args.paymentMethod,
      referenceNumber: args.referenceNumber,
      description: args.description,
      notes: args.notes,
      accountId: args.accountId,
      createdBy: user._id,
    });

    // Money received into a cash/bank account: Dr Cash / Cr Customer Deposits.
    const control = await getControlAccounts(ctx);
    await postBalancedEntry(ctx, {
      date: args.date,
      description: `Customer deposit ${depositNumber}`,
      reference: args.referenceNumber,
      createdBy: user._id,
      sourceType: CUSTOMER_DEPOSIT_SOURCE,
      sourceId: depositId,
      lines: [
        { accountId: args.accountId, debit: args.amount, description: "Deposit received" },
        { accountId: control.customerDeposits._id, credit: args.amount, description: "Customer deposit liability" },
      ],
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "customerDeposits:create",
      resourceType: "deposit",
      resourceId: depositId,
      action: "deposit_created",
      afterValue: JSON.stringify({ depositId, depositNumber, amount: args.amount, customerId: args.customerId, type: args.type }),
      details: `Deposit ${depositNumber} created for $${args.amount}`,
    });

    return depositId;
  },
});

export const update = mutation({
  args: {
    id: v.id("customerDeposits"),
    date: v.optional(v.string()),
    amount: v.optional(v.number()),
    type: v.optional(v.union(v.literal("deposit"), v.literal("retainer"))),
    paymentMethod: v.optional(v.union(
      v.literal("cash"),
      v.literal("check"),
      v.literal("bank_transfer"),
      v.literal("credit_card"),
      v.literal("other")
    )),
    referenceNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const deposit = await ctx.db.get(args.id);
    if (!deposit) {
      throw new ConvexError({ message: "Deposit not found", code: "NOT_FOUND" });
    }
    if (deposit.status !== "active") {
      throw new ConvexError({ message: "Only active deposits can be edited", code: "BAD_REQUEST" });
    }
    if (deposit.appliedAmount > 0) {
      throw new ConvexError({ message: "Cannot edit a deposit that has applications", code: "BAD_REQUEST" });
    }

    const updates: Record<string, unknown> = {};
    if (args.date !== undefined) updates.date = args.date;
    if (args.type !== undefined) updates.type = args.type;
    if (args.paymentMethod !== undefined) updates.paymentMethod = args.paymentMethod;
    if (args.referenceNumber !== undefined) updates.referenceNumber = args.referenceNumber;
    if (args.description !== undefined) updates.description = args.description;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.accountId !== undefined) updates.accountId = args.accountId;
    if (args.amount !== undefined && args.amount > 0) {
      updates.amount = args.amount;
      updates.balance = args.amount - deposit.appliedAmount;
    }

    await ctx.db.patch(args.id, updates);

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const afterDeposit = await ctx.db.get(args.id);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "customerDeposits:update",
      resourceType: "deposit",
      resourceId: args.id,
      action: "deposit_updated",
      beforeValue: JSON.stringify(deposit),
      afterValue: JSON.stringify(afterDeposit),
      details: `Deposit ${deposit.depositNumber} updated`,
    });
  },
});

export const applyToInvoice = mutation({
  args: {
    depositId: v.id("customerDeposits"),
    invoiceId: v.id("invoices"),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) {
      throw new ConvexError({ message: "Deposit not found", code: "NOT_FOUND" });
    }
    if (deposit.status !== "active") {
      throw new ConvexError({ message: "Deposit is not active", code: "BAD_REQUEST" });
    }
    if (args.amount <= 0) {
      throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    }
    if (args.amount > deposit.balance) {
      throw new ConvexError({ message: "Amount exceeds deposit balance", code: "BAD_REQUEST" });
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    }
    if (invoice.status === "void") {
      throw new ConvexError({ message: "Cannot apply a deposit to a void invoice", code: "BAD_REQUEST" });
    }
    // Never apply more than the invoice still owes.
    const invoiceRemaining = round2((invoice.totalAmount ?? 0) - (invoice.amountPaid ?? 0));
    if (args.amount > invoiceRemaining + 0.01) {
      throw new ConvexError({
        message: `Amount exceeds the invoice's remaining balance (${invoiceRemaining})`,
        code: "BAD_REQUEST",
      });
    }

    // Create application record
    const today = new Date().toISOString().split("T")[0];
    await ctx.db.insert("depositApplications", {
      depositId: args.depositId,
      invoiceId: args.invoiceId,
      amount: args.amount,
      date: today,
      notes: args.notes,
      appliedBy: user._id,
    });

    // Update deposit balances
    const newAppliedAmount = deposit.appliedAmount + args.amount;
    const newBalance = deposit.amount - newAppliedAmount;
    const newStatus = newBalance <= 0 ? "fully_applied" as const : "active" as const;

    await ctx.db.patch(args.depositId, {
      appliedAmount: newAppliedAmount,
      balance: newBalance,
      status: newStatus,
    });

    // Reduce the invoice's outstanding balance by the applied amount.
    const newInvoicePaid = round2((invoice.amountPaid ?? 0) + args.amount);
    await ctx.db.patch(args.invoiceId, {
      amountPaid: newInvoicePaid,
      status: newInvoicePaid >= (invoice.totalAmount ?? 0) ? "paid" : "partially_paid",
    });

    // Settle the receivable against the held deposit: Dr Customer Deposits / Cr AR.
    const control = await getControlAccounts(ctx);
    await postBalancedEntry(ctx, {
      date: today,
      description: `Deposit ${deposit.depositNumber} applied to invoice ${invoice.invoiceNumber}`,
      createdBy: user._id,
      sourceType: DEPOSIT_APPLICATION_SOURCE,
      sourceId: args.invoiceId,
      lines: [
        { accountId: control.customerDeposits._id, debit: args.amount, description: "Release customer deposit" },
        { accountId: control.ar._id, credit: args.amount, description: "Reduce receivable" },
      ],
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "customerDeposits:applyToInvoice",
      resourceType: "deposit",
      resourceId: args.depositId,
      action: "deposit_applied",
      afterValue: JSON.stringify({ depositId: args.depositId, invoiceId: args.invoiceId, amount: args.amount, newBalance, newStatus }),
      details: `Deposit ${deposit.depositNumber} applied $${args.amount} to invoice ${invoice.invoiceNumber}`,
    });

    return { newBalance, newStatus };
  },
});

export const voidDeposit = mutation({
  args: { id: v.id("customerDeposits") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const deposit = await ctx.db.get(args.id);
    if (!deposit) {
      throw new ConvexError({ message: "Deposit not found", code: "NOT_FOUND" });
    }
    if (deposit.appliedAmount > 0) {
      throw new ConvexError({ message: "Cannot void a deposit with applications", code: "BAD_REQUEST" });
    }
    await enforcePostingDate(ctx, deposit.date);
    // Reverse the original Dr Cash / Cr Customer Deposits posting, if any.
    await reverseEntriesForSource(ctx, CUSTOMER_DEPOSIT_SOURCE, args.id, {
      date: deposit.date,
      description: `Void of customer deposit ${deposit.depositNumber}`,
    });
    await ctx.db.patch(args.id, { status: "void" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "customerDeposits:voidDeposit",
      resourceType: "deposit",
      resourceId: args.id,
      action: "deposit_voided",
      beforeValue: JSON.stringify(deposit),
      afterValue: JSON.stringify({ ...deposit, status: "void" }),
      reason: "Deposit voided",
      details: `Deposit ${deposit.depositNumber} voided`,
    });
  },
});

export const refund = mutation({
  args: { id: v.id("customerDeposits") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const deposit = await ctx.db.get(args.id);
    if (!deposit) {
      throw new ConvexError({ message: "Deposit not found", code: "NOT_FOUND" });
    }
    if (deposit.status !== "active") {
      throw new ConvexError({ message: "Only active deposits can be refunded", code: "BAD_REQUEST" });
    }
    // Refund the remaining balance: Dr Customer Deposits / Cr Cash-or-Bank.
    const refundAmount = round2(deposit.balance);
    if (deposit.accountId && refundAmount > 0) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
      if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
      await requireCashAccount(ctx, deposit.accountId);
      const control = await getControlAccounts(ctx);
      await postBalancedEntry(ctx, {
        date: new Date().toISOString().split("T")[0],
        description: `Refund of customer deposit ${deposit.depositNumber}`,
        createdBy: user._id,
        sourceType: CUSTOMER_DEPOSIT_REFUND_SOURCE,
        sourceId: args.id,
        lines: [
          { accountId: control.customerDeposits._id, debit: refundAmount, description: "Release customer deposit" },
          { accountId: deposit.accountId, credit: refundAmount, description: "Deposit refunded" },
        ],
      });
    }
    await ctx.db.patch(args.id, { status: "refunded", balance: 0 });

    const refundUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!refundUser) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await logAudit(ctx, {
      userId: refundUser._id,
      mutationName: "customerDeposits:refund",
      resourceType: "deposit",
      resourceId: args.id,
      action: "deposit_refunded",
      beforeValue: JSON.stringify(deposit),
      afterValue: JSON.stringify({ ...deposit, status: "refunded", balance: 0 }),
      details: `Deposit ${deposit.depositNumber} refunded $${refundAmount}`,
    });
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const activeDeposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const totalActive = activeDeposits.reduce((sum, d) => sum + d.balance, 0);
    const totalDeposits = activeDeposits.reduce((sum, d) => sum + d.amount, 0);
    const totalApplied = activeDeposits.reduce((sum, d) => sum + d.appliedAmount, 0);

    return {
      activeCount: activeDeposits.length,
      totalActive,
      totalDeposits,
      totalApplied,
    };
  },
});
