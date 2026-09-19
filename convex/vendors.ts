import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./users.ts";
import type { Id } from "./_generated/dataModel.d.ts";
import { postBillCreation, BILL_SOURCE, billPostingDate, todayIso } from "./lib/payablesPosting.ts";
import { reverseEntriesForSource, postBalancedEntry, findOrCreateAccount } from "./lib/ledger.ts";
import { EXPENSE_POSTING_SOURCE } from "./lib/sourceTypes.ts";
import { enforcePostingDate } from "./closingDate.ts";
import { logAudit } from "./lib/audit.ts";
import { postVendorOpeningBalance, findVendorOpeningBill } from "./lib/openingBalances.ts";
import { VENDOR_OPENING_BALANCE_SOURCE } from "./lib/sourceTypes.ts";
import { assertOwner, getCurrentUser } from "./lib/auth.ts";

// ── Vendors ───────────────────────────────────────────────────────────────────

export const listVendors = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("vendors").collect();
  },
});

export const createVendor = mutation({
  args: {
    name: v.string(),
    companyName: v.optional(v.string()),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    fax: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    taxId: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    creditLimit: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    openingBalance: v.optional(v.number()),
    openingBalanceDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const id = await ctx.db.insert("vendors", { ...args, isActive: true });

    // Opening balance → a real payable (see lib/openingBalances.ts).
    if (args.openingBalance) {
      await postVendorOpeningBalance(ctx, {
        vendorId: id,
        amount: args.openingBalance,
        date: args.openingBalanceDate,
        createdBy: caller._id,
      });
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vendors:createVendor",
      resourceType: "vendor",
      resourceId: id,
      action: "vendor_created",
      afterValue: JSON.stringify({ name: args.name }),
      details: `Vendor ${args.name} created`,
    });

    return id;
  },
});

export const updateVendor = mutation({
  args: {
    vendorId: v.id("vendors"),
    name: v.optional(v.string()),
    companyName: v.optional(v.string()),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    fax: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    taxId: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    creditLimit: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    openingBalance: v.optional(v.number()),
    openingBalanceDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });

    const { vendorId, ...updates } = args;

    // The opening balance is posted once, as an opening-balance bill.
    const openingChanged =
      (updates.openingBalance !== undefined && updates.openingBalance !== vendor.openingBalance) ||
      (updates.openingBalanceDate !== undefined && updates.openingBalanceDate !== vendor.openingBalanceDate);
    const existingOpening = await findVendorOpeningBill(ctx, vendorId);
    if (openingChanged && existingOpening) {
      throw new ConvexError({
        message: "The opening balance is already recorded as an opening-balance bill. Void that bill first to enter a different one.",
        code: "BAD_REQUEST",
      });
    }
    const { openingBalance, openingBalanceDate, ...rest } = updates;
    await ctx.db.patch(vendorId, rest);
    if (openingChanged && !existingOpening && openingBalance) {
      await postVendorOpeningBalance(ctx, {
        vendorId,
        amount: openingBalance,
        date: openingBalanceDate ?? vendor.openingBalanceDate,
        createdBy: caller._id,
      });
    }

    const afterVendor = await ctx.db.get(vendorId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vendors:updateVendor",
      resourceType: "vendor",
      resourceId: vendorId,
      action: "vendor_updated",
      beforeValue: JSON.stringify(vendor),
      afterValue: JSON.stringify(afterVendor),
      details: `Vendor ${vendor.name} updated`,
    });
  },
});

// ── Expense Categories ─────────────────────────────────────────────────────────

export const listExpenseCategories = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("expenseCategories").collect();
  },
});

export const createExpenseCategory = mutation({
  args: { name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    return await ctx.db.insert("expenseCategories", args);
  },
});

export const updateExpenseCategory = mutation({
  args: {
    categoryId: v.id("expenseCategories"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const { categoryId, ...fields } = args;
    const update: Record<string, unknown> = {};
    if (fields.name !== undefined) update.name = fields.name;
    if (fields.color !== undefined) update.color = fields.color;
    if ("accountId" in fields) update.accountId = fields.accountId; // allow clearing with undefined
    await ctx.db.patch(categoryId, update);
  },
});

export const listExpenseCategoriesWithAccounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const cats = await ctx.db.query("expenseCategories").collect();
    const accounts = await ctx.db.query("accounts").collect();
    const accountMap = new Map(accounts.map(a => [a._id, a]));
    return cats.map(c => ({
      ...c,
      account: c.accountId ? accountMap.get(c.accountId) ?? null : null,
    }));
  },
});

