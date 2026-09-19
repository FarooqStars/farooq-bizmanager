import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./users.ts";
import type { Id } from "./_generated/dataModel.d.ts";
import { postGoodsReceipt, GOODS_RECEIPT_SOURCE, BILL_SOURCE } from "./lib/payablesPosting.ts";
import { reverseEntriesForSource } from "./lib/ledger.ts";
import type { Doc } from "./_generated/dataModel.d.ts";
import type { MutationCtx } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { logAudit } from "./lib/audit.ts";

/**
 * Remove a bill that was created by a goods receipt when that receipt is
 * cancelled or deleted. A receipt-created bill has no standalone bill-creation
 * posting (its AP was credited by the goods-receipt entry, which the caller has
 * already reversed), so leaving it would let it be paid against nothing. A bill
 * that was created independently (has a BILL_SOURCE posting) is left untouched.
 * Never touch a bill that already has payments.
 */
async function removeReceiptCreatedBill(
  ctx: MutationCtx,
  receipt: Doc<"goodsReceipts">,
  userId: Id<"users">,
): Promise<void> {
  if (receipt.type !== "with_bill" || !receipt.billId) return;
  const bill = await ctx.db.get(receipt.billId);
  if (!bill) return;
  if ((bill.amountPaid ?? 0) > 0) return; // paid — leave it, reverse payments first

  // If a standalone bill-creation entry exists, this is an externally-created
  // bill the receipt merely linked to. Leave it alone.
  const posted = await ctx.db
    .query("journalEntries")
    .withIndex("by_status", (q) => q.eq("status", "posted"))
    .collect();
  const hasStandaloneBillEntry = posted.some(
    (e) => e.sourceType === BILL_SOURCE && e.sourceId === receipt.billId,
  );
  if (hasStandaloneBillEntry) return;

  await ctx.db.delete(bill._id);
  await logAudit(ctx, {
    userId,
    mutationName: "goodsReceipts:removeReceiptCreatedBill",
    resourceType: "bill",
    resourceId: bill._id,
    action: "Removed bill created by goods receipt",
    details: `${bill.title} — $${bill.amount}`,
    beforeValue: JSON.stringify(bill),
    reason: "Goods receipt cancelled/deleted",
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }; db: unknown }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ── List Goods Receipts ───────────────────────────────────────────────────────

export const listGoodsReceipts = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const receipts = await ctx.db.query("goodsReceipts").order("desc").collect();
    const vendors = await ctx.db.query("vendors").collect();
    const vendorMap = new Map(vendors.map((v) => [v._id, v]));
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    return receipts.map((r) => ({
      ...r,
      vendor: vendorMap.get(r.vendorId) ?? null,
      receivedByUser: userMap.get(r.receivedBy) ?? null,
    }));
  },
});

// ── Get Receipt with Items ────────────────────────────────────────────────────

