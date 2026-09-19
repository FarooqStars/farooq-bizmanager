import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const ALERT_TYPES = [
  "overdue_invoice",
  "low_stock",
  "payment_received",
  "po_approval",
  "expense_claim_update",
  "lead_follow_up",
] as const;

type AlertType = typeof ALERT_TYPES[number];

async function requireAuth(ctx: QueryCtx | MutationCtx) {
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

// ─── Queries ─────────────────────────────────────────────────

export const getAlertSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const settings = await ctx.db.query("alertSettings").collect();
    return settings;
  },
});

export const getAlertLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const logs = await ctx.db
      .query("alertLog")
      .withIndex("by_sent_at")
      .order("desc")
      .take(args.limit ?? 50);
    return logs;
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const upsertAlertSetting = mutation({
  args: {
    type: v.union(
      v.literal("overdue_invoice"),
      v.literal("low_stock"),
      v.literal("payment_received"),
      v.literal("po_approval"),
      v.literal("expense_claim_update"),
      v.literal("lead_follow_up")
    ),
    isEnabled: v.boolean(),
    senderEmail: v.optional(v.string()),
    triggerDays: v.optional(v.array(v.number())),
    thresholdOverride: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db
      .query("alertSettings")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        senderEmail: args.senderEmail,
        triggerDays: args.triggerDays,
        thresholdOverride: args.thresholdOverride,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("alertSettings", {
        type: args.type,
        isEnabled: args.isEnabled,
        senderEmail: args.senderEmail,
        triggerDays: args.triggerDays,
        thresholdOverride: args.thresholdOverride,
        updatedBy: user._id,
      });
    }
  },
});

export const seedDefaultAlertSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db.query("alertSettings").collect();
    if (existing.length > 0) return; // Already seeded

    const defaults: { type: AlertType; triggerDays?: number[]; thresholdOverride?: number }[] = [
      { type: "overdue_invoice", triggerDays: [1, 7, 30] },
      { type: "low_stock" },
      { type: "payment_received" },
      { type: "po_approval" },
      { type: "expense_claim_update" },
      { type: "lead_follow_up" },
    ];

    for (const d of defaults) {
      await ctx.db.insert("alertSettings", {
        type: d.type,
        isEnabled: false,
        triggerDays: d.triggerDays,
        thresholdOverride: d.thresholdOverride,
        updatedBy: user._id,
      });
    }
  },
});

// ─── Internal: Check and trigger alerts ──────────────────────

export const checkAndTriggerAlerts = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const settings = await ctx.db.query("alertSettings").collect();
    const enabledSettings = settings.filter((s) => s.isEnabled && s.senderEmail);

    if (enabledSettings.length === 0) return null;

    const now = new Date();
    const today = now.toISOString().split("T")[0];

    for (const setting of enabledSettings) {
      const senderEmail = setting.senderEmail!;

      if (setting.type === "overdue_invoice") {
        // Check for overdue invoices
        const invoices = await ctx.db
          .query("invoices")
          .withIndex("by_status", (q) => q.eq("status", "sent"))
          .collect();

        const triggerDays = setting.triggerDays ?? [1, 7, 30];

        for (const invoice of invoices) {
          const dueDate = new Date(invoice.dueDate);
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

          if (triggerDays.includes(daysOverdue)) {
            const customer = await ctx.db.get(invoice.customerId);
            if (customer?.email) {
              await ctx.scheduler.runAfter(0, internal.emails.sendOverdueReminder, {
                from: senderEmail,
                to: customer.email,
                customerName: customer.name,
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.totalAmount - invoice.amountPaid,
                daysOverdue,
                currency: invoice.currency ?? "USD",
              });
            }
          }
        }
      }

      if (setting.type === "low_stock") {
        // Check products below threshold
        const products = await ctx.db.query("products").collect();
        const owners = await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", "owner"))
          .collect();
        const ownerEmails = owners.filter((u) => u.email).map((u) => u.email!);

        if (ownerEmails.length === 0) continue;

        for (const product of products) {
          if (!product.isActive) continue;
          const threshold = setting.thresholdOverride ?? product.lowStockThreshold ?? 10;
          const inventoryRecords = await ctx.db
            .query("inventory")
            .withIndex("by_product", (q) => q.eq("productId", product._id))
            .collect();
          const totalQty = inventoryRecords.reduce((sum, r) => sum + r.quantity, 0);

          if (totalQty <= threshold && totalQty >= 0) {
            // Check if we already sent an alert today for this product
            const recentLogs = await ctx.db
              .query("alertLog")
              .withIndex("by_sent_at")
              .order("desc")
              .take(100);
            const alreadySent = recentLogs.some(
              (log) =>
                log.alertType === "low_stock" &&
                log.referenceId === product._id &&
                log.sentAt.startsWith(today)
            );
            if (alreadySent) continue;

            await ctx.scheduler.runAfter(0, internal.emails.sendLowStockAlert, {
              from: senderEmail,
              to: ownerEmails,
              productName: product.name,
              productId: product._id,
              currentStock: totalQty,
              threshold,
            });
          }
        }
      }

      if (setting.type === "lead_follow_up") {
        // Check for overdue lead activities
        const pendingActivities = await ctx.db
          .query("leadActivities")
          .withIndex("by_completed", (q) => q.eq("isCompleted", false))
          .collect();

        const overdueActivities = pendingActivities.filter((a) => {
          const dueDate = a.dueDate ?? a.date;
          return new Date(dueDate) < now;
        });

        for (const activity of overdueActivities.slice(0, 10)) {
          const lead = await ctx.db.get(activity.leadId);
          if (!lead) continue;

          let recipientEmail: string | null = null;
          if (lead.assignedTo) {
            const assignedUser = await ctx.db.get(lead.assignedTo);
            recipientEmail = assignedUser?.email ?? null;
          }
          if (!recipientEmail) {
            const owners = await ctx.db
              .query("users")
              .withIndex("by_role", (q) => q.eq("role", "owner"))
              .collect();
            recipientEmail = owners.find((u) => u.email)?.email ?? null;
          }

          if (recipientEmail) {
            // Check if already sent today
            const recentLogs = await ctx.db
              .query("alertLog")
              .withIndex("by_sent_at")
              .order("desc")
              .take(100);
            const alreadySent = recentLogs.some(
              (log) =>
                log.alertType === "lead_follow_up" &&
                log.referenceId === activity._id &&
                log.sentAt.startsWith(today)
            );
            if (alreadySent) continue;

            await ctx.scheduler.runAfter(0, internal.emails.sendLeadFollowUpReminder, {
              from: senderEmail,
              to: recipientEmail,
              leadName: lead.name,
              activityTitle: activity.title,
              activityId: activity._id,
              dueDate: activity.dueDate ?? activity.date,
            });
          }
        }
      }
    }

    return null;
  },
});

// ─── Internal: Log alert result (called from email actions) ──

export const logAlert = internalMutation({
  args: {
    alertType: v.string(),
    recipientEmail: v.string(),
    subject: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("alertLog", {
      ...args,
      sentAt: new Date().toISOString(),
    });
  },
});
