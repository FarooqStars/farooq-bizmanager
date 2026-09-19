import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

// ── Shared validators ───────────────────────────────────────────────────────

const dataSourceValidator = v.union(
  v.literal("sales"),
  v.literal("purchases"),
  v.literal("inventory"),
  v.literal("customers"),
  v.literal("vendors"),
  v.literal("expenses"),
  v.literal("invoices"),
  v.literal("employees"),
  v.literal("journal")
);

const operatorValidator = v.union(
  v.literal("equals"),
  v.literal("not_equals"),
  v.literal("contains"),
  v.literal("greater_than"),
  v.literal("less_than"),
  v.literal("between"),
  v.literal("is_empty"),
  v.literal("is_not_empty")
);

const filterValidator = v.object({
  field: v.string(),
  operator: operatorValidator,
  value: v.string(),
  value2: v.optional(v.string()),
});

const sortOrderValidator = v.union(v.literal("asc"), v.literal("desc"));

// ── Types ────────────────────────────────────────────────────────────────────

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "between"
  | "is_empty"
  | "is_not_empty";
type Filter = { field: string; operator: Operator; value: string; value2?: string };

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) {
    throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  }
  return user;
}

// ── Row builders per data source ─────────────────────────────────────────────

async function buildRows(ctx: QueryCtx, dataSource: string): Promise<Row[]> {
  switch (dataSource) {
    case "sales": {
      const [sales, customers, payments] = await Promise.all([
        ctx.db.query("sales").collect(),
        ctx.db.query("customers").collect(),
        ctx.db.query("payments").collect(),
      ]);
      const customerMap = new Map(customers.map((c) => [c._id, c.name]));
      const paymentBySale = new Map<string, string>();
      for (const p of payments) {
        if (p.saleId && !paymentBySale.has(p.saleId)) paymentBySale.set(p.saleId, p.method);
      }
      return sales.map((s) => ({
        date: s.date,
        customerName: s.customerName ?? (s.customerId ? customerMap.get(s.customerId) ?? "" : ""),
        totalAmount: s.totalAmount,
        status: s.status,
        paymentMethod: paymentBySale.get(s._id) ?? "",
        discount: "",
        notes: s.notes ?? "",
      }));
    }

    case "purchases": {
      const [bills, vendors] = await Promise.all([
        ctx.db.query("bills").collect(),
        ctx.db.query("vendors").collect(),
      ]);
      const vendorMap = new Map(vendors.map((vend) => [vend._id, vend.name]));
      return bills.map((b) => ({
        title: b.title,
        vendorId: vendorMap.get(b.vendorId) ?? "",
        amount: b.amount,
        dueDate: b.dueDate,
        status: b.status,
        notes: b.notes ?? "",
      }));
    }

    case "inventory": {
      const [products, categories] = await Promise.all([
        ctx.db.query("products").collect(),
        ctx.db.query("categories").collect(),
      ]);
      const categoryMap = new Map(categories.map((c) => [c._id, c.name]));
      return products.map((p) => ({
        name: p.name,
        sku: p.sku ?? "",
        unitPrice: p.unitPrice,
        category: p.categoryId ? categoryMap.get(p.categoryId) ?? "" : "",
        lowStockThreshold: p.lowStockThreshold ?? "",
        isActive: p.isActive,
      }));
    }

    case "customers": {
      const sales = await ctx.db.query("sales").collect();
      const names = new Set<string>();
      for (const s of sales) {
        if (s.customerName) names.add(s.customerName);
      }
      return Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name }));
    }

    case "vendors": {
      const vendors = await ctx.db.query("vendors").collect();
      return vendors.map((vend) => ({
        name: vend.name,
        contactName: vend.contactName ?? "",
        email: vend.email ?? "",
        phone: vend.phone ?? "",
        address: vend.address ?? "",
        isActive: vend.isActive,
      }));
    }

    case "expenses": {
      const expenses = await ctx.db.query("expenses").collect();
      return expenses.map((e) => ({
        title: e.title,
        amount: e.amount,
        date: e.date,
        notes: e.notes ?? "",
      }));
    }

    case "invoices": {
      const [invoices, customers] = await Promise.all([
        ctx.db.query("invoices").collect(),
        ctx.db.query("customers").collect(),
      ]);
      const customerMap = new Map(customers.map((c) => [c._id, c.name]));
      return invoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        customerName: customerMap.get(i.customerId) ?? "",
        totalAmount: i.totalAmount,
        status: i.status,
        dueDate: i.dueDate,
        issueDate: i.date,
      }));
    }

    case "employees": {
      const employees = await ctx.db.query("employees").collect();
      return employees.map((e) => {
        const parts = e.name.trim().split(/\s+/);
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ");
        return {
          firstName,
          lastName,
          email: e.email ?? "",
          position: e.position ?? "",
          department: e.department ?? "",
          salary: e.baseSalary,
          startDate: e.hireDate,
          status: e.isActive ? "active" : "inactive",
        };
      });
    }

    case "journal": {
      const [entries, lines, accounts] = await Promise.all([
        ctx.db.query("journalEntries").collect(),
        ctx.db.query("journalLines").collect(),
        ctx.db.query("accounts").collect(),
      ]);
      const accountMap = new Map(accounts.map((a) => [a._id, a.name]));
      const linesByEntry = new Map<string, typeof lines>();
      for (const line of lines) {
        const arr = linesByEntry.get(line.journalEntryId) ?? [];
        arr.push(line);
        linesByEntry.set(line.journalEntryId, arr);
      }
      return entries.map((entry) => {
        const entryLines = linesByEntry.get(entry._id) ?? [];
        const debitLine = entryLines.find((l) => l.debit > 0);
        const creditLine = entryLines.find((l) => l.credit > 0);
        return {
          date: entry.date,
          description: entry.description,
          debitAccount: debitLine ? accountMap.get(debitLine.accountId) ?? "" : "",
          creditAccount: creditLine ? accountMap.get(creditLine.accountId) ?? "" : "",
          amount: entry.totalDebit,
          reference: entry.reference ?? "",
        };
      });
    }

    default:
      return [];
  }
}

