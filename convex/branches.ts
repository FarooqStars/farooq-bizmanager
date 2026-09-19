import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { nextNumber } from "./lib/docNumber.ts";

// ─── Queries ────────────────────────────────────────────────

export const listBranches = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const all = await ctx.db.query("branches").collect();
    if (args.includeInactive) return all;
    return all.filter((b) => b.isActive);
  },
});

export const getBranch = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const branch = await ctx.db.get(args.branchId);
    if (!branch) {
      throw new ConvexError({ message: "Branch not found", code: "NOT_FOUND" });
    }
    return branch;
  },
});

export const getBranchStats = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const warehouses = await ctx.db
      .query("warehouses")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();

    const warehouseCount = warehouses.filter((w) => w.isActive).length;

    // Count employees in this branch
    const employees = await ctx.db.query("employees").collect();
    const branchEmployees = employees.filter((e) => e.branchId === args.branchId && e.isActive);
    const employeeCount = branchEmployees.length;

    // Count inventory items across branch warehouses
    let totalInventoryItems = 0;
    for (const wh of warehouses) {
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_warehouse", (q) => q.eq("warehouseId", wh._id))
        .collect();
      totalInventoryItems += inv.reduce((sum, item) => sum + item.quantity, 0);
    }

    return { warehouseCount, employeeCount, totalInventoryItems };
  },
});

export const getBranchReport = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const branches = await ctx.db
      .query("branches")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const report = [];
    for (const branch of branches) {
      const warehouses = await ctx.db
        .query("warehouses")
        .withIndex("by_branch", (q) => q.eq("branchId", branch._id))
        .collect();

      const warehouseCount = warehouses.filter((w) => w.isActive).length;

      const employees = await ctx.db.query("employees").collect();
      const branchEmployees = employees.filter((e) => e.branchId === branch._id && e.isActive);

      let totalStock = 0;
      for (const wh of warehouses) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_warehouse", (q) => q.eq("warehouseId", wh._id))
          .collect();
        totalStock += inv.reduce((sum, item) => sum + item.quantity, 0);
      }

      report.push({ ...branch, warehouseCount, employeeCount: branchEmployees.length, totalStock });
    }

    return report;
  },
});

// ─── Mutations ──────────────────────────────────────────────

export const createBranch = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    isHeadquarters: v.boolean(),
    taxRegistrationNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
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
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({
        message: "Only owners and managers can create branches",
        code: "FORBIDDEN",
      });
    }

    // Check code uniqueness
    const existing = await ctx.db
      .query("branches")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) {
      throw new ConvexError({ message: "Branch code already exists", code: "CONFLICT" });
    }

    // If this is HQ, unset any existing HQ
    if (args.isHeadquarters) {
      const allBranches = await ctx.db.query("branches").collect();
      for (const b of allBranches) {
        if (b.isHeadquarters) {
          await ctx.db.patch(b._id, { isHeadquarters: false });
        }
      }
    }

    return await ctx.db.insert("branches", { ...args, isActive: true, createdBy: user._id });
  },
});

export const updateBranch = mutation({
  args: {
    branchId: v.id("branches"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    isHeadquarters: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    taxRegistrationNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
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
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({
        message: "Only owners and managers can update branches",
        code: "FORBIDDEN",
      });
    }

    const { branchId, ...updates } = args;
    const branch = await ctx.db.get(branchId);
    if (!branch) {
      throw new ConvexError({ message: "Branch not found", code: "NOT_FOUND" });
    }

    // Check code uniqueness if changed
    if (updates.code && updates.code !== branch.code) {
      const newCode = updates.code;
      const existing = await ctx.db
        .query("branches")
        .withIndex("by_code", (q) => q.eq("code", newCode))
        .first();
      if (existing) {
        throw new ConvexError({ message: "Branch code already exists", code: "CONFLICT" });
      }
    }

    // If making this HQ, unset others
    if (updates.isHeadquarters) {
      const allBranches = await ctx.db.query("branches").collect();
      for (const b of allBranches) {
        if (b.isHeadquarters && b._id !== branchId) {
          await ctx.db.patch(b._id, { isHeadquarters: false });
        }
      }
    }

    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }
    await ctx.db.patch(branchId, cleanUpdates);
  },
});

