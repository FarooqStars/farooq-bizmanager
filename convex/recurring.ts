import { v, ConvexError } from "convex/values";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { nextNumber } from "./lib/docNumber.ts";
import { postBillCreation } from "./lib/payablesPosting.ts";
import { assertCustomerCanBeInvoiced } from "./lib/creditControl.ts";

// Helper to get authenticated user
async function requireAuth(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  return identity;
}

// Helper to compute next generation date from a given date and frequency
function computeNextDate(fromDate: string, frequency: string): string {
  const date = new Date(fromDate);
  let next: Date;
  switch (frequency) {
    case "weekly":
      next = addWeeks(date, 1);
      break;
    case "biweekly":
      next = addWeeks(date, 2);
      break;
    case "monthly":
      next = addMonths(date, 1);
      break;
    case "quarterly":
      next = addMonths(date, 3);
      break;
    case "yearly":
      next = addYears(date, 1);
      break;
    default:
      next = addMonths(date, 1);
  }
  return next.toISOString().split("T")[0];
}

// Helper to compute due date from invoice date based on credit terms
function computeDueDate(invoiceDate: string, creditTerms?: string): string {
  const date = new Date(invoiceDate);
  let days = 30;
  switch (creditTerms) {
    case "net_15":
      days = 15;
      break;
    case "net_30":
      days = 30;
      break;
    case "net_60":
      days = 60;
      break;
    case "net_90":
      days = 90;
      break;
  }
  return addDays(date, days).toISOString().split("T")[0];
}

// ==================== RECURRING INVOICES ====================

export const listRecurringInvoices = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let records: Doc<"recurringInvoices">[];
    if (args.status) {
      records = await ctx.db
        .query("recurringInvoices")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "active" | "paused" | "cancelled" | "completed"),
        )
        .collect();
    } else {
      records = await ctx.db.query("recurringInvoices").order("desc").collect();
    }

    const enriched = await Promise.all(
      records.map(async (rec) => {
        const customer = await ctx.db.get(rec.customerId);
        return { ...rec, customerName: customer?.name ?? "Unknown" };
      }),
    );
    return enriched;
  },
});

export const getRecurringInvoice = query({
  args: { id: v.id("recurringInvoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const record = await ctx.db.get(args.id);
    if (!record) return null;

    const customer = await ctx.db.get(record.customerId);
    return { ...record, customerName: customer?.name ?? "Unknown" };
  },
});

export const createRecurringInvoice = mutation({
  args: {
    name: v.string(),
    customerId: v.id("customers"),
    frequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
    ),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(
      v.union(v.literal("net_15"), v.literal("net_30"), v.literal("net_60"), v.literal("net_90")),
    ),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"recurringInvoices">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    if (args.items.length === 0) {
      throw new ConvexError({ message: "Must have at least one item", code: "BAD_REQUEST" });
    }

    const id = await ctx.db.insert("recurringInvoices", {
      name: args.name,
      customerId: args.customerId,
      frequency: args.frequency,
      items: args.items,
      saleType: args.saleType,
      creditTerms: args.creditTerms,
      taxRate: args.taxRate,
      discount: args.discount,
      currency: args.currency,
      notes: args.notes,
      startDate: args.startDate,
      endDate: args.endDate,
      nextGenerationDate: args.startDate,
      totalGenerated: 0,
      status: "active",
      createdBy: user._id,
    });

    return id;
  },
});

export const updateRecurringInvoice = mutation({
  args: {
    id: v.id("recurringInvoices"),
    name: v.optional(v.string()),
    frequency: v.optional(
      v.union(
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("yearly"),
      ),
    ),
    items: v.optional(
      v.array(
        v.object({
          productId: v.optional(v.id("products")),
          description: v.string(),
          quantity: v.number(),
          unitPrice: v.number(),
        }),
      ),
    ),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    notes: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });

    const updates: Partial<Doc<"recurringInvoices">> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.items !== undefined) updates.items = args.items;
    if (args.taxRate !== undefined) updates.taxRate = args.taxRate;
    if (args.discount !== undefined) updates.discount = args.discount;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.endDate !== undefined) updates.endDate = args.endDate;

    await ctx.db.patch(args.id, updates);
  },
});

