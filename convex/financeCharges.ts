import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  return identity;
}

async function requireUser(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const settings = await ctx.db.query("financeChargeSettings").first();
    return settings;
  },
});

export const saveSettings = mutation({
  args: {
    chargeMethod: v.union(v.literal("percentage"), v.literal("flat")),
    percentageRate: v.optional(v.number()),
    flatFee: v.optional(v.number()),
    period: v.union(v.literal("monthly"), v.literal("daily")),
    gracePeriodDays: v.number(),
    minimumBalance: v.number(),
    compounding: v.boolean(),
    currency: v.string(),
    autoAssess: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db.query("financeChargeSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedBy: user._id });
    } else {
      await ctx.db.insert("financeChargeSettings", { ...args, updatedBy: user._id });
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "financeCharges:saveSettings",
      resourceType: "financeChargeSettings",
      resourceId: existing?._id ?? "new",
      action: "finance_charge_settings_saved",
      afterValue: JSON.stringify(args),
      details: `Finance charge settings ${existing ? "updated" : "created"}`,
    });
  },
});

// ─── Overdue Invoices Preview ────────────────────────────────────────────────

export const getOverdueInvoices = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const today = new Date().toISOString().slice(0, 10);
    const settings = await ctx.db.query("financeChargeSettings").first();
    const graceDays = settings?.gracePeriodDays ?? 0;
    const minimumBalance = settings?.minimumBalance ?? 0;

    // Get overdue and partially_paid invoices
    const overdueInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "overdue"))
      .collect();

    const partiallyPaid = await ctx.db
      .query("invoices")
      .withIndex("by_status", (q) => q.eq("status", "partially_paid"))
      .collect();

    const allOverdue = [...overdueInvoices, ...partiallyPaid].filter((inv) => {
      const dueDate = new Date(inv.dueDate);
      const diffMs = new Date(today).getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const balance = inv.totalAmount - inv.amountPaid;
      return daysOverdue > graceDays && balance >= minimumBalance;
    });

    // Fetch customer names
    const customerIds = [...new Set(allOverdue.map((inv) => inv.customerId))];
    const customerMap = new Map<string, string>();
    for (const cId of customerIds) {
      const c = await ctx.db.get(cId);
      if (c) customerMap.set(cId, c.name);
    }

    return allOverdue.map((inv) => {
      const dueDate = new Date(inv.dueDate);
      const diffMs = new Date(today).getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const overdueAmount = inv.totalAmount - inv.amountPaid;

      // Calculate charge
      let chargeAmount = 0;
      if (settings) {
        if (settings.chargeMethod === "percentage") {
          const rate = settings.percentageRate ?? 0;
          if (settings.period === "monthly") {
            const months = daysOverdue / 30;
            chargeAmount = overdueAmount * (rate / 100) * months;
          } else {
            chargeAmount = overdueAmount * (rate / 100) * daysOverdue;
          }
        } else {
          chargeAmount = settings.flatFee ?? 0;
        }
      }

      return {
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: customerMap.get(inv.customerId) ?? "Unknown",
        dueDate: inv.dueDate,
        daysOverdue,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        overdueAmount,
        calculatedCharge: Math.round(chargeAmount * 100) / 100,
        currency: inv.currency ?? settings?.currency ?? "QAR",
      };
    });
  },
});

// ─── Assess Finance Charges ──────────────────────────────────────────────────

