import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

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

// ─── Assemblies (BOM) ────────────────────────────────────────

export const listAssemblies = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const assemblies = await ctx.db.query("assemblies").collect();

    const enriched = await Promise.all(
      assemblies.map(async (a) => {
        const outputProduct = await ctx.db.get(a.outputProductId);
        const components = await ctx.db
          .query("assemblyComponents")
          .withIndex("by_assembly", (q) => q.eq("assemblyId", a._id))
          .collect();

        const enrichedComponents = await Promise.all(
          components.map(async (c) => {
            const product = await ctx.db.get(c.componentProductId);
            return { ...c, productName: product?.name ?? "Deleted", productSku: product?.sku };
          })
        );

        // Calculate total material cost
        const materialCost = enrichedComponents.reduce((sum, c) => {
          const product = c.componentProductId ? undefined : undefined;
          return sum;
        }, 0);

        return {
          ...a,
          outputProductName: outputProduct?.name ?? "Deleted Product",
          outputProductSku: outputProduct?.sku,
          components: enrichedComponents,
          componentCount: components.length,
        };
      })
    );

    return enriched;
  },
});

export const getAssembly = query({
  args: { assemblyId: v.id("assemblies") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const assembly = await ctx.db.get(args.assemblyId);
    if (!assembly) throw new ConvexError({ message: "Assembly not found", code: "NOT_FOUND" });

    const outputProduct = await ctx.db.get(assembly.outputProductId);
    const components = await ctx.db
      .query("assemblyComponents")
      .withIndex("by_assembly", (q) => q.eq("assemblyId", args.assemblyId))
      .collect();

    const enrichedComponents = await Promise.all(
      components.map(async (c) => {
        const product = await ctx.db.get(c.componentProductId);
        // Get total available stock
        const inventoryRows = await ctx.db
          .query("inventory")
          .withIndex("by_product", (q) => q.eq("productId", c.componentProductId))
          .collect();
        const availableStock = inventoryRows.reduce((sum, row) => sum + row.quantity, 0);
        return {
          ...c,
          productName: product?.name ?? "Deleted",
          productSku: product?.sku,
          unitPrice: product?.unitPrice ?? 0,
          availableStock,
        };
      })
    );

    // Calculate costs
    const materialCost = enrichedComponents.reduce(
      (sum, c) => sum + c.unitPrice * c.quantityRequired, 0
    );
    const totalCost = materialCost + (assembly.laborCost ?? 0) + (assembly.overheadCost ?? 0);

    return {
      ...assembly,
      outputProductName: outputProduct?.name ?? "Deleted",
      outputProductSku: outputProduct?.sku,
      components: enrichedComponents,
      materialCost,
      totalCost,
    };
  },
});

export const createAssembly = mutation({
  args: {
    name: v.string(),
    sku: v.optional(v.string()),
    description: v.optional(v.string()),
    outputProductId: v.id("products"),
    outputQuantity: v.number(),
    laborCost: v.optional(v.number()),
    overheadCost: v.optional(v.number()),
    components: v.array(v.object({
      componentProductId: v.id("products"),
      quantityRequired: v.number(),
      isOptional: v.boolean(),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.outputQuantity <= 0) {
      throw new ConvexError({ message: "Output quantity must be positive", code: "BAD_REQUEST" });
    }

    const { components, ...assemblyData } = args;
    const assemblyId = await ctx.db.insert("assemblies", { ...assemblyData, isActive: true });

    for (const comp of components) {
      if (comp.quantityRequired <= 0) {
        throw new ConvexError({ message: "Component quantity must be positive", code: "BAD_REQUEST" });
      }
      await ctx.db.insert("assemblyComponents", { assemblyId, ...comp });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:createAssembly",
      resourceType: "assembly",
      resourceId: assemblyId,
      action: "assembly_order_created",
      afterValue: JSON.stringify({ name: args.name, outputProductId: args.outputProductId, componentCount: components.length }),
      details: args.name,
    });

    return assemblyId;
  },
});

export const updateAssembly = mutation({
  args: {
    assemblyId: v.id("assemblies"),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    description: v.optional(v.string()),
    outputQuantity: v.optional(v.number()),
    laborCost: v.optional(v.number()),
    overheadCost: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const existing = await ctx.db.get(args.assemblyId);
    const beforeValue = existing ? JSON.stringify(existing) : undefined;

    const { assemblyId, ...updates } = args;
    await ctx.db.patch(assemblyId, updates);

    const updated = await ctx.db.get(assemblyId);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:updateAssembly",
      resourceType: "assembly",
      resourceId: assemblyId,
      action: "assembly_order_updated",
      beforeValue,
      afterValue: JSON.stringify(updated),
    });
  },
});

