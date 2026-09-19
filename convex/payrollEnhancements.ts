import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// ─── Auth Helper ────────────────────────────────────────────────────────────

async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      message: "User not logged in",
      code: "UNAUTHENTICATED",
    });
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) {
    throw new ConvexError({
      message: "User not found",
      code: "NOT_FOUND",
    });
  }
  return user;
}

// ─── Number to Words Helper ─────────────────────────────────────────────────

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function convertGroupToWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    return TENS[ten] + (one > 0 ? " " + ONES[one] : "");
  }
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  return (
    ONES[hundred] +
    " Hundred" +
    (remainder > 0 ? " " + convertGroupToWords(remainder) : "")
  );
}

function numberToWords(amount: number): string {
  if (amount < 0) return "Negative " + numberToWords(Math.abs(amount));
  if (amount === 0) return "Zero and 00/100";

  const wholePart = Math.floor(amount);
  const centsPart = Math.round((amount - wholePart) * 100);

  if (wholePart === 0) {
    return `Zero and ${centsPart.toString().padStart(2, "0")}/100`;
  }

  // Split whole part into groups of three digits
  const groups: number[] = [];
  let remaining = wholePart;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const wordParts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    const groupWords = convertGroupToWords(groups[i]);
    const scale = SCALES[i];
    wordParts.push(groupWords + (scale ? " " + scale : ""));
  }

  const wholeWords = wordParts.join(" ");
  return `${wholeWords} and ${centsPart.toString().padStart(2, "0")}/100`;
}

// ─── Employee Benefits ──────────────────────────────────────────────────────

export const listBenefits = query({
  args: {
    employeeId: v.optional(v.id("employees")),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    if (args.employeeId) {
      return await ctx.db
        .query("employeeBenefits")
        .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId!))
        .collect();
    }
    return await ctx.db.query("employeeBenefits").collect();
  },
});

export const createBenefit = mutation({
  args: {
    employeeId: v.id("employees"),
    type: v.union(
      v.literal("medical_insurance"),
      v.literal("life_insurance"),
      v.literal("dental"),
      v.literal("vision"),
      v.literal("housing_benefit"),
      v.literal("education"),
      v.literal("travel"),
      v.literal("other")
    ),
    provider: v.optional(v.string()),
    policyNumber: v.optional(v.string()),
    coverageAmount: v.optional(v.number()),
    monthlyPremium: v.optional(v.number()),
    companyContribution: v.optional(v.number()),
    employeeContribution: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const benefitId = await ctx.db.insert("employeeBenefits", {
      employeeId: args.employeeId,
      type: args.type,
      provider: args.provider,
      policyNumber: args.policyNumber,
      coverageAmount: args.coverageAmount,
      monthlyPremium: args.monthlyPremium,
      companyContribution: args.companyContribution,
      employeeContribution: args.employeeContribution,
      startDate: args.startDate,
      endDate: args.endDate,
      status: args.status,
      notes: args.notes,
    });
    return benefitId;
  },
});

export const updateBenefit = mutation({
  args: {
    id: v.id("employeeBenefits"),
    type: v.optional(
      v.union(
        v.literal("medical_insurance"),
        v.literal("life_insurance"),
        v.literal("dental"),
        v.literal("vision"),
        v.literal("housing_benefit"),
        v.literal("education"),
        v.literal("travel"),
        v.literal("other")
      )
    ),
    provider: v.optional(v.string()),
    policyNumber: v.optional(v.string()),
    coverageAmount: v.optional(v.number()),
    monthlyPremium: v.optional(v.number()),
    companyContribution: v.optional(v.number()),
    employeeContribution: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("expired"),
        v.literal("cancelled")
      )
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Benefit not found",
        code: "NOT_FOUND",
      });
    }

    const { id, ...updates } = args;
    // Filter out undefined values to only patch defined fields
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

export const deleteBenefit = mutation({
  args: {
    id: v.id("employeeBenefits"),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Benefit not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

// ─── Payroll Tax Declarations ───────────────────────────────────────────────

export const listTaxDeclarations = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("filed"),
        v.literal("amended")
      )
    ),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    if (args.status) {
      return await ctx.db
        .query("payrollTaxDeclarations")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("payrollTaxDeclarations").collect();
  },
});

export const createTaxDeclaration = mutation({
  args: {
    title: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    totalGrossPay: v.number(),
    totalTaxable: v.number(),
    totalTaxWithheld: v.number(),
    totalSocialSecurity: v.number(),
    employeeCount: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("filed"),
      v.literal("amended")
    ),
    filedDate: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    const declarationId = await ctx.db.insert("payrollTaxDeclarations", {
      title: args.title,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      totalGrossPay: args.totalGrossPay,
      totalTaxable: args.totalTaxable,
      totalTaxWithheld: args.totalTaxWithheld,
      totalSocialSecurity: args.totalSocialSecurity,
      employeeCount: args.employeeCount,
      status: args.status,
      filedDate: args.filedDate,
      reference: args.reference,
      notes: args.notes,
      createdBy: user._id,
    });
    return declarationId;
  },
});

