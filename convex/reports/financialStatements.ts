/**
 * Financial statement backend queries.
 *
 * ARCHITECTURE: All monetary figures come from posted journalLines only.
 * No reads from invoices, bills, sales, or products for any amount.
 *
 * Contra-account rule (matches expectAccountingEquation in invariants.test.ts):
 *   Natural sides: asset=debit, liability=credit, equity=credit, income=credit, expense=debit
 *   A contra account has normalSide OPPOSITE to its category's natural side.
 *   Its balance counts NEGATIVELY in its category total.
 *   e.g. Sales Returns (type:income, normalSide:debit) reduces revenue.
 *        Accum. Depreciation (type:fixed_asset, normalSide:credit) reduces assets.
 */
import { query } from "../_generated/server";
import { v } from "convex/values";
import { getPostedLinesForPeriod, getPostedLinesForAccountBefore } from "../lib/reportQueries.ts";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";

// ─── Type classification helpers (mirrors ledger.ts + invariants.test.ts) ────

const ASSET_TYPES = new Set([
  "bank", "accounts_receivable", "other_current_asset",
  "fixed_asset", "other_asset", "asset",
]);
const LIABILITY_TYPES = new Set([
  "accounts_payable", "credit_card", "other_current_liability",
  "long_term_liability", "loan", "liability",
]);
const EQUITY_TYPES = new Set(["equity"]);
const INCOME_TYPES = new Set(["income", "other_income", "revenue"]);
const EXPENSE_TYPES = new Set(["cost_of_goods_sold", "expense", "other_expense"]);

// Natural normal side for each category
const NATURAL_SIDE: Record<string, "debit" | "credit"> = {
  asset: "debit", liability: "credit", equity: "credit",
  income: "credit", expense: "debit",
};

function getCategory(type: string): "asset" | "liability" | "equity" | "income" | "expense" | null {
  if (ASSET_TYPES.has(type)) return "asset";
  if (LIABILITY_TYPES.has(type)) return "liability";
  if (EQUITY_TYPES.has(type)) return "equity";
  if (INCOME_TYPES.has(type)) return "income";
  if (EXPENSE_TYPES.has(type)) return "expense";
  return null;
}

/**
 * Compute the signed balance contribution for an account.
 * Positive = adds to its category total; negative = subtracts (contra).
 */
function signedBalance(account: Doc<"accounts">): number {
  const cat = getCategory(account.type);
  if (!cat) return 0;
  const natural = NATURAL_SIDE[cat];
  return account.normalSide === natural ? account.balance : -account.balance;
}

/**
 * Compute the net balance of posted journal lines for a single account
 * from a set of lines already filtered to a period or date range.
 * Returns a signed amount relative to the account's normalSide:
 *   debit-normal: net = sum(debit) - sum(credit)
 *   credit-normal: net = sum(credit) - sum(debit)
 */
function netFromLines(
  lines: Array<{ debit: number; credit: number }>,
  normalSide: "debit" | "credit",
): number {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return normalSide === "debit" ? totalDebit - totalCredit : totalCredit - totalDebit;
}

// ─── Fiscal year helpers ──────────────────────────────────────────────────────

function getFiscalYearStart(fiscalStartMonth: number, asOf: string): string {
  // fiscalStartMonth: 1-based. Find the start of the fiscal year containing asOf.
  const d = new Date(asOf);
  const month0 = d.getMonth(); // 0-based
  const fyStart0 = fiscalStartMonth - 1; // 0-based
  let year = d.getFullYear();
  if (month0 < fyStart0) year -= 1; // We're in the first part of the calendar year, FY started last year
  const mm = String(fiscalStartMonth).padStart(2, "0");
  return `${year}-${mm}-01`;
}