export const getReceiptWithItems = query({
  args: { receiptId: v.id("goodsReceipts") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new ConvexError({ message: "Receipt not found", code: "NOT_FOUND" });

    const items = await ctx.db
      .query("goodsReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const vendor = await ctx.db.get(receipt.vendorId);
    const receivedByUser = await ctx.db.get(receipt.receivedBy);

    return { ...receipt, items, vendor, receivedByUser };
  },
});

// ── Create Goods Receipt ──────────────────────────────────────────────────────

export const createGoodsReceipt = mutation({
  args: {
    vendorId: v.id("vendors"),
    date: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.union(v.literal("without_bill"), v.literal("with_bill")),
    billId: v.optional(v.id("bills")),
    // Bill details for creating a new bill
    billTitle: v.optional(v.string()),
    billAmount: v.optional(v.number()),
    billDueDate: v.optional(v.string()),
    // Items
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitCost: v.number(),
      warehouseId: v.id("warehouses"),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    if (args.items.length === 0) {
      throw new ConvexError({ message: "At least one item is required", code: "BAD_REQUEST" });
    }

    // If type is with_bill and no existing billId, create a new bill
    let billId: Id<"bills"> | undefined = args.billId;
    if (args.type === "with_bill" && !billId) {
      const totalAmount = args.billAmount ?? args.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      if (!args.billDueDate) throw new ConvexError({ message: "Bill due date is required", code: "BAD_REQUEST" });
      billId = await ctx.db.insert("bills", {
        vendorId: args.vendorId,
        title: args.billTitle ?? `GR-${Date.now()}`,
        amount: totalAmount,
        dueDate: args.billDueDate,
        status: "unpaid",
        notes: args.notes,
      });
      await logAudit(ctx, {
        userId: caller._id,
        mutationName: "goodsReceipts:createGoodsReceipt",
        resourceType: "bill",
        resourceId: billId,
        action: "Created bill from goods receipt",
        details: `$${totalAmount.toFixed(2)}`,
        afterValue: JSON.stringify({ title: args.billTitle ?? `GR-${Date.now()}`, amount: totalAmount, status: "unpaid" }),
      });
    }

    const totalCost = args.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    // Create receipt
    const receiptId = await ctx.db.insert("goodsReceipts", {
      vendorId: args.vendorId,
      date: args.date,
      referenceNumber: args.referenceNumber,
      notes: args.notes,
      type: args.type,
      billId,
      totalCost,
      status: "received",
      receivedBy: caller._id,
    });

    // Create receipt items and update inventory
    for (const item of args.items) {
      await ctx.db.insert("goodsReceiptItems", {
        receiptId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: item.unitCost,
        warehouseId: item.warehouseId,
      });

      // Update inventory
      const existing = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", item.productId).eq("warehouseId", item.warehouseId)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { quantity: existing.quantity + item.quantity });
      } else {
        await ctx.db.insert("inventory", {
          productId: item.productId,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
        });
      }

      // Record stock movement
      await ctx.db.insert("stockMovements", {
        productId: item.productId,
        warehouseId: item.warehouseId,
        type: "in",
        quantity: item.quantity,
        costPerUnit: item.unitCost,
        reason: "purchase",
        reference: `GR-${receiptId}`,
        notes: args.type === "without_bill" ? "Received without bill" : `Bill: ${billId ?? "linked"}`,
        recordedBy: caller._id,
        timestamp: new Date().toISOString(),
      });
    }

    // Activity log
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "goodsReceipts:createGoodsReceipt",
      resourceType: "goodsReceipt",
      resourceId: receiptId,
      action: args.type === "without_bill" ? "Received items without bill" : "Received items with bill",
      details: `${args.items.length} item(s), Total: $${totalCost.toFixed(2)}`,
      afterValue: JSON.stringify({ type: args.type, totalCost, itemCount: args.items.length, status: "received" }),
    });

    // Post the balanced ledger entry for the received inventory.
    //  - New bill created here:     Dr Inventory / Cr Accounts Payable.
    //  - Linked to a pre-existing bill (AP already credited at bill creation):
    //                               Dr Inventory / Cr Uncategorized Expense.
    //  - No bill:                   Dr Inventory / Cr Goods Received Not Invoiced.
    const createdNewBill = args.type === "with_bill" && !args.billId;
    const linkedExistingBill = args.type === "with_bill" && !!args.billId;
    await postGoodsReceipt(ctx, {
      receiptId,
      inventoryCost: totalCost,
      billAmount: createdNewBill
        ? (args.billAmount ?? totalCost)
        : undefined,
      linkedExistingBill,
      date: args.date,
      description:
        args.type === "without_bill"
          ? `Goods received (no bill) from ${args.items.length} item(s)`
          : `Goods received with bill`,
      createdBy: caller._id,
    });

    return receiptId;
  },
});

// ── Update Goods Receipt ──────────────────────────────────────────────────────

