import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";
import {
  calculateStraightLine,
  calculateDecliningBalance,
  getMonthlyDepreciationAmount,
  type DepreciationScheduleEntry,
} from "./lib/depreciationCalc.ts";
import { postBalancedEntry, findOrCreateAccount, round2 } from "./lib/ledger.ts";
import { DEPRECIATION_SOURCE } from "./lib/sourceTypes.ts";

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

// ── Queries ───────────────────────────────────────────────────────────────────

export const getDepreciationSchedule = query({
  args: {
    assetId: v.id("assets"),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new ConvexError({ message: "Asset not found", code: "NOT_FOUND" });

    if (!asset.depreciationMethod || asset.depreciationMethod === "none") {
      return { schedule: [], method: "none" as const, asset };
    }

    const purchasePrice = asset.purchasePrice ?? 0;
    const salvageValue = asset.salvageValue ?? 0;
    const startDate = asset.depreciationStartDate ?? asset.purchaseDate ?? new Date().toISOString().split("T")[0];
    const endDate = args.endDate ?? new Date().toISOString().split("T")[0];

    let schedule: DepreciationScheduleEntry[] = [];

    if (asset.depreciationMethod === "straight_line") {
      const usefulLife = asset.usefulLifeYears ?? 5;
      schedule = calculateStraightLine(purchasePrice, salvageValue, usefulLife, startDate, endDate);
    } else if (asset.depreciationMethod === "declining_balance") {
      const rate = asset.depreciationRate ?? 20;
      schedule = calculateDecliningBalance(purchasePrice, salvageValue, rate, startDate, endDate);
    }

    return {
      schedule,
      method: asset.depreciationMethod,
      asset,
      summary: schedule.length > 0
        ? {
            totalDepreciation: schedule[schedule.length - 1].accumulatedDepreciation,
            currentBookValue: schedule[schedule.length - 1].closingValue,
            monthsDepreciated: schedule.length,
          }
        : { totalDepreciation: 0, currentBookValue: purchasePrice, monthsDepreciated: 0 },
    };
  },
});

export const getDepreciationSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const assets = await ctx.db.query("assets").collect();
    const now = new Date().toISOString().split("T")[0];

    let totalOriginalCost = 0;
    let totalCurrentBookValue = 0;
    let totalAccumulatedDepreciation = 0;
    let assetsWithDepreciation = 0;

    const assetSummaries: Array<{
      id: string;
      name: string;
      method: string;
      purchasePrice: number;
      currentBookValue: number;
      accumulatedDepreciation: number;
      monthlyDepreciation: number;
      status: string;
    }> = [];

    for (const asset of assets) {
      if (!asset.depreciationMethod || asset.depreciationMethod === "none") continue;
      if (!asset.purchasePrice) continue;

      assetsWithDepreciation++;
      const purchasePrice = asset.purchasePrice;
      const salvageValue = asset.salvageValue ?? 0;
      const startDate = asset.depreciationStartDate ?? asset.purchaseDate ?? now;

      let monthlyDep = 0;
      let accDep = 0;
      let bookValue = purchasePrice;

      if (asset.depreciationMethod === "straight_line") {
        const usefulLife = asset.usefulLifeYears ?? 5;
        const schedule = calculateStraightLine(purchasePrice, salvageValue, usefulLife, startDate, now);
        if (schedule.length > 0) {
          accDep = schedule[schedule.length - 1].accumulatedDepreciation;
          bookValue = schedule[schedule.length - 1].closingValue;
          monthlyDep = schedule[0].depreciationAmount;
        }
      } else if (asset.depreciationMethod === "declining_balance") {
        const rate = asset.depreciationRate ?? 20;
        const schedule = calculateDecliningBalance(purchasePrice, salvageValue, rate, startDate, now);
        if (schedule.length > 0) {
          accDep = schedule[schedule.length - 1].accumulatedDepreciation;
          bookValue = schedule[schedule.length - 1].closingValue;
          monthlyDep = schedule[schedule.length - 1].depreciationAmount;
        }
      }

      totalOriginalCost += purchasePrice;
      totalCurrentBookValue += bookValue;
      totalAccumulatedDepreciation += accDep;

      assetSummaries.push({
        id: asset._id,
        name: asset.name,
        method: asset.depreciationMethod,
        purchasePrice,
        currentBookValue: Math.round(bookValue * 100) / 100,
        accumulatedDepreciation: Math.round(accDep * 100) / 100,
        monthlyDepreciation: Math.round(monthlyDep * 100) / 100,
        status: asset.status,
      });
    }

    return {
      totalOriginalCost: Math.round(totalOriginalCost * 100) / 100,
      totalCurrentBookValue: Math.round(totalCurrentBookValue * 100) / 100,
      totalAccumulatedDepreciation: Math.round(totalAccumulatedDepreciation * 100) / 100,
      assetsWithDepreciation,
      totalAssets: assets.length,
      assetSummaries,
    };
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

