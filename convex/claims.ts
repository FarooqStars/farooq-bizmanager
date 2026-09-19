import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { nextNumber } from "./lib/docNumber.ts";

async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  return identity;
}

async function getUser(ctx: QueryCtx | MutationCtx, tokenIdentifier: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ==================== EXPENSE CLAIMS ====================

export const listClaims = query({
  args: {
    status: v.optional(v.string()),
    view: v.optional(v.union(v.literal("my"), v.literal("pending"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    let claims: Doc<"expenseClaims">[];

    if (args.view === "pending") {
      // Show claims pending current user's approval
      claims = await ctx.db
        .query("expenseClaims")
        .withIndex("by_current_approver", (q) => q.eq("currentApprover", user._id))
        .collect();
    } else if (args.view === "my") {
      // Show user's own claims
      claims = await ctx.db
        .query("expenseClaims")
        .withIndex("by_submitted_by", (q) => q.eq("submittedBy", user._id))
        .collect();
    } else {
      // All claims (owner/manager only)
      if (user.role === "staff") {
        claims = await ctx.db
          .query("expenseClaims")
          .withIndex("by_submitted_by", (q) => q.eq("submittedBy", user._id))
          .collect();
      } else {
        claims = await ctx.db.query("expenseClaims").order("desc").collect();
      }
    }

    // Filter by status if provided
    if (args.status) {
      claims = claims.filter((c) => c.status === args.status);
    }

    // Enrich with submitter name and category
    const enriched = await Promise.all(
      claims.map(async (claim) => {
        const submitter = await ctx.db.get(claim.submittedBy);
        const category = claim.categoryId ? await ctx.db.get(claim.categoryId) : null;
        return {
          ...claim,
          submitterName: submitter?.name ?? "Unknown",
          categoryName: category?.name ?? "Uncategorized",
        };
      }),
    );

    return enriched;
  },
});

export const getClaim = query({
  args: { id: v.id("expenseClaims") },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const claim = await ctx.db.get(args.id);
    if (!claim) return null;

    const submitter = await ctx.db.get(claim.submittedBy);
    const category = claim.categoryId ? await ctx.db.get(claim.categoryId) : null;
    const approvals = await ctx.db
      .query("claimApprovals")
      .withIndex("by_claim", (q) => q.eq("claimId", args.id))
      .collect();

    const enrichedApprovals = await Promise.all(
      approvals.map(async (a) => {
        const approver = await ctx.db.get(a.approverId);
        return { ...a, approverName: approver?.name ?? "Unknown" };
      }),
    );

    // Get receipt URL if available
    let receiptUrl: string | null = null;
    if (claim.receiptStorageId) {
      receiptUrl = await ctx.storage.getUrl(claim.receiptStorageId);
    }

    return {
      ...claim,
      submitterName: submitter?.name ?? "Unknown",
      categoryName: category?.name ?? "Uncategorized",
      approvals: enrichedApprovals,
      receiptUrl,
    };
  },
});

export const createClaim = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    amount: v.number(),
    categoryId: v.optional(v.id("expenseCategories")),
    currency: v.optional(v.string()),
    receiptStorageId: v.optional(v.id("_storage")),
    date: v.string(),
    notes: v.optional(v.string()),
    submitImmediately: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"expenseClaims">> => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    if (args.amount <= 0) {
      throw new ConvexError({ message: "Amount must be positive", code: "BAD_REQUEST" });
    }

    // Generate claim number
    const allClaims = await ctx.db.query("expenseClaims").collect();
    const claimNumber = nextNumber(allClaims, (c) => c.claimNumber, "EC-", 5);

    // Find manager to assign as first approver
    const managers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "manager"))
      .collect();
    const owners = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "owner"))
      .collect();

    // If submitter is staff, manager approves first. If manager, owner approves.
    let currentApprover: Id<"users"> | undefined;
    const isSubmitting = args.submitImmediately !== false;

    if (isSubmitting) {
      if (user.role === "staff") {
        currentApprover = managers.find((m) => m._id !== user._id)?._id ?? owners[0]?._id;
      } else if (user.role === "manager") {
        currentApprover = owners[0]?._id;
      }
      // Owner auto-approves (no approval needed)
    }

    const status = !isSubmitting
      ? ("draft" as const)
      : user.role === "owner"
        ? ("approved" as const)
        : ("submitted" as const);

    const id = await ctx.db.insert("expenseClaims", {
      claimNumber,
      title: args.title,
      description: args.description,
      submittedBy: user._id,
      categoryId: args.categoryId,
      amount: args.amount,
      currency: args.currency,
      receiptStorageId: args.receiptStorageId,
      date: args.date,
      status,
      currentApprover,
      approvalLevel: 0,
      notes: args.notes,
    });

    return id;
  },
});

