import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";
import { postStockAdjustment } from "./lib/inventoryPosting.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Warehouse Bins (Zone/Row/Shelf/Bin) ─────────────────────

export const listBins = query({
  args: { warehouseId: v.optional(v.id("warehouses")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const bins = args.warehouseId
      ? await ctx.db.query("warehouseBins").withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId!)).collect()
      : await ctx.db.query("warehouseBins").collect();

    const warehouses = await ctx.db.query("warehouses").collect();
    const whMap = new Map(warehouses.map((w) => [w._id, w.name]));

    return bins.map((b) => ({
      ...b,
      warehouseName: whMap.get(b.warehouseId) ?? "Unknown",
    }));
  },
});

export const createBin = mutation({
  args: {
    warehouseId: v.id("warehouses"),
    zone: v.optional(v.string()),
    row: v.optional(v.string()),
    shelf: v.optional(v.string()),
    bin: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const id = await ctx.db.insert("warehouseBins", { ...args, isActive: true });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "advancedInventory:createBin",
      resourceType: "warehouseBin",
      resourceId: id,
      action: "Created bin location",
      details: args.label,
      afterValue: JSON.stringify({ label: args.label, warehouseId: args.warehouseId }),
    });

    return id;
  },
});

export const updateBin = mutation({
  args: {
    binId: v.id("warehouseBins"),
    zone: v.optional(v.string()),
    row: v.optional(v.string()),
    shelf: v.optional(v.string()),
    bin: v.optional(v.string()),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const { binId, ...updates } = args;
    await ctx.db.patch(binId, updates);
  },
});

export const deleteBin = mutation({
  args: { binId: v.id("warehouseBins") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    await ctx.db.delete(args.binId);
  },
});

// ─── Lot & Serial Number Tracking ───────────────────────────

export const listLots = query({
  args: {
    productId: v.optional(v.id("products")),
    warehouseId: v.optional(v.id("warehouses")),
    status: v.optional(v.union(v.literal("available"), v.literal("reserved"), v.literal("expired"), v.literal("consumed"))),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let lots;
    if (args.productId) {
      lots = await ctx.db.query("lotNumbers").withIndex("by_product", (q) => q.eq("productId", args.productId!)).collect();
    } else if (args.warehouseId) {
      lots = await ctx.db.query("lotNumbers").withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId!)).collect();
    } else if (args.status) {
      lots = await ctx.db.query("lotNumbers").withIndex("by_status", (q) => q.eq("status", args.status!)).collect();
    } else {
      lots = await ctx.db.query("lotNumbers").collect();
    }

    const products = await ctx.db.query("products").collect();
    const warehouses = await ctx.db.query("warehouses").collect();
    const prodMap = new Map(products.map((p) => [p._id, p]));
    const whMap = new Map(warehouses.map((w) => [w._id, w.name]));

    return lots.map((l) => ({
      ...l,
      productName: prodMap.get(l.productId)?.name ?? "Deleted",
      productSku: prodMap.get(l.productId)?.sku,
      warehouseName: whMap.get(l.warehouseId) ?? "Unknown",
    }));
  },
});

export const createLot = mutation({
  args: {
    productId: v.id("products"),
    lotNumber: v.string(),
    serialNumber: v.optional(v.string()),
    warehouseId: v.id("warehouses"),
    binId: v.optional(v.id("warehouseBins")),
    quantity: v.number(),
    costPerUnit: v.optional(v.number()),
    manufacturedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.quantity <= 0) {
      throw new ConvexError({ message: "Quantity must be positive", code: "BAD_REQUEST" });
    }

    const id = await ctx.db.insert("lotNumbers", {
      ...args,
      receivedDate: new Date().toISOString(),
      status: "available",
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "advancedInventory:createLot",
      resourceType: "lot",
      resourceId: id,
      action: "Created lot/serial",
      details: `Lot ${args.lotNumber}${args.serialNumber ? ` / SN ${args.serialNumber}` : ""}`,
      afterValue: JSON.stringify({ lotNumber: args.lotNumber, serialNumber: args.serialNumber, quantity: args.quantity, status: "available" }),
    });

    return id;
  },
});

