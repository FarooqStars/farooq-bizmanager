import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./users.ts";
import { postVendorAdvance, VENDOR_ADVANCE_SOURCE } from "./lib/payablesPosting.ts";
import { postBalancedEntry, getControlAccounts, reverseEntriesForSource, round2 } from "./lib/ledger.ts";
import { requireCashAccount } from "./lib/salesPosting.ts";
import { enforcePostingDate } from "./closingDate.ts";
import { logAudit } from "./lib/audit.ts";

// Source-type tags — values live in lib/sourceTypes.ts, re-exported here for
// existing imports that reference this module directly.
import {
  CUSTOMER_ADVANCE_SOURCE,
  ADVANCE_SETTLEMENT_SOURCE,
  ADVANCE_REFUND_SOURCE,
} from "./lib/sourceTypes.ts";

const PAYMENT_METHODS = v.union(
  v.literal("cash"),
  v.literal("bank_transfer"),
  v.literal("cheque"),
  v.literal("credit_card"),
  v.literal("mobile_pay"),
  v.literal("other")
);

// ── List Advance Payments ─────────────────────────────────────────────────────

export const listAdvances = query({
  args: { direction: v.union(v.literal("vendor"), v.literal("customer")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const advances = await ctx.db
      .query("advancePayments")
      .withIndex("by_direction", (q) => q.eq("direction", args.direction))
      .order("desc")
      .collect();

    // Enrich with vendor/customer names
    const result = [];
    for (const adv of advances) {
      let entityName = "Unknown";
      if (adv.vendorId) {
        const vendor = await ctx.db.get(adv.vendorId);
        if (vendor) entityName = vendor.name;
      } else if (adv.customerId) {
        const customer = await ctx.db.get(adv.customerId);
        if (customer) entityName = customer.name;
      }
      const createdByUser = await ctx.db.get(adv.createdBy);
      result.push({ ...adv, entityName, createdByName: createdByUser?.name ?? "?" });
    }
    return result;
  },
});

// ── Get Advance with Settlements ──────────────────────────────────────────────

export const getAdvanceWithSettlements = query({
  args: { advanceId: v.id("advancePayments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const advance = await ctx.db.get(args.advanceId);
    if (!advance) throw new ConvexError({ message: "Advance not found", code: "NOT_FOUND" });

    const settlements = await ctx.db
      .query("advanceSettlements")
      .withIndex("by_advance", (q) => q.eq("advanceId", args.advanceId))
      .collect();

    // Enrich settlements
    const enriched = [];
    for (const s of settlements) {
      let docRef = "";
      if (s.billId) {
        const bill = await ctx.db.get(s.billId);
        docRef = bill ? `Bill: ${bill.title}` : "Bill (deleted)";
      } else if (s.invoiceId) {
        const inv = await ctx.db.get(s.invoiceId);
        docRef = inv ? `Invoice: ${inv.invoiceNumber}` : "Invoice (deleted)";
      } else if (s.goodsReceiptId) {
        docRef = "Goods Receipt";
      }
      const settledByUser = await ctx.db.get(s.settledBy);
      enriched.push({ ...s, docRef, settledByName: settledByUser?.name ?? "?" });
    }

    let entityName = "Unknown";
    if (advance.vendorId) {
      const vendor = await ctx.db.get(advance.vendorId);
      if (vendor) entityName = vendor.name;
    } else if (advance.customerId) {
      const customer = await ctx.db.get(advance.customerId);
      if (customer) entityName = customer.name;
    }

    return { ...advance, entityName, settlements: enriched };
  },
});

// ── Create Advance Payment ────────────────────────────────────────────────────

export const createAdvance = mutation({
  args: {
    direction: v.union(v.literal("vendor"), v.literal("customer")),
    vendorId: v.optional(v.id("vendors")),
    customerId: v.optional(v.id("customers")),
    date: v.string(),
    amount: v.number(),
    method: PAYMENT_METHODS,
    accountId: v.id("accounts"),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.amount <= 0) throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    if (args.direction === "vendor" && !args.vendorId) throw new ConvexError({ message: "Vendor is required", code: "BAD_REQUEST" });
    if (args.direction === "customer" && !args.customerId) throw new ConvexError({ message: "Customer is required", code: "BAD_REQUEST" });

    // Update the selected account balance and record bank transaction
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    if (!account.isActive) throw new ConvexError({ message: "Account is inactive", code: "BAD_REQUEST" });

    if (args.direction === "customer") {
      await requireCashAccount(ctx, args.accountId);
    }

    // Record bank transaction for audit trail
    await ctx.db.insert("bankTransactions", {
      accountId: args.accountId,
      date: args.date,
      description: args.direction === "vendor"
        ? `Advance paid to vendor${args.reference ? ` Ref: ${args.reference}` : ""}`
        : `Advance received from customer${args.reference ? ` Ref: ${args.reference}` : ""}`,
      amount: args.amount,
      type: args.direction === "vendor" ? "debit" : "credit",
      reference: args.reference,
      category: "Advance Payment",
      isReconciled: false,
    });

    const id = await ctx.db.insert("advancePayments", {
      direction: args.direction,
      vendorId: args.vendorId,
      customerId: args.customerId,
      date: args.date,
      amount: args.amount,
      settledAmount: 0,
      method: args.method,
      accountId: args.accountId,
      reference: args.reference,
      notes: args.notes,
      status: "pending",
      createdBy: caller._id,
    });

    // Vendor advance (money out): Dr Vendor Prepayments / Cr Cash-or-Bank. This
    // balanced posting is the only thing that moves the account balance.
    if (args.direction === "vendor") {
      await requireCashAccount(ctx, args.accountId);
      await postVendorAdvance(ctx, {
        advanceId: id,
        amount: args.amount,
        date: args.date,
        description: `Advance paid to vendor${args.reference ? ` Ref: ${args.reference}` : ""}`,
        createdBy: caller._id,
        cashAccountId: args.accountId,
      });
    } else {
      // Customer advance (money in): Dr Cash-or-Bank / Cr Customer Deposits.
      const control = await getControlAccounts(ctx);
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Advance received from customer${args.reference ? ` Ref: ${args.reference}` : ""}`,
        reference: args.reference,
        createdBy: caller._id,
        sourceType: CUSTOMER_ADVANCE_SOURCE,
        sourceId: id,
        lines: [
          { accountId: args.accountId, debit: args.amount, description: "Advance received" },
          { accountId: control.customerDeposits._id, credit: args.amount, description: "Customer deposit liability" },
        ],
      });
    }

    const entityLabel = args.direction === "vendor" ? "vendor" : "customer";
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "advancePayments:createAdvance",
      resourceType: "advancePayment",
      resourceId: id,
      action: `Created advance payment to ${entityLabel}`,
      details: `$${args.amount.toFixed(2)} via ${args.method}`,
      afterValue: JSON.stringify({ direction: args.direction, amount: args.amount, method: args.method, status: "pending" }),
    });

    return id;
  },
});

// ── Update Advance Payment ────────────────────────────────────────────────────

export const updateAdvance = mutation({
  args: {
    advanceId: v.id("advancePayments"),
    date: v.optional(v.string()),
    amount: v.optional(v.number()),
    method: v.optional(PAYMENT_METHODS),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("refunded"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });

    const advance = await ctx.db.get(args.advanceId);
    if (!advance) throw new ConvexError({ message: "Advance not found", code: "NOT_FOUND" });

    // Cannot edit if already partially/fully settled (only header fields like notes/reference)
    if (advance.settledAmount > 0 && args.amount && args.amount !== advance.amount) {
      throw new ConvexError({ message: "Cannot change amount after settlements have been applied", code: "BAD_REQUEST" });
    }

    // Block editing an advance dated in a closed/locked period if amount changes
    if (args.amount !== undefined && args.amount !== advance.amount) {
      await enforcePostingDate(ctx, advance.date);
    }

    // Refunding returns the unsettled remaining balance to/from a real account.
    if (args.status === "refunded" && advance.status !== "refunded") {
      if (advance.status === "settled") {
        throw new ConvexError({ message: "This advance is fully settled and has nothing left to refund", code: "BAD_REQUEST" });
      }
      const refundAmount = round2(advance.amount - advance.settledAmount);
      if (refundAmount > 0 && advance.accountId) {
        await requireCashAccount(ctx, advance.accountId);
        const control = await getControlAccounts(ctx);
        const today = args.date ?? new Date().toISOString().split("T")[0];
        if (advance.direction === "vendor") {
          // Vendor returns our prepayment: Dr Cash / Cr Vendor Prepayments.
          await postBalancedEntry(ctx, {
            date: today,
            description: `Refund of vendor advance`,
            createdBy: caller._id,
            sourceType: ADVANCE_REFUND_SOURCE,
            sourceId: args.advanceId,
            lines: [
              { accountId: advance.accountId, debit: refundAmount, description: "Advance refunded to us" },
              { accountId: control.vendorPrepaid._id, credit: refundAmount, description: "Release vendor prepayment" },
            ],
          });
        } else {
          // We return the customer's money: Dr Customer Deposits / Cr Cash.
          await postBalancedEntry(ctx, {
            date: today,
            description: `Refund of customer advance`,
            createdBy: caller._id,
            sourceType: ADVANCE_REFUND_SOURCE,
            sourceId: args.advanceId,
            lines: [
              { accountId: control.customerDeposits._id, debit: refundAmount, description: "Release customer deposit" },
              { accountId: advance.accountId, credit: refundAmount, description: "Advance refunded to customer" },
            ],
          });
        }
      }
    }

    const { advanceId, ...updates } = args;
    await ctx.db.patch(advanceId, updates);
    const advanceAfter = await ctx.db.get(advanceId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "advancePayments:updateAdvance",
      resourceType: "advancePayment",
      resourceId: advanceId,
      action: updates.status === "refunded" ? "Refunded advance payment" : "Updated advance payment",
      beforeValue: JSON.stringify(advance),
      afterValue: advanceAfter ? JSON.stringify(advanceAfter) : undefined,
      reason: updates.status === "refunded" ? "Refund requested" : undefined,
    });
  },
});

// ── Delete Advance Payment ────────────────────────────────────────────────────

export const deleteAdvance = mutation({
  args: { advanceId: v.id("advancePayments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });

    const advance = await ctx.db.get(args.advanceId);
    if (!advance) throw new ConvexError({ message: "Advance not found", code: "NOT_FOUND" });

    if (advance.settledAmount > 0) {
      throw new ConvexError({ message: "Cannot delete advance with settlements. Refund it instead.", code: "BAD_REQUEST" });
    }

    // Block deleting an advance dated in a closed/locked period
    await enforcePostingDate(ctx, advance.date);

    // Reverse the account balance change
    const accountId = advance.accountId;
    if (accountId) {
      if (advance.direction === "vendor") {
        // Vendor advance was posted through the ledger — reverse it with a
        // balanced mirror entry (the only thing that moves the balance back).
        await reverseEntriesForSource(ctx, VENDOR_ADVANCE_SOURCE, args.advanceId, {
          date: advance.date,
          createdBy: caller._id,
          description: `Reversal of vendor advance`,
        });
      } else {
        // Customer advance was posted through the ledger — reverse it too.
        await reverseEntriesForSource(ctx, CUSTOMER_ADVANCE_SOURCE, args.advanceId, {
          date: advance.date,
          createdBy: caller._id,
          description: `Reversal of customer advance`,
        });
      }

      // Delete associated bank transaction
      const bankTxns = await ctx.db
        .query("bankTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .collect();
      for (const tx of bankTxns) {
        if (tx.amount === advance.amount && tx.date === advance.date && tx.category === "Advance Payment") {
          await ctx.db.delete(tx._id);
          break;
        }
      }
    }

    // Delete any settlements (shouldn't exist but safety)
    const settlements = await ctx.db
      .query("advanceSettlements")
      .withIndex("by_advance", (q) => q.eq("advanceId", args.advanceId))
      .collect();
    for (const s of settlements) await ctx.db.delete(s._id);

    await ctx.db.delete(args.advanceId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "advancePayments:deleteAdvance",
      resourceType: "advancePayment",
      resourceId: args.advanceId,
      action: "Deleted advance payment",
      details: `${advance.amount.toFixed(2)} - reversed account balance and bank transaction`,
      beforeValue: JSON.stringify(advance),
      reason: "Advance deleted by admin",
    });
  },
});

// ── Settle Advance Against Bill/Invoice/Receipt ───────────────────────────────

export const settleAdvance = mutation({
  args: {
    advanceId: v.id("advancePayments"),
    amount: v.number(),
    billId: v.optional(v.id("bills")),
    invoiceId: v.optional(v.id("invoices")),
    goodsReceiptId: v.optional(v.id("goodsReceipts")),
    date: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });

    const advance = await ctx.db.get(args.advanceId);
    if (!advance) throw new ConvexError({ message: "Advance not found", code: "NOT_FOUND" });

    if (advance.status === "settled" || advance.status === "refunded") {
      throw new ConvexError({ message: "Advance is already settled/refunded", code: "BAD_REQUEST" });
    }

    const remainingBalance = advance.amount - advance.settledAmount;
    if (args.amount <= 0 || args.amount > remainingBalance) {
      throw new ConvexError({ message: `Settlement amount must be between $0.01 and $${remainingBalance.toFixed(2)}`, code: "BAD_REQUEST" });
    }

    // Cap the settlement at the target document's own remaining balance too, so we
    // never over-apply an advance to a bill/invoice that is already (nearly) paid.
    const bill = args.billId ? await ctx.db.get(args.billId) : null;
    const invoice = args.invoiceId ? await ctx.db.get(args.invoiceId) : null;
    if (args.billId && !bill) throw new ConvexError({ message: "Bill not found", code: "NOT_FOUND" });
    if (args.invoiceId && !invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (bill) {
      const billRemaining = round2(bill.amount - (bill.amountPaid ?? 0));
      if (args.amount > billRemaining) {
        throw new ConvexError({ message: `Amount exceeds the bill's remaining balance of $${billRemaining.toFixed(2)}`, code: "BAD_REQUEST" });
      }
    }
    if (invoice) {
      const invoiceRemaining = round2((invoice.totalAmount ?? 0) - (invoice.amountPaid ?? 0));
      if (args.amount > invoiceRemaining) {
        throw new ConvexError({ message: `Amount exceeds the invoice's remaining balance of $${invoiceRemaining.toFixed(2)}`, code: "BAD_REQUEST" });
      }
    }

    // Create settlement record
    const settlementId = await ctx.db.insert("advanceSettlements", {
      advanceId: args.advanceId,
      billId: args.billId,
      invoiceId: args.invoiceId,
      goodsReceiptId: args.goodsReceiptId,
      amount: args.amount,
      date: args.date,
      notes: args.notes,
      settledBy: caller._id,
    });

    // Update advance
    const newSettled = advance.settledAmount + args.amount;
    const newStatus = newSettled >= advance.amount ? "settled" : "partially_settled";
    await ctx.db.patch(args.advanceId, { settledAmount: newSettled, status: newStatus });

    // If settling against a bill, update the bill's amountPaid
    if (bill) {
      const newPaid = round2((bill.amountPaid ?? 0) + args.amount);
      const billStatus = newPaid >= bill.amount ? "paid" : "partially_paid";
      await ctx.db.patch(bill._id, {
        amountPaid: newPaid,
        status: billStatus,
        ...(billStatus === "paid" ? { paidAt: args.date } : {}),
      });
    }

    // If settling against an invoice, update invoice amountPaid
    if (invoice) {
      const newPaid = round2((invoice.amountPaid ?? 0) + args.amount);
      const invStatus = newPaid >= (invoice.totalAmount ?? 0) ? "paid" : "partially_paid";
      await ctx.db.patch(invoice._id, { amountPaid: newPaid, status: invStatus });
    }

    // Apply the held advance against the outstanding balance in the ledger:
    //  - Vendor: Dr Accounts Payable / Cr Vendor Prepayments (uses up the prepaid asset)
    //  - Customer: Dr Customer Deposits / Cr Accounts Receivable (releases the deposit)
    if (bill || invoice) {
      const control = await getControlAccounts(ctx);
      if (advance.direction === "vendor") {
        await postBalancedEntry(ctx, {
          date: args.date,
          description: `Advance applied to bill`,
          createdBy: caller._id,
          sourceType: ADVANCE_SETTLEMENT_SOURCE,
          sourceId: settlementId,
          lines: [
            { accountId: control.ap._id, debit: args.amount, description: "Reduce payable" },
            { accountId: control.vendorPrepaid._id, credit: args.amount, description: "Apply vendor prepayment" },
          ],
        });
      } else {
        await postBalancedEntry(ctx, {
          date: args.date,
          description: `Advance applied to invoice`,
          createdBy: caller._id,
          sourceType: ADVANCE_SETTLEMENT_SOURCE,
          sourceId: settlementId,
          lines: [
            { accountId: control.customerDeposits._id, debit: args.amount, description: "Release customer deposit" },
            { accountId: control.ar._id, credit: args.amount, description: "Reduce receivable" },
          ],
        });
      }
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "advancePayments:settleAdvance",
      resourceType: "advancePayment",
      resourceId: args.advanceId,
      action: "Settled advance payment",
      details: `$${args.amount.toFixed(2)} applied${args.billId ? " to bill" : args.invoiceId ? " to invoice" : ""}`,
      beforeValue: JSON.stringify(advance),
      afterValue: JSON.stringify({ settledAmount: newSettled, status: newStatus }),
    });
  },
});

