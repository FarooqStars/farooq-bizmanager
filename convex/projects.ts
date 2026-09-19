import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel.d.ts";
import type { QueryCtx } from "./_generated/server";

async function enrichProjects(ctx: QueryCtx, projects: Doc<"projects">[]) {
  return await Promise.all(
    projects.map(async (p) => {
      const customer = p.customerId ? await ctx.db.get(p.customerId) : null;
      const manager = p.managerId ? await ctx.db.get(p.managerId) : null;
      return { ...p, customerName: customer?.name, managerName: manager?.name };
    })
  );
}

// ─── Projects ────────────────────────────────────────────────────

export const listProjects = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    if (args.status && args.status !== "all") {
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "planning" | "active" | "on_hold" | "completed" | "cancelled")
        )
        .order("desc")
        .collect();
      return await enrichProjects(ctx, projects);
    }

    const projects = await ctx.db.query("projects").order("desc").collect();
    return await enrichProjects(ctx, projects);
  },
});

export const getProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError({ message: "Project not found", code: "NOT_FOUND" });

    const customer = project.customerId ? await ctx.db.get(project.customerId) : null;
    const manager = project.managerId ? await ctx.db.get(project.managerId) : null;
    return { ...project, customerName: customer?.name, managerName: manager?.name };
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    customerId: v.optional(v.id("customers")),
    description: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    estimatedBudget: v.number(),
    managerId: v.optional(v.id("employees")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Check code uniqueness
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (existing) throw new ConvexError({ message: "Project code already exists", code: "CONFLICT" });

    return await ctx.db.insert("projects", {
      ...args,
      status: "planning",
      actualCost: 0,
      laborCost: 0,
      materialCost: 0,
      createdBy: user._id,
    });
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("planning"), v.literal("active"), v.literal("on_hold"),
      v.literal("completed"), v.literal("cancelled")
    )),
    endDate: v.optional(v.string()),
    estimatedBudget: v.optional(v.number()),
    managerId: v.optional(v.id("employees")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const { projectId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(projectId, filtered);
  },
});

// ─── Project Tasks ───────────────────────────────────────────────

export const listTasks = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const enriched = await Promise.all(
      tasks.map(async (t) => {
        const employee = t.assignedTo ? await ctx.db.get(t.assignedTo) : null;
        return { ...t, assignedName: employee?.name };
      })
    );
    return enriched;
  },
});

export const createTask = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    estimatedHours: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
    assignedTo: v.optional(v.id("employees")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    return await ctx.db.insert("projectTasks", {
      ...args,
      status: "pending",
      actualHours: 0,
      actualCost: 0,
    });
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("projectTasks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed"))),
    assignedTo: v.optional(v.id("employees")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const { taskId, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(taskId, filtered);
  },
});

// ─── Time Entries ────────────────────────────────────────────────

export const listTimeEntries = query({
  args: {
    projectId: v.optional(v.id("projects")),
    employeeId: v.optional(v.id("employees")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    let entries;
    if (args.projectId) {
      entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .order("desc")
        .collect();
    } else if (args.employeeId) {
      entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId!))
        .order("desc")
        .collect();
    } else if (args.status && args.status !== "all") {
      entries = await ctx.db
        .query("timeEntries")
        .withIndex("by_status", (q) =>
          q.eq("status", args.status as "draft" | "submitted" | "approved" | "rejected")
        )
        .order("desc")
        .collect();
    } else {
      entries = await ctx.db.query("timeEntries").order("desc").take(200);
    }

    const enriched = await Promise.all(
      entries.map(async (e) => {
        const project = await ctx.db.get(e.projectId);
        const employee = await ctx.db.get(e.employeeId);
        const task = e.taskId ? await ctx.db.get(e.taskId) : null;
        return {
          ...e,
          projectName: project?.name,
          employeeName: employee?.name,
          taskName: task?.name,
        };
      })
    );
    return enriched;
  },
});

