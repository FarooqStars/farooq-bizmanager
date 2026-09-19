import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { getUser as getCallerUser } from "./users";

// ─── Auth Helpers ────────────────────────────────────────────
async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  return identity;
}

async function getUser(ctx: QueryCtx, tokenIdentifier: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

// ─── Price Lists (Price Levels) ──────────────────────────────

export const listPriceLists = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const lists = await ctx.db.query("priceLists").collect();

    // Enrich with item count
    const enriched = await Promise.all(
      lists.map(async (pl) => {
        const items = await ctx.db
          .query("priceListItems")
          .withIndex("by_price_list", (q) => q.eq("priceListId", pl._id))
          .collect();
        return { ...pl, itemCount: items.length };
      }),
    );
    return enriched;
  },
});

export const getPriceList = query({
  args: { priceListId: v.id("priceLists") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const priceList = await ctx.db.get(args.priceListId);
    if (!priceList) throw new ConvexError({ message: "Price list not found", code: "NOT_FOUND" });

    const items = await ctx.db
      .query("priceListItems")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .collect();

    // Enrich items with product data
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return {
          ...item,
          productName: product?.name ?? "Unknown",
          productSku: product?.sku,
          basePrice: product?.unitPrice ?? 0,
        };
      }),
    );

    return { ...priceList, items: enrichedItems };
  },
});

export const createPriceList = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    tier: v.optional(
      v.union(
        v.literal("retail"),
        v.literal("wholesale"),
        v.literal("vip"),
        v.literal("distributor"),
      ),
    ),
    currency: v.optional(v.string()),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const caller = await getCallerUser(ctx, identity.tokenIdentifier);
    // Owner or manager only; owner always passes.
    if (!caller || (caller.role !== "owner" && caller.role !== "manager")) {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    // If setting as default, unset any existing defaults
    if (args.isDefault) {
      const existing = await ctx.db.query("priceLists").collect();
      for (const level of existing) {
        if (level.isDefault) {
          await ctx.db.patch(level._id, { isDefault: false });
        }
      }
    }

    return await ctx.db.insert("priceLists", {
      name: args.name,
      description: args.description,
      tier: args.tier,
      currency: args.currency,
      isDefault: args.isDefault,
      isActive: true,
    });
  },
});

export const updatePriceList = mutation({
  args: {
    id: v.id("priceLists"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    tier: v.optional(
      v.union(
        v.literal("retail"),
        v.literal("wholesale"),
        v.literal("vip"),
        v.literal("distributor"),
      ),
    ),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const pl = await ctx.db.get(args.id);
    if (!pl) throw new ConvexError({ message: "Price list not found", code: "NOT_FOUND" });

    // If setting as default, unset any existing defaults
    if (args.isDefault) {
      const existing = await ctx.db.query("priceLists").collect();
      for (const l of existing) {
        if (l.isDefault && l._id !== args.id) {
          await ctx.db.patch(l._id, { isDefault: false });
        }
      }
    }

    const updates: Partial<Doc<"priceLists">> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.tier !== undefined) updates.tier = args.tier;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.id, updates);
  },
});

export const deletePriceList = mutation({
  args: { id: v.id("priceLists") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const caller = await getCallerUser(ctx, identity.tokenIdentifier);
    // Owner or manager only; owner always passes.
    if (!caller || (caller.role !== "owner" && caller.role !== "manager")) {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    // Delete all associated items
    const items = await ctx.db
      .query("priceListItems")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.id))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.id);
  },
});

// ─── Price List Items ────────────────────────────────────────

export const addPriceListItem = mutation({
  args: {
    priceListId: v.id("priceLists"),
    productId: v.id("products"),
    unitPrice: v.number(),
    minQuantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.unitPrice < 0) {
      throw new ConvexError({ message: "Price cannot be negative", code: "BAD_REQUEST" });
    }

    // Check for duplicates
    const existing = await ctx.db
      .query("priceListItems")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .collect();
    const duplicate = existing.find((i) => i.productId === args.productId);
    if (duplicate) {
      throw new ConvexError({
        message: "Product already exists in this price list",
        code: "CONFLICT",
      });
    }

    return await ctx.db.insert("priceListItems", {
      priceListId: args.priceListId,
      productId: args.productId,
      unitPrice: args.unitPrice,
      minQuantity: args.minQuantity,
    });
  },
});