export const addComponent = mutation({
  args: {
    assemblyId: v.id("assemblies"),
    componentProductId: v.id("products"),
    quantityRequired: v.number(),
    isOptional: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.quantityRequired <= 0) {
      throw new ConvexError({ message: "Quantity must be positive", code: "BAD_REQUEST" });
    }

    const componentId = await ctx.db.insert("assemblyComponents", args);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:addComponent",
      resourceType: "assembly",
      resourceId: args.assemblyId,
      action: "assembly_component_added",
      afterValue: JSON.stringify({ componentId, componentProductId: args.componentProductId, quantityRequired: args.quantityRequired }),
    });
  },
});

export const removeComponent = mutation({
  args: { componentId: v.id("assemblyComponents") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const component = await ctx.db.get(args.componentId);
    const beforeValue = component ? JSON.stringify(component) : undefined;

    await ctx.db.delete(args.componentId);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:removeComponent",
      resourceType: "assembly",
      resourceId: component?.assemblyId ?? args.componentId,
      action: "assembly_component_removed",
      beforeValue,
    });
  },
});

// ─── Assembly Orders (Work Orders) ──────────────────────────

export const listAssemblyOrders = query({
  args: { status: v.optional(v.union(v.literal("planned"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled"))) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const orders = args.status
      ? await ctx.db.query("assemblyOrders").withIndex("by_status", (q) => q.eq("status", args.status!)).order("desc").take(100)
      : await ctx.db.query("assemblyOrders").order("desc").take(100);

    const enriched = await Promise.all(
      orders.map(async (o) => {
        const assembly = await ctx.db.get(o.assemblyId);
        const warehouse = await ctx.db.get(o.warehouseId);
        const creator = await ctx.db.get(o.createdBy);
        return {
          ...o,
          assemblyName: assembly?.name ?? "Deleted",
          warehouseName: warehouse?.name ?? "Deleted",
          creatorName: creator?.name ?? "Unknown",
        };
      })
    );

    return enriched;
  },
});

export const createAssemblyOrder = mutation({
  args: {
    assemblyId: v.id("assemblies"),
    quantity: v.number(),
    warehouseId: v.id("warehouses"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.quantity <= 0) {
      throw new ConvexError({ message: "Quantity must be positive", code: "BAD_REQUEST" });
    }

    const assembly = await ctx.db.get(args.assemblyId);
    if (!assembly) throw new ConvexError({ message: "Assembly not found", code: "NOT_FOUND" });

    // Generate order number
    const allOrders = await ctx.db.query("assemblyOrders").order("desc").take(1);
    const lastNum = allOrders.length > 0
      ? parseInt(allOrders[0].orderNumber.replace("WO-", ""), 10)
      : 0;
    const orderNumber = `WO-${String(lastNum + 1).padStart(5, "0")}`;

    const orderId = await ctx.db.insert("assemblyOrders", {
      assemblyId: args.assemblyId,
      orderNumber,
      quantity: args.quantity,
      warehouseId: args.warehouseId,
      status: "planned",
      notes: args.notes,
      createdBy: user._id,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:createAssemblyOrder",
      resourceType: "assemblyOrder",
      resourceId: orderId,
      action: "assembly_order_created",
      afterValue: JSON.stringify({ orderNumber, assemblyName: assembly.name, quantity: args.quantity }),
      details: `${orderNumber} - ${assembly.name} x${args.quantity}`,
    });

    return orderId;
  },
});

export const startAssemblyOrder = mutation({
  args: { orderId: v.id("assemblyOrders") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    if (order.status !== "planned") {
      throw new ConvexError({ message: "Can only start planned orders", code: "BAD_REQUEST" });
    }

    // Check component availability
    const assembly = await ctx.db.get(order.assemblyId);
    if (!assembly) throw new ConvexError({ message: "Assembly not found", code: "NOT_FOUND" });

    const components = await ctx.db
      .query("assemblyComponents")
      .withIndex("by_assembly", (q) => q.eq("assemblyId", order.assemblyId))
      .collect();

    const shortages: string[] = [];
    for (const comp of components) {
      if (comp.isOptional) continue;
      const invRow = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", comp.componentProductId).eq("warehouseId", order.warehouseId)
        )
        .unique();
      const available = invRow?.quantity ?? 0;
      const needed = comp.quantityRequired * order.quantity;
      if (available < needed) {
        const product = await ctx.db.get(comp.componentProductId);
        shortages.push(`${product?.name ?? "Unknown"}: need ${needed}, have ${available}`);
      }
    }

    if (shortages.length > 0) {
      throw new ConvexError({
        message: `Component shortages: ${shortages.join("; ")}`,
        code: "BAD_REQUEST",
      });
    }

    // Consume components from inventory
    for (const comp of components) {
      const needed = comp.quantityRequired * order.quantity;
      const invRow = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", comp.componentProductId).eq("warehouseId", order.warehouseId)
        )
        .unique();

      if (invRow) {
        await ctx.db.patch(invRow._id, { quantity: invRow.quantity - needed });
      }

      // Record stock movement
      await ctx.db.insert("stockMovements", {
        productId: comp.componentProductId,
        warehouseId: order.warehouseId,
        type: "out",
        quantity: needed,
        reason: "adjustment",
        reference: order.orderNumber,
        notes: `Consumed for assembly: ${assembly.name}`,
        recordedBy: user._id,
        timestamp: new Date().toISOString(),
      });
    }

    await ctx.db.patch(args.orderId, {
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:startAssemblyOrder",
      resourceType: "assemblyOrder",
      resourceId: args.orderId,
      action: "assembly_order_started",
      details: order.orderNumber,
    });
  },
});

export const completeAssemblyOrder = mutation({
  args: { orderId: v.id("assemblyOrders") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    if (order.status !== "in_progress") {
      throw new ConvexError({ message: "Can only complete in-progress orders", code: "BAD_REQUEST" });
    }

    const assembly = await ctx.db.get(order.assemblyId);
    if (!assembly) throw new ConvexError({ message: "Assembly not found", code: "NOT_FOUND" });

    // Add finished goods to inventory
    const outputQty = assembly.outputQuantity * order.quantity;
    const invRow = await ctx.db
      .query("inventory")
      .withIndex("by_product_and_warehouse", (q) =>
        q.eq("productId", assembly.outputProductId).eq("warehouseId", order.warehouseId)
      )
      .unique();

    if (invRow) {
      await ctx.db.patch(invRow._id, { quantity: invRow.quantity + outputQty });
    } else {
      await ctx.db.insert("inventory", {
        productId: assembly.outputProductId,
        warehouseId: order.warehouseId,
        quantity: outputQty,
      });
    }

    // Record stock movement for finished product
    await ctx.db.insert("stockMovements", {
      productId: assembly.outputProductId,
      warehouseId: order.warehouseId,
      type: "in",
      quantity: outputQty,
      reason: "adjustment",
      reference: order.orderNumber,
      notes: `Assembly completed: ${assembly.name}`,
      recordedBy: user._id,
      timestamp: new Date().toISOString(),
    });

    await ctx.db.patch(args.orderId, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:completeAssemblyOrder",
      resourceType: "assemblyOrder",
      resourceId: args.orderId,
      action: "assembly_order_completed",
      details: `${order.orderNumber} - produced ${outputQty} units`,
    });
  },
});

