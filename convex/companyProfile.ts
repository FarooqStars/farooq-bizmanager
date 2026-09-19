import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const profiles = await ctx.db.query("companyProfile").take(1);
    return profiles[0] ?? null;
  },
});

export const save = mutation({
  args: {
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    nameUr: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    crNumber: v.optional(v.string()),
    taxId: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
    defaultCountry: v.optional(v.string()),
    fiscalYearStartMonth: v.optional(v.number()),
    invoiceFooterEn: v.optional(v.string()),
    invoiceFooterAr: v.optional(v.string()),
    invoiceFooterUr: v.optional(v.string()),
    inventoryValuationMethod: v.optional(
      v.union(v.literal("fifo"), v.literal("lifo"), v.literal("weighted_average")),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    // Only owners can update company profile
    if (user.role !== "owner") {
      throw new ConvexError({
        message: "Only owners can update company profile",
        code: "FORBIDDEN",
      });
    }

    const existing = await ctx.db.query("companyProfile").take(1);

    const data = {
      nameEn: args.nameEn,
      nameAr: args.nameAr,
      nameUr: args.nameUr,
      logoUrl: args.logoUrl,
      logoStorageId: args.logoStorageId,
      address: args.address,
      phone: args.phone,
      email: args.email,
      website: args.website,
      crNumber: args.crNumber,
      taxId: args.taxId,
      defaultCurrency: args.defaultCurrency,
      defaultCountry: args.defaultCountry,
      fiscalYearStartMonth: args.fiscalYearStartMonth,
      invoiceFooterEn: args.invoiceFooterEn,
      invoiceFooterAr: args.invoiceFooterAr,
      invoiceFooterUr: args.invoiceFooterUr,
      inventoryValuationMethod: args.inventoryValuationMethod,
      updatedBy: user._id,
    };

    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, data);
      return existing[0]._id;
    } else {
      return await ctx.db.insert("companyProfile", data);
    }
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can upload logo", code: "FORBIDDEN" });
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const getLogoUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    return await ctx.storage.getUrl(args.storageId as never);
  },
});
