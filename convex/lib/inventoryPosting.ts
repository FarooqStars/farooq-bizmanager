// ─────────────────────────────────────────────────────────────────────────────
// Keeping the Inventory account in step with hand-made stock changes.
//
// Three screens could change stock quantities without touching the ledger:
//   • Products → set stock level          (products.setInventoryLevel)
//   • Stock movements → manual in / out   (stockMovements.recordMovement)
//   • Cycle count → adjust to counted     (advancedInventory.completeCycleCount)
// The warehouse said one thing and the Inventory account another, and the
// Reconciliation Panel's "Inventory Control vs Inventory Valuation" check
// went red.
//
// postStockAdjustment() values the change at the product's weighted-average
// cost and posts it against "Inventory Adjustments" (a cost-of-sales account):
//   more stock  → Dr Inventory              / Cr Inventory Adjustments
//   less stock  → Dr Inventory Adjustments  / Cr Inventory
// Purchases, goods receipts, sales and returns already post themselves and do
// not go through here.
// ─────────────────────────────────────────────────────────────────────────────
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { getControlAccounts, findOrCreateAccount, postBalancedEntry, round2 } from "./ledger.ts";
import { weightedAvgCost } from "./salesPosting.ts";
import { STOCK_ADJUSTMENT_SOURCE } from "./sourceTypes.ts";
import { enforcePostingDate } from "../closingDate.ts";

export async function findInventoryAdjustmentAccount(ctx: MutationCtx) {
  return await findOrCreateAccount(ctx, {
    type: "cost_of_goods_sold",
    code: "5150",
    name: "Inventory Adjustments",
    subType: "Inventory Adjustments",
    matchSubType: "Inventory Adjustments",
  });
}

export async function postStockAdjustment(
  ctx: MutationCtx,
  args: {
    productId: Id<"products">;
    /** Positive = stock added, negative = stock removed. */
    quantityDelta: number;
    /** The stockMovements row that records this change. */
    movementId: Id<"stockMovements">;
    description: string;
    createdBy: Id<"users">;
    date?: string;
  },
): Promise<void> {
  if (args.quantityDelta === 0) return;
  const product = await ctx.db.get(args.productId);
  if (!product || product.type !== "product") return;

  const date = args.date ?? new Date().toISOString().split("T")[0];
  await enforcePostingDate(ctx, date);

  const unitCost = await weightedAvgCost(ctx, args.productId);
  const value = round2(Math.abs(args.quantityDelta) * unitCost);
  if (value <= 0) return; // no cost known — nothing to value

  const control = await getControlAccounts(ctx);
  const adjustments = await findInventoryAdjustmentAccount(ctx);
  const adding = args.quantityDelta > 0;

  await postBalancedEntry(ctx, {
    date,
    description: args.description,
    createdBy: args.createdBy,
    sourceType: STOCK_ADJUSTMENT_SOURCE,
    sourceId: args.movementId,
    lines: adding
      ? [
          { accountId: control.inventory._id, debit: value, description: args.description },
          { accountId: adjustments._id, credit: value, description: "Inventory adjustment" },
        ]
      : [
          { accountId: adjustments._id, debit: value, description: "Inventory adjustment" },
          { accountId: control.inventory._id, credit: value, description: args.description },
        ],
  });
}
