import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getUser } from "./users.ts";
import { assertOwner, getCurrentUser } from "./lib/auth.ts";
import { enforcePostingDate } from "./closingDate.ts";
import type { Id } from "./_generated/dataModel.d.ts";
import { postBalancedEntry, getControlAccounts, round2, reverseEntriesForSource } from "./lib/ledger.ts";
import {
  requireCashAccount,
  computeCogsTotal,
  postCogsEntry,
  deductInventoryForSale,
  restockInventoryForSaleReversal,
} from "./lib/salesPosting.ts";
import { logAudit } from "./lib/audit.ts";
import { postCustomerOpeningBalance, findCustomerOpeningInvoice } from "./lib/openingBalances.ts";

// Source-type tags — values live in lib/sourceTypes.ts, re-exported here for
// existing imports that reference this module directly.
import { SALE_SOURCE, SALE_COGS_SOURCE, SALE_ADJUSTMENT_SOURCE } from "./lib/sourceTypes.ts";
export { SALE_SOURCE };

// ── Customers ─────────────────────────────────────────────────────────────────

export const listCustomers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("customers").collect();
  },
});

export const createCustomer = mutation({
  args: {
    name: v.string(),
    companyName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    fax: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    taxId: v.optional(v.string()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    creditLimit: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    openingBalance: v.optional(v.number()),
    openingBalanceDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    tier: v.optional(v.union(
      v.literal("retail"),
      v.literal("wholesale"),
      v.literal("vip"),
      v.literal("distributor")
    )),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const customerId = await ctx.db.insert("customers", args);

    // Opening balance → a real receivable (see lib/openingBalances.ts).
    if (args.openingBalance) {
      await postCustomerOpeningBalance(ctx, {
        customerId,
        amount: args.openingBalance,
        date: args.openingBalanceDate,
        createdBy: caller._id,
      });
    }

    // Audit every customer creation.
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "sales:createCustomer",
      resourceType: "customer",
      resourceId: customerId,
      action: "customer_created",
      afterValue: JSON.stringify({ name: args.name, creditLimit: args.creditLimit }),
      details: `Customer "${args.name}" created`,
    });

    // If an initial credit limit was set, write an opening history row so the
    // owner can see who set it and when. No role check — creating customers is
    // ordinary staff work; the trace is what matters.
    if (args.creditLimit !== undefined) {
      await ctx.db.insert("creditLimitHistory", {
        customerId,
        changedBy: caller._id,
        changedAt: new Date().toISOString(),
        fromLimit: undefined,   // null = first ever record
        toLimit: args.creditLimit,
        reason: "Initial limit at creation",
      });
    }

    return customerId;
  },
});

export const updateCustomer = mutation({
  args: {
    customerId: v.id("customers"),
    name: v.optional(v.string()),
    companyName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    fax: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    taxId: v.optional(v.string()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    // creditLimit intentionally absent — use updateCustomerCreditLimit (owner-only,
    // audited). Callers that send creditLimit will receive a validation error rather
    // than silently succeeding with no history row.
    accountId: v.optional(v.id("accounts")),
    openingBalance: v.optional(v.number()),
    openingBalanceDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    tier: v.optional(v.union(
      v.literal("retail"),
      v.literal("wholesale"),
      v.literal("vip"),
      v.literal("distributor")
    )),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    const { customerId, ...updates } = args;
    const before = await ctx.db.get(customerId);
    if (!before) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // The opening balance is posted once, as an opening-balance invoice.
    const openingChanged =
      (updates.openingBalance !== undefined && updates.openingBalance !== before.openingBalance) ||
      (updates.openingBalanceDate !== undefined && updates.openingBalanceDate !== before.openingBalanceDate);
    const existingOpening = await findCustomerOpeningInvoice(ctx, customerId);
    if (openingChanged && existingOpening) {
      throw new ConvexError({
        message: `The opening balance is already recorded as ${existingOpening.invoiceNumber}. Void that invoice first to enter a different one.`,
        code: "BAD_REQUEST",
      });
    }
    const { openingBalance, openingBalanceDate, ...rest } = updates;
    await ctx.db.patch(customerId, rest);

    if (openingChanged && !existingOpening && openingBalance) {
      await postCustomerOpeningBalance(ctx, {
        customerId,
        amount: openingBalance,
        date: openingBalanceDate ?? before.openingBalanceDate,
        createdBy: caller._id,
      });
    }
  },
});

// ── Sales ─────────────────────────────────────────────────────────────────────

export const listSales = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const sales = await ctx.db.query("sales").order("desc").collect();
    const customers = await ctx.db.query("customers").collect();
    const users = await ctx.db.query("users").collect();
    const customerMap = new Map(customers.map((c) => [c._id, c]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return sales.map((s) => ({
      ...s,
      customer: s.customerId ? customerMap.get(s.customerId) ?? null : null,
      recordedByUser: userMap.get(s.recordedBy) ?? null,
    }));
  },
});

