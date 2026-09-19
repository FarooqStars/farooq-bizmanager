import { v, ConvexError } from "convex/values";
import { addMonths, addWeeks, addYears } from "date-fns";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { nextNumber } from "./lib/docNumber.ts";
import { logAudit } from "./lib/audit.ts";
import { postBalancedEntry, findOrCreateAccount, round2 } from "./lib/ledger.ts";
import { LOAN_DISBURSEMENT_SOURCE, LOAN_REPAYMENT_SOURCE } from "./lib/sourceTypes.ts";

// Helper to get authenticated user
async function getUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// Calculate EMI (Equated Monthly Installment) for compound interest
function calculateEMI(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const monthlyRate = annualRate / 100 / 12;
  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(emi * 100) / 100;
}

// Calculate simple interest monthly payment
function calculateSimplePayment(principal: number, annualRate: number, termMonths: number): number {
  const totalInterest = principal * (annualRate / 100) * (termMonths / 12);
  return Math.round(((principal + totalInterest) / termMonths) * 100) / 100;
}

// Compute next payment date based on frequency
function computeNextPaymentDate(fromDate: string, frequency: string): string {
  const date = new Date(fromDate);
  let next: Date;
  switch (frequency) {
    case "weekly":
      next = addWeeks(date, 1);
      break;
    case "biweekly":
      next = addWeeks(date, 2);
      break;
    case "monthly":
      next = addMonths(date, 1);
      break;
    case "quarterly":
      next = addMonths(date, 3);
      break;
    case "yearly":
      next = addYears(date, 1);
      break;
    default:
      next = addMonths(date, 1);
  }
  return next.toISOString().split("T")[0];
}

// Generate amortization schedule
function generateAmortizationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  interestType: "simple" | "compound",
  startDate: string,
  frequency: string,
): Array<{
  paymentNumber: number;
  date: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  balanceAfter: number;
}> {
  const schedule: Array<{
    paymentNumber: number;
    date: string;
    amount: number;
    principalPortion: number;
    interestPortion: number;
    balanceAfter: number;
  }> = [];

  if (interestType === "compound") {
    const monthlyRate = annualRate / 100 / 12;
    const emi = calculateEMI(principal, annualRate, termMonths);
    let balance = principal;
    let currentDate = startDate;

    for (let i = 1; i <= termMonths; i++) {
      const interestPortion = Math.round(balance * monthlyRate * 100) / 100;
      const principalPortion = Math.round((emi - interestPortion) * 100) / 100;
      balance = Math.round((balance - principalPortion) * 100) / 100;
      if (balance < 0) balance = 0;

      currentDate = computeNextPaymentDate(currentDate, frequency);

      schedule.push({
        paymentNumber: i,
        date: currentDate,
        amount:
          i === termMonths
            ? Math.round((principalPortion + interestPortion + balance) * 100) / 100
            : emi,
        principalPortion: i === termMonths ? principalPortion + balance : principalPortion,
        interestPortion,
        balanceAfter: i === termMonths ? 0 : balance,
      });
    }
  } else {
    // Simple interest
    const totalInterest = principal * (annualRate / 100) * (termMonths / 12);
    const monthlyInterest = Math.round((totalInterest / termMonths) * 100) / 100;
    const monthlyPrincipal = Math.round((principal / termMonths) * 100) / 100;
    const monthlyPayment = monthlyPrincipal + monthlyInterest;
    let balance = principal;
    let currentDate = startDate;

    for (let i = 1; i <= termMonths; i++) {
      const principalPortion = i === termMonths ? balance : monthlyPrincipal;
      balance = Math.round((balance - principalPortion) * 100) / 100;
      if (balance < 0) balance = 0;

      currentDate = computeNextPaymentDate(currentDate, frequency);

      schedule.push({
        paymentNumber: i,
        date: currentDate,
        amount: i === termMonths ? principalPortion + monthlyInterest : monthlyPayment,
        principalPortion,
        interestPortion: monthlyInterest,
        balanceAfter: i === termMonths ? 0 : balance,
      });
    }
  }

  return schedule;
}

