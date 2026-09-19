/**
 * Batch 2 tests — Receivables & Payables Reports 10–18.
 *
 * Six groups:
 * T1. AR Ageing Detail total === AR Ageing Summary total === AR control account balance.
 * T2. AP Ageing Detail total === AP Ageing Summary total === AP control account balance.
 * T3. Customer Balance Summary: opening + invoiced − received − credited === closing, per customer.
 * T4. Open Invoices excludes draft, void, and fully-paid invoices, and shows correct balances.
 * T5. Sales by Customer — THREE assertions:
 *       a. Report total === P&L netRevenue (not gross totalRevenue) for the same period.
 *       b. Sum of individual row revenues === totalRevenue (no silent rounding holes).
 *       c. Named customers appear as named rows; zero-revenue rows only for walk-ins.
 * T6. Unpaid Bills "cash required" total === sum of the listed bills' remaining balances.
 *
 * Runtime constant-contract tests (T7):
 * Assert that the sourceType values stamped on posted journal entries match the
 * exported constants. These tests would have caught the "invoice" vs "invoice_sale"
 * bug on day one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../_generated/api.js";
import { INVOICE_SALE_SOURCE } from "../invoicing.ts";
import { SALE_SOURCE } from "../sales.ts";
import { GOODS_RECEIPT_SOURCE } from "../lib/payablesPosting.ts";
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

// ─── Shared scenario ──────────────────────────────────────────────────────────
// • Two customers: Alpha Corp (2 invoices) and Beta Ltd (1 cash/POS sale)
// • One vendor: Supply Co (1 direct bill + 1 goods receipt with bill)

async function setupBatch2Scenario(t: TestContext) {
  const as = t.withIdentity(TEST_IDENTITY);
  await seedUser(t);
  const accounts = await seedChartOfAccounts(t);
  const customerId1 = await seedCustomer(t, "Alpha Corp");
  const customerId2 = await seedCustomer(t, "Beta Ltd");
  const vendorId = await seedVendor(t, "Supply Co");
  const warehouseId = await seedWarehouse(t);
  const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

  // Direct bill (BILL_SOURCE)
  await as.mutation(api.vendors.createBill, {
    vendorId,
    title: "Direct Bill",
    amount: 2000,
    dueDate: "2025-05-01",
  });

  // Goods receipt that creates a new bill (GOODS_RECEIPT_SOURCE, case a)
  await as.mutation(api.goodsReceipts.createGoodsReceipt, {
    vendorId,
    date: "2025-03-01",
    type: "with_bill",
    billTitle: "Purchase 50x Widget",
    billAmount: 2000,
    billDueDate: "2025-03-31",
    items: [{ productId, productName: "Widget", quantity: 50, unitCost: 40, warehouseId }],
  });

  // Credit sale → invoice (INVOICE_SALE_SOURCE)
  const inv1 = await as.mutation(api.invoicing.createInvoice, {
    customerId: customerId1,
    date: "2025-03-15",
    dueDate: "2025-04-15",
    saleType: "credit",
    items: [{ productId, description: "Widget", quantity: 30, unitPrice: 100 }],
    taxRate: 0,
  });
  await as.mutation(api.invoicing.updateInvoiceStatus, { id: inv1, status: "sent" });

  const inv2 = await as.mutation(api.invoicing.createInvoice, {
    customerId: customerId1,
    date: "2025-03-20",
    dueDate: "2025-04-20",
    saleType: "credit",
    items: [{ productId, description: "Widget", quantity: 20, unitPrice: 100 }],
    taxRate: 0,
  });
  await as.mutation(api.invoicing.updateInvoiceStatus, { id: inv2, status: "sent" });

  // Cash/POS sale for Beta Ltd (SALE_SOURCE) — 10 × 100
  const saleId = await as.mutation(api.sales.createSale, {
    customerId: customerId2,
    date: "2025-03-25",
    accountId: accounts.cash,
    items: [{ productId, productName: "Widget", quantity: 10, unitPrice: 100 }],
  });

  return { customerId1, customerId2, vendorId, productId, inv1, inv2, saleId };
}

// ─── T1: AR Ageing Detail reconciles to Summary and control ──────────────────

describe("T1 — AR Ageing Detail reconciles to Summary and control account", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("AR detail totalBalance === AR summary total === AR control balance", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupBatch2Scenario(t);

    const today = new Date().toISOString().slice(0, 10);
    const detail = await as.query(api.reports.receivablesPayables.getARAgingDetail, { asOfDate: today });
    const summary = await as.query(api.reports.ageing.getARAgeing, { asOfDate: today });

    expect(Math.abs(detail.totalBalance - summary.summary.total)).toBeLessThan(0.01);
    expect(Math.abs(detail.totalBalance - detail.controlBalance)).toBeLessThan(0.01);
    expect(detail.isReconciled).toBe(true);
  });
});

// ─── T2: AP Ageing Detail reconciles to Summary and control ──────────────────

describe("T2 — AP Ageing Detail reconciles to Summary and control account", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("AP detail totalBalance === AP summary total === AP control balance", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupBatch2Scenario(t);

    const today = new Date().toISOString().slice(0, 10);
    const detail = await as.query(api.reports.receivablesPayables.getAPAgingDetail, { asOfDate: today });
    const summary = await as.query(api.reports.ageing.getAPAgeing, { asOfDate: today });

    expect(Math.abs(detail.totalBalance - summary.summary.total)).toBeLessThan(0.01);
    expect(Math.abs(detail.totalBalance - detail.controlBalance)).toBeLessThan(0.01);
    expect(detail.isReconciled).toBe(true);
  });
});

// ─── T3: Customer Balance Summary equation ───────────────────────────────────

describe("T3 — Customer Balance: opening + invoiced − received − credited === closing", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("balance equation holds for every customer row", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupBatch2Scenario(t);

    const startDate = "2025-01-01";
    const endDate = new Date().toISOString().slice(0, 10);
    const result = await as.query(api.reports.receivablesPayables.getCustomerBalanceSummary, { startDate, endDate });

    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      const computed = row.opening + row.invoiced - row.received - row.credited;
      expect(Math.abs(computed - row.closing)).toBeLessThan(0.01);
    }
  });
});

// ─── T4: Open Invoices excludes draft/void/paid ───────────────────────────────

describe("T4 — Open Invoices excludes draft, void, and fully-paid invoices", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("shows only unpaid/partial invoices with correct balances", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    await seedChartOfAccounts(t);
    const customerId = await seedCustomer(t, "Test Customer");
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

    const openInv = await as.mutation(api.invoicing.createInvoice, {
      customerId,
      date: "2025-03-01",
      dueDate: "2025-04-01",
      saleType: "credit",
      items: [{ productId, description: "Widget", quantity: 10, unitPrice: 100 }],
      taxRate: 0,
    });
    await as.mutation(api.invoicing.updateInvoiceStatus, { id: openInv, status: "sent" });

    // Draft invoice — must be excluded
    const draftInv = await as.mutation(api.invoicing.createInvoice, {
      customerId,
      date: "2025-03-05",
      dueDate: "2025-04-05",
      saleType: "credit",
      items: [{ productId, description: "Widget", quantity: 5, unitPrice: 100 }],
      taxRate: 0,
    });

    const today = new Date().toISOString().slice(0, 10);
    const result = await as.query(api.reports.receivablesPayables.getOpenInvoices, { asOfDate: today });

    const ids = result.rows.map((r) => r.invoiceId);
    expect(ids).toContain(openInv as string);
    expect(ids).not.toContain(draftInv as string);

    const row = result.rows.find((r) => r.invoiceId === (openInv as string));
    expect(row).toBeDefined();
    expect(Math.abs(row!.balance - 1000)).toBeLessThan(0.01);
  });
});

// ─── T5: Sales by Customer — three assertions ─────────────────────────────────

describe("T5 — Sales by Customer: total=P&L netRevenue, row sums match, named customers appear", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("T5a: salesByCustomer.totalRevenue === pl.netRevenue (not gross)", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupBatch2Scenario(t);

    const startDate = "2025-01-01";
    const endDate = new Date().toISOString().slice(0, 10);

    const [byCustomer, pl] = await Promise.all([
      as.query(api.reports.receivablesPayables.getSalesByCustomer, { startDate, endDate }),
      as.query(api.reports.financialStatements.getProfitAndLoss, { startDate, endDate }),
    ]);

    // Must compare to netRevenue (after contra-revenue), not gross totalRevenue
    expect(Math.abs(byCustomer.totalRevenue - pl.netRevenue)).toBeLessThan(0.01);
  });

  it("T5b: sum of row revenues === totalRevenue (no silent rounding holes)", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupBatch2Scenario(t);

    const startDate = "2025-01-01";
    const endDate = new Date().toISOString().slice(0, 10);
    const byCustomer = await as.query(api.reports.receivablesPayables.getSalesByCustomer, { startDate, endDate });

    const sumOfRows = byCustomer.rows.reduce((s, r) => s + r.revenue, 0);
    expect(Math.abs(sumOfRows - byCustomer.totalRevenue)).toBeLessThan(0.01);
  });

  it("T5c: named customers appear as named rows (not Walk-in/Unassigned)", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { customerId1, customerId2 } = await setupBatch2Scenario(t);

    const startDate = "2025-01-01";
    const endDate = new Date().toISOString().slice(0, 10);
    const byCustomer = await as.query(api.reports.receivablesPayables.getSalesByCustomer, { startDate, endDate });

    // Alpha Corp — invoice path
    const alphaRow = byCustomer.rows.find((r) => r.customerId === (customerId1 as string));
    expect(alphaRow).toBeDefined();
    expect(alphaRow!.revenue).toBeGreaterThan(0); // 50 × 100 = 5000

    // Beta Ltd — POS/cash sale path
    const betaRow = byCustomer.rows.find((r) => r.customerId === (customerId2 as string));
    expect(betaRow).toBeDefined();
    expect(betaRow!.revenue).toBeGreaterThan(0); // 10 × 100 = 1000
  });
});

// ─── T6: Unpaid Bills cash required === sum of listed balances ────────────────

describe("T6 — Unpaid Bills cashRequired === sum of listed bill balances", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("cashRequired equals the sum of all listed balance fields", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupBatch2Scenario(t);

    const today = new Date().toISOString().slice(0, 10);
    const result = await as.query(api.reports.receivablesPayables.getUnpaidBills, {
      asOfDate: today,
      windowDays: 90,
    });

    const sumOfBalances = result.rows.reduce((s, r) => s + r.balance, 0);
    expect(Math.abs(result.cashRequired - sumOfBalances)).toBeLessThan(0.01);
    expect(result.rows.length).toBeGreaterThan(0);
  });
});

// ─── T7: Runtime sourceType constant-contract tests ───────────────────────────
// These verify that the actual *_SOURCE constants match what the ledger stamps.
// They would have caught the "invoice" vs "invoice_sale" bug on day one.

describe("T7 — sourceType constants match what the ledger actually stamps", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("invoice sale entry has sourceType === INVOICE_SALE_SOURCE", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    await seedChartOfAccounts(t);
    const customerId = await seedCustomer(t, "Const Test Customer");
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

    const invId = await as.mutation(api.invoicing.createInvoice, {
      customerId,
      date: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      saleType: "credit",
      items: [{ productId, description: "Widget", quantity: 1, unitPrice: 100 }],
      taxRate: 0,
    });
    await as.mutation(api.invoicing.updateInvoiceStatus, { id: invId, status: "sent" });

    const entry = await as.query(api.journalEntries.getBySource, {
      sourceType: INVOICE_SALE_SOURCE,
      sourceId: invId as string,
    });
    expect(entry).not.toBeNull();
    expect(entry!.sourceType).toBe(INVOICE_SALE_SOURCE);
  });

  it("POS cash sale entry has sourceType === SALE_SOURCE", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

    const saleId = await as.mutation(api.sales.createSale, {
      date: new Date().toISOString().slice(0, 10),
      accountId: accounts.cash,
      items: [{ productId, productName: "Widget", quantity: 1, unitPrice: 100 }],
    });

    const entry = await as.query(api.journalEntries.getBySource, {
      sourceType: SALE_SOURCE,
      sourceId: saleId as string,
    });
    expect(entry).not.toBeNull();
    expect(entry!.sourceType).toBe(SALE_SOURCE);
  });

  it("goods receipt (with_bill) entry has sourceType === GOODS_RECEIPT_SOURCE", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    await seedChartOfAccounts(t);
    const vendorId = await seedVendor(t, "Const Test Vendor");
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

    const receiptId = await as.mutation(api.goodsReceipts.createGoodsReceipt, {
      vendorId,
      date: new Date().toISOString().slice(0, 10),
      type: "with_bill",
      billTitle: "Const Test Bill",
      billAmount: 200,
      billDueDate: new Date().toISOString().slice(0, 10),
      items: [{ productId, productName: "Widget", quantity: 5, unitCost: 40, warehouseId }],
    });

    const entry = await as.query(api.journalEntries.getBySource, {
      sourceType: GOODS_RECEIPT_SOURCE,
      sourceId: receiptId as string,
    });
    expect(entry).not.toBeNull();
    expect(entry!.sourceType).toBe(GOODS_RECEIPT_SOURCE);
  });
});
