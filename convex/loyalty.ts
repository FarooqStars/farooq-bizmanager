import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";

async function getUser(ctx: QueryCtx, tokenIdentifier: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

const DEFAULT_TIERS = [
  { name: "Bronze", minimumPoints: 0, multiplier: 1, color: "#CD7F32" },
  { name: "Silver", minimumPoints: 500, multiplier: 1.25, color: "#C0C0C0" },
  { name: "Gold", minimumPoints: 2000, multiplier: 1.5, color: "#FFD700" },
  { name: "Platinum", minimumPoints: 5000, multiplier: 2, color: "#E5E4E2" },
];

// ─── Settings ────────────────────────────────────────────────────

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const settings = await ctx.db.query("loyaltySettings").first();
    return settings;
  },
});

export const saveSettings = mutation({
  args: {
    pointsPerCurrencyUnit: v.number(),
    redemptionRate: v.number(),
    minimumRedeemPoints: v.number(),
    pointsExpiryDays: v.number(),
    isActive: v.boolean(),
    tiers: v.array(v.object({
      name: v.string(),
      minimumPoints: v.number(),
      multiplier: v.number(),
      color: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Only owners and managers can modify loyalty settings", code: "FORBIDDEN" });
    }

    const existing = await ctx.db.query("loyaltySettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedBy: user._id });
    } else {
      await ctx.db.insert("loyaltySettings", { ...args, updatedBy: user._id });
    }
  },
});

export const initializeSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const existing = await ctx.db.query("loyaltySettings").first();
    if (existing) return existing._id;

    return await ctx.db.insert("loyaltySettings", {
      pointsPerCurrencyUnit: 1,
      redemptionRate: 0.01,
      minimumRedeemPoints: 100,
      pointsExpiryDays: 365,
      isActive: true,
      tiers: DEFAULT_TIERS,
      updatedBy: user._id,
    });
  },
});

// ─── Loyalty Accounts ────────────────────────────────────────────

export const getAccount = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();
  },
});

export const listAccounts = query({
  args: { tierFilter: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let accounts;
    if (args.tierFilter) {
      accounts = await ctx.db
        .query("loyaltyAccounts")
        .withIndex("by_tier", (q) => q.eq("currentTier", args.tierFilter!))
        .collect();
    } else {
      accounts = await ctx.db.query("loyaltyAccounts").collect();
    }

    // Enrich with customer info
    const enriched = await Promise.all(
      accounts.map(async (acc) => {
        const customer = await ctx.db.get(acc.customerId);
        return {
          ...acc,
          customerName: customer?.name ?? "Unknown",
          customerEmail: customer?.email,
        };
      })
    );

    return enriched.sort((a, b) => b.currentBalance - a.currentBalance);
  },
});

export const getLoyaltyStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const accounts = await ctx.db.query("loyaltyAccounts").collect();
    const settings = await ctx.db.query("loyaltySettings").first();

    const totalMembers = accounts.length;
    const totalPointsInCirculation = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
    const totalEarned = accounts.reduce((sum, a) => sum + a.totalPointsEarned, 0);
    const totalRedeemed = accounts.reduce((sum, a) => sum + a.totalPointsRedeemed, 0);

    const tierBreakdown: Record<string, number> = {};
    const tiers = settings?.tiers ?? DEFAULT_TIERS;
    for (const tier of tiers) {
      tierBreakdown[tier.name] = 0;
    }
    for (const acc of accounts) {
      if (tierBreakdown[acc.currentTier] !== undefined) {
        tierBreakdown[acc.currentTier]++;
      }
    }

    return {
      totalMembers,
      totalPointsInCirculation,
      totalEarned,
      totalRedeemed,
      tierBreakdown,
      isActive: settings?.isActive ?? false,
    };
  },
});

// ─── Points Operations ───────────────────────────────────────────

function determineTier(totalEarned: number, tiers: Array<{ name: string; minimumPoints: number; multiplier: number; color: string }>) {
  let currentTier = tiers[0].name;
  for (const tier of tiers) {
    if (totalEarned >= tier.minimumPoints) {
      currentTier = tier.name;
    }
  }
  return currentTier;
}

async function getOrCreateAccount(ctx: MutationCtx, customerId: Id<"customers">) {
  const existing = await ctx.db
    .query("loyaltyAccounts")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .unique();

  if (existing) return existing;

  const id = await ctx.db.insert("loyaltyAccounts", {
    customerId,
    totalPointsEarned: 0,
    totalPointsRedeemed: 0,
    currentBalance: 0,
    currentTier: "Bronze",
  });
  return (await ctx.db.get(id))!;
}

