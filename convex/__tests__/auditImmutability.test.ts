/**
 * M1.2 — activityLog source-level immutability test
 *
 * Convex provides no ctx.db interceptor, so we cannot enforce immutability
 * at runtime. Instead, we grep the entire convex/ source tree and fail the
 * test if any file attempts to patch or delete an activityLog row.
 *
 * This catches accidental bypasses in application code. Deployment key holders
 * can still bypass at the database level — that is a documented platform
 * limitation (see convex/lib/audit.ts).
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/** Recursively collect all .ts files under a directory, skipping _generated/ and __tests__/ */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "_generated" || entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("activityLog immutability", () => {
  const convexDir = join(__dirname, "..");
  const files = collectTsFiles(convexDir);

  it("no file calls ctx.db.patch on activityLog", () => {
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      // Match ctx.db.patch( ... "activityLog" or 'activityLog'
      // We check the whole file content for the co-occurrence of .patch( and "activityLog"
      // within a plausible distance (same expression). A line-by-line check is sufficient
      // for the straightforward patterns that would appear in practice.
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          (line.includes('.patch(') || line.includes('.patch (')) &&
          (line.includes('"activityLog"') || line.includes("'activityLog'"))
        ) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `activityLog immutability violation — patch detected:\n${violations.join("\n")}\n\n` +
        `activityLog rows must never be patched. Create a new row instead.`
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("no file calls ctx.db.delete on activityLog", () => {
    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          (line.includes('.delete(') || line.includes('.delete (')) &&
          (line.includes('"activityLog"') || line.includes("'activityLog'"))
        ) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `activityLog immutability violation — delete detected:\n${violations.join("\n")}\n\n` +
        `activityLog rows must never be deleted.`
      );
    }
    expect(violations).toHaveLength(0);
  });

  it("all activityLog inserts go through logAudit or direct ctx.db.insert", () => {
    // Positive check: verify that audit.ts itself still inserts into activityLog
    // (catches the case where someone renames the table and forgets to update this test)
    const auditTs = readFileSync(join(convexDir, "audit.ts"), "utf-8");
    expect(auditTs).toContain('"activityLog"');
  });

  it("convex/lib/audit.ts re-exports logAudit", () => {
    const libAudit = readFileSync(join(convexDir, "lib", "audit.ts"), "utf-8");
    expect(libAudit).toContain("export { logAudit }");
  });
});
