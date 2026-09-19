// ─────────────────────────────────────────────────────────────────────────────
// Shared sales-side posting helpers.
//
// These helpers are used by invoicing, POS sales, and payment mutations to
// compute cost of goods sold and post the COGS/Inventory side of a sale through
// the single ledger posting engine. They never write `accounts.balance`
// directly — they always go through `postBalancedEntry`.
// ─────────────────────────────────────────────────────────────────────────────
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import { postBalancedEntry, round2, type ControlAccounts } from "./ledger.ts";

/**
 * Weighted-average unit cost for a product, computed the same way the inventory
 * valuation report does: average of "in" stock movements with a positive cost,
 * falling back to the product's costPrice.
 */
export async function weightedAvgCost(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<number> {
  const movements = await ctx.db
    .query("stockMovements")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  const inMovements = movements.filter(
    (m) => m.type === "in" && m.costPerUnit !== undefined && m.costPerUnit > 0,
  );
  if (inMovements.length > 0) {
    const totalCost = inMovements.reduce((s, m) => s + (m.costPerUnit ?? 0) * m.quantity, 0);
    const totalQty = inMovements.reduce((s, m) => s + m.quantity, 0);
    if (totalQty > 0) return totalCost / totalQty;
  }
  const product = await ctx.db.get(productId);
  return product?.costPrice ?? 0;
}

/**
 * Total cost of goods sold for a set of sold lines. Only physical products
 * (type "product") contribute; services have no inventory cost.
 */
export async function computeCogsTotal(
  ctx: MutationCtx,
  lines: Array<{ productId?: Id<"products"> | null; quantity: number }>,
): Promise<number> {
  let total = 0;
  for (const line of lines) {
    if (!line.productId) continue;
    const product = await ctx.db.get(line.productId);
    if (!product || product.type !== "product") continue;
    const unitCost = await weightedAvgCost(ctx, line.productId);
    total += unitCost * line.quantity;
  }
  return round2(total);
}

/**
 * Post the COGS/Inventory side of a sale: Dr COGS / Cr Inventory at cost.
 * No-op when there is no product cost. Guards against double-posting via the
 * journalEntries `by_source` index.
 */
export async function postCogsEntry(
  ctx: MutationCtx,
  args: {
    date: string;
    description: string;
    reference?: string;
    createdBy: Id<"users">;
    sourceType: string;
    sourceId: string;
    cogsTotal: number;
    control: ControlAccounts;
  },
): Promise<void> {
  const cogs = round2(args.cogsTotal);
  if (cogs <= 0) return;

  const existing = await ctx.db
    .query("journalEntries")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId),
    )
    .first();
  if (existing) return;

  await postBalancedEntry(ctx, {
    date: args.date,
    description: args.description,
    reference: args.reference,
    createdBy: args.createdBy,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    lines: [
      { accountId: args.control.cogs._id, debit: cogs, description: "Cost of goods sold" },
      { accountId: args.control.inventory._id, credit: cogs, description: "Inventory reduction" },
    ],
  });
}

/**
 * Resolve and validate a real cash/bank account the money moves into/out of.
 * Throws if the account is missing or inactive.
 */
export async function requireCashAccount(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
): Promise<Doc<"accounts">> {
  const account = await ctx.db.get(accountId);
  if (!account) throw new ConvexError({ message: "Payment account not found", code: "NOT_FOUND" });
  if (!account.isActive)
    throw new ConvexError({ message: "Payment account is not active", code: "BAD_REQUEST" });
  // Money can only move through a real cash/bank account. Accept modern "bank"
  // accounts, plus legacy "asset" accounts flagged as cash/bank via subType.
  const subType = (account.subType ?? "").toLowerCase();
  const isCashLike =
    account.type === "bank" ||
    (account.type === "asset" && (subType.includes("cash") || subType.includes("bank")));
  if (!isCashLike)
    throw new ConvexError({
      message: "Selected account must be a cash or bank account",
      code: "BAD_REQUEST",
    });
  return account;
}

// ─── Inventory movement helpers for sales ────────────────────────────────────

