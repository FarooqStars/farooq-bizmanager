/**
 * Reports layer tests — Milestone 1.
 *
 * Asserts that after the scenario is posted, every journalLine has the correct
 * denormalized date, status, and accountId matching its parent journalEntry,
 * and that verifyBackfill returns { missing: 0 }.
 *
 * Additional assertions for later milestones will be added to this file.
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
import type { Id } from "../_generated/dataModel.d.ts";

describe("Reports layer — Milestone 1: denormalized fields on journalLines", () => {
  let t: TestContext;

  beforeEach(() => {
    t = createTestContext();
  });

  it("every posted journalLine has date, status matching its parent entry", async () => {
    const as = t.withIdentity(TEST_IDENTITY);

    // ── Seed ───────────────────────────────────────────────────────────────────
    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);
    const customerId = await seedCustomer(t, "Customer C");
    const vendorId = await seedVendor(t, "Vendor V");
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, {
      name: "Product P",
      costPrice: 40,
      unitPrice: 100,
    });

    // ── Post a purchase ────────────────────────────────────────────────────────
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

    // ── Pay the bill ───────────────────────────────────────────────────────────
    const bills = await t.run(async (ctx) => ctx.db.query("bills").collect());
    const theBill = bills[0]!;
    await as.mutation(api.billPayments.payBill, {
      billId: theBill._id,
      amount: 4000,
      paymentDate: "2025-01-20",
      paymentMethod: "bank_transfer",
      accountId: accounts.cash,
    });

    // ── Issue a credit invoice ─────────────────────────────────────────────────
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

    // Mark as sent (posts the ledger entries)
    await as.mutation(api.invoicing.updateInvoiceStatus, {
      id: invoiceId,
      status: "sent",
    });

    // ── Verify denormalized fields ─────────────────────────────────────────────
    await t.run(async (ctx) => {
      const allLines = await ctx.db.query("journalLines").collect();
      const allEntries = await ctx.db.query("journalEntries").collect();
      const entryMap = new Map(allEntries.map((e) => [e._id, e]));

      for (const line of allLines) {
        const entry = entryMap.get(line.journalEntryId);
        expect(entry, `journalLine ${line._id} references missing entry`).toBeDefined();
        if (!entry) continue;

        expect(line.date).toBe(entry.date);
        expect(line.status).toBe(entry.status);
        // accountId is always the required field — it should be present on every line
        expect(line.accountId).toBeDefined();
      }
    });
  });

  it("verifyBackfill returns missing: 0 after all lines are posted with stamped fields", async () => {
    const as = t.withIdentity(TEST_IDENTITY);

    await seedUser(t);
    const accounts = await seedChartOfAccounts(t);
    const vendorId = await seedVendor(t, "Vendor V");
    const warehouseId = await seedWarehouse(t);
    const productId = await seedProduct(t, {
      name: "Product P",
      costPrice: 40,
      unitPrice: 100,
    });

    // Post one transaction so there are journal lines to verify
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

    // The verify query must report zero missing lines (authenticated)
    const result = await as.query(api.migrations.backfillJournalLines.verifyBackfill, {});
    expect(result.missing).toBe(0);
  });
});