export const createTimeEntry = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.optional(v.id("projectTasks")),
    employeeId: v.id("employees"),
    date: v.string(),
    startTime: v.string(),
    endTime: v.optional(v.string()),
    hours: v.number(),
    hourlyRate: v.number(),
    description: v.optional(v.string()),
    billable: v.optional(v.boolean()),
    isRunning: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const totalCost = args.hours * args.hourlyRate;
    const isRunning = args.isRunning ?? false;
    const billable = args.billable ?? true;

    const entryId = await ctx.db.insert("timeEntries", {
      ...args,
      billable,
      isRunning,
      totalCost,
      status: "draft",
    });

    // Update project labor cost and hours tracking
    const project = await ctx.db.get(args.projectId);
    if (project && !isRunning) {
      await ctx.db.patch(args.projectId, {
        laborCost: project.laborCost + totalCost,
        actualCost: project.actualCost + totalCost,
        billableHours: (project.billableHours ?? 0) + (billable ? args.hours : 0),
        nonBillableHours: (project.nonBillableHours ?? 0) + (billable ? 0 : args.hours),
      });
    }

    // Update task hours
    if (args.taskId && !isRunning) {
      const task = await ctx.db.get(args.taskId);
      if (task) {
        await ctx.db.patch(args.taskId, {
          actualHours: task.actualHours + args.hours,
          actualCost: task.actualCost + totalCost,
        });
      }
    }

    return entryId;
  },
});

export const stopTimer = mutation({
  args: {
    entryId: v.id("timeEntries"),
    endTime: v.string(),
    hours: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const entry = await ctx.db.get(args.entryId);
    if (!entry) throw new ConvexError({ message: "Time entry not found", code: "NOT_FOUND" });

    const totalCost = args.hours * entry.hourlyRate;

    await ctx.db.patch(args.entryId, {
      endTime: args.endTime,
      hours: args.hours,
      totalCost,
      isRunning: false,
    });

    // Update project
    const project = await ctx.db.get(entry.projectId);
    if (project) {
      await ctx.db.patch(entry.projectId, {
        laborCost: project.laborCost + totalCost,
        actualCost: project.actualCost + totalCost,
        billableHours: (project.billableHours ?? 0) + (entry.billable ? args.hours : 0),
        nonBillableHours: (project.nonBillableHours ?? 0) + (entry.billable ? 0 : args.hours),
      });
    }

    // Update task
    if (entry.taskId) {
      const task = await ctx.db.get(entry.taskId);
      if (task) {
        await ctx.db.patch(entry.taskId, {
          actualHours: task.actualHours + args.hours,
          actualCost: task.actualCost + totalCost,
        });
      }
    }
  },
});

export const submitTimeEntries = mutation({
  args: { entryIds: v.array(v.id("timeEntries")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    for (const id of args.entryIds) {
      const entry = await ctx.db.get(id);
      if (entry && entry.status === "draft") {
        await ctx.db.patch(id, { status: "submitted" });
      }
    }
  },
});

export const approveTimeEntries = mutation({
  args: {
    entryIds: v.array(v.id("timeEntries")),
    action: v.union(v.literal("approve"), v.literal("reject")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const now = new Date().toISOString();
    for (const id of args.entryIds) {
      const entry = await ctx.db.get(id);
      if (entry && entry.status === "submitted") {
        await ctx.db.patch(id, {
          status: args.action === "approve" ? "approved" : "rejected",
          approvedBy: user._id,
          approvedAt: now,
        });
      }
    }
  },
});

// ─── Project Materials ───────────────────────────────────────────

export const listMaterials = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const materials = await ctx.db
      .query("projectMaterials")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const enriched = await Promise.all(
      materials.map(async (m) => {
        const product = m.productId ? await ctx.db.get(m.productId) : null;
        return { ...m, productName: product?.name };
      })
    );
    return enriched;
  },
});

export const addMaterial = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.optional(v.id("projectTasks")),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    unitCost: v.number(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const totalCost = args.quantity * args.unitCost;

    await ctx.db.insert("projectMaterials", {
      ...args,
      totalCost,
      addedBy: user._id,
    });

    // Update project material cost
    const project = await ctx.db.get(args.projectId);
    if (project) {
      await ctx.db.patch(args.projectId, {
        materialCost: project.materialCost + totalCost,
        actualCost: project.actualCost + totalCost,
      });
    }
  },
});

// ─── Profitability Dashboard ─────────────────────────────────────

