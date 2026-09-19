/**
 * Day Book classifier unit tests.
 *
 * These tests assert WHICH GROUP each of the 29 stamped sourceType values
 * lands in. The six tests in dayBook.test.ts never assert group membership —
 * only that arithmetic sums correctly — which is why the bill_payment / Vendor
 * Payments bug survived. Every sourceType in the codebase is covered here.
 *
 * Also asserts that every <type>_reversal classifies identically to its base
 * type (lib/ledger.ts:239 stamps reversals as `${sourceType}_reversal`).
 *
 * NOTE: Vitest could not run in the original build sandbox (EROFS on
 * node_modules/.vite-temp). These tests must be run in your local environment.
 * No pass count is reported here.
 */
import { describe, it, expect } from "vitest";

// Import the real classifier from dayBook.ts — NOT a local copy.
// Tests that duplicate the logic they are testing prove only that the copy
// agrees with itself; they cannot catch regressions in the original.
import { classifyEntryLabel as classifyEntry, MANUAL_GROUP_LABEL } from "../reports/dayBook.ts";

import {
  INVOICE_SALE_SOURCE,
  INVOICE_COGS_SOURCE,
  SALE_SOURCE,
  SALE_COGS_SOURCE,
  SALE_ADJUSTMENT_SOURCE,
  CREDIT_MEMO_SOURCE,
  RETURN_RESTOCK_SOURCE,
  PAYMENT_SOURCE,
  CUSTOMER_ADVANCE_SOURCE,
  ADVANCE_SETTLEMENT_SOURCE,
  CUSTOMER_DEPOSIT_SOURCE,
  DEPOSIT_APPLICATION_SOURCE,
  RETURN_REFUND_SOURCE,
  ADVANCE_REFUND_SOURCE,
  CUSTOMER_DEPOSIT_REFUND_SOURCE,
  BILL_SOURCE,
  GOODS_RECEIPT_SOURCE,
  BILL_PAYMENT_SOURCE,
  VENDOR_ADVANCE_SOURCE,
  BANK_CHECK_SOURCE,
  BANK_EXPENSE_SOURCE,
  PETTY_CASH_EXPENSE_SOURCE,
  BANK_PAYMENT_SOURCE,
  PETTY_CASH_REPLENISH_SOURCE,
  BANK_TRANSFER_SOURCE,
  BANK_ADJUSTMENT_SOURCE,
  BANK_IMPORT_SOURCE,
  YEAR_END_CLOSE_SOURCE,
  OPENING_BALANCES_SOURCE,
  PRODUCT_OPENING_STOCK_SOURCE,
  CUSTOMER_OPENING_BALANCE_SOURCE,
  VENDOR_OPENING_BALANCE_SOURCE,
  STOCK_ADJUSTMENT_SOURCE,
  PAYROLL_ACCRUAL_SOURCE,
  PAYROLL_EMPLOYER_SI_SOURCE,
  PAYROLL_PAYMENT_SOURCE,
  GRATUITY_ACCRUAL_SOURCE,
  GRATUITY_PAYMENT_SOURCE,
} from "../lib/sourceTypes.ts";

// ─── Group label constants (must match GROUP_DEFS order in dayBook.ts) ────────

