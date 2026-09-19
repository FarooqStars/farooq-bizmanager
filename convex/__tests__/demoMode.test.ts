/**
 * Public demo mode (DEMO_MODE=true): people cannot lock each other out, and
 * nothing of it is active on a normal installation.
 * Checked 19 Sep 2026: with the refuseInDemo() calls removed, the "refused"
 * tests fail.
 */
import { describe, it, expect, afterEach } from "vitest";
import { api, internal } from "../_generated/api";
import { createTestContext, seedUser, TEST_IDENTITY } from "./helpers.test.ts";

afterEach(() => {
  delete process.env.DEMO_MODE;
});

async function ownerAndStaff() {
  const t = createTestContext();
  await seedUser(t);
  const as = t.withIdentity(TEST_IDENTITY);
  const staffId = await as.mutation(api.users.createManualUser, { name: "Sara", role: "staff" });
  return { t, as, staffId };
}

describe("demo mode", () => {
  it("is off unless DEMO_MODE=true", async () => {
    const { t, as, staffId } = await ownerAndStaff();
    expect(await t.query(api.demo.status, {})).toEqual({ enabled: false });
    await as.mutation(api.users.updateUser, { userId: staffId, isActive: false });
    await as.mutation(api.users.deleteUser, { userId: staffId });
  });

  it("refuses switching people off, changing roles and removing people", async () => {
    const { t, as, staffId } = await ownerAndStaff();
    process.env.DEMO_MODE = "true";
    expect((await t.query(api.demo.status, {})).enabled).toBe(true);
    await expect(as.mutation(api.users.updateUser, { userId: staffId, isActive: false })).rejects.toThrow(/demo/);
    await expect(as.mutation(api.users.updateUser, { userId: staffId, role: "manager" })).rejects.toThrow(/demo/);
    await expect(as.mutation(api.users.deleteUser, { userId: staffId })).rejects.toThrow(/demo/);
    // Ordinary edits still work.
    await as.mutation(api.users.updateUser, { userId: staffId, jobTitle: "Cashier" });
  });

  it("the table wipe refuses to run outside demo mode", async () => {
    const { t } = await ownerAndStaff();
    await expect(t.mutation(internal.demo.clearTableBatch, { table: "users" })).rejects.toThrow(/only in demo mode/);
  });
});
