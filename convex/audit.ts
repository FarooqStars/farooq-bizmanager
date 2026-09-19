// M1.1: auditLog table retired. All audit writes now go to activityLog.
// activityLog gains beforeValue/afterValue/reason/mutationName for field-level audit trail.
//
// SECURITY NOTE: activityLog rows are immutable by design — no mutation in this codebase
// calls ctx.db.patch/delete on "activityLog". However, Convex deployment key holders can
// bypass this at the database level. This is a documented limitation; source-level
// immutability is verified by the grep test in convex/__tests__/auditImmutability.test.ts.

import { query, mutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import type { PaginationResult } from "convex/server";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ── logAudit helper — called from all financial mutations ─────────────────────
// This is the single write path for all audit events. It is intentionally
// kept simple (one insert, no retry logic) so callers can reason about it.

export async function logAudit(
  ctx: MutationCtx,
  params: {
    userId: Id<"users">;
    mutationName: string;
    resourceType: string;
    resourceId: string;
    action: string;
    beforeValue?: string;  // JSON.stringify(docBefore)
    afterValue?: string;   // JSON.stringify(docAfter)
    reason?: string;
    details?: string;
  }
) {
  await ctx.db.insert("activityLog", {
    userId: params.userId,
    action: params.action,
    details: params.details,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    beforeValue: params.beforeValue,
    afterValue: params.afterValue,
    reason: params.reason,
    mutationName: params.mutationName,
  });
}

// ── List audit log entries with filters ──────────────────────────────────────

export const listAuditLog = query({
  args: {
    limit: v.optional(v.number()),
    actionFilter: v.optional(v.string()),
    resourceTypeFilter: v.optional(v.string()),
    userFilter: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const limit = args.limit ?? 100;

    // Use resourceType index when filtering by resource type for efficiency
    let entries;
    if (args.resourceTypeFilter && args.resourceTypeFilter !== "all") {
      entries = await ctx.db
        .query("activityLog")
        .withIndex("by_resource_type", (q) =>
          q.eq("resourceType", args.resourceTypeFilter)
        )
        .order("desc")
        .take(500);
    } else {
      entries = await ctx.db
        .query("activityLog")
        .order("desc")
        .take(500);
    }

    if (args.actionFilter && args.actionFilter !== "all") {
      entries = entries.filter((e) => e.action === args.actionFilter);
    }
    if (args.userFilter && args.userFilter !== "all") {
      entries = entries.filter((e) => e.userId === args.userFilter);
    }

    const limited = entries.slice(0, limit);

    // Enrich with user names
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    return limited.map((entry) => ({
      ...entry,
      userName: userMap.get(entry.userId)?.name ?? "Unknown",
      userRole: userMap.get(entry.userId)?.role ?? "staff",
    }));
  },
});

// ── Get audit stats ──────────────────────────────────────────────────────────

export const getAuditStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const entries = await ctx.db.query("activityLog").order("desc").take(500);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const todayEntries = entries.filter((e) => e._creationTime >= todayMs);

    const actionCounts: Record<string, number> = {};
    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1;
    }

    const resourceCounts: Record<string, number> = {};
    for (const entry of entries) {
      const rt = entry.resourceType ?? "other";
      resourceCounts[rt] = (resourceCounts[rt] ?? 0) + 1;
    }

    const uniqueActions = [...new Set(entries.map((e) => e.action))];
    const uniqueResourceTypes = [
      ...new Set(entries.map((e) => e.resourceType).filter((r): r is string => r != null)),
    ];

    return {
      totalEntries: entries.length,
      todayCount: todayEntries.length,
      actionCounts,
      resourceCounts,
      uniqueActions,
      uniqueResourceTypes,
    };
  },
});

// ── Manual audit entry for admin ─────────────────────────────────────────────

export const addManualAuditEntry = mutation({
  args: {
    action: v.string(),
    details: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier as string))
      .unique();

    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    await ctx.db.insert("activityLog", {
      userId: user._id,
      action: args.action,
      details: args.details,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      mutationName: "audit:addManualAuditEntry",
    });
  },
});

// ── Paginated audit trail for the reports page ──────────────────────────────

type AuditTrailEntry = {
  _id: Id<"activityLog">;
  _creationTime: number;
  userId: Id<"users">;
  action: string;
  details?: string;
  resourceType?: string;
  resourceId?: string;
  beforeValue?: string;
  afterValue?: string;
  reason?: string;
  mutationName?: string;
  userName: string;
};

export const getAuditTrail = query({
  args: {
    paginationOpts: paginationOptsValidator,
    resourceType: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    action: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PaginationResult<AuditTrailEntry>> => {
    await requireAuth(ctx);

    // Use index when filtering by resourceType, otherwise full table scan descending
    let baseQuery;
    if (args.resourceType) {
      baseQuery = ctx.db
        .query("activityLog")
        .withIndex("by_resource_type", (q) =>
          q.eq("resourceType", args.resourceType)
        )
        .order("desc");
    } else {
      baseQuery = ctx.db.query("activityLog").order("desc");
    }

    const paginatedResult = await baseQuery.paginate(args.paginationOpts);

    // Post-filter by userId, action, date range
    let filtered = paginatedResult.page;

    if (args.userId) {
      filtered = filtered.filter((e) => e.userId === args.userId);
    }
    if (args.action) {
      filtered = filtered.filter((e) =>
        e.action.toLowerCase().includes(args.action!.toLowerCase())
      );
    }
    if (args.startDate) {
      const startMs = new Date(args.startDate).getTime();
      filtered = filtered.filter((e) => e._creationTime >= startMs);
    }
    if (args.endDate) {
      // End of day for the end date
      const endMs = new Date(args.endDate).getTime() + 86400000;
      filtered = filtered.filter((e) => e._creationTime < endMs);
    }

    // Enrich with user names
    const userIds = [...new Set(filtered.map((e) => e.userId))];
    const userDocs = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(
      userDocs
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => [u._id, u.name ?? u.email ?? "Unknown"])
    );

    const enriched: AuditTrailEntry[] = filtered.map((entry) => ({
      _id: entry._id,
      _creationTime: entry._creationTime,
      userId: entry.userId,
      action: entry.action,
      details: entry.details,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      beforeValue: entry.beforeValue,
      afterValue: entry.afterValue,
      reason: entry.reason,
      mutationName: entry.mutationName,
      userName: userMap.get(entry.userId) ?? "Unknown",
    }));

    return {
      page: enriched,
      isDone: paginatedResult.isDone,
      continueCursor: paginatedResult.continueCursor,
    };
  },
});

// ── Distinct users from activity log (for filter dropdown) ──────────────────

export const getAuditUsers = query({
  args: {},
  handler: async (ctx): Promise<Array<{ _id: Id<"users">; name: string }>> => {
    await requireAuth(ctx);
    const entries = await ctx.db.query("activityLog").order("desc").take(1000);
    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    return users
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((u) => ({ _id: u._id, name: u.name ?? u.email ?? "Unknown" }));
  },
});
