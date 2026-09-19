import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { mutation, query } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { nextNumber } from "./lib/docNumber.ts";
import {
  RETURN_RESTOCK_SOURCE,
  RETURN_REFUND_SOURCE,
} from "./lib/sourceTypes.ts";
import { postBalancedEntry, getControlAccounts, round2 } from "./lib/ledger.ts";
import { weightedAvgCost, requireCashAccount } from "./lib/salesPosting.ts";
import { logAudit } from "./lib/audit.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Queries ─────────────────────────────────────────────────

export const listReturns = query({
  args: { status: v.optional(v.string()), customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let returns;
    if (args.status) {
      returns = await ctx.db
        .query("returns")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            args.status as
              | "pending"
              | "approved"
              | "received"
              | "restocked"
              | "refunded"
              | "rejected",
          ),
        )
        .collect();
    } else if (args.customerId) {
      returns = await ctx.db
        .query("returns")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    } else {
      returns = await ctx.db.query("returns").order("desc").collect();
    }

    const enriched = await Promise.all(
      returns.map(async (ret) => {
        const customer = await ctx.db.get(ret.customerId);
        const invoice = ret.invoiceId ? await ctx.db.get(ret.invoiceId) : null;
        return {
          ...ret,
          customerName: customer?.name ?? "Unknown",
          invoiceNumber: invoice?.invoiceNumber ?? "",
        };
      }),
    );
    return enriched;
  },
});

