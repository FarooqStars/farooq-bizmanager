import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

const recordTypeValidator = v.union(
  v.literal("invoice"),
  v.literal("bill"),
  v.literal("expense"),
  v.literal("asset"),
  v.literal("product"),
  v.literal("employee"),
  v.literal("sale"),
  v.literal("purchase_order"),
  v.literal("warranty")
);

async function getUser(ctx: QueryCtx, tokenIdentifier: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    return await ctx.storage.generateUploadUrl();
  },
});

export const addAttachment = mutation({
  args: {
    recordType: recordTypeValidator,
    recordId: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storageId: v.id("_storage"),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const attachmentId = await ctx.db.insert("attachments", {
      recordType: args.recordType,
      recordId: args.recordId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      storageId: args.storageId,
      description: args.description,
      uploadedBy: user._id,
      uploadedAt: new Date().toISOString(),
    });
    return attachmentId;
  },
});

export const listAttachments = query({
  args: {
    recordType: recordTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_record", (q) =>
        q.eq("recordType", args.recordType).eq("recordId", args.recordId)
      )
      .collect();

    const results = await Promise.all(
      attachments.map(async (att) => {
        const url = await ctx.storage.getUrl(att.storageId);
        const uploader = await ctx.db.get(att.uploadedBy);
        return {
          ...att,
          url,
          uploaderName: uploader?.name ?? "Unknown",
        };
      })
    );
    return results;
  },
});

export const deleteAttachment = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await getUser(ctx, identity.tokenIdentifier);
    if (!user) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) throw new ConvexError({ message: "Attachment not found", code: "NOT_FOUND" });

    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(args.attachmentId);
  },
});

export const getAttachmentCount = query({
  args: {
    recordType: recordTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_record", (q) =>
        q.eq("recordType", args.recordType).eq("recordId", args.recordId)
      )
      .collect();
    return attachments.length;
  },
});
