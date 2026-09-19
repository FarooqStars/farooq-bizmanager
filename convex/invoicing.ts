import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { nextNumber } from "./lib/docNumber.ts";
import { postBalancedEntry, getControlAccounts, round2, reverseEntriesForSource } from "./lib/ledger.ts";
import { computeCogsTotal, postCogsEntry, requireCashAccount, weightedAvgCost, deductInventoryForSale, restockInventoryForSaleReversal } from "./lib/salesPosting.ts";
import { logAudit } from "./lib/audit.ts";
import { assertOwner, getCurrentUser } from "./lib/auth.ts";
import { assertCustomerCanBeInvoiced } from "./lib/creditControl.ts";
import { setCustomerCreditStatusInternal } from "./sales.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
  db: unknown;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// Source-type tags — values live in lib/sourceTypes.ts, re-exported here for
// existing imports that reference this module directly.
import { INVOICE_SALE_SOURCE, INVOICE_COGS_SOURCE, PAYMENT_SOURCE, CREDIT_MEMO_SOURCE, BAD_DEBT_WRITE_OFF_SOURCE, BAD_DEBT_RECOVERY_SOURCE, CUSTOMER_OPENING_BALANCE_SOURCE } from "./lib/sourceTypes.ts";
export { INVOICE_SALE_SOURCE, INVOICE_COGS_SOURCE };

/**
 * Post the accounting entries for an invoice that has been "issued" (i.e. it is
 * no longer a draft). This is the single place that recognises revenue and cost
 * for an invoice. It is idempotent: it checks the journal `by_source` index and
 * does nothing if the invoice has already been posted.
 *
 *  - Credit sale:  Dr Accounts Receivable (total)
 *                  Cr Revenue (net of tax)  / Cr VAT Payable (tax)
 *  - Cash sale:    Dr Cash/Bank (total, real account required)
 *                  Cr Revenue (net of tax)  / Cr VAT Payable (tax)
 *  - Both:         Dr COGS / Cr Inventory at weighted-average cost (product lines)
 */
export async function postInvoiceIssuance(
  ctx: MutationCtx,
  invoice: Doc<"invoices">,
  opts: { createdBy: Id<"users">; cashAccountId?: Id<"accounts"> },
): Promise<void> {
  if (invoice.status === "draft" || invoice.status === "void") return;
  if (invoice.totalAmount <= 0) return;
  // Opening-balance invoices are posted once, to Opening Balance Equity, when
  // they are created (lib/openingBalances.ts) — never as a sale.
  if (invoice.isOpeningBalance) return;

  // Idempotency guard: skip if the sale entry already exists.
  const already = await ctx.db
    .query("journalEntries")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", INVOICE_SALE_SOURCE).eq("sourceId", invoice._id),
    )
    .first();
  if (already) return;

  const control = await getControlAccounts(ctx);

  const total = round2(invoice.totalAmount);
  const tax = round2(invoice.taxAmount ?? 0);
  const netRevenue = round2(total - tax);

  const isCash = invoice.saleType === "cash";
  let debitAccountId: Id<"accounts">;
  if (isCash) {
    if (!opts.cashAccountId) {
      throw new ConvexError({
        message: "A cash or bank account is required to record a cash sale",
        code: "BAD_REQUEST",
      });
    }
    const account = await requireCashAccount(ctx, opts.cashAccountId);
    debitAccountId = account._id;
  } else {
    debitAccountId = control.ar._id;
  }

  await postBalancedEntry(ctx, {
    date: invoice.date,
    description: `${isCash ? "Cash sale" : "Invoice issued"} ${invoice.invoiceNumber}`,
    reference: invoice.invoiceNumber,
    createdBy: opts.createdBy,
    sourceType: INVOICE_SALE_SOURCE,
    sourceId: invoice._id,
    lines: [
      {
        accountId: debitAccountId,
        debit: total,
        description: isCash ? "Cash received" : "Accounts receivable",
      },
      { accountId: control.revenue._id, credit: netRevenue, description: "Sales revenue" },
      { accountId: control.vatPayable._id, credit: tax, description: "VAT payable" },
    ],
  });

  // Cost of goods sold for product lines (weighted-average cost).
  const items = await ctx.db
    .query("invoiceItems")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", invoice._id))
    .collect();
  const cogsTotal = await computeCogsTotal(ctx, items);
  await postCogsEntry(ctx, {
    date: invoice.date,
    description: `Cost of goods sold ${invoice.invoiceNumber}`,
    reference: invoice.invoiceNumber,
    createdBy: opts.createdBy,
    sourceType: INVOICE_COGS_SOURCE,
    sourceId: invoice._id,
    cogsTotal,
    control,
  });

  // Deduct physical stock for every product line, mirroring the POS sales path.
  await deductInventoryForSale(ctx, {
    lines: items,
    reference: invoice.invoiceNumber,
    recordedBy: opts.createdBy,
    timestamp: new Date(invoice.date).toISOString(),
  });
}

// ─── Invoice Queries ────────────────────────────────────────

export const listInvoices = query({
  args: { status: v.optional(v.string()), customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let invoices: Doc<"invoices">[];

    if (args.status) {
      invoices = await ctx.db
        .query("invoices")
        .withIndex("by_status", (q) =>
          q.eq(
            "status",
            args.status as "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "void",
          ),
        )
        .collect();
    } else if (args.customerId) {
      invoices = await ctx.db
        .query("invoices")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    } else {
      invoices = await ctx.db.query("invoices").order("desc").collect();
    }

    // Apply additional customer filter if both status and customer provided
    if (args.status && args.customerId) {
      invoices = invoices.filter((inv) => inv.customerId === args.customerId);
    }

    // Enrich with customer name
    const enriched = await Promise.all(
      invoices.map(async (inv) => {
        const customer = await ctx.db.get(inv.customerId);
        return {
          ...inv,
          customerName: customer?.name ?? "Unknown",
          customerEmail: customer?.email ?? "",
          customerPhone: customer?.phone ?? "",
        };
      }),
    );

    return enriched;
  },
});

export const listJobInvoices = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    // Get all invoices that have a projectId set
    const allInvoices = await ctx.db.query("invoices").order("desc").collect();
    const jobInvoices = allInvoices.filter(
      (inv) => inv.projectId && (args.projectId ? inv.projectId === args.projectId : true),
    );

    // Enrich with customer name and project name
    const enriched = await Promise.all(
      jobInvoices.map(async (inv) => {
        const customer = await ctx.db.get(inv.customerId);
        const project = inv.projectId ? await ctx.db.get(inv.projectId) : null;
        return {
          ...inv,
          customerName: customer?.name ?? "Unknown",
          projectName: project?.name ?? "Unknown Job",
          projectCode: project?.code ?? "",
        };
      }),
    );

    return enriched;
  },
});

export const getInvoice = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const invoice = await ctx.db.get(args.id);
    if (!invoice) return null;

    const customer = await ctx.db.get(invoice.customerId);
    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
      .collect();

    return {
      ...invoice,
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email,
      customerPhone: customer?.phone,
      customerAddress: customer?.address,
      items,
      payments,
    };
  },
});