// ─── Queries ───────────────────────────────────────────────────

export const listLoans = query({
  args: {
    type: v.optional(v.union(v.literal("receivable"), v.literal("payable"))),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getUser(ctx);

    let records: Doc<"loans">[];
    if (args.type) {
      records = await ctx.db
        .query("loans")
        .withIndex("by_type", (q) => q.eq("type", args.type as "receivable" | "payable"))
        .order("desc")
        .collect();
    } else {
      records = await ctx.db.query("loans").order("desc").collect();
    }

    if (args.status) {
      records = records.filter((r) => r.status === args.status);
    }

    const enriched = await Promise.all(
      records.map(async (loan) => {
        let entityName = loan.lenderName ?? "Unknown";
        if (loan.customerId) {
          const customer = await ctx.db.get(loan.customerId);
          entityName = customer?.name ?? "Unknown";
        } else if (loan.vendorId) {
          const vendor = await ctx.db.get(loan.vendorId);
          entityName = vendor?.name ?? "Unknown";
        }
        return { ...loan, entityName };
      }),
    );

    return enriched;
  },
});

export const getLoan = query({
  args: { id: v.id("loans") },
  handler: async (ctx, args) => {
    await getUser(ctx);
    const loan = await ctx.db.get(args.id);
    if (!loan) return null;

    let entityName = loan.lenderName ?? "Unknown";
    if (loan.customerId) {
      const customer = await ctx.db.get(loan.customerId);
      entityName = customer?.name ?? "Unknown";
    } else if (loan.vendorId) {
      const vendor = await ctx.db.get(loan.vendorId);
      entityName = vendor?.name ?? "Unknown";
    }

    return { ...loan, entityName };
  },
});

export const getLoanPayments = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    await getUser(ctx);
    return await ctx.db
      .query("loanPayments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .order("asc")
      .collect();
  },
});

export const getAmortizationSchedule = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    await getUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return [];

    return generateAmortizationSchedule(
      loan.principalAmount,
      loan.interestRate,
      loan.termMonths,
      loan.interestType,
      loan.startDate,
      loan.paymentFrequency,
    );
  },
});

export const getLoanSummary = query({
  args: {},
  handler: async (ctx) => {
    await getUser(ctx);
    const loans = await ctx.db.query("loans").collect();

    const activeReceivables = loans.filter((l) => l.type === "receivable" && l.status === "active");
    const activePayables = loans.filter((l) => l.type === "payable" && l.status === "active");

    return {
      totalReceivable: activeReceivables.reduce((sum, l) => sum + l.outstandingBalance, 0),
      totalPayable: activePayables.reduce((sum, l) => sum + l.outstandingBalance, 0),
      activeLoansCount: loans.filter((l) => l.status === "active").length,
      paidOffCount: loans.filter((l) => l.status === "paid_off").length,
      totalLoans: loans.length,
    };
  },
});

// ─── Mutations ─────────────────────────────────────────────────

