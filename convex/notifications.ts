import { query, mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api.js";
import type { MutationCtx } from "./_generated/server";

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<unknown> }; db: MutationCtx["db"] | ReturnType<MutationCtx["db"]["query"]> }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity as { tokenIdentifier: string };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const listNotifications = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", (identity as { tokenIdentifier: string }).tokenIdentifier))
      .unique();
    if (!user) return [];
    return ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", (identity as { tokenIdentifier: string }).tokenIdentifier))
      .unique();
    if (!user) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("isRead", false))
      .collect();
    return unread.length;
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.patch(args.notificationId, { isRead: true });
  },
});

export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", (identity as { tokenIdentifier: string }).tokenIdentifier))
      .unique();
    if (!user) return;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("isRead", false))
      .collect();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { isRead: true })));
  },
});

export const dismissNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.delete(args.notificationId);
  },
});

export const dismissAll = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", (identity as { tokenIdentifier: string }).tokenIdentifier))
      .unique();
    if (!user) return;
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    await Promise.all(all.map((n) => ctx.db.delete(n._id)));
  },
});

// ── Internal: generate notifications for a user ───────────────────────────────

export const generateAlerts = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];

    // Helper: avoid duplicate alerts by checking if same-type+resourceId already exists unread
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", args.userId).eq("isRead", false))
      .collect();
    const existingKeys = new Set(existing.map((n) => `${n.type}:${n.resourceId ?? ""}`));

    const push = async (
      type: "low_stock" | "overdue_bill" | "bill_due_soon" | "vehicle_maintenance" | "asset_condition" | "general",
      title: string,
      message: string,
      resourceType?: string,
      resourceId?: string
    ) => {
      const key = `${type}:${resourceId ?? ""}`;
      if (!existingKeys.has(key)) {
        await ctx.db.insert("notifications", {
          userId: args.userId, type, title, message,
          resourceType, resourceId, isRead: false,
        });
        existingKeys.add(key);
      }
    };

    // Low stock
    const products = await ctx.db.query("products").collect();
    const inventory = await ctx.db.query("inventory").collect();
    for (const product of products) {
      if (!product.isActive || product.lowStockThreshold === undefined) continue;
      const qty = inventory.filter((i) => i.productId === product._id).reduce((s, i) => s + i.quantity, 0);
      if (qty <= product.lowStockThreshold) {
        await push("low_stock", "Low Stock Alert", `${product.name} has only ${qty} units left (threshold: ${product.lowStockThreshold})`, "product", product._id);
      }
    }

    // Overdue bills
    const bills = await ctx.db.query("bills").collect();
    for (const bill of bills) {
      if (bill.status === "paid") continue;
      if (bill.dueDate < today) {
        await push("overdue_bill", "Overdue Bill", `Bill "${bill.title}" was due on ${bill.dueDate} and is unpaid`, "bill", bill._id);
      } else {
        // Due within 7 days
        const diff = (new Date(bill.dueDate).getTime() - Date.now()) / 86400000;
        if (diff <= 7 && diff >= 0) {
          await push("bill_due_soon", "Bill Due Soon", `"${bill.title}" is due in ${Math.ceil(diff)} day${Math.ceil(diff) !== 1 ? "s" : ""} (${bill.dueDate})`, "bill", bill._id);
        }
      }
    }

    // Vehicles in maintenance
    const vehicles = await ctx.db.query("vehicles").collect();
    for (const vehicle of vehicles) {
      if (vehicle.status === "in_maintenance") {
        await push("vehicle_maintenance", "Vehicle Under Maintenance", `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.plate}) is currently under maintenance`, "vehicle", vehicle._id);
      }
    }

    // Assets in poor condition or under repair
    const assets = await ctx.db.query("assets").collect();
    for (const asset of assets) {
      if (asset.condition === "poor" || asset.status === "under_repair") {
        const reason = asset.status === "under_repair" ? "is under repair" : "is in poor condition";
        await push("asset_condition", "Asset Needs Attention", `Asset "${asset.name}" ${reason}`, "asset", asset._id);
      }
    }
  },
});

// ── Public: trigger alert generation for current user ────────────────────────

export const refreshAlerts = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", (identity as { tokenIdentifier: string }).tokenIdentifier))
      .unique();
    if (!user || user.role === "staff") return null;
    // Schedule internal generation
    await ctx.scheduler.runAfter(0, internal.notifications.generateAlerts, { userId: user._id });
    return null;
  },
});
