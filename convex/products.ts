import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { getUser } from "./users.ts";
import { logAudit } from "./lib/audit.ts";
import { getControlAccounts, postBalancedEntry, round2 } from "./lib/ledger.ts";
import { PRODUCT_OPENING_STOCK_SOURCE } from "./lib/sourceTypes.ts";
import { enforcePostingDate } from "./closingDate.ts";
import { postStockAdjustment } from "./lib/inventoryPosting.ts";

// ─── Opening stock ───────────────────────────────────────────────
//
// The product form has always offered "opening stock" (quantity, value, date,
// warehouse), but the values were only saved on the product: no stock reached
// the warehouse and nothing reached the ledger. Sales then took stock and cost
// out of an inventory that had never been put in — stock showed as zero and
// the Balance Sheet showed a NEGATIVE inventory.
//
// postOpeningStock() puts it in properly, in one transaction:
//   • the quantity into the warehouse (inventory row),
//   • an "in" stock movement at the unit cost (so weighted-average cost of
//     goods sold is right),
//   • Dr Inventory / Cr Opening Balance Equity on the opening-stock date.
// It runs once per product. After that, stock changes go through purchases,
// goods receipts, returns or stock adjustments — never by editing the
// opening figures.

async function postOpeningStock(
  ctx: MutationCtx,
  product: Doc<"products">,
  callerId: Id<"users">,
): Promise<void> {
  const quantity = product.openingStock ?? 0;
  if (quantity <= 0) return;
  if (product.type !== "product") {
    throw new ConvexError({ message: "Only physical products can have opening stock", code: "BAD_REQUEST" });
  }

  const date = product.openingStockDate ?? new Date().toISOString().split("T")[0];
  await enforcePostingDate(ctx, date);

  let warehouseId = product.openingStockWarehouseId;
  if (!warehouseId) {
    const firstActive = (await ctx.db.query("warehouses").collect()).find((w) => w.isActive !== false);
    if (!firstActive) {
      throw new ConvexError({
        message: "Create a warehouse first, then add the opening stock",
        code: "BAD_REQUEST",
      });
    }
    warehouseId = firstActive._id;
  }

  const value = round2(product.openingStockValue ?? quantity * (product.costPrice ?? 0));
  const costPerUnit = value > 0 ? value / quantity : undefined;

  const existing = await ctx.db
    .query("inventory")
    .withIndex("by_product_and_warehouse", (q) =>
      q.eq("productId", product._id).eq("warehouseId", warehouseId!),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { quantity: existing.quantity + quantity });
  } else {
    await ctx.db.insert("inventory", { productId: product._id, warehouseId, quantity });
  }

  await ctx.db.insert("stockMovements", {
    productId: product._id,
    warehouseId,
    type: "in",
    quantity,
    costPerUnit,
    reason: "other",
    reference: "Opening stock",
    notes: `Opening stock of ${product.name}`,
    recordedBy: callerId,
    timestamp: new Date().toISOString(),
  });

  await ctx.db.patch(product._id, {
    openingStockDate: date,
    openingStockWarehouseId: warehouseId,
    openingStockValue: value,
  });

  if (value > 0) {
    const control = await getControlAccounts(ctx);
    await postBalancedEntry(ctx, {
      date,
      description: `Opening stock: ${product.name}`,
      createdBy: callerId,
      sourceType: PRODUCT_OPENING_STOCK_SOURCE,
      sourceId: product._id,
      lines: [
        { accountId: control.inventory._id, debit: value, description: `Opening stock: ${product.name}` },
        { accountId: control.openingBalanceEquity._id, credit: value, description: "Opening balance equity" },
      ],
    });
  }
}

async function openingStockAlreadyPosted(ctx: MutationCtx, productId: Id<"products">): Promise<boolean> {
  const movements = await ctx.db
    .query("stockMovements")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  return movements.some((m) => m.reference === "Opening stock");
}

// ── Warehouses ──────────────────────────────────────────────────────────────

export const listWarehouses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("warehouses").collect();
  },
});

