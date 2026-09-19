import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel.d.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }; db: unknown }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

// ─── Link / Unlink ──────────────────────────────────────────

export const linkCustomerVendor = mutation({
  args: {
    customerId: v.id("customers"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });

    // Check if either is already linked
    if (customer.linkedVendorId) {
      throw new ConvexError({ message: "Customer is already linked to another vendor", code: "CONFLICT" });
    }
    if (vendor.linkedCustomerId) {
      throw new ConvexError({ message: "Vendor is already linked to another customer", code: "CONFLICT" });
    }

    // Link both sides
    await ctx.db.patch(args.customerId, { linkedVendorId: args.vendorId });
    await ctx.db.patch(args.vendorId, { linkedCustomerId: args.customerId });
  },
});

export const unlinkCustomerVendor = mutation({
  args: {
    customerId: v.id("customers"),
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });

    // Unlink both sides
    await ctx.db.patch(args.customerId, { linkedVendorId: undefined });
    await ctx.db.patch(args.vendorId, { linkedCustomerId: undefined });
  },
});

// ─── Combined Relationship Query ─────────────────────────────

export const getRelationshipSummary = query({
  args: {
    customerId: v.optional(v.id("customers")),
    vendorId: v.optional(v.id("vendors")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    let customer: Doc<"customers"> | null = null;
    let vendor: Doc<"vendors"> | null = null;

    if (args.customerId) {
      customer = await ctx.db.get(args.customerId);
      if (customer?.linkedVendorId) {
        vendor = await ctx.db.get(customer.linkedVendorId);
      }
    } else if (args.vendorId) {
      vendor = await ctx.db.get(args.vendorId);
      if (vendor?.linkedCustomerId) {
        customer = await ctx.db.get(vendor.linkedCustomerId);
      }
    }

    if (!customer && !vendor) return null;

    // Calculate AR (customer owes us) from invoices
    let arBalance = 0;
    if (customer) {
      const invoices = await ctx.db
        .query("invoices")
        .withIndex("by_customer", (q) => q.eq("customerId", customer!._id))
        .collect();
      arBalance = invoices
        .filter((inv) => inv.status !== "void" && inv.status !== "paid")
        .reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);
    }

    // Calculate AP (we owe vendor) from bills
    let apBalance = 0;
    if (vendor) {
      const bills = await ctx.db
        .query("bills")
        .withIndex("by_vendor", (q) => q.eq("vendorId", vendor!._id))
        .collect();
      apBalance = bills
        .filter((bill) => bill.status !== "paid")
        .reduce((sum, bill) => sum + bill.amount, 0);
    }

    const netBalance = arBalance - apBalance;

    return {
      customer: customer ? { _id: customer._id, name: customer.name, companyName: customer.companyName } : null,
      vendor: vendor ? { _id: vendor._id, name: vendor.name, companyName: vendor.companyName } : null,
      arBalance,
      apBalance,
      netBalance,
      netFavor: netBalance > 0 ? "ours" as const : netBalance < 0 ? "theirs" as const : "even" as const,
    };
  },
});

// ─── Create as Both ─────────────────────────────────────────

export const createCustomerAsVendor = mutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    if (customer.linkedVendorId) throw new ConvexError({ message: "Already linked to a vendor", code: "CONFLICT" });

    // Create vendor from customer data
    const vendorId = await ctx.db.insert("vendors", {
      name: customer.name,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      mobile: customer.mobile,
      fax: customer.fax,
      website: customer.website,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zipCode: customer.zipCode,
      country: customer.country,
      taxId: customer.taxId,
      paymentTerms: customer.paymentTerms,
      notes: customer.notes,
      isActive: true,
      linkedCustomerId: args.customerId,
    });

    // Link customer back
    await ctx.db.patch(args.customerId, { linkedVendorId: vendorId });
    return vendorId;
  },
});

export const createVendorAsCustomer = mutation({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });
    if (vendor.linkedCustomerId) throw new ConvexError({ message: "Already linked to a customer", code: "CONFLICT" });

    // Create customer from vendor data
    const customerId = await ctx.db.insert("customers", {
      name: vendor.name,
      companyName: vendor.companyName,
      email: vendor.email,
      phone: vendor.phone,
      mobile: vendor.mobile,
      fax: vendor.fax,
      website: vendor.website,
      address: vendor.address,
      city: vendor.city,
      state: vendor.state,
      zipCode: vendor.zipCode,
      country: vendor.country,
      taxId: vendor.taxId,
      paymentTerms: vendor.paymentTerms,
      notes: vendor.notes,
      isActive: true,
      linkedVendorId: args.vendorId,
    });

    // Link vendor back
    await ctx.db.patch(args.vendorId, { linkedCustomerId: customerId });
    return customerId;
  },
});
