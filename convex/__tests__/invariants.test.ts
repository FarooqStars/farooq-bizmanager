/**
 * Ledger invariant checks.
 *
 * Each function takes a TestContext and asserts a fundamental accounting
 * invariant. They are exported so the scenario tests can call them after
 * every step.
 */
import { expect } from "vitest";
import type { TestContext } from "./helpers.test.ts";
import { getPostedJournalLines, getAllAccounts } from "./helpers.test.ts";
import type { Doc } from "../_generated/dataModel.d.ts";

// ─── Account type classification ─────────────────────────────────────────────

const ASSET_TYPES = new Set([
  "bank",
  "accounts_receivable",
  "other_current_asset",
  "fixed_asset",
  "other_asset",
  "asset",
]);
const LIABILITY_TYPES = new Set([
  "accounts_payable",
  "credit_card",
  "other_current_liability",
  "long_term_liability",
  "loan",
  "liability",
]);
const EQUITY_TYPES = new Set(["equity"]);
const INCOME_TYPES = new Set(["income", "other_income", "revenue"]);
const EXPENSE_TYPES = new Set(["cost_of_goods_sold", "expense", "other_expense"]);

// ─── 1. Ledger Balanced ──────────────────────────────────────────────────────

/**
 * Over ALL posted journal lines, sum(debit) must equal sum(credit) to the
 * exact cent.
 */
export async function expectLedgerBalanced(t: TestContext): Promise<void> {
  const lines = await getPostedJournalLines(t);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

  expect(
    Math.round(totalDebit * 100) / 100
  ).toBe(
    Math.round(totalCredit * 100) / 100
  );
}

// ─── 2. Accounting Equation ──────────────────────────────────────────────────

/**
 * totalAssets === totalLiabilities + totalEquity + (totalRevenue − totalExpenses)
 *
 * Uses the account balances (which should be derived from posted journal lines).
 */
export async function expectAccountingEquation(
  t: TestContext,
  _asOfDate?: string
): Promise<void> {
  const accounts = await getAllAccounts(t);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalRevenue = 0;
  let totalExpenses = 0;

  const NATURAL = {
    asset: "debit",
    liability: "credit",
    equity: "credit",
    income: "credit",
    expense: "debit",
  } as const;

  for (const account of accounts) {
    if (!account.isActive) continue;

    let category: keyof typeof NATURAL | null = null;
    if (ASSET_TYPES.has(account.type)) category = "asset";
    else if (LIABILITY_TYPES.has(account.type)) category = "liability";
    else if (EQUITY_TYPES.has(account.type)) category = "equity";
    else if (INCOME_TYPES.has(account.type)) category = "income";
    else if (EXPENSE_TYPES.has(account.type)) category = "expense";
    if (category === null) continue;

    // Balances are stored relative to each account's own normalSide, so a contra
    // account (normalSide opposite to its category's natural side) counts negatively.
    const signed =
      account.normalSide === NATURAL[category] ? account.balance : -account.balance;

    if (category === "asset") totalAssets += signed;
    else if (category === "liability") totalLiabilities += signed;
    else if (category === "equity") totalEquity += signed;
    else if (category === "income") totalRevenue += signed;
    else totalExpenses += signed;
  }

  const lhs = Math.round(totalAssets * 100) / 100;
  const rhs = Math.round(
    (totalLiabilities + totalEquity + totalRevenue - totalExpenses) * 100
  ) / 100;

  expect(lhs).toBe(rhs);
}

// ─── 3. AR Control matches Subledger ─────────────────────────────────────────

/**
 * The Accounts Receivable control account balance must equal the sum of
 * (totalAmount − amountPaid) over all invoices that are not draft and not void.
 */
export async function expectARControlMatchesSubledger(
  t: TestContext
): Promise<void> {
  const result = await t.run(async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    const arAccount = accounts.find(
      (a) => a.type === "accounts_receivable" && a.isActive
    );
    const arBalance = arAccount?.balance ?? 0;

    const invoices = await ctx.db.query("invoices").collect();
    const subledgerBalance = invoices
      .filter((inv) => inv.status !== "draft" && inv.status !== "void")
      .reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);

    return { arBalance, subledgerBalance };
  });

  expect(Math.round(result.arBalance * 100) / 100).toBe(
    Math.round(result.subledgerBalance * 100) / 100
  );
}

// ─── 4. AP Control matches Subledger ─────────────────────────────────────────

/**
 * The Accounts Payable control account balance must equal the sum of
 * (amount − amountPaid) over all unpaid and partially-paid bills.
 */
export async function expectAPControlMatchesSubledger(
  t: TestContext
): Promise<void> {
  const result = await t.run(async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    const apAccount = accounts.find(
      (a) => a.type === "accounts_payable" && a.isActive
    );
    const apBalance = apAccount?.balance ?? 0;

    const bills = await ctx.db.query("bills").collect();
    const subledgerBalance = bills
      .filter((b) => b.status !== "paid")
      .reduce((sum, b) => sum + (b.amount - (b.amountPaid ?? 0)), 0);

    return { apBalance, subledgerBalance };
  });

  expect(Math.round(result.apBalance * 100) / 100).toBe(
    Math.round(result.subledgerBalance * 100) / 100
  );
}

// ─── 5. Inventory Control matches Valuation ──────────────────────────────────

/**
 * The Inventory control account balance must equal the total valuation
 * produced by the inventory valuation logic.
 *
 * We compute valuation in the same manner as inventoryValuation.getValuationReport:
 * sum of (inventory quantity × weighted average cost from stock movements).
 */
export async function expectInventoryControlMatchesValuation(
  t: TestContext
): Promise<void> {
  const result = await t.run(async (ctx) => {
    // Get inventory control account
    const accounts = await ctx.db.query("accounts").collect();
    const inventoryAccount = accounts.find(
      (a) =>
        a.type === "other_current_asset" &&
        a.subType === "Inventory" &&
        a.isActive
    );
    const controlBalance = inventoryAccount?.balance ?? 0;

    // Calculate total inventory valuation
    const products = await ctx.db
      .query("products")
      .withIndex("by_type", (q) => q.eq("type", "product"))
      .collect();

    let totalValuation = 0;

    for (const product of products) {
      if (!product.isActive) continue;

      // Get inventory quantity
      const inventoryRecords = await ctx.db
        .query("inventory")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();
      const totalQty = inventoryRecords.reduce((sum, r) => sum + r.quantity, 0);
      if (totalQty <= 0) continue;

      // Get stock movements to compute weighted average cost
      const movements = await ctx.db
        .query("stockMovements")
        .withIndex("by_product", (q) => q.eq("productId", product._id))
        .collect();

      const inMovements = movements.filter(
        (m) => m.type === "in" && m.costPerUnit !== undefined && m.costPerUnit > 0
      );

      let unitCost: number;
      if (inMovements.length > 0) {
        const totalCost = inMovements.reduce(
          (sum, m) => sum + (m.costPerUnit ?? 0) * m.quantity,
          0
        );
        const totalInQty = inMovements.reduce((sum, m) => sum + m.quantity, 0);
        unitCost = totalInQty > 0 ? totalCost / totalInQty : (product.costPrice ?? 0);
      } else {
        unitCost = product.costPrice ?? 0;
      }

      totalValuation += unitCost * totalQty;
    }

    return { controlBalance, totalValuation };
  });

  expect(Math.round(result.controlBalance * 100) / 100).toBe(
    Math.round(result.totalValuation * 100) / 100
  );
}