function addYears(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

function subDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Account balance as-of-date (from journal lines) ─────────────────────────

/**
 * Build a map of accountId → signed balance from posted lines up to (and
 * including) a given date. Does NOT use accounts.balance — derives from lines.
 */
async function buildBalanceMap(
  ctx: QueryCtx,
  beforeExclusive: string, // exclusive upper bound — pass day-after-asOf
  accounts: Doc<"accounts">[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const account of accounts) {
    const lines = await getPostedLinesForAccountBefore(
      ctx,
      account._id,
      beforeExclusive,
    );
    const net = netFromLines(lines, account.normalSide);
    if (net !== 0) map.set(account._id, net);
  }
  return map;
}

// ─── 1. Trial Balance ─────────────────────────────────────────────────────────

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debit: number;   // positive net debit balance (account carries a debit balance)
  credit: number;  // positive net credit balance (account carries a credit balance)
};

export type TrialBalanceResult = {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  inBalance: boolean;
  asOfDate: string;
};

export const getTrialBalance = query({
  args: {
    asOfDate: v.string(),
    includeZero: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TrialBalanceResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const accounts = await ctx.db.query("accounts").collect();
    const dayAfter = addDays(args.asOfDate, 1);

    const rows: TrialBalanceRow[] = [];

    for (const account of accounts) {
      if (!account.isActive) continue;
      const lines = await getPostedLinesForAccountBefore(ctx, account._id, dayAfter);
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      const netDebit = round2(totalDebit - totalCredit);

      if (!args.includeZero && netDebit === 0) continue;

      rows.push({
        accountId: account._id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit: netDebit > 0 ? round2(netDebit) : 0,
        credit: netDebit < 0 ? round2(-netDebit) : 0,
      });
    }

    rows.sort((a, b) => a.code.localeCompare(b.code));

    const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));

    return {
      rows,
      totalDebit,
      totalCredit,
      inBalance: Math.abs(totalDebit - totalCredit) < 0.01,
      asOfDate: args.asOfDate,
    };
  },
});

// ─── 2. Balance Sheet ─────────────────────────────────────────────────────────

export type BalanceSheetSection = {
  label: string;
  rows: Array<{ accountId: string; code: string; name: string; amount: number; comparativeAmount: number }>;
  total: number;
  comparativeTotal: number;
};

export type BalanceSheetResult = {
  asOfDate: string;
  comparativeDate: string;
  sections: {
    currentAssets: BalanceSheetSection;
    nonCurrentAssets: BalanceSheetSection;
    currentLiabilities: BalanceSheetSection;
    nonCurrentLiabilities: BalanceSheetSection;
    equity: BalanceSheetSection;
  };
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  inBalance: boolean;
  comparativeTotalAssets: number;
  comparativeTotalLiabilitiesAndEquity: number;
  // Computed equity rows
  retainedEarnings: number;
  currentPeriodEarnings: number;
  comparativeRetainedEarnings: number;
  comparativeCurrentPeriodEarnings: number;
};

