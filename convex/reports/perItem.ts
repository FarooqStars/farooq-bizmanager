import { v } from "convex/values";
import { query } from "../_generated/server";
import { ConvexError } from "convex/values";

export const getPerItemReport = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Get sales (optionally filtered by date)
    let sales = await ctx.db.query("sales").collect();
    if (args.startDate) {
      sales = sales.filter((s) => s.date >= args.startDate!);
    }
    if (args.endDate) {
      sales = sales.filter((s) => s.date <= args.endDate!);
    }
    const saleIds = new Set(sales.map((s) => s._id));

    // Get all sale items
    const allSaleItems = await ctx.db.query("saleItems").collect();
    const filteredItems = allSaleItems.filter((item) => saleIds.has(item.saleId));

    // Get products and categories for enrichment
    const products = await ctx.db.query("products").collect();
    const categories = await ctx.db.query("categories").collect();
    const productMap = new Map(products.map((p) => [p._id, p]));
    const categoryMap = new Map(categories.map((c) => [c._id, c.name]));

    // Aggregate per product
    const itemAgg: Record<
      string,
      { productName: string; sku: string; category: string; totalQty: number; totalRevenue: number; costPrice: number }
    > = {};

    for (const item of filteredItems) {
      const key = item.productId;
      if (!itemAgg[key]) {
        const product = productMap.get(item.productId);
        itemAgg[key] = {
          productName: item.productName || product?.name || "Unknown",
          sku: product?.sku || "",
          category: product?.categoryId ? categoryMap.get(product.categoryId) || "" : "",
          totalQty: 0,
          totalRevenue: 0,
          costPrice: product?.costPrice || 0,
        };
      }
      itemAgg[key].totalQty += item.quantity;
      itemAgg[key].totalRevenue += item.subtotal;
    }

    const rows = Object.values(itemAgg).map((item) => {
      const totalCogs = item.costPrice * item.totalQty;
      const profit = item.totalRevenue - totalCogs;
      const margin = item.totalRevenue > 0 ? (profit / item.totalRevenue) * 100 : 0;
      return {
        productName: item.productName,
        sku: item.sku,
        category: item.category,
        totalQty: item.totalQty,
        avgPrice: item.totalQty > 0 ? item.totalRevenue / item.totalQty : 0,
        totalRevenue: item.totalRevenue,
        costPrice: item.costPrice,
        totalCogs,
        profit,
        margin: Math.round(margin * 100) / 100,
      };
    });

    // Sort by revenue descending by default
    rows.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      rows,
      summary: {
        uniqueProducts: rows.length,
        totalUnitsSold: rows.reduce((sum, r) => sum + r.totalQty, 0),
        totalRevenue: rows.reduce((sum, r) => sum + r.totalRevenue, 0),
        totalCogs: rows.reduce((sum, r) => sum + r.totalCogs, 0),
        totalProfit: rows.reduce((sum, r) => sum + r.profit, 0),
      },
    };
  },
});