export const getReturn = query({
  args: { id: v.id("returns") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const ret = await ctx.db.get(args.id);
    if (!ret) return null;

    const customer = await ctx.db.get(ret.customerId);
    const invoice = ret.invoiceId ? await ctx.db.get(ret.invoiceId) : null;
    const items = await ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", args.id))
      .collect();

    // Enrich items with product names
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const product = item.productId ? await ctx.db.get(item.productId) : null;
        return { ...item, productName: product?.name ?? item.description };
      }),
    );

    return {
      ...ret,
      customerName: customer?.name ?? "Unknown",
      invoiceNumber: invoice?.invoiceNumber ?? "",
      items: enrichedItems,
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const createReturn = mutation({
  args: {
    customerId: v.id("customers"),
    invoiceId: v.optional(v.id("invoices")),
    date: v.string(),
    reason: v.string(),
    notes: v.optional(v.string()),
    restockingFeePercent: v.optional(v.number()),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
        condition: v.union(
          v.literal("new"),
          v.literal("like_new"),
          v.literal("damaged"),
          v.literal("defective"),
        ),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Id<"returns">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await enforcePostingDate(ctx, args.date);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    if (args.items.length === 0) {
      throw new ConvexError({ message: "Return must have at least one item", code: "BAD_REQUEST" });
    }

    // Generate return number
    const allReturns = await ctx.db.query("returns").collect();
    const returnNumber = nextNumber(allReturns, (r) => r.returnNumber, "RMA-", 5);

    // Calculate totals
    const totalAmount = args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const feePercent = args.restockingFeePercent ?? 0;
    const restockingFee = Math.round(totalAmount * (feePercent / 100) * 100) / 100;
    const refundAmount = Math.round((totalAmount - restockingFee) * 100) / 100;

    const returnId = await ctx.db.insert("returns", {
      returnNumber,
      customerId: args.customerId,
      invoiceId: args.invoiceId,
      date: args.date,
      status: "pending",
      reason: args.reason,
      notes: args.notes,
      totalAmount: Math.round(totalAmount * 100) / 100,
      refundAmount,
      restockingFee,
      createdBy: user._id,
    });

    for (const item of args.items) {
      await ctx.db.insert("returnItems", {
        returnId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
        restocked: false,
        condition: item.condition,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "returns:createReturn",
      resourceType: "return",
      resourceId: returnId,
      action: "return_created",
      afterValue: JSON.stringify({ returnId, returnNumber, customerId: args.customerId, totalAmount: Math.round(totalAmount * 100) / 100, refundAmount }),
      details: `Return ${returnNumber} created`,
    });

    return returnId;
  },
});

export const updateReturnStatus = mutation({
  args: {
    id: v.id("returns"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("received"),
      v.literal("restocked"),
      v.literal("refunded"),
      v.literal("rejected"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const ret = await ctx.db.get(args.id);
    if (!ret) throw new ConvexError({ message: "Return not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { status: args.status });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "returns:updateReturnStatus",
      resourceType: "return",
      resourceId: args.id,
      action: "return_status_updated",
      beforeValue: JSON.stringify(ret),
      afterValue: JSON.stringify({ ...ret, status: args.status }),
      details: `Return ${ret.returnNumber} status changed to ${args.status}`,
    });
  },
});

export const restockReturnItems = mutation({
  args: {
    returnId: v.id("returns"),
    warehouseId: v.id("warehouses"),
    itemIds: v.array(v.id("returnItems")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const ret = await ctx.db.get(args.returnId);
    if (!ret) throw new ConvexError({ message: "Return not found", code: "NOT_FOUND" });

    if (ret.status !== "received" && ret.status !== "approved") {
      throw new ConvexError({
        message: "Return must be received or approved before restocking",
        code: "BAD_REQUEST",
      });
    }

    const warehouse = await ctx.db.get(args.warehouseId);
    if (!warehouse) throw new ConvexError({ message: "Warehouse not found", code: "NOT_FOUND" });

    const control = await getControlAccounts(ctx);
    let restockCost = 0;

    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item || item.returnId !== args.returnId) continue;
      if (item.restocked) continue;

      // Only restock items in good condition
      if (item.condition === "damaged" || item.condition === "defective") continue;

      // Update inventory if product exists and record the movement + cost.
      if (item.productId) {
        const existing = await ctx.db
          .query("inventory")
          .withIndex("by_product_and_warehouse", (q) =>
            q.eq("productId", item.productId!).eq("warehouseId", args.warehouseId),
          )
          .unique();

        if (existing) {
          await ctx.db.patch(existing._id, { quantity: existing.quantity + item.quantity });
        } else {
          await ctx.db.insert("inventory", {
            productId: item.productId,
            warehouseId: args.warehouseId,
            quantity: item.quantity,
          });
        }

        const unitCost = await weightedAvgCost(ctx, item.productId);

        // Record the "in" stock movement at cost so inventory has an audit trail.
        await ctx.db.insert("stockMovements", {
          productId: item.productId,
          warehouseId: args.warehouseId,
          type: "in",
          quantity: item.quantity,
          costPerUnit: unitCost,
          reason: "return",
          reference: ret.returnNumber,
          notes: `Restocked from return ${ret.returnNumber}`,
          recordedBy: user._id,
          timestamp: new Date().toISOString(),
        });

        restockCost += unitCost * item.quantity;
      }

      await ctx.db.patch(itemId, { restocked: true, warehouseId: args.warehouseId });
    }

    // Post the inventory value back at cost: Dr Inventory / Cr COGS.
    restockCost = round2(restockCost);
    if (restockCost > 0) {
      await postBalancedEntry(ctx, {
        date: new Date().toISOString().split("T")[0],
        description: `Restock for return ${ret.returnNumber}`,
        createdBy: user._id,
        sourceType: RETURN_RESTOCK_SOURCE,
        sourceId: args.returnId,
        lines: [
          { accountId: control.inventory._id, debit: restockCost, description: "Restock returned goods" },
          { accountId: control.cogs._id, credit: restockCost, description: "Reverse cost of goods sold" },
        ],
      });
    }

    // Check if all items are restocked or non-restockable
    const allItems = await ctx.db
      .query("returnItems")
      .withIndex("by_return", (q) => q.eq("returnId", args.returnId))
      .collect();

    const allProcessed = allItems.every(
      (item) => item.restocked || item.condition === "damaged" || item.condition === "defective",
    );

    if (allProcessed) {
      await ctx.db.patch(args.returnId, { status: "restocked" });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "returns:restockReturnItems",
      resourceType: "return",
      resourceId: args.returnId,
      action: "return_items_restocked",
      afterValue: JSON.stringify({ returnId: args.returnId, itemIds: args.itemIds, warehouseId: args.warehouseId }),
      details: `Restocked ${args.itemIds.length} item(s) for return ${ret.returnNumber}`,
    });
  },
});

export const issueRefund = mutation({
  args: { returnId: v.id("returns") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const ret = await ctx.db.get(args.returnId);
    if (!ret) throw new ConvexError({ message: "Return not found", code: "NOT_FOUND" });

    if (ret.status === "refunded") {
      throw new ConvexError({ message: "Return already refunded", code: "BAD_REQUEST" });
    }
    if (ret.status === "rejected" || ret.status === "pending") {
      throw new ConvexError({
        message: "Return must be approved/received/restocked before refund",
        code: "BAD_REQUEST",
      });
    }

    // Create credit memo
    const allMemos = await ctx.db.query("creditMemos").collect();
    const memoNumber = nextNumber(allMemos, (m) => m.memoNumber, "CM-", 5);

    const creditMemoId = await ctx.db.insert("creditMemos", {
      memoNumber,
      customerId: ret.customerId,
      invoiceId: ret.invoiceId,
      date: new Date().toISOString().split("T")[0],
      amount: ret.refundAmount,
      reason: `Refund for return ${ret.returnNumber}: ${ret.reason}`,
      status: "active",
      createdBy: user._id,
    });

    await ctx.db.patch(args.returnId, { status: "refunded", creditMemoId });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "returns:issueRefund",
      resourceType: "return",
      resourceId: args.returnId,
      action: "return_refund_issued",
      beforeValue: JSON.stringify(ret),
      afterValue: JSON.stringify({ returnId: args.returnId, creditMemoId, refundAmount: ret.refundAmount }),
      details: `Refund issued for return ${ret.returnNumber} — credit memo created`,
    });

    return creditMemoId;
  },
});

