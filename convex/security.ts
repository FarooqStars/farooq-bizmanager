import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ─── Module Permissions Definition ───────────────────────────────

export const MODULES = [
  "dashboard", "sales", "products", "warehouses", "inventory",
  "vendors", "accounting", "banking", "invoicing", "purchasing",
  "advanced_inventory", "pricing", "communications", "projects",
  "vehicles", "assets", "orders", "payroll", "monitoring",
  "data", "users", "audit", "reports", "settings",
] as const;

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete", "export", "approve"] as const;

// Generate all possible permissions (module.action)
export function getAllPermissions(): string[] {
  const perms: string[] = [];
  for (const mod of MODULES) {
    for (const action of PERMISSION_ACTIONS) {
      perms.push(`${mod}.${action}`);
    }
  }
  return perms;
}

// System role permission templates
const OWNER_PERMISSIONS = getAllPermissions();
const MANAGER_PERMISSIONS = getAllPermissions().filter((p) => !p.includes("settings.delete"));
const STAFF_PERMISSIONS = [
  "dashboard.view", "sales.view", "sales.create",
  "products.view", "warehouses.view", "inventory.view",
  "vendors.view", "vehicles.view", "assets.view",
  "orders.view", "orders.create",
];

export function getSystemRolePermissions(role: string): string[] {
  switch (role) {
    case "owner": return OWNER_PERMISSIONS;
    case "manager": return MANAGER_PERMISSIONS;
    case "staff": return STAFF_PERMISSIONS;
    default: return STAFF_PERMISSIONS;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  if (user.role !== "owner") throw new ConvexError({ message: "Owner access required", code: "FORBIDDEN" });
  return user;
}

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Custom Roles CRUD ───────────────────────────────────────────

export const listRoles = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("customRoles").collect();
  },
});

export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwner(ctx);

    // Check name uniqueness
    const existing = await ctx.db
      .query("customRoles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) throw new ConvexError({ message: "Role name already exists", code: "CONFLICT" });

    return await ctx.db.insert("customRoles", {
      name: args.name,
      description: args.description,
      permissions: args.permissions,
      isSystem: false,
      createdBy: user._id,
    });
  },
});

export const updateRole = mutation({
  args: {
    roleId: v.id("customRoles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new ConvexError({ message: "Role not found", code: "NOT_FOUND" });
    if (role.isSystem) throw new ConvexError({ message: "Cannot edit system roles", code: "FORBIDDEN" });

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.permissions !== undefined) updates.permissions = args.permissions;

    await ctx.db.patch(args.roleId, updates);
  },
});

export const deleteRole = mutation({
  args: { roleId: v.id("customRoles") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new ConvexError({ message: "Role not found", code: "NOT_FOUND" });
    if (role.isSystem) throw new ConvexError({ message: "Cannot delete system roles", code: "FORBIDDEN" });

    await ctx.db.delete(args.roleId);
  },
});

export const seedSystemRoles = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);

    const systemRoles = [
      { name: "Owner", permissions: OWNER_PERMISSIONS, description: "Full access to all modules" },
      { name: "Manager", permissions: MANAGER_PERMISSIONS, description: "Access to all modules except critical settings" },
      { name: "Staff", permissions: STAFF_PERMISSIONS, description: "Basic access to sales and inventory" },
      { name: "Accountant", permissions: [
        "dashboard.view", "accounting.view", "accounting.create", "accounting.edit",
        "banking.view", "banking.create", "banking.edit",
        "invoicing.view", "invoicing.create", "invoicing.edit", "invoicing.approve",
        "reports.view", "reports.export",
      ], description: "Access to financial modules only" },
      { name: "Sales Rep", permissions: [
        "dashboard.view", "sales.view", "sales.create", "sales.edit",
        "products.view", "customers.view", "customers.create",
        "invoicing.view", "invoicing.create",
        "orders.view", "orders.create", "orders.edit",
      ], description: "Access to sales and customer modules" },
      { name: "Warehouse Manager", permissions: [
        "dashboard.view", "products.view", "warehouses.view", "warehouses.create", "warehouses.edit",
        "inventory.view", "inventory.create", "inventory.edit",
        "advanced_inventory.view", "advanced_inventory.create", "advanced_inventory.edit",
        "purchasing.view",
      ], description: "Access to inventory and warehouse modules" },
      { name: "HR Admin", permissions: [
        "dashboard.view", "payroll.view", "payroll.create", "payroll.edit", "payroll.approve",
        "users.view", "projects.view", "projects.create",
      ], description: "Access to HR and payroll modules" },
      { name: "Viewer", permissions: MODULES.map((m) => `${m}.view`), description: "Read-only access to all modules" },
    ];

    for (const role of systemRoles) {
      const existing = await ctx.db
        .query("customRoles")
        .withIndex("by_name", (q) => q.eq("name", role.name))
        .first();
      if (!existing) {
        await ctx.db.insert("customRoles", {
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          isSystem: true,
        });
      }
    }
  },
});

// ─── Get permissions for display ─────────────────────────────────

export const getPermissionMatrix = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return {
      modules: MODULES as unknown as string[],
      actions: PERMISSION_ACTIONS as unknown as string[],
    };
  },
});

// ─── Access Log ──────────────────────────────────────────────────

export const logAccess = mutation({
  args: {
    action: v.string(),
    module: v.string(),
    resourceId: v.optional(v.string()),
    success: v.boolean(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return;

    await ctx.db.insert("accessLog", {
      userId: user._id,
      action: args.action,
      module: args.module,
      resourceId: args.resourceId,
      timestamp: new Date().toISOString(),
      success: args.success,
      details: args.details,
    });
  },
});

export const listAccessLog = query({
  args: {
    limit: v.optional(v.number()),
    moduleFilter: v.optional(v.string()),
    userFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const limit = args.limit ?? 100;
    let entries = await ctx.db
      .query("accessLog")
      .order("desc")
      .take(500);

    if (args.moduleFilter && args.moduleFilter !== "all") {
      entries = entries.filter((e) => e.module === args.moduleFilter);
    }
    if (args.userFilter && args.userFilter !== "all") {
      entries = entries.filter((e) => e.userId === args.userFilter);
    }

    const limited = entries.slice(0, limit);

    // Enrich
    const enriched = await Promise.all(
      limited.map(async (entry) => {
        const u = await ctx.db.get(entry.userId);
        return { ...entry, userName: u?.name ?? "Unknown", userRole: u?.role ?? "staff" };
      })
    );
    return enriched;
  },
});

export const getAccessStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const entries = await ctx.db.query("accessLog").order("desc").take(500);
    const today = new Date().toISOString().split("T")[0];
    const todayEntries = entries.filter((e) => e.timestamp.startsWith(today));
    const failedEntries = entries.filter((e) => !e.success);

    // Group by module
    const moduleCounts: Record<string, number> = {};
    for (const e of entries) {
      moduleCounts[e.module] = (moduleCounts[e.module] ?? 0) + 1;
    }

    // Active users today
    const activeUsers = new Set(todayEntries.map((e) => e.userId));

    return {
      totalAccesses: entries.length,
      todayAccesses: todayEntries.length,
      failedAttempts: failedEntries.length,
      activeUsersToday: activeUsers.size,
      moduleCounts,
    };
  },
});
