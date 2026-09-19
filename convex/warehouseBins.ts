import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUser } from "./users.ts";
import { logAudit } from "./lib/audit.ts";

// ─── List bins for a warehouse ────────────────────────────────

export const listBins = query({
  args: { warehouseId: v.id("warehouses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db
      .query("warehouseBins")
      .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
      .collect();
  },
});

// ─── Get bin by ID ────────────────────────────────────────────

export const getBin = query({
  args: { binId: v.id("warehouseBins") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db.get(args.binId);
  },
});

// ─── Create a bin ─────────────────────────────────────────────

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const warehouse = await ctx.db.get(args.warehouseId);
    if (!warehouse) throw new ConvexError({ message: "Warehouse not found", code: "NOT_FOUND" });

    const id = await ctx.db.insert("warehouseBins", { ...args, isActive: true });

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "warehouseBins:createBin",
      resourceType: "warehouse",
      resourceId: args.warehouseId,
      action: "Created bin location",
      details: `${args.label} in ${warehouse.name}`,
      afterValue: JSON.stringify({ label: args.label, warehouseId: args.warehouseId, binId: id }),
    });

    return id;
  },
});

// ─── Update a bin ─────────────────────────────────────────────

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const binBefore = await ctx.db.get(args.binId);
    const { binId, ...updates } = args;
    await ctx.db.patch(binId, updates);
    const binAfter = await ctx.db.get(binId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "warehouseBins:updateBin",
      resourceType: "warehouse",
      resourceId: binId,
      action: "Updated bin location",
      beforeValue: binBefore ? JSON.stringify(binBefore) : undefined,
      afterValue: binAfter ? JSON.stringify(binAfter) : undefined,
    });
  },
});

// ─── Delete a bin ─────────────────────────────────────────────

export const deleteBin = mutation({
  args: { binId: v.id("warehouseBins") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Check if any lot numbers reference this bin
    const lots = await ctx.db
      .query("lotNumbers")
      .filter((q) => q.eq(q.field("binId"), args.binId))
      .take(1);
    if (lots.length > 0) {
      throw new ConvexError({ message: "Cannot delete bin - items are stored here", code: "CONFLICT" });
    }

    const binToDelete = await ctx.db.get(args.binId);
    await ctx.db.delete(args.binId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "warehouseBins:deleteBin",
      resourceType: "warehouse",
      resourceId: args.binId,
      action: "Deleted bin location",
      beforeValue: binToDelete ? JSON.stringify(binToDelete) : undefined,
      reason: "Bin deleted by admin",
    });
  },
});

// ─── Bulk create bins (generate a range) ──────────────────────

export const bulkCreateBins = mutation({
  args: {
    warehouseId: v.id("warehouses"),
    zone: v.optional(v.string()),
    rowPrefix: v.string(),
    rowStart: v.number(),
    rowEnd: v.number(),
    shelfPrefix: v.string(),
    shelfStart: v.number(),
    shelfEnd: v.number(),
    binPrefix: v.string(),
    binStart: v.number(),
    binEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const warehouse = await ctx.db.get(args.warehouseId);
    if (!warehouse) throw new ConvexError({ message: "Warehouse not found", code: "NOT_FOUND" });

    let count = 0;
    const maxBins = 500;

    for (let r = args.rowStart; r <= args.rowEnd; r++) {
      for (let s = args.shelfStart; s <= args.shelfEnd; s++) {
        for (let b = args.binStart; b <= args.binEnd; b++) {
          if (count >= maxBins) break;
          const row = `${args.rowPrefix}${r}`;
          const shelf = `${args.shelfPrefix}${s}`;
          const bin = `${args.binPrefix}${b}`;
          const label = `${args.zone ? args.zone + "-" : ""}${row}-${shelf}-${bin}`;

          await ctx.db.insert("warehouseBins", {
            warehouseId: args.warehouseId,
            zone: args.zone,
            row,
            shelf,
            bin,
            label,
            isActive: true,
          });
          count++;
        }
      }
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "warehouseBins:bulkCreateBins",
      resourceType: "warehouse",
      resourceId: args.warehouseId,
      action: "Bulk created bin locations",
      details: `${count} bins in ${warehouse.name}`,
      afterValue: JSON.stringify({ count, warehouseId: args.warehouseId, zone: args.zone }),
    });

    return count;
  },
});

// ─── Get warehouse stock summary (qty per product per bin) ────

