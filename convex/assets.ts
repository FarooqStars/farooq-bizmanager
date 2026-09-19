import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { logAudit } from "./lib/audit.ts";
import { calculateStraightLine, calculateDecliningBalance } from "./lib/depreciationCalc.ts";
import { postBalancedEntry, findOrCreateAccount, round2 } from "./lib/ledger.ts";
import { ASSET_PURCHASE_SOURCE, ASSET_DISPOSAL_SOURCE } from "./lib/sourceTypes.ts";

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

// ── Categories ────────────────────────────────────────────────────────────────

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return ctx.db.query("assetCategories").collect();
  },
});

export const createCategory = mutation({
  args: { name: v.string(), color: v.optional(v.string()), accountCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db.insert("assetCategories", { name: args.name, color: args.color, accountCode: args.accountCode });
  },
});

export const updateCategory = mutation({
  args: { categoryId: v.id("assetCategories"), name: v.optional(v.string()), color: v.optional(v.string()), accountCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const { categoryId, ...fields } = args;
    await ctx.db.patch(categoryId, fields);
  },
});

export const deleteCategory = mutation({
  args: { categoryId: v.id("assetCategories") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    await ctx.db.delete(args.categoryId);
  },
});

// ── Assets ────────────────────────────────────────────────────────────────────

export const listAssets = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const assets = await ctx.db.query("assets").collect();
    return Promise.all(
      assets.map(async (a) => {
        const category = a.categoryId ? await ctx.db.get(a.categoryId) : null;
        const assignedUser = a.assignedTo ? await ctx.db.get(a.assignedTo) : null;
        const warehouse = a.warehouseId ? await ctx.db.get(a.warehouseId) : null;
        return { ...a, category, assignedUser, warehouse };
      })
    );
  },
});

export const createAsset = mutation({
  args: {
    name: v.string(),
    categoryId: v.optional(v.id("assetCategories")),
    accountCode: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    currentValue: v.optional(v.number()),
    condition: v.union(v.literal("excellent"), v.literal("good"), v.literal("fair"), v.literal("poor")),
    assignedTo: v.optional(v.id("users")),
    warehouseId: v.optional(v.id("warehouses")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const id = await ctx.db.insert("assets", { ...args, status: "active" });

    // Resolve GL account: asset override → category default → fallback 1500
    let glCode = args.accountCode;
    let glName = "Fixed Assets";
    if (!glCode && args.categoryId) {
      const cat = await ctx.db.get(args.categoryId);
      glCode = cat?.accountCode;
    }
    if (!glCode) glCode = "1500";

    // Map known codes to names
    const knownNames: Record<string, string> = {
      "1500": "Fixed Assets",
      "1510": "Equipment",
      "1520": "Vehicles",
      "1530": "Furniture & Fixtures",
      "1540": "Computers & Technology",
    };
    glName = knownNames[glCode] ?? "Fixed Assets";

    // Post journal entry for the asset purchase cost if provided
    if (args.purchasePrice && args.purchasePrice > 0) {
      const cost = round2(args.purchasePrice);
      const date = args.purchaseDate ?? new Date().toISOString().split("T")[0];

      const fixedAssetAccount = await findOrCreateAccount(ctx, {
        type: "fixed_asset",
        code: glCode,
        name: glName,
        subType: "Property & Equipment",
        matchSubType: "Property & Equipment",
      });
      const apAccount = await findOrCreateAccount(ctx, {
        type: "accounts_payable",
        code: "2000",
        name: "Accounts Payable",
        subType: "Trade Payables",
        matchAnyOfType: true,
      });

      await postBalancedEntry(ctx, {
        date,
        description: `Asset purchase – ${args.name}`,
        createdBy: user._id,
        sourceType: ASSET_PURCHASE_SOURCE,
        sourceId: id,
        lines: [
          { accountId: fixedAssetAccount._id, debit: cost, description: args.name },
          { accountId: apAccount._id, credit: cost, description: args.name },
        ],
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assets:createAsset",
      resourceType: "asset",
      resourceId: id,
      action: "Created asset",
      details: args.name,
      afterValue: JSON.stringify({ name: args.name, condition: args.condition, status: "active", purchasePrice: args.purchasePrice }),
    });
    return id;
  },
});

export const updateAsset = mutation({
  args: {
    assetId: v.id("assets"),
    name: v.optional(v.string()),
    categoryId: v.optional(v.id("assetCategories")),
    accountCode: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    currentValue: v.optional(v.number()),
    condition: v.optional(v.union(v.literal("excellent"), v.literal("good"), v.literal("fair"), v.literal("poor"))),
    status: v.optional(v.union(v.literal("active"), v.literal("under_repair"), v.literal("disposed"))),
    assignedTo: v.optional(v.id("users")),
    warehouseId: v.optional(v.id("warehouses")),
    notes: v.optional(v.string()),
    depreciationMethod: v.optional(v.union(
      v.literal("straight_line"),
      v.literal("declining_balance"),
      v.literal("none")
    )),
    usefulLifeYears: v.optional(v.number()),
    salvageValue: v.optional(v.number()),
    depreciationRate: v.optional(v.number()),
    depreciationStartDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const assetBefore = await ctx.db.get(args.assetId);
    const { assetId, ...rest } = args;
    // Remove undefined keys so patch doesn't overwrite with undefined
    const patch = Object.fromEntries(Object.entries(rest).filter(([, val]) => val !== undefined));
    await ctx.db.patch(assetId, patch);
    const assetAfter = await ctx.db.get(assetId);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assets:updateAsset",
      resourceType: "asset",
      resourceId: assetId,
      action: "Updated asset",
      beforeValue: assetBefore ? JSON.stringify(assetBefore) : undefined,
      afterValue: assetAfter ? JSON.stringify(assetAfter) : undefined,
    });
  },
});