export const updateDepreciationSettings = mutation({
  args: {
    assetId: v.id("assets"),
    depreciationMethod: v.union(
      v.literal("straight_line"),
      v.literal("declining_balance"),
      v.literal("none")
    ),
    usefulLifeYears: v.optional(v.number()),
    salvageValue: v.optional(v.number()),
    depreciationRate: v.optional(v.number()),
    depreciationStartDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });

    const { assetId, ...settings } = args;
    const asset = await ctx.db.get(assetId);
    if (!asset) throw new ConvexError({ message: "Asset not found", code: "NOT_FOUND" });

    const beforeValue = JSON.stringify(asset);
    await ctx.db.patch(assetId, settings);

    // Auto-update currentValue based on depreciation
    if (settings.depreciationMethod !== "none" && asset.purchasePrice) {
      const purchasePrice = asset.purchasePrice;
      const salvageValue = settings.salvageValue ?? asset.salvageValue ?? 0;
      const startDate = settings.depreciationStartDate ?? asset.depreciationStartDate ?? asset.purchaseDate ?? new Date().toISOString().split("T")[0];
      const now = new Date().toISOString().split("T")[0];

      let currentBookValue = purchasePrice;

      if (settings.depreciationMethod === "straight_line") {
        const usefulLife = settings.usefulLifeYears ?? asset.usefulLifeYears ?? 5;
        const schedule = calculateStraightLine(purchasePrice, salvageValue, usefulLife, startDate, now);
        if (schedule.length > 0) {
          currentBookValue = schedule[schedule.length - 1].closingValue;
        }
      } else if (settings.depreciationMethod === "declining_balance") {
        const rate = settings.depreciationRate ?? asset.depreciationRate ?? 20;
        const schedule = calculateDecliningBalance(purchasePrice, salvageValue, rate, startDate, now);
        if (schedule.length > 0) {
          currentBookValue = schedule[schedule.length - 1].closingValue;
        }
      }

      await ctx.db.patch(assetId, { currentValue: Math.round(currentBookValue * 100) / 100 });
    }

    const updatedAsset = await ctx.db.get(assetId);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "depreciation:updateDepreciationSettings",
      resourceType: "asset",
      resourceId: assetId,
      action: "depreciation_settings_updated",
      beforeValue,
      afterValue: JSON.stringify(updatedAsset),
      details: `Updated depreciation settings for ${asset.name}`,
    });
  },
});

export const recalculateAllDepreciation = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });

    const assets = await ctx.db.query("assets").collect();
    const now = new Date().toISOString().split("T")[0];
    let updated = 0;

    for (const asset of assets) {
      if (!asset.depreciationMethod || asset.depreciationMethod === "none") continue;
      if (!asset.purchasePrice) continue;

      const purchasePrice = asset.purchasePrice;
      const salvageValue = asset.salvageValue ?? 0;
      const startDate = asset.depreciationStartDate ?? asset.purchaseDate ?? now;

      let currentBookValue = purchasePrice;

      if (asset.depreciationMethod === "straight_line") {
        const usefulLife = asset.usefulLifeYears ?? 5;
        const schedule = calculateStraightLine(purchasePrice, salvageValue, usefulLife, startDate, now);
        if (schedule.length > 0) {
          currentBookValue = schedule[schedule.length - 1].closingValue;
        }
      } else if (asset.depreciationMethod === "declining_balance") {
        const rate = asset.depreciationRate ?? 20;
        const schedule = calculateDecliningBalance(purchasePrice, salvageValue, rate, startDate, now);
        if (schedule.length > 0) {
          currentBookValue = schedule[schedule.length - 1].closingValue;
        }
      }

      const rounded = Math.round(currentBookValue * 100) / 100;
      if (asset.currentValue !== rounded) {
        await ctx.db.patch(asset._id, { currentValue: rounded });
        updated++;
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "depreciation:recalculateAllDepreciation",
      resourceType: "asset",
      resourceId: "batch",
      action: "depreciation_recalculated",
      details: `Recalculated depreciation for all assets, ${updated} updated`,
    });

    return { updated };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return every YYYY-MM string from startYearMonth up to and including endYearMonth */