export const deleteBranch = mutation({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can delete branches", code: "FORBIDDEN" });
    }

    // Check if branch has assigned warehouses
    const warehouses = await ctx.db
      .query("warehouses")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .first();
    if (warehouses) {
      throw new ConvexError({
        message: "Cannot delete branch with assigned warehouses. Reassign them first.",
        code: "CONFLICT",
      });
    }

    await ctx.db.delete(args.branchId);
  },
});

// ─── Branch Transfers ────────────────────────────────────────

export const listTransfers = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    let transfers;
    if (args.branchId) {
      const branchId = args.branchId;
      const outgoing = await ctx.db
        .query("branchTransfers")
        .withIndex("by_from_branch", (q) => q.eq("fromBranchId", branchId))
        .collect();
      const incoming = await ctx.db
        .query("branchTransfers")
        .withIndex("by_to_branch", (q) => q.eq("toBranchId", branchId))
        .collect();
      const combined = [...outgoing, ...incoming];
      // Deduplicate
      const seen = new Set<string>();
      transfers = combined.filter((t) => {
        if (seen.has(t._id)) return false;
        seen.add(t._id);
        return true;
      });
    } else {
      transfers = await ctx.db.query("branchTransfers").collect();
    }

    // Enrich with branch names
    const enriched = await Promise.all(
      transfers.map(async (transfer) => {
        const fromBranch = await ctx.db.get(transfer.fromBranchId);
        const toBranch = await ctx.db.get(transfer.toBranchId);
        const fromWarehouse = await ctx.db.get(transfer.fromWarehouseId);
        const toWarehouse = await ctx.db.get(transfer.toWarehouseId);
        return {
          ...transfer,
          fromBranchName: fromBranch?.name ?? "Unknown",
          toBranchName: toBranch?.name ?? "Unknown",
          fromWarehouseName: fromWarehouse?.name ?? "Unknown",
          toWarehouseName: toWarehouse?.name ?? "Unknown",
        };
      }),
    );

    return enriched.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const getTransfer = query({
  args: { transferId: v.id("branchTransfers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ message: "Transfer not found", code: "NOT_FOUND" });
    }

    const fromBranch = await ctx.db.get(transfer.fromBranchId);
    const toBranch = await ctx.db.get(transfer.toBranchId);
    const fromWarehouse = await ctx.db.get(transfer.fromWarehouseId);
    const toWarehouse = await ctx.db.get(transfer.toWarehouseId);

    const items = await ctx.db
      .query("branchTransferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        return { ...item, productName: product?.name ?? "Unknown", sku: product?.sku };
      }),
    );

    return {
      ...transfer,
      fromBranchName: fromBranch?.name ?? "Unknown",
      toBranchName: toBranch?.name ?? "Unknown",
      fromWarehouseName: fromWarehouse?.name ?? "Unknown",
      toWarehouseName: toWarehouse?.name ?? "Unknown",
      items: enrichedItems,
    };
  },
});

export const createTransfer = mutation({
  args: {
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    fromWarehouseId: v.id("warehouses"),
    toWarehouseId: v.id("warehouses"),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
    notes: v.optional(v.string()),
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

    if (args.fromBranchId === args.toBranchId) {
      throw new ConvexError({ message: "Cannot transfer to the same branch", code: "BAD_REQUEST" });
    }

    // Generate transfer number
    const allTransfers = await ctx.db.query("branchTransfers").collect();
    const transferNumber = nextNumber(allTransfers, (t) => t.transferNumber, "BT-", 5);

    const transferId = await ctx.db.insert("branchTransfers", {
      transferNumber,
      fromBranchId: args.fromBranchId,
      toBranchId: args.toBranchId,
      fromWarehouseId: args.fromWarehouseId,
      toWarehouseId: args.toWarehouseId,
      status: "draft",
      notes: args.notes,
      createdBy: user._id,
    });

    for (const item of args.items) {
      await ctx.db.insert("branchTransferItems", {
        transferId,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes,
      });
    }

    return transferId;
  },
});