// ─── Process Return Refund with Payment ─────────────────────

export const processReturnRefund = mutation({
  args: {
    returnId: v.id("returns"),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("check"),
      v.literal("credit_to_account"),
    ),
    accountId: v.id("accounts"),
    date: v.string(),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    autoRestock: v.boolean(),
    warehouseId: v.optional(v.id("warehouses")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await enforcePostingDate(ctx, args.date);

    const ret = await ctx.db.get(args.returnId);
    if (!ret) throw new ConvexError({ message: "Return not found", code: "NOT_FOUND" });

    if (ret.status === "refunded") {
      throw new ConvexError({ message: "Return already refunded", code: "BAD_REQUEST" });
    }
    if (ret.status === "rejected" || ret.status === "pending") {
      throw new ConvexError({
        message: "Return must be approved/received/restocked before refund",
        code: "BAD_REQUEST",
      });
    }

    const refundAmount = Math.round(ret.refundAmount * 100) / 100;
    const customer = await ctx.db.get(ret.customerId);
    const customerName = customer?.name ?? "Customer";
    const control = await getControlAccounts(ctx);

    // 1. Contra-revenue posting. Money out (cash/bank/check): Dr Sales Returns /
    //    Cr Cash-or-Bank. Credit-to-account: Dr Sales Returns / Cr AR.
    if (args.paymentMethod !== "credit_to_account") {
      const account = await requireCashAccount(ctx, args.accountId);

      const methodLabel =
        args.paymentMethod === "cash"
          ? "Cash"
          : args.paymentMethod === "bank_transfer"
            ? "Bank Transfer"
            : "Check";

      // Record debit transaction (money going out) for the bank audit trail.
      await ctx.db.insert("bankTransactions", {
        accountId: args.accountId,
        date: args.date,
        description: `Refund to ${customerName} (${ret.returnNumber}) via ${methodLabel}`,
        amount: refundAmount,
        type: "debit",
        reference: args.reference ?? ret.returnNumber,
        category: "Refund",
        isReconciled: false,
      });

      if (refundAmount > 0) {
        await postBalancedEntry(ctx, {
          date: args.date,
          description: `Refund for return ${ret.returnNumber}`,
          reference: args.reference ?? ret.returnNumber,
          createdBy: user._id,
          sourceType: RETURN_REFUND_SOURCE,
          sourceId: args.returnId,
          lines: [
            { accountId: control.salesReturns._id, debit: refundAmount, description: "Sales return" },
            { accountId: account._id, credit: refundAmount, description: "Refund paid" },
          ],
        });
      }
    } else if (refundAmount > 0) {
      // Credit to account: reduce the receivable via a balanced contra posting.
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Credit for return ${ret.returnNumber}`,
        reference: args.reference ?? ret.returnNumber,
        createdBy: user._id,
        sourceType: RETURN_REFUND_SOURCE,
        sourceId: args.returnId,
        lines: [
          { accountId: control.salesReturns._id, debit: refundAmount, description: "Sales return" },
          { accountId: control.ar._id, credit: refundAmount, description: "Reduce receivable" },
        ],
      });
    }

    // 2. Create credit memo
    const allMemos = await ctx.db.query("creditMemos").collect();
    const memoNumber = nextNumber(allMemos, (m) => m.memoNumber, "CM-", 5);

    const creditMemoId = await ctx.db.insert("creditMemos", {
      memoNumber,
      customerId: ret.customerId,
      invoiceId: ret.invoiceId,
      date: args.date,
      amount: refundAmount,
      reason: `Refund for return ${ret.returnNumber}: ${ret.reason}`,
      status: args.paymentMethod === "credit_to_account" ? "active" : "applied",
      createdBy: user._id,
    });

    // 4. Auto-restock inventory if enabled
    let restockCost = 0;
    if (args.autoRestock && args.warehouseId) {
      const warehouse = await ctx.db.get(args.warehouseId);
      if (warehouse) {
        const items = await ctx.db
          .query("returnItems")
          .withIndex("by_return", (q) => q.eq("returnId", args.returnId))
          .collect();

        for (const item of items) {
          if (item.restocked) continue;
          // Only restock non-damaged items
          if (item.condition === "damaged" || item.condition === "defective") continue;

          if (item.productId) {
            // Update inventory table
            const existing = await ctx.db
              .query("inventory")
              .withIndex("by_product_and_warehouse", (q) =>
                q.eq("productId", item.productId!).eq("warehouseId", args.warehouseId!),
              )
              .unique();

            const unitCost = await weightedAvgCost(ctx, item.productId);

            if (existing) {
              await ctx.db.patch(existing._id, { quantity: existing.quantity + item.quantity });
            } else {
              await ctx.db.insert("inventory", {
                productId: item.productId,
                warehouseId: args.warehouseId!,
                quantity: item.quantity,
              });
            }

            // Create stock movement record at cost
            await ctx.db.insert("stockMovements", {
              productId: item.productId,
              warehouseId: args.warehouseId!,
              type: "in",
              quantity: item.quantity,
              costPerUnit: unitCost,
              reason: "return",
              reference: ret.returnNumber,
              notes: `Restocked from return ${ret.returnNumber}`,
              recordedBy: user._id,
              timestamp: new Date().toISOString(),
            });

            restockCost += unitCost * item.quantity;
          }

          await ctx.db.patch(item._id, { restocked: true, warehouseId: args.warehouseId! });
        }
      }
    }

    // Post the inventory restock at cost: Dr Inventory / Cr COGS.
    restockCost = round2(restockCost);
    if (restockCost > 0) {
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Restock for return ${ret.returnNumber}`,
        createdBy: user._id,
        sourceType: RETURN_RESTOCK_SOURCE,
        sourceId: args.returnId,
        lines: [
          { accountId: control.inventory._id, debit: restockCost, description: "Restock returned goods" },
          { accountId: control.cogs._id, credit: restockCost, description: "Reverse cost of goods sold" },
        ],
      });
    }

    // 5. Update return status
    await ctx.db.patch(args.returnId, { status: "refunded", creditMemoId });

    // 6. Log activity
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "returns:processReturnRefund",
      resourceType: "return",
      resourceId: args.returnId,
      action: "return_refund_processed",
      beforeValue: JSON.stringify(ret),
      afterValue: JSON.stringify({ returnId: args.returnId, creditMemoId, refundAmount, paymentMethod: args.paymentMethod }),
      reason: ret.reason,
      details: `Refund of $${refundAmount.toFixed(2)} to ${customerName} via ${args.paymentMethod}${args.autoRestock ? " (auto-restocked)" : ""}`,
    });

    return creditMemoId;
  },
});
