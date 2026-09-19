import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { postBillPayment } from "./lib/payablesPosting.ts";
import { postBalancedEntry, getControlAccounts, round2 } from "./lib/ledger.ts";
import { SPLIT_BILL_PAYMENT_SOURCE } from "./lib/sourceTypes.ts";
import { requireCashAccount } from "./lib/salesPosting.ts";
import { logAudit } from "./lib/audit.ts";

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Get Payable Bills ───────────────────────────────────────────────────────

export const getPayableBills = query({
  args: { vendorId: v.optional(v.id("vendors")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let bills;
    if (args.vendorId) {
      bills = await ctx.db
        .query("bills")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!))
        .collect();
    } else {
      bills = await ctx.db.query("bills").collect();
    }

    // Only show unpaid, overdue, or partially_paid bills
    const payable = bills.filter(
      (b) => b.status === "unpaid" || b.status === "overdue" || b.status === "partially_paid"
    );

    // Enrich with vendor name
    const vendorIds = [...new Set(payable.map((b) => b.vendorId))];
    const vendorMap = new Map<string, string>();
    for (const vId of vendorIds) {
      const vendor = await ctx.db.get(vId);
      if (vendor) vendorMap.set(vId, vendor.name);
    }

    return payable.map((bill) => ({
      ...bill,
      vendorName: vendorMap.get(bill.vendorId) ?? "Unknown",
      balance: bill.amount - (bill.amountPaid ?? 0),
    })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },
});

// ─── Pay Single Bill ─────────────────────────────────────────────────────────

