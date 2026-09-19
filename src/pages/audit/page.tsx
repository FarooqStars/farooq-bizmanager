import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  Shield, Clock, User, FileText, AlertTriangle,
  ShoppingCart, Package, Truck, Receipt, Boxes,
  Users, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

const actionIcons: Record<string, typeof Shield> = {
  sale_created: ShoppingCart,
  sale_deleted: ShoppingCart,
  sale_status_updated: ShoppingCart,
  product_created: Package,
  product_updated: Package,
  product_deleted: Package,
  inventory_updated: Boxes,
  vehicle_added: Truck,
  vehicle_updated: Truck,
  expense_created: Receipt,
  bill_created: Receipt,
  bill_paid: Receipt,
  user_created: Users,
  user_updated: Users,
  settings_updated: Settings,
};

const actionColors: Record<string, string> = {
  sale_created: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  sale_deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  product_created: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  product_deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  inventory_updated: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  expense_created: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

function formatTimestamp(creationTime: number) {
  const date = new Date(creationTime);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const stats = useQuery(api.audit.getAuditStats);
  const entries = useQuery(api.audit.listAuditLog, {
    limit: 100,
    actionFilter: actionFilter !== "all" ? actionFilter : undefined,
    resourceTypeFilter: resourceFilter !== "all" ? resourceFilter : undefined,
  });
  const users = useQuery(api.users.listUsers);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" /> Audit Trail
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete record of all business actions and changes
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">Total Events</p>
                {stats === undefined ? (
                  <Skeleton className="h-6 w-12 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-0.5 break-words leading-tight">{stats.totalEntries}</p>
                )}
              </div>
              <div className="p-2 rounded-lg bg-muted text-primary flex-shrink-0">
                <FileText className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">Today</p>
                {stats === undefined ? (
                  <Skeleton className="h-6 w-12 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-0.5 break-words leading-tight">{stats.todayCount}</p>
                )}
              </div>
              <div className="p-2 rounded-lg bg-muted text-blue-600 flex-shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">Action Types</p>
                {stats === undefined ? (
                  <Skeleton className="h-6 w-12 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-0.5 break-words leading-tight">{stats.uniqueActions.length}</p>
                )}
              </div>
              <div className="p-2 rounded-lg bg-muted text-amber-600 flex-shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">Users</p>
                {users === undefined ? (
                  <Skeleton className="h-6 w-12 mt-1" />
                ) : (
                  <p className="text-xl font-bold mt-0.5 break-words leading-tight">{users.length}</p>
                )}
              </div>
              <div className="p-2 rounded-lg bg-muted text-green-600 flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1 min-w-[160px]">
              <p className="text-xs font-medium text-muted-foreground">Action</p>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {stats?.uniqueActions.map((a) => (
                    <SelectItem key={a} value={a}>{formatAction(a)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[160px]">
              <p className="text-xs font-medium text-muted-foreground">Resource</p>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  {stats?.uniqueResourceTypes.map((r) => (
                    <SelectItem key={r} value={r!}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[160px]">
              <p className="text-xs font-medium text-muted-foreground">User</p>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u._id} value={u._id}>{u.name ?? "Unknown"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {entries === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Shield /></EmptyMedia>
            <EmptyTitle>No audit events</EmptyTitle>
            <EmptyDescription>
              Actions performed in the system will appear here
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const Icon = actionIcons[entry.action] ?? FileText;
            const colorClass = actionColors[entry.action] ?? "bg-muted text-muted-foreground";
            return (
              <Card key={entry._id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", colorClass)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">
                          {formatAction(entry.action)}
                        </p>
                        {entry.resourceType && (
                          <Badge variant="secondary" className="text-xs">
                            {entry.resourceType}
                          </Badge>
                        )}
                      </div>
                      {entry.details && (
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                          {entry.details}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {entry.userName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTimestamp(entry._creationTime)}
                        </span>
                        <span className="text-xs opacity-60">
                          {new Date(entry._creationTime).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
