import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel.d.ts";

// ─── Queries ─────────────────────────────────────────────────

export const listLeads = query({
  args: {
    stage: v.optional(v.string()),
    source: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    let leads;
    if (args.stage) {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_stage", (q) => q.eq("stage", args.stage as "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost"))
        .collect();
    } else if (args.assignedTo) {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assigned", (q) => q.eq("assignedTo", args.assignedTo as Id<"users">))
        .collect();
    } else {
      leads = await ctx.db.query("leads").collect();
    }

    // Enrich with assigned user names
    const enriched = await Promise.all(
      leads.map(async (lead) => {
        const assignedUser = lead.assignedTo ? await ctx.db.get(lead.assignedTo) : null;
        return {
          ...lead,
          assignedUserName: assignedUser?.name ?? null,
        };
      })
    );

    return enriched;
  },
});

export const getLead = query({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const lead = await ctx.db.get(args.id);
    if (!lead) {
      throw new ConvexError({ message: "Lead not found", code: "NOT_FOUND" });
    }

    const assignedUser = lead.assignedTo ? await ctx.db.get(lead.assignedTo) : null;
    const activities = await ctx.db
      .query("leadActivities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.id))
      .collect();

    // Enrich activities with user names
    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        const user = await ctx.db.get(activity.createdBy);
        return { ...activity, createdByName: user?.name ?? "Unknown" };
      })
    );

    return {
      ...lead,
      assignedUserName: assignedUser?.name ?? null,
      activities: enrichedActivities.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    };
  },
});

export const getPipelineStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const allLeads = await ctx.db.query("leads").collect();

    const stages = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;
    const pipeline = stages.map((stage) => {
      const stageLeads = allLeads.filter((l) => l.stage === stage);
      const totalValue = stageLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
      return { stage, count: stageLeads.length, totalValue };
    });

    const totalLeads = allLeads.length;
    const totalValue = allLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
    const wonLeads = allLeads.filter((l) => l.stage === "won");
    const wonValue = wonLeads.reduce((sum, l) => sum + (l.dealValue ?? 0), 0);
    const conversionRate = totalLeads > 0 ? (wonLeads.length / totalLeads) * 100 : 0;

    // Upcoming follow-ups (activities due but not completed)
    const pendingActivities = await ctx.db
      .query("leadActivities")
      .withIndex("by_completed", (q) => q.eq("isCompleted", false))
      .take(10);

    const upcomingFollowUps = await Promise.all(
      pendingActivities.map(async (activity) => {
        const lead = await ctx.db.get(activity.leadId);
        return { ...activity, leadName: lead?.name ?? "Unknown" };
      })
    );

    return {
      pipeline,
      totalLeads,
      totalValue,
      wonValue,
      conversionRate,
      upcomingFollowUps: upcomingFollowUps.sort(
        (a, b) => new Date(a.dueDate ?? a.date).getTime() - new Date(b.dueDate ?? b.date).getTime()
      ),
    };
  },
});

// ─── Mutations ───────────────────────────────────────────────

export const createLead = mutation({
  args: {
    name: v.string(),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.union(
      v.literal("website"),
      v.literal("referral"),
      v.literal("cold_call"),
      v.literal("social_media"),
      v.literal("trade_show"),
      v.literal("email_campaign"),
      v.literal("other")
    ),
    dealValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    expectedCloseDate: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
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

    return await ctx.db.insert("leads", {
      ...args,
      stage: "new",
      createdBy: user._id,
    });
  },
});

export const updateLead = mutation({
  args: {
    id: v.id("leads"),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.union(
      v.literal("website"),
      v.literal("referral"),
      v.literal("cold_call"),
      v.literal("social_media"),
      v.literal("trade_show"),
      v.literal("email_campaign"),
      v.literal("other")
    )),
    stage: v.optional(v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("proposal"),
      v.literal("negotiation"),
      v.literal("won"),
      v.literal("lost")
    )),
    dealValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    expectedCloseDate: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    lostReason: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const { id, ...updates } = args;
    const lead = await ctx.db.get(id);
    if (!lead) {
      throw new ConvexError({ message: "Lead not found", code: "NOT_FOUND" });
    }

    // Remove undefined values
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    await ctx.db.patch(id, cleanUpdates);
  },
});

export const updateLeadStage = mutation({
  args: {
    id: v.id("leads"),
    stage: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("proposal"),
      v.literal("negotiation"),
      v.literal("won"),
      v.literal("lost")
    ),
    lostReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const lead = await ctx.db.get(args.id);
    if (!lead) {
      throw new ConvexError({ message: "Lead not found", code: "NOT_FOUND" });
    }

    const updates: Record<string, unknown> = { stage: args.stage };
    if (args.stage === "lost" && args.lostReason) {
      updates.lostReason = args.lostReason;
    }

    await ctx.db.patch(args.id, updates);
  },
});

export const convertLeadToCustomer = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const lead = await ctx.db.get(args.id);
    if (!lead) {
      throw new ConvexError({ message: "Lead not found", code: "NOT_FOUND" });
    }

    if (lead.convertedCustomerId) {
      throw new ConvexError({ message: "Lead already converted", code: "CONFLICT" });
    }

    // Create customer from lead data
    const customerId = await ctx.db.insert("customers", {
      name: lead.company || lead.name,
      email: lead.email,
      phone: lead.phone,
      notes: `Converted from lead: ${lead.name}`,
    });

    // Update lead as won and link to customer
    await ctx.db.patch(args.id, {
      stage: "won",
      convertedCustomerId: customerId,
    });

    return customerId;
  },
});

export const deleteLead = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const lead = await ctx.db.get(args.id);
    if (!lead) {
      throw new ConvexError({ message: "Lead not found", code: "NOT_FOUND" });
    }

    // Delete associated activities
    const activities = await ctx.db
      .query("leadActivities")
      .withIndex("by_lead", (q) => q.eq("leadId", args.id))
      .collect();
    for (const activity of activities) {
      await ctx.db.delete(activity._id);
    }

    await ctx.db.delete(args.id);
  },
});

// ─── Activities ──────────────────────────────────────────────

export const createActivity = mutation({
  args: {
    leadId: v.id("leads"),
    type: v.union(
      v.literal("call"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("note"),
      v.literal("task"),
      v.literal("follow_up")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    date: v.string(),
    dueDate: v.optional(v.string()),
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

    return await ctx.db.insert("leadActivities", {
      ...args,
      isCompleted: false,
      createdBy: user._id,
    });
  },
});

export const completeActivity = mutation({
  args: { id: v.id("leadActivities") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    await ctx.db.patch(args.id, {
      isCompleted: true,
      completedAt: new Date().toISOString(),
    });
  },
});

export const deleteActivity = mutation({
  args: { id: v.id("leadActivities") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    await ctx.db.delete(args.id);
  },
});
