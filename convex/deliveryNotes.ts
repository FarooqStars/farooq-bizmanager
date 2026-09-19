import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { enforcePostingDate } from "./closingDate.ts";
import type { MutationCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateNoteNumber(ctx: MutationCtx): Promise<string> {
  const latest = await ctx.db.query("deliveryNotes").order("desc").first();
  if (!latest) return "DN-0001";
  const num = parseInt(latest.noteNumber.replace("DN-", ""), 10);
  return `DN-${String((isNaN(num) ? 0 : num) + 1).padStart(4, "0")}`;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const listDeliveryNotes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const notes = await ctx.db.query("deliveryNotes").order("desc").collect();
    const customers = await ctx.db.query("customers").collect();
    const users = await ctx.db.query("users").collect();
    const customerMap = new Map(customers.map((c) => [c._id, c]));
    const userMap = new Map(users.map((u) => [u._id, u]));

    return notes.map((n) => ({
      ...n,
      customer: customerMap.get(n.customerId) ?? null,
      createdByUser: userMap.get(n.createdBy) ?? null,
    }));
  },
});

export const getDeliveryNote = query({
  args: { noteId: v.id("deliveryNotes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError({ message: "Delivery note not found", code: "NOT_FOUND" });

    const items = await ctx.db
      .query("deliveryNoteItems")
      .withIndex("by_delivery_note", (q) => q.eq("deliveryNoteId", args.noteId))
      .collect();

    const customer = await ctx.db.get(note.customerId);
    const createdByUser = await ctx.db.get(note.createdBy);

    // Fetch linked sale or invoice info
    let saleInfo = null;
    if (note.saleId) {
      const sale = await ctx.db.get(note.saleId);
      saleInfo = sale ? { _id: sale._id, date: sale.date, totalAmount: sale.totalAmount } : null;
    }

    let invoiceInfo = null;
    if (note.invoiceId) {
      const invoice = await ctx.db.get(note.invoiceId);
      invoiceInfo = invoice ? { _id: invoice._id, invoiceNumber: invoice.invoiceNumber, totalAmount: invoice.totalAmount } : null;
    }

    return { ...note, items, customer, createdByUser, saleInfo, invoiceInfo };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const createDeliveryNote = mutation({
  args: {
    date: v.string(),
    customerId: v.id("customers"),
    saleId: v.optional(v.id("sales")),
    invoiceId: v.optional(v.id("invoices")),
    driverName: v.optional(v.string()),
    driverPhone: v.optional(v.string()),
    vehiclePlate: v.optional(v.string()),
    vehicleDescription: v.optional(v.string()),
    receiverName: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    if (args.items.length === 0) {
      throw new ConvexError({ message: "Delivery note must have at least one item", code: "BAD_REQUEST" });
    }

    const noteNumber = await generateNoteNumber(ctx);

    const noteId = await ctx.db.insert("deliveryNotes", {
      noteNumber,
      date: args.date,
      status: "draft",
      customerId: args.customerId,
      saleId: args.saleId,
      invoiceId: args.invoiceId,
      driverName: args.driverName,
      driverPhone: args.driverPhone,
      vehiclePlate: args.vehiclePlate,
      vehicleDescription: args.vehicleDescription,
      receiverName: args.receiverName,
      deliveryAddress: args.deliveryAddress,
      notes: args.notes,
      createdBy: caller._id,
    });

    for (const item of args.items) {
      await ctx.db.insert("deliveryNoteItems", {
        deliveryNoteId: noteId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "deliveryNotes:createDeliveryNote",
      resourceType: "delivery_note",
      resourceId: noteId,
      action: "Created delivery note",
      details: `${noteNumber} — ${args.items.length} item(s)`,
      afterValue: JSON.stringify({ noteNumber, customerId: args.customerId, itemCount: args.items.length, status: "draft" }),
    });

    return noteId;
  },
});

export const updateDeliveryNoteStatus = mutation({
  args: {
    noteId: v.id("deliveryNotes"),
    status: v.union(
      v.literal("draft"),
      v.literal("dispatched"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const caller = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError({ message: "Delivery note not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.noteId, { status: args.status });

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "deliveryNotes:updateDeliveryNoteStatus",
      resourceType: "delivery_note",
      resourceId: args.noteId,
      action: `Updated delivery note status to ${args.status}`,
      details: note.noteNumber,
      beforeValue: JSON.stringify({ status: note.status }),
      afterValue: JSON.stringify({ status: args.status }),
    });
  },
});

export const getItemsFromSale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();

    return items.map((item) => ({
      productId: item.productId,
      description: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
  },
});

export const getItemsFromInvoice = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    return items.map((item) => ({
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
  },
});
