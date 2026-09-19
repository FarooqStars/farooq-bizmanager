// ─────────────────────────────────────────────────────────────────────────────
// Payroll posting engine.
//
// This module contains the ONLY functions that post payroll and gratuity
// journal entries. Every entry flows through postBalancedEntry in ledger.ts.
//
// Entries produced here:
//
//   PAYROLL_ACCRUAL_SOURCE (one per run, on approve)
//     Dr  6000 Salaries & Wages          gross (base + allowances + OT)  per employee
//     Cr  2200 Salaries Payable          net pay                          per employee
//     Cr  2250 Social Insurance Payable  employee SI contribution         per employee (if any)
//     Cr  2260 Payroll Deductions Payable manual deductions (non-SI only) per employee (if any)
//
//   PAYROLL_EMPLOYER_SI_SOURCE (one per run, on approve — same transaction)
//     Dr  6010 Employer SI Expense       total employer SI across run
//     Cr  2250 Social Insurance Payable  same amount
//
//   PAYROLL_PAYMENT_SOURCE (one per run, on paid)
//     Dr  2200 Salaries Payable          total net pay for the run
//     Cr  paymentAccountId              same amount (bank/cash chosen by owner)
//
//   GRATUITY_ACCRUAL_SOURCE (one per accrual run, period-end action)
//     Dr  6020 End-of-Service Expense    delta per employee
//     Cr  2700 End-of-Service Benefits Payable  same delta
//
//   GRATUITY_PAYMENT_SOURCE (one per employee termination)
//     Dr  2700 End-of-Service Benefits Payable  full accrued balance for employee
//     Cr  paymentAccountId              actual payment
//     Dr or Cr 6020  correction for over/under accrual
//
// Do NOT call postBalancedEntry anywhere else for payroll movements.
// ─────────────────────────────────────────────────────────────────────────────

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel.d.ts";
import {
  postBalancedEntry,
  findOrCreateAccount,
  reverseEntriesForSource,
  round2,
} from "./ledger.ts";
import {
  PAYROLL_ACCRUAL_SOURCE,
  PAYROLL_EMPLOYER_SI_SOURCE,
  PAYROLL_PAYMENT_SOURCE,
} from "./sourceTypes.ts";

// ─── Account accessors ────────────────────────────────────────────────────────

async function getSalariesWages(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "6000",
    name: "Salaries & Wages",
    type: "expense",
    subType: "Payroll",
  });
  return acc._id;
}

async function getSalariesPayable(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "2200",
    name: "Salaries Payable",
    type: "other_current_liability",
    subType: "Payroll",
  });
  return acc._id;
}

async function getSIPayable(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "2250",
    name: "Social Insurance Payable",
    type: "other_current_liability",
    subType: "Payroll",
  });
  return acc._id;
}

async function getDeductionsPayable(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "2260",
    name: "Payroll Deductions Payable",
    type: "other_current_liability",
    subType: "Payroll",
  });
  return acc._id;
}

async function getEmployerSIExpense(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "6010",
    name: "Employer Social Insurance Expense",
    type: "expense",
    subType: "Payroll",
  });
  return acc._id;
}

export async function getEOSPayable(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "2700",
    name: "End-of-Service Benefits Payable",
    type: "long_term_liability",
    subType: "Payroll",
  });
  return acc._id;
}

export async function getEOSExpense(ctx: MutationCtx): Promise<Id<"accounts">> {
  const acc = await findOrCreateAccount(ctx, {
    code: "6020",
    name: "End-of-Service Expense",
    type: "expense",
    subType: "Payroll",
  });
  return acc._id;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PayslipForPosting = {
  employeeName: string;
  /** gross = baseSalary + allowances + overtimeAmount */
  gross: number;
  netPay: number;
  /** employee-side social insurance contribution */
  siEmployee: number;
  /** employer-side social insurance contribution */
  siEmployer: number;
  /** manual (non-SI) deductions — anything else in payslips.deductions */
  manualDeductions: number;
};

// ─── Guard helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if a PAYROLL_ACCRUAL_SOURCE entry already exists for this run.
 * Used to prevent double-posting.
 */
export async function accrualAlreadyPosted(
  ctx: MutationCtx,
  runId: Id<"payrollRuns">,
): Promise<boolean> {
  const entry = await ctx.db
    .query("journalEntries")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", PAYROLL_ACCRUAL_SOURCE).eq("sourceId", runId as string),
    )
    .first();
  return entry !== null;
}

/**
 * Returns true if a PAYROLL_PAYMENT_SOURCE entry already exists for this run.
 */
export async function paymentAlreadyPosted(
  ctx: MutationCtx,
  runId: Id<"payrollRuns">,
): Promise<boolean> {
  const entry = await ctx.db
    .query("journalEntries")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", PAYROLL_PAYMENT_SOURCE).eq("sourceId", runId as string),
    )
    .first();
  return entry !== null;
}

// ─── Posting functions ────────────────────────────────────────────────────────

/**
 * Post the salary accrual entry when a run is approved.
 * Dr Salaries & Wages (gross per employee)
 * Cr Salaries Payable (net pay per employee)
 * Cr Social Insurance Payable (employee SI per employee, if any)
 * Cr Payroll Deductions Payable (manual deductions per employee, if any)
 */
