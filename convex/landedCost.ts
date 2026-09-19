import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { nextNumber } from "./lib/docNumber.ts";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
}) {
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

export const listLandedCosts = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let costs;
    if (args.status) {
      costs = await ctx.db
        .query("landedCosts")
        .withIndex("by_status", (q) => q.eq("status", args.status as "draft" | "applied"))
        .collect();
    } else {
      costs = await ctx.db.query("landedCosts").order("desc").collect();
    }

    const enriched = await Promise.all(
      costs.map(async (lc) => {
        const po = await ctx.db.get(lc.purchaseOrderId);
        return { ...lc, poNumber: po?.poNumber ?? "Unknown", vendorId: po?.vendorId };
      }),
    );
    return enriched;
  },
});

export const getLandedCost = query({
  args: { id: v.id("landedCosts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const lc = await ctx.db.get(args.id);
    if (!lc) return null;

    const po = await ctx.db.get(lc.purchaseOrderId);
    const allocations = await ctx.db
      .query("landedCostAllocations")
      .withIndex("by_landed_cost", (q) => q.eq("landedCostId", args.id))
      .collect();

    const enrichedAllocations = await Promise.all(
      allocations.map(async (alloc) => {
        const product = alloc.productId ? await ctx.db.get(alloc.productId) : null;
        const poItem = await ctx.db.get(alloc.purchaseOrderItemId);
        return {
          ...alloc,
          productName: product?.name ?? poItem?.description ?? "Unknown",
          description: poItem?.description ?? "",
        };
      }),
    );

    return { ...lc, poNumber: po?.poNumber ?? "Unknown", allocations: enrichedAllocations };
  },
});

export const getPurchaseOrderItemsForAllocation = query({
  args: { purchaseOrderId: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();

    const enriched = await Promise.all(
      items.map(async (item) => {
        const product = item.productId ? await ctx.db.get(item.productId) : null;
        return { ...item, productName: product?.name ?? item.description };
      }),
    );
    return enriched;
  },
});

export const listReceivedPurchaseOrders = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const received = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_status", (q) => q.eq("status", "received"))
      .collect();
    const partial = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_status", (q) => q.eq("status", "partially_received"))
      .collect();

    const all = [...received, ...partial];

    const enriched = await Promise.all(
      all.map(async (po) => {
        const vendor = await ctx.db.get(po.vendorId);
        return {
          _id: po._id,
          poNumber: po.poNumber,
          vendorName: vendor?.name ?? "Unknown",
          date: po.date,
          totalAmount: po.totalAmount,
          status: po.status,
        };
      }),
    );
    return enriched;
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const createLandedCost = mutation({
  args: {
    purchaseOrderId: v.id("purchaseOrders"),
    date: v.string(),
    shippingCost: v.number(),
    customsDuty: v.number(),
    insuranceCost: v.number(),
    handlingCost: v.number(),
    otherCosts: v.number(),
    allocationMethod: v.union(
      v.literal("by_value"),
      v.literal("by_quantity"),
      v.literal("by_weight"),
      v.literal("equal"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"landedCosts">> => {
    const user = await requireUser(ctx);

    await enforcePostingDate(ctx, args.date);

    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });

    const totalLandedCost =
      Math.round(
        (args.shippingCost +
          args.customsDuty +
          args.insuranceCost +
          args.handlingCost +
          args.otherCosts) *
          100,
      ) / 100;

    if (totalLandedCost <= 0) {
      throw new ConvexError({ message: "Total landed cost must be positive", code: "BAD_REQUEST" });
    }

    // Generate LC number
    const allLCs = await ctx.db.query("landedCosts").collect();
    const lcNumber = nextNumber(allLCs, (l) => l.lcNumber, "LC-", 5);

    const lcId = await ctx.db.insert("landedCosts", {
      lcNumber,
      purchaseOrderId: args.purchaseOrderId,
      date: args.date,
      shippingCost: args.shippingCost,
      customsDuty: args.customsDuty,
      insuranceCost: args.insuranceCost,
      handlingCost: args.handlingCost,
      otherCosts: args.otherCosts,
      totalLandedCost,
      allocationMethod: args.allocationMethod,
      notes: args.notes,
      status: "draft",
      createdBy: user._id,
    });

    // Calculate allocations
    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();

    if (items.length === 0) {
      throw new ConvexError({ message: "Purchase order has no items", code: "BAD_REQUEST" });
    }

    // Allocate costs based on method
    const totalValue = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

    for (const item of items) {
      let allocatedAmount: number;

      switch (args.allocationMethod) {
        case "by_value":
          allocatedAmount = totalValue > 0 ? (item.subtotal / totalValue) * totalLandedCost : 0;
          break;
        case "by_quantity":
          allocatedAmount = totalQty > 0 ? (item.quantity / totalQty) * totalLandedCost : 0;
          break;
        case "equal":
          allocatedAmount = totalLandedCost / items.length;
          break;
        case "by_weight":
          // Weight-based falls back to equal since we don't track weight
          allocatedAmount = totalLandedCost / items.length;
          break;
      }

      allocatedAmount = Math.round(allocatedAmount * 100) / 100;
      const receivedQty = item.receivedQuantity > 0 ? item.receivedQuantity : item.quantity;
      const newUnitCost = Math.round(((item.subtotal + allocatedAmount) / receivedQty) * 100) / 100;

      await ctx.db.insert("landedCostAllocations", {
        landedCostId: lcId,
        purchaseOrderItemId: item._id,
        productId: item.productId,
        allocatedAmount,
        originalCost: item.unitPrice,
        newUnitCost,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "landedCost:createLandedCost",
      resourceType: "landedCost",
      resourceId: lcId,
      action: "landed_cost_created",
      afterValue: JSON.stringify({ lcNumber, totalLandedCost, purchaseOrderId: args.purchaseOrderId }),
      details: `Created landed cost ${lcNumber} for ${totalLandedCost}`,
    });

    return lcId;
  },
});

export const applyLandedCost = mutation({
  args: { id: v.id("landedCosts") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lc = await ctx.db.get(args.id);
    if (!lc) throw new ConvexError({ message: "Landed cost not found", code: "NOT_FOUND" });
    if (lc.status === "applied") {
      throw new ConvexError({ message: "Already applied", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(args.id, { status: "applied" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "landedCost:applyLandedCost",
      resourceType: "landedCost",
      resourceId: args.id,
      action: "landed_cost_applied",
      details: `Applied landed cost ${lc.lcNumber} (${lc.totalLandedCost}) to PO ${lc.purchaseOrderId}`,
    });
  },
});

export const deleteLandedCost = mutation({
  args: { id: v.id("landedCosts") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lc = await ctx.db.get(args.id);
    if (!lc) throw new ConvexError({ message: "Landed cost not found", code: "NOT_FOUND" });
    if (lc.status === "applied") {
      throw new ConvexError({
        message: "Cannot delete an applied landed cost",
        code: "BAD_REQUEST",
      });
    }

    const beforeValue = JSON.stringify(lc);

    // Delete allocations
    const allocations = await ctx.db
      .query("landedCostAllocations")
      .withIndex("by_landed_cost", (q) => q.eq("landedCostId", args.id))
      .collect();
    for (const alloc of allocations) {
      await ctx.db.delete(alloc._id);
    }

    await ctx.db.delete(args.id);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "landedCost:deleteLandedCost",
      resourceType: "landedCost",
      resourceId: args.id,
      action: "landed_cost_deleted",
      beforeValue,
      details: `Deleted landed cost ${lc.lcNumber}`,
    });
  },
});
