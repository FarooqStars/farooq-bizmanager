// ─────────────────────────────────────────────────────────────────────────────
// Built-in sign-in — shared constants.
//
// Farooq BizManager signs its own tokens (RS256). The token's `sub` is the
// users-table id, so Convex gives every signed-in person the stable
// tokenIdentifier  "<ISSUER>|<users._id>".  All existing code looks users up
// by that value through the `by_token` index, so nothing else had to change.
//
// ISSUER is a fixed name (never looked up), not this server's address, on purpose: moving the app to another
// server or domain must never change anyone's tokenIdentifier.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTH_ISSUER = "https://farooq-bizmanager.local";
export const AUTH_AUDIENCE = "farooq-bizmanager";

export const ACCESS_TOKEN_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_DAYS = 30;
export const MAX_FAILED_ATTEMPTS = 10;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;

export function tokenIdentifierFor(userId: string): string {
  return `${AUTH_ISSUER}|${userId}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
