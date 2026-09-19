import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./users.ts";
import { logAudit } from "./lib/audit.ts";

// ── Public Storefront Queries (no auth required) ─────────────────────────────

export const listStorefrontProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_type", (q) => q.eq("type", "product"))
      .collect();

    const activeProducts = products.filter((p) => p.isActive);
    const categories = await ctx.db.query("categories").collect();
    const catMap = new Map(categories.map((c) => [c._id, c]));

    const result = [];
    for (const p of activeProducts) {
      // Get first image URL
      let imageUrl: string | null = null;
      if (p.images && p.images.length > 0) {
        imageUrl = await ctx.storage.getUrl(p.images[0]);
      }

      // Get total stock
      const inventoryRows = await ctx.db
        .query("inventory")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .collect();
      const totalStock = inventoryRows.reduce((sum, r) => sum + r.quantity, 0);

      result.push({
        ...p,
        category: p.categoryId ? catMap.get(p.categoryId) ?? null : null,
        imageUrl,
        totalStock,
        inStock: totalStock > 0,
      });
    }

    return result;
  },
});

export const getStorefrontProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || !product.isActive || product.type !== "product") return null;

    // Get all image URLs
    const imageUrls: Array<{ storageId: string; url: string | null }> = [];
    if (product.images) {
      for (const storageId of product.images) {
        const url = await ctx.storage.getUrl(storageId);
        imageUrls.push({ storageId, url });
      }
    }

    // Get category
    const category = product.categoryId ? await ctx.db.get(product.categoryId) : null;

    // Get total stock
    const inventoryRows = await ctx.db
      .query("inventory")
      .withIndex("by_product", (q) => q.eq("productId", product._id))
      .collect();
    const totalStock = inventoryRows.reduce((sum, r) => sum + r.quantity, 0);

    return {
      ...product,
      category,
      imageUrls,
      totalStock,
      inStock: totalStock > 0,
    };
  },
});

export const listStorefrontCategories = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("categories").collect();
    return categories.filter((c) => c.type === "product" || c.type === "both");
  },
});

// ── Orders ───────────────────────────────────────────────────────────────────

export const placeOrder = mutation({
  args: {
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) {
      throw new ConvexError({ message: "Cart is empty", code: "BAD_REQUEST" });
    }

    // Validate stock and calculate totals
    let totalAmount = 0;
    const orderItems: Array<{
      productId: typeof args.items[0]["productId"];
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      imageStorageId?: typeof args.items[0]["productId"] extends string ? never : undefined;
    }> = [];

    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (!product || !product.isActive) {
        throw new ConvexError({ message: `Product not found or unavailable`, code: "NOT_FOUND" });
      }

      // Check stock
      const inventoryRows = await ctx.db
        .query("inventory")
        .withIndex("by_product", (q) => q.eq("productId", item.productId))
        .collect();
      const totalStock = inventoryRows.reduce((sum, r) => sum + r.quantity, 0);

      if (totalStock < item.quantity) {
        throw new ConvexError({
          message: `Insufficient stock for "${product.name}" (available: ${totalStock})`,
          code: "BAD_REQUEST",
        });
      }

      const subtotal = product.unitPrice * item.quantity;
      totalAmount += subtotal;

      orderItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.unitPrice,
        subtotal,
      });
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    // Create order
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      customerPhone: args.customerPhone,
      shippingAddress: args.shippingAddress,
      status: "pending",
      totalAmount,
      notes: args.notes,
      orderDate: new Date().toISOString(),
    });

    // Create order items
    for (const item of orderItems) {
      const product = await ctx.db.get(item.productId);
      await ctx.db.insert("orderItems", {
        orderId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        imageStorageId: product?.images?.[0],
      });
    }

    return { orderId, orderNumber };
  },
});

// ── Admin Order Management ───────────────────────────────────────────────────

export const listOrders = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let orders;
    if (args.status && args.status !== "all") {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status as "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled"))
        .order("desc")
        .collect();
    } else {
      orders = await ctx.db.query("orders").order("desc").collect();
    }

    return orders;
  },
});

export const getOrderDetails = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Resolve image URLs
    const itemsWithImages = [];
    for (const item of items) {
      let imageUrl: string | null = null;
      if (item.imageStorageId) {
        imageUrl = await ctx.storage.getUrl(item.imageStorageId);
      }
      itemsWithImages.push({ ...item, imageUrl });
    }

    return { ...order, items: itemsWithImages };
  },
});

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const orderBefore = await ctx.db.get(args.orderId);
    await ctx.db.patch(args.orderId, { status: args.status });

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "storefront:updateOrderStatus",
      resourceType: "order",
      resourceId: args.orderId,
      action: `Updated order status to ${args.status}`,
      beforeValue: orderBefore ? JSON.stringify({ status: orderBefore.status }) : undefined,
      afterValue: JSON.stringify({ status: args.status }),
    });
  },
});