function monthRange(startYearMonth: string, endYearMonth: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startYearMonth.split("-").map(Number);
  const [ey, em] = endYearMonth.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ── Post Monthly Depreciation ──────────────────────────────────────────────────

/**
 * Post depreciation journal entries for all active assets for a given month.
 * Creates: Dr Depreciation Expense / Cr Accumulated Depreciation
 * Skips assets already posted for that month (idempotent via sourceId check).
 */
export const postMonthlyDepreciation = mutation({
  args: {
    yearMonth: v.string(), // e.g. "2025-03"
  },
  handler: async (ctx, args): Promise<{ posted: number; skipped: number }> => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });

    const assets = await ctx.db.query("assets").collect();
    let posted = 0;
    let skipped = 0;

    // Control accounts: Depreciation Expense and Accumulated Depreciation (contra-asset)
    const depExpenseAccount = await findOrCreateAccount(ctx, {
      type: "expense",
      code: "6400",
      name: "Depreciation Expense",
      subType: "Depreciation",
      matchSubType: "Depreciation",
    });
    const accumDepAccount = await findOrCreateAccount(ctx, {
      type: "other_asset",
      code: "1490",
      name: "Accumulated Depreciation",
      subType: "Accumulated Depreciation",
      matchSubType: "Accumulated Depreciation",
      normalSide: "credit", // contra-asset
    });

    for (const asset of assets) {
      if (asset.status === "disposed") continue;
      const amount = getMonthlyDepreciationAmount(asset, args.yearMonth);
      if (amount <= 0) { skipped++; continue; }

      const sourceId = `${asset._id}-${args.yearMonth}`;

      // Check if already posted for this asset+month
      const existing = await ctx.db
        .query("journalEntries")
        .withIndex("by_status", (q) => q.eq("status", "posted"))
        .collect();
      const alreadyPosted = existing.some(
        (e) => e.sourceType === DEPRECIATION_SOURCE && e.sourceId === sourceId,
      );
      if (alreadyPosted) { skipped++; continue; }

      const rounded = round2(amount);
      const lastDay = new Date(
        parseInt(args.yearMonth.split("-")[0]),
        parseInt(args.yearMonth.split("-")[1]),
        0,
      ).toISOString().split("T")[0];

      await postBalancedEntry(ctx, {
        date: lastDay,
        description: `Depreciation – ${asset.name} (${args.yearMonth})`,
        createdBy: user._id,
        sourceType: DEPRECIATION_SOURCE,
        sourceId,
        lines: [
          { accountId: depExpenseAccount._id, debit: rounded, description: asset.name },
          { accountId: accumDepAccount._id, credit: rounded, description: asset.name },
        ],
      });
      posted++;
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "depreciation:postMonthlyDepreciation",
      resourceType: "asset",
      resourceId: "batch",
      action: "depreciation_posted",
      details: `Posted depreciation for ${args.yearMonth}: ${posted} entries posted, ${skipped} skipped`,
    });

    return { posted, skipped };
  },
});

/**
 * Post ALL outstanding depreciation journal entries for every asset from each
 * asset's own start date up to (and including) toYearMonth.
 * Idempotent — already-posted months are skipped automatically.
 * Returns total posted + skipped counts.
 */
export const postDepreciationUpTo = mutation({
  args: {
    toYearMonth: v.string(), // e.g. "2025-08"
  },
  handler: async (ctx, args): Promise<{ posted: number; skipped: number; assetsProcessed: number }> => {
    const user = await requireAuth(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });

    const assets = await ctx.db.query("assets").collect();
    let posted = 0;
    let skipped = 0;
    let assetsProcessed = 0;

    const depExpenseAccount = await findOrCreateAccount(ctx, {
      type: "expense",
      code: "6400",
      name: "Depreciation Expense",
      subType: "Depreciation",
      matchSubType: "Depreciation",
    });
    const accumDepAccount = await findOrCreateAccount(ctx, {
      type: "other_asset",
      code: "1490",
      name: "Accumulated Depreciation",
      subType: "Accumulated Depreciation",
      matchSubType: "Accumulated Depreciation",
      normalSide: "credit",
    });

    // Load all existing depreciation journal entries once (avoid N+1)
    const existingEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const postedSourceIds = new Set(
      existingEntries
        .filter((e) => e.sourceType === DEPRECIATION_SOURCE)
        .map((e) => e.sourceId)
    );

    for (const asset of assets) {
      if (asset.status === "disposed") continue;
      if (!asset.depreciationMethod || asset.depreciationMethod === "none") continue;
      if (!asset.purchasePrice) continue;

      const startDate = asset.depreciationStartDate ?? asset.purchaseDate;
      if (!startDate) { skipped++; continue; }

      const startYearMonth = startDate.slice(0, 7); // "YYYY-MM"
      const months = monthRange(startYearMonth, args.toYearMonth);
      assetsProcessed++;

      for (const ym of months) {
        const sourceId = `${asset._id}-${ym}`;
        if (postedSourceIds.has(sourceId)) { skipped++; continue; }

        const amount = getMonthlyDepreciationAmount(asset, ym);
        if (amount <= 0) { skipped++; continue; }

        const rounded = round2(amount);
        const [yearStr, monthStr] = ym.split("-");
        const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0)
          .toISOString().split("T")[0];

        await postBalancedEntry(ctx, {
          date: lastDay,
          description: `Depreciation – ${asset.name} (${ym})`,
          createdBy: user._id,
          sourceType: DEPRECIATION_SOURCE,
          sourceId,
          lines: [
            { accountId: depExpenseAccount._id, debit: rounded, description: asset.name },
            { accountId: accumDepAccount._id, credit: rounded, description: asset.name },
          ],
        });
        postedSourceIds.add(sourceId); // prevent duplicate in same run
        posted++;
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "depreciation:postDepreciationUpTo",
      resourceType: "asset",
      resourceId: "batch",
      action: "depreciation_backfill_posted",
      details: `Backfill depreciation up to ${args.toYearMonth}: ${posted} entries posted, ${skipped} skipped across ${assetsProcessed} assets`,
    });

    return { posted, skipped, assetsProcessed };
  },
});