export const getSaleWithItems = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new ConvexError({ message: "Sale not found", code: "NOT_FOUND" });

    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();

    const customer = sale.customerId ? await ctx.db.get(sale.customerId) : null;
    const recordedByUser = await ctx.db.get(sale.recordedBy);

    return { ...sale, items, customer, recordedByUser };
  },
});

export const createSale = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    date: v.string(),
    notes: v.optional(v.string()),
    // Real cash/bank/drawer account the sale proceeds are received into.
    accountId: v.id("accounts"),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    })),
  },
  handler: async (ctx, args): Promise<Id<"sales">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    if (args.items.length === 0) throw new ConvexError({ message: "Sale must have at least one item", code: "BAD_REQUEST" });

    // Validate the receiving account up-front (a POS sale moves money immediately).
    const account = await requireCashAccount(ctx, args.accountId);

    const totalAmount = round2(args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));

    const saleId = await ctx.db.insert("sales", {
      customerId: args.customerId,
      customerName: args.customerName,
      date: args.date,
      status: "completed",
      notes: args.notes,
      totalAmount,
      recordedBy: caller._id,
    });

    for (const item of args.items) {
      await ctx.db.insert("saleItems", {
        saleId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      });
    }

    // Post the cash sale through the ledger: Dr Cash/Bank / Cr Revenue.
    if (totalAmount > 0) {
      const control = await getControlAccounts(ctx);
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `POS sale${args.customerName ? ` — ${args.customerName}` : ""}`,
        createdBy: caller._id,
        sourceType: SALE_SOURCE,
        sourceId: saleId,
        lines: [
          { accountId: account._id, debit: totalAmount, description: "Cash received" },
          { accountId: control.revenue._id, credit: totalAmount, description: "Sales revenue" },
        ],
      });

      // Recognise cost of goods sold and reduce stock for physical products, the
      // same way the invoicing cash-sale path does. Dr COGS / Cr Inventory at
      // weighted-average cost, plus an "out" stock movement per product line.
      const cogsTotal = await computeCogsTotal(ctx, args.items);
      await postCogsEntry(ctx, {
        date: args.date,
        description: `POS sale cost of goods sold`,
        createdBy: caller._id,
        sourceType: SALE_COGS_SOURCE,
        sourceId: saleId,
        cogsTotal,
        control,
      });
      await deductInventoryForSale(ctx, {
        lines: args.items,
        reference: `SALE-${saleId}`,
        recordedBy: caller._id,
        timestamp: new Date().toISOString(),
      });
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "sales:createSale",
      resourceType: "sale",
      resourceId: saleId,
      action: "sale_created",
      afterValue: JSON.stringify({ saleId, totalAmount, itemCount: args.items.length, customerId: args.customerId }),
      details: `Sale created — $${totalAmount.toFixed(2)} — ${args.items.length} item(s)`,
    });

    return saleId;
  },
});

