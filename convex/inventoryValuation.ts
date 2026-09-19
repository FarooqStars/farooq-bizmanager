import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Inventory Classes CRUD ──────────────────────────────────

export const listClasses = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("inventoryClasses").collect();
  },
});

export const createClass = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("inventoryClasses")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }
    return await ctx.db.insert("inventoryClasses", {
      name: args.name,
      description: args.description,
      parentId: args.parentId,
      isActive: true,
    });
  },
});

export const updateClass = mutation({
  args: {
    id: v.id("inventoryClasses"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("inventoryClasses")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const deleteClass = mutation({
  args: { id: v.id("inventoryClasses") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can delete classes", code: "FORBIDDEN" });
    }
    // Check if any products use this class
    const products = await ctx.db
      .query("products")
      .withIndex("by_class", (q) => q.eq("classId", args.id))
      .take(1);
    if (products.length > 0) {
      throw new ConvexError({ message: "Cannot delete class in use by products", code: "BAD_REQUEST" });
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Inventory Valuation Settings ────────────────────────────

export const updateGlobalValuationMethod = mutation({
  args: {
    method: v.union(v.literal("fifo"), v.literal("lifo"), v.literal("weighted_average")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can change valuation method", code: "FORBIDDEN" });
    }
    const profiles = await ctx.db.query("companyProfile").take(1);
    if (profiles[0]) {
      await ctx.db.patch(profiles[0]._id, { inventoryValuationMethod: args.method });
    }
  },
});

export const updateProductValuation = mutation({
  args: {
    productId: v.id("products"),
    valuationMethod: v.optional(v.union(v.literal("fifo"), v.literal("lifo"), v.literal("weighted_average"))),
    costPrice: v.optional(v.number()),
    classId: v.optional(v.id("inventoryClasses")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }
    const { productId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(productId, filtered);
  },
});

// ─── Inventory Valuation Report ──────────────────────────────

export const getValuationReport = query({
  args: {
    warehouseId: v.optional(v.id("warehouses")),
    classId: v.optional(v.id("inventoryClasses")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Get global method
    const profiles = await ctx.db.query("companyProfile").take(1);
    const globalMethod = profiles[0]?.inventoryValuationMethod ?? "weighted_average";

    // Get all products (type: product only)
    let products = await ctx.db
      .query("products")
      .withIndex("by_type", (q) => q.eq("type", "product"))
      .collect();

    // Filter by class if specified
    if (args.classId) {
      products = products.filter((p) => p.classId === args.classId);
    }

    const report = await Promise.all(
      products.filter((p) => p.isActive).map(async (product) => {
        // Get inventory quantity
        let inventoryRecords;
        if (args.warehouseId) {
          inventoryRecords = await ctx.db
            .query("inventory")
            .withIndex("by_product_and_warehouse", (q) =>
              q.eq("productId", product._id).eq("warehouseId", args.warehouseId!)
            )
            .collect();
        } else {
          inventoryRecords = await ctx.db
            .query("inventory")
            .withIndex("by_product", (q) => q.eq("productId", product._id))
            .collect();
        }
        const totalQty = inventoryRecords.reduce((sum, r) => sum + r.quantity, 0);
        if (totalQty <= 0) return null;

        // Get the valuation method for this product
        const method = product.valuationMethod ?? globalMethod;

        // Get stock movements for this product
        const movements = await ctx.db
          .query("stockMovements")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect();

        // Calculate valuation based on method
        const unitCost = calculateUnitCost(method, movements, totalQty, product.costPrice ?? 0);
        const totalValue = unitCost * totalQty;

        // Get class info
        const classInfo = product.classId ? await ctx.db.get(product.classId) : null;

        return {
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: totalQty,
          unitCost,
          totalValue,
          method,
          className: classInfo?.name ?? null,
          classId: product.classId ?? null,
        };
      })
    );

    // Filter nulls and compute totals
    const items = report.filter((r) => r !== null);
    const totalValue = items.reduce((sum, r) => sum + r.totalValue, 0);

    return { items, totalValue, globalMethod };
  },
});

// ─── Class-level P&L Summary ─────────────────────────────────

export const getClassProfitSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const classes = await ctx.db.query("inventoryClasses").collect();
    const activeClasses = classes.filter((c) => c.isActive);

    const summary = await Promise.all(
      activeClasses.map(async (cls) => {
        // Get products in this class
        const products = await ctx.db
          .query("products")
          .withIndex("by_class", (q) => q.eq("classId", cls._id))
          .collect();

        // Get stock movements for products in this class (sales + purchases)
        let totalCostOfGoods = 0;
        let totalRevenue = 0;

        for (const product of products) {
          const movements = await ctx.db
            .query("stockMovements")
            .withIndex("by_product", (q) => q.eq("productId", product._id))
            .collect();

          for (const mov of movements) {
            if (mov.type === "out" && mov.reason === "sale") {
              const cost = mov.costPerUnit ?? product.costPrice ?? 0;
              totalCostOfGoods += cost * mov.quantity;
              totalRevenue += product.unitPrice * mov.quantity;
            }
          }
        }

        return {
          classId: cls._id,
          className: cls.name,
          productCount: products.length,
          totalRevenue,
          totalCostOfGoods,
          grossProfit: totalRevenue - totalCostOfGoods,
          margin: totalRevenue > 0 ? ((totalRevenue - totalCostOfGoods) / totalRevenue) * 100 : 0,
        };
      })
    );

    return summary;
  },
});

// ─── Valuation Calculation Helper ────────────────────────────

type Movement = {
  type: "in" | "out";
  quantity: number;
  costPerUnit?: number;
  timestamp: string;
};

function calculateUnitCost(
  method: string,
  movements: Movement[],
  currentQty: number,
  defaultCost: number
): number {
  // Sort movements by timestamp
  const sorted = [...movements].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const inMovements = sorted
    .filter((m) => m.type === "in" && m.costPerUnit !== undefined && m.costPerUnit > 0)
    .map((m) => ({ qty: m.quantity, cost: m.costPerUnit! }));

  if (inMovements.length === 0) return defaultCost;

  if (method === "weighted_average") {
    const totalCost = inMovements.reduce((sum, m) => sum + m.cost * m.qty, 0);
    const totalQty = inMovements.reduce((sum, m) => sum + m.qty, 0);
    return totalQty > 0 ? totalCost / totalQty : defaultCost;
  }

  if (method === "fifo") {
    // FIFO: oldest costs are used first for outgoing
    // Remaining stock is valued at most recent costs
    const outMovements = sorted.filter((m) => m.type === "out");
    const totalOut = outMovements.reduce((sum, m) => sum + m.quantity, 0);

    // Simulate FIFO consumption
    let consumed = 0;
    let layerIdx = 0;
    const layers = inMovements.map((m) => ({ ...m, remaining: m.qty }));

    while (consumed < totalOut && layerIdx < layers.length) {
      const canConsume = Math.min(layers[layerIdx].remaining, totalOut - consumed);
      layers[layerIdx].remaining -= canConsume;
      consumed += canConsume;
      if (layers[layerIdx].remaining <= 0) layerIdx++;
    }

    // Remaining layers represent current stock value
    const remainingLayers = layers.filter((l) => l.remaining > 0);
    if (remainingLayers.length === 0) return defaultCost;

    const remainingValue = remainingLayers.reduce((sum, l) => sum + l.cost * l.remaining, 0);
    const remainingQty = remainingLayers.reduce((sum, l) => sum + l.remaining, 0);
    return remainingQty > 0 ? remainingValue / remainingQty : defaultCost;
  }

  if (method === "lifo") {
    // LIFO: newest costs are used first for outgoing
    // Remaining stock is valued at oldest costs
    const outMovements = sorted.filter((m) => m.type === "out");
    const totalOut = outMovements.reduce((sum, m) => sum + m.quantity, 0);

    // Simulate LIFO consumption (consume from the end)
    let consumed = 0;
    const layers = inMovements.map((m) => ({ ...m, remaining: m.qty }));
    let layerIdx = layers.length - 1;

    while (consumed < totalOut && layerIdx >= 0) {
      const canConsume = Math.min(layers[layerIdx].remaining, totalOut - consumed);
      layers[layerIdx].remaining -= canConsume;
      consumed += canConsume;
      if (layers[layerIdx].remaining <= 0) layerIdx--;
    }

    // Remaining layers represent current stock value
    const remainingLayers = layers.filter((l) => l.remaining > 0);
    if (remainingLayers.length === 0) return defaultCost;

    const remainingValue = remainingLayers.reduce((sum, l) => sum + l.cost * l.remaining, 0);
    const remainingQty = remainingLayers.reduce((sum, l) => sum + l.remaining, 0);
    return remainingQty > 0 ? remainingValue / remainingQty : defaultCost;
  }

  return defaultCost;
}
