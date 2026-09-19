import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUser } from "./users.ts";
import { enforcePostingDate } from "./closingDate.ts";
import type { Id } from "./_generated/dataModel.d.ts";
import { logAudit } from "./lib/audit.ts";
import { postBalancedEntry, findOrCreateAccount, round2, reverseEntriesForSource } from "./lib/ledger.ts";
import { FUEL_LOG_SOURCE, MAINTENANCE_LOG_SOURCE, VEHICLE_PURCHASE_SOURCE } from "./lib/sourceTypes.ts";

// ── Vehicles ──────────────────────────────────────────────────────────────────

export const listVehicles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const vehicles = await ctx.db.query("vehicles").collect();
    const users = await ctx.db.query("users").collect();
    const userMap = new Map(users.map((u) => [u._id, u]));

    return vehicles.map((v) => ({
      ...v,
      assignedUser: v.assignedTo ? userMap.get(v.assignedTo) ?? null : null,
    }));
  },
});

export const createVehicle = mutation({
  args: {
    make: v.string(),
    model: v.string(),
    year: v.number(),
    plate: v.string(),
    vin: v.optional(v.string()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    purchasePrice: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const id = await ctx.db.insert("vehicles", { ...args, status: "active" });

    // Post journal entry for the vehicle purchase cost if provided
    if (args.purchasePrice && args.purchasePrice > 0) {
      const cost = round2(args.purchasePrice);
      const vehicleName = `${args.year} ${args.make} ${args.model} (${args.plate})`;
      const date = args.purchaseDate ?? new Date().toISOString().split("T")[0];

      const vehiclesAccount = await findOrCreateAccount(ctx, {
        type: "fixed_asset",
        code: "1520",
        name: "Vehicles",
        subType: "Vehicles",
        matchSubType: "Vehicles",
      });
      const apAccount = await findOrCreateAccount(ctx, {
        type: "accounts_payable",
        code: "2000",
        name: "Accounts Payable",
        subType: "Trade Payables",
        matchAnyOfType: true,
      });

      await postBalancedEntry(ctx, {
        date,
        description: `Vehicle purchase – ${vehicleName}`,
        createdBy: caller._id,
        sourceType: VEHICLE_PURCHASE_SOURCE,
        sourceId: id,
        lines: [
          { accountId: vehiclesAccount._id, debit: cost, description: vehicleName },
          { accountId: apAccount._id, credit: cost, description: vehicleName },
        ],
      });
    }

    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vehicles:createVehicle",
      resourceType: "vehicle",
      resourceId: id,
      action: "Added vehicle",
      details: `${args.year} ${args.make} ${args.model} — ${args.plate}`,
      afterValue: JSON.stringify({ make: args.make, model: args.model, year: args.year, plate: args.plate, status: "active" }),
    });
    return id;
  },
});

export const updateVehicle = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    year: v.optional(v.number()),
    plate: v.optional(v.string()),
    vin: v.optional(v.string()),
    color: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("in_maintenance"), v.literal("retired"))),
    notes: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    const vehicleBefore = await ctx.db.get(args.vehicleId);
    const { vehicleId, ...updates } = args;
    await ctx.db.patch(vehicleId, updates);
    const vehicleAfter = await ctx.db.get(vehicleId);
    await logAudit(ctx, {
      userId: caller._id,
      mutationName: "vehicles:updateVehicle",
      resourceType: "vehicle",
      resourceId: vehicleId,
      action: "Updated vehicle",
      beforeValue: vehicleBefore ? JSON.stringify(vehicleBefore) : undefined,
      afterValue: vehicleAfter ? JSON.stringify(vehicleAfter) : undefined,
    });
  },
});

export const deleteVehicle = mutation({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role !== "owner") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Remove related logs
    const mLogs = await ctx.db.query("maintenanceLogs").withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId)).collect();
    for (const l of mLogs) await ctx.db.delete(l._id);
    const fLogs = await ctx.db.query("fuelLogs").withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId)).collect();
    for (const l of fLogs) await ctx.db.delete(l._id);

    await ctx.db.delete(args.vehicleId);
  },
});

// ── Maintenance Logs ───────────────────────────────────────────────────────────