export const updatePriceListItem = mutation({
  args: {
    itemId: v.id("priceListItems"),
    unitPrice: v.optional(v.number()),
    minQuantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError({ message: "Item not found", code: "NOT_FOUND" });

    const updates: Partial<Doc<"priceListItems">> = {};
    if (args.unitPrice !== undefined) updates.unitPrice = args.unitPrice;
    if (args.minQuantity !== undefined) updates.minQuantity = args.minQuantity;
    await ctx.db.patch(args.itemId, updates);
  },
});

export const removePriceListItem = mutation({
  args: { itemId: v.id("priceListItems") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.delete(args.itemId);
  },
});

// ─── Quantity Discounts ──────────────────────────────────────

export const listQuantityDiscounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const discounts = await ctx.db.query("quantityDiscounts").collect();

    // Enrich with product/category names
    const enriched = await Promise.all(
      discounts.map(async (d) => {
        let productName: string | undefined;
        let categoryName: string | undefined;
        if (d.productId) {
          const product = await ctx.db.get(d.productId);
          productName = product?.name;
        }
        if (d.categoryId) {
          const category = await ctx.db.get(d.categoryId);
          categoryName = category?.name;
        }
        return { ...d, productName, categoryName };
      }),
    );
    return enriched;
  },
});

export const createQuantityDiscount = mutation({
  args: {
    name: v.string(),
    productId: v.optional(v.id("products")),
    categoryId: v.optional(v.id("categories")),
    minQuantity: v.number(),
    maxQuantity: v.optional(v.number()),
    discountType: v.union(v.literal("percentage"), v.literal("fixed")),
    discountValue: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.minQuantity <= 0) {
      throw new ConvexError({
        message: "Minimum quantity must be greater than 0",
        code: "BAD_REQUEST",
      });
    }
    if (args.discountValue <= 0) {
      throw new ConvexError({
        message: "Discount value must be greater than 0",
        code: "BAD_REQUEST",
      });
    }
    if (args.discountType === "percentage" && args.discountValue > 100) {
      throw new ConvexError({
        message: "Percentage discount cannot exceed 100%",
        code: "BAD_REQUEST",
      });
    }

    return await ctx.db.insert("quantityDiscounts", {
      name: args.name,
      productId: args.productId,
      categoryId: args.categoryId,
      minQuantity: args.minQuantity,
      maxQuantity: args.maxQuantity,
      discountType: args.discountType,
      discountValue: args.discountValue,
      isActive: true,
    });
  },
});

export const updateQuantityDiscount = mutation({
  args: {
    discountId: v.id("quantityDiscounts"),
    name: v.optional(v.string()),
    minQuantity: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    discountValue: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const discount = await ctx.db.get(args.discountId);
    if (!discount) throw new ConvexError({ message: "Discount not found", code: "NOT_FOUND" });

    const updates: Partial<Doc<"quantityDiscounts">> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.minQuantity !== undefined) updates.minQuantity = args.minQuantity;
    if (args.maxQuantity !== undefined) updates.maxQuantity = args.maxQuantity;
    if (args.discountType !== undefined) updates.discountType = args.discountType;
    if (args.discountValue !== undefined) updates.discountValue = args.discountValue;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.discountId, updates);
  },
});

export const deleteQuantityDiscount = mutation({
  args: { discountId: v.id("quantityDiscounts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.delete(args.discountId);
  },
});

// ─── Promotions ──────────────────────────────────────────────

export const listPromotions = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const promos = await ctx.db.query("promotions").collect();
    const today = new Date().toISOString().split("T")[0];

    const enriched = await Promise.all(
      promos.map(async (p) => {
        let productName: string | undefined;
        let categoryName: string | undefined;
        if (p.productId) {
          const product = await ctx.db.get(p.productId);
          productName = product?.name;
        }
        if (p.categoryId) {
          const category = await ctx.db.get(p.categoryId);
          categoryName = category?.name;
        }

        // Determine time status
        let timeStatus: "active" | "upcoming" | "expired" = "active";
        if (p.startDate > today) {
          timeStatus = "upcoming";
        } else if (p.endDate < today) {
          timeStatus = "expired";
        }

        return { ...p, productName, categoryName, timeStatus };
      }),
    );
    return enriched;
  },
});

