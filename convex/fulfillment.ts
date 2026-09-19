import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { nextNumber } from "./lib/docNumber.ts";

async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

async function getUser(ctx: QueryCtx) {
  const identity = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Queries ──────────────────────────────────────────────────────

export const list = query({
  args: { status: v.optional(v.string()), warehouseId: v.optional(v.id("warehouses")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("fulfillmentOrders")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            args.status as
              | "pending"
              | "picking"
              | "picked"
              | "packing"
              | "packed"
              | "shipped"
              | "delivered"
              | "cancelled",
          ),
        )
        .order("desc")
        .take(200);
    } else if (args.warehouseId) {
      orders = await ctx.db
        .query("fulfillmentOrders")
        .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId!))
        .order("desc")
        .take(200);
    } else {
      orders = await ctx.db.query("fulfillmentOrders").order("desc").take(200);
    }

    // Enrich with sales order and customer info
    const enriched = await Promise.all(
      orders.map(async (fo) => {
        const salesOrder = await ctx.db.get(fo.salesOrderId);
        let customerName = "Unknown";
        if (salesOrder) {
          const customer = await ctx.db.get(salesOrder.customerId);
          customerName = customer?.name ?? "Unknown";
        }
        const assignedUser = fo.assignedTo ? await ctx.db.get(fo.assignedTo) : null;
        const warehouse = fo.warehouseId ? await ctx.db.get(fo.warehouseId) : null;
        return {
          ...fo,
          orderNumber: salesOrder?.orderNumber ?? "N/A",
          customerName,
          assignedToName: assignedUser?.name ?? null,
          warehouseName: warehouse?.name ?? null,
        };
      }),
    );

    return enriched;
  },
});

export const get = query({
  args: { id: v.id("fulfillmentOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) return null;

    const salesOrder = await ctx.db.get(fo.salesOrderId);
    let customerName = "Unknown";
    let customerAddress = "";
    if (salesOrder) {
      const customer = await ctx.db.get(salesOrder.customerId);
      customerName = customer?.name ?? "Unknown";
      customerAddress = customer?.address ?? "";
    }

    const items = await ctx.db
      .query("fulfillmentItems")
      .withIndex("by_fulfillment", (q) => q.eq("fulfillmentOrderId", args.id))
      .collect();

    const assignedUser = fo.assignedTo ? await ctx.db.get(fo.assignedTo) : null;
    const warehouse = fo.warehouseId ? await ctx.db.get(fo.warehouseId) : null;
    const pickedByUser = fo.pickedBy ? await ctx.db.get(fo.pickedBy) : null;
    const packedByUser = fo.packedBy ? await ctx.db.get(fo.packedBy) : null;
    const shippedByUser = fo.shippedBy ? await ctx.db.get(fo.shippedBy) : null;

    return {
      ...fo,
      orderNumber: salesOrder?.orderNumber ?? "N/A",
      salesOrderTotal: salesOrder?.totalAmount ?? 0,
      customerName,
      customerAddress,
      shippingAddress: customerAddress,
      assignedToName: assignedUser?.name ?? null,
      warehouseName: warehouse?.name ?? null,
      pickedByName: pickedByUser?.name ?? null,
      packedByName: packedByUser?.name ?? null,
      shippedByName: shippedByUser?.name ?? null,
      items,
    };
  },
});

export const getSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const all = await ctx.db.query("fulfillmentOrders").collect();
    const pending = all.filter((f) => f.status === "pending").length;
    const picking = all.filter((f) => f.status === "picking").length;
    const picked = all.filter((f) => f.status === "picked").length;
    const packing = all.filter((f) => f.status === "packing").length;
    const packed = all.filter((f) => f.status === "packed").length;
    const shipped = all.filter((f) => f.status === "shipped").length;
    const delivered = all.filter((f) => f.status === "delivered").length;
    return { pending, picking, picked, packing, packed, shipped, delivered, total: all.length };
  },
});

