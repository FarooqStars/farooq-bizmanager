/**
 * Credit Control Gate
 * ===================
 * Single enforcement point for all credit sales. Every mutation that creates
 * or promotes a credit invoice must pass through assertCustomerCanBeInvoiced.
 *
 * Two distinct call sites exist — both are intentional, neither is redundant:
 *
 *   PRIMARY (updateInvoiceStatus, batchUpdateInvoiceStatus):
 *     This is the safety boundary. A/R is born here when a credit invoice
 *     leaves draft. The gate fires with the full amount of the invoice.
 *
 *   EARLY WARNING (createInvoice, convertQuotationToInvoice, batch creation,
 *     createSalesOrder, updateInvoice cash→credit):
 *     Tells the salesman BEFORE completing the form, not when trying to send.
 *     Prevents wasted effort. Not the safety boundary — do not remove either.
 *
 * The function returns { warn: true, message } when a customer is approaching
 * 80% of their limit, or { warn: false } when all checks pass without warning.
 * It throws ConvexError on a hard block (blacklisted or over limit).
 *
 * INVARIANT: A null/undefined creditLimit means no limit — same as closingDate.ts.
 * A fresh install with no creditControlSettings row uses CREDIT_CONTROL_DEFAULTS
 * and never blocks a sale.
 */

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel.d.ts";
import { CREDIT_CONTROL_DEFAULTS } from "../creditControlSettings.ts";

export type GateResult = { warn: false } | { warn: true; message: string };

/**
 * Returns outstanding balance for a customer's unpaid credit invoices.
 * Reads via by_customer index, filters in JS — bounded per customer.
 *
 * NOTE: revisit if any customer exceeds 2,000 invoices. At that scale a
 * compound index ["customerId", "status"] would reduce documents read per call.
 */
async function getOutstandingBalance(
  ctx: MutationCtx,
  customerId: Id<"customers">,
): Promise<number> {
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();

  // Outstanding = "has this document posted to A/R?" × "how much is still owed?"
  // The status filter answers the first question only: draft has never posted to A/R,
  // void was cancelled. Neither is a receivable, so neither may reserve any of the
  // customer's credit limit. Every other status (sent, partially_paid, overdue,
  // written_off with remaining > 0) IS a receivable and gets the arithmetic treatment.
  //
  // The arithmetic answers the second question: total - paid - writtenOff.
  // Status is NOT used for the amount — a partially written-off invoice with
  // remaining > 0 is still outstanding regardless of its status field.
  // One definition cannot drift from itself.
  return invoices
    .filter(
      (inv) =>
        inv.saleType === "credit" &&
        // draft has not posted to A/R; void was cancelled. Neither is a
        // receivable, so neither may reserve any of the customer's limit.
        inv.status !== "draft" &&
        inv.status !== "void",
    )
    .reduce(
      (sum, inv) => sum + Math.max(0, inv.totalAmount - inv.amountPaid - (inv.amountWrittenOff ?? 0)),
      0,
    );
}

/** Load settings once; fall back to defaults if no row exists. */
async function loadSettings(ctx: MutationCtx): Promise<{
  doubtfulDays: number | null;
  blacklistDays: number | null;
  writeOffDays: number | null;
}> {
  const rows = await ctx.db.query("creditControlSettings").take(2);
  if (rows.length === 0) return CREDIT_CONTROL_DEFAULTS;
  if (rows.length > 1) {
    console.warn("creditControlSettings has more than one row; using first.");
  }
  return {
    doubtfulDays: rows[0].doubtfulDays ?? null,
    blacklistDays: rows[0].blacklistDays ?? null,
    writeOffDays: rows[0].writeOffDays ?? null,
  };
}

export async function assertCustomerCanBeInvoiced(
  ctx: MutationCtx,
  customerId: Id<"customers">,
  newInvoiceAmount: number,
): Promise<GateResult> {
  const customer = await ctx.db.get(customerId);
  if (!customer) {
    throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
  }

  // ── Check 1: Hold and Blacklist ──────────────────────────────────────────
  // Both "hold" and "blacklisted" block credit sales. The difference is meaning,
  // not effect: hold = "stopped until this is resolved"; blacklisted = "we are
  // finished with this customer". watch is informational only — it does not block.
  // Never add a gate check for "watch" without discussing it here first.
  if (customer.creditStatus === "hold") {
    throw new ConvexError({
      message: `${customer.name} is on credit hold and cannot buy on credit. Contact the account owner to release.`,
      code: "FORBIDDEN",
    });
  }
  if (customer.creditStatus === "blacklisted") {
    throw new ConvexError({
      message: `${customer.name} is blacklisted and cannot buy on credit. Contact the account owner to reinstate.`,
      code: "FORBIDDEN",
    });
  }

  // ── Check 2: Credit limit ─────────────────────────────────────────────────
  // null/undefined creditLimit = no limit (absence of a restriction is not a
  // restriction — same invariant as closingDate.ts).
  let warnResult: GateResult = { warn: false };

  if (customer.creditLimit != null) {
    const outstanding = await getOutstandingBalance(ctx, customerId);
    const projected = outstanding + newInvoiceAmount;

    if (projected > customer.creditLimit) {
      const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      throw new ConvexError({
        message: `Credit limit exceeded for ${customer.name}. Limit: ${fmt(customer.creditLimit)}, outstanding: ${fmt(outstanding)}, this invoice: ${fmt(newInvoiceAmount)}.`,
        code: "CONFLICT",
      });
    }

    if (projected > customer.creditLimit * 0.8) {
      const pct = Math.round((projected / customer.creditLimit) * 100);
      warnResult = {
        warn: true,
        message: `${customer.name} is at ${pct}% of their credit limit (${projected.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${customer.creditLimit.toLocaleString(undefined, { maximumFractionDigits: 2 })}).`,
      };
    }
  }

  // ── Check 3: Overdue threshold ────────────────────────────────────────────
  // Resolve effective threshold: customer override → company default → null (no restriction).
  const settings = await loadSettings(ctx);
  const effectiveBlacklistDays =
    customer.blacklistOverrideDays !== undefined
      ? customer.blacklistOverrideDays
      : settings.blacklistDays;

  if (effectiveBlacklistDays != null) {
    const today = new Date().toISOString().slice(0, 10);
    const cutoffDate = new Date(
      Date.now() - effectiveBlacklistDays * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .collect();

    const pastDue = invoices.find(
      (inv) =>
        inv.saleType === "credit" &&
        ["sent", "partially_paid", "overdue"].includes(inv.status) &&
        inv.dueDate < cutoffDate,
    );

    if (pastDue) {
      const daysOverdue = Math.floor(
        (new Date(today).getTime() - new Date(pastDue.dueDate).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      throw new ConvexError({
        message: `${customer.name} has an invoice (${pastDue.invoiceNumber}) that is ${daysOverdue} days overdue, exceeding the ${effectiveBlacklistDays}-day threshold. Resolve the overdue balance before issuing new credit.`,
        code: "CONFLICT",
      });
    }
  }

  return warnResult;
}
