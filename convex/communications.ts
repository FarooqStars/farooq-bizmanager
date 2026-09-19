import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

async function getUser(ctx: QueryCtx | MutationCtx, tokenIdentifier: string) {
  return ctx.db.query("users").withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier)).unique();
}

// ── Message Templates ────────────────────────────────────────────────────────

export const listMessageTemplates = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return ctx.db.query("messageTemplates").order("desc").collect();
  },
});

export const createMessageTemplate = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    type: v.union(
      v.literal("invoice_reminder"),
      v.literal("quotation_followup"),
      v.literal("payment_receipt"),
      v.literal("delivery_note"),
      v.literal("general")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, (identity as { tokenIdentifier: string }).tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    return ctx.db.insert("messageTemplates", { ...args, createdBy: user._id });
  },
});

export const deleteMessageTemplate = mutation({
  args: { templateId: v.id("messageTemplates") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    await ctx.db.delete(args.templateId);
  },
});

// ── Communication Log ────────────────────────────────────────────────────────

export const listCommunicationLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return ctx.db.query("communicationLog").order("desc").take(args.limit ?? 50);
  },
});

export const logCommunication = mutation({
  args: {
    channel: v.union(v.literal("email"), v.literal("whatsapp"), v.literal("link")),
    documentType: v.union(
      v.literal("invoice"),
      v.literal("quotation"),
      v.literal("purchase_order"),
      v.literal("payment_reminder"),
      v.literal("delivery_note")
    ),
    documentId: v.string(),
    documentNumber: v.string(),
    recipientName: v.string(),
    recipientContact: v.string(),
    subject: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, (identity as { tokenIdentifier: string }).tokenIdentifier);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    return ctx.db.insert("communicationLog", {
      ...args,
      sentAt: new Date().toISOString(),
      sentBy: user._id,
    });
  },
});

// ── Overdue Invoices for Reminders ───────────────────────────────────────────

export const getOverdueInvoices = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const invoices = await ctx.db.query("invoices").withIndex("by_status", (q) => q.eq("status", "overdue")).collect();
    const customers = await ctx.db.query("customers").collect();
    const customerMap = new Map(customers.map((c) => [c._id, c]));

    return invoices.map((inv) => {
      const customer = customerMap.get(inv.customerId);
      const daysPast = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
      return {
        ...inv,
        customerName: customer?.name ?? "Unknown",
        customerEmail: customer?.email ?? "",
        customerPhone: customer?.phone ?? "",
        daysPastDue: daysPast,
        balance: inv.totalAmount - inv.amountPaid,
      };
    }).sort((a, b) => b.daysPastDue - a.daysPastDue);
  },
});

// ── Document share data ──────────────────────────────────────────────────────

export const getInvoiceShareData = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    const customer = await ctx.db.get(invoice.customerId);
    const items = await ctx.db.query("invoiceItems").withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId)).collect();
    return {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      status: invoice.status,
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email ?? "",
      customerPhone: customer?.phone ?? "",
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      balance: invoice.totalAmount - invoice.amountPaid,
      items,
    };
  },
});

export const getQuotationShareData = query({
  args: { quotationId: v.id("quotations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const quotation = await ctx.db.get(args.quotationId);
    if (!quotation) throw new ConvexError({ message: "Quotation not found", code: "NOT_FOUND" });
    const customer = await ctx.db.get(quotation.customerId);
    const items = await ctx.db.query("quotationItems").withIndex("by_quotation", (q) => q.eq("quotationId", args.quotationId)).collect();
    return {
      quoteNumber: quotation.quoteNumber,
      date: quotation.date,
      validUntil: quotation.validUntil,
      status: quotation.status,
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email ?? "",
      customerPhone: customer?.phone ?? "",
      totalAmount: quotation.totalAmount,
      items,
    };
  },
});