export const getCollectionsDashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    const invoices = await ctx.db.query("invoices").collect();
    const now = new Date().toISOString().split("T")[0];

    let draftCount = 0;
    let sentCount = 0;
    let paidCount = 0;
    let partiallyPaidCount = 0;
    let overdueCount = 0;
    let voidCount = 0;
    let totalOverdue = 0;
    let totalOutstanding = 0;

    // Aging brackets
    let aging0to30 = 0;
    let aging31to60 = 0;
    let aging61to90 = 0;
    let aging90plus = 0;

    for (const inv of invoices) {
      switch (inv.status) {
        case "draft":
          draftCount++;
          break;
        case "sent":
          sentCount++;
          break;
        case "paid":
          paidCount++;
          break;
        case "partially_paid":
          partiallyPaidCount++;
          break;
        case "overdue":
          overdueCount++;
          break;
        case "void":
          voidCount++;
          break;
      }

      // Calculate outstanding and overdue amounts
      if (inv.status !== "paid" && inv.status !== "void") {
        const remaining = inv.totalAmount - inv.amountPaid;
        totalOutstanding += remaining;

        if (inv.dueDate < now) {
          totalOverdue += remaining;
          // Calculate aging
          const dueDateMs = new Date(inv.dueDate).getTime();
          const nowMs = new Date(now).getTime();
          const daysPastDue = Math.floor((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));

          if (daysPastDue <= 30) {
            aging0to30 += remaining;
          } else if (daysPastDue <= 60) {
            aging31to60 += remaining;
          } else if (daysPastDue <= 90) {
            aging61to90 += remaining;
          } else {
            aging90plus += remaining;
          }
        }
      }
    }

    return {
      counts: {
        draft: draftCount,
        sent: sentCount,
        paid: paidCount,
        partially_paid: partiallyPaidCount,
        overdue: overdueCount,
        void: voidCount,
      },
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      aging: {
        "0-30": Math.round(aging0to30 * 100) / 100,
        "31-60": Math.round(aging31to60 * 100) / 100,
        "61-90": Math.round(aging61to90 * 100) / 100,
        "90+": Math.round(aging90plus * 100) / 100,
      },
    };
  },
});

// ─── Invoice Mutations ──────────────────────────────────────

export const createInvoice = mutation({
  args: {
    customerId: v.id("customers"),
    date: v.string(),
    dueDate: v.string(),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(
      v.union(v.literal("net_15"), v.literal("net_30"), v.literal("net_60"), v.literal("net_90")),
    ),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    // Real cash/bank account the money is received into (required for cash sales).
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args): Promise<Id<"invoices">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    // Validate customer exists
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // EARLY WARNING GATE: inform the salesman before the form is completed.
    // NOT the safety boundary — primary enforcement is in updateInvoiceStatus
    // where A/R is born. Do not remove either; they serve different purposes.
    if (args.saleType === "credit") {
      const sub = args.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const disc = args.discount ?? 0;
      const afterDisc = sub - disc;
      const tax = Math.round(afterDisc * ((args.taxRate ?? 0) / 100) * 100) / 100;
      const estimated = Math.round((afterDisc + tax) * 100) / 100;
      await assertCustomerCanBeInvoiced(ctx, args.customerId, estimated);
    }

    if (args.items.length === 0) {
      throw new ConvexError({
        message: "Invoice must have at least one item",
        code: "BAD_REQUEST",
      });
    }

    // Generate invoice number
    const allInvoices = await ctx.db.query("invoices").collect();
    const invoiceNumber = nextNumber(allInvoices, (i) => i.invoiceNumber, "INV-", 5);

    // Calculate totals
    const subtotal = args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = args.discount ?? 0;
    if (discountAmount < 0) {
      throw new ConvexError({ message: "Discount cannot be negative", code: "BAD_REQUEST" });
    }
    if (discountAmount > subtotal) {
      throw new ConvexError({
        message: "Discount cannot exceed the line subtotal",
        code: "BAD_REQUEST",
      });
    }
    if ((args.taxRate ?? 0) < 0) {
      throw new ConvexError({ message: "Tax rate cannot be negative", code: "BAD_REQUEST" });
    }
    const afterDiscount = subtotal - discountAmount;
    const taxRate = args.taxRate ?? 0;
    const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
    const totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;

    // Determine status and amountPaid based on sale type
    const isCash = args.saleType === "cash";
    const status = isCash ? ("paid" as const) : ("draft" as const);
    const amountPaid = isCash ? totalAmount : 0;

    // A cash sale immediately moves money, so a real account is required up-front.
    if (isCash && totalAmount > 0 && !args.accountId) {
      throw new ConvexError({
        message: "Select a cash or bank account to receive a cash sale",
        code: "BAD_REQUEST",
      });
    }

    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      customerId: args.customerId,
      date: args.date,
      dueDate: args.dueDate,
      status,
      saleType: args.saleType,
      creditTerms: args.creditTerms,
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate: args.taxRate,
      taxAmount,
      discount: args.discount,
      totalAmount,
      amountPaid,
      currency: args.currency,
      notes: args.notes,
      projectId: args.projectId,
      createdBy: user._id,
    });

    // Insert invoice items
    for (const item of args.items) {
      await ctx.db.insert("invoiceItems", {
        invoiceId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      });
    }

    // Post the ledger entries for a cash sale immediately (Dr Cash / Cr Revenue
    // + COGS). Credit invoices post when they leave draft (see updateInvoiceStatus).
    if (!isCash) {
      await logAudit(ctx, {
        userId: user._id,
        mutationName: "invoicing:createInvoice",
        resourceType: "invoice",
        resourceId: invoiceId,
        action: "invoice_created",
        afterValue: JSON.stringify({ invoiceId, invoiceNumber, customerId: args.customerId, totalAmount, status, saleType: args.saleType }),
        details: `Invoice ${invoiceNumber} created`,
      });
      return invoiceId;
    }
    const invoice = await ctx.db.get(invoiceId);
    if (invoice) {
      await postInvoiceIssuance(ctx, invoice, {
        createdBy: user._id,
        cashAccountId: args.accountId,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:createInvoice",
      resourceType: "invoice",
      resourceId: invoiceId,
      action: "invoice_created",
      afterValue: JSON.stringify({ invoiceId, invoiceNumber, customerId: args.customerId, totalAmount, status, saleType: args.saleType }),
      details: `Invoice ${invoiceNumber} created`,
    });

    return invoiceId;
  },
});

