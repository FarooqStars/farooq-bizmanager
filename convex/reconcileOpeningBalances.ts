// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME CUTOVER / OPENING-BALANCES RECONCILIATION
//
// Run this ONCE to move BizManager onto a clean double-entry footing without
// re-posting any historical documents. It:
//   1. Cleans confirmed ghost bank-register rows (zero-amount "DELETED_ORPHAN"
//      entries left behind by deleted advances).
//   2. Voids any pre-cutover journal entries (kept for audit, not deleted) so
//      their effect is not double-counted alongside the opening snapshot.
//   3. Resets stored account balances and posts ONE balanced "Opening Balances"
//      journal entry as of the cutover date.
//
// ── NOTHING IS EVER LOST ──
// Before zeroing, we SNAPSHOT every account's balance. The opening entry then
// carries EVERY account that had a non-zero balance forward at its real balance
// (debit if debit-normal, credit if credit-normal), EXCEPT the handful of
// control accounts that are instead recomputed from live source documents:
//        - Accounts Receivable  = outstanding non-draft invoices,
//        - Accounts Payable     = outstanding bills,
//        - Inventory Asset      = inventory valued at cost,
//        - Customer Deposits    = outstanding customer advances (liability),
//        - Vendor Prepayments   = outstanding vendor advances (asset),
// with Opening Balance Equity absorbing any difference. Every OTHER account
// (Fixed Assets, Accumulated Depreciation, VAT Payable, Retained Earnings,
// Loans, Credit Cards, Owner's Equity/Drawings, Prepaid/Accrued Expenses, cash
// & bank, etc.) is carried forward at its exact stored balance so its value can
// never silently vanish.
//
// After posting we ASSERT that every account which had a non-zero balance before
// the cutover is present in the opening entry (control accounts and Opening
// Balance Equity excepted, since those are intentionally recomputed / act as the
// plug). If any is missing we THROW and the whole mutation rolls back.
//
// Going forward every transaction posts through the normal ledger engine.
// Outstanding invoices / bills are left OPEN so they can still be received /
// paid against — this migration does NOT touch them.
//
// The mutation is transactional: if the resulting books do not reconcile
// (trial balance not zero, or assets != liabilities + equity, or an account was
// dropped) it THROWS and rolls everything back, changing nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import {
  getControlAccounts,
  findAccount,
  postBalancedEntry,
  round2,
  NORMAL_SIDES,
  ASSET_TYPES,
  LIABILITY_TYPES,
  EQUITY_TYPES,
} from "./lib/ledger.ts";

/** All opening-balance journal entries carry this sourceType. Export so
 *  report queries and reconciliation checks can import rather than retype. */
import { OPENING_BALANCES_SOURCE } from "./lib/sourceTypes.ts";
export { OPENING_BALANCES_SOURCE };

type OpeningLine = {
  account: string;
  code: string;
  debit: number;
  credit: number;
};

type ReconcileReport = {
  cutoverDate: string;
  dryRun: boolean;
  ghostRowsCleaned: number;
  priorEntriesVoided: number;
  computed: {
    arOutstanding: number;
    apOutstanding: number;
    inventoryAtCost: number;
    customerDeposits: number;
    vendorPrepayments: number;
    openingBalanceEquity: number;
    bankBalances: { name: string; balance: number }[];
    carriedForward: { code: string; name: string; balance: number }[];
  };
  openingEntry: { totalDebit: number; totalCredit: number; lines: OpeningLine[] };
  trialBalance: {
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
    rows: { code: string; name: string; debit: number; credit: number }[];
  };
  balanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanced: boolean;
  };
  cashAccounts: { name: string; balance: number }[];
  reconciled: boolean;
  issues: string[];
};

// ── A minimal view of a ledger account used to build opening lines. `id` is null
//    only for a control account that does not exist yet (dry-run planning). ──
type AcctView = {
  id: Id<"accounts"> | null;
  name: string;
  code: string;
  normalSide: "debit" | "credit";
};

type PlanLine = {
  accountId: Id<"accounts"> | null;
  name: string;
  code: string;
  debit: number;
  credit: number;
  description: string;
};

type ControlEntry = { view: AcctView; amount: number; description: string };

