/**
 * Acceptance tests for three more silent holes found 19 Sep 2026:
 *
 *  C. Customer opening balance — saved on the customer, never posted.
 *  V. Vendor opening balance   — same, on the vendor.
 *  S. Hand-made stock changes (set level, manual in/out) moved quantities but
 *     never the Inventory account.
 *
 * Checked 19 Sep 2026: with the old behaviour put back, all six tests fail.
 */
import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel.d.ts";
import {
  createTestContext,
  seedUser,
  seedChartOfAccounts,
  seedWarehouse,
  getPostedJournalLines,
  getInventoryQuantity,
  TEST_IDENTITY,
  type TestContext,
} from "./helpers.test.ts";

async function balance(t: TestContext, accountId: Id<"accounts">): Promise<number> {
  const lines = await getPostedJournalLines(t);
  return lines
    .filter((l) => l.accountId === accountId)
    .reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0);
}

describe("C. customer opening balance", () => {
  it("C1: becomes a receivable, not revenue", async () => {
    const t = createTestContext();
    await seedUser(t);
    const a = await seedChartOfAccounts(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const customerId = await as.mutation(api.sales.createCustomer, {
      name: "Old Client",
      openingBalance: 5000,
      openingBalanceDate: "2026-01-01",
    });

    expect(await balance(t, a.ar)).toBe(5000);
    expect(await balance(t, a.salesRevenue)).toBe(0);

    const invoices = await t.run((ctx) =>
      ctx.db.query("invoices").withIndex("by_customer", (q) => q.eq("customerId", customerId)).collect(),
    );
    expect(invoices).toHaveLength(1);
    expect(invoices[0].isOpeningBalance).toBe(true);
    expect(invoices[0].totalAmount).toBe(5000);
  });

  it("C2: can be paid like any invoice", async () => {
    const t = createTestContext();
    await seedUser(t);
    const a = await seedChartOfAccounts(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const customerId = await as.mutation(api.sales.createCustomer, {
      name: "Old Client",
      openingBalance: 2000,
      openingBalanceDate: "2026-01-01",
    });
    const inv = await t.run(async (ctx) =>
      (await ctx.db.query("invoices").withIndex("by_customer", (q) => q.eq("customerId", customerId)).collect())[0],
    );
    await as.mutation(api.invoicing.recordPayment, {
      invoiceId: inv._id,
      date: "2026-02-01",
      amount: 2000,
      method: "bank_transfer",
      accountId: a.cash,
    });

    expect(await balance(t, a.ar)).toBe(0);
    expect(await balance(t, a.cash)).toBe(2000);
    expect(await balance(t, a.salesRevenue)).toBe(0);
  });

  it("C3: voiding it removes it, and a new one can then be entered", async () => {
    const t = createTestContext();
    await seedUser(t);
    const a = await seedChartOfAccounts(t);
    const as = t.withIdentity(TEST_IDENTITY);

    const customerId = await as.mutation(api.sales.createCustomer, {
      name: "Typo Client",
      openingBalance: 9000,
      openingBalanceDate: "2026-01-01",
    });
    await expect(
      as.mutation(api.sales.updateCustomer, { customerId, openingBalance: 900 }),
    ).rejects.toThrow(/already recorded/);

    const inv = await t.run(async (ctx) =>
      (await ctx.db.query("invoices").withIndex("by_customer", (q) => q.eq("customerId", customerId)).collect())[0],
    );
    await as.mutation(api.invoicing.voidInvoice, { id: inv._id });
    expect(await balance(t, a.ar)).toBe(0);

    await as.mutation(api.sales.updateCustomer, { customerId, openingBalance: 900 });
    expect(await balance(t, a.ar)).toBe(900);
  });
});

describe("V. vendor opening balance", () => {
  it("V1: becomes a payable, not an expense", async () => {
    const t = createTestContext();
    await seedUser(t);
    const a = await seedChartOfAccounts(t);
    const as = t.withIdentity(TEST_IDENTITY);

    await as.mutation(api.vendors.createVendor, {
      name: "Old Supplier",
      openingBalance: 3000,
      openingBalanceDate: "2026-01-01",
    });

    expect(await balance(t, a.ap)).toBe(-3000); // credit balance
    expect(await balance(t, a.cogs)).toBe(0);
  });
});

describe("S. hand-made stock changes", () => {
  async function productWithStock(t: TestContext) {
    const as = t.withIdentity(TEST_IDENTITY);
    const wh = await seedWarehouse(t);
    const productId = await as.mutation(api.products.createProduct, {
      name: "Chair",
      type: "product",
      unitPrice: 100,
      costPrice: 40,
      openingStock: 10,
      openingStockValue: 400,
      openingStockDate: "2026-01-01",
      openingStockWarehouseId: wh,
    });
    return { as, wh, productId };
  }

  it("S1: setting a lower stock level takes the value out of Inventory", async () => {
    const t = createTestContext();
    await seedUser(t);
    const a = await seedChartOfAccounts(t);
    const { as, wh, productId } = await productWithStock(t);

    await as.mutation(api.products.setInventoryLevel, { productId, warehouseId: wh, quantity: 7 });

    expect(await getInventoryQuantity(t, productId)).toBe(7);
    expect(await balance(t, a.inventory)).toBe(280); // 7 × 40
  });

  it("S2: a manual stock-in adds value to Inventory", async () => {
    const t = createTestContext();
    await seedUser(t);
    const a = await seedChartOfAccounts(t);
    const { as, wh, productId } = await productWithStock(t);

    await as.mutation(api.stockMovements.recordMovement, {
      productId,
      warehouseId: wh,
      type: "in",
      quantity: 5,
      reason: "adjustment",
    });

    expect(await getInventoryQuantity(t, productId)).toBe(15);
    expect(await balance(t, a.inventory)).toBe(600); // 15 × 40
  });
});
