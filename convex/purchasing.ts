import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { nextNumber } from "./lib/docNumber.ts";
import { postBillCreation, todayIso } from "./lib/payablesPosting.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
  db: unknown;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

const PAYMENT_TERMS_VALIDATOR = v.optional(
  v.union(
    v.literal("net_15"),
    v.literal("net_30"),
    v.literal("net_60"),
    v.literal("net_90"),
    v.literal("due_on_receipt"),
    v.literal("prepaid"),
  ),
);

// ─── Purchase Order Queries ─────────────────────────────────

export const listPurchaseOrders = query({
  args: { status: v.optional(v.string()), vendorId: v.optional(v.id("vendors")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let orders: Doc<"purchaseOrders">[];

    if (args.status) {
      orders = await ctx.db
        .query("purchaseOrders")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            args.status as "draft" | "sent" | "partially_received" | "received" | "cancelled",
          ),
        )
        .collect();
    } else if (args.vendorId) {
      orders = await ctx.db
        .query("purchaseOrders")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!))
        .collect();
    } else {
      orders = await ctx.db.query("purchaseOrders").order("desc").collect();
    }

    if (args.status && args.vendorId) {
      orders = orders.filter((o) => o.vendorId === args.vendorId);
    }

    // Enrich with vendor name
    const enriched = await Promise.all(
      orders.map(async (po) => {
        const vendor = await ctx.db.get(po.vendorId);
        return { ...po, vendorName: vendor?.name ?? "Unknown" };
      }),
    );

    return enriched;
  },
});

export const getPurchaseOrder = query({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const po = await ctx.db.get(args.id);
    if (!po) return null;

    const vendor = await ctx.db.get(po.vendorId);
    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.id))
      .collect();

    return {
      ...po,
      vendorName: vendor?.name ?? "Unknown",
      vendorEmail: vendor?.email,
      vendorPhone: vendor?.phone,
      vendorAddress: vendor?.address,
      items,
    };
  },
});

// ─── Purchase Order Mutations ───────────────────────────────

export const createPurchaseOrder = mutation({
  args: {
    vendorId: v.id("vendors"),
    date: v.string(),
    expectedDelivery: v.optional(v.string()),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    shippingCost: v.optional(v.number()),
    paymentTerms: PAYMENT_TERMS_VALIDATOR,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"purchaseOrders">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });

    if (args.items.length === 0) {
      throw new ConvexError({
        message: "Purchase order must have at least one item",
        code: "BAD_REQUEST",
      });
    }

    // Generate PO number
    const allPOs = await ctx.db.query("purchaseOrders").collect();
    const poNumber = nextNumber(allPOs, (p) => p.poNumber, "PO-", 5);

    // Calculate totals
    const subtotal = args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = args.discount ?? 0;
    const afterDiscount = subtotal - discountAmount;
    const taxRate = args.taxRate ?? 0;
    const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
    const shipping = args.shippingCost ?? 0;
    const totalAmount = Math.round((afterDiscount + taxAmount + shipping) * 100) / 100;

    const poId = await ctx.db.insert("purchaseOrders", {
      poNumber,
      vendorId: args.vendorId,
      date: args.date,
      expectedDelivery: args.expectedDelivery,
      status: "draft",
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate: args.taxRate,
      taxAmount,
      discount: args.discount,
      totalAmount,
      shippingCost: args.shippingCost,
      paymentTerms: args.paymentTerms,
      notes: args.notes,
      createdBy: user._id,
    });

    // Insert PO items
    for (const item of args.items) {
      await ctx.db.insert("purchaseOrderItems", {
        purchaseOrderId: poId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        receivedQuantity: 0,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      });
    }

    return poId;
  },
});