export const listMaintenanceLogs = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const logs = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
      .collect();

    return logs.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const createMaintenanceLog = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    date: v.string(),
    description: v.string(),
    cost: v.optional(v.number()),
    mileageAtService: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    const logId = await ctx.db.insert("maintenanceLogs", { ...args, recordedBy: caller._id });

    // Post journal entry if a cost was recorded
    if (args.cost && args.cost > 0) {
      const cost = round2(args.cost);
      const vehicle = await ctx.db.get(args.vehicleId);
      const vehicleName = vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plate})` : "Vehicle";

      const maintenanceExpenseAccount = await findOrCreateAccount(ctx, {
        type: "expense",
        code: "6310",
        name: "Vehicle Maintenance Expense",
        subType: "Vehicle Maintenance",
        matchSubType: "Vehicle Maintenance",
      });
      const apAccount = await findOrCreateAccount(ctx, {
        type: "accounts_payable",
        code: "2000",
        name: "Accounts Payable",
        subType: "Trade Payables",
        matchAnyOfType: true,
      });

      await postBalancedEntry(ctx, {
        date: args.date,
        description: args.description || `Service – ${vehicleName}`,
        createdBy: caller._id,
        sourceType: MAINTENANCE_LOG_SOURCE,
        sourceId: logId,
        lines: [
          { accountId: maintenanceExpenseAccount._id, debit: cost, description: args.description || `Service – ${vehicleName}` },
          { accountId: apAccount._id, credit: cost, description: args.description || `Service – ${vehicleName}` },
        ],
      });
    }

    return logId;
  },
});

export const deleteMaintenanceLog = mutation({
  args: { logId: v.id("maintenanceLogs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    const log = await ctx.db.get(args.logId);
    if (log) {
      await reverseEntriesForSource(ctx, MAINTENANCE_LOG_SOURCE, args.logId, { createdBy: caller._id });
    }
    await ctx.db.delete(args.logId);
  },
});

// ── Fuel Logs ─────────────────────────────────────────────────────────────────

export const listFuelLogs = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const logs = await ctx.db
      .query("fuelLogs")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
      .collect();

    return logs.sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const createFuelLog = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    date: v.string(),
    liters: v.number(),
    costPerLiter: v.number(),
    mileage: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller) throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });

    // Enforce global closing date
    await enforcePostingDate(ctx, args.date);

    const totalCost = round2(args.liters * args.costPerLiter);
    const logId = await ctx.db.insert("fuelLogs", { ...args, totalCost, recordedBy: caller._id });

    // Post journal entry for the fuel cost
    if (totalCost > 0) {
      const vehicle = await ctx.db.get(args.vehicleId);
      const vehicleName = vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plate})` : "Vehicle";

      const fuelExpenseAccount = await findOrCreateAccount(ctx, {
        type: "expense",
        code: "6300",
        name: "Vehicle Fuel Expense",
        subType: "Vehicle Fuel",
        matchSubType: "Vehicle Fuel",
      });
      const apAccount = await findOrCreateAccount(ctx, {
        type: "accounts_payable",
        code: "2000",
        name: "Accounts Payable",
        subType: "Trade Payables",
        matchAnyOfType: true,
      });

      await postBalancedEntry(ctx, {
        date: args.date,
        description: args.notes ?? `Fuel – ${vehicleName}`,
        createdBy: caller._id,
        sourceType: FUEL_LOG_SOURCE,
        sourceId: logId,
        lines: [
          { accountId: fuelExpenseAccount._id, debit: totalCost, description: `Fuel – ${vehicleName}` },
          { accountId: apAccount._id, credit: totalCost, description: `Fuel – ${vehicleName}` },
        ],
      });
    }

    return logId;
  },
});

export const deleteFuelLog = mutation({
  args: { logId: v.id("fuelLogs") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const caller = await getUser(ctx, identity.tokenIdentifier);
    if (!caller || caller.role === "staff") throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    const log = await ctx.db.get(args.logId);
    if (log) {
      await reverseEntriesForSource(ctx, FUEL_LOG_SOURCE, args.logId, { createdBy: caller._id });
    }
    await ctx.db.delete(args.logId);
  },
});

// ── Fleet Summary ──────────────────────────────────────────────────────────────

export const getFleetSummary = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const vehicles = await ctx.db.query("vehicles").collect();
    const maintenanceLogs = await ctx.db.query("maintenanceLogs").collect();
    const fuelLogs = await ctx.db.query("fuelLogs").collect();

    return {
      total: vehicles.length,
      active: vehicles.filter((v) => v.status === "active").length,
      inMaintenance: vehicles.filter((v) => v.status === "in_maintenance").length,
      retired: vehicles.filter((v) => v.status === "retired").length,
      totalMaintenanceCost: maintenanceLogs.reduce((s, l) => s + (l.cost ?? 0), 0),
      totalFuelCost: fuelLogs.reduce((s, l) => s + l.totalCost, 0),
    };
  },
});
