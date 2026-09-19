// ─────────────────────────────────────────────────────────────────────────────
// Built-in sign-in — database side.
//
// Everything here is internal except `setupStatus`, which only answers
// "has the first owner been created yet?" so the start screen knows whether to
// show the first-time setup form or the normal sign-in form.
//
// Password hashing and token signing need Node's crypto, so they live in
// convex/authActions.ts ("use node"). This file only reads and writes rows.
// ─────────────────────────────────────────────────────────────────────────────
import { v, ConvexError } from "convex/values";
import { query, internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { logAudit } from "./lib/audit.ts";
import { tokenIdentifierFor, normalizeEmail } from "./lib/authShared.ts";

// ─── Public ──────────────────────────────────────────────────

export const setupStatus = query({
  args: {},
  handler: async (ctx) => {
    const anyUser = await ctx.db.query("users").first();
    return { needsSetup: anyUser === null };
  },
});

// ─── Signing key ─────────────────────────────────────────────

export const getSigningKey = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("authKeys").first();
  },
});

/** Stores a freshly generated key unless one already exists (first writer wins). */
export const saveSigningKey = internalMutation({
  args: { kid: v.string(), privateKeyPem: v.string(), publicJwk: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("authKeys").first();
    if (existing) return existing;
    const id = await ctx.db.insert("authKeys", args);
    return (await ctx.db.get(id))!;
  },
});

// ─── Accounts ────────────────────────────────────────────────

export const getAccountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .unique();
    if (!account) return null;
    const user = await ctx.db.get(account.userId);
    return { account, user };
  },
});

export const getUserByTokenIdentifier = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});

export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * First-time setup: creates the owner, their sign-in account and (optionally)
 * the company profile. Refuses if anyone already exists, so this can only
 * ever happen once per installation.
 */
export const createFirstOwner = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    companyName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const anyUser = await ctx.db.query("users").first();
    if (anyUser) {
      throw new ConvexError({
        message: "Setup is already complete. Please sign in.",
        code: "CONFLICT",
      });
    }
    const email = normalizeEmail(args.email);
    const userId = await ctx.db.insert("users", {
      tokenIdentifier: "pending",
      name: args.name,
      email,
      role: "owner",
      isActive: true,
    });
    await ctx.db.patch(userId, { tokenIdentifier: tokenIdentifierFor(userId) });
    await ctx.db.insert("authAccounts", {
      email,
      passwordHash: args.passwordHash,
      userId,
      failedAttempts: 0,
    });

    if (args.companyName) {
      const profile = await ctx.db.query("companyProfile").first();
      if (!profile) {
        await ctx.db.insert("companyProfile", { nameEn: args.companyName, email, updatedBy: userId });
      }
    }

    await logAudit(ctx, {
      userId,
      mutationName: "authStore:createFirstOwner",
      resourceType: "user",
      resourceId: userId,
      action: "First-time setup: owner account created",
    });
    return userId;
  },
});

/**
 * Creates or replaces the sign-in (email + password) for an existing team
 * member. Also makes sure the member's tokenIdentifier is the built-in one, so
 * members added earlier with a "manual|…" placeholder can now sign in.
 * Permission checks happen in the calling action.
 */
export const upsertAccountForUser = internalMutation({
  args: {
    userId: v.id("users"),
    email: v.string(),
    passwordHash: v.string(),
    actorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    const email = normalizeEmail(args.email);

    const emailOwner = await ctx.db
      .query("authAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (emailOwner && emailOwner.userId !== args.userId) {
      throw new ConvexError({
        message: "This email is already used by another team member.",
        code: "CONFLICT",
      });
    }

    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        passwordHash: args.passwordHash,
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    } else {
      await ctx.db.insert("authAccounts", {
        email,
        passwordHash: args.passwordHash,
        userId: args.userId,
        failedAttempts: 0,
      });
    }

    await ctx.db.patch(args.userId, {
      email,
      tokenIdentifier: tokenIdentifierFor(args.userId),
    });

    // A new password ends every existing session of that person.
    await deleteSessionsForUser(ctx, args.userId);

    await logAudit(ctx, {
      userId: args.actorId,
      mutationName: "authStore:upsertAccountForUser",
      resourceType: "user",
      resourceId: args.userId,
      action:
        args.actorId === args.userId
          ? "Changed own password"
          : `Set sign-in password for ${user.name ?? email}`,
    });
  },
});

export const recordFailedAttempt = internalMutation({
  args: { accountId: v.id("authAccounts"), maxAttempts: v.number(), lockMs: v.number() },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return;
    const attempts = (account.failedAttempts ?? 0) + 1;
    if (attempts >= args.maxAttempts) {
      await ctx.db.patch(args.accountId, {
        failedAttempts: 0,
        lockedUntil: Date.now() + args.lockMs,
      });
    } else {
      await ctx.db.patch(args.accountId, { failedAttempts: attempts });
    }
  },
});

export const clearFailedAttempts = internalMutation({
  args: { accountId: v.id("authAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, { failedAttempts: 0, lockedUntil: undefined });
  },
});

// ─── Sessions ────────────────────────────────────────────────

export const createSession = internalMutation({
  args: { userId: v.id("users"), refreshTokenHash: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("authSessions", args);
  },
});

export const getSession = internalQuery({
  args: { refreshTokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_refresh", (q) => q.eq("refreshTokenHash", args.refreshTokenHash))
      .unique();
    if (!session) return null;
    const user = await ctx.db.get(session.userId);
    return { session, user };
  },
});

/** Swaps an old refresh token for a new one in one step. */
export const rotateSession = internalMutation({
  args: {
    oldRefreshTokenHash: v.string(),
    newRefreshTokenHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_refresh", (q) => q.eq("refreshTokenHash", args.oldRefreshTokenHash))
      .unique();
    if (!session) {
      throw new ConvexError({ message: "Session expired. Please sign in again.", code: "UNAUTHENTICATED" });
    }
    await ctx.db.patch(session._id, {
      refreshTokenHash: args.newRefreshTokenHash,
      expiresAt: args.expiresAt,
    });
    return session.userId;
  },
});

export const deleteSession = internalMutation({
  args: { refreshTokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_refresh", (q) => q.eq("refreshTokenHash", args.refreshTokenHash))
      .unique();
    if (session) await ctx.db.delete(session._id);
  },
});

async function deleteSessionsForUser(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  userId: Id<"users">,
) {
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(500);
  for (const s of sessions) await ctx.db.delete(s._id);
}
