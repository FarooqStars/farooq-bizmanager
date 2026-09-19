import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { assertOwner, getCurrentUser } from "./lib/auth.ts";
import { logAudit } from "./lib/audit.ts";

/**
 * Fallback defaults used when no creditControlSettings row exists.
 * All null = no restriction. This matches the closingDate.ts invariant:
 * absence of a restriction is not a restriction. A fresh install with no
 * settings row must NEVER block sales.
 */
export const CREDIT_CONTROL_DEFAULTS = {
  doubtfulDays: null as number | null,
  blacklistDays: null as number | null,
  writeOffDays: null as number | null,
} as const;

/**
 * Allowed threshold values in days. Presented as months in the UI.
 * Stored as days to avoid ambiguity (a "month" is not a fixed number of days).
 */
export const THRESHOLD_DAY_OPTIONS: { label: string; days: number }[] = [
  { label: "3 months", days: 91 },
  { label: "4 months", days: 122 },
  { label: "6 months", days: 183 },
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
  { label: "3 years", days: 1095 },
];

export const getCreditControlSettings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const rows = await ctx.db.query("creditControlSettings").take(2);
    if (rows.length === 0) return { ...CREDIT_CONTROL_DEFAULTS, _id: null };

    if (rows.length > 1) {
      // Should never happen, but defensive: log and use the first row.
      console.warn("creditControlSettings has more than one row; using the first.");
    }

    const row = rows[0];
    return {
      _id: row._id,
      doubtfulDays: row.doubtfulDays ?? null,
      blacklistDays: row.blacklistDays ?? null,
      writeOffDays: row.writeOffDays ?? null,
    };
  },
});

export const saveCreditControlSettings = mutation({
  args: {
    doubtfulDays: v.optional(v.number()),
    blacklistDays: v.optional(v.number()),
    writeOffDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    // Validate: each provided value must be one of the allowed day counts.
    const allowed = new Set(THRESHOLD_DAY_OPTIONS.map((o) => o.days));
    for (const [key, val] of Object.entries(args)) {
      if (val !== undefined && !allowed.has(val)) {
        throw new ConvexError({
          message: `Invalid threshold value ${val} for ${key}. Must be one of: ${[...allowed].join(", ")} days.`,
          code: "BAD_REQUEST",
        });
      }
    }

    const rows = await ctx.db.query("creditControlSettings").take(2);

    if (rows.length === 0) {
      await ctx.db.insert("creditControlSettings", {
        doubtfulDays: args.doubtfulDays,
        blacklistDays: args.blacklistDays,
        writeOffDays: args.writeOffDays,
      });
    } else {
      if (rows.length > 1) {
        console.warn("creditControlSettings has more than one row; patching the first.");
      }
      await ctx.db.patch(rows[0]._id, {
        doubtfulDays: args.doubtfulDays,
        blacklistDays: args.blacklistDays,
        writeOffDays: args.writeOffDays,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "creditControlSettings:saveCreditControlSettings",
      resourceType: "settings",
      resourceId: user._id,
      action: "settings_updated",
      beforeValue: undefined,
      afterValue: JSON.stringify(args),
      details: "Credit control thresholds updated",
    });
  },
});