// Find the cash/bank account a sale's proceeds were posted into, by reading the
// debit line of its original "sale" journal entry. Returns null if not posted.
async function getSaleCashAccount(
  ctx: MutationCtx,
  saleId: Id<"sales">,
): Promise<Id<"accounts"> | null> {
  const entry = await ctx.db
    .query("journalEntries")
    .withIndex("by_source", (q) => q.eq("sourceType", SALE_SOURCE).eq("sourceId", saleId))
    .first();
  if (!entry) return null;
  const lines = await ctx.db
    .query("journalLines")
    .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
    .collect();
  const debitLine = lines.find((l) => l.debit > 0);
  return debitLine?.accountId ?? null;
}

export const updateSaleStatus = mutation({
  args: {
    saleId: v.id("sales"),
    status: v.union(v.literal("completed"), v.literal("refunded"), v.literal("pending")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new ConvexError({ message: "Sale not found", code: "NOT_FOUND" });
    const prevStatus = sale.status;

    // Block changing sale status in a closed/locked period
    await enforcePostingDate(ctx, sale.date);

    await ctx.db.patch(args.saleId, { status: args.status });

    // Refunding a completed sale reverses its ledger entry (money returned).
    if (prevStatus !== "refunded" && args.status === "refunded") {
      const today = new Date().toISOString().split("T")[0];
      await reverseEntriesForSource(ctx, SALE_SOURCE, args.saleId, {
        date: today,
        createdBy: caller._id,
        description: `Refund POS sale`,
      });
      // Reverse the cost of goods sold and put the stock back.
      await reverseEntriesForSource(ctx, SALE_COGS_SOURCE, args.saleId, {
        date: today,
        createdBy: caller._id,
        description: `Refund POS sale COGS`,
      });
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
        .collect();
      await restockInventoryForSaleReversal(ctx, {
        lines: items,
        reference: `SALE-${args.saleId}`,
        recordedBy: caller._id,
      });
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "sales:updateSaleStatus",
      resourceType: "sale",
      resourceId: args.saleId,
      action: "sale_status_updated",
      beforeValue: JSON.stringify(sale),
      afterValue: JSON.stringify({ ...sale, status: args.status }),
      details: `Sale status changed to ${args.status}`,
    });
  },
});

export const updateSale = mutation({
  args: {
    saleId: v.id("sales"),
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    date: v.string(),
    notes: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.id("products"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new ConvexError({ message: "Sale not found", code: "NOT_FOUND" });

    if (args.items.length === 0) throw new ConvexError({ message: "Sale must have at least one item", code: "BAD_REQUEST" });

    // Block editing a sale dated in a closed/locked period
    await enforcePostingDate(ctx, args.date);

    const oldTotal = round2(sale.totalAmount);
    const totalAmount = round2(args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));

    // Update sale header
    await ctx.db.patch(args.saleId, {
      customerId: args.customerId,
      customerName: args.customerName,
      date: args.date,
      notes: args.notes,
      totalAmount,
    });

    // Delete old items and insert new
    const oldItems = await ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", args.saleId)).collect();
    for (const item of oldItems) await ctx.db.delete(item._id);

    for (const item of args.items) {
      await ctx.db.insert("saleItems", {
        saleId: args.saleId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      });
    }

    // Keep the ledger in sync by posting the balanced delta (only if the sale is
    // still recognised, i.e. not refunded, and it was posted originally).
    const delta = round2(totalAmount - oldTotal);
    if (sale.status !== "refunded" && Math.abs(delta) > 0.001) {
      const cashAccountId = await getSaleCashAccount(ctx, args.saleId);
      if (cashAccountId) {
        const control = await getControlAccounts(ctx);
        const magnitude = Math.abs(delta);
        const increasing = delta > 0;
        await postBalancedEntry(ctx, {
          date: args.date,
          description: `Adjust POS sale total`,
          createdBy: caller._id,
          sourceType: SALE_ADJUSTMENT_SOURCE,
          sourceId: args.saleId,
          lines: increasing
            ? [
                { accountId: cashAccountId, debit: magnitude, description: "Cash received" },
                { accountId: control.revenue._id, credit: magnitude, description: "Sales revenue" },
              ]
            : [
                { accountId: control.revenue._id, debit: magnitude, description: "Sales revenue reduced" },
                { accountId: cashAccountId, credit: magnitude, description: "Cash reduced" },
              ],
        });
      }
    }

    const afterSale = await ctx.db.get(args.saleId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "sales:updateSale",
      resourceType: "sale",
      resourceId: args.saleId,
      action: "sale_updated",
      beforeValue: JSON.stringify(sale),
      afterValue: JSON.stringify(afterSale),
      details: `Sale updated — $${totalAmount.toFixed(2)} — ${args.items.length} item(s)`,
    });
  },
});