export const createLoan = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("receivable"), v.literal("payable")),
    customerId: v.optional(v.id("customers")),
    vendorId: v.optional(v.id("vendors")),
    lenderName: v.optional(v.string()),
    bankAccountId: v.optional(v.id("accounts")),
    principalAmount: v.number(),
    interestRate: v.number(),
    interestType: v.union(v.literal("simple"), v.literal("compound")),
    termMonths: v.number(),
    startDate: v.string(),
    paymentFrequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"loans">> => {
    const user = await getUser(ctx);

    if (args.principalAmount <= 0) {
      throw new ConvexError({ message: "Principal amount must be positive", code: "BAD_REQUEST" });
    }
    if (args.termMonths <= 0) {
      throw new ConvexError({ message: "Term must be at least 1 month", code: "BAD_REQUEST" });
    }
    if (args.interestRate < 0) {
      throw new ConvexError({ message: "Interest rate cannot be negative", code: "BAD_REQUEST" });
    }

    // Calculate loan details
    const monthlyPayment =
      args.interestType === "compound"
        ? calculateEMI(args.principalAmount, args.interestRate, args.termMonths)
        : calculateSimplePayment(args.principalAmount, args.interestRate, args.termMonths);

    let totalInterest: number;
    if (args.interestType === "compound") {
      totalInterest =
        Math.round((monthlyPayment * args.termMonths - args.principalAmount) * 100) / 100;
    } else {
      totalInterest =
        Math.round(
          args.principalAmount * (args.interestRate / 100) * (args.termMonths / 12) * 100,
        ) / 100;
    }
    const totalPayable = Math.round((args.principalAmount + totalInterest) * 100) / 100;

    // Calculate end date
    const endDate = addMonths(new Date(args.startDate), args.termMonths)
      .toISOString()
      .split("T")[0];
    const nextPaymentDate = computeNextPaymentDate(args.startDate, args.paymentFrequency);

    // Generate loan number
    const allLoans = await ctx.db.query("loans").collect();
    const loanNumber = nextNumber(allLoans, (l) => l.loanNumber, "LN-", 5);

    const loanId = await ctx.db.insert("loans", {
      loanNumber,
      name: args.name,
      type: args.type,
      customerId: args.customerId,
      vendorId: args.vendorId,
      lenderName: args.lenderName,
      bankAccountId: args.bankAccountId,
      principalAmount: args.principalAmount,
      interestRate: args.interestRate,
      interestType: args.interestType,
      termMonths: args.termMonths,
      startDate: args.startDate,
      endDate,
      paymentFrequency: args.paymentFrequency,
      monthlyPayment,
      totalInterest,
      totalPayable,
      principalPaid: 0,
      interestPaid: 0,
      outstandingBalance: args.principalAmount,
      status: "active",
      nextPaymentDate,
      notes: args.notes,
      createdBy: user._id,
    });

    // Pre-generate the amortization schedule as loan payments (scheduled status)
    const schedule = generateAmortizationSchedule(
      args.principalAmount,
      args.interestRate,
      args.termMonths,
      args.interestType,
      args.startDate,
      args.paymentFrequency,
    );

    for (const entry of schedule) {
      await ctx.db.insert("loanPayments", {
        loanId,
        paymentNumber: entry.paymentNumber,
        date: entry.date,
        amount: entry.amount,
        principalPortion: entry.principalPortion,
        interestPortion: entry.interestPortion,
        balanceAfter: entry.balanceAfter,
        status: "scheduled",
      });
    }

    // ── Post GL disbursement entry ────────────────────────────────────────────
    const cost = round2(args.principalAmount);

    // Resolve bank account for the GL entry
    let bankAccountId: Id<"accounts">;
    if (args.bankAccountId) {
      bankAccountId = args.bankAccountId;
    } else {
      const defaultBank = await findOrCreateAccount(ctx, {
        type: "bank",
        code: "1000",
        name: "Bank Account",
        subType: "Checking",
        matchAnyOfType: true,
      });
      bankAccountId = defaultBank._id;
    }

    if (args.type === "payable") {
      // We RECEIVED the loan proceeds: Dr Bank / Cr Loan Payable
      const loanLiability = await findOrCreateAccount(ctx, {
        type: "loan",
        code: "2100",
        name: "Loans Payable",
        subType: "Bank Loans",
        matchSubType: "Bank Loans",
      });
      await postBalancedEntry(ctx, {
        date: args.startDate,
        description: `Loan received – ${args.name} (${loanNumber})`,
        createdBy: user._id,
        sourceType: LOAN_DISBURSEMENT_SOURCE,
        sourceId: loanId,
        lines: [
          { accountId: bankAccountId, debit: cost, description: args.name },
          { accountId: loanLiability._id, credit: cost, description: args.name },
        ],
      });
      // Record bank transaction so it appears in Banking page
      await ctx.db.insert("bankTransactions", {
        accountId: bankAccountId,
        date: args.startDate,
        description: `Loan received – ${args.name} (${loanNumber})`,
        amount: cost,
        type: "credit",
        reference: loanNumber,
        category: "Loan Disbursement",
        isReconciled: false,
      });
    } else {
      // We ISSUED the loan: Dr Loan Receivable / Cr Bank
      const loanReceivable = await findOrCreateAccount(ctx, {
        type: "other_asset",
        code: "1200",
        name: "Loans Receivable",
        subType: "Loans Given",
        matchSubType: "Loans Given",
      });
      await postBalancedEntry(ctx, {
        date: args.startDate,
        description: `Loan issued – ${args.name} (${loanNumber})`,
        createdBy: user._id,
        sourceType: LOAN_DISBURSEMENT_SOURCE,
        sourceId: loanId,
        lines: [
          { accountId: loanReceivable._id, debit: cost, description: args.name },
          { accountId: bankAccountId, credit: cost, description: args.name },
        ],
      });
      // Record bank transaction so it appears in Banking page
      await ctx.db.insert("bankTransactions", {
        accountId: bankAccountId,
        date: args.startDate,
        description: `Loan issued – ${args.name} (${loanNumber})`,
        amount: cost,
        type: "debit",
        reference: loanNumber,
        category: "Loan Disbursement",
        isReconciled: false,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "loans:createLoan",
      resourceType: "loan",
      resourceId: loanId,
      action: "loan_created",
      afterValue: JSON.stringify({ loanNumber, amount: args.principalAmount, lenderName: args.lenderName, type: args.type }),
      details: `Created loan ${loanNumber} for ${args.principalAmount}`,
    });

    return loanId;
  },
});