export const getWarehouseStock = query({
  args: { warehouseId: v.id("warehouses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Get all inventory for this warehouse
    const inventoryRows = await ctx.db
      .query("inventory")
      .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
      .collect();

    // Get all lot numbers for this warehouse (they have bin references)
    const lots = await ctx.db
      .query("lotNumbers")
      .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
      .collect();

    // Get bins
    const bins = await ctx.db
      .query("warehouseBins")
      .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
      .collect();
    const binMap = new Map(bins.map((b) => [b._id, b]));

    // Get all relevant products
    const productIds = new Set([
      ...inventoryRows.map((r) => r.productId),
      ...lots.map((l) => l.productId),
    ]);
    const products = await Promise.all(
      Array.from(productIds).map((id) => ctx.db.get(id))
    );
    const productMap = new Map(products.filter(Boolean).map((p) => [p!._id, p!]));

    // Build stock summary
    const stockItems = inventoryRows.map((row) => {
      const product = productMap.get(row.productId);
      // Find lots for this product in this warehouse
      const productLots = lots.filter((l) => l.productId === row.productId);
      const binLocations = productLots
        .filter((l) => l.binId)
        .map((l) => {
          const bin = binMap.get(l.binId!);
          return bin ? { binId: bin._id, label: bin.label, qty: l.quantity } : null;
        })
        .filter(Boolean);

      return {
        productId: row.productId,
        productName: product?.name ?? "Unknown",
        sku: product?.sku ?? "",
        totalQty: row.quantity,
        binLocations,
      };
    });

    return { stockItems, totalProducts: stockItems.length, bins };
  },
});

// ─── Get warehouse summary stats ─────────────────────────────

export const getWarehouseSummary = query({
  args: { warehouseId: v.id("warehouses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const bins = await ctx.db
      .query("warehouseBins")
      .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
      .collect();

    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_warehouse", (q) => q.eq("warehouseId", args.warehouseId))
      .collect();

    const totalBins = bins.length;
    const activeBins = bins.filter((b) => b.isActive).length;
    const totalProducts = inventory.length;
    const totalQty = inventory.reduce((sum, r) => sum + r.quantity, 0);

    // Get zones
    const zones = new Set(bins.map((b) => b.zone).filter(Boolean));

    return {
      totalBins,
      activeBins,
      totalProducts,
      totalQty,
      zones: Array.from(zones) as string[],
    };
  },
});

// ─── Transfer stock between warehouses ────────────────────────

export const transferStock = mutation({
  args: {
    productId: v.id("products"),
    fromWarehouseId: v.id("warehouses"),
    toWarehouseId: v.id("warehouses"),
    quantity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.quantity <= 0) throw new ConvexError({ message: "Quantity must be > 0", code: "BAD_REQUEST" });
    if (args.fromWarehouseId === args.toWarehouseId) {
      throw new ConvexError({ message: "Source and destination must be different", code: "BAD_REQUEST" });
    }

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ message: "Product not found", code: "NOT_FOUND" });

    // Check source inventory
    const source = await ctx.db
      .query("inventory")
      .withIndex("by_product_and_warehouse", (q) =>
        q.eq("productId", args.productId).eq("warehouseId", args.fromWarehouseId)
      )
      .unique();

    const sourceQty = source?.quantity ?? 0;
    if (args.quantity > sourceQty) {
      throw new ConvexError({ message: `Only ${sourceQty} available at source`, code: "BAD_REQUEST" });
    }

    // Deduct from source
    if (source) {
      await ctx.db.patch(source._id, { quantity: sourceQty - args.quantity });
    }

    // Add to destination
    const dest = await ctx.db
      .query("inventory")
      .withIndex("by_product_and_warehouse", (q) =>
        q.eq("productId", args.productId).eq("warehouseId", args.toWarehouseId)
      )
      .unique();

    if (dest) {
      await ctx.db.patch(dest._id, { quantity: dest.quantity + args.quantity });
    } else {
      await ctx.db.insert("inventory", {
        productId: args.productId,
        warehouseId: args.toWarehouseId,
        quantity: args.quantity,
      });
    }

    // Record movements
    const timestamp = new Date().toISOString();
    await ctx.db.insert("stockMovements", {
      productId: args.productId,
      warehouseId: args.fromWarehouseId,
      type: "out",
      quantity: args.quantity,
      reason: "transfer",
      reference: `Transfer to ${args.toWarehouseId}`,
      notes: args.notes,
      recordedBy: caller._id,
      timestamp,
    });
    await ctx.db.insert("stockMovements", {
      productId: args.productId,
      warehouseId: args.toWarehouseId,
      type: "in",
      quantity: args.quantity,
      reason: "transfer",
      reference: `Transfer from ${args.fromWarehouseId}`,
      notes: args.notes,
      recordedBy: caller._id,
      timestamp,
    });

    const fromWh = await ctx.db.get(args.fromWarehouseId);
    const toWh = await ctx.db.get(args.toWarehouseId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "warehouseBins:transferStock",
      resourceType: "inventory",
      resourceId: args.productId,
      action: "Stock transfer",
      details: `${product.name}: ${args.quantity} from ${fromWh?.name ?? "?"} to ${toWh?.name ?? "?"}`,
      beforeValue: JSON.stringify({ sourceQty: sourceQty, destQty: dest?.quantity ?? 0 }),
      afterValue: JSON.stringify({ sourceQty: sourceQty - args.quantity, destQty: (dest?.quantity ?? 0) + args.quantity }),
    });
  },
});