export const updateInvoice = mutation({
  args: {
    id: v.id("invoices"),
    customerId: v.id("customers"),
    date: v.string(),
    dueDate: v.string(),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(
      v.union(v.literal("net_15"), v.literal("net_30"), v.literal("net_60"), v.literal("net_90")),
    ),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    // Real cash/bank account for a cash sale (required when saleType is cash).
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (invoice.isOpeningBalance) {
      throw new ConvexError({
        message: "An opening-balance invoice cannot be edited. Void it, then enter the customer's opening balance again.",
        code: "BAD_REQUEST",
      });
    }

    // Once an invoice is issued it has already posted to the ledger (Dr AR/Cash
    // / Cr Revenue + COGS). Editing it would silently drift the books. Only
    // drafts, which have posted nothing, may be edited. To change an issued
    // invoice, void it and create a new one, or issue a credit memo.
    if (invoice.status !== "draft") {
      throw new ConvexError({
        message: "This invoice has already been issued and posted. Void it or issue a credit memo instead of editing it.",
        code: "BAD_REQUEST",
      });
    }

    if (args.items.length === 0) {
      throw new ConvexError({
        message: "Invoice must have at least one item",
        code: "BAD_REQUEST",
      });
    }

    // EARLY WARNING GATE (cash→credit only): if this edit is promoting a cash
    // invoice to credit, run the gate now. All other edits don't extend new credit.
    if (args.saleType === "credit" && invoice.saleType === "cash") {
      const sub = args.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const disc = args.discount ?? 0;
      const afterDisc = sub - disc;
      const tax = Math.round(afterDisc * ((args.taxRate ?? 0) / 100) * 100) / 100;
      const estimated = Math.round((afterDisc + tax) * 100) / 100;
      await assertCustomerCanBeInvoiced(ctx, args.customerId, estimated);
    }

    // Recalculate totals
    const subtotal = args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = args.discount ?? 0;
    const afterDiscount = subtotal - discountAmount;
    const taxRate = args.taxRate ?? 0;
    const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
    const totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;

    // A cash sale immediately receives money, so it becomes paid and must post a
    // receipt into a real cash/bank account.
    const isCash = args.saleType === "cash";
    const status = isCash ? ("paid" as const) : invoice.status;
    const amountPaid = isCash ? totalAmount : invoice.amountPaid;

    if (isCash && totalAmount > 0 && !args.accountId) {
      throw new ConvexError({
        message: "Select a cash or bank account to receive a cash sale",
        code: "BAD_REQUEST",
      });
    }

    // Update invoice header
    await ctx.db.patch(args.id, {
      customerId: args.customerId,
      date: args.date,
      dueDate: args.dueDate,
      saleType: args.saleType,
      creditTerms: args.creditTerms,
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate: args.taxRate,
      taxAmount,
      discount: args.discount,
      totalAmount,
      amountPaid,
      status,
      currency: args.currency,
      notes: args.notes,
      projectId: args.projectId,
    });

    // Delete old items and re-insert
    const oldItems = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
      .collect();
    for (const item of oldItems) await ctx.db.delete(item._id);

    for (const item of args.items) {
      await ctx.db.insert("invoiceItems", {
        invoiceId: args.id,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      });
    }

    // Flipping a draft to a cash sale posts the receipt immediately (Dr Cash /
    // Cr Revenue + COGS), the same as creating a cash invoice.
    if (isCash) {
      const updated = await ctx.db.get(args.id);
      if (updated) {
        await postInvoiceIssuance(ctx, updated, {
          createdBy: user._id,
          cashAccountId: args.accountId,
        });
      }
    }

    const afterInvoice = await ctx.db.get(args.id);
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:updateInvoice",
      resourceType: "invoice",
      resourceId: args.id,
      action: "invoice_updated",
      beforeValue: JSON.stringify(invoice),
      afterValue: JSON.stringify(afterInvoice),
      details: `Invoice ${invoice.invoiceNumber} updated`,
    });
  },
});

export const updateInvoiceStatus = mutation({
  args: {
    id: v.id("invoices"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.literal("partially_paid"),
      v.literal("overdue"),
      v.literal("void"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    // PRIMARY ENFORCEMENT GATE: this is where A/R is born for credit invoices.
    // Run the full gate (blacklist + limit + overdue) when a credit invoice
    // transitions out of draft. The gate at createInvoice is early-warning only;
    // this is the safety boundary. Do not remove either.
    if (
      invoice.saleType === "credit" &&
      invoice.status === "draft" &&
      args.status !== "draft" &&
      args.status !== "void"
    ) {
      const outstanding = invoice.totalAmount - invoice.amountPaid - (invoice.amountWrittenOff ?? 0);
      await assertCustomerCanBeInvoiced(ctx, invoice.customerId, outstanding);
    }

    await ctx.db.patch(args.id, { status: args.status });

    // When a credit invoice leaves draft (sent/paid/partially_paid/overdue) it is
    // "issued" — recognise AR/Revenue and COGS. postInvoiceIssuance is idempotent,
    // so repeated status changes never double-post.
    if (args.status !== "draft" && args.status !== "void") {
      const updated = await ctx.db.get(args.id);
      if (updated) {
        await postInvoiceIssuance(ctx, updated, { createdBy: user._id });
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:updateInvoiceStatus",
      resourceType: "invoice",
      resourceId: args.id,
      action: "invoice_status_updated",
      beforeValue: JSON.stringify(invoice),
      afterValue: JSON.stringify({ ...invoice, status: args.status }),
      details: `Invoice ${invoice.invoiceNumber} status changed to ${args.status}`,
    });
  },
});

export const voidInvoice = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (invoice.status === "void") {
      throw new ConvexError({ message: "Invoice is already void", code: "BAD_REQUEST" });
    }

    // Block voiding a document dated in a closed/locked period
    await enforcePostingDate(ctx, invoice.date);

    // Reverse the sale + COGS journal entries with mirror postings so balances
    // unwind cleanly and the audit trail is preserved (never a silent delete).
    const today = new Date().toISOString().split("T")[0];
    await reverseEntriesForSource(ctx, INVOICE_SALE_SOURCE, args.id, {
      date: today,
      createdBy: user._id,
      description: `Void invoice ${invoice.invoiceNumber}`,
    });
    await reverseEntriesForSource(ctx, INVOICE_COGS_SOURCE, args.id, {
      date: today,
      createdBy: user._id,
      description: `Void COGS ${invoice.invoiceNumber}`,
    });
    await reverseEntriesForSource(ctx, CUSTOMER_OPENING_BALANCE_SOURCE, args.id, {
      date: today,
      createdBy: user._id,
      description: `Void opening balance ${invoice.invoiceNumber}`,
    });

    // Restock physical inventory — mirror of deductInventoryForSale on issuance.
    const voidItems = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.id))
      .collect();
    await restockInventoryForSaleReversal(ctx, {
      lines: voidItems,
      reference: invoice.invoiceNumber,
      recordedBy: user._id,
      timestamp: today + "T00:00:00.000Z",
    });

    await ctx.db.patch(args.id, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:voidInvoice",
      resourceType: "invoice",
      resourceId: args.id,
      action: "invoice_voided",
      beforeValue: JSON.stringify(invoice),
      afterValue: JSON.stringify({ ...invoice, status: "void" }),
      details: `Invoice ${invoice.invoiceNumber} voided`,
    });
  },
});