export const recordLoanPayment = mutation({
  args: {
    loanId: v.id("loans"),
    paymentId: v.id("loanPayments"),
    date: v.string(),
    amount: v.number(),
    method: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("cheque"),
        v.literal("other"),
      ),
    ),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);

    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError({ message: "Loan not found", code: "NOT_FOUND" });
    if (loan.status !== "active") {
      throw new ConvexError({ message: "Loan is not active", code: "BAD_REQUEST" });
    }

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new ConvexError({ message: "Payment not found", code: "NOT_FOUND" });

    // Mark payment as paid
    await ctx.db.patch(args.paymentId, {
      status: "paid",
      date: args.date,
      amount: args.amount,
      method: args.method,
      reference: args.reference,
      notes: args.notes,
      recordedBy: user._id,
    });

    // Update loan balances
    const newPrincipalPaid =
      Math.round((loan.principalPaid + payment.principalPortion) * 100) / 100;
    const newInterestPaid = Math.round((loan.interestPaid + payment.interestPortion) * 100) / 100;
    const newOutstanding =
      Math.round((loan.outstandingBalance - payment.principalPortion) * 100) / 100;

    // Find next scheduled payment
    const nextPayments = await ctx.db
      .query("loanPayments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
    const nextScheduled = nextPayments
      .filter((p) => p.status === "scheduled" && p._id !== args.paymentId)
      .sort((a, b) => a.date.localeCompare(b.date));

    const isPaidOff = newOutstanding <= 0 || nextScheduled.length === 0;

    await ctx.db.patch(args.loanId, {
      principalPaid: newPrincipalPaid,
      interestPaid: newInterestPaid,
      outstandingBalance: Math.max(0, newOutstanding),
      status: isPaidOff ? "paid_off" : "active",
      nextPaymentDate: isPaidOff ? loan.endDate : (nextScheduled[0]?.date ?? loan.endDate),
    });

    // ── Post GL repayment entry ───────────────────────────────────────────────
    // Resolve bank account
    let bankAccountId: Id<"accounts">;
    if (loan.bankAccountId) {
      bankAccountId = loan.bankAccountId;
    } else {
      const defaultBank = await findOrCreateAccount(ctx, {
        type: "bank",
        code: "1000",
        name: "Bank Account",
        subType: "Checking",
        matchAnyOfType: true,
      });
      bankAccountId = defaultBank._id;
    }

    const principal = round2(payment.principalPortion);
    const interest = round2(payment.interestPortion);
    const total = round2(args.amount);

    if (loan.type === "payable") {
      // We are repaying a loan we owe:
      // Dr Loans Payable (principal) + Dr Interest Expense (interest) / Cr Bank
      const loanLiability = await findOrCreateAccount(ctx, {
        type: "loan",
        code: "2100",
        name: "Loans Payable",
        subType: "Bank Loans",
        matchSubType: "Bank Loans",
      });
      const interestExpense = await findOrCreateAccount(ctx, {
        type: "expense",
        code: "6500",
        name: "Interest Expense",
        subType: "Finance Costs",
        matchSubType: "Finance Costs",
      });
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Loan repayment – ${loan.name} (#${payment.paymentNumber})`,
        reference: args.reference,
        createdBy: user._id,
        sourceType: LOAN_REPAYMENT_SOURCE,
        sourceId: args.paymentId,
        lines: [
          ...(principal > 0 ? [{ accountId: loanLiability._id, debit: principal, description: "Principal repayment" }] : []),
          ...(interest > 0 ? [{ accountId: interestExpense._id, debit: interest, description: "Interest payment" }] : []),
          { accountId: bankAccountId, credit: total, description: loan.name },
        ],
      });
      await ctx.db.insert("bankTransactions", {
        accountId: bankAccountId,
        date: args.date,
        description: `Loan repayment – ${loan.name} (#${payment.paymentNumber})`,
        amount: total,
        type: "debit",
        reference: args.reference ?? loan.loanNumber,
        category: "Loan Repayment",
        isReconciled: false,
      });
    } else {
      // We are collecting repayment on a loan we gave:
      // Dr Bank / Cr Loans Receivable (principal) + Cr Interest Income (interest)
      const loanReceivable = await findOrCreateAccount(ctx, {
        type: "other_asset",
        code: "1200",
        name: "Loans Receivable",
        subType: "Loans Given",
        matchSubType: "Loans Given",
      });
      const interestIncome = await findOrCreateAccount(ctx, {
        type: "other_income",
        code: "8200",
        name: "Interest Income",
        subType: "Finance Income",
        matchSubType: "Finance Income",
      });
      await postBalancedEntry(ctx, {
        date: args.date,
        description: `Loan collection – ${loan.name} (#${payment.paymentNumber})`,
        reference: args.reference,
        createdBy: user._id,
        sourceType: LOAN_REPAYMENT_SOURCE,
        sourceId: args.paymentId,
        lines: [
          { accountId: bankAccountId, debit: total, description: loan.name },
          ...(principal > 0 ? [{ accountId: loanReceivable._id, credit: principal, description: "Principal recovered" }] : []),
          ...(interest > 0 ? [{ accountId: interestIncome._id, credit: interest, description: "Interest received" }] : []),
        ],
      });
      await ctx.db.insert("bankTransactions", {
        accountId: bankAccountId,
        date: args.date,
        description: `Loan collection – ${loan.name} (#${payment.paymentNumber})`,
        amount: total,
        type: "credit",
        reference: args.reference ?? loan.loanNumber,
        category: "Loan Collection",
        isReconciled: false,
      });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "loans:recordLoanPayment",
      resourceType: "loan",
      resourceId: args.loanId,
      action: "loan_payment_recorded",
      details: `Payment of ${args.amount} recorded for loan ${args.loanId}`,
    });
  },
});

