"use node";

import escapeHtml from "escape-html";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendEmail } from "./lib/mailer.ts";

// Outgoing email is optional — see convex/lib/mailer.ts for how to switch it on.

// ─── Overdue Invoice Reminder ────────────────────────────────

export const sendOverdueReminder = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    customerName: v.string(),
    invoiceNumber: v.string(),
    amount: v.number(),
    daysOverdue: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const subject = `Payment Reminder: Invoice #${args.invoiceNumber} is ${args.daysOverdue} day${args.daysOverdue > 1 ? "s" : ""} overdue`;
    const formattedAmount = new Intl.NumberFormat("en-US", { style: "currency", currency: args.currency }).format(args.amount);

    try {
      await sendEmail({
        from: args.from,
        to: args.to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Payment Reminder</h2>
            <p>Dear ${escapeHtml(args.customerName)},</p>
            <p>This is a friendly reminder that Invoice <strong>#${escapeHtml(args.invoiceNumber)}</strong> is now <strong>${args.daysOverdue} day${args.daysOverdue > 1 ? "s" : ""}</strong> past due.</p>
            <p style="font-size: 18px; font-weight: bold;">Outstanding Amount: ${escapeHtml(formattedAmount)}</p>
            <p>Please arrange payment at your earliest convenience. If you have already made the payment, please disregard this notice.</p>
            <p>Thank you for your prompt attention to this matter.</p>
          </div>
        `,
        text: `Payment Reminder: Invoice #${args.invoiceNumber} is ${args.daysOverdue} day(s) overdue. Outstanding: ${formattedAmount}. Please arrange payment at your earliest convenience.`,
      });

      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "overdue_invoice",
        recipientEmail: args.to,
        subject,
        referenceType: "invoice",
        referenceId: args.invoiceNumber,
        status: "sent",
      });
    } catch (err) {
      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "overdue_invoice",
        recipientEmail: args.to,
        subject,
        referenceType: "invoice",
        referenceId: args.invoiceNumber,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});

// ─── Low Stock Alert ─────────────────────────────────────────

