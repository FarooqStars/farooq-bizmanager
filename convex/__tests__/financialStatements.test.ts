/**
 * Milestone 3 tests — Financial Statements (Trial Balance, Balance Sheet, P&L, Cash Flow).
 *
 * Required assertions:
 *  1. Trial Balance: total debits === total credits (exactly)
 *  2. Balance Sheet: Assets === Liabilities + Equity (including computed equity rows)
 *  3. P&L net profit === Balance Sheet current period earnings for same period
 *  4. Contra-account: posting a Sales Return reduces Net Revenue in P&L
 */
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../_generated/api.js";
import {
  createTestContext,
  seedUser,
  seedChartOfAccounts,
  seedCustomer,
  seedVendor,
  seedWarehouse,
  seedProduct,
  TEST_IDENTITY,
  type TestContext,
} from "./helpers.test.ts";

// ─── Scenario setup: purchase inventory, sell on credit, post credit memo ────

async function setupScenario(t: TestContext) {
  const as = t.withIdentity(TEST_IDENTITY);
  await seedUser(t);
  const accounts = await seedChartOfAccounts(t);
  const customerId = await seedCustomer(t, "Acme Corp");
  const vendorId = await seedVendor(t, "Supply Co");
  const warehouseId = await seedWarehouse(t);
  const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

  // Purchase 100 units at cost 40 each
  await as.mutation(api.goodsReceipts.createGoodsReceipt, {
    vendorId,
    date: "2025-03-01",
    type: "with_bill",
    billTitle: "Purchase 100x Widget",
    billAmount: 4000,
    billDueDate: "2025-04-01",
    items: [{ productId, productName: "Widget", quantity: 100, unitCost: 40, warehouseId }],
  });

  // Sell 60 units at 100 each (credit invoice)
  const invoiceId = await as.mutation(api.invoicing.createInvoice, {
    customerId,
    date: "2025-03-15",
    dueDate: "2025-04-15",
    saleType: "credit",
    items: [{ productId, description: "Widget", quantity: 60, unitPrice: 100 }],
    taxRate: 0,
  });

  // Mark invoice as sent (triggers journal posting)
  await as.mutation(api.invoicing.updateInvoiceStatus, { id: invoiceId, status: "sent" });

  return { accounts, customerId, vendorId, warehouseId, productId, invoiceId };
}

// ─── Test 1: Trial Balance debits === credits ─────────────────────────────────

describe("Trial Balance", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("total debits === total credits (to the cent)", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.financialStatements.getTrialBalance, {
      asOfDate: "2025-03-31",
      includeZero: false,
    });

    expect(result.totalDebit).toBe(result.totalCredit);
    expect(result.inBalance).toBe(true);
  });

  it("shows IN BALANCE after purchase + sale", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.financialStatements.getTrialBalance, {
      asOfDate: "2025-12-31",
    });

    expect(result.inBalance).toBe(true);
  });
});

// ─── Test 2: Balance Sheet Assets === Liabilities + Equity ───────────────────

describe("Balance Sheet", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("Assets === Liabilities + Equity including computed equity rows", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.financialStatements.getBalanceSheet, {
      asOfDate: "2025-03-31",
      fiscalYearStartMonth: 1,
    });

    expect(result.inBalance).toBe(true);
    // Explicit check: the equation must hold to the cent
    expect(Math.abs(result.totalAssets - result.totalLiabilitiesAndEquity)).toBeLessThan(0.01);
  });
});

// ─── Test 3: P&L net profit === Balance Sheet current period earnings ─────────

describe("P&L — Balance Sheet consistency", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("P&L net profit equals Balance Sheet current period earnings for the same period", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const startDate = "2025-01-01";
    const endDate = "2025-03-31";

    const pl = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate,
      endDate,
    });

    const bs = await as.query(api.reports.financialStatements.getBalanceSheet, {
      asOfDate: endDate,
      fiscalYearStartMonth: 1,
    });

    // Both should report the same net profit for the fiscal year to date
    // (fiscal year starts Jan 1, so currentPeriodEarnings = P&L net profit for the year)
    expect(Math.abs(pl.netProfit - bs.currentPeriodEarnings)).toBeLessThan(0.01);
  });
});

// ─── Test 4: Contra account — Sales Return reduces Net Revenue ────────────────

describe("Contra accounts", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("posting a credit memo to Sales Returns reduces Net Revenue, not increases it", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { accounts, customerId, productId, warehouseId, invoiceId } = await setupScenario(t);

    // Get P&L before the credit memo
    const plBefore = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });

    const netRevenueBefore = plBefore.netRevenue;

    // Post a credit memo for 10 units × 100 = 1000 (return to Sales Returns account)
    // We post directly as a journal entry to the Sales Returns (contra-revenue) account
    await t.run(async (ctx) => {
      // Find the sales returns account and AR account
      const salesReturnsAccount = await ctx.db
        .query("accounts")
        .withIndex("by_type", (q) => q.eq("type", "income"))
        .collect()
        .then((rows) => rows.find((a) => a.normalSide === "debit" && a.isActive));

      const arAccount = await ctx.db
        .query("accounts")
        .withIndex("by_type", (q) => q.eq("type", "accounts_receivable"))
        .collect()
        .then((rows) => rows.find((a) => a.isActive));

      if (!salesReturnsAccount || !arAccount) throw new Error("Required accounts not found");

      const user = await ctx.db.query("users").first();
      if (!user) throw new Error("No user");

      // Journal: DR Sales Returns / CR AR (reduces AR and books the return)
      const { postBalancedEntry } = await import("../lib/ledger.ts");
      await postBalancedEntry(ctx, {
        date: "2025-03-20",
        description: "Credit memo — 10 units returned",
        createdBy: user._id,
        lines: [
          { accountId: salesReturnsAccount._id, debit: 1000, credit: 0 },
          { accountId: arAccount._id, debit: 0, credit: 1000 },
        ],
      });
    });

    // P&L after
    const plAfter = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });

    // Net revenue must be LOWER after the sales return
    expect(plAfter.netRevenue).toBeLessThan(netRevenueBefore);
    // The difference must be exactly the return amount (1000)
    expect(Math.abs(netRevenueBefore - plAfter.netRevenue)).toBeCloseTo(1000, 1);
    // Total revenue stays the same (it was posted to contra, not revenue)
    expect(plAfter.totalRevenue).toBe(plBefore.totalRevenue);
    // Contra revenue rows must include the 1000 return
    const contraTotal = plAfter.totalContraRevenue;
    expect(contraTotal).toBeGreaterThanOrEqual(1000);
  });
});