export const getReadyToFulfill = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    // Get confirmed sales orders that don't have active fulfillment orders yet
    const confirmed = await ctx.db
      .query("salesOrders")
      .withIndex("by_status", (q) => q.eq("status", "confirmed"))
      .collect();

    const partiallyFulfilled = await ctx.db
      .query("salesOrders")
      .withIndex("by_status", (q) => q.eq("status", "partially_fulfilled"))
      .collect();

    const allEligible = [...confirmed, ...partiallyFulfilled];

    // For each, check if there's already an active fulfillment order
    const results = await Promise.all(
      allEligible.map(async (so) => {
        const existingFOs = await ctx.db
          .query("fulfillmentOrders")
          .withIndex("by_sales_order", (q) => q.eq("salesOrderId", so._id))
          .collect();
        const hasActive = existingFOs.some((f) => !["delivered", "cancelled"].includes(f.status));
        if (hasActive) return null;

        const customer = await ctx.db.get(so.customerId);
        return { ...so, customerName: customer?.name ?? "Unknown" };
      }),
    );

    return results.filter(Boolean);
  },
});

// ─── Mutations ────────────────────────────────────────────────────

export const create = mutation({
  args: {
    salesOrderId: v.id("salesOrders"),
    warehouseId: v.optional(v.id("warehouses")),
    priority: v.union(
      v.literal("low"),
      v.literal("normal"),
      v.literal("high"),
      v.literal("urgent"),
    ),
    assignedTo: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const salesOrder = await ctx.db.get(args.salesOrderId);
    if (!salesOrder) throw new ConvexError({ message: "Sales order not found", code: "NOT_FOUND" });
    if (salesOrder.status === "cancelled") {
      throw new ConvexError({ message: "Cannot fulfill a cancelled order", code: "BAD_REQUEST" });
    }

    // Generate fulfillment number
    const allFOs = await ctx.db.query("fulfillmentOrders").collect();
    const fulfillmentNumber = nextNumber(allFOs, (f) => f.fulfillmentNumber, "FO-", 5);

    const foId = await ctx.db.insert("fulfillmentOrders", {
      fulfillmentNumber,
      salesOrderId: args.salesOrderId,
      status: "pending",
      priority: args.priority,
      warehouseId: args.warehouseId,
      assignedTo: args.assignedTo,
      notes: args.notes,
      createdBy: user._id,
    });

    // Create fulfillment items from sales order items
    const soItems = await ctx.db
      .query("salesOrderItems")
      .withIndex("by_sales_order", (q) => q.eq("salesOrderId", args.salesOrderId))
      .collect();

    for (const item of soItems) {
      const remaining = item.quantity - item.fulfilledQty;
      if (remaining <= 0) continue;
      await ctx.db.insert("fulfillmentItems", {
        fulfillmentOrderId: foId,
        salesOrderItemId: item._id,
        productId: item.productId,
        description: item.description,
        orderedQty: remaining,
        pickedQty: 0,
        packedQty: 0,
        shippedQty: 0,
      });
    }

    return foId;
  },
});