export const createPromotion = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    discountType: v.union(v.literal("percentage"), v.literal("fixed"), v.literal("buy_x_get_y")),
    discountValue: v.number(),
    buyQuantity: v.optional(v.number()),
    getQuantity: v.optional(v.number()),
    productId: v.optional(v.id("products")),
    categoryId: v.optional(v.id("categories")),
    tier: v.optional(
      v.union(
        v.literal("retail"),
        v.literal("wholesale"),
        v.literal("vip"),
        v.literal("distributor"),
      ),
    ),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    return await ctx.db.insert("promotions", {
      name: args.name,
      description: args.description,
      discountType: args.discountType,
      discountValue: args.discountValue,
      buyQuantity: args.buyQuantity,
      getQuantity: args.getQuantity,
      productId: args.productId,
      categoryId: args.categoryId,
      tier: args.tier,
      startDate: args.startDate,
      endDate: args.endDate,
      isActive: true,
      createdBy: user._id,
    });
  },
});

export const updatePromotion = mutation({
  args: { promotionId: v.id("promotions"), isActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const promo = await ctx.db.get(args.promotionId);
    if (!promo) throw new ConvexError({ message: "Promotion not found", code: "NOT_FOUND" });
    if (args.isActive !== undefined) {
      await ctx.db.patch(args.promotionId, { isActive: args.isActive });
    }
  },
});

export const deletePromotion = mutation({
  args: { promotionId: v.id("promotions") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.delete(args.promotionId);
  },
});

// ─── Scheduled Price Changes ─────────────────────────────────

export const listScheduledChanges = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const changes = await ctx.db.query("scheduledPriceChanges").collect();

    const enriched = await Promise.all(
      changes.map(async (c) => {
        const product = await ctx.db.get(c.productId);
        return {
          ...c,
          productName: product?.name ?? "Unknown",
          productSku: product?.sku,
          currentPrice: product?.unitPrice ?? 0,
        };
      }),
    );
    return enriched;
  },
});

export const createScheduledChange = mutation({
  args: {
    productId: v.id("products"),
    newPrice: v.number(),
    effectiveDate: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    if (args.newPrice < 0) {
      throw new ConvexError({ message: "Price cannot be negative", code: "BAD_REQUEST" });
    }

    return await ctx.db.insert("scheduledPriceChanges", {
      productId: args.productId,
      newPrice: args.newPrice,
      effectiveDate: args.effectiveDate,
      reason: args.reason,
      status: "pending",
      createdBy: user._id,
    });
  },
});

export const cancelScheduledChange = mutation({
  args: { changeId: v.id("scheduledPriceChanges") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const change = await ctx.db.get(args.changeId);
    if (!change) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    if (change.status !== "pending") {
      throw new ConvexError({
        message: "Only pending changes can be cancelled",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch(args.changeId, { status: "cancelled" });
  },
});

export const applyScheduledChange = mutation({
  args: { changeId: v.id("scheduledPriceChanges") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const change = await ctx.db.get(args.changeId);
    if (!change) throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    if (change.status !== "pending") {
      throw new ConvexError({
        message: "Only pending changes can be applied",
        code: "BAD_REQUEST",
      });
    }

    // Update the product's price
    await ctx.db.patch(change.productId, { unitPrice: change.newPrice });
    await ctx.db.patch(args.changeId, { status: "applied" });
  },
});

// ─── Customer-Specific Pricing ───────────────────────────────

export const listCustomerPrices = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const prices = await ctx.db
      .query("customerPrices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    const enriched = await Promise.all(
      prices.map(async (p) => {
        const product = await ctx.db.get(p.productId);
        return {
          ...p,
          productName: product?.name ?? "Unknown",
          productSku: product?.sku,
          basePrice: product?.unitPrice ?? 0,
        };
      }),
    );
    return enriched;
  },
});

export const setCustomerPrice = mutation({
  args: { customerId: v.id("customers"), productId: v.id("products"), price: v.number() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    if (args.price < 0) {
      throw new ConvexError({ message: "Price cannot be negative", code: "BAD_REQUEST" });
    }

    // Upsert: check if entry already exists
    const existing = await ctx.db
      .query("customerPrices")
      .withIndex("by_customer_and_product", (q) =>
        q.eq("customerId", args.customerId).eq("productId", args.productId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { price: args.price });
    } else {
      await ctx.db.insert("customerPrices", {
        customerId: args.customerId,
        productId: args.productId,
        price: args.price,
      });
    }
  },
});

