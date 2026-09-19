/**
 * Milestone 5 tests — AR/AP Ageing Summary + Customer Statement.
 *
 * Required assertions:
 *  1. AR Ageing grand total === Accounts Receivable control account balance.
 *  2. AP Ageing grand total === Accounts Payable control account balance.
 *  3. An invoice issued 45 days ago on 60-day terms lands in Current, not in 31–60.
 *  4. A partially-paid invoice appears at its remaining balance, in the bucket matching its own due date.
 *  5. A customer with an unapplied credit memo shows a negative total, not zero.
 *  6. Customer Statement closing balance === that customer's AR sub-ledger total.
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

// ─── Shared setup ─────────────────────────────────────────────────────────────

async function setupARScenario(t: TestContext) {
  const as = t.withIdentity(TEST_IDENTITY);
  await seedUser(t);
  const accounts = await seedChartOfAccounts(t);
  const customerId = await seedCustomer(t, "Acme Corp");
  const vendorId = await seedVendor(t, "Supply Co");
  const warehouseId = await seedWarehouse(t);
  const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

  // Buy stock so there's something to sell
  await as.mutation(api.goodsReceipts.createGoodsReceipt, {
    vendorId,
    date: "2025-03-01",
    type: "with_bill",
    billTitle: "Purchase stock",
    billAmount: 4000,
    billDueDate: "2025-04-01",
    items: [{ productId, productName: "Widget", quantity: 100, unitCost: 40, warehouseId }],
  });

  // Sell 60 units on credit — dueDate 30 days after invoice date
  const invoiceId = await as.mutation(api.invoicing.createInvoice, {
    customerId,
    date: "2025-03-15",
    dueDate: "2025-04-15",
    saleType: "credit",
    items: [{ productId, description: "Widget", quantity: 60, unitPrice: 100 }],
    taxRate: 0,
  });

  await as.mutation(api.invoicing.updateInvoiceStatus, { id: invoiceId, status: "sent" });

  return { accounts, customerId, vendorId, productId, invoiceId, as };
}

// ─── Test 1: AR Ageing grand total === AR control account balance ─────────────

describe("AR Ageing — grand total reconciles to control account", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("ageing total === AR control account balance", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupARScenario(t);

    // Query the ageing report as-of a date after the invoice due date
    const result = await as.query(api.reports.ageing.getARAgeing, { asOfDate: "2025-05-01" });

    // The grand total should equal the AR control account balance
    expect(result.summary.total).toBeGreaterThan(0);

    // Reconciliation check: diff must be zero (or within rounding tolerance)
    expect(Math.abs(result.reconciliationDiff)).toBeLessThan(0.02);
    expect(result.isReconciled).toBe(true);
  });
});

// ─── Test 2: AP Ageing grand total === AP control account balance ─────────────

describe("AP Ageing — grand total reconciles to control account", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("ageing total === AP control account balance", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupARScenario(t);

    const result = await as.query(api.reports.ageing.getAPAgeing, { asOfDate: "2025-05-01" });

    expect(result.summary.total).toBeGreaterThan(0);
    expect(Math.abs(result.reconciliationDiff)).toBeLessThan(0.02);
    expect(result.isReconciled).toBe(true);
  });
});

// ─── Test 3: Invoice issued 45 days ago on 60-day terms → Current ─────────────

describe("AR Ageing — ageing by due date, not invoice date", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("invoice issued 45 days ago with 60-day terms is Current (not overdue)", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);
    const customerId = await seedCustomer(t, "Due-Date Corp");
    const vendorId = await seedVendor(t, "Supply Co");
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

    await as.mutation(api.goodsReceipts.createGoodsReceipt, {
      vendorId,
      date: "2025-01-01",
      type: "with_bill",
      billTitle: "Buy stock",
      billAmount: 4000,
      billDueDate: "2025-02-01",
      items: [{ productId, productName: "Widget", quantity: 100, unitCost: 40, warehouseId }],
    });

    // Invoice date: 2025-03-01 (45 days before as-of 2025-04-15)
    // Due date: 2025-04-30 (60-day terms → due AFTER as-of date → Current)
    const invoiceId = await as.mutation(api.invoicing.createInvoice, {
      customerId,
      date: "2025-03-01",
      dueDate: "2025-04-30",
      saleType: "credit",
      items: [{ productId, description: "Widget", quantity: 10, unitPrice: 100 }],
      taxRate: 0,
    });

    await as.mutation(api.invoicing.updateInvoiceStatus, { id: invoiceId, status: "sent" });

    // as-of 2025-04-15: invoice is 45 days old but due date is still 15 days away → Current
    const result = await as.query(api.reports.ageing.getARAgeing, { asOfDate: "2025-04-15" });

    const customerRow = result.rows.find((r) => r.customerId === customerId);
    expect(customerRow).toBeDefined();
    if (!customerRow) return;

    // Must be in current bucket
    const invoiceDetail = customerRow.invoices.find((inv) => inv.invoiceId === invoiceId);
    expect(invoiceDetail).toBeDefined();
    expect(invoiceDetail?.bucket).toBe("current");

    // Nothing should be in the 31-60 bucket for this invoice
    expect(invoiceDetail?.bucket).not.toBe("days60");
  });
});

// ─── Test 4: Partially-paid invoice at remaining balance ──────────────────────

describe("AR Ageing — partially-paid invoice at remaining balance", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("partially-paid invoice shows remaining balance in correct bucket", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { accounts, customerId, invoiceId } = await setupARScenario(t);

    // Invoice: 6000, due 2025-04-15. Make a partial payment of 2000.
    await as.mutation(api.invoicing.recordPayment, {
      invoiceId,
      amount: 2000,
      date: "2025-03-20",
      method: "bank_transfer",
      accountId: accounts.cash,
    });

    // as-of 2025-05-01: due date (2025-04-15) is 16 days past → bucket days30
    const result = await as.query(api.reports.ageing.getARAgeing, { asOfDate: "2025-05-01" });

    const customerRow = result.rows.find((r) => r.customerId === customerId);
    expect(customerRow).toBeDefined();
    if (!customerRow) return;

    const invDetail = customerRow.invoices.find((inv) => inv.invoiceId === invoiceId);
    expect(invDetail).toBeDefined();
    if (!invDetail) return;

    // Balance should be 6000 - 2000 = 4000, not the full 6000
    expect(invDetail.balance).toBe(4000);
    // Due date is 2025-04-15, as-of is 2025-05-01 = 16 days past → days30 bucket
    expect(invDetail.bucket).toBe("days30");
  });
});

// ─── Test 5: Unapplied credit memo → negative total ──────────────────────────

describe("AR Ageing — unapplied credit memo shows negative total", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("customer with only an unapplied credit memo has negative AR total", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    await seedChartOfAccounts(t);
    const customerId = await seedCustomer(t, "Credit Customer");

    // No invoices — only a credit memo
    await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const userId = users[0]!._id;
      await ctx.db.insert("creditMemos", {
        memoNumber: "CM-001",
        customerId,
        date: "2025-03-01",
        amount: 500,
        reason: "Overpayment refund",
        status: "active",
        createdBy: userId,
      });
    });

    const result = await as.query(api.reports.ageing.getARAgeing, { asOfDate: "2025-04-01" });

    const customerRow = result.rows.find((r) => r.customerId === customerId);
    expect(customerRow).toBeDefined();
    if (!customerRow) return;

    // Total must be negative (credit balance), not zero
    expect(customerRow.total).toBe(-500);
    expect(customerRow.current).toBe(-500);
  });
});

// ─── Test 6: Customer Statement closing balance === AR sub-ledger total ────────

describe("Customer Statement — closing balance === AR sub-ledger", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("statement closing balance matches outstanding invoices sum for that customer", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { customerId, invoiceId } = await setupARScenario(t);

    // Get the statement for the period covering our invoice
    const result = await as.query(api.reports.ageing.getCustomerStatement, {
      customerId,
      startDate: "2025-01-01",
      endDate: "2025-06-30",
      mode: "balance_forward",
    });

    // Get the invoice directly to compute expected outstanding
    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(invoice).toBeDefined();
    if (!invoice) return;

    const expectedOutstanding = invoice.totalAmount - invoice.amountPaid;

    // Closing balance should equal outstanding balance
    expect(result.closingBalance).toBe(expectedOutstanding);
  });
});
