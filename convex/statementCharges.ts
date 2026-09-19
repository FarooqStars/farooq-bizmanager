import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";
import type { MutationCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }; db: unknown }) {
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

// ─── Queries ─────────────────────────────────────────────────

export const list = query({
  args: {
    status: v.optional(v.string()),
    customerId: v.optional(v.id("customers")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let charges: Doc<"statementCharges">[];

    if (args.customerId) {
      charges = await ctx.db
        .query("statementCharges")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .order("desc")
        .collect();
    } else if (args.status) {
      charges = await ctx.db
        .query("statementCharges")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "pending" | "paid" | "partially_paid" | "void")
        )
        .order("desc")
        .collect();
    } else {
      charges = await ctx.db.query("statementCharges").order("desc").collect();
    }

    // Apply additional filters
    if (args.customerId && args.status) {
      charges = charges.filter((c) => c.status === args.status);
    }

    // Enrich with customer name
    const enriched = await Promise.all(
      charges.map(async (charge) => {
        const customer = await ctx.db.get(charge.customerId);
        return { ...charge, customerName: customer?.name ?? "Unknown" };
      })
    );

    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("statementCharges") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const charge = await ctx.db.get(args.id);
    if (!charge) throw new ConvexError({ message: "Statement charge not found", code: "NOT_FOUND" });
    const customer = await ctx.db.get(charge.customerId);
    return { ...charge, customerName: customer?.name ?? "Unknown" };
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const all = await ctx.db.query("statementCharges").collect();
    const pending = all.filter((c) => c.status === "pending");
    const partiallyPaid = all.filter((c) => c.status === "partially_paid");
    const paid = all.filter((c) => c.status === "paid");

    return {
      totalCharges: all.length,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, c) => sum + (c.totalAmount - c.amountPaid), 0),
      partiallyPaidCount: partiallyPaid.length,
      partiallyPaidAmount: partiallyPaid.reduce((sum, c) => sum + (c.totalAmount - c.amountPaid), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, c) => sum + c.totalAmount, 0),
      totalOutstanding: [...pending, ...partiallyPaid].reduce((sum, c) => sum + (c.totalAmount - c.amountPaid), 0),
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    date: v.string(),
    dueDate: v.string(),
    items: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      rate: v.number(),
      amount: v.number(),
    })),
    taxRate: v.optional(v.number()),
    memo: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Verify customer exists
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // Generate charge number
    const existing = await ctx.db.query("statementCharges").order("desc").take(1);
    const lastNum = existing.length > 0
      ? parseInt(existing[0].chargeNumber.replace("SC-", ""), 10) || 0
      : 0;
    const chargeNumber = `SC-${String(lastNum + 1).padStart(5, "0")}`;

    // Calculate totals
    const subtotal = args.items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = args.taxRate ? subtotal * (args.taxRate / 100) : 0;
    const totalAmount = subtotal + taxAmount;

    const id = await ctx.db.insert("statementCharges", {
      chargeNumber,
      customerId: args.customerId,
      date: args.date,
      dueDate: args.dueDate,
      status: "pending",
      items: args.items,
      subtotal,
      taxRate: args.taxRate,
      taxAmount: taxAmount > 0 ? taxAmount : undefined,
      totalAmount,
      amountPaid: 0,
      memo: args.memo,
      currency: args.currency,
      createdBy: user._id,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "statementCharges:create",
      resourceType: "statementCharge",
      resourceId: id,
      action: "statement_charge_created",
      afterValue: JSON.stringify({ chargeNumber, totalAmount, customerId: args.customerId }),
      details: `Created statement charge ${chargeNumber} for ${totalAmount}`,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("statementCharges"),
    customerId: v.optional(v.id("customers")),
    date: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    items: v.optional(v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      rate: v.number(),
      amount: v.number(),
    }))),
    taxRate: v.optional(v.number()),
    memo: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const charge = await ctx.db.get(args.id);
    if (!charge) throw new ConvexError({ message: "Statement charge not found", code: "NOT_FOUND" });
    if (charge.status === "paid") throw new ConvexError({ message: "Cannot edit a paid charge", code: "BAD_REQUEST" });

    const beforeValue = JSON.stringify(charge);

    const updates: Record<string, unknown> = {};
    if (args.customerId) updates.customerId = args.customerId;
    if (args.date) updates.date = args.date;
    if (args.dueDate) updates.dueDate = args.dueDate;
    if (args.memo !== undefined) updates.memo = args.memo;
    if (args.currency) updates.currency = args.currency;

    if (args.items) {
      const subtotal = args.items.reduce((sum, item) => sum + item.amount, 0);
      const taxRate = args.taxRate ?? charge.taxRate ?? 0;
      const taxAmount = taxRate ? subtotal * (taxRate / 100) : 0;
      updates.items = args.items;
      updates.subtotal = subtotal;
      updates.taxRate = args.taxRate ?? charge.taxRate;
      updates.taxAmount = taxAmount > 0 ? taxAmount : undefined;
      updates.totalAmount = subtotal + taxAmount;
    } else if (args.taxRate !== undefined) {
      const taxAmount = args.taxRate ? charge.subtotal * (args.taxRate / 100) : 0;
      updates.taxRate = args.taxRate;
      updates.taxAmount = taxAmount > 0 ? taxAmount : undefined;
      updates.totalAmount = charge.subtotal + taxAmount;
    }

    await ctx.db.patch(args.id, updates);

    const updatedCharge = await ctx.db.get(args.id);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "statementCharges:update",
      resourceType: "statementCharge",
      resourceId: args.id,
      action: "statement_charge_updated",
      beforeValue,
      afterValue: JSON.stringify(updatedCharge),
      details: `Updated statement charge ${charge.chargeNumber}`,
    });
  },
});