export const getBalanceSheet = query({
  args: {
    asOfDate: v.string(),
    fiscalYearStartMonth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BalanceSheetResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const fyStartMonth = args.fiscalYearStartMonth ?? 1;
    const asOf = args.asOfDate;
    const comparativeDate = addYears(asOf, -1);

    // Current fiscal year start
    const fyStart = getFiscalYearStart(fyStartMonth, asOf);
    const comparativeFyStart = addYears(fyStart, -1);

    const accounts = await ctx.db.query("accounts").collect();
    const activeAccounts = accounts.filter((a) => a.isActive);

    const dayAfterAsOf = addDays(asOf, 1);
    const dayAfterComp = addDays(comparativeDate, 1);

    // Build balance maps for both dates
    const balanceMap = await buildBalanceMap(ctx, dayAfterAsOf, activeAccounts);
    const compBalanceMap = await buildBalanceMap(ctx, dayAfterComp, activeAccounts);

    // Compute retained earnings and current period earnings from journal lines
    // Retained Earnings = income - expenses for all lines BEFORE the current FY start
    const [retainedEarnings, comparativeRetainedEarnings] = await Promise.all([
      computeNetIncome(ctx, "0000-01-01", subDays(fyStart, 0), activeAccounts),
      computeNetIncome(ctx, "0000-01-01", subDays(comparativeFyStart, 0), activeAccounts),
    ]);

    // Current Period Earnings = income - expenses for lines within current FY up to asOf
    const [currentPeriodEarnings, comparativeCurrentPeriodEarnings] = await Promise.all([
      computeNetIncome(ctx, fyStart, asOf, activeAccounts),
      computeNetIncome(ctx, comparativeFyStart, comparativeDate, activeAccounts),
    ]);

    function buildSection(
      label: string,
      filter: (a: Doc<"accounts">) => boolean,
    ): BalanceSheetSection {
      const sectionAccounts = activeAccounts.filter(filter);
      const rows = sectionAccounts
        .map((a) => ({
          accountId: a._id as string,
          code: a.code,
          name: a.name,
          // Use contra-aware signed balance
          amount: round2(signedForBalance(a, balanceMap.get(a._id) ?? 0)),
          comparativeAmount: round2(signedForBalance(a, compBalanceMap.get(a._id) ?? 0)),
        }))
        .filter((r) => r.amount !== 0 || r.comparativeAmount !== 0);

      rows.sort((a, b) => a.code.localeCompare(b.code));
      return {
        label,
        rows,
        total: round2(rows.reduce((s, r) => s + r.amount, 0)),
        comparativeTotal: round2(rows.reduce((s, r) => s + r.comparativeAmount, 0)),
      };
    }

    const currentAssets = buildSection("Current Assets", (a) =>
      ["bank", "accounts_receivable", "other_current_asset", "asset"].includes(a.type)
    );
    const nonCurrentAssets = buildSection("Non-Current Assets", (a) =>
      ["fixed_asset", "other_asset"].includes(a.type)
    );
    const currentLiabilities = buildSection("Current Liabilities", (a) =>
      ["accounts_payable", "credit_card", "other_current_liability", "liability"].includes(a.type)
    );
    const nonCurrentLiabilities = buildSection("Non-Current Liabilities", (a) =>
      ["long_term_liability", "loan"].includes(a.type)
    );
    const equity = buildSection("Equity", (a) => a.type === "equity");

    // Add computed equity rows to totals
    const totalEquityWithEarnings = round2(
      equity.total + retainedEarnings + currentPeriodEarnings
    );
    const comparativeTotalEquityWithEarnings = round2(
      equity.comparativeTotal + comparativeRetainedEarnings + comparativeCurrentPeriodEarnings
    );

    const totalAssets = round2(currentAssets.total + nonCurrentAssets.total);
    const totalLiabilitiesAndEquity = round2(
      currentLiabilities.total + nonCurrentLiabilities.total + totalEquityWithEarnings
    );
    const comparativeTotalAssets = round2(currentAssets.comparativeTotal + nonCurrentAssets.comparativeTotal);
    const comparativeTotalLiabilitiesAndEquity = round2(
      currentLiabilities.comparativeTotal + nonCurrentLiabilities.comparativeTotal + comparativeTotalEquityWithEarnings
    );

    return {
      asOfDate: asOf,
      comparativeDate,
      sections: { currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, equity },
      totalAssets,
      totalLiabilitiesAndEquity,
      inBalance: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
      comparativeTotalAssets,
      comparativeTotalLiabilitiesAndEquity,
      retainedEarnings: round2(retainedEarnings),
      currentPeriodEarnings: round2(currentPeriodEarnings),
      comparativeRetainedEarnings: round2(comparativeRetainedEarnings),
      comparativeCurrentPeriodEarnings: round2(comparativeCurrentPeriodEarnings),
    };
  },
});

// ─── 3. Profit & Loss ─────────────────────────────────────────────────────────

export type PLRow = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  amount: number;
  comparativeAmount: number;
  variance: number;
  variancePct: number | null;
  pctOfRevenue: number | null;
};