export const shipTransfer = mutation({
  args: { transferId: v.id("branchTransfers") },
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

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer || transfer.status !== "draft") {
      throw new ConvexError({
        message: "Transfer must be in draft status to ship",
        code: "BAD_REQUEST",
      });
    }

    // Deduct from source warehouse
    const items = await ctx.db
      .query("branchTransferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    for (const item of items) {
      const inv = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", item.productId).eq("warehouseId", transfer.fromWarehouseId),
        )
        .first();

      if (!inv || inv.quantity < item.quantity) {
        const product = await ctx.db.get(item.productId);
        throw new ConvexError({
          message: `Insufficient stock for ${product?.name ?? "product"} in source warehouse`,
          code: "BAD_REQUEST",
        });
      }

      await ctx.db.patch(inv._id, { quantity: inv.quantity - item.quantity });
    }

    await ctx.db.patch(args.transferId, {
      status: "in_transit",
      shippedAt: new Date().toISOString(),
    });
  },
});

export const receiveTransfer = mutation({
  args: { transferId: v.id("branchTransfers") },
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

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer || transfer.status !== "in_transit") {
      throw new ConvexError({
        message: "Transfer must be in transit to receive",
        code: "BAD_REQUEST",
      });
    }

    // Add to destination warehouse
    const items = await ctx.db
      .query("branchTransferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .collect();

    for (const item of items) {
      const existingInv = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", item.productId).eq("warehouseId", transfer.toWarehouseId),
        )
        .first();

      if (existingInv) {
        await ctx.db.patch(existingInv._id, { quantity: existingInv.quantity + item.quantity });
      } else {
        await ctx.db.insert("inventory", {
          productId: item.productId,
          warehouseId: transfer.toWarehouseId,
          quantity: item.quantity,
        });
      }

      // Update received quantity
      await ctx.db.patch(item._id, { receivedQuantity: item.quantity });
    }

    await ctx.db.patch(args.transferId, {
      status: "received",
      receivedAt: new Date().toISOString(),
      receivedBy: user._id,
    });
  },
});

export const cancelTransfer = mutation({
  args: { transferId: v.id("branchTransfers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) {
      throw new ConvexError({ message: "Transfer not found", code: "NOT_FOUND" });
    }

    if (transfer.status === "received") {
      throw new ConvexError({ message: "Cannot cancel a received transfer", code: "BAD_REQUEST" });
    }

    // If in transit, return stock to source
    if (transfer.status === "in_transit") {
      const items = await ctx.db
        .query("branchTransferItems")
        .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
        .collect();

      for (const item of items) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_product_and_warehouse", (q) =>
            q.eq("productId", item.productId).eq("warehouseId", transfer.fromWarehouseId),
          )
          .first();

        if (inv) {
          await ctx.db.patch(inv._id, { quantity: inv.quantity + item.quantity });
        } else {
          await ctx.db.insert("inventory", {
            productId: item.productId,
            warehouseId: transfer.fromWarehouseId,
            quantity: item.quantity,
          });
        }
      }
    }

    await ctx.db.patch(args.transferId, { status: "cancelled" });
  },
});

// ─── Assign Warehouse to Branch ─────────────────────────────

export const assignWarehouseToBranch = mutation({
  args: { warehouseId: v.id("warehouses"), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({
        message: "Only owners and managers can assign warehouses",
        code: "FORBIDDEN",
      });
    }

    await ctx.db.patch(args.warehouseId, { branchId: args.branchId });
  },
});

// ─── Assign Employee to Branch ──────────────────────────────

export const assignEmployeeToBranch = mutation({
  args: { employeeId: v.id("employees"), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({
        message: "Only owners and managers can assign employees",
        code: "FORBIDDEN",
      });
    }

    await ctx.db.patch(args.employeeId, { branchId: args.branchId });
  },
});
