import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { enforcePostingDate } from "./closingDate.ts";
import { postBalancedEntry, getControlAccounts } from "./lib/ledger.ts";
import { requireCashAccount } from "./lib/salesPosting.ts";
import { PAYMENT_SOURCE } from "./lib/sourceTypes.ts";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

const PAYMENT_METHOD_VALIDATOR = v.union(
  v.literal("cash"),
  v.literal("credit_card"),
  v.literal("debit_card"),
  v.literal("bank_transfer"),
  v.literal("cheque"),
  v.literal("paypal"),
  v.literal("mobile_pay"),
  v.literal("store_credit"),
  v.literal("other")
);

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }; db: unknown }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Payment Methods Configuration ──────────────────────────

export const listPaymentMethods = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.activeOnly) {
      return await ctx.db
        .query("paymentMethods")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("paymentMethods").collect();
  },
});

export const seedPaymentMethods = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    // Check if already seeded
    const existing = await ctx.db.query("paymentMethods").take(1);
    if (existing.length > 0) return;

    const methods = [
      { name: "Cash", code: "cash" as const, description: "Physical currency payment", requiresReference: false, sortOrder: 1, icon: "banknote" },
      { name: "Credit Card", code: "credit_card" as const, description: "Visa, Mastercard, Amex", requiresReference: true, sortOrder: 2, icon: "credit-card" },
      { name: "Debit Card", code: "debit_card" as const, description: "Direct debit from bank", requiresReference: true, sortOrder: 3, icon: "credit-card" },
      { name: "Bank Transfer", code: "bank_transfer" as const, description: "Wire or ACH transfer", requiresReference: true, sortOrder: 4, icon: "landmark" },
      { name: "Cheque", code: "cheque" as const, description: "Bank cheque / check", requiresReference: true, sortOrder: 5, icon: "file-text" },
      { name: "PayPal", code: "paypal" as const, description: "PayPal digital wallet", requiresReference: true, sortOrder: 6, icon: "wallet" },
      { name: "Mobile Pay", code: "mobile_pay" as const, description: "Apple Pay, Google Pay, etc.", requiresReference: false, sortOrder: 7, icon: "smartphone" },
      { name: "Store Credit", code: "store_credit" as const, description: "Customer credit balance", requiresReference: false, sortOrder: 8, icon: "ticket" },
      { name: "Other", code: "other" as const, description: "Other payment method", requiresReference: true, sortOrder: 9, icon: "circle-dot" },
    ];

    for (const method of methods) {
      await ctx.db.insert("paymentMethods", { ...method, isActive: true });
    }
  },
});

export const updatePaymentMethod = mutation({
  args: {
    id: v.id("paymentMethods"),
    isActive: v.optional(v.boolean()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    requiresReference: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new ConvexError({ message: "Payment method not found", code: "NOT_FOUND" });

    const patch: Record<string, unknown> = {};
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.sortOrder !== undefined) patch.sortOrder = updates.sortOrder;
    if (updates.requiresReference !== undefined) patch.requiresReference = updates.requiresReference;

    await ctx.db.patch(id, patch);
  },
});

// ─── Enhanced Payment Recording ─────────────────────────────