// ── Bills ─────────────────────────────────────────────────────────────────────

export const listBills = query({
  args: { vendorId: v.optional(v.id("vendors")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const bills = args.vendorId
      ? await ctx.db.query("bills").withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!)).collect()
      : await ctx.db.query("bills").collect();

    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id, v]));

    return bills.map((b) => ({ ...b, vendor: vendorMap.get(b.vendorId) ?? null }));
  },
});

export const createBill = mutation({
  args: {
    vendorId: v.id("vendors"),
    title: v.string(),
    amount: v.number(),
    // Date the bill was issued. Defaults to today when not given.
    billDate: v.optional(v.string()),
    dueDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // If the caller does not say when the bill was issued, assume today — but
    // never later than its due date (an old bill entered late keeps its date).
    const today = todayIso();
    const billDate = args.billDate ?? (args.dueDate < today ? args.dueDate : today);
    if (args.dueDate < billDate) {
      throw new ConvexError({ message: "The due date cannot be before the bill date", code: "BAD_REQUEST" });
    }

    // Block creating a bill inside a closed/locked period.
    await enforcePostingDate(ctx, billDate);

    const id = await ctx.db.insert("bills", { ...args, billDate, status: "unpaid" });

    // Post the balanced entry: Dr Expense / Cr Accounts Payable — on the bill
    // date, not the due date.
    await postBillCreation(ctx, {
      billId: id,
      amount: args.amount,
      date: billDate,
      description: `Bill: ${args.title}`,
      createdBy: caller._id,
    });

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vendors:createBill",
      resourceType: "bill",
      resourceId: id,
      action: "bill_created",
      afterValue: JSON.stringify({ billId: id, title: args.title, amount: args.amount, vendorId: args.vendorId }),
      details: `Bill "${args.title}" created — $${args.amount}`,
    });

    return id;
  },
});

export const updateBill = mutation({
  args: {
    billId: v.id("bills"),
    title: v.optional(v.string()),
    amount: v.optional(v.number()),
    billDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("unpaid"), v.literal("paid"), v.literal("overdue"), v.literal("partially_paid"))),
    paidAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Paying a bill must go through Pay Bills so the money leaves a real cash/bank
    // account and posts Dr AP / Cr Cash. Editing the header must never silently
    // flip a bill to paid/partially paid without that posting.
    if (args.status === "paid" || args.status === "partially_paid") {
      throw new ConvexError({
        message: "Use Pay Bills to record a payment so it posts to the ledger",
        code: "BAD_REQUEST",
      });
    }

    const existing = await ctx.db.get(args.billId);
    if (!existing) throw new ConvexError({ message: "Bill not found", code: "NOT_FOUND" });

    const amountChanged = args.amount !== undefined && args.amount !== existing.amount;
    if (amountChanged && (existing.amountPaid ?? 0) > 0) {
      throw new ConvexError({ message: "Cannot change the amount of a bill that has payments", code: "BAD_REQUEST" });
    }

    const oldPostingDate = billPostingDate(existing);
    const newPostingDate = args.billDate ?? oldPostingDate;
    const dateChanged = newPostingDate !== oldPostingDate;
    if (dateChanged && (existing.amountPaid ?? 0) > 0) {
      throw new ConvexError({ message: "Cannot change the date of a bill that has payments", code: "BAD_REQUEST" });
    }
    const newDueDate = args.dueDate ?? existing.dueDate;
    if (newDueDate < newPostingDate) {
      throw new ConvexError({ message: "The due date cannot be before the bill date", code: "BAD_REQUEST" });
    }
    const repost = amountChanged || dateChanged;
    if (repost && existing.isOpeningBalance) {
      throw new ConvexError({
        message: "An opening-balance bill cannot be edited. Void it, then enter the vendor's opening balance again.",
        code: "BAD_REQUEST",
      });
    }

    // Block editing a bill whose old or new date is in a closed/locked period
    // (re-posting reverses the old entry and writes a new one).
    if (repost) {
      await enforcePostingDate(ctx, oldPostingDate);
      await enforcePostingDate(ctx, newPostingDate);
    }

    // Changing the bill amount must keep the AP posting in step: reverse the old
    // creation entry and post a fresh one for the new amount.
    const { billId, ...updates } = args;
    await ctx.db.patch(billId, updates);

    if (repost) {
      await reverseEntriesForSource(ctx, BILL_SOURCE, billId, {
        date: oldPostingDate,
        createdBy: caller._id,
        description: amountChanged ? `Adjust bill amount` : `Adjust bill date`,
      });
      await postBillCreation(ctx, {
        billId,
        amount: args.amount ?? existing.amount,
        date: newPostingDate,
        description: `Bill: ${args.title ?? existing.title}`,
        createdBy: caller._id,
      });
    }

    const afterBill = await ctx.db.get(billId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vendors:updateBill",
      resourceType: "bill",
      resourceId: billId,
      action: "bill_updated",
      beforeValue: JSON.stringify(existing),
      afterValue: JSON.stringify(afterBill),
      details: `Bill "${existing.title}" updated`,
    });
  },
});

