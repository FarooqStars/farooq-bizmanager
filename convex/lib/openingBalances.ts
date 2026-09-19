// ─────────────────────────────────────────────────────────────────────────────
// Customer and vendor opening balances.
//
// The customer and vendor forms have always had an "opening balance" field,
// but the amount was only saved on the customer/vendor: nothing reached
// Accounts Receivable / Payable, ageing, statements or the Balance Sheet — the
// same silent loss as the "45 clients' opening balances" bug, by another door.
//
// Now an opening balance becomes a real document the rest of the app already
// understands:
//   customer owes you  → an "opening balance" invoice (OB-…), status sent
//                        Dr Accounts Receivable / Cr Opening Balance Equity
//   you owe a vendor   → an "opening balance" bill
//                        Dr Opening Balance Equity / Cr Accounts Payable
// It can then be aged, reminded, paid and voided like any invoice or bill, and
// it never touches revenue or expenses.
//
// Negative amounts (you owe a customer / a vendor owes you) are refused with a
// pointer to Customer Deposits / Vendor Prepayments, which exist for that.
// ─────────────────────────────────────────────────────────────────────────────
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { getControlAccounts, postBalancedEntry, round2 } from "./ledger.ts";
import { nextNumber } from "./docNumber.ts";
import { CUSTOMER_OPENING_BALANCE_SOURCE, VENDOR_OPENING_BALANCE_SOURCE } from "./sourceTypes.ts";
import { enforcePostingDate } from "../closingDate.ts";

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export async function findCustomerOpeningInvoice(ctx: MutationCtx, customerId: Id<"customers">) {
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  return invoices.find((i) => i.isOpeningBalance && i.status !== "void") ?? null;
}

export async function findVendorOpeningBill(ctx: MutationCtx, vendorId: Id<"vendors">) {
  const bills = await ctx.db
    .query("bills")
    .withIndex("by_vendor", (q) => q.eq("vendorId", vendorId))
    .collect();
  return bills.find((b) => b.isOpeningBalance && b.status !== "void") ?? null;
}

export async function postCustomerOpeningBalance(
  ctx: MutationCtx,
  args: { customerId: Id<"customers">; amount: number; date?: string; createdBy: Id<"users"> },
): Promise<Id<"invoices"> | null> {
  const amount = round2(args.amount);
  if (amount === 0) return null;
  if (amount < 0) {
    throw new ConvexError({
      message:
        "A negative opening balance (money you owe the customer) cannot be entered here. Record it as a customer deposit instead.",
      code: "BAD_REQUEST",
    });
  }
  const date = args.date ?? todayIso();
  await enforcePostingDate(ctx, date);

  const allInvoices = await ctx.db.query("invoices").collect();
  const invoiceNumber = nextNumber(allInvoices, (i) => i.invoiceNumber, "OB-", 5);

  const invoiceId = await ctx.db.insert("invoices", {
    invoiceNumber,
    customerId: args.customerId,
    date,
    dueDate: date,
    status: "sent",
    saleType: "credit",
    subtotal: amount,
    totalAmount: amount,
    amountPaid: 0,
    notes: "Opening balance",
    isOpeningBalance: true,
    createdBy: args.createdBy,
  });
  await ctx.db.insert("invoiceItems", {
    invoiceId,
    description: "Opening balance",
    quantity: 1,
    unitPrice: amount,
    subtotal: amount,
  });

  const control = await getControlAccounts(ctx);
  await postBalancedEntry(ctx, {
    date,
    description: `Opening balance ${invoiceNumber}`,
    createdBy: args.createdBy,
    sourceType: CUSTOMER_OPENING_BALANCE_SOURCE,
    sourceId: invoiceId,
    lines: [
      { accountId: control.ar._id, debit: amount, description: "Customer opening balance" },
      { accountId: control.openingBalanceEquity._id, credit: amount, description: "Opening balance equity" },
    ],
  });

  await ctx.db.patch(args.customerId, { openingBalance: amount, openingBalanceDate: date });
  return invoiceId;
}

export async function postVendorOpeningBalance(
  ctx: MutationCtx,
  args: { vendorId: Id<"vendors">; amount: number; date?: string; createdBy: Id<"users"> },
): Promise<Id<"bills"> | null> {
  const amount = round2(args.amount);
  if (amount === 0) return null;
  if (amount < 0) {
    throw new ConvexError({
      message:
        "A negative opening balance (money the vendor owes you) cannot be entered here. Record it as a vendor prepayment instead.",
      code: "BAD_REQUEST",
    });
  }
  const date = args.date ?? todayIso();
  await enforcePostingDate(ctx, date);

  const billId = await ctx.db.insert("bills", {
    vendorId: args.vendorId,
    title: "Opening balance",
    amount,
    billDate: date,
    dueDate: date,
    status: "unpaid",
    notes: "Opening balance",
    isOpeningBalance: true,
  });

  const control = await getControlAccounts(ctx);
  await postBalancedEntry(ctx, {
    date,
    description: "Vendor opening balance",
    createdBy: args.createdBy,
    sourceType: VENDOR_OPENING_BALANCE_SOURCE,
    sourceId: billId,
    lines: [
      { accountId: control.openingBalanceEquity._id, debit: amount, description: "Opening balance equity" },
      { accountId: control.ap._id, credit: amount, description: "Vendor opening balance" },
    ],
  });

  await ctx.db.patch(args.vendorId, { openingBalance: amount, openingBalanceDate: date });
  return billId;
}
