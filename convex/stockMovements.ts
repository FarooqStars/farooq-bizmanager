import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";
import { postStockAdjustment } from "./lib/inventoryPosting.ts";

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Record a stock movement ─────────────────────────────────

export const recordMovement = mutation({
  args: {
    productId: v.id("products"),
    warehouseId: v.id("warehouses"),
    type: v.union(v.literal("in"), v.literal("out")),
    quantity: v.number(),
    reason: v.union(
      v.literal("purchase"),
      v.literal("sale"),
      v.literal("return"),
      v.literal("transfer"),
      v.literal("adjustment"),
      v.literal("damage"),
      v.literal("other")
    ),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (args.quantity <= 0) {
      throw new ConvexError({ message: "Quantity must be greater than zero", code: "BAD_REQUEST" });
    }

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ message: "Product not found", code: "NOT_FOUND" });

    const warehouse = await ctx.db.get(args.warehouseId);
    if (!warehouse) throw new ConvexError({ message: "Warehouse not found", code: "NOT_FOUND" });

    // Get current inventory level
    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_product_and_warehouse", (q) =>
        q.eq("productId", args.productId).eq("warehouseId", args.warehouseId)
      )
      .unique();

    const currentQty = existing?.quantity ?? 0;
    let newQty: number;

    if (args.type === "in") {
      newQty = currentQty + args.quantity;
    } else {
      if (args.quantity > currentQty) {
        throw new ConvexError({
          message: `Cannot remove ${args.quantity} items. Only ${currentQty} available.`,
          code: "BAD_REQUEST",
        });
      }
      newQty = currentQty - args.quantity;
    }

    // Update inventory
    if (existing) {
      await ctx.db.patch(existing._id, { quantity: newQty });
    } else {
      await ctx.db.insert("inventory", {
        productId: args.productId,
        warehouseId: args.warehouseId,
        quantity: newQty,
      });
    }

    // Record the movement
    const timestamp = new Date().toISOString();
    const movementId = await ctx.db.insert("stockMovements", {
      productId: args.productId,
      warehouseId: args.warehouseId,
      type: args.type,
      quantity: args.quantity,
      reason: args.reason,
      reference: args.reference,
      notes: args.notes,
      recordedBy: user._id,
      timestamp,
    });

    // A hand-recorded movement has no invoice or bill behind it, so it posts
    // its own adjustment to keep the Inventory account in step.
    await postStockAdjustment(ctx, {
      productId: args.productId,
      quantityDelta: args.type === "in" ? args.quantity : -args.quantity,
      movementId,
      description: `Stock ${args.type === "in" ? "in" : "out"} (${args.reason}): ${product.name}`,
      createdBy: user._id,
    });

    // Activity log
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "stockMovements:recordMovement",
      resourceType: "inventory",
      resourceId: args.productId,
      action: `Stock ${args.type === "in" ? "received" : "issued"}`,
      details: `${product.name}: ${args.type === "in" ? "+" : "-"}${args.quantity} at ${warehouse.name} (${args.reason})`,
      beforeValue: JSON.stringify({ quantity: currentQty }),
      afterValue: JSON.stringify({ quantity: newQty }),
    });

    return { newQty };
  },
});

// ─── List movements with filters ────────────────────────────

export const listMovements = query({
  args: {
    productId: v.optional(v.id("products")),
    warehouseId: v.optional(v.id("warehouses")),
    type: v.optional(v.union(v.literal("in"), v.literal("out"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let movements;
    if (args.productId) {
      movements = await ctx.db
        .query("stockMovements")
        .withIndex("by_product", (q) => q.eq("productId", args.productId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else if (args.warehouseId) {
      movements = await ctx.db
        .query("stockMovements")
        .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else if (args.type) {
      movements = await ctx.db
        .query("stockMovements")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .order("desc")
        .take(args.limit ?? 100);
    } else {
      movements = await ctx.db
        .query("stockMovements")
        .order("desc")
        .take(args.limit ?? 100);
    }

    // Enrich with product, warehouse, and user info
    const enriched = await Promise.all(
      movements.map(async (m) => {
        const product = await ctx.db.get(m.productId);
        const warehouse = await ctx.db.get(m.warehouseId);
        const user = await ctx.db.get(m.recordedBy);
        return {
          ...m,
          productName: product?.name ?? "Deleted Product",
          warehouseName: warehouse?.name ?? "Deleted Warehouse",
          userName: user?.name ?? "Unknown",
        };
      })
    );

    return enriched;
  },
});

// ─── Movement summary (daily in/out totals for charts) ──────

export const movementSummary = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const daysBack = args.days ?? 14;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString();

    const movements = await ctx.db
      .query("stockMovements")
      .order("desc")
      .take(500);

    // Filter by date and group by day
    const dailyMap = new Map<string, { inQty: number; outQty: number; inCount: number; outCount: number }>();

    for (const m of movements) {
      if (m.timestamp < cutoffStr) continue;
      const day = m.timestamp.slice(0, 10);
      const entry = dailyMap.get(day) ?? { inQty: 0, outQty: 0, inCount: 0, outCount: 0 };
      if (m.type === "in") {
        entry.inQty += m.quantity;
        entry.inCount += 1;
      } else {
        entry.outQty += m.quantity;
        entry.outCount += 1;
      }
      dailyMap.set(day, entry);
    }

    // Fill in missing days
    const result: Array<{ date: string; inQty: number; outQty: number; inCount: number; outCount: number }> = [];
    const now = new Date();
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = dailyMap.get(key) ?? { inQty: 0, outQty: 0, inCount: 0, outCount: 0 };
      result.push({ date: key, ...entry });
    }

    return result;
  },
});

// ─── Real-time stats for dashboard widget ────────────────────

export const movementStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const today = new Date().toISOString().slice(0, 10);
    const movements = await ctx.db
      .query("stockMovements")
      .order("desc")
      .take(200);

    let todayIn = 0;
    let todayOut = 0;
    let todayInCount = 0;
    let todayOutCount = 0;
    let weekIn = 0;
    let weekOut = 0;

    const weekCutoff = new Date();
    weekCutoff.setDate(weekCutoff.getDate() - 7);
    const weekCutoffStr = weekCutoff.toISOString();

    for (const m of movements) {
      if (m.timestamp.startsWith(today)) {
        if (m.type === "in") { todayIn += m.quantity; todayInCount++; }
        else { todayOut += m.quantity; todayOutCount++; }
      }
      if (m.timestamp >= weekCutoffStr) {
        if (m.type === "in") weekIn += m.quantity;
        else weekOut += m.quantity;
      }
    }

    return { todayIn, todayOut, todayInCount, todayOutCount, weekIn, weekOut };
  },
});