export type PLResult = {
  startDate: string;
  endDate: string;
  comparativeStartDate: string;
  comparativeEndDate: string;
  // Revenue
  revenueRows: PLRow[];
  totalRevenue: number;
  comparativeTotalRevenue: number;
  // Contra revenue (Sales Returns, Discounts)
  contraRevenueRows: PLRow[];
  totalContraRevenue: number;
  comparativeTotalContraRevenue: number;
  // Net Revenue
  netRevenue: number;
  comparativeNetRevenue: number;
  grossMarginPct: number | null;
  // COGS
  cogsRows: PLRow[];
  totalCogs: number;
  comparativeTotalCogs: number;
  // Gross Profit
  grossProfit: number;
  comparativeGrossProfit: number;
  // Operating Expenses
  expenseRows: PLRow[];
  totalExpenses: number;
  comparativeTotalExpenses: number;
  // Net Profit
  netProfit: number;
  comparativeNetProfit: number;
};

export const getProfitAndLoss = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    comparativeMode: v.optional(v.union(
      v.literal("previous_period"),
      v.literal("same_period_last_year"),
    )),
  },
  handler: async (ctx, args): Promise<PLResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const mode = args.comparativeMode ?? "same_period_last_year";
    const { startDate, endDate } = args;

    // Compute comparative period
    let compStart: string;
    let compEnd: string;
    if (mode === "same_period_last_year") {
      compStart = addYears(startDate, -1);
      compEnd = addYears(endDate, -1);
    } else {
      // Previous period: shift back by the same number of days
      const days = daysBetween(startDate, endDate) + 1;
      compEnd = subDays(startDate, 1);
      compStart = subDays(startDate, days);
    }

    const accounts = await ctx.db.query("accounts").collect();
    const activeAccounts = accounts.filter((a) => a.isActive);

    const [currentLines, comparativeLines] = await Promise.all([
      getPostedLinesForPeriod(ctx, startDate, endDate),
      getPostedLinesForPeriod(ctx, compStart, compEnd),
    ]);

    // Group lines by accountId
    const currentByAccount = groupByAccount(currentLines);
    const compByAccount = groupByAccount(comparativeLines);

    // Build P&L rows for a set of account types
    const buildPLRows = (
      typeFilter: (a: Doc<"accounts">) => boolean,
      isContraPositive = false,
    ): PLRow[] => {
      const relevantAccounts = activeAccounts.filter(typeFilter);
      const rows: PLRow[] = [];

      for (const account of relevantAccounts) {
        const curLines = currentByAccount.get(account._id) ?? [];
        const cmpLines = compByAccount.get(account._id) ?? [];
        // Net amount in the natural direction for P&L presentation
        const amount = round2(netFromLines(curLines, account.normalSide));
        const comparativeAmount = round2(netFromLines(cmpLines, account.normalSide));
        if (amount === 0 && comparativeAmount === 0) continue;
        rows.push({
          accountId: account._id,
          code: account.code,
          name: account.name,
          type: account.type,
          amount,
          comparativeAmount,
          variance: round2(amount - comparativeAmount),
          variancePct: comparativeAmount !== 0 ? round2(((amount - comparativeAmount) / Math.abs(comparativeAmount)) * 100) : null,
          pctOfRevenue: null, // filled in after netRevenue is known
        });
      }

      rows.sort((a, b) => a.code.localeCompare(b.code));
      return rows;
    };

    // Normal income accounts (credit-normal: income, other_income, revenue)
    const revenueRows = buildPLRows((a) =>
      INCOME_TYPES.has(a.type) && a.normalSide === "credit"
    );
    // Contra revenue accounts (income type but debit-normal)
    const contraRevenueRows = buildPLRows((a) =>
      INCOME_TYPES.has(a.type) && a.normalSide === "debit"
    );
    // COGS
    const cogsRows = buildPLRows((a) => a.type === "cost_of_goods_sold");
    // Operating expenses (expense + other_expense, debit-normal only — exclude contra-expense)
    const expenseRows = buildPLRows((a) =>
      EXPENSE_TYPES.has(a.type) && a.type !== "cost_of_goods_sold"
    );

    const totalRevenue = round2(revenueRows.reduce((s, r) => s + r.amount, 0));
    const comparativeTotalRevenue = round2(revenueRows.reduce((s, r) => s + r.comparativeAmount, 0));
    const totalContraRevenue = round2(contraRevenueRows.reduce((s, r) => s + r.amount, 0));
    const comparativeTotalContraRevenue = round2(contraRevenueRows.reduce((s, r) => s + r.comparativeAmount, 0));
    const netRevenue = round2(totalRevenue - totalContraRevenue);
    const comparativeNetRevenue = round2(comparativeTotalRevenue - comparativeTotalContraRevenue);
    const totalCogs = round2(cogsRows.reduce((s, r) => s + r.amount, 0));
    const comparativeTotalCogs = round2(cogsRows.reduce((s, r) => s + r.comparativeAmount, 0));
    const grossProfit = round2(netRevenue - totalCogs);
    const comparativeGrossProfit = round2(comparativeNetRevenue - comparativeTotalCogs);
    const totalExpenses = round2(expenseRows.reduce((s, r) => s + r.amount, 0));
    const comparativeTotalExpenses = round2(expenseRows.reduce((s, r) => s + r.comparativeAmount, 0));
    const netProfit = round2(grossProfit - totalExpenses);
    const comparativeNetProfit = round2(comparativeGrossProfit - comparativeTotalExpenses);

    // Fill in % of net revenue
    const fillPct = (rows: PLRow[]): PLRow[] =>
      rows.map((r) => ({
        ...r,
        pctOfRevenue: netRevenue !== 0 ? round2((r.amount / netRevenue) * 100) : null,
      }));

    return {
      startDate, endDate, comparativeStartDate: compStart, comparativeEndDate: compEnd,
      revenueRows: fillPct(revenueRows),
      totalRevenue, comparativeTotalRevenue,
      contraRevenueRows: fillPct(contraRevenueRows),
      totalContraRevenue, comparativeTotalContraRevenue,
      netRevenue, comparativeNetRevenue,
      grossMarginPct: netRevenue !== 0 ? round2((grossProfit / netRevenue) * 100) : null,
      cogsRows: fillPct(cogsRows),
      totalCogs, comparativeTotalCogs,
      grossProfit, comparativeGrossProfit,
      expenseRows: fillPct(expenseRows),
      totalExpenses, comparativeTotalExpenses,
      netProfit, comparativeNetProfit,
    };
  },
});

