import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { enforcePostingDate } from "./closingDate.ts";
import { maxNumber, nextNumber } from "./lib/docNumber.ts";
import { logAudit } from "./lib/audit.ts";
import { getCurrentUser } from "./lib/auth.ts";
import { postInvoiceIssuance } from "./invoicing.ts";
import { assertCustomerCanBeInvoiced } from "./lib/creditControl.ts";

// ─── Helpers ─────────────────────────────────────────────────

async function requireAuth(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

async function getUser(ctx: MutationCtx | QueryCtx, tokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Batch Invoicing ─────────────────────────────────────────

export const batchCreateInvoices = mutation({
  args: {
    invoices: v.array(
      v.object({
        customerId: v.id("customers"),
        date: v.string(),
        dueDate: v.string(),
        saleType: v.union(v.literal("cash"), v.literal("credit")),
        creditTerms: v.optional(
          v.union(
            v.literal("net_15"),
            v.literal("net_30"),
            v.literal("net_60"),
            v.literal("net_90"),
          ),
        ),
        items: v.array(
          v.object({
            productId: v.optional(v.id("products")),
            description: v.string(),
            quantity: v.number(),
            unitPrice: v.number(),
          }),
        ),
        taxRate: v.optional(v.number()),
        discount: v.optional(v.number()),
        currency: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ created: number; invoiceIds: Id<"invoices">[]; errors: string[] }> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    const invoiceIds: Id<"invoices">[] = [];
    const errors: string[] = [];

    // Derive the next sequence from the highest existing number
    const allInvoices = await ctx.db.query("invoices").collect();
    let nextSeq = maxNumber(allInvoices, (i) => i.invoiceNumber) + 1;

    for (let i = 0; i < args.invoices.length; i++) {
      const inv = args.invoices[i];
      try {
        // Enforce global closing date
        await enforcePostingDate(ctx, inv.date);

        // Validate customer
        const customer = await ctx.db.get(inv.customerId);
        if (!customer) {
          errors.push(`Invoice ${i + 1}: Customer not found`);
          continue;
        }

        if (inv.items.length === 0) {
          errors.push(`Invoice ${i + 1}: Must have at least one item`);
          continue;
        }

        // EARLY WARNING GATE — same role as in createInvoice.
        if (inv.saleType === "credit") {
          const sub = inv.items.reduce((s, item) => s + item.quantity * item.unitPrice, 0);
          const disc = inv.discount ?? 0;
          const afterDisc = sub - disc;
          const tax = Math.round(afterDisc * ((inv.taxRate ?? 0) / 100) * 100) / 100;
          const estimated = Math.round((afterDisc + tax) * 100) / 100;
          await assertCustomerCanBeInvoiced(ctx, inv.customerId, estimated);
        }

        const invoiceNumber = `INV-${String(nextSeq).padStart(5, "0")}`;
        nextSeq++;

        // Calculate totals
        const subtotal = inv.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const discountAmount = inv.discount ?? 0;
        const afterDiscount = subtotal - discountAmount;
        const taxRate = inv.taxRate ?? 0;
        const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
        const totalAmount = Math.round((afterDiscount + taxAmount) * 100) / 100;

        const isCash = inv.saleType === "cash";
        const status = isCash ? ("paid" as const) : ("draft" as const);
        const amountPaid = isCash ? totalAmount : 0;

        const invoiceId = await ctx.db.insert("invoices", {
          invoiceNumber,
          customerId: inv.customerId,
          date: inv.date,
          dueDate: inv.dueDate,
          status,
          saleType: inv.saleType,
          creditTerms: inv.creditTerms,
          subtotal: Math.round(subtotal * 100) / 100,
          taxRate: inv.taxRate,
          taxAmount,
          discount: inv.discount,
          totalAmount,
          amountPaid,
          currency: inv.currency,
          notes: inv.notes,
          createdBy: user._id,
        });

        for (const item of inv.items) {
          await ctx.db.insert("invoiceItems", {
            invoiceId,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
          });
        }

        invoiceIds.push(invoiceId);
      } catch (e) {
        const msg =
          e instanceof ConvexError ? (e.data as { message: string }).message : "Unknown error";
        errors.push(`Invoice ${i + 1}: ${msg}`);
      }
    }

    return { created: invoiceIds.length, invoiceIds, errors };
  },
});

// ─── Batch Payments ──────────────────────────────────────────

export const batchRecordPayments = mutation({
  args: {
    payments: v.array(
      v.object({
        invoiceId: v.id("invoices"),
        date: v.string(),
        amount: v.number(),
        method: v.union(
          v.literal("cash"),
          v.literal("credit_card"),
          v.literal("debit_card"),
          v.literal("bank_transfer"),
          v.literal("cheque"),
          v.literal("paypal"),
          v.literal("mobile_pay"),
          v.literal("store_credit"),
          v.literal("other"),
        ),
        reference: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ recorded: number; paymentIds: Id<"payments">[]; errors: string[] }> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    const paymentIds: Id<"payments">[] = [];
    const errors: string[] = [];

    for (let i = 0; i < args.payments.length; i++) {
      const pmt = args.payments[i];
      try {
        await enforcePostingDate(ctx, pmt.date);

        const invoice = await ctx.db.get(pmt.invoiceId);
        if (!invoice) {
          errors.push(`Payment ${i + 1}: Invoice not found`);
          continue;
        }

        if (invoice.status === "void") {
          errors.push(`Payment ${i + 1}: Cannot pay a voided invoice`);
          continue;
        }

        if (pmt.amount <= 0) {
          errors.push(`Payment ${i + 1}: Amount must be positive`);
          continue;
        }

        const remaining = invoice.totalAmount - invoice.amountPaid;
        const payAmount = Math.min(pmt.amount, remaining);

        if (payAmount <= 0) {
          errors.push(`Payment ${i + 1}: Invoice already fully paid`);
          continue;
        }

        const paymentId = await ctx.db.insert("payments", {
          invoiceId: pmt.invoiceId,
          date: pmt.date,
          amount: payAmount,
          method: pmt.method,
          reference: pmt.reference,
          notes: pmt.notes,
          recordedBy: user._id,
        });

        // Update invoice
        const newAmountPaid = Math.round((invoice.amountPaid + payAmount) * 100) / 100;
        const newStatus =
          newAmountPaid >= invoice.totalAmount ? ("paid" as const) : ("partially_paid" as const);
        await ctx.db.patch(invoice._id, { amountPaid: newAmountPaid, status: newStatus });

        paymentIds.push(paymentId);
      } catch (e) {
        const msg =
          e instanceof ConvexError ? (e.data as { message: string }).message : "Unknown error";
        errors.push(`Payment ${i + 1}: ${msg}`);
      }
    }

    return { recorded: paymentIds.length, paymentIds, errors };
  },
});

// ─── Batch Status Updates ────────────────────────────────────
//
// batchUpdateInvoiceStatus changes the status of multiple invoices in one
// mutation. For credit invoices transitioning out of draft, it calls
// postInvoiceIssuance to recognise AR/Revenue — the same call that
// updateInvoiceStatus makes. Without this, batch-sent credit invoices would
// appear as "sent" in the invoice list but post nothing to the ledger,
// leaving the trial balance short.
//
// Atomicity: this mutation is a single Convex transaction. Per-item errors are
// caught and reported so the valid subset commits. An unexpected error escaping
// the loop rolls back every write. This guarantee applies to mutations only —
// it does NOT survive a refactor to an action or scheduled function, neither of
// which is transactional.

export const batchUpdateInvoiceStatus = mutation({
  args: {
    invoiceIds: v.array(v.id("invoices")),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.literal("partially_paid"),
      v.literal("overdue"),
      v.literal("void"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }> => {
    const user = await getCurrentUser(ctx);

    // Enforce the closing date once against the "today" anchor.
    // Individual invoice dates are checked below per item because they may
    // differ when updating historical invoices.
    const failed: Array<{ id: string; reason: string }> = [];
    let updated = 0;

    for (const id of args.invoiceIds) {
      try {
        const invoice = await ctx.db.get(id);
        if (!invoice) {
          failed.push({ id, reason: "Invoice not found" });
          continue;
        }

        // Enforce posting lock against the invoice's own date so that a batch
        // that mixes dates cannot slip a locked-period invoice through.
        await enforcePostingDate(ctx, invoice.date);

        const prevStatus = invoice.status;
        // PRIMARY ENFORCEMENT GATE: same as in updateInvoiceStatus — this is
        // where A/R is born for credit invoices leaving draft.
        if (
          invoice.saleType === "credit" &&
          prevStatus === "draft" &&
          args.status !== "draft" &&
          args.status !== "void"
        ) {
          await assertCustomerCanBeInvoiced(
            ctx,
            invoice.customerId,
            invoice.totalAmount - invoice.amountPaid,
          );
        }

        await ctx.db.patch(id, { status: args.status });

        // For credit invoices leaving draft: recognise AR/Revenue/COGS.
        // postInvoiceIssuance is idempotent — repeated calls never double-post.
        // PRIMARY ENFORCEMENT POINT: this is where A/R is born for credit invoices.
        // The gate in createInvoice is early-warning only; this is the safety boundary.
        if (
          invoice.saleType === "credit" &&
          prevStatus === "draft" &&
          args.status !== "draft" &&
          args.status !== "void"
        ) {
          const updated_invoice = await ctx.db.get(id);
          if (updated_invoice) {
            await postInvoiceIssuance(ctx, updated_invoice, { createdBy: user._id });
          }
        }

        await logAudit(ctx, {
          userId: user._id,
          mutationName: "batch:batchUpdateInvoiceStatus",
          resourceType: "invoice",
          resourceId: id,
          action: "invoice_status_updated",
          beforeValue: JSON.stringify({ status: prevStatus }),
          afterValue: JSON.stringify({ status: args.status }),
          details: `Batch status update: ${invoice.invoiceNumber} → ${args.status}`,
        });

        updated++;
      } catch (e) {
        const reason =
          e instanceof ConvexError ? (e.data as { message: string }).message : "Unknown error";
        failed.push({ id, reason });
      }
    }

    return { updated, failed };
  },
});

// ─── Batch Deposits ──────────────────────────────────────────

export const batchDeposit = mutation({
  args: {
    accountId: v.id("accounts"),
    date: v.string(),
    paymentIds: v.array(v.id("payments")),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ depositId: Id<"batchDeposits">; totalAmount: number }> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    await enforcePostingDate(ctx, args.date);

    if (args.paymentIds.length === 0) {
      throw new ConvexError({ message: "Must select at least one payment", code: "BAD_REQUEST" });
    }

    const account = await ctx.db.get(args.accountId);
    if (!account) throw new ConvexError({ message: "Account not found", code: "NOT_FOUND" });
    if (!account.isActive)
      throw new ConvexError({ message: "Account is not active", code: "BAD_REQUEST" });

    // Calculate total and validate payments
    let totalAmount = 0;
    for (const paymentId of args.paymentIds) {
      const payment = await ctx.db.get(paymentId);
      if (!payment)
        throw new ConvexError({ message: `Payment ${paymentId} not found`, code: "NOT_FOUND" });
      totalAmount += payment.amount;
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    // Generate deposit number
    const allDeposits = await ctx.db.query("batchDeposits").collect();
    const depositNumber = nextNumber(allDeposits, (d) => d.depositNumber, "DEP-", 5);

    // Create deposit record. This groups already-recorded customer payments for
    // reconciliation; the cash/bank ledger balance was already posted when each
    // payment was recorded, so we do NOT post another balance change here to
    // avoid double-counting.
    const depositId = await ctx.db.insert("batchDeposits", {
      depositNumber,
      accountId: args.accountId,
      date: args.date,
      paymentIds: args.paymentIds,
      totalAmount,
      paymentCount: args.paymentIds.length,
      memo: args.memo,
      status: "completed",
      createdBy: user._id,
    });

    return { depositId, totalAmount };
  },
});

// ─── Queries ─────────────────────────────────────────────────

export const listBatchDeposits = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const deposits = await ctx.db.query("batchDeposits").order("desc").collect();

    const enriched = await Promise.all(
      deposits.map(async (dep) => {
        let accountName = "Unknown";
        if (dep.accountId) {
          const account = await ctx.db.get(dep.accountId);
          accountName = account?.name ?? "Unknown";
        }
        return { ...dep, bankAccountName: accountName };
      }),
    );
    return enriched;
  },
});

export const getUndepositedPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    // Get all payment IDs that have been deposited
    const allDeposits = await ctx.db.query("batchDeposits").collect();
    const depositedPaymentIds = new Set<string>();
    for (const dep of allDeposits) {
      for (const pid of dep.paymentIds) {
        depositedPaymentIds.add(pid);
      }
    }

    // Get all payments and filter out deposited ones
    const allPayments = await ctx.db.query("payments").order("desc").collect();
    const undeposited = allPayments.filter((p) => !depositedPaymentIds.has(p._id));

    // Enrich with invoice info
    const enriched = await Promise.all(
      undeposited.map(async (pmt) => {
        let invoiceNumber = "";
        let customerName = "";
        if (pmt.invoiceId) {
          const inv = await ctx.db.get(pmt.invoiceId);
          if (inv) {
            invoiceNumber = inv.invoiceNumber;
            const cust = await ctx.db.get(inv.customerId);
            customerName = cust?.name ?? "Unknown";
          }
        }
        return { ...pmt, invoiceNumber, customerName };
      }),
    );

    return enriched;
  },
});

export const getUnpaidInvoices = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);

    // Get invoices with outstanding balance
    const drafts = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "draft"))
      .collect();
    const sent = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "sent"))
      .collect();
    const partial = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "partially_paid"))
      .collect();
    const overdue = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "overdue"))
      .collect();

    const unpaid = [...drafts, ...sent, ...partial, ...overdue];

    const enriched = await Promise.all(
      unpaid.map(async (inv) => {
        const customer = await ctx.db.get(inv.customerId);
        return {
          ...inv,
          customerName: customer?.name ?? "Unknown",
          balance: Math.round((inv.totalAmount - inv.amountPaid) * 100) / 100,
        };
      }),
    );

    return enriched.sort((a, b) => b.balance - a.balance);
  },
});

export const listBankAccountsForSelect = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    // Unified: real bank/cash accounts live in the Chart of Accounts (type "bank").
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_type", (q) => q.eq("type", "bank"))
      .collect();
    return accounts
      .filter((a) => a.isActive)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        bankName: a.subType ?? "Bank",
        currency: undefined as string | undefined,
        currentBalance: a.balance,
      }));
  },
});
