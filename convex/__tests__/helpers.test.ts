/**
 * Test helpers for the accounting/ledger integration tests.
 *
 * Provides utilities to seed a company with a standard chart of accounts,
 * create customers, vendors, products, and read back journal lines.
 */
import { convexTest } from "convex-test";
import { modules } from "../test.setup.ts";
import schema from "../schema.ts";
import type { Id, Doc } from "../_generated/dataModel.d.ts";

// Re-export convexTest pre-configured with our schema and modules
export function createTestContext() {
  return convexTest(schema, modules);
}

export type TestContext = ReturnType<typeof createTestContext>;

// The fake identity used in all tests (simulates an authenticated owner)
export const TEST_IDENTITY = {
  tokenIdentifier: "https://farooq-bizmanager.local|test-owner-001",
  name: "Test Owner",
  email: "owner@test.com",
};

/**
 * Seed a user with owner role so mutations pass auth checks.
 */
export async function seedUser(t: TestContext): Promise<Id<"users">> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      tokenIdentifier: TEST_IDENTITY.tokenIdentifier,
      name: TEST_IDENTITY.name,
      email: TEST_IDENTITY.email,
      role: "owner",
      isActive: true,
    });
  });
  return userId;
}

/**
 * Standard chart of accounts for testing.
 * Returns a map of logical name → account ID.
 */
export type AccountMap = {
  cash: Id<"accounts">;
  ar: Id<"accounts">;
  inventory: Id<"accounts">;
  ap: Id<"accounts">;
  equity: Id<"accounts">;
  salesRevenue: Id<"accounts">;
  cogs: Id<"accounts">;
  salesReturns: Id<"accounts">;
};

export async function seedChartOfAccounts(t: TestContext): Promise<AccountMap> {
  return await t.run(async (ctx) => {
    const cash = await ctx.db.insert("accounts", {
      code: "1000",
      name: "Cash",
      type: "bank",
      subType: "Cash",
      isActive: true,
      balance: 0,
      normalSide: "debit",
    });
    const ar = await ctx.db.insert("accounts", {
      code: "1100",
      name: "Accounts Receivable",
      type: "accounts_receivable",
      subType: "Trade Receivables",
      isActive: true,
      balance: 0,
      normalSide: "debit",
    });
    const inventory = await ctx.db.insert("accounts", {
      code: "1200",
      name: "Inventory",
      type: "other_current_asset",
      subType: "Inventory",
      isActive: true,
      balance: 0,
      normalSide: "debit",
    });
    const ap = await ctx.db.insert("accounts", {
      code: "2000",
      name: "Accounts Payable",
      type: "accounts_payable",
      subType: "Trade Payables",
      isActive: true,
      balance: 0,
      normalSide: "credit",
    });
    const equity = await ctx.db.insert("accounts", {
      code: "3000",
      name: "Owner Equity",
      type: "equity",
      subType: "Equity",
      isActive: true,
      balance: 0,
      normalSide: "credit",
    });
    const salesRevenue = await ctx.db.insert("accounts", {
      code: "4000",
      name: "Sales Revenue",
      type: "income",
      subType: "Sales",
      isActive: true,
      balance: 0,
      normalSide: "credit",
    });
    const cogs = await ctx.db.insert("accounts", {
      code: "5000",
      name: "Cost of Goods Sold",
      type: "cost_of_goods_sold",
      subType: "Materials",
      isActive: true,
      balance: 0,
      normalSide: "debit",
    });
    const salesReturns = await ctx.db.insert("accounts", {
      code: "4900",
      name: "Sales Returns & Allowances",
      type: "income",
      subType: "Contra Revenue",
      isActive: true,
      balance: 0,
      normalSide: "debit", // contra-revenue is debit-normal
    });

    return { cash, ar, inventory, ap, equity, salesRevenue, cogs, salesReturns };
  });
}

/**
 * Create a test customer. Returns the customer ID.
 */
export async function seedCustomer(
  t: TestContext,
  name = "Test Customer"
): Promise<Id<"customers">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("customers", {
      name,
      email: "customer@test.com",
      isActive: true,
    });
  });
}

/**
 * Create a test vendor. Returns the vendor ID.
 */
export async function seedVendor(
  t: TestContext,
  name = "Test Vendor"
): Promise<Id<"vendors">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vendors", {
      name,
      email: "vendor@test.com",
      isActive: true,
    });
  });
}

/**
 * Create a test warehouse.
 */
export async function seedWarehouse(
  t: TestContext,
  name = "Main Warehouse"
): Promise<Id<"warehouses">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("warehouses", {
      name,
      isActive: true,
    });
  });
}

/**
 * Create a test product with a known cost price and selling price.
 */
export async function seedProduct(
  t: TestContext,
  opts: { name?: string; costPrice?: number; unitPrice?: number } = {}
): Promise<Id<"products">> {
  const { name = "Widget", costPrice = 40, unitPrice = 100 } = opts;
  return await t.run(async (ctx) => {
    return await ctx.db.insert("products", {
      name,
      type: "product",
      costPrice,
      unitPrice,
      isActive: true,
    });
  });
}

/**
 * Read back ALL journal lines in the database (regardless of entry status).
 */
export async function getAllJournalLines(
  t: TestContext
): Promise<Doc<"journalLines">[]> {
  return await t.run(async (ctx) => {
    return await ctx.db.query("journalLines").collect();
  });
}

/**
 * Read back only journal lines belonging to POSTED entries.
 */
export async function getPostedJournalLines(
  t: TestContext
): Promise<Array<Doc<"journalLines"> & { entryDate: string; entryStatus: string }>> {
  return await t.run(async (ctx) => {
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_status", (q) => q.eq("status", "posted"))
      .collect();
    const entryIds = new Set(entries.map((e) => e._id));
    const entryMap = new Map(entries.map((e) => [e._id as string, e]));

    const allLines = await ctx.db.query("journalLines").collect();
    return allLines
      .filter((line) => entryIds.has(line.journalEntryId))
      .map((line) => {
        const entry = entryMap.get(line.journalEntryId as string)!;
        return { ...line, entryDate: entry.date, entryStatus: entry.status };
      });
  });
}

/**
 * Get all accounts with their current balances.
 */
export async function getAllAccounts(t: TestContext): Promise<Doc<"accounts">[]> {
  return await t.run(async (ctx) => {
    return await ctx.db.query("accounts").collect();
  });
}

/**
 * Get inventory quantity for a product across all warehouses.
 */
export async function getInventoryQuantity(
  t: TestContext,
  productId: Id<"products">
): Promise<number> {
  return await t.run(async (ctx) => {
    const records = await ctx.db
      .query("inventory")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect();
    return records.reduce((sum, r) => sum + r.quantity, 0);
  });
}