export const deleteSale = mutation({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new ConvexError({ message: "Sale not found", code: "NOT_FOUND" });

    // Block deleting a sale dated in a closed/locked period
    await enforcePostingDate(ctx, sale.date);

    // Reverse the sale's ledger entries (unless already refunded/reversed) before
    // deleting the records, so balances never drift.
    const items = await ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", args.saleId)).collect();
    if (sale.status !== "refunded") {
      const today = new Date().toISOString().split("T")[0];
      await reverseEntriesForSource(ctx, SALE_SOURCE, args.saleId, {
        date: today,
        createdBy: caller._id,
        description: `Delete POS sale`,
      });
      await reverseEntriesForSource(ctx, SALE_ADJUSTMENT_SOURCE, args.saleId, {
        date: today,
        createdBy: caller._id,
      });
      // Reverse cost of goods sold and put the stock back.
      await reverseEntriesForSource(ctx, SALE_COGS_SOURCE, args.saleId, {
        date: today,
        createdBy: caller._id,
        description: `Delete POS sale COGS`,
      });
      await restockInventoryForSaleReversal(ctx, {
        lines: items,
        reference: `SALE-${args.saleId}`,
        recordedBy: caller._id,
      });
    }

    for (const item of items) await ctx.db.delete(item._id);
    await ctx.db.delete(args.saleId);

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "sales:deleteSale",
      resourceType: "sale",
      resourceId: args.saleId,
      action: "sale_deleted",
      beforeValue: JSON.stringify(sale),
      details: `Sale deleted — $${sale.totalAmount}`,
    });
  },
});

// ── Summary ───────────────────────────────────────────────────────────────────

export const getSalesSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const sales = await ctx.db.query("sales").collect();
    const completed = sales.filter((s) => s.status === "completed");
    const today = new Date().toISOString().split("T")[0];
    const thisMonth = today.slice(0, 7);

    return {
      totalRevenue: completed.reduce((s, sale) => s + sale.totalAmount, 0),
      totalSales: completed.length,
      todayRevenue: completed.filter((s) => s.date === today).reduce((s, sale) => s + sale.totalAmount, 0),
      monthRevenue: completed.filter((s) => s.date.startsWith(thisMonth)).reduce((s, sale) => s + sale.totalAmount, 0),
    };
  },
});

// ─── Credit Limit Management ──────────────────────────────────────────────────

/**
 * Owner-only mutation to change a customer's credit limit.
 * Every change is recorded in creditLimitHistory. Direct patches to
 * customers.creditLimit must NOT bypass this mutation — the history row
 * is the audit trail for how a customer reached their current limit.
 */