export const recordPayment = mutation({
  args: {
    invoiceId: v.optional(v.id("invoices")),
    saleId: v.optional(v.id("sales")),
    date: v.string(),
    amount: v.number(),
    method: PAYMENT_METHOD_VALIDATOR,
    reference: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"payments">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Payment amount must be positive", code: "BAD_REQUEST" });
    }

    // If paying an invoice, validate and update it
    if (args.invoiceId) {
      const invoice = await ctx.db.get(args.invoiceId);
      if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

      if (invoice.status === "void") {
        throw new ConvexError({ message: "Cannot record payment on a void invoice", code: "BAD_REQUEST" });
      }

      const remainingBalance = invoice.totalAmount - invoice.amountPaid;
      if (args.amount > remainingBalance + 0.01) {
        throw new ConvexError({
          message: `Payment amount (${args.amount}) exceeds remaining balance (${Math.round(remainingBalance * 100) / 100})`,
          code: "BAD_REQUEST",
        });
      }

      // Update invoice
      const newAmountPaid = Math.round((invoice.amountPaid + args.amount) * 100) / 100;
      const newStatus = newAmountPaid >= invoice.totalAmount ? "paid" as const : "partially_paid" as const;
      await ctx.db.patch(args.invoiceId, { amountPaid: newAmountPaid, status: newStatus });
    }

    const paymentId = await ctx.db.insert("payments", {
      invoiceId: args.invoiceId,
      saleId: args.saleId,
      date: args.date,
      amount: args.amount,
      method: args.method,
      reference: args.reference,
      cardLast4: args.cardLast4,
      cardBrand: args.cardBrand,
      accountId: args.accountId,
      notes: args.notes,
      recordedBy: user._id,
    });

    // Post the receipt through the ledger for invoice payments (Dr Cash / Cr AR).
    // Payments against a POS sale are NOT posted here: sales.createSale already
    // booked Dr Cash / Cr Revenue, so posting again would double-count.
    if (args.invoiceId) {
      if (!args.accountId) {
        throw new ConvexError({
          message: "Select a cash or bank account to receive this payment",
          code: "BAD_REQUEST",
        });
      }
      const account = await requireCashAccount(ctx, args.accountId);
      const control = await getControlAccounts(ctx);
      const invoice = await ctx.db.get(args.invoiceId);
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Invoice payment received${invoice ? `: ${invoice.invoiceNumber}` : ""}`,
        reference: args.reference,
        createdBy: user._id,
        sourceType: PAYMENT_SOURCE,
        sourceId: paymentId,
        lines: [
          { accountId: account._id, debit: args.amount, description: "Cash/bank received" },
          { accountId: control.ar._id, credit: args.amount, description: "Accounts receivable" },
        ],
      });
      await ctx.db.insert("bankTransactions", {
        accountId: account._id,
        date: args.date,
        description: `Invoice payment received${invoice ? `: ${invoice.invoiceNumber}` : ""}`,
        amount: args.amount,
        type: "credit",
        reference: args.reference,
        category: "Invoice Payment",
        isReconciled: false,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "payments:recordPayment",
      resourceType: "payment",
      resourceId: paymentId,
      action: "payment_recorded",
      afterValue: JSON.stringify({ paymentId, amount: args.amount, invoiceId: args.invoiceId, saleId: args.saleId, method: args.method }),
      details: `Payment of $${args.amount} recorded via ${args.method}`,
    });

    return paymentId;
  },
});

// Record split payment (multiple methods for one transaction)
export const recordSplitPayment = mutation({
  args: {
    invoiceId: v.optional(v.id("invoices")),
    saleId: v.optional(v.id("sales")),
    date: v.string(),
    splits: v.array(v.object({
      method: PAYMENT_METHOD_VALIDATOR,
      amount: v.number(),
      reference: v.optional(v.string()),
      cardLast4: v.optional(v.string()),
      cardBrand: v.optional(v.string()),
      // Real cash/bank account for this split (required for invoice payments).
      accountId: v.optional(v.id("accounts")),
    })),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"payments">[]> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    if (args.splits.length === 0) {
      throw new ConvexError({ message: "At least one payment split is required", code: "BAD_REQUEST" });
    }

    const totalAmount = args.splits.reduce((sum, s) => sum + s.amount, 0);
    if (totalAmount <= 0) {
      throw new ConvexError({ message: "Total payment amount must be positive", code: "BAD_REQUEST" });
    }

    // Validate against invoice balance if applicable
    if (args.invoiceId) {
      const invoice = await ctx.db.get(args.invoiceId);
      if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
      if (invoice.status === "void") {
        throw new ConvexError({ message: "Cannot pay a void invoice", code: "BAD_REQUEST" });
      }
      const remaining = invoice.totalAmount - invoice.amountPaid;
      if (totalAmount > remaining + 0.01) {
        throw new ConvexError({ message: `Total splits (${totalAmount.toFixed(2)}) exceed remaining balance (${remaining.toFixed(2)})`, code: "BAD_REQUEST" });
      }

      // Update invoice
      const newAmountPaid = Math.round((invoice.amountPaid + totalAmount) * 100) / 100;
      const newStatus = newAmountPaid >= invoice.totalAmount ? "paid" as const : "partially_paid" as const;
      await ctx.db.patch(args.invoiceId, { amountPaid: newAmountPaid, status: newStatus });
    }

    const control = args.invoiceId ? await getControlAccounts(ctx) : null;
    const invoice = args.invoiceId ? await ctx.db.get(args.invoiceId) : null;

    const paymentIds: Id<"payments">[] = [];
    for (const split of args.splits) {
      const paymentId = await ctx.db.insert("payments", {
        invoiceId: args.invoiceId,
        saleId: args.saleId,
        date: args.date,
        amount: split.amount,
        method: split.method,
        reference: split.reference,
        cardLast4: split.cardLast4,
        cardBrand: split.cardBrand,
        accountId: split.accountId,
        notes: args.notes,
        recordedBy: user._id,
      });
      paymentIds.push(paymentId);

      // Post the receipt for invoice payments (Dr Cash / Cr AR). Payments against
      // a POS sale are NOT posted here — sales.createSale already booked cash/revenue.
      if (args.invoiceId && control) {
        if (!split.accountId) {
          throw new ConvexError({
            message: "Select a cash or bank account for each payment split",
            code: "BAD_REQUEST",
          });
        }
        const account = await requireCashAccount(ctx, split.accountId);
        await postBalancedEntry(ctx, {
          date: args.date,
          description: `Invoice payment received${invoice ? `: ${invoice.invoiceNumber}` : ""}`,
          reference: split.reference,
          createdBy: user._id,
          sourceType: PAYMENT_SOURCE,
          sourceId: paymentId,
          lines: [
            { accountId: account._id, debit: split.amount, description: "Cash/bank received" },
            { accountId: control.ar._id, credit: split.amount, description: "Accounts receivable" },
          ],
        });
        await ctx.db.insert("bankTransactions", {
          accountId: account._id,
          date: args.date,
          description: `Invoice payment received${invoice ? `: ${invoice.invoiceNumber}` : ""}`,
          amount: split.amount,
          type: "credit",
          reference: split.reference,
          category: "Invoice Payment",
          isReconciled: false,
        });
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "payments:recordSplitPayment",
      resourceType: "payment",
      resourceId: paymentIds[0],
      action: "split_payment_recorded",
      afterValue: JSON.stringify({ paymentIds, totalAmount, splitCount: args.splits.length, invoiceId: args.invoiceId }),
      details: `Split payment of $${totalAmount.toFixed(2)} across ${args.splits.length} methods`,
    });

    return paymentIds;
  },
});

// ─── Payment Queries ────────────────────────────────────────

export const listPayments = query({
  args: {
    invoiceId: v.optional(v.id("invoices")),
    saleId: v.optional(v.id("sales")),
    method: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.invoiceId) {
      return await ctx.db
        .query("payments")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId!))
        .collect();
    }

    if (args.saleId) {
      return await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", args.saleId!))
        .collect();
    }

    // Return recent payments
    const allPayments = await ctx.db.query("payments").order("desc").take(100);

    if (args.method) {
      return allPayments.filter((p) => p.method === args.method);
    }
    return allPayments;
  },
});

export const getPayment = query({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const payment = await ctx.db.get(args.id);
    if (!payment) return null;

    let invoiceNumber: string | undefined;
    let customerName: string | undefined;
    let customerEmail: string | undefined;
    let customerPhone: string | undefined;
    let customerAddress: string | undefined;
    let saleDate: string | undefined;

    if (payment.invoiceId) {
      const invoice = await ctx.db.get(payment.invoiceId);
      if (invoice) {
        invoiceNumber = invoice.invoiceNumber;
        const customer = await ctx.db.get(invoice.customerId);
        if (customer) {
          customerName = customer.name;
          customerEmail = customer.email;
          customerPhone = customer.phone;
          customerAddress = customer.address;
        }
      }
    }

    if (payment.saleId) {
      const sale = await ctx.db.get(payment.saleId);
      if (sale) {
        saleDate = sale.date;
      }
    }

    return {
      ...payment,
      invoiceNumber,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      saleDate,
    };
  },
});

export const getPaymentSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const payments = await ctx.db.query("payments").collect();
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    let totalToday = 0;
    let totalWeek = 0;
    let totalAll = 0;
    const byMethod: Record<string, number> = {};

    for (const payment of payments) {
      totalAll += payment.amount;
      if (payment.date === today) totalToday += payment.amount;
      if (payment.date >= weekAgo) totalWeek += payment.amount;

      byMethod[payment.method] = (byMethod[payment.method] ?? 0) + payment.amount;
    }

    return {
      totalToday: Math.round(totalToday * 100) / 100,
      totalWeek: Math.round(totalWeek * 100) / 100,
      totalAll: Math.round(totalAll * 100) / 100,
      byMethod,
      transactionCount: payments.length,
    };
  },
});

// ─── Payment Plans ──────────────────────────────────────────

export const createPaymentPlan = mutation({
  args: {
    invoiceId: v.id("invoices"),
    installments: v.number(),
    frequency: v.union(v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
    startDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"paymentPlans">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    if (invoice.status === "paid" || invoice.status === "void") {
      throw new ConvexError({ message: "Cannot create payment plan for paid/void invoice", code: "BAD_REQUEST" });
    }

    if (args.installments < 2 || args.installments > 24) {
      throw new ConvexError({ message: "Installments must be between 2 and 24", code: "BAD_REQUEST" });
    }

    // Check no existing active plan
    const existingPlans = await ctx.db
      .query("paymentPlans")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();
    const activePlan = existingPlans.find((p) => p.status === "active");
    if (activePlan) {
      throw new ConvexError({ message: "An active payment plan already exists for this invoice", code: "CONFLICT" });
    }

    const remainingAmount = invoice.totalAmount - invoice.amountPaid;

    return await ctx.db.insert("paymentPlans", {
      invoiceId: args.invoiceId,
      customerId: invoice.customerId,
      totalAmount: Math.round(remainingAmount * 100) / 100,
      installments: args.installments,
      frequency: args.frequency,
      startDate: args.startDate,
      status: "active",
      paidInstallments: 0,
      nextDueDate: args.startDate,
      notes: args.notes,
      createdBy: user._id,
    });
  },
});

export const listPaymentPlans = query({
  args: {
    status: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.status) {
      const plans = await ctx.db
        .query("paymentPlans")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "active" | "completed" | "defaulted" | "cancelled")
        )
        .collect();
      if (args.customerId) return plans.filter((p) => p.customerId === args.customerId);
      return plans;
    }

    if (args.customerId) {
      return await ctx.db
        .query("paymentPlans")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    }

    return await ctx.db.query("paymentPlans").order("desc").collect();
  },
});

export const recordInstallmentPayment = mutation({
  args: {
    planId: v.id("paymentPlans"),
    method: PAYMENT_METHOD_VALIDATOR,
    reference: v.optional(v.string()),
    accountId: v.id("accounts"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"payments">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new ConvexError({ message: "Payment plan not found", code: "NOT_FOUND" });

    if (plan.status !== "active") {
      throw new ConvexError({ message: "Payment plan is not active", code: "BAD_REQUEST" });
    }

    const account = await requireCashAccount(ctx, args.accountId);

    // Fetch the invoice up front so we never post more than it still owes.
    const invoice = await ctx.db.get(plan.invoiceId);
    const scheduled = Math.round((plan.totalAmount / plan.installments) * 100) / 100;
    const installmentAmount = invoice
      ? Math.min(scheduled, Math.round((invoice.totalAmount - invoice.amountPaid) * 100) / 100)
      : scheduled;
    if (installmentAmount <= 0) {
      throw new ConvexError({
        message: "This invoice is already fully paid",
        code: "BAD_REQUEST",
      });
    }
    const today = new Date().toISOString().split("T")[0];

    // Record payment against the invoice
    const paymentId = await ctx.db.insert("payments", {
      invoiceId: plan.invoiceId,
      date: today,
      amount: installmentAmount,
      method: args.method,
      reference: args.reference,
      accountId: args.accountId,
      notes: args.notes ?? `Installment ${plan.paidInstallments + 1} of ${plan.installments}`,
      recordedBy: user._id,
    });

    // Update plan
    const newPaidInstallments = plan.paidInstallments + 1;
    const isCompleted = newPaidInstallments >= plan.installments;

    // Calculate next due date
    let nextDueDate = plan.nextDueDate;
    if (!isCompleted) {
      const currentDue = new Date(plan.nextDueDate);
      if (plan.frequency === "weekly") {
        currentDue.setDate(currentDue.getDate() + 7);
      } else if (plan.frequency === "biweekly") {
        currentDue.setDate(currentDue.getDate() + 14);
      } else {
        currentDue.setMonth(currentDue.getMonth() + 1);
      }
      nextDueDate = currentDue.toISOString().split("T")[0];
    }

    await ctx.db.patch(args.planId, {
      paidInstallments: newPaidInstallments,
      status: isCompleted ? "completed" : "active",
      nextDueDate,
    });

    // Update invoice amountPaid
    if (invoice) {
      const newAmountPaid = Math.round((invoice.amountPaid + installmentAmount) * 100) / 100;
      const newStatus = newAmountPaid >= invoice.totalAmount ? "paid" as const : "partially_paid" as const;
      await ctx.db.patch(plan.invoiceId, { amountPaid: newAmountPaid, status: newStatus });
    }

    // Post the receipt through the ledger: Dr Cash / Cr AR.
    const control = await getControlAccounts(ctx);
    await postBalancedEntry(ctx, {
      date: today,
      description: `Installment payment${invoice ? `: ${invoice.invoiceNumber}` : ""}`,
      reference: args.reference,
      createdBy: user._id,
      sourceType: PAYMENT_SOURCE,
      sourceId: paymentId,
      lines: [
        { accountId: account._id, debit: installmentAmount, description: "Cash/bank received" },
        { accountId: control.ar._id, credit: installmentAmount, description: "Accounts receivable" },
      ],
    });
    await ctx.db.insert("bankTransactions", {
      accountId: account._id,
      date: today,
      description: `Installment payment${invoice ? `: ${invoice.invoiceNumber}` : ""}`,
      amount: installmentAmount,
      type: "credit",
      reference: args.reference,
      category: "Invoice Payment",
      isReconciled: false,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "payments:recordInstallmentPayment",
      resourceType: "payment",
      resourceId: paymentId,
      action: "installment_payment_recorded",
      afterValue: JSON.stringify({ paymentId, planId: args.planId, amount: installmentAmount, installment: newPaidInstallments, of: plan.installments }),
      details: `Installment ${newPaidInstallments} of ${plan.installments} — $${installmentAmount}`,
    });

    return paymentId;
  },
});

export const cancelPaymentPlan = mutation({
  args: { id: v.id("paymentPlans") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const plan = await ctx.db.get(args.id);
    if (!plan) throw new ConvexError({ message: "Payment plan not found", code: "NOT_FOUND" });
    if (plan.status !== "active") {
      throw new ConvexError({ message: "Only active plans can be cancelled", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, { status: "cancelled" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "payments:cancelPaymentPlan",
      resourceType: "paymentPlan",
      resourceId: args.id,
      action: "payment_plan_cancelled",
      beforeValue: JSON.stringify(plan),
      afterValue: JSON.stringify({ ...plan, status: "cancelled" }),
      details: `Payment plan cancelled`,
    });
  },
});
