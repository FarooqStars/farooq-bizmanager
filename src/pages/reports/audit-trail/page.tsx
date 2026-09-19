/**
 * Audit Trail Report — complete record of all financial changes.
 *
 * Features:
 *  - Paginated list using usePaginatedQuery
 *  - Filters: resource type, user, action search, date range
 *  - Expandable rows showing before/after JSON diff
 *  - Action badges with colour coding
 */
import { useState } from "react";
import { usePaginatedQuery, useQuery, Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Shield, Search, X, ChevronDown, ChevronRight, Clock, User,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  "invoice",
  "payment",
  "bill",
  "journal",
  "account",
  "product",
  "sale",
  "expense",
  "vendor",
  "customer",
  "inventory",
  "vehicle",
  "asset",
  "payroll",
  "tax",
] as const;

// ─── Action badge colours ────────────────────────────────────────────────────

function getActionBadgeClasses(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes("created") || lower.includes("added")) {
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
  if (lower.includes("updated") || lower.includes("changed") || lower.includes("patched")) {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
  if (lower.includes("deleted") || lower.includes("removed")) {
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  }
  if (lower.includes("voided") || lower.includes("reversed") || lower.includes("cancelled")) {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  }
  if (lower.includes("paid") || lower.includes("approved")) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  }
  return "bg-muted text-muted-foreground";
}

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatResourceType(type: string | undefined) {
  if (!type) return "—";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortId(id: string | undefined) {
  if (!id) return "";
  // Show last 8 chars for readability
  return id.length > 12 ? `...${id.slice(-8)}` : id;
}

// ─── Expandable row with before/after diff ──────────────────────────────────

function DiffView({ beforeValue, afterValue }: { beforeValue?: string; afterValue?: string }) {
  if (!beforeValue && !afterValue) {
    return <p className="text-xs text-muted-foreground italic">No change data recorded.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">Before</p>
        <pre className="text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {beforeValue ? JSON.stringify(JSON.parse(beforeValue), null, 2) : "—"}
        </pre>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">After</p>
        <pre className="text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
          {afterValue ? JSON.stringify(JSON.parse(afterValue), null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}

// ─── Inner component (authenticated) ────────────────────────────────────────

function AuditTrailInner() {
  // Filter state
  const [resourceType, setResourceType] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [actionSearch, setActionSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Users for filter dropdown
  const auditUsers = useQuery(api.audit.getAuditUsers);

  // Build query args
  const queryArgs: {
    resourceType?: string;
    userId?: Id<"users">;
    action?: string;
    startDate?: string;
    endDate?: string;
  } = {};

  if (resourceType !== "all") queryArgs.resourceType = resourceType;
  if (userId !== "all") queryArgs.userId = userId as Id<"users">;
  if (actionSearch.trim()) queryArgs.action = actionSearch.trim();
  if (startDate) queryArgs.startDate = startDate;
  if (endDate) queryArgs.endDate = endDate;

  const { results, status, loadMore } = usePaginatedQuery(
    api.audit.getAuditTrail,
    queryArgs,
    { initialNumItems: 50 }
  );

  const hasActiveFilters = resourceType !== "all" || userId !== "all" || actionSearch.trim() !== "" || startDate !== "" || endDate !== "";

  const clearFilters = () => {
    setResourceType("all");
    setUserId("all");
    setActionSearch("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" /> Audit Trail
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete record of all financial changes
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Resource Type */}
            <div className="space-y-1 min-w-[160px]">
              <p className="text-xs font-medium text-muted-foreground">Resource Type</p>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger className="h-9 cursor-pointer">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatResourceType(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* User */}
            <div className="space-y-1 min-w-[160px]">
              <p className="text-xs font-medium text-muted-foreground">User</p>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="h-9 cursor-pointer">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {auditUsers?.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action search */}
            <div className="space-y-1 min-w-[180px]">
              <p className="text-xs font-medium text-muted-foreground">Action</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                  placeholder="Search actions..."
                  className="h-9 pl-8 text-sm"
                />
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Start Date</p>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-sm w-[150px]"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">End Date</p>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-sm w-[150px]"
              />
            </div>

            {/* Clear button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="cursor-pointer h-9 text-xs"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {status === "LoadingFirstPage" ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Search /></EmptyMedia>
            <EmptyTitle>No audit entries found</EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Try adjusting your filters to find entries."
                : "Actions performed in the system will appear here."}
            </EmptyDescription>
          </EmptyHeader>
          {hasActiveFilters && (
            <EmptyContent>
              <Button size="sm" onClick={clearFilters} className="cursor-pointer">
                Clear Filters
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-2">
          {results.map((entry) => {
            const isExpanded = expandedId === entry._id;
            const hasDiff = Boolean(entry.beforeValue || entry.afterValue);

            return (
              <Card
                key={entry._id}
                className={cn(
                  "transition-shadow",
                  hasDiff && "cursor-pointer hover:shadow-sm"
                )}
                onClick={() => {
                  if (hasDiff) setExpandedId(isExpanded ? null : entry._id);
                }}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    {/* Expand indicator */}
                    <div className="mt-0.5 flex-shrink-0 w-4">
                      {hasDiff ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )
                      ) : null}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Action badge */}
                        <Badge className={cn("text-xs", getActionBadgeClasses(entry.action))}>
                          {formatAction(entry.action)}
                        </Badge>

                        {/* Resource type + ID */}
                        {entry.resourceType && (
                          <span className="text-xs text-muted-foreground">
                            {formatResourceType(entry.resourceType)}
                            {entry.resourceId && (
                              <span className="ml-1 font-mono text-[10px] opacity-70">
                                {shortId(entry.resourceId)}
                              </span>
                            )}
                          </span>
                        )}

                        {/* Mutation name */}
                        {entry.mutationName && (
                          <span className="text-[10px] text-muted-foreground/60 font-mono hidden sm:inline">
                            {entry.mutationName}
                          </span>
                        )}
                      </div>

                      {/* Details line */}
                      {entry.details && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {entry.details}
                        </p>
                      )}

                      {/* Reason (for voids/deletes) */}
                      {entry.reason && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5 italic">
                          Reason: {entry.reason}
                        </p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {entry.userName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(entry._creationTime), { addSuffix: true })}
                        </span>
                        <span className="text-[11px] opacity-60 hidden sm:inline">
                          {format(new Date(entry._creationTime), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>

                      {/* Expanded diff */}
                      {isExpanded && hasDiff && (
                        <DiffView
                          beforeValue={entry.beforeValue}
                          afterValue={entry.afterValue}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Load More */}
          {status === "CanLoadMore" && (
            <div className="flex justify-center pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadMore(50)}
                className="cursor-pointer"
              >
                Load More
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="flex justify-center pt-4">
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page wrapper with auth states ──────────────────────────────────────────

export default function AuditTrailPage() {
  return (
    <>
      <AuthLoading>
        <div className="p-8 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <AuditTrailInner />
      </Authenticated>
    </>
  );
}
