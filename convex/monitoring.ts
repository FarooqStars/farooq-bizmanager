import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

async function requireAdmin(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  if (user.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
  return user;
}

// ── Live Activity Feed ────────────────────────────────────────────────────────

export const liveActivityFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const logs = await ctx.db
      .query("activityLog")
      .order("desc")
      .take(args.limit ?? 25);

    return Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          _id: log._id,
          _creationTime: log._creationTime,
          action: log.action,
          details: log.details,
          resourceType: log.resourceType,
          userName: user?.name ?? "Unknown",
          userRole: user?.role ?? "staff",
        };
      })
    );
  },
});

// ── System Health & Counts ────────────────────────────────────────────────────

export const systemHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Users
    const users = await ctx.db.query("users").collect();
    const activeUsers = users.filter((u) => u.isActive).length;
    const totalUsers = users.length;

    // Recent activity (last 24h and last hour)
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("activityLog")
      .order("desc")
      .take(200);

    const actionsLastHour = recentLogs.filter((l) => l._creationTime >= oneHourAgo).length;
    const actionsLast24h = recentLogs.filter((l) => l._creationTime >= oneDayAgo).length;

    // Inventory alerts
    const products = await ctx.db.query("products").collect();
    const activeProducts = products.filter((p) => p.isActive);
    let lowStockCount = 0;
    for (const product of activeProducts) {
      if (product.lowStockThreshold) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_product", (q) => q.eq("productId", product._id))
          .collect();
        const totalQty = inv.reduce((s, i) => s + i.quantity, 0);
        if (totalQty <= product.lowStockThreshold) lowStockCount++;
      }
    }

    // Bills
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_status", (q) => q.eq("status", "overdue"))
      .collect();
    const overdueBills = bills.length;

    // Pending sales
    const pendingSales = await ctx.db
      .query("sales")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Assets under repair
    const assetsRepair = await ctx.db
      .query("assets")
      .withIndex("by_status", (q) => q.eq("status", "under_repair"))
      .collect();

    // Vehicles in maintenance
    const vehiclesMaint = await ctx.db
      .query("vehicles")
      .withIndex("by_status", (q) => q.eq("status", "in_maintenance"))
      .collect();

    return {
      users: { active: activeUsers, total: totalUsers },
      activity: { lastHour: actionsLastHour, last24h: actionsLast24h },
      alerts: {
        lowStock: lowStockCount,
        overdueBills,
        pendingSales: pendingSales.length,
        assetsUnderRepair: assetsRepair.length,
        vehiclesInMaintenance: vehiclesMaint.length,
      },
      totalProducts: activeProducts.length,
    };
  },
});

// ── Activity by User (for the admin to see who's active) ──────────────────────

export const activityByUser = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").collect();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("activityLog")
      .order("desc")
      .take(500);

    // Group recent activity by user
    const userActivity: Record<string, { count: number; lastAction: number; lastActionText: string }> = {};
    for (const log of recentLogs) {
      if (log._creationTime < oneDayAgo) continue;
      const userId = log.userId;
      if (!userActivity[userId]) {
        userActivity[userId] = { count: 0, lastAction: log._creationTime, lastActionText: log.action };
      }
      userActivity[userId].count++;
    }

    return users
      .filter((u) => u.isActive)
      .map((u) => ({
        id: u._id,
        name: u.name ?? "Unknown",
        role: u.role,
        actionsToday: userActivity[u._id]?.count ?? 0,
        lastAction: userActivity[u._id]?.lastAction ?? null,
        lastActionText: userActivity[u._id]?.lastActionText ?? null,
      }))
      .sort((a, b) => (b.lastAction ?? 0) - (a.lastAction ?? 0));
  },
});

// ── Activity Trend (hourly counts for last 12 hours) ──────────────────────────

export const activityTrend = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const now = Date.now();
    const twelveHoursAgo = now - 12 * 60 * 60 * 1000;

    const recentLogs = await ctx.db
      .query("activityLog")
      .order("desc")
      .take(500);

    // Bucket into hours
    const hours: Array<{ hour: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const hourStart = now - (i + 1) * 60 * 60 * 1000;
      const hourEnd = now - i * 60 * 60 * 1000;
      const count = recentLogs.filter(
        (l) => l._creationTime >= hourStart && l._creationTime < hourEnd
      ).length;
      const date = new Date(hourEnd);
      hours.push({
        hour: date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
        count,
      });
    }

    return hours;
  },
});
