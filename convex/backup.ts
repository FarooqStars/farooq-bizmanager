import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

async function requireUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity)
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  if (user.role !== "owner")
    throw new ConvexError({ message: "Only owners can export backups", code: "FORBIDDEN" });
  return user;
}

// Export all data from a specific table
export const exportTable = query({
  args: {
    tableName: v.union(
      v.literal("products"),
      v.literal("customers"),
      v.literal("vendors"),
      v.literal("sales"),
      v.literal("saleItems"),
      v.literal("expenses"),
      v.literal("expenseCategories"),
      v.literal("invoices"),
      v.literal("invoiceItems"),
      v.literal("bills"),
      v.literal("employees"),
      v.literal("categories"),
      v.literal("warehouses"),
      v.literal("inventory"),
      v.literal("journalEntries"),
      v.literal("journalLines"),
      v.literal("accounts"),
      v.literal("payments"),
      v.literal("customFields"),
      v.literal("customFieldValues")
    ),
  },
  handler: async (ctx, args): Promise<{ tableName: string; data: Record<string, unknown>[] }> => {
    await requireUser(ctx);

    const rows = await ctx.db.query(args.tableName).collect();
    // Serialize each row without internal _creationTime for cleaner backup
    const data = rows.map((row) => {
      const doc: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === "_creationTime") continue;
        doc[key] = value;
      }
      return doc;
    });

    return { tableName: args.tableName, data };
  },
});

// Get table counts for the backup UI
export const getTableCounts = query({
  args: {},
  handler: async (ctx): Promise<Array<{ name: string; count: number }>> => {
    await requireUser(ctx);

    const tables = [
      "products",
      "customers",
      "vendors",
      "sales",
      "saleItems",
      "expenses",
      "expenseCategories",
      "invoices",
      "invoiceItems",
      "bills",
      "employees",
      "categories",
      "warehouses",
      "inventory",
      "journalEntries",
      "journalLines",
      "accounts",
      "payments",
      "customFields",
      "customFieldValues",
    ] as const;

    const results: Array<{ name: string; count: number }> = [];

    for (const tableName of tables) {
      const rows = await ctx.db.query(tableName).collect();
      results.push({ name: tableName, count: rows.length });
    }

    return results;
  },
});
