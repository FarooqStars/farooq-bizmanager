import { v } from "convex/values";
import { query } from "./_generated/server";

// Bounded scans keep this query under Convex's per-function read limit while
// still covering the whole (realistically sized) dataset for this business app.
const SCAN_LIMIT = 1000;
// Cap results per category so no single type floods the dropdown.
const PER_TYPE_LIMIT = 6;
const TOTAL_LIMIT = 40;

export type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
  score: number;
};

/**
 * Tokenize the query into lowercase words. Matching requires that EVERY token
 * appears somewhere in the record's haystack, so "john iphone" won't match but
 * "iph" and "john sm" work as expected. This makes multi-word search feel smart.
 */
function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Score a record against the tokens. Returns null if any token is missing.
 * Higher score = better match (exact/prefix/word-boundary hits rank above
 * mid-word substring hits), so the most relevant results surface first.
 */
function matchScore(tokens: string[], fields: Array<string | undefined | null>): number | null {
  const parts = fields.filter((f): f is string => !!f).map((f) => f.toLowerCase());
  const haystack = parts.join(" ");
  let score = 0;

  for (const token of tokens) {
    if (!haystack.includes(token)) return null;

    // Reward stronger matches.
    if (parts.some((p) => p === token)) {
      score += 100; // exact field match
    } else if (parts.some((p) => p.startsWith(token))) {
      score += 50; // field starts with token
    } else if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack)) {
      score += 25; // word-boundary match
    } else {
      score += 10; // substring match
    }
  }
  return score;
}