export const updatePurchaseOrderStatus = mutation({
  args: {
    id: v.id("purchaseOrders"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("partially_received"),
      v.literal("received"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const po = await ctx.db.get(args.id);
    if (!po) throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const approvePurchaseOrder = mutation({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    if (user.role === "staff") {
      throw new ConvexError({
        message: "Only managers and owners can approve POs",
        code: "FORBIDDEN",
      });
    }

    const po = await ctx.db.get(args.id);
    if (!po) throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });

    if (po.status !== "draft") {
      throw new ConvexError({
        message: "Only draft POs can be approved and sent",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.patch(args.id, {
      status: "sent",
      approvedBy: user._id,
      approvedAt: new Date().toISOString(),
    });
  },
});

export const receiveItems = mutation({
  args: {
    purchaseOrderId: v.id("purchaseOrders"),
    items: v.array(v.object({ itemId: v.id("purchaseOrderItems"), receivedQuantity: v.number() })),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });

    if (po.status === "cancelled" || po.status === "draft") {
      throw new ConvexError({ message: "Cannot receive items on this PO", code: "BAD_REQUEST" });
    }

    // Update received quantities
    for (const { itemId, receivedQuantity } of args.items) {
      const item = await ctx.db.get(itemId);
      if (!item) continue;
      if (receivedQuantity > item.quantity) {
        throw new ConvexError({
          message: `Cannot receive more than ordered for "${item.description}"`,
          code: "BAD_REQUEST",
        });
      }
      await ctx.db.patch(itemId, { receivedQuantity });
    }

    // Check if fully received
    const allItems = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .collect();

    const fullyReceived = allItems.every((item) => {
      const update = args.items.find((u) => u.itemId === item._id);
      const qty = update ? update.receivedQuantity : item.receivedQuantity;
      return qty >= item.quantity;
    });

    const partiallyReceived = allItems.some((item) => {
      const update = args.items.find((u) => u.itemId === item._id);
      const qty = update ? update.receivedQuantity : item.receivedQuantity;
      return qty > 0;
    });

    if (fullyReceived) {
      await ctx.db.patch(args.purchaseOrderId, { status: "received" });
    } else if (partiallyReceived) {
      await ctx.db.patch(args.purchaseOrderId, { status: "partially_received" });
    }
  },
});

// Convert PO to Bill
export const convertToBill = mutation({
  args: { purchaseOrderId: v.id("purchaseOrders") },
  handler: async (ctx, args): Promise<Id<"bills">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });

    if (po.linkedBillId) {
      throw new ConvexError({ message: "This PO already has a linked bill", code: "CONFLICT" });
    }

    if (po.status !== "received" && po.status !== "partially_received") {
      throw new ConvexError({
        message: "PO must be at least partially received to create a bill",
        code: "BAD_REQUEST",
      });
    }

    // Calculate due date based on payment terms
    const today = new Date();
    let dueDate = today.toISOString().split("T")[0];
    if (po.paymentTerms === "net_15") {
      today.setDate(today.getDate() + 15);
      dueDate = today.toISOString().split("T")[0];
    } else if (po.paymentTerms === "net_30") {
      today.setDate(today.getDate() + 30);
      dueDate = today.toISOString().split("T")[0];
    } else if (po.paymentTerms === "net_60") {
      today.setDate(today.getDate() + 60);
      dueDate = today.toISOString().split("T")[0];
    } else if (po.paymentTerms === "net_90") {
      today.setDate(today.getDate() + 90);
      dueDate = today.toISOString().split("T")[0];
    }

    // The bill is issued today; it posts today, not on its due date.
    const billDate = todayIso();
    await enforcePostingDate(ctx, billDate);

    const billId = await ctx.db.insert("bills", {
      vendorId: po.vendorId,
      title: `Bill from ${po.poNumber}`,
      amount: po.totalAmount,
      billDate,
      dueDate,
      status: "unpaid",
      notes: `Auto-generated from Purchase Order ${po.poNumber}`,
    });

    await ctx.db.patch(args.purchaseOrderId, { linkedBillId: billId });

    // Post the balanced entry: Dr Expense / Cr Accounts Payable.
    await postBillCreation(ctx, {
      billId,
      amount: po.totalAmount,
      date: billDate,
      description: `Bill from ${po.poNumber}`,
      createdBy: user._id,
    });

    return billId;
  },
});

// ─── Vendor Credits ─────────────────────────────────────────

export const listVendorCredits = query({
  args: { vendorId: v.optional(v.id("vendors")), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let credits: Doc<"vendorCredits">[];

    if (args.vendorId) {
      credits = await ctx.db
        .query("vendorCredits")
        .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId!))
        .collect();
    } else if (args.status) {
      credits = await ctx.db
        .query("vendorCredits")
        .withIndex("by_status", (q) => q.eq("status", args.status as "active" | "applied" | "void"))
        .collect();
    } else {
      credits = await ctx.db.query("vendorCredits").order("desc").collect();
    }

    const enriched = await Promise.all(
      credits.map(async (c) => {
        const vendor = await ctx.db.get(c.vendorId);
        return { ...c, vendorName: vendor?.name ?? "Unknown" };
      }),
    );

    return enriched;
  },
});

export const createVendorCredit = mutation({
  args: {
    vendorId: v.id("vendors"),
    date: v.string(),
    amount: v.number(),
    reason: v.string(),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
  },
  handler: async (ctx, args): Promise<Id<"vendorCredits">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    }

    const allCredits = await ctx.db.query("vendorCredits").collect();
    const creditNumber = nextNumber(allCredits, (c) => c.creditNumber, "VC-", 5);

    return await ctx.db.insert("vendorCredits", {
      creditNumber,
      vendorId: args.vendorId,
      date: args.date,
      amount: args.amount,
      reason: args.reason,
      status: "active",
      purchaseOrderId: args.purchaseOrderId,
      createdBy: user._id,
    });
  },
});

export const voidVendorCredit = mutation({
  args: { id: v.id("vendorCredits") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const credit = await ctx.db.get(args.id);
    if (!credit) throw new ConvexError({ message: "Vendor credit not found", code: "NOT_FOUND" });
    if (credit.status === "void") {
      throw new ConvexError({ message: "Already void", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.id, { status: "void" });
  },
});

// ─── AP Summary ─────────────────────────────────────────────

export const getAPSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const [pos, bills, vendorCredits] = await Promise.all([
      ctx.db.query("purchaseOrders").collect(),
      ctx.db.query("bills").collect(),
      ctx.db.query("vendorCredits").collect(),
    ]);

    const openPOs = pos.filter((p) => p.status !== "cancelled" && p.status !== "received").length;
    const totalPOValue = pos
      .filter((p) => p.status !== "cancelled")
      .reduce((sum, p) => sum + p.totalAmount, 0);
    const unpaidBills = bills.filter((b) => b.status === "unpaid" || b.status === "overdue");
    const unpaidTotal = unpaidBills.reduce((sum, b) => sum + b.amount, 0);
    const activeCredits = vendorCredits.filter((c) => c.status === "active");
    const creditTotal = activeCredits.reduce((sum, c) => sum + c.amount, 0);

    return {
      openPOs,
      totalPOValue: Math.round(totalPOValue * 100) / 100,
      unpaidBillCount: unpaidBills.length,
      unpaidBillTotal: Math.round(unpaidTotal * 100) / 100,
      activeCreditCount: activeCredits.length,
      activeCreditTotal: Math.round(creditTotal * 100) / 100,
    };
  },
});