const SALES_AND_INVOICES  = "Sales & Invoices";
const CUSTOMER_RECEIPTS   = "Customer Receipts";
const PURCHASES_AND_BILLS = "Purchases & Bills";
const VENDOR_PAYMENTS     = "Vendor Payments";
const BANKING             = "Banking";
const PAYROLL             = "Payroll";
const MANUAL              = MANUAL_GROUP_LABEL;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Day Book classifier — all 34 sourceType values", () => {

  // ── Sales & Invoices ──────────────────────────────────────────────────────
  it("invoice_sale → Sales & Invoices", () =>
    expect(classifyEntry(INVOICE_SALE_SOURCE)).toBe(SALES_AND_INVOICES));
  it("invoice_cogs → Sales & Invoices", () =>
    expect(classifyEntry(INVOICE_COGS_SOURCE)).toBe(SALES_AND_INVOICES));
  it("sale → Sales & Invoices", () =>
    expect(classifyEntry(SALE_SOURCE)).toBe(SALES_AND_INVOICES));
  it("sale_cogs → Sales & Invoices", () =>
    expect(classifyEntry(SALE_COGS_SOURCE)).toBe(SALES_AND_INVOICES));
  it("sale_adjustment → Sales & Invoices", () =>
    expect(classifyEntry(SALE_ADJUSTMENT_SOURCE)).toBe(SALES_AND_INVOICES));
  it("credit_memo → Sales & Invoices", () =>
    expect(classifyEntry(CREDIT_MEMO_SOURCE)).toBe(SALES_AND_INVOICES));
  it("return_restock → Sales & Invoices", () =>
    expect(classifyEntry(RETURN_RESTOCK_SOURCE)).toBe(SALES_AND_INVOICES));

  // ── Customer Receipts ─────────────────────────────────────────────────────
  it("payment → Customer Receipts", () =>
    expect(classifyEntry(PAYMENT_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("customer_advance → Customer Receipts", () =>
    expect(classifyEntry(CUSTOMER_ADVANCE_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("advance_settlement → Customer Receipts", () =>
    expect(classifyEntry(ADVANCE_SETTLEMENT_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("customer_deposit → Customer Receipts", () =>
    expect(classifyEntry(CUSTOMER_DEPOSIT_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("deposit_application → Customer Receipts", () =>
    expect(classifyEntry(DEPOSIT_APPLICATION_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("return_refund → Customer Receipts", () =>
    expect(classifyEntry(RETURN_REFUND_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("advance_refund → Customer Receipts", () =>
    expect(classifyEntry(ADVANCE_REFUND_SOURCE)).toBe(CUSTOMER_RECEIPTS));
  it("customer_deposit_refund → Customer Receipts", () =>
    expect(classifyEntry(CUSTOMER_DEPOSIT_REFUND_SOURCE)).toBe(CUSTOMER_RECEIPTS));

  // ── Purchases & Bills ─────────────────────────────────────────────────────
  it("bill → Purchases & Bills", () =>
    expect(classifyEntry(BILL_SOURCE)).toBe(PURCHASES_AND_BILLS));
  it("goods_receipt → Purchases & Bills", () =>
    expect(classifyEntry(GOODS_RECEIPT_SOURCE)).toBe(PURCHASES_AND_BILLS));

  // ── Vendor Payments ───────────────────────────────────────────────────────
  it("bill_payment → Vendor Payments", () =>
    expect(classifyEntry(BILL_PAYMENT_SOURCE)).toBe(VENDOR_PAYMENTS));
  it("vendor_advance → Vendor Payments", () =>
    expect(classifyEntry(VENDOR_ADVANCE_SOURCE)).toBe(VENDOR_PAYMENTS));

  // ── Banking ───────────────────────────────────────────────────────────────
  it("bank_check → Banking", () =>
    expect(classifyEntry(BANK_CHECK_SOURCE)).toBe(BANKING));
  it("bank_expense → Banking", () =>
    expect(classifyEntry(BANK_EXPENSE_SOURCE)).toBe(BANKING));
  it("petty_cash_expense → Banking", () =>
    expect(classifyEntry(PETTY_CASH_EXPENSE_SOURCE)).toBe(BANKING));
  it("bank_payment → Banking", () =>
    expect(classifyEntry(BANK_PAYMENT_SOURCE)).toBe(BANKING));
  it("petty_cash_replenish → Banking", () =>
    expect(classifyEntry(PETTY_CASH_REPLENISH_SOURCE)).toBe(BANKING));
  it("bank_transfer → Banking", () =>
    expect(classifyEntry(BANK_TRANSFER_SOURCE)).toBe(BANKING));
  it("bank_adjustment → Banking", () =>
    expect(classifyEntry(BANK_ADJUSTMENT_SOURCE)).toBe(BANKING));
  it("bank_import → Banking", () =>
    expect(classifyEntry(BANK_IMPORT_SOURCE)).toBe(BANKING));

  // ── Manual Journal Entries (deliberate fallback) ──────────────────────────
  it("year_end_close → Manual Journal Entries", () =>
    expect(classifyEntry(YEAR_END_CLOSE_SOURCE)).toBe(MANUAL));
  it("opening_balances → Manual Journal Entries", () =>
    expect(classifyEntry(OPENING_BALANCES_SOURCE)).toBe(MANUAL));
  it("product_opening_stock → Manual Journal Entries (opening balance, like opening_balances)", () =>
    expect(classifyEntry(PRODUCT_OPENING_STOCK_SOURCE)).toBe(MANUAL));
  it("customer_opening_balance → Manual Journal Entries", () =>
    expect(classifyEntry(CUSTOMER_OPENING_BALANCE_SOURCE)).toBe(MANUAL));
  it("vendor_opening_balance → Manual Journal Entries", () =>
    expect(classifyEntry(VENDOR_OPENING_BALANCE_SOURCE)).toBe(MANUAL));
  it("stock_adjustment → Manual Journal Entries", () =>
    expect(classifyEntry(STOCK_ADJUSTMENT_SOURCE)).toBe(MANUAL));

  // ── Payroll ───────────────────────────────────────────────────────────────
  it("payroll_accrual → Payroll", () =>
    expect(classifyEntry(PAYROLL_ACCRUAL_SOURCE)).toBe(PAYROLL));
  it("payroll_employer_si → Payroll", () =>
    expect(classifyEntry(PAYROLL_EMPLOYER_SI_SOURCE)).toBe(PAYROLL));
  it("payroll_payment → Payroll", () =>
    expect(classifyEntry(PAYROLL_PAYMENT_SOURCE)).toBe(PAYROLL));
  it("gratuity_accrual → Payroll", () =>
    expect(classifyEntry(GRATUITY_ACCRUAL_SOURCE)).toBe(PAYROLL));
  it("gratuity_payment → Payroll", () =>
    expect(classifyEntry(GRATUITY_PAYMENT_SOURCE)).toBe(PAYROLL));

  // ── undefined / unknown → fallback ───────────────────────────────────────
  it("undefined → Manual Journal Entries", () =>
    expect(classifyEntry(undefined)).toBe(MANUAL));
  it("unknown_type → Manual Journal Entries", () =>
    expect(classifyEntry("unknown_type")).toBe(MANUAL));
});

describe("Day Book classifier — _reversal suffix stripped", () => {
  // Every _reversal must classify the same as its base type.
  // lib/ledger.ts:239 stamps `${sourceType}_reversal` at runtime.
  // These strings DO occur in the database; they are absent from the map
  // intentionally. The stripping rule must not be removed.

  const REVERSIBLE: [string, string][] = [
    [INVOICE_SALE_SOURCE,     SALES_AND_INVOICES],
    [INVOICE_COGS_SOURCE,     SALES_AND_INVOICES],
    [SALE_SOURCE,             SALES_AND_INVOICES],
    [SALE_COGS_SOURCE,        SALES_AND_INVOICES],
    [SALE_ADJUSTMENT_SOURCE,  SALES_AND_INVOICES],
    [CREDIT_MEMO_SOURCE,      SALES_AND_INVOICES],
    [RETURN_RESTOCK_SOURCE,   SALES_AND_INVOICES],
    [PAYMENT_SOURCE,          CUSTOMER_RECEIPTS],
    [CUSTOMER_ADVANCE_SOURCE, CUSTOMER_RECEIPTS],
    [ADVANCE_SETTLEMENT_SOURCE, CUSTOMER_RECEIPTS],
    [RETURN_REFUND_SOURCE,    CUSTOMER_RECEIPTS],
    [ADVANCE_REFUND_SOURCE,   CUSTOMER_RECEIPTS],
    [BILL_SOURCE,             PURCHASES_AND_BILLS],
    [GOODS_RECEIPT_SOURCE,    PURCHASES_AND_BILLS],
    [BILL_PAYMENT_SOURCE,     VENDOR_PAYMENTS],
    [VENDOR_ADVANCE_SOURCE,   VENDOR_PAYMENTS],
    [BANK_ADJUSTMENT_SOURCE,  BANKING],
    [BANK_IMPORT_SOURCE,      BANKING],
    [PAYROLL_ACCRUAL_SOURCE,     PAYROLL],
    [PAYROLL_EMPLOYER_SI_SOURCE, PAYROLL],
    [PAYROLL_PAYMENT_SOURCE,     PAYROLL],
    [GRATUITY_ACCRUAL_SOURCE,    PAYROLL],
    [GRATUITY_PAYMENT_SOURCE,    PAYROLL],
  ];

  for (const [base, expectedGroup] of REVERSIBLE) {
    const reversal = `${base}_reversal`;
    it(`${reversal} → same group as ${base} (${expectedGroup})`, () =>
      expect(classifyEntry(reversal)).toBe(expectedGroup));
  }
});
