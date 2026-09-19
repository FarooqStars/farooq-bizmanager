// ─────────────────────────────────────────────────────────────────────────────
// Shared purchase / payables posting helpers.
//
// Every payable money movement (bill creation, goods receipt, bill payment,
// vendor advance) posts a balanced double-entry journal through the single
// ledger posting engine. These helpers never write `accounts.balance`
// directly — they always go through `postBalancedEntry`.
//
// Source-type tags are used so the ledger can post mirror (reversing) entries
// when a source document is cancelled or deleted.
// ─────────────────────────────────────────────────────────────────────────────
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  postBalancedEntry,
  findOrCreateAccount,
  getControlAccounts,
  round2,
} from "./ledger.ts";

// Source-type tags — values live in lib/sourceTypes.ts, re-exported here for
// existing imports that reference this module directly.
import {
  BILL_SOURCE,
  GOODS_RECEIPT_SOURCE,
  BILL_PAYMENT_SOURCE,
  VENDOR_ADVANCE_SOURCE,
} from "./sourceTypes.ts";
export { BILL_SOURCE, GOODS_RECEIPT_SOURCE, BILL_PAYMENT_SOURCE, VENDOR_ADVANCE_SOURCE };

// ─── Fallback offset accounts ────────────────────────────────────────────────

/**
 * Goods Received Not Invoiced — the accrued liability for stock received
 * without a vendor bill yet. Find or create it.
 */
export async function findGrniAccount(ctx: MutationCtx): Promise<Doc<"accounts">> {
  return findOrCreateAccount(ctx, {
    type: "other_current_liability",
    code: "2110",
    name: "Goods Received Not Invoiced",
    subType: "Goods Received Not Invoiced",
    matchSubType: "Goods Received Not Invoiced",
  });
}

/**
 * Uncategorized Expense — the default debit account for a manually recorded
 * bill that has no explicit expense category. Find or create it.
 */
export async function findUncategorizedExpenseAccount(
  ctx: MutationCtx,
): Promise<Doc<"accounts">> {
  return findOrCreateAccount(ctx, {
    type: "expense",
    code: "6900",
    name: "Uncategorized Expense",
    subType: "Uncategorized",
    matchSubType: "Uncategorized",
  });
}

/**
 * Freight & Purchase Variance — absorbs any difference between the vendor bill
 * total and the inventory cost of the goods received (e.g. tax, freight, or a
 * purchase discount). Find or create it.
 */
export async function findPurchaseVarianceAccount(
  ctx: MutationCtx,
): Promise<Doc<"accounts">> {
  return findOrCreateAccount(ctx, {
    type: "cost_of_goods_sold",
    code: "5020",
    name: "Freight & Delivery",
    subType: "Shipping",
    matchSubType: "Shipping",
  });
}

// ─── Goods receipt posting ───────────────────────────────────────────────────

/**
 * Post the balanced entry when inventory is received from a vendor.
 *
 *  - New bill:      Dr Inventory (cost)  /  Cr Accounts Payable (bill amount).
 *                   Any difference between the bill and the inventory cost is
 *                   absorbed by the Freight & Purchase Variance account so the
 *                   AP control still equals the unpaid-bill subledger.
 *  - Existing bill: the bill already credited AP at creation (Dr Expense / Cr
 *                   AP). Receiving the stock reclassifies that expense into
 *                   inventory: Dr Inventory / Cr Uncategorized Expense. AP is
 *                   left untouched so it still equals the subledger.
 *  - No bill:       Dr Inventory (cost) /  Cr Goods Received Not Invoiced.
 *
 * `inventoryCost` is the sum of quantity × unit cost across received lines and
 * must match the increase in the inventory valuation from stock movements.
 */