export const assessCharge = mutation({
  args: {
    invoiceId: v.id("invoices"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const settings = await ctx.db.query("financeChargeSettings").first();
    if (!settings) throw new ConvexError({ message: "Finance charge settings not configured", code: "BAD_REQUEST" });

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(invoice.dueDate);
    const diffMs = new Date(today).getTime() - dueDate.getTime();
    const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const overdueAmount = invoice.totalAmount - invoice.amountPaid;

    if (daysOverdue <= settings.gracePeriodDays) {
      throw new ConvexError({ message: "Invoice is within grace period", code: "BAD_REQUEST" });
    }
    if (overdueAmount < settings.minimumBalance) {
      throw new ConvexError({ message: "Balance below minimum threshold", code: "BAD_REQUEST" });
    }

    // Calculate charge amount
    let chargeAmount = 0;
    if (settings.chargeMethod === "percentage") {
      const rate = settings.percentageRate ?? 0;
      if (settings.period === "monthly") {
        const months = daysOverdue / 30;
        chargeAmount = overdueAmount * (rate / 100) * months;
      } else {
        chargeAmount = overdueAmount * (rate / 100) * daysOverdue;
      }
    } else {
      chargeAmount = settings.flatFee ?? 0;
    }

    chargeAmount = Math.round(chargeAmount * 100) / 100;

    const chargeId = await ctx.db.insert("financeCharges", {
      invoiceId: args.invoiceId,
      customerId: invoice.customerId,
      chargeDate: today,
      daysOverdue,
      overdueAmount,
      chargeMethod: settings.chargeMethod,
      rate: settings.percentageRate,
      flatFee: settings.flatFee,
      chargeAmount,
      currency: invoice.currency ?? settings.currency,
      status: "assessed",
      notes: args.notes,
      assessedBy: user._id,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "financeCharges:assessCharge",
      resourceType: "financeCharge",
      resourceId: chargeId,
      action: "finance_charge_created",
      afterValue: JSON.stringify({ chargeAmount, invoiceId: args.invoiceId, daysOverdue }),
      details: `Assessed finance charge of ${chargeAmount} on invoice ${invoice.invoiceNumber ?? args.invoiceId}`,
    });

    return chargeAmount;
  },
});

export const batchAssess = mutation({
  args: {
    invoiceIds: v.array(v.id("invoices")),
  },
  handler: async (ctx, args): Promise<{ assessed: number; totalAmount: number }> => {
    const user = await requireUser(ctx);

    const settings = await ctx.db.query("financeChargeSettings").first();
    if (!settings) throw new ConvexError({ message: "Finance charge settings not configured", code: "BAD_REQUEST" });

    const today = new Date().toISOString().slice(0, 10);
    let assessed = 0;
    let totalAmount = 0;

    for (const invoiceId of args.invoiceIds) {
      const invoice = await ctx.db.get(invoiceId);
      if (!invoice) continue;

      const dueDate = new Date(invoice.dueDate);
      const diffMs = new Date(today).getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const overdueAmount = invoice.totalAmount - invoice.amountPaid;

      if (daysOverdue <= settings.gracePeriodDays || overdueAmount < settings.minimumBalance) {
        continue;
      }

      let chargeAmount = 0;
      if (settings.chargeMethod === "percentage") {
        const rate = settings.percentageRate ?? 0;
        if (settings.period === "monthly") {
          const months = daysOverdue / 30;
          chargeAmount = overdueAmount * (rate / 100) * months;
        } else {
          chargeAmount = overdueAmount * (rate / 100) * daysOverdue;
        }
      } else {
        chargeAmount = settings.flatFee ?? 0;
      }
      chargeAmount = Math.round(chargeAmount * 100) / 100;

      await ctx.db.insert("financeCharges", {
        invoiceId,
        customerId: invoice.customerId,
        chargeDate: today,
        daysOverdue,
        overdueAmount,
        chargeMethod: settings.chargeMethod,
        rate: settings.percentageRate,
        flatFee: settings.flatFee,
        chargeAmount,
        currency: invoice.currency ?? settings.currency,
        status: "assessed",
        assessedBy: user._id,
      });

      assessed++;
      totalAmount += chargeAmount;
    }

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "financeCharges:batchAssess",
      resourceType: "financeCharge",
      resourceId: "batch",
      action: "finance_charges_batch_assessed",
      details: `Batch assessed ${assessed} finance charges totaling ${Math.round(totalAmount * 100) / 100}`,
    });

    return { assessed, totalAmount: Math.round(totalAmount * 100) / 100 };
  },
});

// ─── List Charges ────────────────────────────────────────────────────────────

export const listCharges = query({
  args: { status: v.optional(v.union(v.literal("assessed"), v.literal("paid"), v.literal("waived"), v.literal("void"))) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let charges;
    if (args.status) {
      charges = await ctx.db
        .query("financeCharges")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      charges = await ctx.db.query("financeCharges").collect();
    }

    // Enrich with customer name and invoice number
    const enriched = await Promise.all(
      charges.map(async (charge) => {
        const customer = await ctx.db.get(charge.customerId);
        const invoice = await ctx.db.get(charge.invoiceId);
        return {
          ...charge,
          customerName: customer?.name ?? "Unknown",
          invoiceNumber: invoice?.invoiceNumber ?? "—",
        };
      })
    );

    return enriched.sort((a, b) => b.chargeDate.localeCompare(a.chargeDate));
  },
});

export const getChargeSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const charges = await ctx.db.query("financeCharges").collect();

    const assessed = charges.filter((c) => c.status === "assessed");
    const paid = charges.filter((c) => c.status === "paid");
    const waived = charges.filter((c) => c.status === "waived");

    return {
      totalAssessed: assessed.reduce((sum, c) => sum + c.chargeAmount, 0),
      totalPaid: paid.reduce((sum, c) => sum + c.chargeAmount, 0),
      totalWaived: waived.reduce((sum, c) => sum + c.chargeAmount, 0),
      countAssessed: assessed.length,
      countPaid: paid.length,
      countWaived: waived.length,
      totalCharges: charges.length,
    };
  },
});

// ─── Update Charge Status ────────────────────────────────────────────────────

export const updateChargeStatus = mutation({
  args: {
    chargeId: v.id("financeCharges"),
    status: v.union(v.literal("paid"), v.literal("waived"), v.literal("void")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const charge = await ctx.db.get(args.chargeId);
    if (!charge) throw new ConvexError({ message: "Finance charge not found", code: "NOT_FOUND" });

    const beforeValue = JSON.stringify(charge);
    await ctx.db.patch(args.chargeId, {
      status: args.status,
      notes: args.notes ?? charge.notes,
    });

    const action = args.status === "void"
      ? "finance_charge_voided"
      : args.status === "waived"
        ? "finance_charge_waived"
        : "finance_charge_paid";

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "financeCharges:updateChargeStatus",
      resourceType: "financeCharge",
      resourceId: args.chargeId,
      action,
      beforeValue,
      afterValue: JSON.stringify({ ...charge, status: args.status }),
      reason: args.status === "void" ? (args.notes ?? undefined) : undefined,
      details: `Finance charge status changed to ${args.status}`,
    });
  },
});

export const getChargesByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const charges = await ctx.db
      .query("financeCharges")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    const enriched = await Promise.all(
      charges.map(async (charge) => {
        const invoice = await ctx.db.get(charge.invoiceId);
        return {
          ...charge,
          invoiceNumber: invoice?.invoiceNumber ?? "—",
        };
      })
    );

    return enriched.sort((a, b) => b.chargeDate.localeCompare(a.chargeDate));
  },
});
