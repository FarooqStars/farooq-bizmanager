import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { logAudit } from "./lib/audit.ts";

// ─── Job Contractors ──────────────────────────────────────────

export const listContractors = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const contractors = await ctx.db
      .query("jobContractors")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return await Promise.all(
      contractors.map(async (c) => {
        const vendor = await ctx.db.get(c.vendorId);
        return { ...c, vendorName: vendor?.name ?? "Unknown Vendor" };
      })
    );
  },
});

export const addContractor = mutation({
  args: {
    projectId: v.id("projects"),
    vendorId: v.id("vendors"),
    role: v.string(),
    contractAmount: v.number(),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const id = await ctx.db.insert("jobContractors", {
      ...args,
      amountPaid: 0,
      status: "active",
      addedBy: user._id,
    });

    await logAudit(ctx, {
      userId: user._id,
      mutationName: "jobCosting:addContractor",
      resourceType: "project",
      resourceId: args.projectId,
      action: "Added contractor to job",
      details: `${args.role} on project`,
      afterValue: JSON.stringify({ vendorId: args.vendorId, role: args.role, contractAmount: args.contractAmount, status: "active" }),
    });

    return id;
  },
});

export const updateContractor = mutation({
  args: {
    contractorId: v.id("jobContractors"),
    role: v.optional(v.string()),
    contractAmount: v.optional(v.number()),
    amountPaid: v.optional(v.number()),
    endDate: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("completed"), v.literal("terminated"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const { contractorId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await ctx.db.patch(contractorId, filtered);
  },
});

export const deleteContractor = mutation({
  args: { contractorId: v.id("jobContractors") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    await ctx.db.delete(args.contractorId);
  },
});

// ─── Job Cost Summary Report ──────────────────────────────────

export const jobCostSummary = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Get projects
    const projects = args.projectId
      ? [await ctx.db.get(args.projectId)].filter(Boolean)
      : await ctx.db.query("projects").collect();

    const report = await Promise.all(
      projects.map(async (project) => {
        if (!project) return null;

        // Get customer
        const customer = project.customerId ? await ctx.db.get(project.customerId) : null;

        // Get time entries (labor costs)
        const timeEntries = await ctx.db
          .query("timeEntries")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const laborCost = timeEntries.reduce((sum, e) => sum + e.totalCost, 0);
        const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
        const billableHours = timeEntries.filter((e) => e.billable).reduce((sum, e) => sum + e.hours, 0);

        // Get materials
        const materials = await ctx.db
          .query("projectMaterials")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const materialCost = materials.reduce((sum, m) => sum + m.totalCost, 0);

        // Get billable expenses for this project
        const expenses = await ctx.db
          .query("billableExpenses")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const expenseCost = expenses.reduce((sum, e) => sum + e.amount, 0);
        const billedExpenses = expenses.filter((e) => e.status !== "unbilled").reduce((sum, e) => sum + e.billedAmount, 0);

        // Get contractors
        const contractors = await ctx.db
          .query("jobContractors")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        const contractorCost = contractors.reduce((sum, c) => sum + c.amountPaid, 0);
        const contractorBudget = contractors.reduce((sum, c) => sum + c.contractAmount, 0);

        // Get bills linked to this project
        const allBills = await ctx.db.query("bills").collect();
        const projectBills = allBills.filter((b) => b.projectId === project._id);
        const billsCost = projectBills.reduce((sum, b) => sum + b.amount, 0);

        // Get invoices linked to this project
        const allInvoices = await ctx.db.query("invoices").collect();
        const projectInvoices = allInvoices.filter((inv) => inv.projectId === project._id);
        const invoiceRevenue = projectInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        const invoicePaid = projectInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0);

        // Total cost
        const totalCost = laborCost + materialCost + expenseCost + contractorCost + billsCost;
        const revenue = invoiceRevenue || (project.revenue ?? 0);
        const profit = revenue - totalCost;
        const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
        const budgetVariance = project.estimatedBudget - totalCost;
        const budgetUsedPercent = project.estimatedBudget > 0 ? (totalCost / project.estimatedBudget) * 100 : 0;

        return {
          projectId: project._id,
          projectName: project.name,
          projectCode: project.code,
          customerName: customer?.name ?? "No Customer",
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          estimatedBudget: project.estimatedBudget,
          // Cost breakdown
          laborCost,
          materialCost,
          expenseCost,
          contractorCost,
          contractorBudget,
          billsCost,
          totalCost,
          // Revenue
          invoiceRevenue,
          invoicePaid,
          revenue,
          // Profitability
          profit,
          profitMargin,
          budgetVariance,
          budgetUsedPercent,
          // Hours
          totalHours,
          billableHours,
          nonBillableHours: totalHours - billableHours,
          // Counts
          timeEntryCount: timeEntries.length,
          materialCount: materials.length,
          expenseCount: expenses.length,
          contractorCount: contractors.length,
          billCount: projectBills.length,
          invoiceCount: projectInvoices.length,
          // Billing
          billedExpenses,
          unbilledExpenses: expenseCost - billedExpenses,
        };
      })
    );

    const validReport = report.filter(Boolean) as NonNullable<typeof report[number]>[];

    // Totals
    const totals = {
      totalBudget: validReport.reduce((s, r) => s + r.estimatedBudget, 0),
      totalCost: validReport.reduce((s, r) => s + r.totalCost, 0),
      totalLabor: validReport.reduce((s, r) => s + r.laborCost, 0),
      totalMaterials: validReport.reduce((s, r) => s + r.materialCost, 0),
      totalExpenses: validReport.reduce((s, r) => s + r.expenseCost, 0),
      totalContractors: validReport.reduce((s, r) => s + r.contractorCost, 0),
      totalBills: validReport.reduce((s, r) => s + r.billsCost, 0),
      totalRevenue: validReport.reduce((s, r) => s + r.revenue, 0),
      totalProfit: validReport.reduce((s, r) => s + r.profit, 0),
      totalHours: validReport.reduce((s, r) => s + r.totalHours, 0),
      projectCount: validReport.length,
    };

    return { projects: validReport, totals };
  },
});

// ─── List projects for a customer ─────────────────────────────

export const listProjectsByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db
      .query("projects")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
  },
});
