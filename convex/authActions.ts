"use node";

// ─────────────────────────────────────────────────────────────────────────────
// Built-in sign-in — actions (Node runtime, for crypto).
//
//   setupOwner       first-time setup, only works while there are no users
//   signIn           email + password  →  { token, refreshToken }
//   refresh          old refreshToken  →  new { token, refreshToken }
//   signOut          ends one session
//   setUserPassword  owner/manager sets a team member's sign-in; anyone can
//                    change their own password
//   resetPasswordByEmail  (internal) — for an owner who forgot the password:
//                    run it from the Convex dashboard → Functions.
//
// Passwords are stored as scrypt hashes. Refresh tokens are stored as SHA-256
// hashes, never in plain text. The RS256 signing key is generated on first use
// and kept in the private authKeys table.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import {
  AUTH_ISSUER,
  AUTH_AUDIENCE,
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_DAYS,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  isValidEmail,
} from "./lib/authShared.ts";

type Tokens = { token: string; refreshToken: string };

// ─── Password hashing ────────────────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Used when an email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

function checkPasswordRules(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ConvexError({
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      code: "BAD_REQUEST",
    });
  }
}

function checkEmail(email: string) {
  if (!isValidEmail(normalizeEmail(email))) {
    throw new ConvexError({ message: "Please enter a valid email address.", code: "BAD_REQUEST" });
  }
}

// ─── Tokens ──────────────────────────────────────────────────

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("base64url");
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function getOrCreateKey(ctx: ActionCtx) {
  const existing = await ctx.runQuery(internal.authStore.getSigningKey, {});
  if (existing) return existing;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = crypto.randomBytes(8).toString("hex");
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const publicJwk = JSON.stringify({ ...jwk, kid, alg: "RS256", use: "sig" });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  // If two people set up at the same moment, the first saved key wins for both.
  return await ctx.runMutation(internal.authStore.saveSigningKey, { kid, privateKeyPem, publicJwk });
}

function signAccessToken(key: { kid: string; privateKeyPem: string }, userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: key.kid };
  const payload = {
    iss: AUTH_ISSUER,
    aud: AUTH_AUDIENCE,
    sub: userId,
    iat: now,
    exp: now + ACCESS_TOKEN_SECONDS,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key.privateKeyPem);
  return `${unsigned}.${base64url(signature)}`;
}

function newRefreshToken() {
  const refreshToken = crypto.randomBytes(32).toString("base64url");
  return {
    refreshToken,
    refreshTokenHash: sha256(refreshToken),
    expiresAt: Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  };
}

async function startSession(ctx: ActionCtx, userId: Id<"users">): Promise<Tokens> {
  const key = await getOrCreateKey(ctx);
  const { refreshToken, refreshTokenHash, expiresAt } = newRefreshToken();
  await ctx.runMutation(internal.authStore.createSession, { userId, refreshTokenHash, expiresAt });
  return { token: signAccessToken(key, userId), refreshToken };
}

// ─── Public actions ──────────────────────────────────────────

export const setupOwner = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    companyName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Tokens> => {
    const name = args.name.trim();
    if (!name) throw new ConvexError({ message: "Please enter your name.", code: "BAD_REQUEST" });
    checkEmail(args.email);
    checkPasswordRules(args.password);
    const userId = await ctx.runMutation(internal.authStore.createFirstOwner, {
      name,
      email: normalizeEmail(args.email),
      passwordHash: hashPassword(args.password),
      companyName: args.companyName?.trim() || undefined,
    });
    return await startSession(ctx, userId);
  },
});

export const signIn = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<Tokens> => {
    const wrong = new ConvexError({ message: "Wrong email or password.", code: "UNAUTHENTICATED" });
    const found = await ctx.runQuery(internal.authStore.getAccountByEmail, {
      email: normalizeEmail(args.email),
    });
    if (!found) {
      verifyPassword(args.password, DUMMY_HASH);
      throw wrong;
    }
    const { account, user } = found;
    if (account.lockedUntil && account.lockedUntil > Date.now()) {
      const minutes = Math.ceil((account.lockedUntil - Date.now()) / 60000);
      throw new ConvexError({
        message: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        code: "LOCKED",
      });
    }
    if (!verifyPassword(args.password, account.passwordHash)) {
      await ctx.runMutation(internal.authStore.recordFailedAttempt, {
        accountId: account._id,
        maxAttempts: MAX_FAILED_ATTEMPTS,
        lockMs: LOCK_MINUTES * 60 * 1000,
      });
      throw wrong;
    }
    if (!user || user.isActive === false) {
      throw new ConvexError({
        message: "This account has been deactivated. Please contact the owner.",
        code: "FORBIDDEN",
      });
    }
    if (account.failedAttempts || account.lockedUntil) {
      await ctx.runMutation(internal.authStore.clearFailedAttempts, { accountId: account._id });
    }
    return await startSession(ctx, user._id);
  },
});

export const refresh = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, args): Promise<Tokens> => {
    const expired = new ConvexError({
      message: "Session expired. Please sign in again.",
      code: "UNAUTHENTICATED",
    });
    const oldHash = sha256(args.refreshToken);
    const found = await ctx.runQuery(internal.authStore.getSession, { refreshTokenHash: oldHash });
    if (!found) throw expired;
    const { session, user } = found;
    if (session.expiresAt < Date.now() || !user || user.isActive === false) {
      await ctx.runMutation(internal.authStore.deleteSession, { refreshTokenHash: oldHash });
      throw expired;
    }
    const key = await getOrCreateKey(ctx);
    const { refreshToken, refreshTokenHash, expiresAt } = newRefreshToken();
    const userId = await ctx.runMutation(internal.authStore.rotateSession, {
      oldRefreshTokenHash: oldHash,
      newRefreshTokenHash: refreshTokenHash,
      expiresAt,
    });
    return { token: signAccessToken(key, userId), refreshToken };
  },
});

export const signOut = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.authStore.deleteSession, {
      refreshTokenHash: sha256(args.refreshToken),
    });
  },
});

export const setUserPassword = action({
  args: { userId: v.id("users"), email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await ctx.runQuery(internal.authStore.getUserByTokenIdentifier, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!caller || caller.isActive === false) {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }
    const target = await ctx.runQuery(internal.authStore.getUserById, { userId: args.userId });
    if (!target) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const isSelf = caller._id === target._id;
    const allowed =
      isSelf ||
      (caller.role === "owner" && target.role !== "owner") ||
      (caller.role === "manager" && target.role === "staff");
    if (!allowed) {
      throw new ConvexError({
        message: "You are not allowed to change this person's sign-in.",
        code: "FORBIDDEN",
      });
    }
    checkEmail(args.email);
    checkPasswordRules(args.password);
    await ctx.runMutation(internal.authStore.upsertAccountForUser, {
      userId: target._id,
      email: normalizeEmail(args.email),
      passwordHash: hashPassword(args.password),
      actorId: caller._id,
    });
  },
});

// ─── Emergency reset (dashboard only) ────────────────────────

export const resetPasswordByEmail = internalAction({
  args: { email: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    checkPasswordRules(args.newPassword);
    const found = await ctx.runQuery(internal.authStore.getAccountByEmail, {
      email: normalizeEmail(args.email),
    });
    if (!found || !found.user) {
      throw new ConvexError({ message: "No account with that email.", code: "NOT_FOUND" });
    }
    await ctx.runMutation(internal.authStore.upsertAccountForUser, {
      userId: found.user._id,
      email: found.account.email,
      passwordHash: hashPassword(args.newPassword),
      actorId: found.user._id,
    });
    return "Password changed. You can sign in now.";
  },
});