// ─── Payment Mutations ──────────────────────────────────────

export const recordPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    date: v.string(),
    amount: v.number(),
    method: v.union(
      v.literal("cash"),
      v.literal("credit_card"),
      v.literal("debit_card"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("paypal"),
      v.literal("mobile_pay"),
      v.literal("store_credit"),
      v.literal("advance_settlement"),
      v.literal("other"),
    ),
    reference: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    advancePaymentId: v.optional(v.id("advancePayments")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"payments">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    if (invoice.status === "void") {
      throw new ConvexError({
        message: "Cannot record payment on a void invoice",
        code: "BAD_REQUEST",
      });
    }

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Payment amount must be positive", code: "BAD_REQUEST" });
    }

    const remainingBalance = invoice.totalAmount - invoice.amountPaid - (invoice.amountWrittenOff ?? 0);
    if (args.amount > remainingBalance + 0.01) {
      throw new ConvexError({
        message: `Payment amount (${args.amount}) exceeds remaining balance (${Math.round(remainingBalance * 100) / 100})`,
        code: "BAD_REQUEST",
      });
    }

    const paymentId = await ctx.db.insert("payments", {
      invoiceId: args.invoiceId,
      date: args.date,
      amount: args.amount,
      method: args.method,
      reference: args.reference,
      cardLast4: args.cardLast4,
      cardBrand: args.cardBrand,
      accountId: args.accountId,
      advancePaymentId: args.advancePaymentId,
      notes: args.notes,
      recordedBy: user._id,
    });

    // Update invoice amountPaid and status
    const newAmountPaid = Math.round((invoice.amountPaid + args.amount) * 100) / 100;
    const newStatus =
      newAmountPaid >= invoice.totalAmount ? ("paid" as const) : ("partially_paid" as const);

    await ctx.db.patch(args.invoiceId, { amountPaid: newAmountPaid, status: newStatus });

    const control = await getControlAccounts(ctx);

    // If using advance settlement, update the advance's settled amount
    if (args.advancePaymentId) {
      const advance = await ctx.db.get(args.advancePaymentId);
      if (advance) {
        // Never settle more of an advance than it has left.
        const advanceRemaining = Math.round((advance.amount - (advance.settledAmount ?? 0)) * 100) / 100;
        if (args.amount > advanceRemaining + 0.01) {
          throw new ConvexError({
            message: `Payment amount (${args.amount}) exceeds the advance's remaining balance (${advanceRemaining})`,
            code: "BAD_REQUEST",
          });
        }
        const newSettled = (advance.settledAmount ?? 0) + args.amount;
        const isFullySettled = newSettled >= advance.amount - 0.01;
        await ctx.db.patch(args.advancePaymentId, {
          settledAmount: Math.round(newSettled * 100) / 100,
          status: isFullySettled ? "settled" : "partially_settled",
        });
        // Record advance settlement
        await ctx.db.insert("advanceSettlements", {
          advanceId: args.advancePaymentId,
          invoiceId: args.invoiceId,
          amount: args.amount,
          date: args.date,
          notes: `Applied to invoice: ${invoice.invoiceNumber}`,
          settledBy: user._id,
        });
      }
    }

    // Post the balanced receipt entry (the ONLY thing that moves balances).
    //  - Advance settlement: Dr Customer Deposits (liability down) / Cr AR
    //  - Cash/bank receipt:  Dr chosen cash-or-bank account / Cr AR
    if (args.method === "advance_settlement") {
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Advance applied to ${invoice.invoiceNumber}`,
        reference: args.reference,
        createdBy: user._id,
        sourceType: PAYMENT_SOURCE,
        sourceId: paymentId,
        lines: [
          { accountId: control.customerDeposits._id, debit: args.amount, description: "Customer advance applied" },
          { accountId: control.ar._id, credit: args.amount, description: "Accounts receivable" },
        ],
      });
    } else {
      if (!args.accountId) {
        throw new ConvexError({
          message: "Select a cash or bank account to receive this payment",
          code: "BAD_REQUEST",
        });
      }
      const account = await requireCashAccount(ctx, args.accountId);
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Invoice payment received: ${invoice.invoiceNumber}${args.reference ? ` Ref: ${args.reference}` : ""}`,
        reference: args.reference,
        createdBy: user._id,
        sourceType: PAYMENT_SOURCE,
        sourceId: paymentId,
        lines: [
          { accountId: account._id, debit: args.amount, description: "Cash/bank received" },
          { accountId: control.ar._id, credit: args.amount, description: "Accounts receivable" },
        ],
      });
      // Informational bank-register row (balance is driven by the ledger above).
      await ctx.db.insert("bankTransactions", {
        accountId: account._id,
        date: args.date,
        description: `Invoice payment received: ${invoice.invoiceNumber}${args.reference ? ` Ref: ${args.reference}` : ""}`,
        amount: args.amount,
        type: "credit",
        reference: args.reference,
        category: "Invoice Payment",
        isReconciled: false,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:recordPayment",
      resourceType: "payment",
      resourceId: paymentId,
      action: "payment_recorded",
      afterValue: JSON.stringify({ paymentId, amount: args.amount, invoiceId: args.invoiceId, method: args.method }),
      details: `Payment of ${args.amount} recorded via ${args.method}`,
    });

    return paymentId;
  },
});

// ─── Quotation Queries ──────────────────────────────────────

export const listQuotations = query({
  args: { status: v.optional(v.string()), customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let quotations: Doc<"quotations">[];

    if (args.status) {
      quotations = await ctx.db
        .query("quotations")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "draft" | "sent" | "accepted" | "rejected" | "expired"),
        )
        .collect();
    } else if (args.customerId) {
      quotations = await ctx.db
        .query("quotations")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    } else {
      quotations = await ctx.db.query("quotations").order("desc").collect();
    }

    // Apply additional customer filter if both status and customer provided
    if (args.status && args.customerId) {
      quotations = quotations.filter((q) => q.customerId === args.customerId);
    }

    // Enrich with customer name
    const enriched = await Promise.all(
      quotations.map(async (qt) => {
        const customer = await ctx.db.get(qt.customerId);
        return {
          ...qt,
          customerName: customer?.name ?? "Unknown",
          customerEmail: customer?.email ?? "",
          customerPhone: customer?.phone ?? "",
        };
      }),
    );

    return enriched;
  },
});

export const getQuotation = query({
  args: { id: v.id("quotations") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const quotation = await ctx.db.get(args.id);
    if (!quotation) return null;

    const customer = await ctx.db.get(quotation.customerId);
    const items = await ctx.db
      .query("quotationItems")
      .withIndex("by_quotation", (q) => q.eq("quotationId", args.id))
      .collect();

    return {
      ...quotation,
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email,
      customerPhone: customer?.phone,
      customerAddress: customer?.address,
      items,
    };
  },
});

// ─── Quotation Mutations ────────────────────────────────────