export const deleteBill = mutation({
  args: { billId: v.id("bills") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const bill = await ctx.db.get(args.billId);
    if (!bill) throw new ConvexError({ message: "Bill not found", code: "NOT_FOUND" });

    // Block deleting a bill dated in a closed/locked period
    await enforcePostingDate(ctx, billPostingDate(bill));

    // A bill with recorded payments cannot be deleted — those payments moved real
    // money. The user must reverse the payments in Pay Bills first.
    const payments = await ctx.db
      .query("billPayments")
      .withIndex("by_bill", (q) => q.eq("billId", args.billId))
      .collect();
    if (payments.length > 0 || (bill.amountPaid ?? 0) > 0) {
      throw new ConvexError({
        message: "This bill has payments. Reverse the payments before deleting it.",
        code: "BAD_REQUEST",
      });
    }

    // Reverse the bill's creation posting (Dr Expense / Cr AP) so AP drops back.
    await reverseEntriesForSource(ctx, BILL_SOURCE, args.billId, {
      date: billPostingDate(bill),
      createdBy: caller._id,
      description: `Delete bill: ${bill.title}`,
    });
    await reverseEntriesForSource(ctx, VENDOR_OPENING_BALANCE_SOURCE, args.billId, {
      date: billPostingDate(bill),
      createdBy: caller._id,
      description: `Delete opening-balance bill`,
    });

    await ctx.db.delete(args.billId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vendors:deleteBill",
      resourceType: "bill",
      resourceId: args.billId,
      action: "bill_deleted",
      beforeValue: JSON.stringify(bill),
      details: `Bill "${bill.title}" deleted — $${bill.amount}`,
    });
  },
});

// ── Expenses ──────────────────────────────────────────────────────────────────

export const listExpenses = query({
  args: { vendorId: v.optional(v.id("vendors")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const expenses = args.vendorId
      ? await ctx.db.query("expenses").withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!)).collect()
      : await ctx.db.query("expenses").collect();

    const [vendors, categories, users] = await Promise.all([
      ctx.db.query("vendors").collect(),
      ctx.db.query("expenseCategories").collect(),
      ctx.db.query("users").collect(),
    ]);

    const vendorMap = new Map(vendors.map((v) => [v._id, v]));
    const catMap = new Map(categories.map((c) => [c._id, c]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return expenses
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => ({
        ...e,
        vendor: e.vendorId ? vendorMap.get(e.vendorId) ?? null : null,
        category: e.categoryId ? catMap.get(e.categoryId) ?? null : null,
        recordedByUser: userMap.get(e.recordedBy) ?? null,
      }));
  },
});