function viewOfDoc(a: Doc<"accounts">): AcctView {
  return { id: a._id, name: a.name, code: a.code, normalSide: a.normalSide };
}

function carryDescription(type: string): string {
  return type === "bank"
    ? "Opening cash/bank balance"
    : "Opening balance carried forward";
}

/**
 * Build the balanced opening-entry plan.
 *
 * - Each recomputed control account is posted at its recomputed amount.
 * - EVERY other account with a non-zero stored balance is carried forward at its
 *   real balance (debit if debit-normal, credit if credit-normal).
 * - Opening Balance Equity absorbs the balancing difference.
 *
 * `includedIds` is the set of account ids that received a line, used afterwards
 * to assert nothing was dropped.
 */
function buildOpeningPlan(params: {
  snapshot: Doc<"accounts">[];
  controls: ControlEntry[];
  obe: AcctView;
}): {
  lines: PlanLine[];
  totalDebit: number;
  totalCredit: number;
  openingBalanceEquity: number;
  includedIds: Set<string>;
} {
  const controlIds = new Set(
    params.controls.map((c) => c.view.id).filter((id): id is Id<"accounts"> => id !== null),
  );
  const lines: PlanLine[] = [];
  const includedIds = new Set<string>();

  // 1. Recomputed control accounts at their recomputed values (not stored).
  for (const c of params.controls) {
    const amt = round2(c.amount);
    if (amt <= 0) continue;
    const line: PlanLine = {
      accountId: c.view.id,
      name: c.view.name,
      code: c.view.code,
      debit: c.view.normalSide === "debit" ? amt : 0,
      credit: c.view.normalSide === "credit" ? amt : 0,
      description: c.description,
    };
    lines.push(line);
    if (c.view.id) includedIds.add(c.view.id);
  }

  // 2. Every OTHER account carried forward at its REAL stored balance.
  for (const a of params.snapshot) {
    if (controlIds.has(a._id)) continue; // handled above with recomputed value
    if (params.obe.id && a._id === params.obe.id) continue; // OBE is the plug
    const bal = round2(a.balance ?? 0);
    if (bal === 0) continue;
    // Positive balance sits on the account's normal side; negative flips it.
    const onNormalSide = bal > 0;
    const magnitude = Math.abs(bal);
    const putOnDebit =
      a.normalSide === "debit" ? onNormalSide : !onNormalSide;
    lines.push({
      accountId: a._id,
      name: a.name,
      code: a.code,
      debit: putOnDebit ? magnitude : 0,
      credit: putOnDebit ? 0 : magnitude,
      description: carryDescription(a.type),
    });
    includedIds.add(a._id);
  }

  // 3. Balancing plug → Opening Balance Equity.
  const preDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const preCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const openingBalanceEquity = round2(preDebit - preCredit);
  if (openingBalanceEquity !== 0) {
    lines.push({
      accountId: params.obe.id,
      name: params.obe.name,
      code: params.obe.code,
      // Excess debit → credit OBE; excess credit → debit OBE.
      debit: openingBalanceEquity < 0 ? -openingBalanceEquity : 0,
      credit: openingBalanceEquity > 0 ? openingBalanceEquity : 0,
      description: "Opening balance equity",
    });
    if (params.obe.id) includedIds.add(params.obe.id);
  }

  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));

  return { lines, totalDebit, totalCredit, openingBalanceEquity, includedIds };
}

