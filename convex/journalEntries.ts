/**
 * Public query helpers for journalEntries.
 * Kept minimal — only expose what external callers and tests need.
 * Internal functions should use ctx.db directly.
 */
import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

export const getBySource = query({
  args: {
    sourceType: v.string(),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    return await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId),
      )
      .first();
  },
});
