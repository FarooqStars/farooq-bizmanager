/**
 * Milestone 6 tests — Day Book + Reports Hub + Reconciliation Panel.
 *
 * Required assertions:
 *  1. After the standard scenario, all five core reconciliation checks report reconciled.
 *  2. Day Book total debits === total credits for a range covering the whole scenario.
 *  3. A voided entry does not appear in the Day Book.
 *  4. Each Day Book group's subtotal equals the sum of its own rows, and group totals sum to overall total.
 *  5. Health checks 6 (unbalanced), 7 (missing fields), and 9 (orphans) all report zero after the scenario.
 *  6. Deliberately create a draft journal entry, and assert check 8 reports it while checks 1–5 stay reconciled.
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
import { postBalancedEntry } from "../lib/ledger.ts";

// ─── Shared scenario ──────────────────────────────────────────────────────────

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
  await as.mutation(api.invoicing.updateInvoiceStatus, { id: invoiceId, status: "sent" });

  // Pay the invoice (Customer Receipt)
  await as.mutation(api.invoicing.recordPayment, {
    invoiceId,
    amount: 6000,
    date: "2025-03-25",
    method: "bank_transfer",
    accountId: accounts.cash,
  });

  return { accounts, customerId, vendorId, productId, invoiceId };
}

// ─── Test 1: All five core reconciliation checks pass after scenario ──────────

describe("Reconciliation Panel — core checks", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("all five core checks reconciled after standard scenario", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.reconciliation.getReconciliationPanel, {
      asOfDate: "2025-12-31",
    });

    expect(result.allCoreReconciled).toBe(true);

    const coreIds = ["total_balance", "ar_reconciliation", "ap_reconciliation", "inventory_reconciliation", "pl_vs_bs"];
    for (const id of coreIds) {
      const check = result.checks.find((c) => c.id === id);
      expect(check, `check ${id} missing`).toBeDefined();
      expect(check!.reconciled, `check ${id} not reconciled`).toBe(true);
    }
  });
});

// ─── Test 2: Day Book total debits === total credits ──────────────────────────

describe("Day Book — grand total balance", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("total debits === total credits for range covering whole scenario", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.dayBook.getDayBook, {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });

    expect(result.totalDebit).toBeGreaterThan(0);
    expect(result.totalCredit).toBeGreaterThan(0);
    expect(result.inBalance).toBe(true);
    expect(Math.abs(result.totalDebit - result.totalCredit)).toBeLessThan(0.01);
  });
});

// ─── Test 3: Voided entry absent from Day Book ────────────────────────────────

describe("Day Book — voided entries excluded", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("a voided journal entry does not appear in the Day Book", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);

    // Create and post a JE
    const entryId = await as.mutation(api.accounting.createJournalEntry, {
      date: "2025-03-10",
      description: "Manual sale to void",
      lines: [
        { accountId: accounts.cash, debit: 500, credit: 0 },
        { accountId: accounts.salesRevenue, debit: 0, credit: 500 },
      ],
    });
    await as.mutation(api.accounting.postJournalEntry, { id: entryId });

    // Confirm it appears in Day Book
    const before = await as.query(api.reports.dayBook.getDayBook, {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });
    const allRowIds = before.groups.flatMap((g) => g.rows.map((r) => r.journalEntryId));
    expect(allRowIds).toContain(entryId as string);

    // Void the entry
    await as.mutation(api.accounting.voidJournalEntry, { id: entryId });

    // Day Book should now exclude it
    const after = await as.query(api.reports.dayBook.getDayBook, {
      startDate: "2025-03-01",
      endDate: "2025-03-31",
    });
    const afterRowIds = after.groups.flatMap((g) => g.rows.map((r) => r.journalEntryId));
    expect(afterRowIds).not.toContain(entryId as string);
    // Should still be in balance (the void reversal is a new posted entry)
    expect(after.inBalance).toBe(true);
  });
});

// ─── Test 4: Group subtotals sum to overall total ─────────────────────────────

describe("Day Book — group subtotals arithmetic", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("each group's subtotal equals sum of its rows, and group totals sum to overall total", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.dayBook.getDayBook, {
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });

    let sumDebit = 0;
    let sumCredit = 0;

    for (const group of result.groups) {
      // Each group's subtotal must equal sum of its rows
      const rowDebit = group.rows.reduce((s, r) => s + r.debit, 0);
      const rowCredit = group.rows.reduce((s, r) => s + r.credit, 0);

      expect(Math.abs(group.subtotalDebit - rowDebit)).toBeLessThan(0.01);
      expect(Math.abs(group.subtotalCredit - rowCredit)).toBeLessThan(0.01);

      sumDebit += group.subtotalDebit;
      sumCredit += group.subtotalCredit;
    }

    // Group subtotals must sum to overall totals
    expect(Math.abs(sumDebit - result.totalDebit)).toBeLessThan(0.01);
    expect(Math.abs(sumCredit - result.totalCredit)).toBeLessThan(0.01);
  });
});

// ─── Test 5: Health checks 6, 7, 9 all zero after clean scenario ─────────────

describe("Reconciliation Panel — health checks after clean scenario", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("checks 6 (unbalanced), 7 (missing fields), 9 (orphans) are all zero", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await setupScenario(t);

    const result = await as.query(api.reports.reconciliation.getReconciliationPanel, {
      asOfDate: "2025-12-31",
    });

    const check6 = result.checks.find((c) => c.id === "unbalanced_entries");
    const check7 = result.checks.find((c) => c.id === "lines_missing_fields");
    const check9 = result.checks.find((c) => c.id === "orphans");

    expect(check6, "check 6 missing").toBeDefined();
    expect(check7, "check 7 missing").toBeDefined();
    expect(check9, "check 9 missing").toBeDefined();

    expect(check6!.count).toBe(0);
    expect(check6!.reconciled).toBe(true);

    expect(check7!.count).toBe(0);
    expect(check7!.reconciled).toBe(true);

    expect(check9!.count).toBe(0);
    expect(check9!.reconciled).toBe(true);
  });
});

// ─── Test 6: Draft entry — check 8 reports it, core checks stay reconciled ───

describe("Reconciliation Panel — draft entry captured by check 8", () => {
  let t: TestContext;
  beforeEach(() => { t = createTestContext(); });

  it("draft JE older than 30 days appears in check 8 but core checks stay reconciled", async () => {
    const as = t.withIdentity(TEST_IDENTITY);
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);

    // Create a draft journal entry (never post it)
    // Use a date well over 30 days before our asOfDate
    await as.mutation(api.accounting.createJournalEntry, {
      date: "2025-01-01",
      description: "Old draft that was never posted",
      lines: [
        { accountId: accounts.cash, debit: 999, credit: 0 },
        { accountId: accounts.equity, debit: 0, credit: 999 },
      ],
    });
    // Do NOT post it — leave as draft

    // Query reconciliation with asOfDate = 2025-04-01 (91 days after draft date)
    const result = await as.query(api.reports.reconciliation.getReconciliationPanel, {
      asOfDate: "2025-04-01",
    });

    // Check 8 must report the draft
    const check8 = result.checks.find((c) => c.id === "old_drafts");
    expect(check8, "check 8 missing").toBeDefined();
    expect(check8!.count).toBeGreaterThanOrEqual(1);
    expect(check8!.reconciled).toBe(false);

    // Core checks 1–5 must still all be reconciled (draft does not affect posted lines)
    const coreIds = ["total_balance", "ar_reconciliation", "ap_reconciliation", "inventory_reconciliation", "pl_vs_bs"];
    for (const id of coreIds) {
      const check = result.checks.find((c) => c.id === id);
      expect(check, `core check ${id} missing`).toBeDefined();
      expect(check!.reconciled, `core check ${id} not reconciled — draft must not affect balances`).toBe(true);
    }
  });
});