// ── Filtering & sorting ──────────────────────────────────────────────────────

function matchesFilter(row: Row, f: Filter): boolean {
  const raw = row[f.field];
  const isEmpty = raw === null || raw === undefined || raw === "";

  if (f.operator === "is_empty") return isEmpty;
  if (f.operator === "is_not_empty") return !isEmpty;

  const str = raw === null || raw === undefined ? "" : String(raw);
  const fVal = f.value ?? "";
  const fNum = Number(fVal);
  const numericCompare = typeof raw === "number" && fVal.trim() !== "" && !Number.isNaN(fNum);
  const num = typeof raw === "number" ? raw : Number(str);

  switch (f.operator) {
    case "equals":
      return numericCompare ? num === fNum : str.toLowerCase() === fVal.toLowerCase();
    case "not_equals":
      return numericCompare ? num !== fNum : str.toLowerCase() !== fVal.toLowerCase();
    case "contains":
      return str.toLowerCase().includes(fVal.toLowerCase());
    case "greater_than":
      return numericCompare ? num > fNum : str > fVal;
    case "less_than":
      return numericCompare ? num < fNum : str < fVal;
    case "between": {
      const v2 = f.value2 ?? "";
      if (typeof raw === "number") {
        return num >= fNum && num <= Number(v2);
      }
      return str >= fVal && str <= v2;
    }
    default:
      return true;
  }
}

const MAX_ROWS = 1000;

export const runReport = query({
  args: {
    dataSource: dataSourceValidator,
    filters: v.array(filterValidator),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(sortOrderValidator),
  },
  handler: async (ctx, args): Promise<{ rows: Row[]; totalCount: number }> => {
    await requireUser(ctx);

    let rows = await buildRows(ctx, args.dataSource);

    // Apply filters (all must match)
    if (args.filters.length > 0) {
      rows = rows.filter((row) => args.filters.every((f) => matchesFilter(row, f as Filter)));
    }

    // Sort
    if (args.sortBy) {
      const key = args.sortBy;
      const dir = args.sortOrder === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") {
          cmp = av - bv;
        } else {
          cmp = String(av ?? "").localeCompare(String(bv ?? ""));
        }
        return cmp * dir;
      });
    }

    const totalCount = rows.length;
    return { rows: rows.slice(0, MAX_ROWS), totalCount };
  },
});

// ── Saved reports CRUD ───────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db.query("savedReports").order("desc").collect();
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    dataSource: dataSourceValidator,
    columns: v.array(v.string()),
    filters: v.array(filterValidator),
    groupBy: v.optional(v.string()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(sortOrderValidator),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("savedReports", {
      name: args.name,
      description: args.description,
      dataSource: args.dataSource,
      columns: args.columns,
      filters: args.filters,
      groupBy: args.groupBy,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
      isPublic: args.isPublic ?? true,
      createdBy: user._id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("savedReports") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Report not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.id);
    return null;
  },
});