export async function postPayrollAccrual(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  payslips: PayslipForPosting[],
  createdBy: Id<"users">,
): Promise<Id<"journalEntries">> {
  if (payslips.length === 0) {
    throw new ConvexError({ message: "No payslips to post", code: "BAD_REQUEST" });
  }

  const [salariesWagesId, salariesPayableId, siPayableId, deductionsPayableId] =
    await Promise.all([
      getSalariesWages(ctx),
      getSalariesPayable(ctx),
      getSIPayable(ctx),
      getDeductionsPayable(ctx),
    ]);

  type LedgerLineArg = {
    accountId: Id<"accounts">;
    debit?: number;
    credit?: number;
    description?: string;
  };
  const lines: LedgerLineArg[] = [];

  for (const slip of payslips) {
    if (slip.gross <= 0) continue;

    lines.push({
      accountId: salariesWagesId,
      debit: round2(slip.gross),
      description: `Salary — ${slip.employeeName}`,
    });

    lines.push({
      accountId: salariesPayableId,
      credit: round2(slip.netPay),
      description: `Net pay — ${slip.employeeName}`,
    });

    if (slip.siEmployee > 0) {
      lines.push({
        accountId: siPayableId,
        credit: round2(slip.siEmployee),
        description: `Employee SI — ${slip.employeeName}`,
      });
    }

    if (slip.manualDeductions > 0) {
      lines.push({
        accountId: deductionsPayableId,
        credit: round2(slip.manualDeductions),
        description: `Deductions — ${slip.employeeName}`,
      });
    }
  }

  return postBalancedEntry(ctx, {
    date: run.payDate,
    description: `Payroll accrual — ${run.title}`,
    reference: run.title,
    createdBy,
    sourceType: PAYROLL_ACCRUAL_SOURCE,
    sourceId: run._id as string,
    lines,
  });
}

/**
 * Post the employer social-insurance cost entry alongside the accrual.
 * Dr Employer SI Expense (total employer SI for the run)
 * Cr Social Insurance Payable (same amount)
 *
 * Posted in the same mutation as postPayrollAccrual — Convex transactions
 * guarantee both succeed or both fail.
 */
export async function postEmployerSI(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  payslips: PayslipForPosting[],
  createdBy: Id<"users">,
): Promise<Id<"journalEntries"> | null> {
  const totalEmployerSI = round2(
    payslips.reduce((sum, s) => sum + s.siEmployer, 0),
  );
  if (totalEmployerSI <= 0) return null;

  const [employerSIExpenseId, siPayableId] = await Promise.all([
    getEmployerSIExpense(ctx),
    getSIPayable(ctx),
  ]);

  return postBalancedEntry(ctx, {
    date: run.payDate,
    description: `Employer social insurance — ${run.title}`,
    reference: run.title,
    createdBy,
    sourceType: PAYROLL_EMPLOYER_SI_SOURCE,
    sourceId: run._id as string,
    lines: [
      {
        accountId: employerSIExpenseId,
        debit: totalEmployerSI,
        description: `Employer SI — ${run.title}`,
      },
      {
        accountId: siPayableId,
        credit: totalEmployerSI,
        description: `Employer SI payable — ${run.title}`,
      },
    ],
  });
}

/**
 * Post the payment entry when a run is marked as paid.
 * Dr Salaries Payable (total net pay for the run)
 * Cr paymentAccountId (bank/cash account chosen by owner)
 */
export async function postPayrollPayment(
  ctx: MutationCtx,
  run: Doc<"payrollRuns">,
  paymentAccountId: Id<"accounts">,
  totalNetPay: number,
  createdBy: Id<"users">,
): Promise<Id<"journalEntries">> {
  if (totalNetPay <= 0) {
    throw new ConvexError({
      message: "Cannot post a zero or negative payroll payment",
      code: "BAD_REQUEST",
    });
  }

  const paymentAccount = await ctx.db.get(paymentAccountId);
  if (!paymentAccount) {
    throw new ConvexError({
      message: "Payment account not found",
      code: "NOT_FOUND",
    });
  }

  const salariesPayableId = await getSalariesPayable(ctx);

  return postBalancedEntry(ctx, {
    date: run.payDate,
    description: `Payroll payment — ${run.title}`,
    reference: run.title,
    createdBy,
    sourceType: PAYROLL_PAYMENT_SOURCE,
    sourceId: run._id as string,
    lines: [
      {
        accountId: salariesPayableId,
        debit: round2(totalNetPay),
        description: `Salaries Payable cleared — ${run.title}`,
      },
      {
        accountId: paymentAccountId,
        credit: round2(totalNetPay),
        description: `Bank payment — ${run.title}`,
      },
    ],
  });
}

/**
 * Reverse all payroll-related entries for a run.
 * Called when a run is voided or rolled back.
 * Reverses: PAYROLL_ACCRUAL_SOURCE, PAYROLL_EMPLOYER_SI_SOURCE, and (if posted) PAYROLL_PAYMENT_SOURCE.
 */
export async function reversePayrollEntries(
  ctx: MutationCtx,
  runId: Id<"payrollRuns">,
  reversePayment: boolean,
  opts: { date?: string; createdBy?: Id<"users"> } = {},
): Promise<void> {
  const sid = runId as string;
  await reverseEntriesForSource(ctx, PAYROLL_ACCRUAL_SOURCE, sid, opts);
  await reverseEntriesForSource(ctx, PAYROLL_EMPLOYER_SI_SOURCE, sid, opts);
  if (reversePayment) {
    await reverseEntriesForSource(ctx, PAYROLL_PAYMENT_SOURCE, sid, opts);
  }
}