export const updateLotStatus = mutation({
  args: {
    lotId: v.id("lotNumbers"),
    status: v.union(v.literal("available"), v.literal("reserved"), v.literal("expired"), v.literal("consumed")),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const lotBefore = await ctx.db.get(args.lotId);
    const updates: Record<string, unknown> = { status: args.status };
    if (args.quantity !== undefined) updates.quantity = args.quantity;
    await ctx.db.patch(args.lotId, updates);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "advancedInventory:updateLotStatus",
      resourceType: "lot",
      resourceId: args.lotId,
      action: `Updated lot status to ${args.status}`,
      beforeValue: lotBefore ? JSON.stringify(lotBefore) : undefined,
      afterValue: JSON.stringify({ status: args.status, quantity: args.quantity }),
    });
  },
});

// ─── Cycle Counts ───────────────────────────────────────────

export const listCycleCounts = query({
  args: { status: v.optional(v.union(v.literal("planned"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled"))) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const counts = args.status
      ? await ctx.db.query("cycleCounts").withIndex("by_status", (q) => q.eq("status", args.status!)).order("desc").take(50)
      : await ctx.db.query("cycleCounts").order("desc").take(50);

    const enriched = await Promise.all(
      counts.map(async (c) => {
        const warehouse = await ctx.db.get(c.warehouseId);
        const creator = await ctx.db.get(c.createdBy);
        const items = await ctx.db
          .query("cycleCountItems")
          .withIndex("by_cycle_count", (q) => q.eq("cycleCountId", c._id))
          .collect();
        const countedItems = items.filter((i) => i.countedQuantity !== undefined).length;
        return {
          ...c,
          warehouseName: warehouse?.name ?? "Deleted",
          creatorName: creator?.name ?? "Unknown",
          totalItems: items.length,
          countedItems,
        };
      })
    );

    return enriched;
  },
});

export const getCycleCount = query({
  args: { cycleCountId: v.id("cycleCounts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const count = await ctx.db.get(args.cycleCountId);
    if (!count) throw new ConvexError({ message: "Cycle count not found", code: "NOT_FOUND" });

    const warehouse = await ctx.db.get(count.warehouseId);
    const items = await ctx.db
      .query("cycleCountItems")
      .withIndex("by_cycle_count", (q) => q.eq("cycleCountId", args.cycleCountId))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        const counter = item.countedBy ? await ctx.db.get(item.countedBy) : null;
        return {
          ...item,
          productName: product?.name ?? "Deleted",
          productSku: product?.sku,
          counterName: counter?.name ?? undefined,
        };
      })
    );

    return {
      ...count,
      warehouseName: warehouse?.name ?? "Deleted",
      items: enrichedItems,
    };
  },
});

export const createCycleCount = mutation({
  args: {
    warehouseId: v.id("warehouses"),
    scheduledDate: v.string(),
    notes: v.optional(v.string()),
    productIds: v.optional(v.array(v.id("products"))),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Generate count number
    const allCounts = await ctx.db.query("cycleCounts").order("desc").take(1);
    const lastNum = allCounts.length > 0
      ? parseInt(allCounts[0].countNumber.replace("CC-", ""), 10)
      : 0;
    const countNumber = `CC-${String(lastNum + 1).padStart(5, "0")}`;

    const cycleCountId = await ctx.db.insert("cycleCounts", {
      warehouseId: args.warehouseId,
      countNumber,
      status: "planned",
      scheduledDate: args.scheduledDate,
      notes: args.notes,
      createdBy: user._id,
    });

    // If product IDs specified, add those; otherwise add all products with stock in warehouse
    let productIds = args.productIds;
    if (!productIds || productIds.length === 0) {
      const inventoryRows = await ctx.db
        .query("inventory")
        .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
        .collect();
      productIds = inventoryRows.map((r) => r.productId);
    }

    for (const productId of productIds) {
      const invRow = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", productId).eq("warehouseId", args.warehouseId)
        )
        .unique();

      await ctx.db.insert("cycleCountItems", {
        cycleCountId,
        productId,
        expectedQuantity: invRow?.quantity ?? 0,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "advancedInventory:createCycleCount",
      resourceType: "cycleCount",
      resourceId: cycleCountId,
      action: "Created cycle count",
      details: countNumber,
      afterValue: JSON.stringify({ countNumber, warehouseId: args.warehouseId, scheduledDate: args.scheduledDate, status: "planned" }),
    });

    return cycleCountId;
  },
});

export const startCycleCount = mutation({
  args: { cycleCountId: v.id("cycleCounts") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const count = await ctx.db.get(args.cycleCountId);
    if (!count) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    if (count.status !== "planned") throw new ConvexError({ message: "Can only start planned counts", code: "BAD_REQUEST" });

    await ctx.db.patch(args.cycleCountId, { status: "in_progress" });
  },
});

export const recordCount = mutation({
  args: {
    itemId: v.id("cycleCountItems"),
    countedQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError({ message: "Item not found", code: "NOT_FOUND" });

    const variance = args.countedQuantity - item.expectedQuantity;

    await ctx.db.patch(args.itemId, {
      countedQuantity: args.countedQuantity,
      variance,
      countedBy: user._id,
      countedAt: new Date().toISOString(),
    });
  },
});

export const completeCycleCount = mutation({
  args: { cycleCountId: v.id("cycleCounts"), adjustInventory: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const count = await ctx.db.get(args.cycleCountId);
    if (!count) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    if (count.status !== "in_progress") throw new ConvexError({ message: "Can only complete in-progress counts", code: "BAD_REQUEST" });

    const items = await ctx.db
      .query("cycleCountItems")
      .withIndex("by_cycle_count", (q) => q.eq("cycleCountId", args.cycleCountId))
      .collect();

    // Check all items have been counted
    const uncounted = items.filter((i) => i.countedQuantity === undefined);
    if (uncounted.length > 0) {
      throw new ConvexError({ message: `${uncounted.length} items not yet counted`, code: "BAD_REQUEST" });
    }

    // Optionally adjust inventory to match counted quantities
    if (args.adjustInventory) {
      for (const item of items) {
        if (item.variance === 0 || item.variance === undefined) continue;

        const invRow = await ctx.db
          .query("inventory")
          .withIndex("by_product_and_warehouse", (q) =>
            q.eq("productId", item.productId).eq("warehouseId", count.warehouseId)
          )
          .unique();

        if (invRow && item.countedQuantity !== undefined) {
          await ctx.db.patch(invRow._id, { quantity: item.countedQuantity });

          // Record adjustment movement
          const adjustType = item.variance! > 0 ? "in" : "out";
          const movementId = await ctx.db.insert("stockMovements", {
            productId: item.productId,
            warehouseId: count.warehouseId,
            type: adjustType as "in" | "out",
            quantity: Math.abs(item.variance!),
            reason: "adjustment",
            reference: count.countNumber,
            notes: "Cycle count adjustment",
            recordedBy: user._id,
            timestamp: new Date().toISOString(),
          });
          await postStockAdjustment(ctx, {
            productId: item.productId,
            quantityDelta: item.variance!,
            movementId,
            description: `Cycle count ${count.countNumber} adjustment`,
            createdBy: user._id,
          });
        }
      }
    }

    await ctx.db.patch(args.cycleCountId, {
      status: "completed",
      completedDate: new Date().toISOString(),
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "advancedInventory:completeCycleCount",
      resourceType: "cycleCount",
      resourceId: args.cycleCountId,
      action: "Completed cycle count",
      details: `${count.countNumber} - ${args.adjustInventory ? "with" : "without"} adjustments`,
      beforeValue: JSON.stringify({ status: count.status }),
      afterValue: JSON.stringify({ status: "completed", adjustInventory: args.adjustInventory }),
    });
  },
});

export const cancelCycleCount = mutation({
  args: { cycleCountId: v.id("cycleCounts") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const count = await ctx.db.get(args.cycleCountId);
    if (!count) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    if (count.status === "completed") throw new ConvexError({ message: "Cannot cancel completed counts", code: "BAD_REQUEST" });

    await ctx.db.patch(args.cycleCountId, { status: "cancelled" });
  },
});