export const earnPoints = mutation({
  args: {
    customerId: v.id("customers"),
    saleAmount: v.number(),
    saleId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const settings = await ctx.db.query("loyaltySettings").first();
    if (!settings?.isActive) return null;

    const account = await getOrCreateAccount(ctx, args.customerId);

    // Calculate points with tier multiplier
    const tiers = settings.tiers;
    const currentTierDef = tiers.find((t) => t.name === account.currentTier);
    const multiplier = currentTierDef?.multiplier ?? 1;
    const basePoints = Math.floor(args.saleAmount * settings.pointsPerCurrencyUnit);
    const earnedPoints = Math.floor(basePoints * multiplier);

    if (earnedPoints <= 0) return null;

    // Calculate expiry date
    const expiresAt = new Date(
      Date.now() + settings.pointsExpiryDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Record transaction
    await ctx.db.insert("loyaltyTransactions", {
      customerId: args.customerId,
      type: "earn",
      points: earnedPoints,
      description: `Earned from purchase of ${args.saleAmount.toFixed(2)}`,
      referenceType: "sale",
      referenceId: args.saleId,
      expiresAt,
      recordedBy: user._id,
    });

    // Update account
    const newTotalEarned = account.totalPointsEarned + earnedPoints;
    const newBalance = account.currentBalance + earnedPoints;
    const newTier = determineTier(newTotalEarned, tiers);

    await ctx.db.patch(account._id, {
      totalPointsEarned: newTotalEarned,
      currentBalance: newBalance,
      currentTier: newTier,
      lastActivityDate: new Date().toISOString(),
    });

    return { earnedPoints, newBalance, tier: newTier };
  },
});

export const redeemPoints = mutation({
  args: {
    customerId: v.id("customers"),
    points: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const settings = await ctx.db.query("loyaltySettings").first();
    if (!settings?.isActive) {
      throw new ConvexError({ message: "Loyalty program is not active", code: "BAD_REQUEST" });
    }

    if (args.points < settings.minimumRedeemPoints) {
      throw new ConvexError({
        message: `Minimum ${settings.minimumRedeemPoints} points required to redeem`,
        code: "BAD_REQUEST",
      });
    }

    const account = await ctx.db
      .query("loyaltyAccounts")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();

    if (!account) {
      throw new ConvexError({ message: "No loyalty account found", code: "NOT_FOUND" });
    }

    if (account.currentBalance < args.points) {
      throw new ConvexError({ message: "Insufficient points balance", code: "BAD_REQUEST" });
    }

    const discountValue = args.points * settings.redemptionRate;

    // Record transaction
    await ctx.db.insert("loyaltyTransactions", {
      customerId: args.customerId,
      type: "redeem",
      points: args.points,
      description: args.description ?? `Redeemed ${args.points} points for ${discountValue.toFixed(2)} discount`,
      recordedBy: user._id,
    });

    // Update account
    await ctx.db.patch(account._id, {
      totalPointsRedeemed: account.totalPointsRedeemed + args.points,
      currentBalance: account.currentBalance - args.points,
      lastActivityDate: new Date().toISOString(),
    });

    return { discountValue, remainingBalance: account.currentBalance - args.points };
  },
});

export const adjustPoints = mutation({
  args: {
    customerId: v.id("customers"),
    points: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    if (user.role !== "owner" && user.role !== "manager") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    const account = await getOrCreateAccount(ctx, args.customerId);

    await ctx.db.insert("loyaltyTransactions", {
      customerId: args.customerId,
      type: "adjust",
      points: args.points,
      description: args.reason,
      recordedBy: user._id,
    });

    const newBalance = account.currentBalance + args.points;
    const patch: Record<string, unknown> = {
      currentBalance: Math.max(0, newBalance),
      lastActivityDate: new Date().toISOString(),
    };
    if (args.points > 0) {
      patch.totalPointsEarned = account.totalPointsEarned + args.points;
    }

    await ctx.db.patch(account._id, patch);
  },
});

// ─── Transaction History ─────────────────────────────────────────

export const getTransactions = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const txns = await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(50);

    return txns;
  },
});

// ─── Points Expiry (cron) ────────────────────────────────────────

export const processPointsExpiry = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();

    // Find earn transactions that have expired
    const expiredTxns = await ctx.db
      .query("loyaltyTransactions")
      .withIndex("by_type", (q) => q.eq("type", "earn"))
      .collect();

    let expiredCount = 0;
    for (const txn of expiredTxns) {
      if (!txn.expiresAt || txn.expiresAt >= now) continue;

      // Mark as expired by inserting an expire transaction
      // Only if we haven't already expired it (check by referenceId)
      const alreadyExpired = await ctx.db
        .query("loyaltyTransactions")
        .withIndex("by_customer", (q) => q.eq("customerId", txn.customerId))
        .collect();

      const wasExpired = alreadyExpired.some(
        (t) => t.type === "expire" && t.referenceId === txn._id
      );
      if (wasExpired) continue;

      await ctx.db.insert("loyaltyTransactions", {
        customerId: txn.customerId,
        type: "expire",
        points: txn.points,
        description: `Points expired (earned ${txn.description})`,
        referenceId: txn._id,
      });

      // Deduct from account balance
      const account = await ctx.db
        .query("loyaltyAccounts")
        .withIndex("by_customer", (q) => q.eq("customerId", txn.customerId))
        .unique();

      if (account && account.currentBalance >= txn.points) {
        await ctx.db.patch(account._id, {
          currentBalance: account.currentBalance - txn.points,
        });
      }
      expiredCount++;

      // Process in small batches to avoid limits
      if (expiredCount >= 25) break;
    }

    return expiredCount;
  },
});