export const startPicking = mutation({
  args: { id: v.id("fulfillmentOrders") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (fo.status !== "pending") {
      throw new ConvexError({ message: "Order is not in pending status", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, { status: "picking", assignedTo: fo.assignedTo ?? user._id });
  },
});

export const updatePickedQty = mutation({
  args: {
    itemId: v.id("fulfillmentItems"),
    pickedQty: v.number(),
    binLocation: v.optional(v.string()),
    lotNumber: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError({ message: "Item not found", code: "NOT_FOUND" });
    if (args.pickedQty > item.orderedQty) {
      throw new ConvexError({
        message: "Picked quantity exceeds ordered quantity",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch(args.itemId, {
      pickedQty: args.pickedQty,
      binLocation: args.binLocation,
      lotNumber: args.lotNumber,
      serialNumber: args.serialNumber,
    });
  },
});

export const completePicking = mutation({
  args: { id: v.id("fulfillmentOrders") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (fo.status !== "picking") {
      throw new ConvexError({ message: "Order is not in picking status", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, {
      status: "picked",
      pickedAt: new Date().toISOString(),
      pickedBy: user._id,
    });
  },
});

export const startPacking = mutation({
  args: { id: v.id("fulfillmentOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (fo.status !== "picked") {
      throw new ConvexError({ message: "Order must be picked first", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, { status: "packing" });
  },
});

export const updatePackedQty = mutation({
  args: { itemId: v.id("fulfillmentItems"), packedQty: v.number() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError({ message: "Item not found", code: "NOT_FOUND" });
    if (args.packedQty > item.pickedQty) {
      throw new ConvexError({
        message: "Packed quantity exceeds picked quantity",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch(args.itemId, { packedQty: args.packedQty });
  },
});

export const completePacking = mutation({
  args: {
    id: v.id("fulfillmentOrders"),
    weight: v.optional(v.number()),
    dimensions: v.optional(v.string()),
    packageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (fo.status !== "packing") {
      throw new ConvexError({ message: "Order is not in packing status", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, {
      status: "packed",
      packedAt: new Date().toISOString(),
      packedBy: user._id,
      weight: args.weight,
      dimensions: args.dimensions,
      packageCount: args.packageCount,
    });
  },
});

export const shipOrder = mutation({
  args: {
    id: v.id("fulfillmentOrders"),
    carrier: v.string(),
    trackingNumber: v.optional(v.string()),
    shippingMethod: v.optional(v.string()),
    estimatedDelivery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (fo.status !== "packed") {
      throw new ConvexError({ message: "Order must be packed first", code: "BAD_REQUEST" });
    }

    // Mark fulfillment items as shipped
    const items = await ctx.db
      .query("fulfillmentItems")
      .withIndex("by_fulfillment", (q) => q.eq("fulfillmentOrderId", args.id))
      .collect();
    for (const item of items) {
      await ctx.db.patch(item._id, { shippedQty: item.packedQty });
    }

    await ctx.db.patch(args.id, {
      status: "shipped",
      shippedAt: new Date().toISOString(),
      shippedBy: user._id,
      carrier: args.carrier,
      trackingNumber: args.trackingNumber,
      shippingMethod: args.shippingMethod,
      estimatedDelivery: args.estimatedDelivery,
    });

    // Update sales order fulfillment
    await updateSalesOrderFulfillment(ctx, fo.salesOrderId);
  },
});

export const markDelivered = mutation({
  args: { id: v.id("fulfillmentOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (fo.status !== "shipped") {
      throw new ConvexError({ message: "Order must be shipped first", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, { status: "delivered", deliveredAt: new Date().toISOString() });
  },
});

export const cancel = mutation({
  args: { id: v.id("fulfillmentOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const fo = await ctx.db.get(args.id);
    if (!fo) throw new ConvexError({ message: "Fulfillment order not found", code: "NOT_FOUND" });
    if (["shipped", "delivered"].includes(fo.status)) {
      throw new ConvexError({
        message: "Cannot cancel a shipped/delivered order",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch(args.id, { status: "cancelled" });
  },
});

// Helper: update parent sales order fulfillment percentage
async function updateSalesOrderFulfillment(ctx: MutationCtx, salesOrderId: Id<"salesOrders">) {
  const soItems = await ctx.db
    .query("salesOrderItems")
    .withIndex("by_sales_order", (q) => q.eq("salesOrderId", salesOrderId))
    .collect();

  // Get all fulfillment orders for this SO that are shipped/delivered
  const fos = await ctx.db
    .query("fulfillmentOrders")
    .withIndex("by_sales_order", (q) => q.eq("salesOrderId", salesOrderId))
    .collect();
  const completedFOs = fos.filter((f) => ["shipped", "delivered"].includes(f.status));

  // Sum shipped quantities per salesOrderItem
  const shippedMap = new Map<string, number>();
  for (const fo of completedFOs) {
    const items = await ctx.db
      .query("fulfillmentItems")
      .withIndex("by_fulfillment", (q) => q.eq("fulfillmentOrderId", fo._id))
      .collect();
    for (const item of items) {
      const key = item.salesOrderItemId as string;
      shippedMap.set(key, (shippedMap.get(key) ?? 0) + item.shippedQty);
    }
  }

  // Update each salesOrderItem's fulfilledQty
  let totalQty = 0;
  let totalFulfilled = 0;
  for (const soItem of soItems) {
    const shipped = shippedMap.get(soItem._id as string) ?? 0;
    const newFulfilled = Math.min(soItem.quantity, shipped);
    await ctx.db.patch(soItem._id, { fulfilledQty: newFulfilled });
    totalQty += soItem.quantity;
    totalFulfilled += newFulfilled;
  }

  const fulfilledPercentage = totalQty > 0 ? Math.round((totalFulfilled / totalQty) * 100) : 0;
  let newStatus: "confirmed" | "partially_fulfilled" | "fulfilled" = "confirmed";
  if (fulfilledPercentage >= 100) newStatus = "fulfilled";
  else if (fulfilledPercentage > 0) newStatus = "partially_fulfilled";

  await ctx.db.patch(salesOrderId, { fulfilledPercentage, status: newStatus });
}