export async function postGoodsReceipt(
  ctx: MutationCtx,
  args: {
    receiptId: Id<"goodsReceipts">;
    inventoryCost: number;
    /** Bill amount when this receipt CREATED a new bill (credits AP). */
    billAmount?: number;
    /** True when linking to a pre-existing bill (credits expense, not AP). */
    linkedExistingBill?: boolean;
    date: string;
    description: string;
    createdBy: Id<"users">;
  },
): Promise<void> {
  const inventoryCost = round2(args.inventoryCost);
  const control = await getControlAccounts(ctx);

  // Linking to a bill that already posted its AP entry: reclassify the expense
  // that bill creation debited into inventory. Do NOT touch AP again.
  if (args.linkedExistingBill) {
    if (inventoryCost <= 0) return;
    const expense = await findUncategorizedExpenseAccount(ctx);
    await postBalancedEntry(ctx, {
      date: args.date,
      description: args.description,
      createdBy: args.createdBy,
      sourceType: GOODS_RECEIPT_SOURCE,
      sourceId: args.receiptId,
      lines: [
        { accountId: control.inventory._id, debit: inventoryCost, description: "Inventory received" },
        { accountId: expense._id, credit: inventoryCost, description: "Reclassify bill to inventory" },
      ],
    });
    return;
  }

  if (args.billAmount === undefined) {
    // Received without a bill — accrue a GRNI liability for the inventory cost.
    if (inventoryCost <= 0) return;
    const grni = await findGrniAccount(ctx);
    await postBalancedEntry(ctx, {
      date: args.date,
      description: args.description,
      createdBy: args.createdBy,
      sourceType: GOODS_RECEIPT_SOURCE,
      sourceId: args.receiptId,
      lines: [
        { accountId: control.inventory._id, debit: inventoryCost, description: "Inventory received" },
        { accountId: grni._id, credit: inventoryCost, description: "Goods received not invoiced" },
      ],
    });
    return;
  }

  const billAmount = round2(args.billAmount);
  if (billAmount <= 0 && inventoryCost <= 0) return;

  const diff = round2(billAmount - inventoryCost);
  const variance = diff !== 0 ? await findPurchaseVarianceAccount(ctx) : null;

  await postBalancedEntry(ctx, {
    date: args.date,
    description: args.description,
    createdBy: args.createdBy,
    sourceType: GOODS_RECEIPT_SOURCE,
    sourceId: args.receiptId,
    lines: [
      { accountId: control.inventory._id, debit: inventoryCost, description: "Inventory received" },
      // Positive diff (bill > inventory cost) is extra freight/tax → debit.
      // Negative diff (bill < inventory cost) is a purchase discount → credit.
      ...(variance
        ? [
            {
              accountId: variance._id,
              debit: diff > 0 ? diff : 0,
              credit: diff < 0 ? -diff : 0,
              description: "Freight / purchase variance",
            },
          ]
        : []),
      { accountId: control.ap._id, credit: billAmount, description: "Accounts payable" },
    ],
  });
}

// ─── Bill payment posting ────────────────────────────────────────────────────

/**
 * Vendor Credits Clearing — the credit account used when a vendor credit is
 * applied to a bill. (Vendor credit origination is handled in a later
 * milestone; this keeps the payment balanced in the meantime.)
 */
export async function findVendorCreditsClearingAccount(
  ctx: MutationCtx,
): Promise<Doc<"accounts">> {
  return findOrCreateAccount(ctx, {
    type: "other_current_liability",
    code: "2120",
    name: "Vendor Credits",
    subType: "Vendor Credits",
    matchSubType: "Vendor Credits",
  });
}

/**
 * Post the balanced entry for a bill payment. Always debits Accounts Payable
 * (reducing what we owe) and credits the funding source:
 *   - Cash/bank payment:   Cr the chosen cash-or-bank account.
 *   - Advance settlement:  Cr Vendor Prepayments (uses an earlier advance).
 *   - Vendor credit:       Cr Vendor Credits clearing.
 */