export const createWarehouse = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const id = await ctx.db.insert("warehouses", { ...args, isActive: true });
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "products:createWarehouse",
      resourceType: "warehouse",
      resourceId: id,
      action: "Created warehouse",
      details: args.name,
      afterValue: JSON.stringify({ name: args.name, isActive: true }),
    });
    return id;
  },
});

export const updateWarehouse = mutation({
  args: {
    warehouseId: v.id("warehouses"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const warehouseBefore = await ctx.db.get(args.warehouseId);
    const { warehouseId, ...updates } = args;
    await ctx.db.patch(warehouseId, updates);
    const warehouseAfter = await ctx.db.get(warehouseId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "products:updateWarehouse",
      resourceType: "warehouse",
      resourceId: warehouseId,
      action: "Updated warehouse",
      beforeValue: warehouseBefore ? JSON.stringify(warehouseBefore) : undefined,
      afterValue: warehouseAfter ? JSON.stringify(warehouseAfter) : undefined,
    });
  },
});

// ── Categories ───────────────────────────────────────────────────────────────

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("categories").collect();
  },
});

export const createCategory = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("product"), v.literal("service"), v.literal("both")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    return await ctx.db.insert("categories", args);
  },
});

// ── Products ─────────────────────────────────────────────────────────────────

export const listProducts = query({
  args: { type: v.optional(v.union(v.literal("product"), v.literal("service"))) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const products = args.type
      ? await ctx.db.query("products").withIndex("by_type", (q) => q.eq("type", args.type!)).collect()
      : await ctx.db.query("products").collect();

    const categories = await ctx.db.query("categories").collect();
    const catMap = new Map(categories.map((c) => [c._id, c]));

    return products.map((p) => ({
      ...p,
      category: p.categoryId ? catMap.get(p.categoryId) ?? null : null,
    }));
  },
});

// Get inventory breakdown by warehouse for a product
export const getInventoryByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const inventory = await ctx.db
      .query("inventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    const warehouses = await ctx.db.query("warehouses").collect();
    const warehouseMap = new Map(warehouses.map((w) => [w._id, w.name]));

    return inventory.map((inv) => ({
      _id: inv._id,
      warehouseId: inv.warehouseId,
      warehouseName: warehouseMap.get(inv.warehouseId) ?? "Unknown",
      quantity: inv.quantity,
    }));
  },
});