export const createQuotation = mutation({
  args: {
    customerId: v.id("customers"),
    date: v.string(),
    validUntil: v.string(),
    items: v.array(
      v.object({
        productId: v.optional(v.id("products")),
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"quotations">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    // Validate customer exists
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    if (args.items.length === 0) {
      throw new ConvexError({
        message: "Quotation must have at least one item",
        code: "BAD_REQUEST",
      });
    }

    // Generate quote number
    const allQuotations = await ctx.db.query("quotations").collect();
    const quoteNumber = nextNumber(allQuotations, (q) => q.quoteNumber, "QT-", 5);

    // Calculate totals
    const subtotal = args.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = args.discount ?? 0;
    const afterDiscount = subtotal - discountAmount;
    const taxRate = args.taxRate ?? 0;
    const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
    const totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;

    const quotationId = await ctx.db.insert("quotations", {
      quoteNumber,
      customerId: args.customerId,
      date: args.date,
      validUntil: args.validUntil,
      status: "draft",
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate: args.taxRate,
      taxAmount,
      discount: args.discount,
      totalAmount,
      currency: args.currency,
      notes: args.notes,
      createdBy: user._id,
    });

    // Insert quotation items
    for (const item of args.items) {
      await ctx.db.insert("quotationItems", {
        quotationId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:createQuotation",
      resourceType: "quotation",
      resourceId: quotationId,
      action: "quotation_created",
      afterValue: JSON.stringify({ quotationId, quoteNumber, customerId: args.customerId, totalAmount }),
      details: `Quotation ${quoteNumber} created`,
    });

    return quotationId;
  },
});

export const updateQuotationStatus = mutation({
  args: {
    id: v.id("quotations"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("expired"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const quotation = await ctx.db.get(args.id);
    if (!quotation) throw new ConvexError({ message: "Quotation not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.id, { status: args.status });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:updateQuotationStatus",
      resourceType: "quotation",
      resourceId: args.id,
      action: "quotation_status_updated",
      beforeValue: JSON.stringify(quotation),
      afterValue: JSON.stringify({ ...quotation, status: args.status }),
      details: `Quotation ${quotation.quoteNumber} status changed to ${args.status}`,
    });
  },
});

export const convertQuotationToInvoice = mutation({
  args: {
    quotationId: v.id("quotations"),
    dueDate: v.string(),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(
      v.union(v.literal("net_15"), v.literal("net_30"), v.literal("net_60"), v.literal("net_90")),
    ),
    // Real cash/bank account required when converting to a cash sale.
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args): Promise<Id<"invoices">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const quotation = await ctx.db.get(args.quotationId);
    if (!quotation) throw new ConvexError({ message: "Quotation not found", code: "NOT_FOUND" });

    if (quotation.status === "accepted") {
      throw new ConvexError({ message: "Quotation has already been converted", code: "CONFLICT" });
    }
    if (quotation.status === "rejected" || quotation.status === "expired") {
      throw new ConvexError({
        message: "Cannot convert a rejected or expired quotation",
        code: "BAD_REQUEST",
      });
    }

    // Get quotation items
    const quotationItems = await ctx.db
      .query("quotationItems")
      .withIndex("by_quotation", (q) => q.eq("quotationId", args.quotationId))
      .collect();

    // EARLY WARNING GATE — same role as in createInvoice.
    if (args.saleType === "credit") {
      await assertCustomerCanBeInvoiced(ctx, quotation.customerId, quotation.totalAmount);
    }

    // Generate invoice number
    const allInvoices = await ctx.db.query("invoices").collect();
    const invoiceNumber = nextNumber(allInvoices, (i) => i.invoiceNumber, "INV-", 5);

    // Determine status and amountPaid based on sale type
    const isCash = args.saleType === "cash";
    const status = isCash ? ("paid" as const) : ("draft" as const);
    const amountPaid = isCash ? quotation.totalAmount : 0;

    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber,
      customerId: quotation.customerId,
      date: quotation.date,
      dueDate: args.dueDate,
      status,
      saleType: args.saleType,
      creditTerms: args.creditTerms,
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      discount: quotation.discount,
      totalAmount: quotation.totalAmount,
      amountPaid,
      currency: quotation.currency,
      notes: quotation.notes,
      fromQuotationId: args.quotationId,
      createdBy: user._id,
    });

    // Copy quotation items to invoice items
    for (const item of quotationItems) {
      await ctx.db.insert("invoiceItems", {
        invoiceId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      });
    }

    // Mark quotation as accepted
    await ctx.db.patch(args.quotationId, { status: "accepted" });

    // Post ledger entries for a cash sale immediately (credit invoices post when
    // they leave draft via updateInvoiceStatus).
    if (isCash) {
      const invoice = await ctx.db.get(invoiceId);
      if (invoice) {
        await postInvoiceIssuance(ctx, invoice, {
          createdBy: user._id,
          cashAccountId: args.accountId,
        });
      }
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:convertQuotationToInvoice",
      resourceType: "invoice",
      resourceId: invoiceId,
      action: "invoice_created",
      afterValue: JSON.stringify({ invoiceId, invoiceNumber, fromQuotationId: args.quotationId, saleType: args.saleType }),
      details: `Invoice ${invoiceNumber} created from quotation`,
    });

    return invoiceId;
  },
});

// ─── Credit Memo Mutations ──────────────────────────────────

export const createCreditMemo = mutation({
  args: {
    customerId: v.id("customers"),
    invoiceId: v.optional(v.id("invoices")),
    date: v.string(),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"creditMemos">> => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    // Validate customer exists
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // Validate invoice if provided
    if (args.invoiceId) {
      const invoice = await ctx.db.get(args.invoiceId);
      if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
      if (invoice.customerId !== args.customerId) {
        throw new ConvexError({
          message: "Invoice does not belong to this customer",
          code: "BAD_REQUEST",
        });
      }
    }

    if (args.amount <= 0) {
      throw new ConvexError({
        message: "Credit memo amount must be positive",
        code: "BAD_REQUEST",
      });
    }

    // Generate memo number
    const allMemos = await ctx.db.query("creditMemos").collect();
    const memoNumber = nextNumber(allMemos, (m) => m.memoNumber, "CM-", 5);

    const memoId = await ctx.db.insert("creditMemos", {
      memoNumber,
      customerId: args.customerId,
      invoiceId: args.invoiceId,
      date: args.date,
      amount: args.amount,
      reason: args.reason,
      status: "active",
      createdBy: user._id,
    });

    const control = await getControlAccounts(ctx);
    const amt = round2(args.amount);

    // Contra-revenue side: Dr Sales Returns / Cr Accounts Receivable.
    const lines = [
      { accountId: control.salesReturns._id, debit: amt, description: "Sales return" },
      { accountId: control.ar._id, credit: amt, description: "Reduce receivable" },
    ];

    // Reduce the linked invoice outstanding balance and restock returned goods
    // at cost (Dr Inventory / Cr COGS).
    if (args.invoiceId) {
      const invoice = await ctx.db.get(args.invoiceId);
      if (invoice) {
        const newAmountPaid = round2(invoice.amountPaid + amt);
        await ctx.db.patch(args.invoiceId, {
          amountPaid: newAmountPaid,
          status: newAmountPaid >= invoice.totalAmount ? "paid" : "partially_paid",
        });

        const items = await ctx.db
          .query("invoiceItems")
          .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId as Id<"invoices">))
          .collect();
        const invoiceTotal = invoice.totalAmount || 0;
        // Restock proportionally to the share of the invoice being credited.
        const ratio = invoiceTotal > 0 ? amt / invoiceTotal : 0;
        let restockCost = 0;
        for (const item of items) {
          if (!item.productId) continue;
          const product = await ctx.db.get(item.productId);
          if (!product || product.type !== "product") continue;
          const unitCost = await weightedAvgCost(ctx, item.productId);
          restockCost += unitCost * item.quantity * ratio;
        }
        restockCost = round2(restockCost);
        if (restockCost > 0) {
          lines.push({ accountId: control.inventory._id, debit: restockCost, description: "Restock returned goods" });
          lines.push({ accountId: control.cogs._id, credit: restockCost, description: "Reverse cost of goods sold" });
        }

        // Also update physical inventory quantities proportionally.
        for (const item of items) {
          if (!item.productId) continue;
          const product = await ctx.db.get(item.productId);
          if (!product || product.type !== "product") continue;
          const returnQty = Math.round(item.quantity * ratio * 1000) / 1000;
          if (returnQty <= 0) continue;

          // Find the warehouse the stock came from (most-stocked or first available).
          const invRows = await ctx.db
            .query("inventory")
            .withIndex("by_product", (q) => q.eq("productId", item.productId!))
            .collect();
          const invRow =
            invRows.sort((a, b) => b.quantity - a.quantity)[0] ??
            null;

          if (invRow) {
            await ctx.db.patch(invRow._id, { quantity: invRow.quantity + returnQty });
          } else {
            const anyWarehouse = await ctx.db.query("warehouses").first();
            if (anyWarehouse) {
              await ctx.db.insert("inventory", {
                productId: item.productId,
                warehouseId: anyWarehouse._id,
                quantity: returnQty,
              });
            }
          }

          const unitCost = await weightedAvgCost(ctx, item.productId);
          await ctx.db.insert("stockMovements", {
            productId: item.productId,
            warehouseId: invRow?.warehouseId ?? (await ctx.db.query("warehouses").first())!._id,
            type: "in",
            quantity: returnQty,
            costPerUnit: unitCost,
            reason: "return",
            reference: memoNumber,
            notes: "Returned via credit memo",
            recordedBy: user._id,
            timestamp: new Date(args.date).toISOString(),
          });
        }
      }
    }

    await postBalancedEntry(ctx, {
      date: args.date,
      description: `Credit memo ${memoNumber}`,
      createdBy: user._id,
      sourceType: CREDIT_MEMO_SOURCE,
      sourceId: memoId,
      lines,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:createCreditMemo",
      resourceType: "creditMemo",
      resourceId: memoId,
      action: "credit_memo_created",
      afterValue: JSON.stringify({ memoId, memoNumber, customerId: args.customerId, amount: args.amount, reason: args.reason }),
      details: `Credit memo ${memoNumber} created for ${args.amount}`,
    });

    return memoId;
  },
});