export const updateRecurringInvoiceStatus = mutation({
  args: {
    id: v.id("recurringInvoices"),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { status: args.status });
  },
});

// ==================== RECURRING BILLS ====================

export const listRecurringBills = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let records: Doc<"recurringBills">[];
    if (args.status) {
      records = await ctx.db
        .query("recurringBills")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "active" | "paused" | "cancelled" | "completed"),
        )
        .collect();
    } else {
      records = await ctx.db.query("recurringBills").order("desc").collect();
    }

    const enriched = await Promise.all(
      records.map(async (rec) => {
        const vendor = await ctx.db.get(rec.vendorId);
        return { ...rec, vendorName: vendor?.name ?? "Unknown" };
      }),
    );
    return enriched;
  },
});

export const getRecurringBill = query({
  args: { id: v.id("recurringBills") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const record = await ctx.db.get(args.id);
    if (!record) return null;

    const vendor = await ctx.db.get(record.vendorId);
    return { ...record, vendorName: vendor?.name ?? "Unknown" };
  },
});

export const createRecurringBill = mutation({
  args: {
    name: v.string(),
    vendorId: v.id("vendors"),
    frequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
    ),
    amount: v.number(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"recurringBills">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    }

    const id = await ctx.db.insert("recurringBills", {
      name: args.name,
      vendorId: args.vendorId,
      frequency: args.frequency,
      amount: args.amount,
      category: args.category,
      notes: args.notes,
      startDate: args.startDate,
      endDate: args.endDate,
      nextGenerationDate: args.startDate,
      totalGenerated: 0,
      status: "active",
      createdBy: user._id,
    });

    return id;
  },
});

export const updateRecurringBill = mutation({
  args: {
    id: v.id("recurringBills"),
    name: v.optional(v.string()),
    frequency: v.optional(
      v.union(
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("yearly"),
      ),
    ),
    amount: v.optional(v.number()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });

    const updates: Partial<Doc<"recurringBills">> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.category !== undefined) updates.category = args.category;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.endDate !== undefined) updates.endDate = args.endDate;

    await ctx.db.patch(args.id, updates);
  },
});

export const updateRecurringBillStatus = mutation({
  args: {
    id: v.id("recurringBills"),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { status: args.status });
  },
});

// ==================== UPCOMING SCHEDULES ====================

export const getUpcomingSchedules = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const today = new Date().toISOString().split("T")[0];
    // Get next 30 days of upcoming items
    const thirtyDaysLater = addDays(new Date(), 30).toISOString().split("T")[0];

    const activeInvoices = await ctx.db
      .query("recurringInvoices")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const activeBills = await ctx.db
      .query("recurringBills")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const upcoming: Array<{
      type: "invoice" | "bill";
      name: string;
      entityName: string;
      nextDate: string;
      amount: number;
      frequency: string;
    }> = [];

    for (const inv of activeInvoices) {
      if (inv.nextGenerationDate <= thirtyDaysLater && inv.nextGenerationDate >= today) {
        const customer = await ctx.db.get(inv.customerId);
        const subtotal = inv.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        upcoming.push({
          type: "invoice",
          name: inv.name,
          entityName: customer?.name ?? "Unknown",
          nextDate: inv.nextGenerationDate,
          amount: subtotal,
          frequency: inv.frequency,
        });
      }
    }

    for (const bill of activeBills) {
      if (bill.nextGenerationDate <= thirtyDaysLater && bill.nextGenerationDate >= today) {
        const vendor = await ctx.db.get(bill.vendorId);
        upcoming.push({
          type: "bill",
          name: bill.name,
          entityName: vendor?.name ?? "Unknown",
          nextDate: bill.nextGenerationDate,
          amount: bill.amount,
          frequency: bill.frequency,
        });
      }
    }

    // Sort by next date
    upcoming.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    return upcoming;
  },
});

// ==================== CRON JOB HANDLER ====================