/**
 * Backfill GL + bank transaction entries for any loans that were created before
 * the automatic posting was added. Idempotent — loans that already have a
 * journal entry (sourceId = loanId) are skipped.
 */
export const backfillLoanGLEntries = mutation({
  args: {},
  handler: async (ctx): Promise<{ posted: number; skipped: number }> => {
    const user = await getUser(ctx);
    const loans = await ctx.db.query("loans").collect();
    let posted = 0;
    let skipped = 0;

    for (const loan of loans) {
      // Check if a disbursement entry already exists for this loan
      const existing = await ctx.db
        .query("journalEntries")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", LOAN_DISBURSEMENT_SOURCE).eq("sourceId", loan._id),
        )
        .first();
      if (existing) { skipped++; continue; }

      const cost = round2(loan.principalAmount);

      // Resolve bank account
      let bankAccountId: Id<"accounts">;
      if (loan.bankAccountId) {
        bankAccountId = loan.bankAccountId;
      } else {
        const defaultBank = await findOrCreateAccount(ctx, {
          type: "bank",
          code: "1000",
          name: "Bank Account",
          subType: "Checking",
          matchAnyOfType: true,
        });
        bankAccountId = defaultBank._id;
      }

      if (loan.type === "payable") {
        const loanLiability = await findOrCreateAccount(ctx, {
          type: "loan",
          code: "2100",
          name: "Loans Payable",
          subType: "Bank Loans",
          matchSubType: "Bank Loans",
        });
        await postBalancedEntry(ctx, {
          date: loan.startDate,
          description: `Loan received – ${loan.name} (${loan.loanNumber}) [backfill]`,
          createdBy: user._id,
          sourceType: LOAN_DISBURSEMENT_SOURCE,
          sourceId: loan._id,
          lines: [
            { accountId: bankAccountId, debit: cost, description: loan.name },
            { accountId: loanLiability._id, credit: cost, description: loan.name },
          ],
        });
        await ctx.db.insert("bankTransactions", {
          accountId: bankAccountId,
          date: loan.startDate,
          description: `Loan received – ${loan.name} (${loan.loanNumber})`,
          amount: cost,
          type: "credit",
          reference: loan.loanNumber,
          category: "Loan Disbursement",
          isReconciled: false,
        });
      } else {
        const loanReceivable = await findOrCreateAccount(ctx, {
          type: "other_asset",
          code: "1200",
          name: "Loans Receivable",
          subType: "Loans Given",
          matchSubType: "Loans Given",
        });
        await postBalancedEntry(ctx, {
          date: loan.startDate,
          description: `Loan issued – ${loan.name} (${loan.loanNumber}) [backfill]`,
          createdBy: user._id,
          sourceType: LOAN_DISBURSEMENT_SOURCE,
          sourceId: loan._id,
          lines: [
            { accountId: loanReceivable._id, debit: cost, description: loan.name },
            { accountId: bankAccountId, credit: cost, description: loan.name },
          ],
        });
        await ctx.db.insert("bankTransactions", {
          accountId: bankAccountId,
          date: loan.startDate,
          description: `Loan issued – ${loan.name} (${loan.loanNumber})`,
          amount: cost,
          type: "debit",
          reference: loan.loanNumber,
          category: "Loan Disbursement",
          isReconciled: false,
        });
      }
      posted++;
    }

    return { posted, skipped };
  },
});