export const removeCustomerPrice = mutation({
  args: { id: v.id("customerPrices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Price Resolution Engine ─────────────────────────────────
// Priority order:
// 1. Customer-specific price (highest priority)
// 2. Customer tier price list price
// 3. Quantity discount applied to base price
// 4. Active promotion discount
// 5. Default price list price
// 6. Product base price (fallback)

export const resolvePrice = query({
  args: {
    productId: v.id("products"),
    customerId: v.optional(v.id("customers")),
    quantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ message: "Product not found", code: "NOT_FOUND" });

    const basePrice = product.unitPrice;
    let resolvedPrice = basePrice;
    let priceSource:
      | "base"
      | "price_list"
      | "customer_specific"
      | "quantity_discount"
      | "promotion" = "base";
    let discountLabel = "";

    // 1. Check customer-specific price
    if (args.customerId) {
      const customerPrice = await ctx.db
        .query("customerPrices")
        .withIndex("by_customer_and_product", (q) =>
          q.eq("customerId", args.customerId!).eq("productId", args.productId),
        )
        .unique();

      if (customerPrice) {
        resolvedPrice = customerPrice.price;
        priceSource = "customer_specific";
      } else {
        // 2. Check customer's tier-based price list
        const customer = await ctx.db.get(args.customerId);
        if (customer?.tier) {
          const tierList = (
            await ctx.db
              .query("priceLists")
              .withIndex("by_tier", (q) => q.eq("tier", customer.tier!))
              .collect()
          ).find((l) => l.isActive);

          if (tierList) {
            const tierItem = (
              await ctx.db
                .query("priceListItems")
                .withIndex("by_price_list", (q) => q.eq("priceListId", tierList._id))
                .collect()
            ).find((i) => i.productId === args.productId);

            if (tierItem) {
              // Check min quantity requirement on price list item
              const qty = args.quantity ?? 1;
              if (!tierItem.minQuantity || qty >= tierItem.minQuantity) {
                resolvedPrice = tierItem.unitPrice;
                priceSource = "price_list";
                discountLabel = tierList.name;
              }
            }
          }
        }
      }
    }

    // If still base price, check default price list
    if (priceSource === "base") {
      const defaultList = (await ctx.db.query("priceLists").collect()).find(
        (l) => l.isDefault && l.isActive,
      );
      if (defaultList) {
        const defaultItem = (
          await ctx.db
            .query("priceListItems")
            .withIndex("by_price_list", (q) => q.eq("priceListId", defaultList._id))
            .collect()
        ).find((i) => i.productId === args.productId);
        if (defaultItem) {
          const qty = args.quantity ?? 1;
          if (!defaultItem.minQuantity || qty >= defaultItem.minQuantity) {
            resolvedPrice = defaultItem.unitPrice;
            priceSource = "price_list";
            discountLabel = defaultList.name;
          }
        }
      }
    }

    // 3. Check quantity discounts (applied on top of resolved price)
    const qty = args.quantity ?? 1;
    if (qty > 1) {
      const allDiscounts = await ctx.db
        .query("quantityDiscounts")
        .withIndex("by_product", (q) => q.eq("productId", args.productId))
        .collect();

      // Also check general (no product) discounts
      const generalDiscounts = (await ctx.db.query("quantityDiscounts").collect()).filter(
        (d) => !d.productId && !d.categoryId && d.isActive,
      );

      // Check category-based discounts
      const categoryDiscounts = product.categoryId
        ? (
            await ctx.db
              .query("quantityDiscounts")
              .withIndex("by_category", (q) => q.eq("categoryId", product.categoryId!))
              .collect()
          ).filter((d) => d.isActive)
        : [];

      const applicableDiscounts = [...allDiscounts, ...generalDiscounts, ...categoryDiscounts]
        .filter(
          (d) => d.isActive && qty >= d.minQuantity && (!d.maxQuantity || qty <= d.maxQuantity),
        )
        .sort((a, b) => b.minQuantity - a.minQuantity);

      if (applicableDiscounts.length > 0) {
        const best = applicableDiscounts[0];
        let discountAmount = 0;
        if (best.discountType === "percentage") {
          discountAmount = resolvedPrice * (best.discountValue / 100);
          discountLabel = `${best.discountValue}% off (${best.name})`;
        } else {
          discountAmount = best.discountValue;
          discountLabel = `$${best.discountValue} off (${best.name})`;
        }
        resolvedPrice = Math.round((resolvedPrice - discountAmount) * 100) / 100;
        priceSource = "quantity_discount";
      }
    }

    // 4. Check active promotions (only if no better discount already applied)
    const today = new Date().toISOString().split("T")[0];
    const activePromos = (
      await ctx.db
        .query("promotions")
        .withIndex("by_product", (q) => q.eq("productId", args.productId))
        .collect()
    ).filter((p) => p.isActive && p.startDate <= today && p.endDate >= today);

    // Also check general promos and tier promos
    const generalPromos = (await ctx.db.query("promotions").collect()).filter((p) => {
      if (!p.isActive || p.startDate > today || p.endDate < today) return false;
      if (p.productId && p.productId !== args.productId) return false;
      if (p.categoryId && p.categoryId !== product.categoryId) return false;
      if (p.tier && args.customerId) {
        // Will be checked below
        return true;
      }
      return !p.productId && !p.categoryId;
    });

    const allPromos = [...activePromos, ...generalPromos];
    for (const promo of allPromos) {
      // Check tier restriction
      if (promo.tier && args.customerId) {
        const customer = await ctx.db.get(args.customerId);
        if (customer?.tier !== promo.tier) continue;
      }

      let promoPrice = resolvedPrice;
      if (promo.discountType === "percentage") {
        promoPrice = resolvedPrice * (1 - promo.discountValue / 100);
      } else if (promo.discountType === "fixed") {
        promoPrice = resolvedPrice - promo.discountValue;
      }
      // buy_x_get_y handled at cart level, not per-unit price

      promoPrice = Math.round(promoPrice * 100) / 100;
      if (promoPrice < resolvedPrice) {
        resolvedPrice = promoPrice;
        priceSource = "promotion";
        discountLabel = promo.name;
      }
    }

    // Ensure price never goes below 0
    resolvedPrice = Math.max(0, resolvedPrice);

    return {
      basePrice,
      resolvedPrice,
      priceSource,
      discountLabel,
      savings: Math.round((basePrice - resolvedPrice) * 100) / 100,
      savingsPercent:
        basePrice > 0 ? Math.round(((basePrice - resolvedPrice) / basePrice) * 100) : 0,
    };
  },
});

// Bulk resolve prices for the POS system
export const resolvePricesBulk = query({
  args: { productIds: v.array(v.id("products")), customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Get customer tier and specific prices
    let customerTier: "retail" | "wholesale" | "vip" | "distributor" | null = null;
    const customerPriceMap: Record<string, number> = {};

    if (args.customerId) {
      const customer = await ctx.db.get(args.customerId);
      if (customer?.tier) {
        customerTier = customer.tier;
      }

      // Load customer-specific prices
      const customerPrices = await ctx.db
        .query("customerPrices")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
      for (const cp of customerPrices) {
        customerPriceMap[cp.productId] = cp.price;
      }
    }

    // Get tier price list
    let tierPriceMap: Record<string, number> = {};
    if (customerTier) {
      const tierList = (
        await ctx.db
          .query("priceLists")
          .withIndex("by_tier", (q) => q.eq("tier", customerTier!))
          .collect()
      ).find((l) => l.isActive);

      if (tierList) {
        const items = await ctx.db
          .query("priceListItems")
          .withIndex("by_price_list", (q) => q.eq("priceListId", tierList._id))
          .collect();
        for (const item of items) {
          tierPriceMap[item.productId] = item.unitPrice;
        }
      }
    }

    // Get default price list
    const defaultList = (await ctx.db.query("priceLists").collect()).find(
      (l) => l.isDefault && l.isActive,
    );
    const defaultPriceMap: Record<string, number> = {};
    if (defaultList) {
      const items = await ctx.db
        .query("priceListItems")
        .withIndex("by_price_list", (q) => q.eq("priceListId", defaultList._id))
        .collect();
      for (const item of items) {
        defaultPriceMap[item.productId] = item.unitPrice;
      }
    }

    // Resolve for each product
    const results: Record<string, { resolvedPrice: number; priceSource: string }> = {};
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId);
      if (!product) continue;

      let price = product.unitPrice;
      let source = "base";

      // Priority: customer-specific > tier price list > default price list > base
      if (customerPriceMap[productId] !== undefined) {
        price = customerPriceMap[productId];
        source = "customer_specific";
      } else if (tierPriceMap[productId] !== undefined) {
        price = tierPriceMap[productId];
        source = "price_list";
      } else if (defaultPriceMap[productId] !== undefined) {
        price = defaultPriceMap[productId];
        source = "price_list";
      }

      results[productId] = { resolvedPrice: price, priceSource: source };
    }

    return results;
  },
});