export async function postBillPayment(
  ctx: MutationCtx,
  args: {
    paymentId: Id<"billPayments">;
    amount: number;
    date: string;
    description: string;
    createdBy: Id<"users">;
    /** The cash/bank account the money left (for direct payments). */
    cashAccountId?: Id<"accounts">;
    /** Set when settling from a vendor advance. */
    fromVendorAdvance?: boolean;
    /** Set when applying a vendor credit. */
    fromVendorCredit?: boolean;
  },
): Promise<void> {
  const amount = round2(args.amount);
  if (amount <= 0) return;

  const control = await getControlAccounts(ctx);

  let creditAccountId: Id<"accounts">;
  if (args.fromVendorAdvance) {
    creditAccountId = control.vendorPrepaid._id;
  } else if (args.fromVendorCredit) {
    creditAccountId = (await findVendorCreditsClearingAccount(ctx))._id;
  } else if (args.cashAccountId) {
    creditAccountId = args.cashAccountId;
  } else {
    // Nothing to fund the payment with — cannot post a balanced entry.
    return;
  }

  await postBalancedEntry(ctx, {
    date: args.date,
    description: args.description,
    createdBy: args.createdBy,
    sourceType: BILL_PAYMENT_SOURCE,
    sourceId: args.paymentId,
    lines: [
      { accountId: control.ap._id, debit: amount, description: "Accounts payable" },
      { accountId: creditAccountId, credit: amount, description: "Payment source" },
    ],
  });
}

// ─── Vendor advance posting ──────────────────────────────────────────────────

/**
 * Post the balanced entry for money paid to a vendor in advance:
 *   Dr Vendor Prepayments  /  Cr Cash-or-Bank.
 */
export async function postVendorAdvance(
  ctx: MutationCtx,
  args: {
    advanceId: Id<"advancePayments">;
    amount: number;
    date: string;
    description: string;
    createdBy: Id<"users">;
    cashAccountId: Id<"accounts">;
  },
): Promise<void> {
  const amount = round2(args.amount);
  if (amount <= 0) return;

  const control = await getControlAccounts(ctx);

  await postBalancedEntry(ctx, {
    date: args.date,
    description: args.description,
    createdBy: args.createdBy,
    sourceType: VENDOR_ADVANCE_SOURCE,
    sourceId: args.advanceId,
    lines: [
      { accountId: control.vendorPrepaid._id, debit: amount, description: "Vendor prepayment" },
      { accountId: args.cashAccountId, credit: amount, description: "Cash/bank paid" },
    ],
  });
}

// ─── Bill creation posting ───────────────────────────────────────────────────

/**
 * Post the balanced entry for a bill recorded on credit:
 *   Dr <expense/purchases account>  /  Cr Accounts Payable
 *
 * Keeps the AP control account in step with the unpaid-bill subledger. The
 * debit account defaults to Uncategorized Expense when none is supplied.
 */
/**
 * The accounting date of a bill: the day it was issued (billDate).
 *
 * Bills used to post on their DUE date, so a bill received today but due in
 * 30 days stayed out of expenses and Accounts Payable for a month, and the
 * period it belonged to was understated. New bills always carry billDate.
 * Bills created before the fix have none, so they keep their old date
 * (dueDate) — changing it would move amounts between already-reported periods.
 */
export function billPostingDate(bill: { billDate?: string; dueDate: string }): string {
  return bill.billDate ?? bill.dueDate;
}

/** Today's date as YYYY-MM-DD. */
export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export async function postBillCreation(
  ctx: MutationCtx,
  args: {
    billId: Id<"bills">;
    amount: number;
    date: string;
    description: string;
    createdBy: Id<"users">;
    debitAccountId?: Id<"accounts">;
  },
): Promise<void> {
  const amount = round2(args.amount);
  if (amount <= 0) return;

  const control = await getControlAccounts(ctx);
  const debitAccountId =
    args.debitAccountId ?? (await findUncategorizedExpenseAccount(ctx))._id;

  await postBalancedEntry(ctx, {
    date: args.date,
    description: args.description,
    createdBy: args.createdBy,
    sourceType: BILL_SOURCE,
    sourceId: args.billId,
    lines: [
      { accountId: debitAccountId, debit: amount, description: args.description },
      { accountId: control.ap._id, credit: amount, description: "Accounts payable" },
    ],
  });
}
