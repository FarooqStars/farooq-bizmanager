// Canonical import path for the logAudit helper.
// All financial mutations should import from here, not directly from convex/audit.ts,
// so that the import path is stable if the implementation ever moves.
//
// IMMUTABILITY CONTRACT
// activityLog rows must never be patched or deleted by application code.
// This is enforced by a source-level grep test in:
//   convex/__tests__/auditImmutability.test.ts
//
// KNOWN LIMITATION: Convex deployment key holders can bypass this at the
// database level (direct API calls, the Convex dashboard, or convex import).
// This is a platform-level constraint with no programmatic workaround.
// The test catches accidental bypasses in application code only.

export { logAudit } from "../audit.ts";