export const createProduct = mutation({
  args: {
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    type: v.union(v.literal("product"), v.literal("service")),
    unitPrice: v.number(),
    costPrice: v.optional(v.number()),
    unit: v.optional(v.string()),
    unitGroupId: v.optional(v.id("unitGroups")),
    purchaseUnit: v.optional(v.string()),
    sellingUnit: v.optional(v.string()),
    lowStockThreshold: v.optional(v.number()),
    reorderPoint: v.optional(v.number()),
    preferredVendorId: v.optional(v.id("vendors")),
    incomeAccountId: v.optional(v.id("accounts")),
    expenseAccountId: v.optional(v.id("accounts")),
    assetAccountId: v.optional(v.id("accounts")),
    openingStock: v.optional(v.number()),
    openingStockValue: v.optional(v.number()),
    openingStockDate: v.optional(v.string()),
    openingStockWarehouseId: v.optional(v.id("warehouses")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.openingStock !== undefined && args.openingStock < 0) {
      throw new ConvexError({ message: "Opening stock cannot be negative", code: "BAD_REQUEST" });
    }
    if (args.openingStockValue !== undefined && args.openingStockValue < 0) {
      throw new ConvexError({ message: "Opening stock value cannot be negative", code: "BAD_REQUEST" });
    }

    const id = await ctx.db.insert("products", { ...args, isActive: true });
    const created = await ctx.db.get(id);
    if (created) await postOpeningStock(ctx, created, caller._id);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "products:createProduct",
      resourceType: "product",
      resourceId: id,
      action: `Added ${args.type}`,
      details: args.name,
      afterValue: JSON.stringify({ name: args.name, type: args.type, unitPrice: args.unitPrice, sku: args.sku }),
    });
    return id;
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    unitPrice: v.optional(v.number()),
    costPrice: v.optional(v.number()),
    unit: v.optional(v.string()),
    unitGroupId: v.optional(v.id("unitGroups")),
    purchaseUnit: v.optional(v.string()),
    sellingUnit: v.optional(v.string()),
    lowStockThreshold: v.optional(v.number()),
    reorderPoint: v.optional(v.number()),
    preferredVendorId: v.optional(v.id("vendors")),
    incomeAccountId: v.optional(v.id("accounts")),
    expenseAccountId: v.optional(v.id("accounts")),
    assetAccountId: v.optional(v.id("accounts")),
    openingStock: v.optional(v.number()),
    openingStockValue: v.optional(v.number()),
    openingStockDate: v.optional(v.string()),
    openingStockWarehouseId: v.optional(v.id("warehouses")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const productBefore = await ctx.db.get(args.productId);
    if (!productBefore) throw new ConvexError({ message: "Product not found", code: "NOT_FOUND" });
    const { productId, ...updates } = args;

    // Opening stock is posted once. After that the opening figures are locked;
    // stock changes go through purchases, receipts, returns or adjustments.
    const openingFields = ["openingStock", "openingStockValue", "openingStockDate", "openingStockWarehouseId"] as const;
    const openingChanged = openingFields.some(
      (f) => updates[f] !== undefined && updates[f] !== productBefore[f],
    );
    const alreadyPosted = await openingStockAlreadyPosted(ctx, productId);
    if (openingChanged && alreadyPosted) {
      throw new ConvexError({
        message: "Opening stock is already recorded. Use a stock adjustment or a purchase to change stock.",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.patch(productId, updates);
    const productAfter = await ctx.db.get(productId);

    // A product saved earlier without opening stock can get it once, here.
    if (openingChanged && !alreadyPosted && productAfter) {
      await postOpeningStock(ctx, productAfter, caller._id);
    }
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "products:updateProduct",
      resourceType: "product",
      resourceId: productId,
      action: "Updated product/service",
      beforeValue: productBefore ? JSON.stringify(productBefore) : undefined,
      afterValue: productAfter ? JSON.stringify(productAfter) : undefined,
    });
  },
});

export const deleteProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const productToDelete = await ctx.db.get(args.productId);
    await ctx.db.delete(args.productId);
    // clean up inventory records
    const inventoryRows = await ctx.db
      .query("inventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    for (const row of inventoryRows) {
      await ctx.db.delete(row._id);
    }
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "products:deleteProduct",
      resourceType: "product",
      resourceId: args.productId,
      action: "Deleted product/service",
      beforeValue: productToDelete ? JSON.stringify(productToDelete) : undefined,
      reason: "Product deleted by admin",
    });
  },
});

// ── Inventory ─────────────────────────────────────────────────────────────────

export const getInventoryForProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const rows = await ctx.db
      .query("inventory")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();

    const warehouses = await ctx.db.query("warehouses").collect();
    const whMap = new Map(warehouses.map((w) => [w._id, w]));

    return rows.map((r) => ({
      ...r,
      warehouse: whMap.get(r.warehouseId) ?? null,
    }));
  },
});

export const getAllInventory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const inventory = await ctx.db.query("inventory").collect();
    const products = await ctx.db.query("products").collect();
    const warehouses = await ctx.db.query("warehouses").collect();

    const productMap = new Map(products.map((p) => [p._id, p]));
    const warehouseMap = new Map(warehouses.map((w) => [w._id, w]));

    return inventory.map((row) => ({
      ...row,
      product: productMap.get(row.productId) ?? null,
      warehouse: warehouseMap.get(row.warehouseId) ?? null,
    }));
  },
});