export const recordPayment = mutation({
  args: {
    id: v.id("statementCharges"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const charge = await ctx.db.get(args.id);
    if (!charge) throw new ConvexError({ message: "Statement charge not found", code: "NOT_FOUND" });
    if (charge.status === "paid" || charge.status === "void") {
      throw new ConvexError({ message: "Cannot pay a paid or voided charge", code: "BAD_REQUEST" });
    }

    const newAmountPaid = charge.amountPaid + args.amount;
    const outstanding = charge.totalAmount - newAmountPaid;

    let newStatus: "paid" | "partially_paid" = "partially_paid";
    if (outstanding <= 0.01) {
      newStatus = "paid";
    }

    await ctx.db.patch(args.id, {
      amountPaid: newAmountPaid,
      status: newStatus,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "statementCharges:recordPayment",
      resourceType: "statementCharge",
      resourceId: args.id,
      action: "statement_charge_payment_recorded",
      details: `Payment of ${args.amount} recorded on charge ${charge.chargeNumber}`,
    });
  },
});

export const voidCharge = mutation({
  args: { id: v.id("statementCharges") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const charge = await ctx.db.get(args.id);
    if (!charge) throw new ConvexError({ message: "Statement charge not found", code: "NOT_FOUND" });
    if (charge.status === "paid") {
      throw new ConvexError({ message: "Cannot void a fully paid charge", code: "BAD_REQUEST" });
    }

    const beforeValue = JSON.stringify(charge);
    await ctx.db.patch(args.id, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "statementCharges:voidCharge",
      resourceType: "statementCharge",
      resourceId: args.id,
      action: "statement_charge_voided",
      beforeValue,
      details: `Voided statement charge ${charge.chargeNumber}`,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("statementCharges") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const charge = await ctx.db.get(args.id);
    if (!charge) throw new ConvexError({ message: "Statement charge not found", code: "NOT_FOUND" });
    if (charge.status === "paid") {
      throw new ConvexError({ message: "Cannot delete a paid charge", code: "BAD_REQUEST" });
    }

    const beforeValue = JSON.stringify(charge);
    await ctx.db.delete(args.id);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "statementCharges:remove",
      resourceType: "statementCharge",
      resourceId: args.id,
      action: "statement_charge_deleted",
      beforeValue,
      details: `Deleted statement charge ${charge.chargeNumber}`,
    });
  },
});