/**
 * Pick the warehouse a product should be shipped from for a sale. Prefers the
 * warehouse that currently holds the most stock of the product, then any
 * warehouse that has an inventory row, then any active warehouse. Returns null
 * only when the system has no warehouses at all.
 */
async function resolveSaleWarehouse(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<Id<"warehouses"> | null> {
  const rows = await ctx.db
    .query("inventory")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  if (rows.length > 0) {
    const best = [...rows].sort((a, b) => b.quantity - a.quantity)[0];
    return best.warehouseId;
  }
  const anyWarehouse = await ctx.db.query("warehouses").collect();
  const active = anyWarehouse.find((w) => w.isActive) ?? anyWarehouse[0];
  return active?._id ?? null;
}

/**
 * Reduce inventory and write an "out" stock movement for every physical product
 * line of a sale, valued at weighted-average cost. Services (non-"product"
 * items) are skipped. `reference` ties the movements to the source sale so the
 * reversal can find and undo them.
 */
export async function deductInventoryForSale(
  ctx: MutationCtx,
  args: {
    lines: Array<{ productId?: Id<"products"> | null; quantity: number }>;
    reference: string;
    recordedBy: Id<"users">;
    timestamp?: string;
  },
): Promise<void> {
  const timestamp = args.timestamp ?? new Date().toISOString();
  for (const line of args.lines) {
    if (!line.productId) continue;
    const product = await ctx.db.get(line.productId);
    if (!product || product.type !== "product") continue;

    const warehouseId = await resolveSaleWarehouse(ctx, line.productId);
    if (!warehouseId) continue;

    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_product_and_warehouse", (q) =>
        q.eq("productId", line.productId!).eq("warehouseId", warehouseId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { quantity: existing.quantity - line.quantity });
    } else {
      await ctx.db.insert("inventory", {
        productId: line.productId,
        warehouseId,
        quantity: -line.quantity,
      });
    }

    const unitCost = await weightedAvgCost(ctx, line.productId);
    await ctx.db.insert("stockMovements", {
      productId: line.productId,
      warehouseId,
      type: "out",
      quantity: line.quantity,
      costPerUnit: unitCost,
      reason: "sale",
      reference: args.reference,
      notes: "Sold via sale",
      recordedBy: args.recordedBy,
      timestamp,
    });
  }
}

/**
 * Undo the inventory movements of a sale: add the sold quantity back into the
 * same warehouse it left and write a compensating "in" movement. Locates the
 * original "out" movements per product line via the `by_product` index (bounded)
 * and matches them by their `reference` tag.
 */
export async function restockInventoryForSaleReversal(
  ctx: MutationCtx,
  args: {
    lines: Array<{ productId?: Id<"products"> | null }>;
    reference: string;
    recordedBy: Id<"users">;
    timestamp?: string;
  },
): Promise<void> {
  const timestamp = args.timestamp ?? new Date().toISOString();
  const seen = new Set<string>();
  for (const line of args.lines) {
    if (!line.productId || seen.has(line.productId)) continue;
    seen.add(line.productId);

    const movements = await ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", line.productId!))
      .collect();
    const outs = movements.filter(
      (m) => m.type === "out" && m.reason === "sale" && m.reference === args.reference,
    );

    for (const m of outs) {
      const existing = await ctx.db
        .query("inventory")
        .withIndex("by_product_and_warehouse", (q) =>
          q.eq("productId", m.productId).eq("warehouseId", m.warehouseId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { quantity: existing.quantity + m.quantity });
      } else {
        await ctx.db.insert("inventory", {
          productId: m.productId,
          warehouseId: m.warehouseId,
          quantity: m.quantity,
        });
      }

      await ctx.db.insert("stockMovements", {
        productId: m.productId,
        warehouseId: m.warehouseId,
        type: "in",
        quantity: m.quantity,
        costPerUnit: m.costPerUnit,
        reason: "return",
        reference: `${args.reference}-REVERSAL`,
        notes: "Sale reversed - stock restored",
        recordedBy: args.recordedBy,
        timestamp,
      });
    }
  }
}