export const setInventoryLevel = mutation({
  args: {
    productId: v.id("products"),
    warehouseId: v.id("warehouses"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_product_and_warehouse", (q) =>
        q.eq("productId", args.productId).eq("warehouseId", args.warehouseId)
      )
      .unique();

    if (args.quantity < 0) {
      throw new ConvexError({ message: "Stock level cannot be negative", code: "BAD_REQUEST" });
    }
    const previousQty = existing?.quantity ?? 0;
    const delta = args.quantity - previousQty;

    if (existing) {
      await ctx.db.patch(existing._id, { quantity: args.quantity });
    } else {
      await ctx.db.insert("inventory", {
        productId: args.productId,
        warehouseId: args.warehouseId,
        quantity: args.quantity,
      });
    }

    // Record the change and keep the Inventory account in step with it.
    if (delta !== 0) {
      const movementId = await ctx.db.insert("stockMovements", {
        productId: args.productId,
        warehouseId: args.warehouseId,
        type: delta > 0 ? "in" : "out",
        quantity: Math.abs(delta),
        reason: "adjustment",
        reference: "Stock level set",
        notes: `Set from ${previousQty} to ${args.quantity}`,
        recordedBy: caller._id,
        timestamp: new Date().toISOString(),
      });
      await postStockAdjustment(ctx, {
        productId: args.productId,
        quantityDelta: delta,
        movementId,
        description: `Stock level set: ${previousQty} → ${args.quantity}`,
        createdBy: caller._id,
      });
    }

    const product = await ctx.db.get(args.productId);
    const warehouse = await ctx.db.get(args.warehouseId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "products:setInventoryLevel",
      resourceType: "inventory",
      resourceId: args.productId,
      action: "Updated inventory",
      details: `${product?.name ?? "?"} at ${warehouse?.name ?? "?"}: ${args.quantity}`,
      beforeValue: existing ? JSON.stringify({ quantity: existing.quantity }) : undefined,
      afterValue: JSON.stringify({ quantity: args.quantity }),
    });
  },
});

export const getLowStockAlerts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const products = await ctx.db
      .query("products")
      .withIndex("by_type", (q) => q.eq("type", "product"))
      .collect();

    const alerts: Array<{
      productId: string;
      productName: string;
      warehouseName: string;
      quantity: number;
      threshold: number;
    }> = [];

    for (const product of products) {
      if (!product.lowStockThreshold) continue;
      const inventoryRows = await ctx.db
        .query("inventory")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();
      for (const row of inventoryRows) {
        if (row.quantity <= product.lowStockThreshold) {
          const warehouse = await ctx.db.get(row.warehouseId);
          alerts.push({
            productId: product._id,
            productName: product.name,
            warehouseName: warehouse?.name ?? "Unknown",
            quantity: row.quantity,
            threshold: product.lowStockThreshold,
          });
        }
      }
    }

    return alerts;
  },
});

// ── Product Images ───────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

export const addProductImage = mutation({
  args: {
    productId: v.id("products"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ message: "Product not found", code: "NOT_FOUND" });

    const currentImages = product.images ?? [];
    if (currentImages.length >= 20) {
      throw new ConvexError({ message: "Maximum 20 images per product", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(args.productId, {
      images: [...currentImages, args.storageId],
    });
  },
});

export const removeProductImage = mutation({
  args: {
    productId: v.id("products"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ message: "Product not found", code: "NOT_FOUND" });

    const currentImages = product.images ?? [];
    const updated = currentImages.filter((id) => id !== args.storageId);
    await ctx.db.patch(args.productId, { images: updated });

    // Delete the file from storage
    await ctx.storage.delete(args.storageId);
  },
});

export const reorderProductImages = mutation({
  args: {
    productId: v.id("products"),
    images: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    await ctx.db.patch(args.productId, { images: args.images });
  },
});

export const getProductImages = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const product = await ctx.db.get(args.productId);
    if (!product) return [];

    const images = product.images ?? [];
    const urls: Array<{ storageId: string; url: string | null }> = [];
    for (const storageId of images) {
      const url = await ctx.storage.getUrl(storageId);
      urls.push({ storageId, url });
    }
    return urls;
  },
});