export const submitClaim = mutation({
  args: { id: v.id("expenseClaims") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    const claim = await ctx.db.get(args.id);
    if (!claim) throw new ConvexError({ message: "Claim not found", code: "NOT_FOUND" });
    if (claim.submittedBy !== user._id) {
      throw new ConvexError({ message: "Can only submit your own claims", code: "FORBIDDEN" });
    }
    if (claim.status !== "draft") {
      throw new ConvexError({ message: "Claim already submitted", code: "BAD_REQUEST" });
    }

    // Find approver
    const managers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "manager"))
      .collect();
    const owners = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "owner"))
      .collect();

    let currentApprover: Id<"users"> | undefined;
    if (user.role === "staff") {
      currentApprover = managers.find((m) => m._id !== user._id)?._id ?? owners[0]?._id;
    } else if (user.role === "manager") {
      currentApprover = owners[0]?._id;
    }

    await ctx.db.patch(args.id, {
      status: user.role === "owner" ? "approved" : "submitted",
      currentApprover,
    });
  },
});

export const approveClaim = mutation({
  args: { id: v.id("expenseClaims"), comments: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    const claim = await ctx.db.get(args.id);
    if (!claim) throw new ConvexError({ message: "Claim not found", code: "NOT_FOUND" });

    if (claim.currentApprover !== user._id) {
      throw new ConvexError({ message: "You are not the current approver", code: "FORBIDDEN" });
    }

    // Record approval
    await ctx.db.insert("claimApprovals", {
      claimId: args.id,
      approverId: user._id,
      level: claim.approvalLevel + 1,
      action: "approved",
      comments: args.comments,
      actionDate: new Date().toISOString(),
    });

    // Determine next step in workflow
    // Level 1: Manager approves → goes to finance (owner) for final approval
    // Level 2: Owner/Finance approves → claim is approved
    if (user.role === "manager" && claim.approvalLevel === 0) {
      // Escalate to owner/finance
      const owners = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "owner"))
        .collect();

      const financeApprover = owners[0];
      if (financeApprover) {
        await ctx.db.patch(args.id, {
          status: "pending_finance",
          currentApprover: financeApprover._id,
          approvalLevel: 1,
        });
      } else {
        // No finance approver, mark as approved
        await ctx.db.patch(args.id, {
          status: "approved",
          currentApprover: undefined,
          approvalLevel: 1,
        });
      }
    } else {
      // Final approval
      await ctx.db.patch(args.id, {
        status: "approved",
        currentApprover: undefined,
        approvalLevel: claim.approvalLevel + 1,
      });
    }
  },
});

export const rejectClaim = mutation({
  args: { id: v.id("expenseClaims"), comments: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    const claim = await ctx.db.get(args.id);
    if (!claim) throw new ConvexError({ message: "Claim not found", code: "NOT_FOUND" });

    if (claim.currentApprover !== user._id) {
      throw new ConvexError({ message: "You are not the current approver", code: "FORBIDDEN" });
    }

    // Record rejection
    await ctx.db.insert("claimApprovals", {
      claimId: args.id,
      approverId: user._id,
      level: claim.approvalLevel + 1,
      action: "rejected",
      comments: args.comments,
      actionDate: new Date().toISOString(),
    });

    await ctx.db.patch(args.id, { status: "rejected", currentApprover: undefined });
  },
});

export const markReimbursed = mutation({
  args: { id: v.id("expenseClaims") },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    if (user.role === "staff") {
      throw new ConvexError({
        message: "Only managers and owners can mark reimbursement",
        code: "FORBIDDEN",
      });
    }

    const claim = await ctx.db.get(args.id);
    if (!claim) throw new ConvexError({ message: "Claim not found", code: "NOT_FOUND" });
    if (claim.status !== "approved") {
      throw new ConvexError({
        message: "Claim must be approved before reimbursement",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.patch(args.id, { status: "reimbursed" });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getClaimStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const user = await getUser(ctx, identity.tokenIdentifier);

    const allClaims =
      user.role === "staff"
        ? await ctx.db
            .query("expenseClaims")
            .withIndex("by_submitted_by", (q) => q.eq("submittedBy", user._id))
            .collect()
        : await ctx.db.query("expenseClaims").collect();

    const pendingApproval = await ctx.db
      .query("expenseClaims")
      .withIndex("by_current_approver", (q) => q.eq("currentApprover", user._id))
      .collect();

    const totalSubmitted = allClaims.filter((c) => c.status !== "draft").length;
    const totalApproved = allClaims.filter(
      (c) => c.status === "approved" || c.status === "reimbursed",
    ).length;
    const totalPending = allClaims.filter((c) =>
      ["submitted", "pending_finance"].includes(c.status),
    ).length;
    const totalRejected = allClaims.filter((c) => c.status === "rejected").length;
    const totalAmount = allClaims
      .filter((c) => c.status === "approved" || c.status === "reimbursed")
      .reduce((sum, c) => sum + c.amount, 0);

    return {
      totalSubmitted,
      totalApproved,
      totalPending,
      totalRejected,
      totalAmount,
      pendingMyApproval: pendingApproval.length,
    };
  },
});