export const deleteAsset = mutation({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role !== "owner") throw new ConvexError({ message: "Only owners can delete assets", code: "FORBIDDEN" });
    // Cascade delete logs
    const logs = await ctx.db.query("assetLogs").withIndex("by_asset", (q) => q.eq("assetId", args.assetId)).collect();
    await Promise.all(logs.map((l) => ctx.db.delete(l._id)));
    await ctx.db.delete(args.assetId);
  },
});

export const getAssetSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const assets = await ctx.db.query("assets").collect();
    const now = new Date().toISOString().split("T")[0];

    let totalPurchaseValue = 0;
    let totalCurrentValue = 0;

    for (const asset of assets) {
      const purchasePrice = asset.purchasePrice ?? 0;
      totalPurchaseValue += purchasePrice;

      if (!asset.depreciationMethod || asset.depreciationMethod === "none" || !asset.purchasePrice) {
        // No depreciation: current value = stored currentValue or purchasePrice
        totalCurrentValue += asset.currentValue ?? purchasePrice;
        continue;
      }

      // Dynamically compute current book value from the schedule
      const salvageValue = asset.salvageValue ?? 0;
      const startDate = asset.depreciationStartDate ?? asset.purchaseDate ?? now;
      let bookValue = purchasePrice;

      if (asset.depreciationMethod === "straight_line") {
        const usefulLife = asset.usefulLifeYears ?? 5;
        const schedule = calculateStraightLine(purchasePrice, salvageValue, usefulLife, startDate, now);
        if (schedule.length > 0) bookValue = schedule[schedule.length - 1].closingValue;
      } else if (asset.depreciationMethod === "declining_balance") {
        const rate = asset.depreciationRate ?? 20;
        const schedule = calculateDecliningBalance(purchasePrice, salvageValue, rate, startDate, now);
        if (schedule.length > 0) bookValue = schedule[schedule.length - 1].closingValue;
      }

      totalCurrentValue += Math.round(bookValue * 100) / 100;
    }

    return {
      total: assets.length,
      active: assets.filter((a) => a.status === "active").length,
      underRepair: assets.filter((a) => a.status === "under_repair").length,
      disposed: assets.filter((a) => a.status === "disposed").length,
      totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
      totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
      depreciation: Math.round((totalPurchaseValue - totalCurrentValue) * 100) / 100,
    };
  },
});

// ── Asset Logs ─────────────────────────────────────────────────────────────────

export const listAssetLogs = query({
  args: { assetId: v.id("assets") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db
      .query("assetLogs")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .order("desc")
      .collect();
  },
});

export const createAssetLog = mutation({
  args: {
    assetId: v.id("assets"),
    date: v.string(),
    type: v.union(v.literal("maintenance"), v.literal("note"), v.literal("repair")),
    description: v.string(),
    cost: v.optional(v.number()),
    performedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    return ctx.db.insert("assetLogs", { ...args, recordedBy: user._id });
  },
});

export const deleteAssetLog = mutation({
  args: { logId: v.id("assetLogs") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    await ctx.db.delete(args.logId);
  },
});

// ── Asset Disposal ────────────────────────────────────────────────────────────

/**
 * Dispose of (sell) an asset.
 * Posts the full disposal journal entry:
 *   Dr  Accumulated Depreciation (1490)         [total depreciation to date]
 *   Dr  Cash / Bank                              [sale proceeds]
 *   Dr  Loss on Asset Disposal (7100)            [only if sale price < book value]
 *   Cr  Fixed Assets (1500 or 1520)              [original cost]
 *   Cr  Gain on Asset Disposal (8100)            [only if sale price > book value]
 * Marks asset status as "disposed".
 */