export const voidCreditMemo = mutation({
  args: { id: v.id("creditMemos") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const memo = await ctx.db.get(args.id);
    if (!memo) throw new ConvexError({ message: "Credit memo not found", code: "NOT_FOUND" });
    if (memo.status === "void") {
      throw new ConvexError({ message: "Credit memo is already void", code: "BAD_REQUEST" });
    }

    await enforcePostingDate(ctx, memo.date);

    // Reverse the memo's journal entry (Dr Sales Returns/Cr AR, plus any restock)
    // with a mirror posting so balances unwind and the audit trail is preserved.
    const today = new Date().toISOString().split("T")[0];
    await reverseEntriesForSource(ctx, CREDIT_MEMO_SOURCE, args.id, {
      date: today,
      createdBy: user._id,
      description: `Void credit memo ${memo.memoNumber}`,
    });

    // Undo the outstanding-balance reduction the memo applied to its invoice, the
    // same way voiding an invoice unwinds its effects.
    if (memo.invoiceId) {
      const invoice = await ctx.db.get(memo.invoiceId);
      if (invoice) {
        const restoredPaid = round2(Math.max(0, invoice.amountPaid - memo.amount));
        await ctx.db.patch(memo.invoiceId, {
          amountPaid: restoredPaid,
          status: restoredPaid >= invoice.totalAmount
            ? "paid"
            : restoredPaid > 0
              ? "partially_paid"
              : "sent",
        });
      }
    }

    await ctx.db.patch(args.id, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:voidCreditMemo",
      resourceType: "creditMemo",
      resourceId: args.id,
      action: "credit_memo_voided",
      beforeValue: JSON.stringify(memo),
      afterValue: JSON.stringify({ ...memo, status: "void" }),
      details: `Credit memo ${memo.memoNumber} voided`,
    });
  },
});

export const listCreditMemos = query({
  args: { customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let memos: Doc<"creditMemos">[];

    if (args.customerId) {
      memos = await ctx.db
        .query("creditMemos")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    } else {
      memos = await ctx.db.query("creditMemos").order("desc").collect();
    }

    const enriched = await Promise.all(
      memos.map(async (memo) => {
        const customer = await ctx.db.get(memo.customerId);
        return { ...memo, customerName: customer?.name ?? "Unknown" };
      }),
    );

    return enriched;
  },
});

// ─── Helper Queries for Select Dropdowns ────────────────────

export const listCustomersForSelect = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const customers = await ctx.db.query("customers").collect();
    return customers.map((c) => ({ _id: c._id, name: c.name }));
  },
});

export const listProductsForSelect = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const products = await ctx.db.query("products").collect();
    return products
      .filter((p) => p.isActive)
      .map((p) => ({ _id: p._id, name: p.name, unitPrice: p.unitPrice, sku: p.sku }));
  },
});

