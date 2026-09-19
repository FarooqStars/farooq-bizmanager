import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

const itemTypeValidator = v.union(
  v.literal("product"),
  v.literal("asset")
);

const coverageTypeValidator = v.union(
  v.literal("full"),
  v.literal("limited"),
  v.literal("extended")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("claimed"),
  v.literal("void")
);

const serviceTypeValidator = v.union(
  v.literal("repair"),
  v.literal("replacement"),
  v.literal("inspection"),
  v.literal("claim")
);

async function getUser(ctx: QueryCtx, tokenIdentifier: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

// ─── Warranty CRUD ───────────────────────────────────────────────

export const listWarranties = query({
  args: {
    statusFilter: v.optional(statusValidator),
    itemTypeFilter: v.optional(itemTypeValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let warranties;
    if (args.statusFilter) {
      warranties = await ctx.db
        .query("warranties")
        .withIndex("by_status", (q) => q.eq("status", args.statusFilter!))
        .collect();
    } else {
      warranties = await ctx.db.query("warranties").collect();
    }

    if (args.itemTypeFilter) {
      warranties = warranties.filter((w) => w.itemType === args.itemTypeFilter);
    }

    return warranties;
  },
});

export const getWarranty = query({
  args: { warrantyId: v.id("warranties") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const warranty = await ctx.db.get(args.warrantyId);
    if (!warranty) throw new ConvexError({ message: "Warranty not found", code: "NOT_FOUND" });
    return warranty;
  },
});

export const createWarranty = mutation({
  args: {
    itemType: itemTypeValidator,
    itemId: v.string(),
    itemName: v.string(),
    warrantyNumber: v.optional(v.string()),
    provider: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    terms: v.optional(v.string()),
    coverageType: coverageTypeValidator,
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Determine status based on dates
    const now = new Date().toISOString();
    const status = args.endDate < now ? "expired" : "active";

    const warrantyId = await ctx.db.insert("warranties", {
      ...args,
      status,
      createdBy: user._id,
    });
    return warrantyId;
  },
});

export const updateWarranty = mutation({
  args: {
    warrantyId: v.id("warranties"),
    provider: v.optional(v.string()),
    warrantyNumber: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    terms: v.optional(v.string()),
    coverageType: v.optional(coverageTypeValidator),
    status: v.optional(statusValidator),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const { warrantyId, ...updates } = args;
    const existing = await ctx.db.get(warrantyId);
    if (!existing) throw new ConvexError({ message: "Warranty not found", code: "NOT_FOUND" });

    const patch: Record<string, unknown> = {};
    if (updates.provider !== undefined) patch.provider = updates.provider;
    if (updates.warrantyNumber !== undefined) patch.warrantyNumber = updates.warrantyNumber;
    if (updates.startDate !== undefined) patch.startDate = updates.startDate;
    if (updates.endDate !== undefined) patch.endDate = updates.endDate;
    if (updates.terms !== undefined) patch.terms = updates.terms;
    if (updates.coverageType !== undefined) patch.coverageType = updates.coverageType;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.contactPhone !== undefined) patch.contactPhone = updates.contactPhone;
    if (updates.contactEmail !== undefined) patch.contactEmail = updates.contactEmail;
    if (updates.notes !== undefined) patch.notes = updates.notes;

    await ctx.db.patch(warrantyId, patch);
  },
});

export const deleteWarranty = mutation({
  args: { warrantyId: v.id("warranties") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Delete associated service history
    const services = await ctx.db
      .query("warrantyServiceHistory")
      .withIndex("by_warranty", (q) => q.eq("warrantyId", args.warrantyId))
      .collect();
    for (const svc of services) {
      await ctx.db.delete(svc._id);
    }

    await ctx.db.delete(args.warrantyId);
  },
});

// ─── Service History ─────────────────────────────────────────────

export const listServiceHistory = query({
  args: { warrantyId: v.id("warranties") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const services = await ctx.db
      .query("warrantyServiceHistory")
      .withIndex("by_warranty", (q) => q.eq("warrantyId", args.warrantyId))
      .collect();

    return services.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  },
});

export const addServiceRecord = mutation({
  args: {
    warrantyId: v.id("warranties"),
    serviceDate: v.string(),
    type: serviceTypeValidator,
    description: v.string(),
    cost: v.optional(v.number()),
    coveredByWarranty: v.boolean(),
    serviceProvider: v.optional(v.string()),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const warranty = await ctx.db.get(args.warrantyId);
    if (!warranty) throw new ConvexError({ message: "Warranty not found", code: "NOT_FOUND" });

    const recordId = await ctx.db.insert("warrantyServiceHistory", {
      ...args,
      recordedBy: user._id,
    });

    // If type is "claim", update warranty status
    if (args.type === "claim") {
      await ctx.db.patch(args.warrantyId, { status: "claimed" });
    }

    return recordId;
  },
});

export const deleteServiceRecord = mutation({
  args: { serviceId: v.id("warrantyServiceHistory") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    await ctx.db.delete(args.serviceId);
  },
});

// ─── Expiry Check (for cron/alerts) ─────────────────────────────

export const checkWarrantyExpiry = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();

    // Find all active warranties that have expired
    const activeWarranties = await ctx.db
      .query("warranties")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let expiredCount = 0;
    for (const warranty of activeWarranties) {
      if (warranty.endDate < now) {
        await ctx.db.patch(warranty._id, { status: "expired" });
        expiredCount++;
      }
    }
    return expiredCount;
  },
});

export const getExpiringWarranties = query({
  args: { daysAhead: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const now = new Date();
    const futureDate = new Date(now.getTime() + args.daysAhead * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString();
    const nowStr = now.toISOString();

    const activeWarranties = await ctx.db
      .query("warranties")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    return activeWarranties.filter(
      (w) => w.endDate >= nowStr && w.endDate <= futureDateStr
    );
  },
});

export const getWarrantyStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const all = await ctx.db.query("warranties").collect();
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const nowStr = now.toISOString();

    return {
      total: all.length,
      active: all.filter((w) => w.status === "active").length,
      expired: all.filter((w) => w.status === "expired").length,
      claimed: all.filter((w) => w.status === "claimed").length,
      expiringSoon: all.filter(
        (w) => w.status === "active" && w.endDate >= nowStr && w.endDate <= thirtyDays
      ).length,
    };
  },
});