export const processRecurringTransactions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];

    // Process recurring invoices
    const dueInvoices = await ctx.db
      .query("recurringInvoices")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const recurring of dueInvoices) {
      if (recurring.nextGenerationDate > today) continue;

      // Check if end date passed
      if (recurring.endDate && recurring.endDate < today) {
        await ctx.db.patch(recurring._id, { status: "completed" });
        continue;
      }

      // Generate the invoice
      const subtotal = recurring.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const discountAmount = recurring.discount ?? 0;
      const afterDiscount = subtotal - discountAmount;
      const taxRate = recurring.taxRate ?? 0;
      const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
      const totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;

      const isCash = recurring.saleType === "cash";
      const status = isCash ? ("paid" as const) : ("draft" as const);
      const amountPaid = isCash ? totalAmount : 0;

      // CREDIT GATE for recurring invoices: block and flag, do not skip silently.
      // A recurring invoice fires without a human present. Bypassing the gate
      // because it is unattended would be the worst place to do it.
      // On a block, we record the reason and continue to the next recurring item
      // rather than throwing — a single blocked customer must not stop all others.
      if (!isCash) {
        try {
          await assertCustomerCanBeInvoiced(ctx, recurring.customerId, totalAmount);
        } catch (e) {
          const reason =
            e instanceof ConvexError
              ? (e.data as { message: string }).message
              : "Credit control check failed";
          await ctx.db.patch(recurring._id, {
            lastRunStatus: "blocked",
            lastRunBlockedReason: reason,
          });
          continue;
        }
      }

      // Generate invoice number
      const allInvoices = await ctx.db.query("invoices").collect();
      const invoiceNumber = nextNumber(allInvoices, (i) => i.invoiceNumber, "INV-", 5);
      const dueDate = computeDueDate(today, recurring.creditTerms);

      const invoiceId = await ctx.db.insert("invoices", {
        invoiceNumber,
        customerId: recurring.customerId,
        date: today,
        dueDate,
        status,
        saleType: recurring.saleType,
        creditTerms: recurring.creditTerms,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: recurring.taxRate,
        taxAmount,
        discount: recurring.discount,
        totalAmount,
        amountPaid,
        currency: recurring.currency,
        notes: `Auto-generated from recurring: ${recurring.name}`,
        createdBy: recurring.createdBy,
      });

      // Insert invoice items
      for (const item of recurring.items) {
        await ctx.db.insert("invoiceItems", {
          invoiceId,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
        });
      }

      // Update recurring record — clear any previous block flag on success
      const nextDate = computeNextDate(recurring.nextGenerationDate, recurring.frequency);
      await ctx.db.patch(recurring._id, {
        lastGeneratedDate: today,
        nextGenerationDate: nextDate,
        totalGenerated: recurring.totalGenerated + 1,
        lastRunStatus: "ok" as const,
        lastRunBlockedReason: undefined,
      });
    }

    // Process recurring bills
    const dueBills = await ctx.db
      .query("recurringBills")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const recurring of dueBills) {
      if (recurring.nextGenerationDate > today) continue;

      // Check if end date passed
      if (recurring.endDate && recurring.endDate < today) {
        await ctx.db.patch(recurring._id, { status: "completed" });
        continue;
      }

      // Generate the bill
      const dueDate = computeDueDate(today, "net_30");
      const billId = await ctx.db.insert("bills", {
        vendorId: recurring.vendorId,
        title: `${recurring.name} (auto-generated)`,
        amount: recurring.amount,
        billDate: today,
        dueDate,
        status: "unpaid",
        notes: recurring.notes,
      });

      // Post the balanced entry: Dr Expense / Cr Accounts Payable.
      await postBillCreation(ctx, {
        billId,
        amount: recurring.amount,
        date: today, // bill date, not due date
        description: `Bill: ${recurring.name} (recurring)`,
        createdBy: recurring.createdBy,
      });

      // Update recurring record
      const nextDate = computeNextDate(recurring.nextGenerationDate, recurring.frequency);
      await ctx.db.patch(recurring._id, {
        lastGeneratedDate: today,
        nextGenerationDate: nextDate,
        totalGenerated: recurring.totalGenerated + 1,
      });
    }
  },
});

// Manual generation trigger (for testing or on-demand)
export const generateNow = mutation({
  args: {
    type: v.union(v.literal("invoice"), v.literal("bill")),
    id: v.union(v.id("recurringInvoices"), v.id("recurringBills")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Schedule immediate processing
    await ctx.scheduler.runAfter(0, internal.recurring.processRecurringTransactions, {});
  },
});
