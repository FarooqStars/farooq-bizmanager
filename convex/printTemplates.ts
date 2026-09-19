import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { getUser } from "./users.ts";

const documentTypeValidator = v.union(
  v.literal("invoice"),
  v.literal("delivery_note"),
  v.literal("quotation"),
  v.literal("purchase_order"),
  v.literal("receipt")
);

const configValidator = v.object({
  logoPosition: v.union(v.literal("left"), v.literal("center"), v.literal("right"), v.literal("hidden")),
  headerLayout: v.union(v.literal("standard"), v.literal("compact"), v.literal("full_width")),
  showCompanyNameAr: v.boolean(),
  showCompanyNameUr: v.boolean(),
  primaryColor: v.string(),
  fontSize: v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
  showBorders: v.boolean(),
  showItemNumber: v.boolean(),
  showItemDescription: v.boolean(),
  showQuantity: v.boolean(),
  showUnitPrice: v.boolean(),
  showDiscount: v.boolean(),
  showTax: v.boolean(),
  showTotal: v.boolean(),
  showPaymentTerms: v.boolean(),
  showBankDetails: v.boolean(),
  showSignatureLine: v.boolean(),
  showQrCode: v.boolean(),
  headerText: v.optional(v.string()),
  footerText: v.optional(v.string()),
  termsText: v.optional(v.string()),
  pageSize: v.union(v.literal("a4"), v.literal("letter"), v.literal("a5")),
  orientation: v.union(v.literal("portrait"), v.literal("landscape")),

  // Logo Source
  logoSource: v.optional(v.union(v.literal("company_profile"), v.literal("custom"), v.literal("none"))),
  customLogoStorageId: v.optional(v.string()),
  logoSize: v.optional(v.union(v.literal("small"), v.literal("medium"), v.literal("large"))),

  // Typography
  fontFamily: v.optional(v.union(v.literal("system"), v.literal("serif"), v.literal("mono"), v.literal("arabic"))),
  secondaryColor: v.optional(v.string()),
  headerFontSize: v.optional(v.union(v.literal("same"), v.literal("larger"), v.literal("extra_large"))),

  // Layout & Spacing
  tableHeaderStyle: v.optional(v.union(v.literal("filled"), v.literal("underline"), v.literal("plain"))),
  margins: v.optional(v.union(v.literal("narrow"), v.literal("normal"), v.literal("wide"))),
  itemRowHeight: v.optional(v.union(v.literal("compact"), v.literal("normal"), v.literal("spacious"))),

  // Additional Sections
  showWatermark: v.optional(v.boolean()),
  watermarkText: v.optional(v.string()),
  showNotesSection: v.optional(v.boolean()),
  notesLabel: v.optional(v.string()),
  showStampArea: v.optional(v.boolean()),
  showCustomerTaxId: v.optional(v.boolean()),
  showDeliveryAddress: v.optional(v.boolean()),
  footerAlignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),

  // Document Number Format
  showDocPrefix: v.optional(v.boolean()),
  docPrefix: v.optional(v.string()),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db.query("printTemplates").collect();
  },
});

export const getByType = query({
  args: { documentType: documentTypeValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db
      .query("printTemplates")
      .withIndex("by_type", (q) => q.eq("documentType", args.documentType))
      .collect();
  },
});

export const getDefault = query({
  args: { documentType: documentTypeValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.db
      .query("printTemplates")
      .withIndex("by_default", (q) =>
        q.eq("documentType", args.documentType).eq("isDefault", true)
      )
      .first();
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("printTemplates")),
    name: v.string(),
    documentType: documentTypeValidator,
    isDefault: v.boolean(),
    config: configValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only owners or managers can manage print templates", code: "FORBIDDEN" });
    }

    // If setting as default, unset existing default for this type
    if (args.isDefault) {
      const existing = await ctx.db
        .query("printTemplates")
        .withIndex("by_default", (q) =>
          q.eq("documentType", args.documentType).eq("isDefault", true)
        )
        .collect();
      for (const tmpl of existing) {
        if (tmpl._id !== args.id) {
          await ctx.db.patch(tmpl._id, { isDefault: false });
        }
      }
    }

    if (args.id) {
      await ctx.db.patch(args.id, {
        name: args.name,
        documentType: args.documentType,
        isDefault: args.isDefault,
        config: args.config,
      });
      return args.id;
    }

    return await ctx.db.insert("printTemplates", {
      name: args.name,
      documentType: args.documentType,
      isDefault: args.isDefault,
      config: args.config,
      createdBy: user._id,
    });
  },
});

export const setDefault = mutation({
  args: { id: v.id("printTemplates") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only owners or managers can manage print templates", code: "FORBIDDEN" });
    }

    const template = await ctx.db.get(args.id);
    if (!template) throw new ConvexError({ message: "Template not found", code: "NOT_FOUND" });

    // Unset existing defaults for this document type
    const existing = await ctx.db
      .query("printTemplates")
      .withIndex("by_default", (q) =>
        q.eq("documentType", template.documentType).eq("isDefault", true)
      )
      .collect();
    for (const tmpl of existing) {
      await ctx.db.patch(tmpl._id, { isDefault: false });
    }

    await ctx.db.patch(args.id, { isDefault: true });
  },
});

export const deleteTemplate = mutation({
  args: { id: v.id("printTemplates") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user || user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can delete print templates", code: "FORBIDDEN" });
    }

    const template = await ctx.db.get(args.id);
    if (!template) throw new ConvexError({ message: "Template not found", code: "NOT_FOUND" });

    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user || (user.role !== "owner" && user.role !== "manager")) {
      throw new ConvexError({ message: "Only owners or managers can upload logos", code: "FORBIDDEN" });
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const getLogoUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.storage.getUrl(args.storageId as Id<"_storage">);
  },
});