export const disposeAsset = mutation({
  args: {
    assetId: v.id("assets"),
    salePrice: v.number(),
    saleDate: v.string(),
    bankAccountId: v.id("accounts"), // which bank/cash account receives proceeds
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });

    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new ConvexError({ message: "Asset not found", code: "NOT_FOUND" });
    if (asset.status === "disposed") throw new ConvexError({ message: "Asset already disposed", code: "BAD_REQUEST" });

    // ── Compute accumulated depreciation from posted GL entries ────────────────
    // Sum all depreciation journal lines credited to accum-dep for this asset
    const allPosted = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();

    const depEntries = allPosted.filter(
      (e) => e.sourceType === "depreciation" && typeof e.sourceId === "string" && (e.sourceId as string).startsWith(args.assetId),
    );

    let accumulatedDepreciation = 0;
    for (const entry of depEntries) {
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
        .collect();
      for (const line of lines) {
        // Accumulated depreciation is posted as a CREDIT to account 1490
        const acct = await ctx.db.get(line.accountId);
        if (acct && acct.subType === "Accumulated Depreciation") {
          accumulatedDepreciation += line.credit ?? 0;
        }
      }
    }
    accumulatedDepreciation = round2(accumulatedDepreciation);

    const originalCost = round2(asset.purchasePrice ?? 0);
    const bookValue = round2(originalCost - accumulatedDepreciation);
    const salePrice = round2(args.salePrice);
    const gainOrLoss = round2(salePrice - bookValue);

    // ── Resolve control accounts ───────────────────────────────────────────────
    const fixedAssetAccount = await findOrCreateAccount(ctx, {
      type: "fixed_asset",
      code: "1500",
      name: "Fixed Assets",
      subType: "Property & Equipment",
      matchSubType: "Property & Equipment",
    });

    const accumDepAccount = await findOrCreateAccount(ctx, {
      type: "other_asset",
      code: "1490",
      name: "Accumulated Depreciation",
      subType: "Accumulated Depreciation",
      matchSubType: "Accumulated Depreciation",
      normalSide: "credit",
    });

    // Build journal lines
    type JournalLine = { accountId: Id<"accounts">; debit?: number; credit?: number; description: string };
    const lines: JournalLine[] = [];

    // Remove accumulated depreciation (Dr Accum Dep)
    if (accumulatedDepreciation > 0) {
      lines.push({ accountId: accumDepAccount._id, debit: accumulatedDepreciation, description: `Clear accum. depreciation – ${asset.name}` });
    }

    // Record sale proceeds (Dr Bank/Cash)
    if (salePrice > 0) {
      lines.push({ accountId: args.bankAccountId, debit: salePrice, description: `Sale proceeds – ${asset.name}` });
    }

    // Remove asset at original cost (Cr Fixed Assets)
    if (originalCost > 0) {
      lines.push({ accountId: fixedAssetAccount._id, credit: originalCost, description: `Dispose asset – ${asset.name}` });
    }

    // Gain or Loss
    if (gainOrLoss > 0) {
      // Gain: Cr Gain on Asset Disposal
      const gainAccount = await findOrCreateAccount(ctx, {
        type: "other_income",
        code: "8100",
        name: "Gain on Asset Disposal",
        subType: "Asset Disposal Gain",
        matchSubType: "Asset Disposal Gain",
      });
      lines.push({ accountId: gainAccount._id, credit: gainOrLoss, description: `Gain on disposal – ${asset.name}` });
    } else if (gainOrLoss < 0) {
      // Loss: Dr Loss on Asset Disposal
      const lossAccount = await findOrCreateAccount(ctx, {
        type: "other_expense",
        code: "7100",
        name: "Loss on Asset Disposal",
        subType: "Asset Disposal Loss",
        matchSubType: "Asset Disposal Loss",
      });
      lines.push({ accountId: lossAccount._id, debit: Math.abs(gainOrLoss), description: `Loss on disposal – ${asset.name}` });
    }
    // If gainOrLoss === 0 the entry balances without an extra line

    await postBalancedEntry(ctx, {
      date: args.saleDate,
      description: `Asset disposal – ${asset.name}${args.notes ? ` (${args.notes})` : ""}`,
      createdBy: user._id,
      sourceType: ASSET_DISPOSAL_SOURCE,
      sourceId: args.assetId,
      lines,
    });

    // Mark asset as disposed
    await ctx.db.patch(args.assetId, {
      status: "disposed",
      notes: args.notes
        ? `${asset.notes ? asset.notes + "\n" : ""}Disposed ${args.saleDate}: ${args.notes}`
        : asset.notes,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "assets:disposeAsset",
      resourceType: "asset",
      resourceId: args.assetId,
      action: "asset_disposed",
      details: `Disposed ${asset.name} for ${salePrice}. Book value: ${bookValue}. ${gainOrLoss >= 0 ? `Gain: ${gainOrLoss}` : `Loss: ${Math.abs(gainOrLoss)}`}`,
    });

    return { originalCost, accumulatedDepreciation, bookValue, salePrice, gainOrLoss };
  },
});
