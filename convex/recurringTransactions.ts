import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addDays, addWeeks, addMonths, addYears, format, parseISO } from "date-fns";

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

type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

// Advance a date string (yyyy-MM-dd) by the given frequency
function advanceDate(dateStr: string, frequency: Frequency): string {
  const date = parseISO(dateStr);
  let next: Date;
  switch (frequency) {
    case "daily":
      next = addDays(date, 1);
      break;
    case "weekly":
      next = addWeeks(date, 1);
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
  return format(next, "yyyy-MM-dd");
}

// Shared validator for template data
const templateDataValidator = v.object({
  customerId: v.optional(v.string()),
  customerName: v.optional(v.string()),
  vendorId: v.optional(v.string()),
  vendorName: v.optional(v.string()),
  amount: v.number(),
  description: v.optional(v.string()),
  items: v.optional(
    v.array(
      v.object({
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      })
    )
  ),
  debitAccountId: v.optional(v.string()),
  creditAccountId: v.optional(v.string()),
  category: v.optional(v.string()),
});

const typeValidator = v.union(
  v.literal("invoice"),
  v.literal("bill"),
  v.literal("expense"),
  v.literal("journal_entry")
);

const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly")
);

// ─── Queries ───────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    await getUser(ctx);
    return await ctx.db
      .query("recurringTransactions")
      .withIndex("by_next_run")
      .order("asc")
      .collect();
  },
});

// ─── Mutations ─────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    type: typeValidator,
    frequency: frequencyValidator,
    startDate: v.string(),
    endDate: v.optional(v.string()),
    maxRuns: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    templateData: templateDataValidator,
  },
  handler: async (ctx, args) => {
    const user = await getUser(ctx);

    if (!args.name.trim()) {
      throw new ConvexError({ message: "Name is required", code: "BAD_REQUEST" });
    }
    if (args.templateData.amount < 0) {
      throw new ConvexError({ message: "Amount cannot be negative", code: "BAD_REQUEST" });
    }

    return await ctx.db.insert("recurringTransactions", {
      name: args.name.trim(),
      type: args.type,
      frequency: args.frequency,
      startDate: args.startDate,
      endDate: args.endDate,
      // First run happens on the start date
      nextRunDate: args.startDate,
      runCount: 0,
      maxRuns: args.maxRuns,
      isActive: args.isActive ?? true,
      templateData: args.templateData,
      createdBy: user._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("recurringTransactions"),
    name: v.optional(v.string()),
    type: v.optional(typeValidator),
    frequency: v.optional(frequencyValidator),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    nextRunDate: v.optional(v.string()),
    maxRuns: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    templateData: v.optional(templateDataValidator),
  },
  handler: async (ctx, args) => {
    await getUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Recurring transaction not found", code: "NOT_FOUND" });
    }

    const updates: Partial<{
      name: string;
      type: "invoice" | "bill" | "expense" | "journal_entry";
      frequency: Frequency;
      startDate: string;
      endDate: string | undefined;
      nextRunDate: string;
      maxRuns: number | undefined;
      isActive: boolean;
      templateData: typeof existing.templateData;
    }> = {};

    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.type !== undefined) updates.type = args.type;
    if (args.frequency !== undefined) updates.frequency = args.frequency;
    if (args.startDate !== undefined) updates.startDate = args.startDate;
    if (args.endDate !== undefined) updates.endDate = args.endDate;
    if (args.nextRunDate !== undefined) updates.nextRunDate = args.nextRunDate;
    if (args.maxRuns !== undefined) updates.maxRuns = args.maxRuns;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.templateData !== undefined) updates.templateData = args.templateData;

    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("recurringTransactions") },
  handler: async (ctx, args) => {
    await getUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Recurring transaction not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.id);
  },
});

export const pause = mutation({
  args: { id: v.id("recurringTransactions") },
  handler: async (ctx, args) => {
    await getUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new ConvexError({ message: "Recurring transaction not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.id, { isActive: !existing.isActive });
  },
});

// Find all active recurring transactions that are due and advance their schedule
export const processdue = mutation({
  args: {},
  handler: async (ctx) => {
    await getUser(ctx);
    const today = format(new Date(), "yyyy-MM-dd");

    // Only scan active, due templates using the next-run index
    const due = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_next_run", (q) => q.lte("nextRunDate", today))
      .collect();

    let processed = 0;

    for (const rt of due) {
      if (!rt.isActive) continue;

      // Respect end date
      if (rt.endDate && rt.nextRunDate > rt.endDate) continue;

      // Respect max runs
      if (rt.maxRuns !== undefined && rt.runCount >= rt.maxRuns) {
        // Deactivate once the run limit has been reached
        await ctx.db.patch(rt._id, { isActive: false });
        continue;
      }

      // TODO: actually create transactions in corresponding tables
      // (invoices, bills, expenses, journalEntries). For now we only track
      // the schedule by advancing dates and counters.

      const newRunCount = rt.runCount + 1;
      const nextRunDate = advanceDate(rt.nextRunDate, rt.frequency);

      // Deactivate if we've hit maxRuns or passed the end date after this run
      const reachedMax = rt.maxRuns !== undefined && newRunCount >= rt.maxRuns;
      const pastEnd = rt.endDate !== undefined && nextRunDate > rt.endDate;

      await ctx.db.patch(rt._id, {
        runCount: newRunCount,
        lastRunDate: today,
        nextRunDate,
        isActive: reachedMax || pastEnd ? false : rt.isActive,
      });

      processed += 1;
    }

    return { processed };
  },
});
