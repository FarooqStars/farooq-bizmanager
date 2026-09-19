import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";

const reportTypeValidator = v.union(
  v.literal("financial"),
  v.literal("sales"),
  v.literal("expenses"),
  v.literal("inventory"),
  v.literal("cashflow"),
  v.literal("aging"),
  v.literal("payroll"),
  v.literal("purchasing"),
  v.literal("profitloss")
);

const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly")
);

function computeNextRun(frequency: string, hour: number, dayOfWeek?: number, dayOfMonth?: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hour, 0, 0, 0);

  if (frequency === "daily") {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === "weekly") {
    const currentDay = next.getUTCDay();
    const targetDay = dayOfWeek ?? 1;
    let diff = targetDay - currentDay;
    if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
    next.setUTCDate(next.getUTCDate() + diff);
  } else if (frequency === "monthly") {
    const targetDay = dayOfMonth ?? 1;
    next.setUTCDate(targetDay);
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  }

  return next.toISOString();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const reports = await ctx.db.query("scheduledReports").collect();
    return reports;
  },
});

export const getById = query({
  args: { id: v.id("scheduledReports") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db.get(args.id);
  },
});

export const getHistory = query({
  args: { reportId: v.id("scheduledReports"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const history = await ctx.db
      .query("reportHistory")
      .withIndex("by_report", (q) => q.eq("scheduledReportId", args.reportId))
      .order("desc")
      .take(args.limit ?? 20);

    return history;
  },
});

export const getAllHistory = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const history = await ctx.db
      .query("reportHistory")
      .order("desc")
      .take(args.limit ?? 50);

    // Enrich with report names
    const enriched = await Promise.all(
      history.map(async (h) => {
        const report = await ctx.db.get(h.scheduledReportId);
        return { ...h, reportName: report?.name ?? "Deleted Report" };
      })
    );

    return enriched;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    reportType: reportTypeValidator,
    frequency: frequencyValidator,
    format: v.union(v.literal("pdf"), v.literal("csv")),
    recipients: v.array(v.string()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    hour: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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

    const hour = args.hour ?? 8;
    const nextRunAt = computeNextRun(args.frequency, hour, args.dayOfWeek, args.dayOfMonth);

    return await ctx.db.insert("scheduledReports", {
      name: args.name,
      reportType: args.reportType,
      frequency: args.frequency,
      format: args.format,
      recipients: args.recipients,
      isActive: true,
      createdBy: user._id,
      dayOfWeek: args.dayOfWeek,
      dayOfMonth: args.dayOfMonth,
      hour,
      nextRunAt,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("scheduledReports"),
    name: v.optional(v.string()),
    reportType: v.optional(reportTypeValidator),
    frequency: v.optional(frequencyValidator),
    format: v.optional(v.union(v.literal("pdf"), v.literal("csv"))),
    recipients: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    hour: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Report schedule not found", code: "NOT_FOUND" });
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.reportType !== undefined) updates.reportType = args.reportType;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.format !== undefined) updates.format = args.format;
    if (args.recipients !== undefined) updates.recipients = args.recipients;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.dayOfWeek !== undefined) updates.dayOfWeek = args.dayOfWeek;
    if (args.dayOfMonth !== undefined) updates.dayOfMonth = args.dayOfMonth;
    if (args.hour !== undefined) updates.hour = args.hour;

    // Recalculate next run
    const freq = (args.frequency ?? existing.frequency) as string;
    const hour = args.hour ?? existing.hour ?? 8;
    const dow = args.dayOfWeek ?? existing.dayOfWeek;
    const dom = args.dayOfMonth ?? existing.dayOfMonth;
    updates.nextRunAt = computeNextRun(freq, hour, dow, dom);

    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("scheduledReports") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    await ctx.db.delete(args.id);
  },
});

export const toggleActive = mutation({
  args: { id: v.id("scheduledReports") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const report = await ctx.db.get(args.id);
    if (!report) {
      throw new ConvexError({ message: "Not found", code: "NOT_FOUND" });
    }

    const newActive = !report.isActive;
    const updates: Record<string, unknown> = { isActive: newActive };

    if (newActive) {
      const hour = report.hour ?? 8;
      updates.nextRunAt = computeNextRun(report.frequency, hour, report.dayOfWeek, report.dayOfMonth);
    }

    await ctx.db.patch(args.id, updates);
  },
});

// Internal mutation called by cron to process due reports
export const processScheduledReports = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const now = new Date().toISOString();

    const activeReports = await ctx.db
      .query("scheduledReports")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const dueReports = activeReports.filter((r) => r.nextRunAt && r.nextRunAt <= now);

    for (const report of dueReports.slice(0, 10)) {
      // Record a history entry (actual email sending would be via action)
      await ctx.db.insert("reportHistory", {
        scheduledReportId: report._id,
        status: "success",
        reportType: report.reportType,
        format: report.format,
        recipientCount: report.recipients.length,
        generatedAt: now,
      });

      // Update last run and compute next run
      const hour = report.hour ?? 8;
      const nextRunAt = computeNextRun(report.frequency, hour, report.dayOfWeek, report.dayOfMonth);
      await ctx.db.patch(report._id, { lastRunAt: now, nextRunAt });
    }

    // If more remain, schedule a continuation
    if (dueReports.length > 10) {
      await ctx.scheduler.runAfter(0, internal.scheduledReports.processScheduledReports, {});
    }

    return null;
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const all = await ctx.db.query("scheduledReports").collect();
    const active = all.filter((r) => r.isActive).length;
    const history = await ctx.db.query("reportHistory").order("desc").take(100);
    const successCount = history.filter((h) => h.status === "success").length;
    const failCount = history.filter((h) => h.status === "failed").length;

    return {
      totalSchedules: all.length,
      activeSchedules: active,
      successCount,
      failCount,
      lastRun: history[0]?.generatedAt ?? null,
    };
  },
});