// ─── 4. Cash Flow (indirect method) ──────────────────────────────────────────

export type CashFlowRow = {
  label: string;
  amount: number;
  accountId?: string;
  isSubtotal?: boolean;
};

export type CashFlowResult = {
  startDate: string;
  endDate: string;
  netProfit: number;
  operating: CashFlowRow[];
  netOperating: number;
  investing: CashFlowRow[];
  netInvesting: number;
  financing: CashFlowRow[];
  netFinancing: number;
  openingCash: number;
  closingCash: number;
  netChange: number;
  cashAccountsSum: number; // sum of cash/bank account balances at endDate
  reconciliationOk: boolean;
};

export const getCashFlow = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    fiscalYearStartMonth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CashFlowResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const { startDate, endDate } = args;
    const accounts = await ctx.db.query("accounts").collect();
    const activeAccounts = accounts.filter((a) => a.isActive);

    const fyStartMonth = args.fiscalYearStartMonth ?? 1;
    const fyStart = getFiscalYearStart(fyStartMonth, endDate);

    // Net profit for the period
    const netProfit = await computeNetIncome(ctx, startDate, endDate, activeAccounts);

    const periodLines = await getPostedLinesForPeriod(ctx, startDate, endDate);
    const byAccount = groupByAccount(periodLines);

    const dayBeforeStart = subDays(startDate, 1);
    const dayAfterEnd = addDays(endDate, 1);

    // Opening and closing balances for an account type
    const getMovement = async (accountId: Id<"accounts">, normalSide: "debit" | "credit"): Promise<{ open: number; close: number; movement: number }> => {
      const openLines = await getPostedLinesForAccountBefore(ctx, accountId, startDate);
      const closeLines = await getPostedLinesForAccountBefore(ctx, accountId, dayAfterEnd);
      const open = round2(netFromLines(openLines, normalSide));
      const close = round2(netFromLines(closeLines, normalSide));
      return { open, close, movement: round2(close - open) };
    };

    // ── Operating adjustments ─────────────────────────────────────────────────

    // Depreciation / amortisation: expense accounts where subType contains "depreciation" or "amortis"
    const nonCashExpenseAccounts = activeAccounts.filter((a) =>
      EXPENSE_TYPES.has(a.type) &&
      (a.subType?.toLowerCase().includes("depreciation") ||
       a.subType?.toLowerCase().includes("amortis") ||
       a.name.toLowerCase().includes("depreciation") ||
       a.name.toLowerCase().includes("amortis"))
    );

    const depreciationRows: CashFlowRow[] = [];
    for (const acc of nonCashExpenseAccounts) {
      const lines = byAccount.get(acc._id) ?? [];
      const amount = round2(netFromLines(lines, acc.normalSide));
      if (amount !== 0) depreciationRows.push({ label: `Add: ${acc.name}`, amount, accountId: acc._id });
    }

    // Working capital movements
    const arAccounts = activeAccounts.filter((a) => a.type === "accounts_receivable");
    const inventoryAccounts = activeAccounts.filter((a) => a.type === "other_current_asset" && a.subType === "Inventory");
    const apAccounts = activeAccounts.filter((a) => a.type === "accounts_payable");

    const wcRows: CashFlowRow[] = [];

    for (const acc of arAccounts) {
      const { movement } = await getMovement(acc._id, acc.normalSide);
      // Increase in AR = cash outflow (negative)
      if (movement !== 0) wcRows.push({ label: `(Increase)/Decrease in ${acc.name}`, amount: round2(-movement), accountId: acc._id });
    }
    for (const acc of inventoryAccounts) {
      const { movement } = await getMovement(acc._id, acc.normalSide);
      // Increase in Inventory = cash outflow (negative)
      if (movement !== 0) wcRows.push({ label: `(Increase)/Decrease in ${acc.name}`, amount: round2(-movement), accountId: acc._id });
    }
    for (const acc of apAccounts) {
      const { movement } = await getMovement(acc._id, acc.normalSide);
      // Increase in AP = cash inflow (positive) — AP is credit-normal, movement is already credit-positive
      if (movement !== 0) wcRows.push({ label: `Increase/(Decrease) in ${acc.name}`, amount: round2(movement), accountId: acc._id });
    }

    const operating: CashFlowRow[] = [
      { label: "Net Profit", amount: round2(netProfit) },
      ...depreciationRows,
      ...wcRows,
    ];
    const netOperating = round2(operating.reduce((s, r) => s + r.amount, 0));

    // ── Investing ─────────────────────────────────────────────────────────────
    const fixedAssetAccounts = activeAccounts.filter((a) =>
      ["fixed_asset", "other_asset"].includes(a.type)
    );
    const investingRows: CashFlowRow[] = [];
    for (const acc of fixedAssetAccounts) {
      const { movement } = await getMovement(acc._id, acc.normalSide);
      // Increase in fixed assets = cash outflow
      if (movement !== 0) investingRows.push({ label: acc.name, amount: round2(-movement), accountId: acc._id });
    }
    const netInvesting = round2(investingRows.reduce((s, r) => s + r.amount, 0));

    // ── Financing ────────────────────────────────────────────────────────────
    const financingAccountTypes = activeAccounts.filter((a) =>
      ["long_term_liability", "loan", "equity"].includes(a.type)
    );
    const financingRows: CashFlowRow[] = [];
    for (const acc of financingAccountTypes) {
      const { movement } = await getMovement(acc._id, acc.normalSide);
      // Increase in liability/equity = cash inflow
      if (movement !== 0) financingRows.push({ label: acc.name, amount: round2(movement), accountId: acc._id });
    }
    const netFinancing = round2(financingRows.reduce((s, r) => s + r.amount, 0));

    // ── Cash reconciliation ───────────────────────────────────────────────────
    const cashAccounts = activeAccounts.filter((a) => a.type === "bank");
    let openingCash = 0;
    let closingCashFromLines = 0;
    for (const acc of cashAccounts) {
      const openLines = await getPostedLinesForAccountBefore(ctx, acc._id, startDate);
      const closeLines = await getPostedLinesForAccountBefore(ctx, acc._id, dayAfterEnd);
      openingCash += round2(netFromLines(openLines, acc.normalSide));
      closingCashFromLines += round2(netFromLines(closeLines, acc.normalSide));
    }
    const closingCash = round2(openingCash + netOperating + netInvesting + netFinancing);
    const netChange = round2(netOperating + netInvesting + netFinancing);
    const cashAccountsSum = round2(closingCashFromLines);
    const reconciliationOk = Math.abs(closingCash - cashAccountsSum) < 0.01;

    return {
      startDate, endDate,
      netProfit: round2(netProfit),
      operating, netOperating,
      investing: investingRows, netInvesting,
      financing: financingRows, netFinancing,
      openingCash: round2(openingCash),
      closingCash,
      netChange,
      cashAccountsSum,
      reconciliationOk,
    };
  },
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
}