export const createExpense = mutation({
  args: {
    title: v.string(),
    amount: v.number(),
    categoryId: v.optional(v.id("expenseCategories")),
    vendorId: v.optional(v.id("vendors")),
    date: v.string(),
    notes: v.optional(v.string()),
    postToLedger: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"expenses">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Determine whether this expense should post to the ledger. An expense posts
    // when its category has a ledger account mapped. `postToLedger` makes the
    // account mapping a hard requirement (so the caller gets a clear error rather
    // than a silently unposted expense).
    let debitAccountId: Id<"accounts"> | undefined;
    if (args.categoryId) {
      const cat = await ctx.db.get(args.categoryId);
      if (args.postToLedger && !cat?.accountId) {
        throw new ConvexError({
          message: `Category "${cat?.name ?? args.categoryId}" has no account mapped. Map an account in Settings > Expense Categories before posting.`,
          code: "BAD_REQUEST",
        });
      }
      if (cat?.accountId) debitAccountId = cat.accountId;
    } else if (args.postToLedger) {
      throw new ConvexError({
        message: "A category with a mapped account is required to post this expense",
        code: "BAD_REQUEST",
      });
    }

    const shouldPost = debitAccountId !== undefined;

    // Block posting into a closed/locked period before writing anything.
    if (shouldPost) {
      await enforcePostingDate(ctx, args.date);
    }

    const id = await ctx.db.insert("expenses", {
      title: args.title,
      amount: args.amount,
      categoryId: args.categoryId,
      vendorId: args.vendorId,
      date: args.date,
      notes: args.notes,
      recordedBy: caller._id,
    });

    let journalEntryId: Id<"journalEntries"> | undefined;
    if (shouldPost && debitAccountId) {
      // Dr Expense category account / Cr Accrued Expenses Payable.
      const accrued = await findOrCreateAccount(ctx, {
        type: "accounts_payable",
        code: "2010",
        name: "Accrued Expenses Payable",
        subType: "Accrued",
        matchSubType: "Accrued",
      });
      journalEntryId = await postBalancedEntry(ctx, {
        date: args.date,
        description: `Expense: ${args.title}`,
        createdBy: caller._id,
        sourceType: EXPENSE_POSTING_SOURCE,
        sourceId: id,
        lines: [
          { accountId: debitAccountId, debit: args.amount, description: args.title },
          { accountId: accrued._id, credit: args.amount, description: "Accrued expenses payable" },
        ],
      });
      await ctx.db.patch(id, { journalEntryId });
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vendors:createExpense",
      resourceType: "expense",
      resourceId: id,
      action: "expense_created",
      afterValue: JSON.stringify({ title: args.title, amount: args.amount, categoryId: args.categoryId, posted: shouldPost, journalEntryId }),
      details: `Expense "${args.title}" — $${args.amount}${shouldPost ? " (posted to ledger)" : ""}`,
    });

    return id;
  },
});

export const deleteExpense = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    await ctx.db.delete(args.expenseId);
  },
});

// ── Summary stats ──────────────────────────────────────────────────────────────

export const getBillsAndExpenseSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const [bills, expenses] = await Promise.all([
      ctx.db.query("bills").collect(),
      ctx.db.query("expenses").collect(),
    ]);

    const unpaidTotal = bills.filter((b) => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
    const paidTotal = bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
    const overdueCount = bills.filter((b) => b.status === "overdue").length;
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    return { unpaidTotal, paidTotal, overdueCount, totalExpenses };
  },
});

// ── Owner-only admin void of a posted bill (reverse-and-repost) ────────────────
//
// Voids a posted bill by reversing its creation posting (Dr Expense / Cr AP) with
// a mirror entry — the same reversal logic as deleteBill — but instead of
// deleting the record it stamps the bill "void" and keeps it for the audit trail.
// Owner-only and requires a written reason. A bill with recorded payments cannot
// be voided; the owner must reverse the payments first (those moved real money).
export const adminVoidPostedBill = mutation({
  args: {
    billId: v.id("bills"),
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

    const bill = await ctx.db.get(args.billId);
    if (!bill) throw new ConvexError({ message: "Bill not found", code: "NOT_FOUND" });
    if (bill.status === "void") {
      throw new ConvexError({ message: "Bill is already void", code: "BAD_REQUEST" });
    }

    // Block voiding a bill dated in a closed/locked period.
    await enforcePostingDate(ctx, billPostingDate(bill));

    // A bill with recorded payments moved real money — those payments must be
    // reversed in Pay Bills before the bill can be voided.
    const payments = await ctx.db
      .query("billPayments")
      .withIndex("by_bill", (q) => q.eq("billId", args.billId))
      .collect();
    if (payments.length > 0 || (bill.amountPaid ?? 0) > 0) {
      throw new ConvexError({
        message: "This bill has payments. Reverse the payments before voiding it.",
        code: "BAD_REQUEST",
      });
    }

    // Reverse the bill's creation posting (Dr Expense / Cr AP) so AP drops back.
    await reverseEntriesForSource(ctx, BILL_SOURCE, args.billId, {
      date: billPostingDate(bill),
      createdBy: user._id,
      description: `Admin void bill: ${bill.title}`,
    });
    await reverseEntriesForSource(ctx, VENDOR_OPENING_BALANCE_SOURCE, args.billId, {
      date: billPostingDate(bill),
      createdBy: user._id,
      description: `Admin void opening-balance bill`,
    });

    await ctx.db.patch(args.billId, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "vendors:adminVoidPostedBill",
      resourceType: "bill",
      resourceId: args.billId,
      action: "bill_admin_voided",
      beforeValue: JSON.stringify(bill),
      afterValue: JSON.stringify({ ...bill, status: "void" }),
      reason: args.reason,
      details: `Owner voided bill "${bill.title}" — $${bill.amount}`,
    });
  },
});