export const globalSearch = query({
  args: { q: v.string() },
  handler: async (ctx, args): Promise<SearchResult[]> => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return [];

      const tokens = tokenize(args.q);
      if (tokens.length === 0 || args.q.trim().length < 2) return [];

      const results: SearchResult[] = [];
      const push = (r: Omit<SearchResult, "score">, score: number) =>
        results.push({ ...r, score });

      // Run all table scans in parallel for speed.
      const [
        products, vendors, customers, vehicles, assets, users, warehouses,
        employees, orders, bills, expenses, projects, bankAccounts,
      ] = await Promise.all([
        ctx.db.query("products").take(SCAN_LIMIT),
        ctx.db.query("vendors").take(SCAN_LIMIT),
        ctx.db.query("customers").take(SCAN_LIMIT),
        ctx.db.query("vehicles").take(SCAN_LIMIT),
        ctx.db.query("assets").take(SCAN_LIMIT),
        ctx.db.query("users").take(SCAN_LIMIT),
        ctx.db.query("warehouses").take(SCAN_LIMIT),
        ctx.db.query("employees").take(SCAN_LIMIT),
        ctx.db.query("orders").take(SCAN_LIMIT),
        ctx.db.query("bills").take(SCAN_LIMIT),
        ctx.db.query("expenses").take(SCAN_LIMIT),
        ctx.db.query("projects").take(SCAN_LIMIT),
        ctx.db.query("bankAccounts").take(SCAN_LIMIT),
      ]);

      // ── Products & Services ──
      for (const p of products) {
        const s = matchScore(tokens, [p.name, p.sku, p.barcode, p.description]);
        if (s !== null) {
          push({
            type: "Product",
            id: p._id,
            title: p.name,
            subtitle: p.sku ? `SKU: ${p.sku}` : (p.type === "service" ? "Service" : "Product"),
            route: `/products?focus=${p._id}`,
          }, s + (p.isActive ? 5 : 0));
        }
      }

      // ── Vendors ──
      for (const vn of vendors) {
        const s = matchScore(tokens, [vn.name, vn.companyName, vn.contactName, vn.email, vn.phone]);
        if (s !== null) {
          push({
            type: "Vendor",
            id: vn._id,
            title: vn.name,
            subtitle: vn.contactName ?? vn.email ?? vn.phone ?? "Vendor",
            route: `/vendors?tab=vendors&focus=${vn._id}`,
          }, s + (vn.isActive ? 5 : 0));
        }
      }

      // ── Customers ──
      for (const c of customers) {
        const s = matchScore(tokens, [c.name, c.companyName, c.email, c.phone, c.mobile]);
        if (s !== null) {
          push({
            type: "Customer",
            id: c._id,
            title: c.name,
            subtitle: c.email ?? c.phone ?? c.companyName ?? "Customer",
            route: `/sales?tab=customers&focus=${c._id}`,
          }, s);
        }
      }

      // ── Vehicles ──
      for (const vh of vehicles) {
        const s = matchScore(tokens, [vh.make, vh.model, vh.plate, vh.vin, vh.color]);
        if (s !== null) {
          push({
            type: "Vehicle",
            id: vh._id,
            title: `${vh.year} ${vh.make} ${vh.model}`,
            subtitle: `Plate: ${vh.plate}`,
            route: `/vehicles?focus=${vh._id}`,
          }, s);
        }
      }

      // ── Assets ──
      for (const a of assets) {
        const s = matchScore(tokens, [a.name, a.serialNumber, a.notes]);
        if (s !== null) {
          push({
            type: "Asset",
            id: a._id,
            title: a.name,
            subtitle: a.serialNumber ? `S/N: ${a.serialNumber}` : a.status,
            route: `/assets?focus=${a._id}`,
          }, s);
        }
      }

      // ── Team Members (users) ──
      for (const u of users) {
        const s = matchScore(tokens, [u.name, u.email, u.jobTitle, u.department]);
        if (s !== null) {
          push({
            type: "Team Member",
            id: u._id,
            title: u.name ?? u.email ?? "User",
            subtitle: u.jobTitle ?? u.email ?? u.role,
            route: `/users?focus=${u._id}`,
          }, s);
        }
      }

      // ── Warehouses ──
      for (const w of warehouses) {
        const s = matchScore(tokens, [w.name, w.address, w.notes]);
        if (s !== null) {
          push({
            type: "Warehouse",
            id: w._id,
            title: w.name,
            subtitle: w.address ?? "Warehouse",
            route: `/warehouses?focus=${w._id}`,
          }, s + (w.isActive ? 5 : 0));
        }
      }

      // ── Employees ──
      for (const e of employees) {
        const s = matchScore(tokens, [e.name, e.email, e.employeeId, e.position, e.department]);
        if (s !== null) {
          push({
            type: "Employee",
            id: e._id,
            title: e.name,
            subtitle: e.position ?? e.employeeId ?? "Employee",
            route: `/payroll?focus=${e._id}`,
          }, s + (e.isActive ? 5 : 0));
        }
      }

      // ── Orders ──
      for (const o of orders) {
        const s = matchScore(tokens, [o.orderNumber, o.customerName, o.customerEmail]);
        if (s !== null) {
          push({
            type: "Order",
            id: o._id,
            title: `Order ${o.orderNumber}`,
            subtitle: `${o.customerName} · ${o.status}`,
            route: `/orders?focus=${o._id}`,
          }, s);
        }
      }

      // ── Bills ──
      for (const b of bills) {
        const s = matchScore(tokens, [b.title, b.notes]);
        if (s !== null) {
          push({
            type: "Bill",
            id: b._id,
            title: b.title,
            subtitle: `Due ${new Date(b.dueDate).toLocaleDateString()} · ${b.status}`,
            route: `/vendors?tab=bills&focus=${b._id}`,
          }, s);
        }
      }

      // ── Expenses ──
      for (const ex of expenses) {
        const s = matchScore(tokens, [ex.title, ex.notes]);
        if (s !== null) {
          push({
            type: "Expense",
            id: ex._id,
            title: ex.title,
            subtitle: `${new Date(ex.date).toLocaleDateString()}`,
            route: `/vendors?tab=expenses&focus=${ex._id}`,
          }, s);
        }
      }

      // ── Projects ──
      for (const pr of projects) {
        const s = matchScore(tokens, [pr.name, pr.code, pr.description]);
        if (s !== null) {
          push({
            type: "Project",
            id: pr._id,
            title: pr.name,
            subtitle: pr.code ? `${pr.code} · ${pr.status}` : pr.status,
            route: `/projects?focus=${pr._id}`,
          }, s);
        }
      }

      // ── Bank Accounts ──
      for (const ba of bankAccounts) {
        const s = matchScore(tokens, [ba.name, ba.bankName, ba.accountNumber]);
        if (s !== null) {
          push({
            type: "Bank Account",
            id: ba._id,
            title: ba.name,
            subtitle: ba.bankName ?? "Bank Account",
            route: `/banking?focus=${ba._id}`,
          }, s);
        }
      }

      // Sort by score (desc), then cap per type and overall.
      results.sort((a, b) => b.score - a.score);

      const perType: Record<string, number> = {};
      const capped: SearchResult[] = [];
      for (const r of results) {
        const count = perType[r.type] ?? 0;
        if (count >= PER_TYPE_LIMIT) continue;
        perType[r.type] = count + 1;
        capped.push(r);
        if (capped.length >= TOTAL_LIMIT) break;
      }

      return capped;
    } catch {
      // Degrade to no results instead of throwing on a transient failure.
      return [];
    }
  },
});