export const sendLowStockAlert = internalAction({
  args: {
    from: v.string(),
    to: v.array(v.string()),
    productName: v.string(),
    productId: v.string(),
    currentStock: v.number(),
    threshold: v.number(),
  },
  handler: async (ctx, args) => {
    const subject = `Low Stock Alert: ${args.productName} (${args.currentStock} remaining)`;

    try {
      await sendEmail({
        from: args.from,
        to: args.to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">Low Stock Alert</h2>
            <p>The following product has fallen below the minimum stock threshold:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
              <tr style="background: #fef3c7;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Product</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(args.productName)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Current Stock</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${args.currentStock} units</td>
              </tr>
              <tr style="background: #fef3c7;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Threshold</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${args.threshold} units</td>
              </tr>
            </table>
            <p>Please reorder this item to maintain adequate inventory levels.</p>
          </div>
        `,
        text: `Low Stock Alert: ${args.productName} has ${args.currentStock} units remaining (threshold: ${args.threshold}). Please reorder.`,
      });

      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "low_stock",
        recipientEmail: args.to[0] ?? "",
        subject,
        referenceType: "product",
        referenceId: args.productId,
        status: "sent",
      });
    } catch (err) {
      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "low_stock",
        recipientEmail: args.to[0] ?? "",
        subject,
        referenceType: "product",
        referenceId: args.productId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});

// ─── Payment Received Confirmation ───────────────────────────

export const sendPaymentConfirmation = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    customerName: v.string(),
    invoiceNumber: v.string(),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: v.string(),
  },
  handler: async (ctx, args) => {
    const formattedAmount = new Intl.NumberFormat("en-US", { style: "currency", currency: args.currency }).format(args.amount);
    const subject = `Payment Received: ${formattedAmount} for Invoice #${args.invoiceNumber}`;

    try {
      await sendEmail({
        from: args.from,
        to: args.to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Payment Received</h2>
            <p>Dear ${escapeHtml(args.customerName)},</p>
            <p>We have received your payment. Thank you!</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
              <tr style="background: #dcfce7;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Invoice</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">#${escapeHtml(args.invoiceNumber)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(formattedAmount)}</td>
              </tr>
              <tr style="background: #dcfce7;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Method</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(args.paymentMethod)}</td>
              </tr>
            </table>
            <p>If you have any questions, please don't hesitate to contact us.</p>
          </div>
        `,
        text: `Payment Received: ${formattedAmount} for Invoice #${args.invoiceNumber} via ${args.paymentMethod}. Thank you!`,
      });

      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "payment_received",
        recipientEmail: args.to,
        subject,
        referenceType: "invoice",
        referenceId: args.invoiceNumber,
        status: "sent",
      });
    } catch (err) {
      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "payment_received",
        recipientEmail: args.to,
        subject,
        referenceType: "invoice",
        referenceId: args.invoiceNumber,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});

// ─── Expense Claim Status Update ─────────────────────────────

export const sendClaimStatusUpdate = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    employeeName: v.string(),
    claimNumber: v.string(),
    claimTitle: v.string(),
    newStatus: v.string(),
    amount: v.number(),
    currency: v.string(),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const formattedAmount = new Intl.NumberFormat("en-US", { style: "currency", currency: args.currency }).format(args.amount);
    const statusLabel = args.newStatus.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const subject = `Expense Claim ${statusLabel}: ${args.claimNumber}`;

    const statusColor = args.newStatus === "approved" || args.newStatus === "reimbursed" ? "#16a34a" :
                        args.newStatus === "rejected" ? "#dc2626" : "#f59e0b";

    try {
      await sendEmail({
        from: args.from,
        to: args.to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${statusColor};">Expense Claim ${escapeHtml(statusLabel)}</h2>
            <p>Dear ${escapeHtml(args.employeeName)},</p>
            <p>Your expense claim has been updated:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
              <tr style="background: #f3f4f6;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Claim #</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(args.claimNumber)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Title</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(args.claimTitle)}</td>
              </tr>
              <tr style="background: #f3f4f6;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(formattedAmount)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Status</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; color: ${statusColor}; font-weight: bold;">${escapeHtml(statusLabel)}</td>
              </tr>
            </table>
            ${args.comments ? `<p><strong>Comments:</strong> ${escapeHtml(args.comments)}</p>` : ""}
          </div>
        `,
        text: `Expense Claim ${statusLabel}: ${args.claimNumber} - ${args.claimTitle} (${formattedAmount}). ${args.comments ? "Comments: " + args.comments : ""}`,
      });

      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "expense_claim_update",
        recipientEmail: args.to,
        subject,
        referenceType: "expense_claim",
        referenceId: args.claimNumber,
        status: "sent",
      });
    } catch (err) {
      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "expense_claim_update",
        recipientEmail: args.to,
        subject,
        referenceType: "expense_claim",
        referenceId: args.claimNumber,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});

// ─── Lead Follow-Up Reminder ─────────────────────────────────

export const sendLeadFollowUpReminder = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    leadName: v.string(),
    activityTitle: v.string(),
    activityId: v.string(),
    dueDate: v.string(),
  },
  handler: async (ctx, args) => {
    const subject = `Follow-Up Overdue: ${args.activityTitle} - ${args.leadName}`;

    try {
      await sendEmail({
        from: args.from,
        to: args.to,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">Follow-Up Reminder</h2>
            <p>You have an overdue follow-up activity:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
              <tr style="background: #f5f3ff;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Lead</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(args.leadName)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Activity</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(args.activityTitle)}</td>
              </tr>
              <tr style="background: #f5f3ff;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>Due Date</strong></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(new Date(args.dueDate).toLocaleDateString())}</td>
              </tr>
            </table>
            <p>Please complete this follow-up to keep your sales pipeline moving.</p>
          </div>
        `,
        text: `Follow-Up Overdue: "${args.activityTitle}" for lead "${args.leadName}" was due on ${new Date(args.dueDate).toLocaleDateString()}. Please complete this activity.`,
      });

      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "lead_follow_up",
        recipientEmail: args.to,
        subject,
        referenceType: "lead_activity",
        referenceId: args.activityId,
        status: "sent",
      });
    } catch (err) {
      await ctx.runMutation(internal.alerts.logAlert, {
        alertType: "lead_follow_up",
        recipientEmail: args.to,
        subject,
        referenceType: "lead_activity",
        referenceId: args.activityId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});
