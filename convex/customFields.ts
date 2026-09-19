import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity)
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

async function getUser(ctx: QueryCtx | MutationCtx) {
  const identity = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// List custom fields by entity type
export const listByEntity = query({
  args: {
    entityType: v.union(
      v.literal("customer"),
      v.literal("vendor"),
      v.literal("product"),
      v.literal("invoice"),
      v.literal("bill"),
      v.literal("employee")
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("customFields")
      .withIndex("by_entity_type", (q) => q.eq("entityType", args.entityType))
      .collect();
  },
});

// List all custom fields
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("customFields").collect();
  },
});

// Create a custom field
export const create = mutation({
  args: {
    entityType: v.union(
      v.literal("customer"),
      v.literal("vendor"),
      v.literal("product"),
      v.literal("invoice"),
      v.literal("bill"),
      v.literal("employee")
    ),
    fieldName: v.string(),
    fieldLabel: v.string(),
    fieldType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("select"),
      v.literal("textarea")
    ),
    options: v.optional(v.array(v.string())),
    isRequired: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    // Get existing fields to determine sort order
    const existing = await ctx.db
      .query("customFields")
      .withIndex("by_entity_type", (q) => q.eq("entityType", args.entityType))
      .collect();

    return await ctx.db.insert("customFields", {
      ...args,
      isActive: true,
      sortOrder: existing.length,
      createdBy: user._id,
    });
  },
});

// Update a custom field
export const update = mutation({
  args: {
    id: v.id("customFields"),
    fieldLabel: v.optional(v.string()),
    fieldType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("number"),
        v.literal("date"),
        v.literal("boolean"),
        v.literal("select"),
        v.literal("textarea")
      )
    ),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getUser(ctx);
    const { id, ...updates } = args;
    const field = await ctx.db.get(id);
    if (!field) throw new ConvexError({ message: "Field not found", code: "NOT_FOUND" });

    const patch: Record<string, string | string[] | boolean | number> = {};
    if (updates.fieldLabel !== undefined) patch.fieldLabel = updates.fieldLabel;
    if (updates.fieldType !== undefined) patch.fieldType = updates.fieldType;
    if (updates.options !== undefined) patch.options = updates.options;
    if (updates.isRequired !== undefined) patch.isRequired = updates.isRequired;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;
    if (updates.sortOrder !== undefined) patch.sortOrder = updates.sortOrder;

    await ctx.db.patch(id, patch);
  },
});

// Delete a custom field and its values
export const remove = mutation({
  args: { id: v.id("customFields") },
  handler: async (ctx, args) => {
    await getUser(ctx);
    // Delete all values for this field
    const values = await ctx.db
      .query("customFieldValues")
      .withIndex("by_field", (q) => q.eq("fieldId", args.id))
      .collect();
    for (const val of values) {
      await ctx.db.delete(val._id);
    }
    await ctx.db.delete(args.id);
  },
});

// Get field values for an entity
export const getValues = query({
  args: { entityType: v.string(), entityId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();
  },
});

// Set field values for an entity (upsert)
export const setValues = mutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
    values: v.array(
      v.object({
        fieldId: v.id("customFields"),
        value: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await getUser(ctx);
    // Get existing values for this entity
    const existing = await ctx.db
      .query("customFieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .collect();

    const existingMap = new Map(
      existing.map((val) => [val.fieldId as string, val])
    );

    for (const { fieldId, value } of args.values) {
      const existingVal = existingMap.get(fieldId as string);
      if (existingVal) {
        if (value === "") {
          await ctx.db.delete(existingVal._id);
        } else {
          await ctx.db.patch(existingVal._id, { value });
        }
      } else if (value !== "") {
        await ctx.db.insert("customFieldValues", {
          fieldId,
          entityType: args.entityType,
          entityId: args.entityId,
          value,
        });
      }
    }
  },
});