export const payBill = mutation({
  args: {
    billId: v.id("bills"),
    amount: v.number(),
    paymentDate: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("check"),
      v.literal("credit_card"),
      v.literal("vendor_credit"),
      v.literal("advance_settlement"),
      v.literal("other")
    ),
    referenceNumber: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    vendorCreditId: v.optional(v.id("vendorCredits")),
    advancePaymentId: v.optional(v.id("advancePayments")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const bill = await ctx.db.get(args.billId);
    if (!bill) throw new ConvexError({ message: "Bill not found", code: "NOT_FOUND" });

    const currentPaid = bill.amountPaid ?? 0;
    const balance = bill.amount - currentPaid;

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Payment amount must be positive", code: "BAD_REQUEST" });
    }
    if (args.amount > balance + 0.01) {
      throw new ConvexError({ message: "Payment exceeds balance due", code: "BAD_REQUEST" });
    }

    const newAmountPaid = currentPaid + args.amount;
    const isFullyPaid = newAmountPaid >= bill.amount - 0.01;

    // Determine the funding source for the balanced ledger posting.
    const fromVendorAdvance = args.paymentMethod === "advance_settlement";
    const fromVendorCredit = args.paymentMethod === "vendor_credit";
    const needsCashAccount = !fromVendorAdvance && !fromVendorCredit;
    if (needsCashAccount && !args.accountId) {
      throw new ConvexError({
        message: "Select a cash or bank account to pay from",
        code: "BAD_REQUEST",
      });
    }
    // Validate the cash/bank account up-front so we never leave a half-written state.
    if (needsCashAccount && args.accountId) {
      await requireCashAccount(ctx, args.accountId);
    }

    // Record the payment
    const paymentId = await ctx.db.insert("billPayments", {
      billId: args.billId,
      vendorId: bill.vendorId,
      amount: args.amount,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      referenceNumber: args.referenceNumber,
      vendorCreditId: args.vendorCreditId,
      advancePaymentId: args.advancePaymentId,
      notes: args.notes,
      createdBy: user._id,
    });

    // Update the bill
    await ctx.db.patch(args.billId, {
      amountPaid: Math.round(newAmountPaid * 100) / 100,
      status: isFullyPaid ? "paid" : "partially_paid",
      paidAt: isFullyPaid ? args.paymentDate : undefined,
    });

    // Record an informational bank-register row when paying from a cash/bank
    // account (the balance itself is moved by the ledger posting below).
    if (needsCashAccount && args.accountId) {
      await ctx.db.insert("bankTransactions", {
        accountId: args.accountId,
        date: args.paymentDate,
        description: `Bill payment: ${bill.title}${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
        amount: args.amount,
        type: "debit",
        reference: args.referenceNumber,
        category: "Bill Payment",
        isReconciled: false,
      });
    }

    // If using vendor credit, mark the credit as applied
    if (args.vendorCreditId) {
      await ctx.db.patch(args.vendorCreditId, { status: "applied" });
    }

    // If using advance settlement, update the advance's settled amount
    if (args.advancePaymentId) {
      const advance = await ctx.db.get(args.advancePaymentId);
      if (advance) {
        const newSettled = (advance.settledAmount ?? 0) + args.amount;
        const isFullySettled = newSettled >= advance.amount - 0.01;
        await ctx.db.patch(args.advancePaymentId, {
          settledAmount: Math.round(newSettled * 100) / 100,
          status: isFullySettled ? "settled" : "partially_settled",
        });
        // Record advance settlement
        await ctx.db.insert("advanceSettlements", {
          advanceId: args.advancePaymentId,
          billId: args.billId,
          amount: args.amount,
          date: args.paymentDate,
          notes: `Applied to bill: ${bill.title}`,
          settledBy: user._id,
        });
      }
    }

    // Post the balanced payment entry (Dr AP / Cr funding source). This is the
    // ONLY thing that moves account balances.
    await postBillPayment(ctx, {
      paymentId,
      amount: args.amount,
      date: args.paymentDate,
      description: `Bill payment: ${bill.title}${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
      createdBy: user._id,
      cashAccountId: needsCashAccount ? args.accountId : undefined,
      fromVendorAdvance,
      fromVendorCredit,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "billPayments:payBill",
      resourceType: "bill",
      resourceId: args.billId,
      action: "bill_paid",
      beforeValue: JSON.stringify(bill),
      afterValue: JSON.stringify({ ...bill, amountPaid: newAmountPaid, status: isFullyPaid ? "paid" : "partially_paid" }),
      details: `${bill.title} — Payment of $${args.amount}${isFullyPaid ? " (paid in full)" : ""}`,
    });

    return { newBalance: bill.amount - newAmountPaid, isFullyPaid };
  },
});

// ─── Pay Multiple Bills ──────────────────────────────────────────────────────

export const payMultipleBills = mutation({
  args: {
    payments: v.array(v.object({
      billId: v.id("bills"),
      amount: v.number(),
    })),
    paymentDate: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("check"),
      v.literal("credit_card"),
      v.literal("advance_settlement"),
      v.literal("other")
    ),
    referenceNumber: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ paidCount: number; totalPaid: number }> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    let paidCount = 0;
    let totalPaid = 0;

    // Batch payment always draws from a cash/bank account.
    if (!args.accountId) {
      throw new ConvexError({
        message: "Select a cash or bank account to pay from",
        code: "BAD_REQUEST",
      });
    }
    await requireCashAccount(ctx, args.accountId);

    for (const payment of args.payments) {
      const bill = await ctx.db.get(payment.billId);
      if (!bill) continue;

      const currentPaid = bill.amountPaid ?? 0;
      const balance = bill.amount - currentPaid;
      const payAmount = Math.min(payment.amount, balance);

      if (payAmount <= 0) continue;

      const newAmountPaid = currentPaid + payAmount;
      const isFullyPaid = newAmountPaid >= bill.amount - 0.01;

      const paymentId = await ctx.db.insert("billPayments", {
        billId: payment.billId,
        vendorId: bill.vendorId,
        amount: payAmount,
        paymentDate: args.paymentDate,
        paymentMethod: args.paymentMethod,
        referenceNumber: args.referenceNumber,
        notes: args.notes,
        createdBy: user._id,
      });

      await ctx.db.patch(payment.billId, {
        amountPaid: Math.round(newAmountPaid * 100) / 100,
        status: isFullyPaid ? "paid" : "partially_paid",
        paidAt: isFullyPaid ? args.paymentDate : undefined,
      });

      // Post a balanced entry per bill so each payment links to its source.
      await postBillPayment(ctx, {
        paymentId,
        amount: payAmount,
        date: args.paymentDate,
        description: `Bill payment: ${bill.title}${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
        createdBy: user._id,
        cashAccountId: args.accountId,
      });

      paidCount++;
      totalPaid += payAmount;
    }

    // Informational bank-register row for the batch (balances moved by ledger above).
    if (totalPaid > 0) {
      await ctx.db.insert("bankTransactions", {
        accountId: args.accountId,
        date: args.paymentDate,
        description: `Batch bill payment (${paidCount} bills)${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
        amount: Math.round(totalPaid * 100) / 100,
        type: "debit",
        reference: args.referenceNumber,
        category: "Bill Payment",
        isReconciled: false,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "billPayments:payMultipleBills",
      resourceType: "bill",
      resourceId: args.payments[0].billId,
      action: "bills_batch_paid",
      afterValue: JSON.stringify({ paidCount, totalPaid: Math.round(totalPaid * 100) / 100, paymentMethod: args.paymentMethod }),
      details: `Paid ${paidCount} bills totaling $${totalPaid.toFixed(2)}`,
    });

    return { paidCount, totalPaid: Math.round(totalPaid * 100) / 100 };
  },
});

// ─── Pay Multiple Bills With Allocations ──────────────────────────────────────
//
// Pays several bills with a SINGLE balanced journal entry (Dr AP per bill /
// Cr Bank total) and records a billPaymentAllocations junction row per bill so
// the split can be traced back from the one journal entry.

export const payMultipleBillsWithAllocations = mutation({
  args: {
    payments: v.array(v.object({
      billId: v.id("bills"),
      amount: v.number(),
    })),
    paymentDate: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("check"),
      v.literal("credit_card"),
      v.literal("other")
    ),
    referenceNumber: v.optional(v.string()),
    accountId: v.id("accounts"),    // bank/cash account to pay from
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ paidCount: number; totalPaid: number; journalEntryId: Id<"journalEntries"> }> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db.query("users").withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier)).unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    if (args.payments.length === 0) throw new ConvexError({ message: "No bills selected", code: "BAD_REQUEST" });

    await requireCashAccount(ctx, args.accountId);

    // Validate all bills exist and are payable, compute total
    let totalPaid = 0;
    const billDetails: Array<{ bill: Doc<"bills">; amount: number }> = [];

    for (const p of args.payments) {
      const bill = await ctx.db.get(p.billId);
      if (!bill) throw new ConvexError({ message: `Bill ${p.billId} not found`, code: "NOT_FOUND" });
      if (bill.status === "paid" || bill.status === "void") {
        throw new ConvexError({ message: `Bill "${bill.title}" is already ${bill.status}`, code: "BAD_REQUEST" });
      }
      const balance = bill.amount - (bill.amountPaid ?? 0);
      if (p.amount <= 0 || p.amount > balance + 0.01) {
        throw new ConvexError({ message: `Invalid payment amount for bill "${bill.title}"`, code: "BAD_REQUEST" });
      }
      billDetails.push({ bill, amount: round2(p.amount) });
      totalPaid += round2(p.amount);
    }
    totalPaid = round2(totalPaid);

    // Find AP control account (shared control account used across payables).
    const control = await getControlAccounts(ctx);
    const apAccount = control.ap;

    // Build one balanced journal entry for the entire cheque:
    // Dr AP (per bill) / Cr Bank (total)
    const apLines = billDetails.map(({ bill, amount }) => ({
      accountId: apAccount._id,
      debit: amount,
      description: `Bill payment: ${bill.title}${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
    }));
    const bankLine = {
      accountId: args.accountId,
      credit: totalPaid,
      description: `Batch bill payment${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
    };

    const journalEntryId = await postBalancedEntry(ctx, {
      date: args.paymentDate,
      description: `Batch bill payment — ${billDetails.length} bills${args.referenceNumber ? ` Ref: ${args.referenceNumber}` : ""}`,
      reference: args.referenceNumber,
      notes: args.notes,
      createdBy: user._id,
      sourceType: SPLIT_BILL_PAYMENT_SOURCE,
      lines: [...apLines, bankLine],
    });

    // Update each bill and record allocation
    for (const { bill, amount } of billDetails) {
      const newAmountPaid = round2((bill.amountPaid ?? 0) + amount);
      const isFullyPaid = newAmountPaid >= bill.amount - 0.01;

      // Create billPayment record
      await ctx.db.insert("billPayments", {
        billId: bill._id,
        vendorId: bill.vendorId,
        amount,
        paymentDate: args.paymentDate,
        paymentMethod: args.paymentMethod,
        referenceNumber: args.referenceNumber,
        notes: args.notes,
        createdBy: user._id,
      });

      // Create allocation junction record
      await ctx.db.insert("billPaymentAllocations", {
        billId: bill._id,
        journalEntryId,
        amount,
      });

      // Update bill status
      await ctx.db.patch(bill._id, {
        amountPaid: newAmountPaid,
        status: isFullyPaid ? "paid" : "partially_paid",
        paidAt: isFullyPaid ? args.paymentDate : undefined,
      });

      // Bank register row
      await ctx.db.insert("bankTransactions", {
        accountId: args.accountId,
        date: args.paymentDate,
        description: `Bill payment: ${bill.title}`,
        amount,
        type: "debit",
        reference: args.referenceNumber,
        category: "Bill Payment",
        isReconciled: false,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "billPayments:payMultipleBillsWithAllocations",
      resourceType: "billPayment",
      resourceId: journalEntryId,
      action: "bills_batch_paid_with_allocations",
      afterValue: JSON.stringify({ billCount: billDetails.length, totalPaid, journalEntryId }),
      details: `Paid ${billDetails.length} bills totalling ${totalPaid}`,
    });

    return { paidCount: billDetails.length, totalPaid, journalEntryId };
  },
});

// ─── Payment History ─────────────────────────────────────────────────────────

export const getPaymentHistory = query({
  args: { vendorId: v.optional(v.id("vendors")), billId: v.optional(v.id("bills")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let payments;
    if (args.billId) {
      payments = await ctx.db
        .query("billPayments")
        .withIndex("by_bill", (q) => q.eq("billId", args.billId!))
        .collect();
    } else if (args.vendorId) {
      payments = await ctx.db
        .query("billPayments")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!))
        .collect();
    } else {
      payments = await ctx.db.query("billPayments").collect();
    }

    // Enrich with bill title and vendor name
    const enriched = await Promise.all(
      payments.map(async (p) => {
        const bill = await ctx.db.get(p.billId);
        const vendor = await ctx.db.get(p.vendorId);
        return {
          ...p,
          billTitle: bill?.title ?? "—",
          vendorName: vendor?.name ?? "Unknown",
        };
      })
    );

    return enriched.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  },
});