export const updateGoodsReceipt = mutation({
  args: {
    receiptId: v.id("goodsReceipts"),
    vendorId: v.optional(v.id("vendors")),
    date: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.union(v.literal("received"), v.literal("cancelled"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new ConvexError({ message: "Receipt not found", code: "NOT_FOUND" });

    const { receiptId, ...updates } = args;

    // Block cancelling a receipt dated in a closed/locked period
    if (updates.status === "cancelled" && receipt.status !== "cancelled") {
      await enforcePostingDate(ctx, receipt.date);
    }

    // If cancelling, reverse inventory
    if (updates.status === "cancelled" && receipt.status !== "cancelled") {
      const items = await ctx.db
        .query("goodsReceiptItems")
        .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
        .collect();

      for (const item of items) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_product_and_warehouse", (q) =>
            q.eq("productId", item.productId).eq("warehouseId", item.warehouseId)
          )
          .unique();

        if (inv) {
          const newQty = Math.max(0, inv.quantity - item.quantity);
          await ctx.db.patch(inv._id, { quantity: newQty });
        }

        // Record reversal movement
        await ctx.db.insert("stockMovements", {
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: "out",
          quantity: item.quantity,
          reason: "adjustment",
          reference: `GR-CANCEL-${receiptId}`,
          notes: "Goods receipt cancelled - inventory reversed",
          recordedBy: caller._id,
          timestamp: new Date().toISOString(),
        });
      }

      // Reverse the goods-receipt ledger posting (Dr Inventory / Cr AP|GRNI|Expense)
      // so the inventory valuation and liability unwind.
      await reverseEntriesForSource(ctx, GOODS_RECEIPT_SOURCE, receiptId, {
        date: new Date().toISOString().split("T")[0],
        createdBy: caller._id,
        description: `Cancel goods receipt`,
      });

      // If this receipt CREATED its own bill (type with_bill and no external
      // billId source), that bill's AP was credited by the receipt posting we just
      // reversed. Remove the now-dangling unpaid bill so it can't be paid twice.
      await removeReceiptCreatedBill(ctx, receipt, caller._id);
    }

    await ctx.db.patch(receiptId, updates);
    const receiptAfter = await ctx.db.get(receiptId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "goodsReceipts:updateGoodsReceipt",
      resourceType: "goodsReceipt",
      resourceId: receiptId,
      action: updates.status === "cancelled" ? "Cancelled goods receipt" : "Updated goods receipt",
      beforeValue: JSON.stringify(receipt),
      afterValue: receiptAfter ? JSON.stringify(receiptAfter) : undefined,
      reason: updates.status === "cancelled" ? "Goods receipt cancelled" : undefined,
    });
  },
});

// ── Delete Goods Receipt ──────────────────────────────────────────────────────

export const deleteGoodsReceipt = mutation({
  args: { receiptId: v.id("goodsReceipts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });

    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) throw new ConvexError({ message: "Receipt not found", code: "NOT_FOUND" });

    // Block deleting a receipt dated in a closed/locked period
    await enforcePostingDate(ctx, receipt.date);

    // Reverse inventory if receipt was active
    if (receipt.status !== "cancelled") {
      const items = await ctx.db
        .query("goodsReceiptItems")
        .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
        .collect();

      for (const item of items) {
        const inv = await ctx.db
          .query("inventory")
          .withIndex("by_product_and_warehouse", (q) =>
            q.eq("productId", item.productId).eq("warehouseId", item.warehouseId)
          )
          .unique();

        if (inv) {
          const newQty = Math.max(0, inv.quantity - item.quantity);
          await ctx.db.patch(inv._id, { quantity: newQty });
        }

        await ctx.db.insert("stockMovements", {
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: "out",
          quantity: item.quantity,
          reason: "adjustment",
          reference: `GR-DELETE-${args.receiptId}`,
          notes: "Goods receipt deleted - inventory reversed",
          recordedBy: caller._id,
          timestamp: new Date().toISOString(),
        });
      }

      // Reverse the goods-receipt ledger posting so inventory/AP/GRNI unwind.
      await reverseEntriesForSource(ctx, GOODS_RECEIPT_SOURCE, args.receiptId, {
        date: new Date().toISOString().split("T")[0],
        createdBy: caller._id,
        description: `Delete goods receipt`,
      });

      // Remove a dangling unpaid bill this receipt created.
      await removeReceiptCreatedBill(ctx, receipt, caller._id);
    }

    // Delete items
    const items = await ctx.db
      .query("goodsReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.receiptId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "goodsReceipts:deleteGoodsReceipt",
      resourceType: "goodsReceipt",
      resourceId: args.receiptId,
      action: "Deleted goods receipt",
      details: `Receipt total: $${receipt.totalCost.toFixed(2)}`,
      beforeValue: JSON.stringify(receipt),
      reason: "Goods receipt deleted by admin",
    });
  },
});