export const cancelAssemblyOrder = mutation({
  args: { orderId: v.id("assemblyOrders") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    if (order.status === "completed" || order.status === "cancelled") {
      throw new ConvexError({ message: "Cannot cancel completed or already cancelled orders", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(args.orderId, { status: "cancelled" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assembly:cancelAssemblyOrder",
      resourceType: "assemblyOrder",
      resourceId: args.orderId,
      action: "assembly_order_cancelled",
      details: order.orderNumber,
    });
  },
});

// ─── Component Shortage Check ───────────────────────────────

export const checkShortages = query({
  args: { assemblyId: v.id("assemblies"), quantity: v.number(), warehouseId: v.id("warehouses") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const components = await ctx.db
      .query("assemblyComponents")
      .withIndex("by_assembly", (q) => q.eq("assemblyId", args.assemblyId))
      .collect();

    const shortages = await Promise.all(
      components.map(async (comp) => {
        const invRow = await ctx.db
          .query("inventory")
          .withIndex("by_product_and_warehouse", (q) =>
            q.eq("productId", comp.componentProductId).eq("warehouseId", args.warehouseId)
          )
          .unique();
        const available = invRow?.quantity ?? 0;
        const needed = comp.quantityRequired * args.quantity;
        const product = await ctx.db.get(comp.componentProductId);
        return {
          componentId: comp._id,
          productName: product?.name ?? "Unknown",
          needed,
          available,
          shortage: Math.max(0, needed - available),
          isOptional: comp.isOptional,
        };
      })
    );

    return shortages;
  },
});