export const run = internalMutation({
  args: {
    // Date the opening snapshot is booked as of. Existing data is dated
    // 2026-08-01, so that is the default.
    cutoverDate: v.optional(v.string()),
    // When true, compute and return the plan WITHOUT writing anything.
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ReconcileReport> => {
    const cutoverDate = args.cutoverDate ?? "2026-08-01";
    const dryRun = args.dryRun ?? false;
    const issues: string[] = [];

    // ── Attribute the entry to the owner (internal mutations have no auth) ──
    const users = await ctx.db.query("users").collect();
    const owner = users.find((u) => u.role === "owner") ?? users[0];
    if (!owner) {
      throw new ConvexError({ message: "No user found to attribute the opening entry to", code: "NOT_FOUND" });
    }

    // ── Idempotency guard: never post opening balances twice ──
    const allEntries = await ctx.db.query("journalEntries").collect();
    const existingOpening = allEntries.find(
      (e) => e.sourceType === OPENING_BALANCES_SOURCE && e.status === "posted",
    );
    if (existingOpening && !dryRun) {
      throw new ConvexError({
        message: `Opening balances already posted (${existingOpening.entryNumber}). Refusing to run twice.`,
        code: "CONFLICT",
      });
    }

    // ── 1. Capture real cash / bank balances (for verification + report) ──
    const accounts = await ctx.db.query("accounts").collect();
    const bankAccounts = accounts.filter((a) => a.type === "bank" && a.isActive);
    const bankBalances = bankAccounts.map((a) => ({
      id: a._id,
      name: a.name,
      balance: round2(a.balance ?? 0),
    }));

    // ── 2. Accounts Receivable = outstanding non-draft, non-void invoices ──
    const invoices = await ctx.db.query("invoices").collect();
    const arOutstanding = round2(
      invoices
        .filter((i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft")
        .reduce((s, i) => s + (i.totalAmount - i.amountPaid), 0),
    );

    // ── 3. Accounts Payable = outstanding bills (status "paid" excluded) ──
    const bills = await ctx.db.query("bills").collect();
    const apOutstanding = round2(
      bills
        .filter((b) => b.status !== "paid")
        .reduce((s, b) => s + (b.amount - (b.amountPaid ?? 0)), 0),
    );

    // ── 4. Inventory valued at cost (weighted-avg receipts, fallback costPrice) ──
    const products = await ctx.db
      .query("products")
      .withIndex("by_type", (q) => q.eq("type", "product"))
      .collect();
    let inventoryAtCost = 0;
    for (const p of products) {
      if (!p.isActive) continue;
      const invRecords = await ctx.db
        .query("inventory")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .collect();
      const qty = invRecords.reduce((s, r) => s + r.quantity, 0);
      if (qty <= 0) continue;
      const movements = await ctx.db
        .query("stockMovements")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .collect();
      const ins = movements.filter((m) => m.type === "in" && m.costPerUnit && m.costPerUnit > 0);
      let unitCost = p.costPrice ?? 0;
      if (ins.length > 0) {
        const tc = ins.reduce((s, m) => s + m.costPerUnit! * m.quantity, 0);
        const tq = ins.reduce((s, m) => s + m.quantity, 0);
        if (tq > 0) unitCost = tc / tq;
      }
      inventoryAtCost += unitCost * qty;
    }
    inventoryAtCost = round2(inventoryAtCost);

    // ── 5. Outstanding advances → deposits (liability) & prepayments (asset) ──
    const advances = await ctx.db.query("advancePayments").collect();
    const openAdvances = advances.filter(
      (a) => a.status === "pending" || a.status === "partially_settled",
    );
    const customerDeposits = round2(
      openAdvances
        .filter((a) => a.direction === "customer")
        .reduce((s, a) => s + (a.amount - a.settledAmount), 0),
    );
    const vendorPrepayments = round2(
      openAdvances
        .filter((a) => a.direction === "vendor")
        .reduce((s, a) => s + (a.amount - a.settledAmount), 0),
    );

    // ─────────────────────────────────────────────────────────────────────
    // DRY RUN: compute the exact plan read-only (never create/patch anything).
    // ─────────────────────────────────────────────────────────────────────
    if (dryRun) {
      // Resolve control accounts read-only; synthesize a view when missing.
      const arAcc = await findAccount(ctx, { type: "accounts_receivable", code: "1100", name: "Accounts Receivable", subType: "Trade Receivables", matchAnyOfType: true });
      const apAcc = await findAccount(ctx, { type: "accounts_payable", code: "2000", name: "Accounts Payable", subType: "Trade Payables", matchAnyOfType: true });
      const invAcc = await findAccount(ctx, { type: "other_current_asset", code: "1200", name: "Inventory", subType: "Inventory", matchSubType: "Inventory" });
      const custDepAcc = await findAccount(ctx, { type: "other_current_liability", code: "2400", name: "Customer Deposits", subType: "Customer Deposits", matchSubType: "Customer Deposits" });
      const vpAcc = await findAccount(ctx, { type: "other_current_asset", code: "1350", name: "Vendor Prepayments", subType: "Vendor Prepaid", matchSubType: "Vendor Prepaid" });
      const obeAcc = await findAccount(ctx, { type: "equity", code: "3900", name: "Opening Balance Equity", subType: "Opening Balance Equity", matchSubType: "Opening Balance" });

      const controls: ControlEntry[] = [
        { view: arAcc ? viewOfDoc(arAcc) : { id: null, name: "Accounts Receivable", code: "1100", normalSide: NORMAL_SIDES["accounts_receivable"] }, amount: arOutstanding, description: "Outstanding customer invoices" },
        { view: apAcc ? viewOfDoc(apAcc) : { id: null, name: "Accounts Payable", code: "2000", normalSide: NORMAL_SIDES["accounts_payable"] }, amount: apOutstanding, description: "Outstanding vendor bills" },
        { view: invAcc ? viewOfDoc(invAcc) : { id: null, name: "Inventory", code: "1200", normalSide: NORMAL_SIDES["other_current_asset"] }, amount: inventoryAtCost, description: "Opening inventory at cost" },
        { view: custDepAcc ? viewOfDoc(custDepAcc) : { id: null, name: "Customer Deposits", code: "2400", normalSide: NORMAL_SIDES["other_current_liability"] }, amount: customerDeposits, description: "Outstanding customer advances" },
        { view: vpAcc ? viewOfDoc(vpAcc) : { id: null, name: "Vendor Prepayments", code: "1350", normalSide: NORMAL_SIDES["other_current_asset"] }, amount: vendorPrepayments, description: "Outstanding vendor prepayments" },
      ];
      const obeView: AcctView = obeAcc
        ? viewOfDoc(obeAcc)
        : { id: null, name: "Opening Balance Equity", code: "3900", normalSide: "credit" };

      const plan = buildOpeningPlan({ snapshot: accounts, controls, obe: obeView });

      const controlIds = new Set(
        [arAcc, apAcc, invAcc, custDepAcc, vpAcc]
          .filter((a): a is Doc<"accounts"> => Boolean(a))
          .map((a) => a._id),
      );
      const carriedForward = accounts
        .filter((a) => round2(a.balance ?? 0) !== 0 && !controlIds.has(a._id) && a._id !== obeAcc?._id)
        .map((a) => ({ code: a.code, name: a.name, balance: round2(a.balance ?? 0) }))
        .sort((x, y) => x.code.localeCompare(y.code));

      return {
        cutoverDate,
        dryRun,
        ghostRowsCleaned: 0,
        priorEntriesVoided: 0,
        computed: {
          arOutstanding,
          apOutstanding,
          inventoryAtCost,
          customerDeposits,
          vendorPrepayments,
          openingBalanceEquity: plan.openingBalanceEquity,
          bankBalances: bankBalances.map((b) => ({ name: b.name, balance: b.balance })),
          carriedForward,
        },
        openingEntry: {
          totalDebit: plan.totalDebit,
          totalCredit: plan.totalCredit,
          lines: plan.lines.map((l) => ({ account: l.name, code: l.code, debit: round2(l.debit), credit: round2(l.credit) })),
        },
        trialBalance: { totalDebit: 0, totalCredit: 0, balanced: false, rows: [] },
        balanceSheet: { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, balanced: false },
        cashAccounts: bankBalances
          .filter((b) => b.balance !== 0)
          .map((b) => ({ name: b.name, balance: b.balance })),
        reconciled: false,
        issues: ["Dry run — no changes written."],
      };
    }

    // ─────────────────────────────────────────────────────────────────────
    // LIVE RUN
    // ─────────────────────────────────────────────────────────────────────
    const control = await getControlAccounts(ctx);

    // ── 6. Clean confirmed ghost bank-register rows (zero-amount orphans) ──
    let ghostRowsCleaned = 0;
    const allBankTxns = await ctx.db.query("bankTransactions").collect();
    for (const t of allBankTxns) {
      if (t.amount === 0 && (t.description ?? "").toUpperCase().includes("DELETED_ORPHAN")) {
        await ctx.db.delete(t._id);
        ghostRowsCleaned++;
      }
    }

    // ── 7. Void pre-cutover journal entries (kept for audit, not deleted) ──
    // Their cash effect is already reflected in the balances we are keeping, so
    // leaving them posted would double-count in dated ("as of") reports.
    let priorEntriesVoided = 0;
    for (const e of allEntries) {
      if (e.status === "posted" && e.sourceType !== OPENING_BALANCES_SOURCE) {
        await ctx.db.patch(e._id, { status: "void" });
        priorEntriesVoided++;
      }
    }

    // ── 8. SNAPSHOT every account's balance BEFORE zeroing, then zero. ──
    const freshAccounts = await ctx.db.query("accounts").collect();
    // Deep copy the fields the plan needs so later patches don't mutate the snapshot.
    const snapshot: Doc<"accounts">[] = freshAccounts.map((a) => ({ ...a }));
    for (const a of freshAccounts) {
      if ((a.balance ?? 0) !== 0) {
        await ctx.db.patch(a._id, { balance: 0 });
      }
    }

    // ── Build the balanced opening plan (carries EVERY non-zero account) ──
    const controls: ControlEntry[] = [
      { view: viewOfDoc(control.ar), amount: arOutstanding, description: "Outstanding customer invoices" },
      { view: viewOfDoc(control.ap), amount: apOutstanding, description: "Outstanding vendor bills" },
      { view: viewOfDoc(control.inventory), amount: inventoryAtCost, description: "Opening inventory at cost" },
      { view: viewOfDoc(control.customerDeposits), amount: customerDeposits, description: "Outstanding customer advances" },
      { view: viewOfDoc(control.vendorPrepaid), amount: vendorPrepayments, description: "Outstanding vendor prepayments" },
    ];
    const obeView = viewOfDoc(control.openingBalanceEquity);
    const plan = buildOpeningPlan({ snapshot, controls, obe: obeView });

    // The recomputed control accounts + OBE are intentionally NOT required to be
    // carried at their stored balance (they are recomputed / act as the plug).
    const controlIds = new Set<string>([
      control.ar._id,
      control.ap._id,
      control.inventory._id,
      control.customerDeposits._id,
      control.vendorPrepaid._id,
    ]);
    const obeId = control.openingBalanceEquity._id;

    // ── ASSERT nothing was dropped: every previously non-zero account (other
    //    than the recomputed controls / OBE) MUST appear in the opening entry. ──
    for (const s of snapshot) {
      if (round2(s.balance ?? 0) === 0) continue;
      if (controlIds.has(s._id)) continue;
      if (s._id === obeId) continue;
      if (!plan.includedIds.has(s._id)) {
        issues.push(
          `Account "${s.name}" (${s.code}) had balance ${round2(s.balance ?? 0)} before cutover but is missing from the opening entry — refusing to drop it.`,
        );
      }
    }
    if (issues.length > 0) {
      throw new ConvexError({
        message: `Opening balances would drop account balances. Rolled back. Issues: ${issues.join(" ")}`,
        code: "BAD_REQUEST",
      });
    }

    // ── Post the opening entry. Every line has a real account id in the live path. ──
    const postLines: { accountId: Id<"accounts">; debit?: number; credit?: number; description?: string }[] = [];
    for (const l of plan.lines) {
      if (l.accountId === null) {
        throw new ConvexError({
          message: `Internal error: opening line for "${l.name}" (${l.code}) has no account id`,
          code: "BAD_REQUEST",
        });
      }
      postLines.push({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description });
    }

    await postBalancedEntry(ctx, {
      date: cutoverDate,
      description: "Opening Balances",
      reference: "OPENING",
      notes: "One-time cutover snapshot. Going forward all transactions post through the normal ledger.",
      createdBy: owner._id,
      sourceType: OPENING_BALANCES_SOURCE,
      sourceId: "cutover",
      lines: postLines,
    });

    // ── 9. Verify the books reconcile (else throw → full rollback) ──
    // Sum ALL accounts (active AND inactive): a correct double-entry set balances
    // across every account, and carried-forward inactive balances must count too.
    const finalAccounts = await ctx.db.query("accounts").collect();
    const accById: Record<string, Doc<"accounts">> = {};
    for (const a of finalAccounts) accById[a._id] = a;

    let tbDebit = 0;
    let tbCredit = 0;
    const tbRows: { code: string; name: string; debit: number; credit: number }[] = [];
    for (const a of finalAccounts) {
      const bal = round2(a.balance ?? 0);
      const debit = a.normalSide === "debit" ? Math.max(0, bal) : Math.max(0, -bal);
      const credit = a.normalSide === "credit" ? Math.max(0, bal) : Math.max(0, -bal);
      tbDebit += debit;
      tbCredit += credit;
      if (bal !== 0) tbRows.push({ code: a.code, name: a.name, debit, credit });
    }
    tbDebit = round2(tbDebit);
    tbCredit = round2(tbCredit);
    const tbBalanced = Math.abs(tbDebit - tbCredit) < 0.01;
    tbRows.sort((x, y) => x.code.localeCompare(y.code));

    const totalAssets = round2(
      finalAccounts.filter((a) => ASSET_TYPES.includes(a.type)).reduce((s, a) => s + (a.balance ?? 0), 0),
    );
    const totalLiabilities = round2(
      finalAccounts.filter((a) => LIABILITY_TYPES.includes(a.type)).reduce((s, a) => s + (a.balance ?? 0), 0),
    );
    const totalEquity = round2(
      finalAccounts.filter((a) => EQUITY_TYPES.includes(a.type)).reduce((s, a) => s + (a.balance ?? 0), 0),
    );
    const bsBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;

    if (!tbBalanced) {
      issues.push(`Trial balance does not net to zero: debits ${tbDebit} vs credits ${tbCredit}.`);
    }
    if (!bsBalanced) {
      issues.push(`Balance sheet does not balance: assets ${totalAssets} vs liabilities+equity ${round2(totalLiabilities + totalEquity)}.`);
    }
    // Cash accounts must still match the real balances we captured.
    for (const b of bankBalances) {
      const now = round2(accById[b.id]?.balance ?? 0);
      if (Math.abs(now - b.balance) > 0.01) {
        issues.push(`Cash account "${b.name}" changed from ${b.balance} to ${now}.`);
      }
    }

    if (issues.length > 0) {
      // Transactional rollback — nothing is committed.
      throw new ConvexError({
        message: `Opening balances did not reconcile. Rolled back. Issues: ${issues.join(" ")}`,
        code: "BAD_REQUEST",
      });
    }

    const cashAccounts = bankAccounts.map((a) => ({
      name: a.name,
      balance: round2(accById[a._id]?.balance ?? 0),
    }));

    // Accounts carried forward at their real stored balance (everything that was
    // non-zero and is neither a recomputed control nor OBE).
    const carriedForward = snapshot
      .filter((a) => round2(a.balance ?? 0) !== 0 && !controlIds.has(a._id) && a._id !== obeId)
      .map((a) => ({ code: a.code, name: a.name, balance: round2(a.balance ?? 0) }))
      .sort((x, y) => x.code.localeCompare(y.code));

    return {
      cutoverDate,
      dryRun,
      ghostRowsCleaned,
      priorEntriesVoided,
      computed: {
        arOutstanding,
        apOutstanding,
        inventoryAtCost,
        customerDeposits,
        vendorPrepayments,
        openingBalanceEquity: plan.openingBalanceEquity,
        bankBalances: bankBalances.map((b) => ({ name: b.name, balance: b.balance })),
        carriedForward,
      },
      openingEntry: {
        totalDebit: plan.totalDebit,
        totalCredit: plan.totalCredit,
        lines: plan.lines.map((l) => ({
          account: l.name,
          code: l.code,
          debit: round2(l.debit),
          credit: round2(l.credit),
        })),
      },
      trialBalance: { totalDebit: tbDebit, totalCredit: tbCredit, balanced: tbBalanced, rows: tbRows },
      balanceSheet: { totalAssets, totalLiabilities, totalEquity, balanced: bsBalanced },
      cashAccounts,
      reconciled: true,
      issues,
    };
  },
});