export const updateLoanStatus = mutation({
  args: {
    id: v.id("loans"),
    status: v.union(v.literal("active"), v.literal("defaulted"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    const loan = await ctx.db.get(args.id);
    if (!loan) throw new ConvexError({ message: "Loan not found", code: "NOT_FOUND" });

    const beforeValue = JSON.stringify(loan);
    await ctx.db.patch(args.id, { status: args.status });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "loans:updateLoanStatus",
      resourceType: "loan",
      resourceId: args.id,
      action: "loan_status_updated",
      beforeValue,
      afterValue: JSON.stringify({ ...loan, status: args.status }),
      details: `Loan status changed from ${loan.status} to ${args.status}`,
    });
  },
});

export const deleteLoan = mutation({
  args: { id: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);
    if (user.role !== "owner") {
      throw new ConvexError({ message: "Only owners can delete loans", code: "FORBIDDEN" });
    }

    const loan = await ctx.db.get(args.id);
    if (!loan) throw new ConvexError({ message: "Loan not found", code: "NOT_FOUND" });
    const beforeValue = JSON.stringify(loan);

    // Delete all loan payments first
    const payments = await ctx.db
      .query("loanPayments")
      .withIndex("by_loan", (q) => q.eq("loanId", args.id))
      .collect();
    for (const payment of payments) {
      await ctx.db.delete(payment._id);
    }

    await ctx.db.delete(args.id);

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "loans:deleteLoan",
      resourceType: "loan",
      resourceId: args.id,
      action: "loan_deleted",
      beforeValue,
      details: `Deleted loan ${loan.loanNumber}`,
    });
  },
});
