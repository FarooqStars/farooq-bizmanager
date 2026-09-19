/**
 * Authorization hardening tests.
 *
 * Verifies the owner/manager gate and the deactivated-user gate added to the
 * sensitive mutations. Uses convex-test with fake identities, mirroring the
 * setup in scenario-basic.test.ts / helpers.test.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../_generated/api.js";
import { createTestContext, seedUser, TEST_IDENTITY, type TestContext } from "./helpers.test.ts";

// A non-owner staff member (role gate should reject).
const STAFF_IDENTITY = {
  tokenIdentifier: "https://farooq-bizmanager.local|test-staff-001",
  name: "Test Staff",
  email: "staff@test.com",
};

// A deactivated manager: the role gate would otherwise pass, so this proves the
// isActive === false gate rejects independently of role.
const DEACTIVATED_IDENTITY = {
  tokenIdentifier: "https://farooq-bizmanager.local|test-deactivated-001",
  name: "Test Deactivated Manager",
  email: "deactivated@test.com",
};

/** Invoke a call expected to fail and return its ConvexError `code`. */
async function forbiddenCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (err) {
    return (err as { data?: { code?: string } })?.data?.code;
  }
  throw new Error("Expected the mutation to throw, but it resolved");
}

describe("Authorization hardening: pricing.createPriceList gate", () => {
  let t: TestContext;

  beforeEach(() => {
    t = createTestContext();
  });

  it("allows an owner to create a price list", async () => {
    await seedUser(t); // owner, isActive: true, uses TEST_IDENTITY
    const asOwner = t.withIdentity(TEST_IDENTITY);

    const id = await asOwner.mutation(api.pricing.createPriceList, {
      name: "Owner Retail List",
      isDefault: false,
    });

    expect(id).toBeDefined();
    const created = await t.run(async (ctx) => await ctx.db.get(id));
    expect(created?.name).toBe("Owner Retail List");
  });

  it("rejects a staff user with FORBIDDEN", async () => {
    await seedUser(t); // owner exists as first user
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: STAFF_IDENTITY.tokenIdentifier,
        name: STAFF_IDENTITY.name,
        email: STAFF_IDENTITY.email,
        role: "staff",
        isActive: true,
      });
    });
    const asStaff = t.withIdentity(STAFF_IDENTITY);

    const code = await forbiddenCode(() =>
      asStaff.mutation(api.pricing.createPriceList, { name: "Staff List", isDefault: false }),
    );
    expect(code).toBe("FORBIDDEN");

    // The gate rejected before any write.
    const count = await t.run(async (ctx) => (await ctx.db.query("priceLists").collect()).length);
    expect(count).toBe(0);
  });

  it("rejects a deactivated user with FORBIDDEN despite a privileged role", async () => {
    await seedUser(t); // owner
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: DEACTIVATED_IDENTITY.tokenIdentifier,
        name: DEACTIVATED_IDENTITY.name,
        email: DEACTIVATED_IDENTITY.email,
        role: "manager", // role alone would pass the gate
        isActive: false,
      });
    });
    const asDeactivated = t.withIdentity(DEACTIVATED_IDENTITY);

    const code = await forbiddenCode(() =>
      asDeactivated.mutation(api.pricing.createPriceList, { name: "Ghost List", isDefault: false }),
    );
    expect(code).toBe("FORBIDDEN");
  });
});