export const updateCustomerCreditLimit = mutation({
  args: {
    customerId: v.id("customers"),
    newLimit: v.optional(v.number()), // undefined = remove limit (no restriction)
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    if (args.reason.trim().length === 0) {
      throw new ConvexError({ message: "Reason is required", code: "BAD_REQUEST" });
    }

    const fromLimit = customer.creditLimit;
    await ctx.db.patch(args.customerId, { creditLimit: args.newLimit });

    await ctx.db.insert("creditLimitHistory", {
      customerId: args.customerId,
      changedBy: user._id,
      changedAt: new Date().toISOString(),
      fromLimit,
      toLimit: args.newLimit ?? 0,
      reason: args.reason.trim(),
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "sales:updateCustomerCreditLimit",
      resourceType: "customer",
      resourceId: args.customerId,
      action: "credit_limit_updated",
      beforeValue: JSON.stringify({ creditLimit: fromLimit }),
      afterValue: JSON.stringify({ creditLimit: args.newLimit }),
      details: `Credit limit changed from ${fromLimit ?? "none"} to ${args.newLimit ?? "none"}. Reason: ${args.reason}`,
    });
  },
});

/**
 * Internal helper — the ONE write path to customer creditStatus.
 *
 * Both the public mutation (owner-supplied reason) and recoverBadDebt
 * (system-generated reason) call this function. This is the same shape as
 * postBalancedEntry / logAudit: one write path in code, multiple callers with
 * different authorisation. Never patch customers.creditStatus directly anywhere
 * else — that is the exact mistake fixed in updateCustomerCreditLimit.
 */
export async function setCustomerCreditStatusInternal(
  ctx: MutationCtx,
  customerId: Id<"customers">,
  newStatus: "active" | "watch" | "hold" | "blacklisted",
  reason: string,
  changedByUserId: Id<"users">,
  mutationName: string,
): Promise<void> {
  const customer = await ctx.db.get(customerId);
  if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

  const now = new Date().toISOString();
  const prevStatus = customer.creditStatus ?? "active";

  await ctx.db.patch(customerId, {
    creditStatus: newStatus,
    creditStatusReason: reason,
    creditStatusChangedAt: now,
  });

  await logAudit(ctx, {
    userId: changedByUserId,
    mutationName,
    resourceType: "customer",
    resourceId: customerId,
    action: "credit_status_changed",
    beforeValue: JSON.stringify({ creditStatus: prevStatus }),
    afterValue: JSON.stringify({ creditStatus: newStatus }),
    details: `Credit status changed from ${prevStatus} to ${newStatus}. Reason: ${reason}`,
  });
}

/**
 * Owner-only mutation to set a customer's credit status.
 * This is the only path an owner uses to place or lift a hold/blacklist.
 * Automatic detection (overdue threshold in creditControl.ts) never calls this —
 * it blocks sales in real time without storing state. This mutation records a
 * deliberate human designation that persists until a person changes it.
 */
export const updateCustomerCreditStatus = mutation({
  args: {
    customerId: v.id("customers"),
    newStatus: v.union(
      v.literal("active"),
      v.literal("watch"),
      v.literal("hold"),
      v.literal("blacklisted"),
    ),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    if (args.reason.trim().length === 0) {
      throw new ConvexError({ message: "Reason is required", code: "BAD_REQUEST" });
    }

    await setCustomerCreditStatusInternal(
      ctx,
      args.customerId,
      args.newStatus,
      args.reason.trim(),
      user._id,
      "sales:updateCustomerCreditStatus",
    );
  },
});

export const getCreditLimitHistory = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db
      .query("creditLimitHistory")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .collect();
  },
});

/**
 * Returns customers whose creditStatus is watch, hold, or blacklisted.
 * Used by the admin Credit Control tab hold/blacklist review section.
 * Bounded: reads customers table with JS filter. At typical SME scale
 * (< 5,000 customers) this is acceptable. Revisit if customer table grows.
 */
export const listNonActiveCustomers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const all = await ctx.db.query("customers").collect();
    return all.filter(
      (c) => c.creditStatus === "watch" || c.creditStatus === "hold" || c.creditStatus === "blacklisted",
    );
  },
});