export const updateTaxDeclaration = mutation({
  args: {
    id: v.id("payrollTaxDeclarations"),
    title: v.optional(v.string()),
    periodStart: v.optional(v.string()),
    periodEnd: v.optional(v.string()),
    totalGrossPay: v.optional(v.number()),
    totalTaxable: v.optional(v.number()),
    totalTaxWithheld: v.optional(v.number()),
    totalSocialSecurity: v.optional(v.number()),
    employeeCount: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("filed"),
        v.literal("amended")
      )
    ),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Tax declaration not found",
        code: "NOT_FOUND",
      });
    }

    const { id, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

export const deleteTaxDeclaration = mutation({
  args: {
    id: v.id("payrollTaxDeclarations"),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Tax declaration not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const fileTaxDeclaration = mutation({
  args: {
    id: v.id("payrollTaxDeclarations"),
    filedDate: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Tax declaration not found",
        code: "NOT_FOUND",
      });
    }

    if (existing.status === "filed") {
      throw new ConvexError({
        message: "Tax declaration is already filed",
        code: "CONFLICT",
      });
    }

    await ctx.db.patch(args.id, {
      status: "filed" as const,
      filedDate: args.filedDate,
      reference: args.reference,
    });
    return args.id;
  },
});

// ─── Cheque Vouchers ────────────────────────────────────────────────────────

async function generateVoucherNumber(ctx: QueryCtx | MutationCtx): Promise<string> {
  // Get the latest voucher to determine next number
  const latestVoucher = await ctx.db
    .query("chequeVouchers")
    .order("desc")
    .first();

  let nextNumber = 1;
  if (latestVoucher) {
    const currentNumber = parseInt(latestVoucher.voucherNumber.replace("CHQ-", ""), 10);
    if (!isNaN(currentNumber)) {
      nextNumber = currentNumber + 1;
    }
  }

  return `CHQ-${nextNumber.toString().padStart(5, "0")}`;
}

export const listChequeVouchers = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("printed"),
        v.literal("cleared"),
        v.literal("void")
      )
    ),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    let vouchers: Doc<"chequeVouchers">[];

    if (args.status) {
      vouchers = await ctx.db
        .query("chequeVouchers")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      vouchers = await ctx.db.query("chequeVouchers").collect();
    }

    // Enrich with employee name
    const enriched = await Promise.all(
      vouchers.map(async (voucher) => {
        let employeeName: string | null = null;
        if (voucher.employeeId) {
          const employee = await ctx.db.get(voucher.employeeId);
          if (employee) {
            employeeName = employee.name;
          }
        }
        return { ...voucher, employeeName };
      })
    );

    return enriched;
  },
});

export const createChequeVoucher = mutation({
  args: {
    payrollRunId: v.optional(v.id("payrollRuns")),
    employeeId: v.optional(v.id("employees")),
    payeeName: v.string(),
    amount: v.number(),
    bankName: v.string(),
    chequeNumber: v.optional(v.string()),
    date: v.string(),
    memo: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("printed"),
      v.literal("cleared"),
      v.literal("void")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const voucherNumber = await generateVoucherNumber(ctx);
    const amountInWords = numberToWords(args.amount);

    const voucherId = await ctx.db.insert("chequeVouchers", {
      voucherNumber,
      payrollRunId: args.payrollRunId,
      employeeId: args.employeeId,
      payeeName: args.payeeName,
      amount: args.amount,
      amountInWords,
      bankName: args.bankName,
      chequeNumber: args.chequeNumber,
      date: args.date,
      memo: args.memo,
      status: args.status,
      createdBy: user._id,
    });
    return voucherId;
  },
});

export const updateChequeVoucherStatus = mutation({
  args: {
    id: v.id("chequeVouchers"),
    status: v.union(
      v.literal("draft"),
      v.literal("printed"),
      v.literal("cleared"),
      v.literal("void")
    ),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Cheque voucher not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.db.patch(args.id, { status: args.status });
    return args.id;
  },
});

export const deleteChequeVoucher = mutation({
  args: {
    id: v.id("chequeVouchers"),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({
        message: "Cheque voucher not found",
        code: "NOT_FOUND",
      });
    }

    if (existing.status === "cleared") {
      throw new ConvexError({
        message: "Cannot delete a cleared cheque voucher",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

// ─── Utility Query ──────────────────────────────────────────────────────────

export const getAmountInWords = query({
  args: {
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx);
    return numberToWords(args.amount);
  },
});
