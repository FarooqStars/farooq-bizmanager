/**
 * Shared depreciation calculation helpers.
 * Imported by both convex/assets.ts and convex/depreciation.ts.
 */

export type DepreciationScheduleEntry = {
  year: number;
  month: number;
  label: string;
  openingValue: number;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  closingValue: number;
};

export function calculateStraightLine(
  purchasePrice: number,
  salvageValue: number,
  usefulLifeYears: number,
  startDate: string,
  endDate: string,
): DepreciationScheduleEntry[] {
  const annualDepreciation = (purchasePrice - salvageValue) / usefulLifeYears;
  const monthlyDepreciation = annualDepreciation / 12;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const schedule: DepreciationScheduleEntry[] = [];

  let accumulated = 0;
  let currentValue = purchasePrice;
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end && currentValue > salvageValue) {
    const depAmount = Math.min(monthlyDepreciation, currentValue - salvageValue);
    if (depAmount <= 0) break;

    accumulated += depAmount;
    const openingValue = currentValue;
    currentValue -= depAmount;

    schedule.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      label: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`,
      openingValue,
      depreciationAmount: Math.round(depAmount * 100) / 100,
      accumulatedDepreciation: Math.round(accumulated * 100) / 100,
      closingValue: Math.round(currentValue * 100) / 100,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return schedule;
}

export function calculateDecliningBalance(
  purchasePrice: number,
  salvageValue: number,
  depreciationRate: number,
  startDate: string,
  endDate: string,
): DepreciationScheduleEntry[] {
  const monthlyRate = depreciationRate / 100 / 12;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const schedule: DepreciationScheduleEntry[] = [];

  let accumulated = 0;
  let currentValue = purchasePrice;
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end && currentValue > salvageValue) {
    const depAmount = Math.min(currentValue * monthlyRate, currentValue - salvageValue);
    if (depAmount <= 0.01) break;

    accumulated += depAmount;
    const openingValue = currentValue;
    currentValue -= depAmount;

    schedule.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      label: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`,
      openingValue: Math.round(openingValue * 100) / 100,
      depreciationAmount: Math.round(depAmount * 100) / 100,
      accumulatedDepreciation: Math.round(accumulated * 100) / 100,
      closingValue: Math.round(currentValue * 100) / 100,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return schedule;
}

/**
 * Compute the depreciation amount for a single calendar month (YYYY-MM).
 * Returns 0 if the asset has no depreciation configured.
 */
export function getMonthlyDepreciationAmount(
  asset: {
    purchasePrice?: number;
    salvageValue?: number;
    depreciationMethod?: string;
    usefulLifeYears?: number;
    depreciationRate?: number;
    depreciationStartDate?: string;
    purchaseDate?: string;
  },
  yearMonth: string, // e.g. "2025-03"
): number {
  if (!asset.depreciationMethod || asset.depreciationMethod === "none" || !asset.purchasePrice) return 0;

  const purchasePrice = asset.purchasePrice;
  const salvageValue = asset.salvageValue ?? 0;
  const startDate = asset.depreciationStartDate ?? asset.purchaseDate ?? yearMonth + "-01";
  const endDate = yearMonth + "-01"; // We only need up to this month

  let schedule: DepreciationScheduleEntry[] = [];

  if (asset.depreciationMethod === "straight_line") {
    schedule = calculateStraightLine(purchasePrice, salvageValue, asset.usefulLifeYears ?? 5, startDate, endDate);
  } else if (asset.depreciationMethod === "declining_balance") {
    schedule = calculateDecliningBalance(purchasePrice, salvageValue, asset.depreciationRate ?? 20, startDate, endDate);
  }

  const [y, m] = yearMonth.split("-").map(Number);
  const entry = schedule.find((e) => e.year === y && e.month === m);
  return entry ? entry.depreciationAmount : 0;
}
