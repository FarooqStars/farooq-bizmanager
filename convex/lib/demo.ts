// ─────────────────────────────────────────────────────────────────────────────
// Public demo mode.
//
// Switched on ONLY by setting the environment variable DEMO_MODE=true on a
// Convex deployment (Convex dashboard → Settings → Environment Variables).
// A normal installation never has it, so none of this affects real books.
//
// In demo mode:
//   • the sign-in screen offers "Try the demo" with the credentials below,
//   • every screen shows a "this is a demo" bar,
//   • nobody can change passwords, deactivate/remove people or change roles
//     (so one visitor cannot lock everyone else out),
//   • every night all data is wiped and the demo company is rebuilt
//     (convex/demoActions.ts, scheduled in convex/crons.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { ConvexError } from "convex/values";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo12345";
export const DEMO_OWNER_NAME = "Demo Owner";
export const DEMO_COMPANY = "Al Noor Trading W.L.L.";

export function isDemoMode(): boolean {
  return (process.env.DEMO_MODE ?? "").toLowerCase() === "true";
}

export function refuseInDemo(what: string): void {
  if (isDemoMode()) {
    throw new ConvexError({
      message: `${what} is switched off in the public demo.`,
      code: "FORBIDDEN",
    });
  }
}
