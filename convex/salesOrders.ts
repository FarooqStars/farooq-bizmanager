import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { nextNumber } from "./lib/docNumber.ts";
import { assertCustomerCanBeInvoiced } from "./lib/creditControl.ts";

async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Queries ────────────────────────────────────────────────

export const list = query({
  args: { status: v.optional(v.string()), customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let orders;

    if (args.status) {
      orders = await ctx.db
        .query("salesOrders")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            args.status as
              | "draft"
              | "confirmed"
              | "partially_fulfilled"
              | "fulfilled"
              | "invoiced"
              | "cancelled",
          ),
        )
        .order("desc")
        .take(200);
    } else if (args.customerId) {
      orders = await ctx.db
        .query("salesOrders")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .order("desc")
        .take(200);
    } else {
      orders = await ctx.db.query("salesOrders").order("desc").take(200);
    }

    // Attach customer names
    const customerIds = [...new Set(orders.map((o) => o.customerId))];
    const customers = await Promise.all(customerIds.map((id) => ctx.db.get(id)));
    const customerMap = new Map(customers.filter(Boolean).map((c) => [c!._id, c!.name]));

    return orders.map((o) => ({ ...o, customerName: customerMap.get(o.customerId) ?? "Unknown" }));
  },
});

export const get = query({
  args: { id: v.id("salesOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const order = await ctx.db.get(args.id);
    if (!order) return null;

    const customer = await ctx.db.get(order.customerId);
    const items = await ctx.db
      .query("salesOrderItems")
      .withIndex("by_sales_order", (q) => q.eq("salesOrderId", args.id))
      .collect();

    return { ...order, customerName: customer?.name ?? "Unknown", items };
  },
});

// ─── Mutations ──────────────────────────────────────────────

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    date: v.string(),
    expectedDelivery: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Generate order number
    const allOrders = await ctx.db.query("salesOrders").collect();
    const orderNumber = nextNumber(allOrders, (o) => o.orderNumber, "SO-", 5);

    // Calculate totals
    const subtotal = args.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = args.taxRate ? Math.round(((subtotal * args.taxRate) / 100) * 100) / 100 : 0;
    const discount = args.discount ?? 0;
    const totalAmount = Math.round((subtotal + taxAmount - discount) * 100) / 100;

    const orderId = await ctx.db.insert("salesOrders", {
      orderNumber,
      customerId: args.customerId,
      date: args.date,
      expectedDelivery: args.expectedDelivery,
      status: "draft",
      subtotal,
      taxRate: args.taxRate,
      taxAmount,
      discount,
      totalAmount,
      invoicedAmount: 0,
      fulfilledPercentage: 0,
      currency: args.currency,
      notes: args.notes,
      createdBy: user._id,
    });

    // Insert items
    for (const item of args.items) {
      await ctx.db.insert("salesOrderItems", {
        salesOrderId: orderId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        fulfilledQty: 0,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      });
    }

    return orderId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("salesOrders"),
    status: v.union(
      v.literal("draft"),
      v.literal("confirmed"),
      v.literal("partially_fulfilled"),
      v.literal("fulfilled"),
      v.literal("invoiced"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError({ message: "Sales order not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const fulfillItems = mutation({
  args: {
    id: v.id("salesOrders"),
    fulfillments: v.array(v.object({ itemId: v.id("salesOrderItems"), quantity: v.number() })),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError({ message: "Sales order not found", code: "NOT_FOUND" });

    for (const f of args.fulfillments) {
      const item = await ctx.db.get(f.itemId);
      if (!item) continue;
      const newFulfilled = Math.min(item.quantity, item.fulfilledQty + f.quantity);
      await ctx.db.patch(f.itemId, { fulfilledQty: newFulfilled });
    }

    // Recalculate fulfillment percentage
    const items = await ctx.db
      .query("salesOrderItems")
      .withIndex("by_sales_order", (q) => q.eq("salesOrderId", args.id))
      .collect();

    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const fulfilledQty = items.reduce((s, i) => s + i.fulfilledQty, 0);
    const fulfilledPercentage = totalQty > 0 ? Math.round((fulfilledQty / totalQty) * 100) : 0;

    let newStatus = order.status;
    if (fulfilledPercentage >= 100) {
      newStatus = "fulfilled";
    } else if (fulfilledPercentage > 0) {
      newStatus = "partially_fulfilled";
    }

    await ctx.db.patch(args.id, { fulfilledPercentage, status: newStatus });
    return { fulfilledPercentage };
  },
});

export const convertToInvoice = mutation({
  args: {
    id: v.id("salesOrders"),
    dueDate: v.string(),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(
      v.union(v.literal("net_15"), v.literal("net_30"), v.literal("net_60"), v.literal("net_90")),
    ),
    percentage: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"invoices">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError({ message: "Sales order not found", code: "NOT_FOUND" });
    if (order.status === "cancelled") {
      throw new ConvexError({ message: "Cannot invoice a cancelled order", code: "BAD_REQUEST" });
    }

    const percentage = args.percentage ?? 100;
    if (percentage <= 0 || percentage > 100) {
      throw new ConvexError({
        message: "Percentage must be between 1 and 100",
        code: "BAD_REQUEST",
      });
    }

    // Calculate invoice amount based on percentage
    const invoiceSubtotal = Math.round(((order.subtotal * percentage) / 100) * 100) / 100;
    const invoiceTax = order.taxAmount
      ? Math.round(((order.taxAmount * percentage) / 100) * 100) / 100
      : 0;
    const invoiceDiscount = order.discount
      ? Math.round(((order.discount * percentage) / 100) * 100) / 100
      : 0;
    const invoiceTotal = Math.round((invoiceSubtotal + invoiceTax - invoiceDiscount) * 100) / 100;

    // Check we don't over-invoice
    const maxInvoiceable = order.totalAmount - order.invoicedAmount;
    if (invoiceTotal > maxInvoiceable + 0.01) {
      throw new ConvexError({
        message: `Cannot invoice more than remaining ${maxInvoiceable.toFixed(2)}`,
        code: "BAD_REQUEST",
      });
    }

    // Generate invoice number
    const allInvoices = await ctx.db.query("invoices").collect();
    const invoiceNumber = nextNumber(allInvoices, (i) => i.invoiceNumber, "INV-", 5);

    // EARLY WARNING GATE — same role as in createInvoice.
    const isCash = args.saleType === "cash";
    if (!isCash) {
      await assertCustomerCanBeInvoiced(ctx, order.customerId, invoiceTotal);
    }

    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      customerId: order.customerId,
      date: new Date().toISOString().slice(0, 10),
      dueDate: args.dueDate,
      status: isCash ? "paid" : "draft",
      saleType: args.saleType,
      creditTerms: args.creditTerms,
      subtotal: invoiceSubtotal,
      taxRate: order.taxRate,
      taxAmount: invoiceTax,
      discount: invoiceDiscount,
      totalAmount: invoiceTotal,
      amountPaid: isCash ? invoiceTotal : 0,
      currency: order.currency,
      notes: `From Sales Order ${order.orderNumber} (${percentage}%)`,
      createdBy: user._id,
    });

    // Copy items (scaled by percentage)
    const items = await ctx.db
      .query("salesOrderItems")
      .withIndex("by_sales_order", (q) => q.eq("salesOrderId", args.id))
      .collect();

    for (const item of items) {
      const qty = Math.round(((item.quantity * percentage) / 100) * 100) / 100;
      if (qty > 0) {
        await ctx.db.insert("invoiceItems", {
          invoiceId,
          productId: item.productId,
          description: item.description,
          quantity: qty,
          unitPrice: item.unitPrice,
          subtotal: Math.round(qty * item.unitPrice * 100) / 100,
        });
      }
    }

    // Update invoiced amount on the order
    const newInvoicedAmount = Math.round((order.invoicedAmount + invoiceTotal) * 100) / 100;
    const newStatus = newInvoicedAmount >= order.totalAmount - 0.01 ? "invoiced" : order.status;
    await ctx.db.patch(args.id, { invoicedAmount: newInvoicedAmount, status: newStatus });

    return invoiceId;
  },
});

export const convertFromQuotation = mutation({
  args: { quotationId: v.id("quotations"), expectedDelivery: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const quotation = await ctx.db.get(args.quotationId);
    if (!quotation) throw new ConvexError({ message: "Quotation not found", code: "NOT_FOUND" });

    // Generate order number
    const allOrders = await ctx.db.query("salesOrders").collect();
    const orderNumber = nextNumber(allOrders, (o) => o.orderNumber, "SO-", 5);

    const orderId = await ctx.db.insert("salesOrders", {
      orderNumber,
      customerId: quotation.customerId,
      date: new Date().toISOString().slice(0, 10),
      expectedDelivery: args.expectedDelivery,
      status: "confirmed",
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      discount: quotation.discount,
      totalAmount: quotation.totalAmount,
      invoicedAmount: 0,
      fulfilledPercentage: 0,
      currency: quotation.currency,
      notes: `From Quotation ${quotation.quoteNumber}`,
      fromQuotationId: args.quotationId,
      createdBy: user._id,
    });

    // Copy quotation items
    const qItems = await ctx.db
      .query("quotationItems")
      .withIndex("by_quotation", (q) => q.eq("quotationId", args.quotationId))
      .collect();

    for (const item of qItems) {
      await ctx.db.insert("salesOrderItems", {
        salesOrderId: orderId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        fulfilledQty: 0,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      });
    }

    // Mark quotation as accepted
    await ctx.db.patch(args.quotationId, { status: "accepted" });

    return orderId;
  },
});

export const remove = mutation({
  args: { id: v.id("salesOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const order = await ctx.db.get(args.id);
    if (!order) throw new ConvexError({ message: "Sales order not found", code: "NOT_FOUND" });
    if (order.invoicedAmount > 0) {
      throw new ConvexError({
        message: "Cannot delete an order that has been invoiced",
        code: "CONFLICT",
      });
    }

    // Delete items
    const items = await ctx.db
      .query("salesOrderItems")
      .withIndex("by_sales_order", (q) => q.eq("salesOrderId", args.id))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.id);
  },
});
