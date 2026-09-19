/**
 * Scenario test: Basic purchase → sell → pay → credit memo cycle.
 *
 * This test exercises the exact sequence specified in Phase 0 and asserts
 * all five invariants after every step.
 *
 * Expected outcome at Phase 0: the tests FAIL because the application does
 * not yet route transactions through a ledger posting layer.
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
  getInventoryQuantity,
  getAllAccounts,
  TEST_IDENTITY,
  type TestContext,
  type AccountMap,
} from "./helpers.test.ts";
import {
  expectLedgerBalanced,
  expectAccountingEquation,
  expectARControlMatchesSubledger,
  expectAPControlMatchesSubledger,
  expectInventoryControlMatchesValuation,
} from "./invariants.test.ts";
import type { Id } from "../_generated/dataModel.d.ts";

/**
 * Run all five invariants.
 */
async function assertAllInvariants(t: TestContext): Promise<void> {
  await expectLedgerBalanced(t);
  await expectAccountingEquation(t);
  await expectARControlMatchesSubledger(t);
  await expectAPControlMatchesSubledger(t);
  await expectInventoryControlMatchesValuation(t);
}

describe("Scenario: Basic purchase → sell → pay → credit memo", () => {
  let t: TestContext;
  let userId: Id<"users">;
  let accounts: AccountMap;
  let customerId: Id<"customers">;
  let vendorId: Id<"vendors">;
  let warehouseId: Id<"warehouses">;
  let productId: Id<"products">;

  beforeEach(async () => {
    t = createTestContext();
  });

  it("passes all invariants through the full lifecycle", async () => {
    // Authenticated accessor
    const as = t.withIdentity(TEST_IDENTITY);

    // ─── Step 1: Seed the chart of accounts ────────────────────────────────────
    userId = await seedUser(t);
    accounts = await seedChartOfAccounts(t);
    customerId = await seedCustomer(t, "Customer C");
    vendorId = await seedVendor(t, "Vendor V");
    warehouseId = await seedWarehouse(t);
    productId = await seedProduct(t, {
      name: "Product P",
      costPrice: 40,
      unitPrice: 100,
    });

    await assertAllInvariants(t);

    // ─── Step 2: Purchase 100 units at cost 40 each on credit (bill = 4,000) ──
    await as.mutation(api.goodsReceipts.createGoodsReceipt, {
      vendorId,
      date: "2025-01-15",
      type: "with_bill",
      billTitle: "Purchase 100x Product P",
      billAmount: 4000,
      billDueDate: "2025-02-15",
      items: [
        {
          productId,
          productName: "Product P",
          quantity: 100,
          unitCost: 40,
          warehouseId,
        },
      ],
    });

    await assertAllInvariants(t);

    // ─── Step 3: Pay the vendor 4,000 from the bank ────────────────────────────
    // First find the bill created in step 2
    const bills = await t.run(async (ctx) => {
      return await ctx.db.query("bills").collect();
    });
    const theBill = bills[0]!;

    await as.mutation(api.billPayments.payBill, {
      billId: theBill._id,
      amount: 4000,
      paymentDate: "2025-01-20",
      paymentMethod: "bank_transfer",
      accountId: accounts.cash,
    });

    await assertAllInvariants(t);

    // ─── Step 4: Issue credit invoice to Customer C for 60 units × 100, tax 0%
    const invoiceId = await as.mutation(api.invoicing.createInvoice, {
      customerId,
      date: "2025-02-01",
      dueDate: "2025-03-01",
      saleType: "credit",
      items: [
        {
          productId,
          description: "Product P",
          quantity: 60,
          unitPrice: 100,
        },
      ],
      taxRate: 0,
    });

    // Mark invoice as sent (so it counts in AR subledger)
    await as.mutation(api.invoicing.updateInvoiceStatus, {
      id: invoiceId,
      status: "sent",
    });

    await assertAllInvariants(t);

    // ─── Step 5: Receive partial payment of 3,000 from Customer C ──────────────
    await as.mutation(api.invoicing.recordPayment, {
      invoiceId,
      date: "2025-02-10",
      amount: 3000,
      method: "bank_transfer",
      accountId: accounts.cash,
    });

    await assertAllInvariants(t);

    // ─── Step 6: Issue credit memo for 5 units (500.00) ────────────────────────
    const creditMemoId = await as.mutation(api.invoicing.createCreditMemo, {
      customerId,
      invoiceId,
      date: "2025-02-15",
      amount: 500,
      reason: "Return of 5 units",
    });

    await assertAllInvariants(t);

    // ─── Step 7: Receive remaining balance ─────────────────────────────────────
    // Remaining = 6000 - 3000 - 500 = 2500
    await as.mutation(api.invoicing.recordPayment, {
      invoiceId,
      date: "2025-02-28",
      amount: 2500,
      method: "bank_transfer",
      accountId: accounts.cash,
    });

    await assertAllInvariants(t);

    // ─── Final assertions on specific expected figures ──────────────────────────

    const finalAccounts = await getAllAccounts(t);
    const getBalance = (id: Id<"accounts">) =>
      finalAccounts.find((a) => a._id === id)?.balance ?? 0;

    // Revenue = 6,000
    expect(getBalance(accounts.salesRevenue)).toBe(6000);

    // Sales returns/contra = 500
    expect(getBalance(accounts.salesReturns)).toBe(500);

    // Net revenue = 5,500 (derived, not a single account)
    const netRevenue = getBalance(accounts.salesRevenue) - getBalance(accounts.salesReturns);
    expect(netRevenue).toBe(5500);

    // COGS = 2,400 (60 × 40) less 200 returned to stock = 2,200
    expect(getBalance(accounts.cogs)).toBe(2200);

    // Gross profit = net revenue - COGS = 5500 - 2200 = 3300
    expect(netRevenue - getBalance(accounts.cogs)).toBe(3300);

    // Inventory on hand = 45 units, valued 1,800
    const inventoryQty = await getInventoryQuantity(t, productId);
    expect(inventoryQty).toBe(45);
    expect(getBalance(accounts.inventory)).toBe(1800);

    // AR balance = 0
    expect(getBalance(accounts.ar)).toBe(0);

    // AP balance = 0
    expect(getBalance(accounts.ap)).toBe(0);
  });
});