// ── Get Unsettled Advances for a Vendor/Customer ──────────────────────────────

export const getUnsettledAdvances = query({
  args: {
    direction: v.union(v.literal("vendor"), v.literal("customer")),
    vendorId: v.optional(v.id("vendors")),
    customerId: v.optional(v.id("customers")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let advances;
    if (args.direction === "vendor" && args.vendorId) {
      advances = await ctx.db
        .query("advancePayments")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!))
        .collect();
    } else if (args.direction === "customer" && args.customerId) {
      advances = await ctx.db
        .query("advancePayments")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    } else {
      advances = await ctx.db
        .query("advancePayments")
        .withIndex("by_direction", (q) => q.eq("direction", args.direction))
        .collect();
    }

    return advances
      .filter((a) => a.status === "pending" || a.status === "partially_settled")
      .map((a) => ({
        ...a,
        balance: a.amount - a.settledAmount,
      }));
  },
});

// ── Admin: Clean up orphaned bank transactions ──────────────────────────────

export const cleanOrphanedBankTransactions = mutation({
  args: { transactionId: v.id("bankTransactions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });

    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError({ message: "Transaction not found", code: "NOT_FOUND" });

    await ctx.db.delete(args.transactionId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "advancePayments:cleanOrphanedBankTransactions",
      resourceType: "bankTransaction",
      resourceId: args.transactionId,
      action: "Deleted orphaned bank transaction",
      details: `${tx.description} - ${tx.amount}`,
      beforeValue: JSON.stringify(tx),
      reason: "Orphaned transaction cleanup",
    });
  },
});
