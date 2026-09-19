import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { ConvexError } from "convex/values";

const widgetValidator = v.object({
  id: v.string(),
  type: v.string(),
  title: v.string(),
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  config: v.optional(v.object({
    metric: v.optional(v.string()),
    period: v.optional(v.string()),
    chartType: v.optional(v.string()),
    limit: v.optional(v.number()),
  })),
});

export const getLayout = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return null;

    const layout = await ctx.db
      .query("dashboardLayouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    return layout;
  },
});

export const saveLayout = mutation({
  args: {
    widgets: v.array(widgetValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const existing = await ctx.db
      .query("dashboardLayouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { widgets: args.widgets });
    } else {
      await ctx.db.insert("dashboardLayouts", {
        userId: user._id,
        widgets: args.widgets,
      });
    }
  },
});

export const resetLayout = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const existing = await ctx.db
      .query("dashboardLayouts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
