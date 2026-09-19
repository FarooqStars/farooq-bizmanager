import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";
import { postBalancedEntry, findOrCreateAccount, round2 } from "./lib/ledger.ts";
import { SALARY_ADVANCE_SOURCE, SALARY_ADVANCE_DEDUCTION_SOURCE } from "./lib/sourceTypes.ts";
import { enforcePostingDate } from "./closingDate.ts";

async function getUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listSalaryAdvances = query({
  args: {
    employeeId: v.optional(v.id("employees")),
    status: v.optional(v.union(v.literal("active"), v.literal("fully_repaid"), v.literal("cancelled"))),
  },
  handler: async (ctx, args) => {
    await getUser(ctx);
    let records = args.employeeId
      ? await ctx.db.query("salaryAdvances").withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId!)).collect()
      : await ctx.db.query("salaryAdvances").collect();
    if (args.status) records = records.filter((r) => r.status === args.status);
    return Promise.all(
      records.map(async (a) => {
        const employee = await ctx.db.get(a.employeeId);
        return { ...a, employeeName: employee?.name ?? "Unknown" };
      })
    );
  },
});

export const getSalaryAdvanceSummary = query({
  args: {},
  handler: async (ctx) => {
    await getUser(ctx);
    const advances = await ctx.db.query("salaryAdvances").collect();
    const active = advances.filter((a) => a.status === "active");
    return {
      totalActive: active.length,
      totalOutstanding: active.reduce((s, a) => s + a.outstandingBalance, 0),
      totalIssued: advances.reduce((s, a) => s + a.amount, 0),
      totalRepaid: advances.reduce((s, a) => s + a.amountRepaid, 0),
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createSalaryAdvance = mutation({
  args: {
    employeeId: v.id("employees"),
    amount: v.number(),
    date: v.string(),
    repaymentMonths: v.number(),
    bankAccountId: v.optional(v.id("accounts")),
    reason: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"salaryAdvances">> => {
    const user = await getUser(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });

    if (args.amount <= 0) throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    if (args.repaymentMonths <= 0) throw new ConvexError({ message: "Repayment months must be at least 1", code: "BAD_REQUEST" });

    await enforcePostingDate(ctx, args.date);

    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new ConvexError({ message: "Employee not found", code: "NOT_FOUND" });

    const monthlyDeduction = round2(args.amount / args.repaymentMonths);

    // Generate advance number
    const all = await ctx.db.query("salaryAdvances").collect();
    const advanceNumber = `SA-${String(all.length + 1).padStart(4, "0")}`;

    const advanceId = await ctx.db.insert("salaryAdvances", {
      advanceNumber,
      employeeId: args.employeeId,
      amount: args.amount,
      date: args.date,
      reason: args.reason,
      bankAccountId: args.bankAccountId,
      repaymentMonths: args.repaymentMonths,
      monthlyDeduction,
      amountRepaid: 0,
      outstandingBalance: args.amount,
      status: "active",
      notes: args.notes,
      createdBy: user._id,
    });

    // ── GL: Dr Employee Advances (asset) / Cr Bank ────────────────────────────
    const advanceAsset = await findOrCreateAccount(ctx, {
      type: "other_current_asset",
      code: "1250",
      name: "Employee Advances",
      subType: "Staff Advances",
      matchSubType: "Staff Advances",
    });

    let bankAccId: Id<"accounts">;
    if (args.bankAccountId) {
      bankAccId = args.bankAccountId;
    } else {
      const defaultBank = await findOrCreateAccount(ctx, {
        type: "bank",
        code: "1000",
        name: "Bank Account",
        subType: "Checking",
        matchAnyOfType: true,
      });
      bankAccId = defaultBank._id;
    }

    await postBalancedEntry(ctx, {
      date: args.date,
      description: `Salary advance – ${employee.name} (${advanceNumber})`,
      createdBy: user._id,
      sourceType: SALARY_ADVANCE_SOURCE,
      sourceId: advanceId,
      lines: [
        { accountId: advanceAsset._id, debit: round2(args.amount), description: employee.name },
        { accountId: bankAccId, credit: round2(args.amount), description: employee.name },
      ],
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "salaryAdvances:createSalaryAdvance",
      resourceType: "salary_advance",
      resourceId: advanceId,
      action: "salary_advance_created",
      afterValue: JSON.stringify({ advanceNumber, employeeId: args.employeeId, amount: args.amount }),
      details: `Salary advance ${advanceNumber} issued to ${employee.name}`,
    });

    return advanceId;
  },
});

export const recordAdvanceDeduction = mutation({
  args: {
    advanceId: v.id("salaryAdvances"),
    amount: v.number(),
    date: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    await enforcePostingDate(ctx, args.date);
    const advance = await ctx.db.get(args.advanceId);
    if (!advance) throw new ConvexError({ message: "Advance not found", code: "NOT_FOUND" });
    if (advance.status !== "active") throw new ConvexError({ message: "Advance is not active", code: "BAD_REQUEST" });

    const employee = await ctx.db.get(advance.employeeId);
    const deduction = round2(Math.min(args.amount, advance.outstandingBalance));
    const newRepaid = round2(advance.amountRepaid + deduction);
    const newBalance = round2(advance.outstandingBalance - deduction);
    const fullyRepaid = newBalance <= 0;

    await ctx.db.patch(args.advanceId, {
      amountRepaid: newRepaid,
      outstandingBalance: Math.max(0, newBalance),
      status: fullyRepaid ? "fully_repaid" : "active",
    });

    // ── GL: Dr Salaries Payable / Cr Employee Advances ────────────────────────
    const advanceAsset = await findOrCreateAccount(ctx, {
      type: "other_current_asset",
      code: "1250",
      name: "Employee Advances",
      subType: "Staff Advances",
      matchSubType: "Staff Advances",
    });
    const salariesPayable = await findOrCreateAccount(ctx, {
      type: "other_current_liability",
      code: "2200",
      name: "Salaries Payable",
      subType: "Payroll Liabilities",
      matchSubType: "Payroll Liabilities",
    });

    await postBalancedEntry(ctx, {
      date: args.date,
      description: `Advance deduction – ${employee?.name ?? "Employee"} (${advance.advanceNumber})`,
      createdBy: user._id,
      sourceType: SALARY_ADVANCE_DEDUCTION_SOURCE,
      sourceId: args.advanceId,
      lines: [
        { accountId: salariesPayable._id, debit: deduction, description: "Advance deduction" },
        { accountId: advanceAsset._id, credit: deduction, description: employee?.name ?? "Employee" },
      ],
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "salaryAdvances:recordAdvanceDeduction",
      resourceType: "salary_advance",
      resourceId: args.advanceId,
      action: "advance_deduction_recorded",
      details: `Deduction of ${deduction} from advance ${advance.advanceNumber}`,
    });
  },
});

export const cancelSalaryAdvance = mutation({
  args: { advanceId: v.id("salaryAdvances"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (user.role === "staff") throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const advance = await ctx.db.get(args.advanceId);
    if (!advance) throw new ConvexError({ message: "Advance not found", code: "NOT_FOUND" });
    await enforcePostingDate(ctx, advance.date);
    await ctx.db.patch(args.advanceId, { status: "cancelled", notes: args.notes ?? advance.notes });
    await logAudit(ctx, {
      userId: user._id,
      mutationName: "salaryAdvances:cancelSalaryAdvance",
      resourceType: "salary_advance",
      resourceId: args.advanceId,
      action: "salary_advance_cancelled",
      details: `Advance ${advance.advanceNumber} cancelled`,
    });
  },
});
