/**
 * Acceptance tests for two holes found by using the app with demo data
 * (19 Sep 2026) — both invisible to the existing suite:
 *
 *  A. Opening stock typed on the product form never reached the warehouse or
 *     the ledger. After a sale, stock read 0 and Inventory went NEGATIVE on
 *     the Balance Sheet.
 *
 *  B. Bills posted to the ledger on their DUE date instead of the day they
 *     were issued. A bill received today, due in 30 days, was missing from
 *     expenses and Accounts Payable for a month.
 *
 * Checked 19 Sep 2026: with the old behaviour put back, all three A tests and
 * the first B test fail. The other two B tests guard the new rules added with
 * the fix (due date not before bill date; moving the bill date re-posts).
 */
import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import {
  createTestContext,
  seedUser,
  seedChartOfAccounts,
  seedWarehouse,
  seedVendor,
  getPostedJournalLines,
  getInventoryQuantity,
  TEST_IDENTITY,
} from "./helpers.test.ts";

function balanceOf(
  lines: Array<{ accountId: string; debit?: number; credit?: number }>,
  accountId: string,
): number {
  return lines
    .filter((l) => l.accountId === accountId)
    .reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0);
}

describe("A. opening stock", () => {
  it("puts the quantity in the warehouse and the value in the ledger", async () => {
    const t = createTestContext();
    await seedUser(t);
    const accts = await seedChartOfAccounts(t);
    const wh = await seedWarehouse(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const productId = await as.mutation(api.products.createProduct, {
      name: "Office Chair",
      type: "product",
      unitPrice: 650,
      costPrice: 380,
      openingStock: 10,
      openingStockValue: 3800,
      openingStockDate: "2026-01-01",
      openingStockWarehouseId: wh,
    });

    expect(await getInventoryQuantity(t, productId)).toBe(10);

    const lines = await getPostedJournalLines(t);
    expect(balanceOf(lines, accts.inventory)).toBe(3800);
    // Credit side is Opening Balance Equity, whatever its id.
    const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it("keeps inventory positive after a sale of part of the opening stock", async () => {
    const t = createTestContext();
    await seedUser(t);
    const accts = await seedChartOfAccounts(t);
    const wh = await seedWarehouse(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const productId = await as.mutation(api.products.createProduct, {
      name: "Desk",
      type: "product",
      unitPrice: 1000,
      costPrice: 600,
      openingStock: 5,
      openingStockValue: 3000,
      openingStockDate: "2026-01-01",
      openingStockWarehouseId: wh,
    });

    await as.mutation(api.sales.createSale, {
      date: "2026-02-01",
      accountId: accts.cash,
      items: [{ productId, productName: "Desk", quantity: 2, unitPrice: 1000 }],
    });

    const lines = await getPostedJournalLines(t);
    // 3000 in, 2 × 600 out.
    expect(balanceOf(lines, accts.inventory)).toBe(1800);
  });

  it("does not post twice, and refuses to rewrite opening stock once recorded", async () => {
    const t = createTestContext();
    await seedUser(t);
    const accts = await seedChartOfAccounts(t);
    const wh = await seedWarehouse(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const productId = await as.mutation(api.products.createProduct, {
      name: "Monitor",
      type: "product",
      unitPrice: 1150,
      costPrice: 800,
      openingStock: 4,
      openingStockValue: 3200,
      openingStockDate: "2026-01-01",
      openingStockWarehouseId: wh,
    });

    // Saving the form again with the same figures is harmless.
    await as.mutation(api.products.updateProduct, {
      productId,
      name: "Monitor 27",
      openingStock: 4,
      openingStockValue: 3200,
    });
    expect(await getInventoryQuantity(t, productId)).toBe(4);
    expect(balanceOf(await getPostedJournalLines(t), accts.inventory)).toBe(3200);

    // Changing the recorded opening figures is refused.
    await expect(
      as.mutation(api.products.updateProduct, { productId, openingStock: 40 }),
    ).rejects.toThrow(/already recorded/);
  });
});

describe("B. bill date", () => {
  it("posts a bill on its bill date, not its due date", async () => {
    const t = createTestContext();
    await seedUser(t);
    await seedChartOfAccounts(t);
    const vendorId = await seedVendor(t);
    const as = t.withIdentity(TEST_IDENTITY);

    await as.mutation(api.vendors.createBill, {
      vendorId,
      title: "Stock purchase",
      amount: 5000,
      billDate: "2026-03-01",
      dueDate: "2026-03-31",
    });

    const lines = await getPostedJournalLines(t);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.entryDate).toBe("2026-03-01");
  });

  it("refuses a due date before the bill date", async () => {
    const t = createTestContext();
    await seedUser(t);
    await seedChartOfAccounts(t);
    const vendorId = await seedVendor(t);
    const as = t.withIdentity(TEST_IDENTITY);

    await expect(
      as.mutation(api.vendors.createBill, {
        vendorId,
        title: "Backwards",
        amount: 100,
        billDate: "2026-03-31",
        dueDate: "2026-03-01",
      }),
    ).rejects.toThrow(/due date cannot be before/);
  });

  it("moving the bill date re-posts the bill on the new date", async () => {
    const t = createTestContext();
    await seedUser(t);
    await seedChartOfAccounts(t);
    const vendorId = await seedVendor(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const billId = await as.mutation(api.vendors.createBill, {
      vendorId,
      title: "Rent",
      amount: 2000,
      billDate: "2026-04-01",
      dueDate: "2026-04-30",
    });
    await as.mutation(api.vendors.updateBill, { billId, billDate: "2026-04-05" });

    const lines = await getPostedJournalLines(t);
    const byDate = (d: string) =>
      lines.filter((l) => l.entryDate === d).reduce((s, l) => s + (l.credit ?? 0) - (l.debit ?? 0), 0);
    // Net effect lands on the new date only.
    expect(byDate("2026-04-05")).toBe(0); // balanced entry: credits = debits
    const onNewDate = lines.filter((l) => l.entryDate === "2026-04-05" && (l.credit ?? 0) === 2000);
    expect(onNewDate.length).toBe(1);
  });
});