function groupByAccount(
  lines: Array<{ accountId: Id<"accounts">; debit: number; credit: number }>,
): Map<string, Array<{ debit: number; credit: number }>> {
  const map = new Map<string, Array<{ debit: number; credit: number }>>();
  for (const l of lines) {
    const key = l.accountId as string;
    const arr = map.get(key) ?? [];
    arr.push({ debit: l.debit, credit: l.credit });
    map.set(key, arr);
  }
  return map;
}

/**
 * Compute net income (revenue − expenses) from posted journal lines within a
 * date range. Uses contra-account rule: a debit-normal income account
 * (contra-revenue) subtracts from revenue; a credit-normal expense account
 * (contra-expense) subtracts from expenses.
 */
async function computeNetIncome(
  ctx: QueryCtx,
  startDate: string,
  endDate: string,
  accounts: Doc<"accounts">[],
): Promise<number> {
  const lines = await getPostedLinesForPeriod(ctx, startDate, endDate);
  const byAccount = groupByAccount(lines);

  let revenue = 0;
  let expenses = 0;

  for (const account of accounts) {
    if (!account.isActive) continue;
    const cat = getCategory(account.type);
    if (cat !== "income" && cat !== "expense") continue;

    const accLines = byAccount.get(account._id as string) ?? [];
    const net = round2(netFromLines(accLines, account.normalSide));

    if (cat === "income") {
      // Credit-normal income accounts add to revenue; debit-normal (contra) subtract
      if (account.normalSide === "credit") revenue += net;
      else revenue -= net; // contra-revenue subtracts
    } else {
      // Debit-normal expense accounts add to expenses; credit-normal (contra) subtract
      if (account.normalSide === "debit") expenses += net;
      else expenses -= net;
    }
  }

  return round2(revenue - expenses);
}

/**
 * Return the signed balance amount for a balance-sheet account, applying
 * the contra rule: a contra account's net-from-lines value counts negatively
 * in the section total.
 */
function signedForBalance(account: Doc<"accounts">, netFromLinesValue: number): number {
  const cat = getCategory(account.type);
  if (!cat) return 0;
  const natural = NATURAL_SIDE[cat];
  // If the account's normalSide matches the natural side, it adds positively.
  // If it's a contra (e.g. Accum. Depreciation with credit-normal in asset section),
  // the net-from-lines value is positive when it has a credit balance — but it should
  // reduce the section total, so we negate it.
  return account.normalSide === natural ? netFromLinesValue : -netFromLinesValue;
}
