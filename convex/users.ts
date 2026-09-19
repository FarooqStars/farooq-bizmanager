import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

export async function getUser(ctx: QueryCtx | MutationCtx, tokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
  // Deactivated users lose access. Treat undefined/true as active so the
  // owner (always created with isActive: true) is never blocked here.
  if (user && user.isActive === false) {
    throw new ConvexError({ message: "Account deactivated", code: "FORBIDDEN" });
  }
  return user;
}

export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const existing = await getUser(ctx, identity.tokenIdentifier);
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name ?? existing.name,
        email: identity.email ?? existing.email,
      });
      return existing._id;
    }

    // Count existing users to decide role
    const allUsers = await ctx.db.query("users").take(1);
    const isFirst = allUsers.length === 0;

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
      role: isFirst ? "owner" : "staff",
      isActive: true,
    });
    return userId;
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await getUser(ctx, identity.tokenIdentifier);
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("users").collect();
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    notes: v.optional(v.string()),
    role: v.optional(v.union(v.literal("owner"), v.literal("manager"), v.literal("staff"))),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || (caller.role !== "owner" && caller.role !== "manager")) {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    // Only owners can change roles
    if (args.role && caller.role !== "owner") {
      throw new ConvexError({ message: "Only owners can change roles", code: "FORBIDDEN" });
    }

    const { userId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined),
    );
    const userBefore = await ctx.db.get(userId);
    await ctx.db.patch(userId, filtered);
    const userAfter = await ctx.db.get(userId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "users:updateUser",
      resourceType: "user",
      resourceId: userId,
      action: "Updated user",
      beforeValue: userBefore ? JSON.stringify(userBefore) : undefined,
      afterValue: userAfter ? JSON.stringify(userAfter) : undefined,
    });
  },
});

export const updateMyProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    bio: v.optional(v.string()),
    address: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    avatarStorageId: v.optional(v.string()),
    signatureStorageId: v.optional(v.string()),
    timezone: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const updates = Object.fromEntries(Object.entries(args).filter(([, val]) => val !== undefined));
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(user._id, updates);
    }
  },
});

export const generateProfileUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.storage.getUrl(args.storageId as never);
  },
});

export const logActivity = internalMutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    details: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      userId: args.userId,
      mutationName: "users:logActivity",
      resourceType: args.resourceType ?? "unknown",
      resourceId: args.resourceId ?? "unknown",
      action: args.action,
      details: args.details,
    });
  },
});

export const getActivityLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      _id: Id<"activityLog">;
      _creationTime: number;
      action: string;
      details?: string;
      resourceType?: string;
      resourceId?: string;
      user: { name?: string; email?: string; role: string } | null;
    }>
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    // Staff (or unknown callers) simply see no activity instead of crashing the
    // app. A thrown query would bubble up to the error boundary on the dashboard.
    if (!caller || caller.role === "staff") {
      return [];
    }

    const logs = await ctx.db
      .query("activityLog")
      .order("desc")
      .take(args.limit ?? 50);

    return await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          user: user ? { name: user.name, email: user.email, role: user.role } : null,
        };
      }),
    );
  },
});

// ─── Create & Delete Users ────────────────────────────────────────

export const createManualUser = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.union(v.literal("manager"), v.literal("staff")),
    department: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || (caller.role !== "owner" && caller.role !== "manager")) {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }

    // Only owners can create managers
    if (args.role === "manager" && caller.role !== "owner") {
      throw new ConvexError({ message: "Only owners can create managers", code: "FORBIDDEN" });
    }

    // Create user with a manual token identifier (will be replaced on first login)
    const tokenIdentifier = `manual|${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const userId = await ctx.db.insert("users", {
      tokenIdentifier,
      name: args.name,
      email: args.email,
      phone: args.phone,
      role: args.role,
      department: args.department,
      jobTitle: args.jobTitle,
      notes: args.notes,
      isActive: true,
    });

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "users:createManualUser",
      resourceType: "user",
      resourceId: userId,
      action: `Added user: ${args.name}`,
      afterValue: JSON.stringify({ name: args.name, role: args.role, email: args.email }),
    });

    return userId;
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role !== "owner") {
      throw new ConvexError({ message: "Only owners can remove users", code: "FORBIDDEN" });
    }

    // Cannot delete yourself
    if (caller._id === args.userId) {
      throw new ConvexError({ message: "Cannot remove yourself", code: "BAD_REQUEST" });
    }

    const target = await ctx.db.get(args.userId);
    if (!target) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Cannot delete another owner
    if (target.role === "owner") {
      throw new ConvexError({ message: "Cannot remove another owner", code: "FORBIDDEN" });
    }

    await ctx.db.delete(args.userId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "users:deleteUser",
      resourceType: "user",
      resourceId: args.userId,
      action: `Removed user: ${target.name ?? target.email ?? "Unknown"}`,
      beforeValue: JSON.stringify(target),
      reason: "User removed by owner",
    });
  },
});

// ─── Access Rules ───────────────────────────────────────────────

export const listAccessRules = query({
  args: { role: v.union(v.literal("manager"), v.literal("staff")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role !== "owner") {
      throw new ConvexError({ message: "Only owners can manage access rules", code: "FORBIDDEN" });
    }

    return await ctx.db
      .query("accessRules")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
  },
});

export const upsertAccessRule = mutation({
  args: {
    role: v.union(v.literal("manager"), v.literal("staff")),
    module: v.string(),
    canView: v.boolean(),
    canCreate: v.boolean(),
    canEdit: v.boolean(),
    canDelete: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role !== "owner") {
      throw new ConvexError({ message: "Only owners can manage access rules", code: "FORBIDDEN" });
    }

    // Check if rule already exists
    const existing = await ctx.db
      .query("accessRules")
      .withIndex("by_role_and_module", (q) => q.eq("role", args.role).eq("module", args.module))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        canView: args.canView,
        canCreate: args.canCreate,
        canEdit: args.canEdit,
        canDelete: args.canDelete,
        updatedBy: caller._id,
      });
    } else {
      await ctx.db.insert("accessRules", { ...args, updatedBy: caller._id });
    }
  },
});

export const bulkUpdateAccessRules = mutation({
  args: {
    role: v.union(v.literal("manager"), v.literal("staff")),
    rules: v.array(
      v.object({
        module: v.string(),
        canView: v.boolean(),
        canCreate: v.boolean(),
        canEdit: v.boolean(),
        canDelete: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role !== "owner") {
      throw new ConvexError({ message: "Only owners can manage access rules", code: "FORBIDDEN" });
    }

    for (const rule of args.rules) {
      const existing = await ctx.db
        .query("accessRules")
        .withIndex("by_role_and_module", (q) => q.eq("role", args.role).eq("module", rule.module))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          canView: rule.canView,
          canCreate: rule.canCreate,
          canEdit: rule.canEdit,
          canDelete: rule.canDelete,
          updatedBy: caller._id,
        });
      } else {
        await ctx.db.insert("accessRules", { role: args.role, ...rule, updatedBy: caller._id });
      }
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "users:bulkUpdateAccessRules",
      resourceType: "accessRules",
      resourceId: args.role,
      action: `Updated access rules for ${args.role}`,
      afterValue: JSON.stringify(args.rules),
    });
  },
});