// ─── Payment Summary ─────────────────────────────────────────────────────────

export const getPaymentSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const bills = await ctx.db.query("bills").collect();
    const payments = await ctx.db.query("billPayments").collect();

    const unpaidBills = bills.filter((b) => b.status === "unpaid" || b.status === "overdue" || b.status === "partially_paid");
    const totalOwed = unpaidBills.reduce((sum, b) => sum + (b.amount - (b.amountPaid ?? 0)), 0);
    const overdueBills = bills.filter((b) => b.status === "overdue");
    const overdueAmount = overdueBills.reduce((sum, b) => sum + (b.amount - (b.amountPaid ?? 0)), 0);

    // Payments this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthPayments = payments.filter((p) => p.paymentDate >= monthStart);
    const monthTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      totalOwed: Math.round(totalOwed * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      overdueBillCount: overdueBills.length,
      unpaidBillCount: unpaidBills.length,
      monthPaid: Math.round(monthTotal * 100) / 100,
      totalPaid: Math.round(totalPayments * 100) / 100,
      paymentCount: payments.length,
    };
  },
});

// ─── Get Vendor Credits Available ────────────────────────────────────────────

export const getAvailableCredits = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const credits = await ctx.db
      .query("vendorCredits")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    return credits.filter((c) => c.status === "active");
  },
});