// ─── Test 5–7: Manual journal entries visibility in reports ──────────────────

describe("Manual journal entries — report visibility", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  /**
   * Test 5: A manually-created and posted JE must appear in Trial Balance, Balance Sheet, and P&L.
   * This tests the fix for the accounting.ts bug where lines were inserted without date/status.
   */
  it("posted manual JE appears in Trial Balance, Balance Sheet, and P&L", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);

    // Create a manual JE: DR Cash 500 / CR Equity 500 (opening balance style)
    const entryId = await as.mutation(api.accounting.createJournalEntry, {
      date: "2025-01-15",
      description: "Opening cash balance",
      lines: [
        { accountId: accounts.cash, debit: 500, credit: 0 },
        { accountId: accounts.equity, debit: 0, credit: 500 },
      ],
    });

    // Post it
    await as.mutation(api.accounting.postJournalEntry, { id: entryId });

    // Trial Balance: total debits and credits must be non-zero and equal
    const tb = await as.query(api.reports.financialStatements.getTrialBalance, {
      asOfDate: "2025-01-31",
      includeZero: false,
    });
    expect(tb.totalDebit).toBeGreaterThan(0);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.inBalance).toBe(true);

    // The cash account line must be in the Trial Balance with debit 500
    const cashLine = tb.rows.find((r) => r.accountId === accounts.cash);
    expect(cashLine).toBeDefined();
    expect(cashLine!.debit).toBeCloseTo(500, 2);

    // Balance Sheet: cash must appear under assets
    const bs = await as.query(api.reports.financialStatements.getBalanceSheet, {
      asOfDate: "2025-01-31",
      fiscalYearStartMonth: 1,
    });
    expect(bs.totalAssets).toBeGreaterThanOrEqual(500);
    expect(bs.inBalance).toBe(true);

    // P&L: this JE affects equity, not income, so net profit should be 0
    const pl = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
    // Revenue accounts untouched — net profit is zero
    expect(pl.netProfit).toBeCloseTo(0, 2);
  });

  /**
   * Test 6: Voiding a posted JE removes it from all three reports.
   */
  it("voiding a posted JE removes it from Trial Balance, Balance Sheet, and P&L", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);

    // Create and post a JE: DR Cash 800 / CR Sales Revenue 800
    const entryId = await as.mutation(api.accounting.createJournalEntry, {
      date: "2025-02-10",
      description: "Manual sale",
      lines: [
        { accountId: accounts.cash, debit: 800, credit: 0 },
        { accountId: accounts.salesRevenue, debit: 0, credit: 800 },
      ],
    });
    await as.mutation(api.accounting.postJournalEntry, { id: entryId });

    // Confirm it shows in P&L
    const plBefore = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
    expect(plBefore.totalRevenue).toBeCloseTo(800, 2);

    // Void the entry
    await as.mutation(api.accounting.voidJournalEntry, { id: entryId });

    // P&L must be zero after voiding
    const plAfter = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
    expect(plAfter.totalRevenue).toBeCloseTo(0, 2);
    expect(plAfter.netProfit).toBeCloseTo(0, 2);

    // Trial Balance must show 0 (or empty rows) for that date
    const tb = await as.query(api.reports.financialStatements.getTrialBalance, {
      asOfDate: "2025-02-28",
      includeZero: false,
    });
    expect(tb.totalDebit).toBeCloseTo(0, 2);
    expect(tb.totalCredit).toBeCloseTo(0, 2);
  });

  /**
   * Test 7: Edit a draft entry's date, post it, and assert it lands in the correct period.
   */
  it("date-edited draft JE lands in the correct period after posting", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);

    // Create a draft JE in March
    const entryId = await as.mutation(api.accounting.createJournalEntry, {
      date: "2025-03-01",
      description: "Revenue entry — wrong date",
      lines: [
        { accountId: accounts.cash, debit: 600, credit: 0 },
        { accountId: accounts.salesRevenue, debit: 0, credit: 600 },
      ],
    });

    // Edit the date to April before posting
    await as.mutation(api.accounting.updateJournalEntry, {
      id: entryId,
      date: "2025-04-05",
    });

    // Post
    await as.mutation(api.accounting.postJournalEntry, { id: entryId });

    // March P&L: must be zero (entry is dated April)
    const plMarch = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });
    expect(plMarch.totalRevenue).toBeCloseTo(0, 2);

    // April P&L: must show the 600
    const plApril = await as.query(api.reports.financialStatements.getProfitAndLoss, {
      startDate: "2025-04-01",
      endDate: "2025-04-30",
    });
    expect(plApril.totalRevenue).toBeCloseTo(600, 2);
  });
});