// ─── Owner-only admin void of a posted invoice (reverse-and-repost) ──────────
//
// Voids a posted (issued) invoice by reversing its revenue + COGS journal
// entries with mirror postings and restocking inventory — the exact same
// reversal logic as voidInvoice — but gated to the account owner and requiring
// a written reason for the audit trail. Draft invoices are handled by the
// normal void flow (they never posted to the ledger).
export const adminVoidPostedInvoice = mutation({
  args: {
    invoiceId: v.id("invoices"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    if (!args.reason || args.reason.trim().length < 10) {
      throw new ConvexError({
        message: "A reason of at least 10 characters is required",
        code: "BAD_REQUEST",
      });
    }

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (invoice.status === "void") {
      throw new ConvexError({ message: "Invoice is already void", code: "BAD_REQUEST" });
    }
    if (invoice.status === "draft") {
      throw new ConvexError({ message: "Draft invoices can be voided normally", code: "BAD_REQUEST" });
    }

    // Block voiding a document dated in a closed/locked period.
    await enforcePostingDate(ctx, invoice.date);

    // Reverse the sale + COGS journal entries with mirror postings (identical to
    // voidInvoice) so balances unwind cleanly and the audit trail is preserved.
    const today = new Date().toISOString().split("T")[0];
    await reverseEntriesForSource(ctx, INVOICE_SALE_SOURCE, args.invoiceId, {
      date: today,
      createdBy: user._id,
      description: `Admin void invoice ${invoice.invoiceNumber}`,
    });
    await reverseEntriesForSource(ctx, INVOICE_COGS_SOURCE, args.invoiceId, {
      date: today,
      createdBy: user._id,
      description: `Admin void COGS ${invoice.invoiceNumber}`,
    });
    await reverseEntriesForSource(ctx, CUSTOMER_OPENING_BALANCE_SOURCE, args.invoiceId, {
      date: today,
      createdBy: user._id,
      description: `Admin void opening balance ${invoice.invoiceNumber}`,
    });

    // Restock physical inventory — mirror of deductInventoryForSale on issuance.
    const voidItems = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();
    await restockInventoryForSaleReversal(ctx, {
      lines: voidItems,
      reference: invoice.invoiceNumber,
      recordedBy: user._id,
      timestamp: today + "T00:00:00.000Z",
    });

    await ctx.db.patch(args.invoiceId, { status: "void" });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:adminVoidPostedInvoice",
      resourceType: "invoice",
      resourceId: args.invoiceId,
      action: "invoice_admin_voided",
      beforeValue: JSON.stringify(invoice),
      afterValue: JSON.stringify({ ...invoice, status: "void" }),
      reason: args.reason,
      details: `Owner voided posted invoice ${invoice.invoiceNumber}`,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Bad Debt Write-Off
// ─────────────────────────────────────────────────────────────────────────────
// Accounting: Dr Bad Debt Expense / Cr Accounts Receivable.
// This is NOT a credit note. A credit note reverses a sale (goods returned or
// sale was wrong). A write-off records that the sale was correct and the money
// did not arrive. Do not share code paths with credit memos.
//
// Outstanding balance formula: totalAmount - amountPaid - amountWrittenOff.
// This is arithmetic, not status-based — the only correct way to handle partial
// write-offs. The credit gate (getOutstandingBalance in creditControl.ts) uses
// the same formula, so a write-off immediately releases the customer's limit.
//
// Status after write-off:
//   remaining > 0  → status unchanged (sent / partially_paid / overdue)
//   remaining = 0, amountWrittenOff > 0  → written_off (money was lost)
//   remaining = 0, amountWrittenOff = 0  → paid (money arrived)
// The written_off status exists specifically to prevent written-off invoices
// from appearing as "paid" in collection reports and customer history.
//
// VAT: if the invoice had VAT, the write-off records taxAmount on the
// badDebtWriteOffs row but does NOT post it to the ledger. The business has
// paid VAT on money it never received; the formal reclaim belongs to the VAT
// posting module (not yet built). taxAmount is preserved here so that module
// can read it when the time comes. Do not zero it out or drop it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper: compute the new invoice status after amountWrittenOff has been updated.
 * Keeps status logic in one place so writeOffBadDebt and recoverBadDebt agree.
 */
function computeStatusAfterWriteOff(
  totalAmount: number,
  amountPaid: number,
  amountWrittenOff: number,
  currentStatus: string,
): "written_off" | "paid" | "sent" | "partially_paid" | "overdue" {
  const remaining = round2(totalAmount - amountPaid - amountWrittenOff);
  if (remaining <= 0) {
    return amountWrittenOff > 0 ? "written_off" : "paid";
  }
  // remaining > 0: preserve the current status, but guard against impossible states
  if (currentStatus === "paid" || currentStatus === "written_off") {
    return "partially_paid";
  }
  return currentStatus as "sent" | "partially_paid" | "overdue";
}

export const writeOffBadDebt = mutation({
  args: {
    invoiceId: v.id("invoices"),
    amount: v.number(),
    reason: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args): Promise<{ writeOffId: string }> => {
    // Owner-only — this is one of the few mutations by which money owed to the
    // business can disappear without cash arriving. Follow adminVoidPostedEntry.
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    if (args.reason.trim().length === 0) {
      throw new ConvexError({ message: "Reason is required", code: "BAD_REQUEST" });
    }
    if (args.amount <= 0) {
      throw new ConvexError({ message: "Write-off amount must be positive", code: "BAD_REQUEST" });
    }

    await enforcePostingDate(ctx, args.date);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    }
    if (invoice.saleType !== "credit") {
      throw new ConvexError({ message: "Only credit invoices can be written off", code: "BAD_REQUEST" });
    }
    if (!["sent", "partially_paid", "overdue"].includes(invoice.status)) {
      throw new ConvexError({
        message: `Cannot write off an invoice with status "${invoice.status}"`,
        code: "BAD_REQUEST",
      });
    }

    const alreadyWrittenOff = invoice.amountWrittenOff ?? 0;
    const remaining = round2(invoice.totalAmount - invoice.amountPaid - alreadyWrittenOff);
    if (args.amount > remaining + 0.005) {
      throw new ConvexError({
        message: `Write-off amount (${args.amount}) exceeds remaining balance (${remaining})`,
        code: "BAD_REQUEST",
      });
    }

    const control = await getControlAccounts(ctx);

    // Dr Bad Debt Expense / Cr Accounts Receivable
    const glEntryId = await postBalancedEntry(ctx, {
      date: args.date,
      lines: [
        {
          accountId: control.badDebtExpense._id,
          debit: args.amount,
          description: `Bad debt write-off: ${invoice.invoiceNumber}`,
        },
        {
          accountId: control.ar._id,
          credit: args.amount,
          description: `Bad debt write-off: ${invoice.invoiceNumber}`,
        },
      ],
      sourceType: BAD_DEBT_WRITE_OFF_SOURCE,
      sourceId: args.invoiceId,
      reference: invoice.invoiceNumber,
      description: `Bad debt write-off: ${invoice.invoiceNumber} — ${args.reason}`,
      createdBy: user._id,
    });

    // Proportional VAT: preserve the VAT portion on the write-off record for
    // future reclaim. Do NOT post it to the ledger now — that belongs to the
    // VAT posting module. See schema comment on badDebtWriteOffs.taxAmount.
    let taxAmount: number | undefined;
    if (invoice.taxAmount && invoice.taxAmount > 0 && invoice.totalAmount > 0) {
      taxAmount = round2(args.amount * (invoice.taxAmount / invoice.totalAmount));
    }

    const now = new Date().toISOString();
    const newWrittenOff = round2(alreadyWrittenOff + args.amount);
    const newStatus = computeStatusAfterWriteOff(
      invoice.totalAmount,
      invoice.amountPaid,
      newWrittenOff,
      invoice.status,
    );

    await ctx.db.patch(args.invoiceId, {
      amountWrittenOff: newWrittenOff,
      status: newStatus,
      // Clear review deferral — write-off decision supersedes it
      writeOffReviewStatus: undefined,
      writeOffReviewDeferredUntil: undefined,
    });

    const writeOffId = await ctx.db.insert("badDebtWriteOffs", {
      invoiceId: args.invoiceId,
      customerId: invoice.customerId,
      amount: args.amount,
      taxAmount,
      writtenOffBy: user._id,
      writtenOffAt: now,
      reason: args.reason.trim(),
      glEntryId,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:writeOffBadDebt",
      resourceType: "invoice",
      resourceId: args.invoiceId,
      action: "bad_debt_written_off",
      beforeValue: JSON.stringify({ status: invoice.status, amountWrittenOff: alreadyWrittenOff }),
      afterValue: JSON.stringify({ status: newStatus, amountWrittenOff: newWrittenOff, writeOffId }),
      reason: args.reason,
      details: `Bad debt write-off of ${args.amount} on ${invoice.invoiceNumber}. Remaining: ${round2(invoice.totalAmount - invoice.amountPaid - newWrittenOff)}.`,
    });

    return { writeOffId };
  },
});

export const recoverBadDebt = mutation({
  args: {
    writeOffId: v.id("badDebtWriteOffs"),
    amountRecovered: v.number(),
    reason: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await assertOwner(ctx);
    const user = await getCurrentUser(ctx);

    if (args.reason.trim().length === 0) {
      throw new ConvexError({ message: "Reason is required", code: "BAD_REQUEST" });
    }
    if (args.amountRecovered <= 0) {
      throw new ConvexError({ message: "Recovery amount must be positive", code: "BAD_REQUEST" });
    }

    await enforcePostingDate(ctx, args.date);

    const writeOff = await ctx.db.get(args.writeOffId);
    if (!writeOff) {
      throw new ConvexError({ message: "Write-off record not found", code: "NOT_FOUND" });
    }
    if (writeOff.recoveredAt) {
      throw new ConvexError({ message: "This write-off has already been recovered", code: "CONFLICT" });
    }
    if (args.amountRecovered > writeOff.amount + 0.005) {
      throw new ConvexError({
        message: `Recovery amount (${args.amountRecovered}) exceeds write-off amount (${writeOff.amount})`,
        code: "BAD_REQUEST",
      });
    }

    const invoice = await ctx.db.get(writeOff.invoiceId);
    if (!invoice) {
      throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    }

    const control = await getControlAccounts(ctx);

    // Dr AR / Cr Bad Debt Expense (reversal)
    const recoveryGlEntryId = await postBalancedEntry(ctx, {
      date: args.date,
      lines: [
        {
          accountId: control.ar._id,
          debit: args.amountRecovered,
          description: `Bad debt recovery: ${invoice.invoiceNumber}`,
        },
        {
          accountId: control.badDebtExpense._id,
          credit: args.amountRecovered,
          description: `Bad debt recovery: ${invoice.invoiceNumber}`,
        },
      ],
      sourceType: BAD_DEBT_RECOVERY_SOURCE,
      sourceId: args.writeOffId,
      reference: invoice.invoiceNumber,
      description: `Bad debt recovery: ${invoice.invoiceNumber} — ${args.reason}`,
      createdBy: user._id,
    });

    const now = new Date().toISOString();
    const newWrittenOff = round2((invoice.amountWrittenOff ?? 0) - args.amountRecovered);
    const newStatus = computeStatusAfterWriteOff(
      invoice.totalAmount,
      invoice.amountPaid,
      newWrittenOff,
      invoice.status,
    );

    await ctx.db.patch(writeOff.invoiceId, {
      amountWrittenOff: newWrittenOff,
      status: newStatus,
    });

    await ctx.db.patch(args.writeOffId, {
      recoveredAt: now,
      recoveredBy: user._id,
      recoveryReason: args.reason.trim(),
      recoveryGlEntryId,
    });

    // Recovery moves the customer to "watch", not back to "active".
    // A customer who defaulted once can default again; that history should be
    // preserved rather than erased. The owner can manually promote to "active".
    // This calls setCustomerCreditStatusInternal directly (not the public mutation)
    // with a system-generated reason — same pattern as postBalancedEntry/logAudit:
    // one write path in code, two callers with different authorisation.
    await setCustomerCreditStatusInternal(
      ctx,
      writeOff.customerId,
      "watch",
      `Reinstated to watch following recovery of written-off invoice ${invoice.invoiceNumber}`,
      user._id,
      "invoicing:recoverBadDebt",
    );

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:recoverBadDebt",
      resourceType: "invoice",
      resourceId: writeOff.invoiceId,
      action: "bad_debt_recovered",
      beforeValue: JSON.stringify({ status: invoice.status, amountWrittenOff: invoice.amountWrittenOff ?? 0 }),
      afterValue: JSON.stringify({ status: newStatus, amountWrittenOff: newWrittenOff, amountRecovered: args.amountRecovered }),
      reason: args.reason,
      details: `Recovery of ${args.amountRecovered} on written-off invoice ${invoice.invoiceNumber}.`,
    });
  },
});

/**
 * Record a non-write-off review decision on an invoice.
 * No GL effect. Suppresses the invoice from the Bad Debt Review screen until
 * the deferral date expires, so the owner is not shown the same invoice weekly.
 *
 * Staff-accessible (not owner-only): the owner should not have to personally
 * triage every invoice on the review screen.
 */
export const setWriteOffReviewStatus = mutation({
  args: {
    invoiceId: v.id("invoices"),
    status: v.union(
      v.literal("deferred"),
      v.literal("in_litigation"),
      v.literal("payment_promised"),
    ),
    deferUntil: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getCurrentUser(ctx);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    }
    if (args.status === "deferred" && !args.deferUntil) {
      throw new ConvexError({ message: "deferUntil date is required for 'deferred' status", code: "BAD_REQUEST" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const auto30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const deferredUntil = args.status === "deferred" ? args.deferUntil! : auto30Days;

    if (deferredUntil < today) {
      throw new ConvexError({ message: "deferUntil must be in the future", code: "BAD_REQUEST" });
    }

    await ctx.db.patch(args.invoiceId, {
      writeOffReviewStatus: args.status,
      writeOffReviewDeferredUntil: deferredUntil,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "invoicing:setWriteOffReviewStatus",
      resourceType: "invoice",
      resourceId: args.invoiceId,
      action: "write_off_review_status_set",
      beforeValue: JSON.stringify({ writeOffReviewStatus: invoice.writeOffReviewStatus }),
      afterValue: JSON.stringify({ writeOffReviewStatus: args.status, writeOffReviewDeferredUntil: deferredUntil }),
      details: `Review status set to "${args.status}" until ${deferredUntil} on invoice ${invoice.invoiceNumber}.`,
    });
  },
});

export const getWriteOffsByInvoice = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db
      .query("badDebtWriteOffs")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();
  },
});
