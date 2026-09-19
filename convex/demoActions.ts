"use node";

// ─────────────────────────────────────────────────────────────────────────────
// Public demo — nightly reset.
//
// Wipes every table and builds the demo company again through the app's OWN
// public functions (signed in as the demo owner), so the demo data is made by
// exactly the same rules as real data: every invoice, bill, payment and stock
// change posts to the ledger the normal way.
//
// Runs only when DEMO_MODE=true. Scheduled nightly in convex/crons.ts; after
// the first deployment run it once by hand: Convex dashboard → Functions →
// demoActions:reset → Run.
//
// Dates are relative to the day of the reset (the last seven months), so the
// demo always looks current.
// ─────────────────────────────────────────────────────────────────────────────
import { ConvexHttpClient } from "convex/browser";
import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.d.ts";
import { demoTables } from "./demo.ts";
import { isDemoMode, DEMO_EMAIL, DEMO_PASSWORD, DEMO_OWNER_NAME, DEMO_COMPANY } from "./lib/demo.ts";

function iso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** "YYYY-MM" for the current month and the six before it, oldest first. */
function lastSevenMonths(today: Date): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export const reset = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (!isDemoMode()) return "Not in demo mode (DEMO_MODE is not true) — nothing done.";

    // ── 1. Wipe ────────────────────────────────────────────────
    for (const table of demoTables()) {
      while ((await ctx.runMutation(internal.demo.clearTableBatch, { table })) > 0) {
        // keep deleting until the table is empty
      }
    }
    while ((await ctx.runMutation(internal.demo.clearStorageBatch, {})) > 0) {
      // keep deleting uploaded files
    }

    // ── 2. Owner ───────────────────────────────────────────────
    const tokens = await ctx.runAction(api.authActions.setupOwner, {
      name: DEMO_OWNER_NAME,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      companyName: DEMO_COMPANY,
    });
    const url = process.env.CONVEX_CLOUD_URL;
    if (!url) throw new Error("CONVEX_CLOUD_URL is not available");
    const c = new ConvexHttpClient(url);
    c.setAuth(tokens.token);

    const problems: string[] = [];
    const tryit = async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        const msg = (err as { data?: { message?: string } })?.data?.message ?? (err as Error).message;
        problems.push(`${label}: ${String(msg).slice(0, 120)}`);
        return null;
      }
    };

    // ── 3. Company and ready-made lists ────────────────────────
    const today = new Date();
    const todayIso = iso(today);
    const months = lastSevenMonths(today);
    const startDate = `${months[0]}-01`;
    const clamp = (d: string) => (d > todayIso ? todayIso : d);

    await tryit("profile", () =>
      c.mutation(api.companyProfile.save, {
        nameEn: DEMO_COMPANY,
        nameAr: "شركة النور للتجارة ذ.م.م",
        nameUr: "النور ٹریڈنگ",
        address: "Building 12, Street 340, Al Sadd, Doha",
        phone: "+974 4000 0000",
        email: "info@alnoor-demo.test",
        crNumber: "CR-000000",
        defaultCurrency: "QAR",
        defaultCountry: "QA",
        fiscalYearStartMonth: 1,
      }),
    );
    await tryit("accounts", () => c.mutation(api.accounting.seedDefaultAccounts, {}));
    await tryit("currencies", () => c.mutation(api.banking.seedDefaultCurrencies, {}));
    await tryit("payment methods", () => c.mutation(api.payments.seedPaymentMethods, {}));
    await tryit("tax", () => c.mutation(api.tax.seedDefaultRates, { country: "QA" }));
    await tryit("roles", () => c.mutation(api.security.seedSystemRoles, {}));
    await tryit("alerts", () => c.mutation(api.alerts.seedDefaultAlertSettings, {}));

    const accounts = await c.query(api.accounting.listAccounts, {});
    const cash = accounts.find((a) => /cash/i.test(a.name) && a.type === "bank");
    if (!cash) return `Reset stopped: no cash account. ${problems.join(" | ")}`;

    // ── 4. Stock ───────────────────────────────────────────────
    const wh = await tryit("warehouse", () =>
      c.mutation(api.products.createWarehouse, {
        name: "Main Warehouse — Industrial Area",
        address: "Street 24, Industrial Area, Doha",
      }),
    );
    await tryit("showroom", () => c.mutation(api.products.createWarehouse, { name: "Showroom — Al Sadd" }));
    const furniture = await tryit("cat", () =>
      c.mutation(api.products.createCategory, { name: "Office Furniture", type: "product", color: "#065f46" }),
    );
    const it = await tryit("cat", () =>
      c.mutation(api.products.createCategory, { name: "IT Equipment", type: "product", color: "#b8860b" }),
    );
    const services = await tryit("cat", () =>
      c.mutation(api.products.createCategory, { name: "Services", type: "service", color: "#2563eb" }),
    );

    const productSpecs: Array<[string, string, Id<"categories"> | null, number, number, number]> = [
      ["Executive Office Chair", "CH-100", furniture, 650, 380, 40],
      ["Standing Desk 160cm", "DK-160", furniture, 1850, 1150, 40],
      ["Meeting Table 8-seat", "MT-800", furniture, 4200, 2700, 30],
      ['Laptop 14" Business', "LP-014", it, 3900, 3150, 25],
      ['27" Monitor', "MN-027", it, 1150, 820, 32],
      ["Wireless Keyboard & Mouse", "KB-200", it, 180, 95, 120],
      ["Network Printer A4", "PR-400", it, 2400, 1700, 25],
      ["Filing Cabinet 4-drawer", "FC-400", furniture, 980, 600, 30],
    ];
    const products: Array<{ id: Id<"products">; name: string; price: number }> = [];
    for (const [name, sku, cat, price, cost, stock] of productSpecs) {
      const id = await tryit(`product ${name}`, () =>
        c.mutation(api.products.createProduct, {
          name,
          sku,
          categoryId: cat ?? undefined,
          type: "product",
          unitPrice: price,
          costPrice: cost,
          unit: "pcs",
          lowStockThreshold: 8,
          openingStock: stock,
          openingStockValue: stock * cost,
          openingStockDate: startDate,
          openingStockWarehouseId: wh ?? undefined,
        }),
      );
      if (id) products.push({ id, name, price });
    }
    await tryit("service", () =>
      c.mutation(api.products.createProduct, {
        name: "Installation & Setup",
        sku: "SV-INST",
        categoryId: services ?? undefined,
        type: "service",
        unitPrice: 350,
      }),
    );
    if (products.length < 6) return `Reset stopped: products missing. ${problems.join(" | ")}`;

    // ── 5. Customers and vendors ───────────────────────────────
    await tryit("customer with opening balance", () =>
      c.mutation(api.sales.createCustomer, {
        name: "Al Wakra Motors",
        companyName: "Al Wakra Motors",
        email: "accounts@alwakra.test",
        city: "Al Wakra",
        country: "QA",
        paymentTerms: "net_30",
        creditLimit: 50000,
        openingBalance: 8500,
        openingBalanceDate: startDate,
      }),
    );
    const customerSpecs: Array<[string, string, string, string, string]> = [
      ["Gulf Horizon Contracting", "info@gulfhorizon.test", "+974 5500 1001", "Doha", "QA"],
      ["Pearl Bay Hospitality", "accounts@pearlbay.test", "+974 5500 1002", "Lusail", "QA"],
      ["Karachi Textile Mills", "finance@ktm.test", "+92 300 0000001", "Karachi", "PK"],
      ["Desert Rose Clinics", "admin@desertrose.test", "+971 50 000 0003", "Dubai", "AE"],
      ["Maple Leaf Consulting", "ap@mapleleaf.test", "+1 416 000 0004", "Toronto", "CA"],
      ["Riyadh Logistics Co.", "ops@riyadhlog.test", "+966 50 000 0005", "Riyadh", "SA"],
    ];
    const customers: Id<"customers">[] = [];
    for (const [name, email, phone, city, country] of customerSpecs) {
      const id = await tryit("customer", () =>
        c.mutation(api.sales.createCustomer, {
          name,
          companyName: name,
          email,
          phone,
          city,
          country,
          paymentTerms: "net_30",
          creditLimit: 50000,
        }),
      );
      if (id) customers.push(id);
    }

    await tryit("vendor with opening balance", () =>
      c.mutation(api.vendors.createVendor, {
        name: "Qatar Paper Co.",
        companyName: "Qatar Paper Co.",
        email: "sales@qpaper.test",
        city: "Doha",
        country: "QA",
        paymentTerms: "net_30",
        openingBalance: 4200,
        openingBalanceDate: startDate,
      }),
    );
    const vendorSpecs: Array<[string, string, string, string]> = [
      ["Doha Office Supplies", "sales@dohaoffice.test", "Doha", "QA"],
      ["TechSource Trading", "orders@techsource.test", "Dubai", "AE"],
      ["Lahore Woodworks", "export@lahorewood.test", "Lahore", "PK"],
    ];
    const vendors: Id<"vendors">[] = [];
    for (const [name, email, city, country] of vendorSpecs) {
      const id = await tryit("vendor", () =>
        c.mutation(api.vendors.createVendor, { name, companyName: name, email, city, country, paymentTerms: "net_30" }),
      );
      if (id) vendors.push(id);
    }
    if (customers.length === 0 || vendors.length === 0) {
      return `Reset stopped: customers/vendors missing. ${problems.join(" | ")}`;
    }

    // ── 6. Seven months of trading ─────────────────────────────
    let n = 0;
    for (const [mi, m] of months.entries()) {
      for (let k = 0; k < 3 + (mi % 3); k++) {
        const customerId = customers[n % customers.length];
        const p1 = products[n % products.length];
        const p2 = products[(n * 3 + 1) % products.length];
        const date = clamp(`${m}-${String(3 + ((n * 5) % 24)).padStart(2, "0")}`);
        const dueDate = `${m}-28` < date ? date : `${m}-28`;
        const credit = n % 3 !== 0;
        const invoiceId = await tryit("invoice", () =>
          c.mutation(api.invoicing.createInvoice, {
            customerId,
            date,
            dueDate,
            saleType: credit ? "credit" : "cash",
            creditTerms: credit ? "net_30" : undefined,
            items: [
              { productId: p1.id, description: p1.name, quantity: 1 + (n % 4), unitPrice: p1.price },
              { productId: p2.id, description: p2.name, quantity: 1 + (n % 2), unitPrice: p2.price },
            ],
            currency: "QAR",
            accountId: credit ? undefined : cash._id,
          }),
        );
        if (invoiceId) {
          await tryit("send", () => c.mutation(api.invoicing.updateInvoiceStatus, { id: invoiceId, status: "sent" }));
          if (credit && mi < 5) {
            const inv = await c.query(api.invoicing.getInvoice, { id: invoiceId }).catch(() => null);
            const amount = (inv as { totalAmount?: number } | null)?.totalAmount;
            if (amount) {
              await tryit("payment", () =>
                c.mutation(api.invoicing.recordPayment, {
                  invoiceId,
                  date: clamp(`${m}-27`),
                  amount,
                  method: "bank_transfer",
                  accountId: cash._id,
                }),
              );
            }
          }
        }
        n++;
      }
      await tryit("cash sale", () =>
        c.mutation(api.sales.createSale, {
          customerName: "Walk-in",
          date: clamp(`${m}-15`),
          accountId: cash._id,
          items: [
            { productId: products[5].id, productName: products[5].name, quantity: 3, unitPrice: products[5].price },
            { productId: products[4].id, productName: products[4].name, quantity: 1, unitPrice: products[4].price },
          ],
        }),
      );
      const billDate = clamp(`${m}-05`);
      await tryit("bill", () =>
        c.mutation(api.vendors.createBill, {
          vendorId: vendors[mi % vendors.length],
          title: `Stock purchase ${m}`,
          amount: 6000 + mi * 900,
          billDate,
          dueDate: `${m}-25` < billDate ? billDate : `${m}-25`,
        }),
      );
    }

    if (wh) {
      await tryit("stock count", () =>
        c.mutation(api.products.setInventoryLevel, { productId: products[5].id, warehouseId: wh, quantity: 100 }),
      );
    }
    await tryit("team member", () =>
      c.mutation(api.users.createManualUser, {
        name: "Omar Accountant",
        email: "omar@demo.test",
        role: "manager",
        department: "Finance",
        jobTitle: "Accountant",
      }),
    );

    return problems.length === 0
      ? `Demo rebuilt: ${n} invoices, 7 months, owner ${DEMO_EMAIL}.`
      : `Demo rebuilt with ${problems.length} problem(s): ${problems.join(" | ")}`;
  },
});
