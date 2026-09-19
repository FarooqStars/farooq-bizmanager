import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import type { QueryCtx, MutationCtx } from "./_generated/server";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  return identity;
}

async function getUser(ctx: QueryCtx | MutationCtx, tokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ==================== QUERIES ====================

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("unbilled"), v.literal("billed"), v.literal("paid"))),
    customerId: v.optional(v.id("customers")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let expenses;
    if (args.customerId) {
      expenses = await ctx.db
        .query("billableExpenses")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .order("desc")
        .collect();
    } else if (args.status) {
      expenses = await ctx.db
        .query("billableExpenses")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else if (args.projectId) {
      expenses = await ctx.db
        .query("billableExpenses")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .order("desc")
        .collect();
    } else {
      expenses = await ctx.db
        .query("billableExpenses")
        .order("desc")
        .collect();
    }

    // Apply additional filters
    if (args.status && args.customerId) {
      expenses = expenses.filter((e) => e.status === args.status);
    }
    if (args.projectId && !args.projectId) {
      expenses = expenses.filter((e) => e.projectId === args.projectId);
    }

    // Enrich with related data
    const enriched = await Promise.all(
      expenses.map(async (expense) => {
        const customer = await ctx.db.get(expense.customerId);
        const project = expense.projectId ? await ctx.db.get(expense.projectId) : null;
        const category = expense.categoryId ? await ctx.db.get(expense.categoryId) : null;
        const vendor = expense.vendorId ? await ctx.db.get(expense.vendorId) : null;
        return {
          ...expense,
          customerName: customer?.name ?? "Unknown",
          projectName: project?.name ?? null,
          categoryName: category?.name ?? null,
          vendorName: vendor?.name ?? null,
        };
      })
    );

    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("billableExpenses") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const expense = await ctx.db.get(args.id);
    if (!expense) throw new ConvexError({ message: "Billable expense not found", code: "NOT_FOUND" });

    const customer = await ctx.db.get(expense.customerId);
    const project = expense.projectId ? await ctx.db.get(expense.projectId) : null;
    const category = expense.categoryId ? await ctx.db.get(expense.categoryId) : null;
    const vendor = expense.vendorId ? await ctx.db.get(expense.vendorId) : null;

    return {
      ...expense,
      customerName: customer?.name ?? "Unknown",
      projectName: project?.name ?? null,
      categoryName: category?.name ?? null,
      vendorName: vendor?.name ?? null,
    };
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const all = await ctx.db.query("billableExpenses").collect();

    const unbilled = all.filter((e) => e.status === "unbilled");
    const billed = all.filter((e) => e.status === "billed");
    const paid = all.filter((e) => e.status === "paid");

    return {
      totalCount: all.length,
      unbilledCount: unbilled.length,
      unbilledAmount: unbilled.reduce((sum, e) => sum + e.billedAmount, 0),
      billedCount: billed.length,
      billedAmount: billed.reduce((sum, e) => sum + e.billedAmount, 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, e) => sum + e.billedAmount, 0),
      totalCost: all.reduce((sum, e) => sum + e.amount, 0),
      totalBillable: all.reduce((sum, e) => sum + e.billedAmount, 0),
      totalMarkup: all.reduce((sum, e) => sum + (e.billedAmount - e.amount), 0),
    };
  },
});

export const getUnbilledByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const expenses = await ctx.db
      .query("billableExpenses")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    const unbilled = expenses.filter((e) => e.status === "unbilled");

    const enriched = await Promise.all(
      unbilled.map(async (expense) => {
        const project = expense.projectId ? await ctx.db.get(expense.projectId) : null;
        const category = expense.categoryId ? await ctx.db.get(expense.categoryId) : null;
        return {
          ...expense,
          projectName: project?.name ?? null,
          categoryName: category?.name ?? null,
        };
      })
    );

    return enriched;
  },
});

// ==================== MUTATIONS ====================