export const projectProfitability = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const projects = await ctx.db.query("projects").collect();

    const summary = projects.map((p) => ({
      id: p._id,
      name: p.name,
      code: p.code,
      status: p.status,
      estimatedBudget: p.estimatedBudget,
      actualCost: p.actualCost,
      laborCost: p.laborCost,
      materialCost: p.materialCost,
      revenue: p.revenue ?? 0,
      billableHours: p.billableHours ?? 0,
      nonBillableHours: p.nonBillableHours ?? 0,
      profit: (p.revenue ?? 0) - p.actualCost,
      profitMargin: (p.revenue ?? 0) > 0 ? (((p.revenue ?? 0) - p.actualCost) / (p.revenue ?? 1)) * 100 : 0,
      variance: p.estimatedBudget - p.actualCost,
      percentUsed: p.estimatedBudget > 0 ? (p.actualCost / p.estimatedBudget) * 100 : 0,
    }));

    const totalBudget = projects.reduce((s, p) => s + p.estimatedBudget, 0);
    const totalActual = projects.reduce((s, p) => s + p.actualCost, 0);
    const totalLabor = projects.reduce((s, p) => s + p.laborCost, 0);
    const totalMaterial = projects.reduce((s, p) => s + p.materialCost, 0);
    const totalRevenue = projects.reduce((s, p) => s + (p.revenue ?? 0), 0);
    const totalBillableHours = projects.reduce((s, p) => s + (p.billableHours ?? 0), 0);
    const totalNonBillableHours = projects.reduce((s, p) => s + (p.nonBillableHours ?? 0), 0);
    const activeCount = projects.filter((p) => p.status === "active").length;

    return {
      projects: summary,
      totals: {
        totalBudget, totalActual, totalLabor, totalMaterial,
        totalRevenue, totalBillableHours, totalNonBillableHours,
        activeCount, totalProjects: projects.length,
      },
    };
  },
});

// ─── Weekly Timesheet ───────────────────────────────────────────

export const weeklyTimesheet = query({
  args: {
    employeeId: v.id("employees"),
    weekStart: v.string(), // ISO date of Monday
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    // Compute week dates (Mon-Sun)
    const startDate = new Date(args.weekStart);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    // Fetch all time entries for this employee in the week range
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_employee", (q) => q.eq("employeeId", args.employeeId))
      .collect();

    const weekEntries = entries.filter((e) => dates.includes(e.date));

    // Group by project and date
    const projectMap = new Map<string, {
      projectId: string;
      projectName: string;
      dailyHours: Record<string, number>;
      totalHours: number;
      billableHours: number;
      nonBillableHours: number;
      totalCost: number;
    }>();

    for (const entry of weekEntries) {
      const key = entry.projectId;
      if (!projectMap.has(key)) {
        const project = await ctx.db.get(entry.projectId);
        projectMap.set(key, {
          projectId: key,
          projectName: project?.name ?? "Unknown",
          dailyHours: {},
          totalHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          totalCost: 0,
        });
      }
      const row = projectMap.get(key)!;
      row.dailyHours[entry.date] = (row.dailyHours[entry.date] ?? 0) + entry.hours;
      row.totalHours += entry.hours;
      if (entry.billable) row.billableHours += entry.hours;
      else row.nonBillableHours += entry.hours;
      row.totalCost += entry.totalCost;
    }

    // Compute daily totals
    const dailyTotals: Record<string, number> = {};
    for (const date of dates) {
      dailyTotals[date] = weekEntries
        .filter((e) => e.date === date)
        .reduce((s, e) => s + e.hours, 0);
    }

    const totalHours = weekEntries.reduce((s, e) => s + e.hours, 0);
    const billableTotal = weekEntries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);

    return {
      dates,
      rows: Array.from(projectMap.values()),
      dailyTotals,
      totalHours,
      billableTotal,
      nonBillableTotal: totalHours - billableTotal,
    };
  },
});

// ─── Update project revenue ─────────────────────────────────────

export const updateProjectRevenue = mutation({
  args: {
    projectId: v.id("projects"),
    revenue: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    await ctx.db.patch(args.projectId, { revenue: args.revenue });
  },
});
