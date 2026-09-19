// Public demo mode — status for the screens, and the table wipe used by the
// nightly reset. See convex/lib/demo.ts.
import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { TableNames } from "./_generated/dataModel.d.ts";
import schema from "./schema.ts";
import { isDemoMode, DEMO_EMAIL, DEMO_PASSWORD } from "./lib/demo.ts";

export const status = query({
  args: {},
  handler: async () => {
    if (!isDemoMode()) return { enabled: false as const };
    return { enabled: true as const, email: DEMO_EMAIL, password: DEMO_PASSWORD };
  },
});

/** Every application table, except the sign-in key (kept so tokens stay valid). */
export function demoTables(): TableNames[] {
  return (Object.keys(schema.tables) as TableNames[]).filter((t) => t !== "authKeys");
}

/** Deletes up to 400 rows of one table. Returns how many were deleted. */
export const clearTableBatch = internalMutation({
  args: { table: v.string() },
  handler: async (ctx, args) => {
    if (!isDemoMode()) throw new Error("clearTableBatch runs only in demo mode");
    if (!demoTables().includes(args.table as TableNames)) throw new Error(`Unknown table ${args.table}`);
    const rows = await ctx.db.query(args.table as TableNames).take(400);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

/** Deletes up to 100 uploaded files. Returns how many were deleted. */
export const clearStorageBatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!isDemoMode()) throw new Error("clearStorageBatch runs only in demo mode");
    const files = await ctx.db.system.query("_storage").take(100);
    for (const f of files) await ctx.storage.delete(f._id);
    return files.length;
  },
});
