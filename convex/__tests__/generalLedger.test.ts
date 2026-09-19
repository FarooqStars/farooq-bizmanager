/**
 * Milestone 4 tests — General Ledger Detail (Report 5).
 *
 * Required assertions:
 *  1. Closing balance per account === account.balance (stored ledger total) for every
 *     account after the scenario runs.
 *  2. Opening balance + period debits − period credits === closing balance (debit-normal).
 *     Credit-normal equivalent: opening + (credits − debits) === closing.
 *  3. A voided journal entry does not appear in the GL register and does not affect
 *     the running balance.
 *  4. A bank payment appears exactly once — proving the old bankTransactions
 *     double-listing is gone.
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
  getAllAccounts,
  TEST_IDENTITY,
  type TestContext,
} from "./helpers.test.ts";

async function setupScenario(t: TestContext) {
  const as = t.withIdentity(TEST_IDENTITY);
  await seedUser(t);
  const accounts = await seedChartOfAccounts(t);
  const customerId = await seedCustomer(t, "Acme Corp");
  const vendorId = await seedVendor(t, "Supply Co");
  const warehouseId = await seedWarehouse(t);
  const productId = await seedProduct(t, { name: "Widget", costPrice: 40, unitPrice: 100 });

  // Purchase 50 units at cost 40 each
  await as.mutation(api.goodsReceipts.createGoodsReceipt, {
    vendorId,
    date: "2025-06-01",
    type: "with_bill",
    billTitle: "Purchase 50x Widget",
    billAmount: 2000,
    billDueDate: "2025-07-01",
    items: [{ productId, productName: "Widget", quantity: 50, unitCost: 40, warehouseId }],
  });

  // Sell 30 units on credit
  const invoiceId = await as.mutation(api.invoicing.createInvoice, {
    customerId,
    date: "2025-06-15",
    dueDate: "2025-07-15",
    saleType: "credit",
    items: [{ productId, description: "Widget", quantity: 30, unitPrice: 100 }],
    taxRate: 0,
  });
  await as.mutation(api.invoicing.updateInvoiceStatus, { id: invoiceId, status: "sent" });

  return { accounts, customerId, vendorId, warehouseId, productId, invoiceId };
}

const GL_RANGE = { startDate: "2025-01-01", endDate: "2025-12-31" };

// ─── Test 1: Closing balance per account === account.balance ──────────────────

describe("General Ledger — closing balance reconciliation", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("closing balance from GL equals account.balance for every active account", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const allAccounts = await getAllAccounts(t);

    const result = await as.query(api.reports.generalLedger.getGeneralLedger, {
      ...GL_RANGE,
    });

    for (const glAcc of result.accounts) {
      const dbAcc = allAccounts.find((a) => a._id === glAcc.accountId);
      expect(dbAcc, `Account ${glAcc.code} not found in DB`).toBeDefined();
      expect(glAcc.reconciledOk).toBe(true);
      expect(Math.abs(glAcc.closingBalance - glAcc.storedBalance)).toBeLessThan(0.01);
    }
  });
});

// ─── Test 2: Opening + period movement === closing ────────────────────────────

describe("General Ledger — running balance arithmetic", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("debit-normal: opening + (period debits - period credits) === closing", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { accounts } = await setupScenario(t);

    // AR is debit-normal (accounts_receivable is an asset).
    // The invoice posts DR Accounts Receivable, so it has period activity.
    const result = await as.query(api.reports.generalLedger.getGeneralLedger, {
      ...GL_RANGE,
      accountIds: [accounts.ar],
    });

    const acc = result.accounts[0];
    expect(acc).toBeDefined();
    expect(acc.normalSide).toBe("debit");

    const expected = acc.openingBalance + acc.periodTotalDebit - acc.periodTotalCredit;
    expect(Math.abs(acc.closingBalance - expected)).toBeLessThan(0.01);
  });

  it("credit-normal: opening + (period credits - period debits) === closing", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { accounts } = await setupScenario(t);

    // AP is credit-normal (accounts_payable is a liability).
    // The goods receipt posts CR Accounts Payable, so it has period activity.
    const result = await as.query(api.reports.generalLedger.getGeneralLedger, {
      ...GL_RANGE,
      accountIds: [accounts.ap],
    });

    const acc = result.accounts[0];
    expect(acc).toBeDefined();
    expect(acc.normalSide).toBe("credit");

    const expected = acc.openingBalance + acc.periodTotalCredit - acc.periodTotalDebit;
    expect(Math.abs(acc.closingBalance - expected)).toBeLessThan(0.01);
  });
});

// ─── Test 3: Voided entry excluded ───────────────────────────────────────────

describe("General Ledger — void exclusion", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("voided entry does not appear in GL lines and does not affect running balance", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { accounts } = await setupScenario(t);

    // Create and post a manual JE
    const entryId = await as.mutation(api.accounting.createJournalEntry, {
      date: "2025-06-20",
      description: "Test entry to void",
      lines: [
        { accountId: accounts.cash, debit: 500, credit: 0 },
        { accountId: accounts.equity, debit: 0, credit: 500 },
      ],
    });
    await as.mutation(api.accounting.postJournalEntry, { id: entryId });

    // Snapshot the cash balance before voiding
    const beforeVoid = await as.query(api.reports.generalLedger.getGeneralLedger, {
      ...GL_RANGE,
      accountIds: [accounts.cash],
    });
    const balanceBefore = beforeVoid.accounts[0].closingBalance;
    const lineCountBefore = beforeVoid.accounts[0].lines.length;

    // Void the entry
    await as.mutation(api.accounting.voidJournalEntry, { id: entryId });

    // Re-query
    const afterVoid = await as.query(api.reports.generalLedger.getGeneralLedger, {
      ...GL_RANGE,
      accountIds: [accounts.cash],
    });
    const accAfter = afterVoid.accounts[0];

    // The voided entry's line must not appear
    const voidedLines = accAfter.lines.filter((l) => l.journalEntryId === (entryId as string));
    expect(voidedLines).toHaveLength(0);

    // Line count should be back to what it was before the JE was posted
    expect(accAfter.lines.length).toBe(lineCountBefore - 1);

    // Running balance should be 500 lower (the entry was DR Cash 500)
    expect(Math.abs(accAfter.closingBalance - (balanceBefore - 500))).toBeLessThan(0.01);
  });
});

// ─── Test 4: Bank payment appears exactly once ────────────────────────────────

describe("General Ledger — no bankTransactions double-listing", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("a bank payment appears exactly once in the GL register for the bank account", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    const { accounts, customerId, invoiceId } = await setupScenario(t);

    // Record a cash receipt against the invoice (this posts a journal entry
    // AND writes a bankTransaction row in the old code)
    await as.mutation(api.invoicing.recordPayment, {
      invoiceId,
      amount: 3000,
      date: "2025-06-25",
      method: "bank_transfer",
      reference: "RCPT-001",
      accountId: accounts.cash,
    });

    const result = await as.query(api.reports.generalLedger.getGeneralLedger, {
      ...GL_RANGE,
      accountIds: [accounts.cash],
    });

    const cashAcc = result.accounts[0];
    expect(cashAcc).toBeDefined();

    // All lines should come from journalLines only — no duplicates.
    // The payment of 3000 should appear exactly once.
    const paymentLines = cashAcc.lines.filter((l) => l.debit === 3000 || l.credit === 3000);
    expect(paymentLines.length).toBe(1);
  });
});
