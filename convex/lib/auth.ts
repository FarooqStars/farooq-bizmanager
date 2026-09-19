// ─────────────────────────────────────────────────────────────────────────────
// Shared authentication / authorization helpers.
//
// assertOwner   — throws unless the current user is the account owner. Used to
//                 gate destructive admin actions (reverse-and-repost of posted
//                 financial documents).
// getCurrentUser — resolves the current user row from the auth identity.
//
// Both look the user up via the `by_token` index on `users.tokenIdentifier`,
// which is the only correct way to link an authenticated end user to a row.
// ─────────────────────────────────────────────────────────────────────────────
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel.d.ts";

export async function assertOwner(ctx: MutationCtx | QueryCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  if (user.role !== "owner") {
    throw new ConvexError({
      message: "Only the account owner can perform this action",
      code: "FORBIDDEN",
    });
  }
}

export async function getCurrentUser(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}
