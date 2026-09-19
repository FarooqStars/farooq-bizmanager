import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

async function requireAuth(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Unit Group Queries ──────────────────────────────────────────

export const listGroups = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const groups = await ctx.db.query("unitGroups").collect();
    // Attach conversions count
    const enriched = await Promise.all(
      groups.map(async (g) => {
        const conversions = await ctx.db
          .query("unitConversions")
          .withIndex("by_group", (q) => q.eq("unitGroupId", g._id))
          .collect();
        return {
          ...g,
          conversionsCount: conversions.length,
          units: [g.baseUnit, ...conversions.map((c) => c.fromUnit === g.baseUnit ? c.toUnit : c.fromUnit)]
            .filter((u, i, arr) => arr.indexOf(u) === i),
        };
      })
    );
    return enriched;
  },
});

export const getGroup = query({
  args: { id: v.id("unitGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const group = await ctx.db.get(args.id);
    if (!group) return null;
    const conversions = await ctx.db
      .query("unitConversions")
      .withIndex("by_group", (q) => q.eq("unitGroupId", args.id))
      .collect();
    return { ...group, conversions };
  },
});

export const listConversions = query({
  args: { unitGroupId: v.id("unitGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("unitConversions")
      .withIndex("by_group", (q) => q.eq("unitGroupId", args.unitGroupId))
      .collect();
  },
});

// ─── Unit Group Mutations ────────────────────────────────────────

export const createGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    baseUnit: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db.insert("unitGroups", {
      name: args.name,
      description: args.description,
      baseUnit: args.baseUnit,
      isActive: true,
    });
  },
});

export const updateGroup = mutation({
  args: {
    id: v.id("unitGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    baseUnit: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const group = await ctx.db.get(args.id);
    if (!group) throw new ConvexError({ message: "Unit group not found", code: "NOT_FOUND" });
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.baseUnit !== undefined) updates.baseUnit = args.baseUnit;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    await ctx.db.patch(args.id, updates);
  },
});

export const deleteGroup = mutation({
  args: { id: v.id("unitGroups") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    // Delete all conversions in this group
    const conversions = await ctx.db
      .query("unitConversions")
      .withIndex("by_group", (q) => q.eq("unitGroupId", args.id))
      .collect();
    for (const c of conversions) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Conversion Mutations ────────────────────────────────────────

export const addConversion = mutation({
  args: {
    unitGroupId: v.id("unitGroups"),
    fromUnit: v.string(),
    toUnit: v.string(),
    conversionFactor: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const group = await ctx.db.get(args.unitGroupId);
    if (!group) throw new ConvexError({ message: "Unit group not found", code: "NOT_FOUND" });
    if (args.conversionFactor <= 0) {
      throw new ConvexError({ message: "Conversion factor must be positive", code: "BAD_REQUEST" });
    }
    return await ctx.db.insert("unitConversions", {
      unitGroupId: args.unitGroupId,
      fromUnit: args.fromUnit,
      toUnit: args.toUnit,
      conversionFactor: args.conversionFactor,
    });
  },
});

export const updateConversion = mutation({
  args: {
    id: v.id("unitConversions"),
    conversionFactor: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.conversionFactor <= 0) {
      throw new ConvexError({ message: "Conversion factor must be positive", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, { conversionFactor: args.conversionFactor });
  },
});

export const deleteConversion = mutation({
  args: { id: v.id("unitConversions") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Conversion Utility Query ────────────────────────────────────

export const convert = query({
  args: {
    unitGroupId: v.id("unitGroups"),
    fromUnit: v.string(),
    toUnit: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    if (args.fromUnit === args.toUnit) return args.quantity;

    const conversions = await ctx.db
      .query("unitConversions")
      .withIndex("by_group", (q) => q.eq("unitGroupId", args.unitGroupId))
      .collect();

    // Try direct conversion
    const direct = conversions.find(
      (c) => c.fromUnit === args.fromUnit && c.toUnit === args.toUnit
    );
    if (direct) return args.quantity * direct.conversionFactor;

    // Try reverse
    const reverse = conversions.find(
      (c) => c.fromUnit === args.toUnit && c.toUnit === args.fromUnit
    );
    if (reverse) return args.quantity / reverse.conversionFactor;

    // Try via base unit (2-step)
    const group = await ctx.db.get(args.unitGroupId);
    if (!group) return null;
    const baseUnit = group.baseUnit;

    // from -> base
    let toBase = 1;
    if (args.fromUnit !== baseUnit) {
      const step1 = conversions.find(
        (c) => c.fromUnit === args.fromUnit && c.toUnit === baseUnit
      );
      if (step1) {
        toBase = step1.conversionFactor;
      } else {
        const step1r = conversions.find(
          (c) => c.fromUnit === baseUnit && c.toUnit === args.fromUnit
        );
        if (step1r) toBase = 1 / step1r.conversionFactor;
        else return null;
      }
    }

    // base -> to
    let fromBase = 1;
    if (args.toUnit !== baseUnit) {
      const step2 = conversions.find(
        (c) => c.fromUnit === baseUnit && c.toUnit === args.toUnit
      );
      if (step2) {
        fromBase = step2.conversionFactor;
      } else {
        const step2r = conversions.find(
          (c) => c.fromUnit === args.toUnit && c.toUnit === baseUnit
        );
        if (step2r) fromBase = 1 / step2r.conversionFactor;
        else return null;
      }
    }

    return args.quantity * toBase * fromBase;
  },
});