export const create = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    customerId: v.id("customers"),
    projectId: v.optional(v.id("projects")),
    categoryId: v.optional(v.id("expenseCategories")),
    vendorId: v.optional(v.id("vendors")),
    receiptStorageId: v.optional(v.id("_storage")),
    markup: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"billableExpenses">> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    // Validate customer exists
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // Validate project if provided
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new ConvexError({ message: "Project not found", code: "NOT_FOUND" });
    }

    const billedAmount = Math.round(args.amount * (1 + args.markup / 100) * 100) / 100;

    const id = await ctx.db.insert("billableExpenses", {
      description: args.description,
      amount: args.amount,
      date: args.date,
      customerId: args.customerId,
      projectId: args.projectId,
      categoryId: args.categoryId,
      vendorId: args.vendorId,
      receiptStorageId: args.receiptStorageId,
      markup: args.markup,
      billedAmount,
      status: "unbilled",
      notes: args.notes,
      recordedBy: user._id,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("billableExpenses"),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    date: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
    projectId: v.optional(v.id("projects")),
    categoryId: v.optional(v.id("expenseCategories")),
    vendorId: v.optional(v.id("vendors")),
    receiptStorageId: v.optional(v.id("_storage")),
    markup: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const expense = await ctx.db.get(args.id);
    if (!expense) throw new ConvexError({ message: "Billable expense not found", code: "NOT_FOUND" });

    if (expense.status !== "unbilled") {
      throw new ConvexError({
        message: "Cannot edit a billed or paid expense",
        code: "BAD_REQUEST",
      });
    }

    const updates: Record<string, unknown> = {};
    if (args.description !== undefined) updates.description = args.description;
    if (args.amount !== undefined) updates.amount = args.amount;
    if (args.date !== undefined) updates.date = args.date;
    if (args.customerId !== undefined) updates.customerId = args.customerId;
    if (args.projectId !== undefined) updates.projectId = args.projectId;
    if (args.categoryId !== undefined) updates.categoryId = args.categoryId;
    if (args.vendorId !== undefined) updates.vendorId = args.vendorId;
    if (args.receiptStorageId !== undefined) updates.receiptStorageId = args.receiptStorageId;
    if (args.markup !== undefined) updates.markup = args.markup;
    if (args.notes !== undefined) updates.notes = args.notes;

    // Recalculate billed amount if amount or markup changed
    const newAmount = (updates.amount as number | undefined) ?? expense.amount;
    const newMarkup = (updates.markup as number | undefined) ?? expense.markup;
    updates.billedAmount = Math.round(newAmount * (1 + newMarkup / 100) * 100) / 100;

    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("billableExpenses") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const expense = await ctx.db.get(args.id);
    if (!expense) throw new ConvexError({ message: "Billable expense not found", code: "NOT_FOUND" });

    if (expense.status !== "unbilled") {
      throw new ConvexError({
        message: "Cannot delete a billed or paid expense",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.delete(args.id);
  },
});

export const billToInvoice = mutation({
  args: {
    expenseIds: v.array(v.id("billableExpenses")),
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    if (invoice.status === "paid" || invoice.status === "void") {
      throw new ConvexError({
        message: "Cannot add expenses to a paid or voided invoice",
        code: "BAD_REQUEST",
      });
    }

    let totalAdded = 0;

    for (const expenseId of args.expenseIds) {
      const expense = await ctx.db.get(expenseId);
      if (!expense) continue;
      if (expense.status !== "unbilled") continue;
      if (expense.customerId !== invoice.customerId) {
        throw new ConvexError({
          message: "Expense customer does not match invoice customer",
          code: "BAD_REQUEST",
        });
      }

      // Add as invoice line item
      await ctx.db.insert("invoiceItems", {
        invoiceId: args.invoiceId,
        description: `[Billable Expense] ${expense.description}`,
        quantity: 1,
        unitPrice: expense.billedAmount,
        subtotal: expense.billedAmount,
      });

      // Mark expense as billed
      await ctx.db.patch(expenseId, {
        status: "billed",
        invoiceId: args.invoiceId,
      });

      totalAdded += expense.billedAmount;
    }

    // Update invoice totals
    const newSubtotal = invoice.subtotal + totalAdded;
    const taxRate = invoice.taxRate ?? 0;
    const discount = invoice.discount ?? 0;
    const afterDiscount = newSubtotal - discount;
    const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
    const totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;

    await ctx.db.patch(args.invoiceId, {
      subtotal: Math.round(newSubtotal * 100) / 100,
      taxAmount,
      totalAmount,
    });

    return { itemsAdded: args.expenseIds.length, totalAdded };
  },
});

export const markAsPaid = mutation({
  args: { expenseIds: v.array(v.id("billableExpenses")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    for (const expenseId of args.expenseIds) {
      const expense = await ctx.db.get(expenseId);
      if (!expense) continue;
      if (expense.status === "billed") {
        await ctx.db.patch(expenseId, { status: "paid" });
      }
    }
  },
});
