import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Users, Activity, AlertTriangle, Shield, Clock,
  Package, FileText, Truck, Wrench, ShoppingCart,
  Monitor, Zap, CircleDot, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const roleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  staff: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const actionIcons: Record<string, React.ElementType> = {
  "Created asset": Package,
  "Updated asset": Package,
  "Updated user": Users,
  "Created sale": ShoppingCart,
  "Updated depreciation settings": TrendingUp,
};

// ── Status Indicator ──────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "healthy" | "warning" | "critical" }) {
  return (
    <span className={cn(
      "inline-flex w-2.5 h-2.5 rounded-full animate-pulse",
      status === "healthy" && "bg-green-500",
      status === "warning" && "bg-yellow-500",
      status === "critical" && "bg-red-500",
    )} />
  );
}

// ── Main Monitoring Page ──────────────────────────────────────────────────────

export default function MonitoringPage() {
  const health = useQuery(api.monitoring.systemHealth);
  const activityFeed = useQuery(api.monitoring.liveActivityFeed, { limit: 20 });
  const activityByUser = useQuery(api.monitoring.activityByUser);
  const activityTrend = useQuery(api.monitoring.activityTrend);

  // Determine overall system status
  const systemStatus = !health
    ? "healthy"
    : (health.alerts.overdueBills > 2 || health.alerts.lowStock > 5)
      ? "critical"
      : (health.alerts.overdueBills > 0 || health.alerts.lowStock > 0 || health.alerts.pendingSales > 0)
        ? "warning"
        : "healthy";

  const statusLabel = systemStatus === "healthy" ? "All Systems Normal" : systemStatus === "warning" ? "Needs Attention" : "Action Required";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="w-6 h-6" />Admin Monitoring
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time system overview and activity tracking</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border">
          <StatusDot status={systemStatus as "healthy" | "warning" | "critical"} />
          <span className="text-sm font-medium">{statusLabel}</span>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Active Users</p>
            </div>
            {health ? (
              <p className="text-2xl font-bold">{health.users.active} <span className="text-sm font-normal text-muted-foreground">/ {health.users.total}</span></p>
            ) : <Skeleton className="h-8 w-16" />}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-yellow-500" />
              <p className="text-xs text-muted-foreground">Actions (1h)</p>
            </div>
            {health ? (
              <p className="text-2xl font-bold">{health.activity.lastHour}</p>
            ) : <Skeleton className="h-8 w-12" />}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-muted-foreground">Actions (24h)</p>
            </div>
            {health ? (
              <p className="text-2xl font-bold">{health.activity.last24h}</p>
            ) : <Skeleton className="h-8 w-12" />}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Products</p>
            </div>
            {health ? (
              <p className="text-2xl font-bold">{health.totalProducts}</p>
            ) : <Skeleton className="h-8 w-12" />}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-xs text-muted-foreground">Alerts</p>
            </div>
            {health ? (
              <p className="text-2xl font-bold">{health.alerts.lowStock + health.alerts.overdueBills + health.alerts.pendingSales}</p>
            ) : <Skeleton className="h-8 w-12" />}
          </CardContent>
        </Card>
      </div>

      {/* Activity trend chart + Alerts panel */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Activity chart (2 cols) */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart className="w-4 h-4" />Activity Trend (Last 12 Hours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityTrend === undefined ? (
              <div className="h-44 flex items-end gap-2 px-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="flex-1" style={{ height: `${20 + Math.random() * 60}%` }} />
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={activityTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} />
                  <Tooltip
                    formatter={(value) => [`${value} actions`, "Activity"]}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="oklch(0.45 0.18 250)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Alerts panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />System Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health === undefined ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                <AlertRow icon={Package} label="Low Stock Items" count={health.alerts.lowStock} severity={health.alerts.lowStock > 5 ? "critical" : health.alerts.lowStock > 0 ? "warning" : "ok"} />
                <AlertRow icon={FileText} label="Overdue Bills" count={health.alerts.overdueBills} severity={health.alerts.overdueBills > 2 ? "critical" : health.alerts.overdueBills > 0 ? "warning" : "ok"} />
                <AlertRow icon={ShoppingCart} label="Pending Sales" count={health.alerts.pendingSales} severity={health.alerts.pendingSales > 0 ? "warning" : "ok"} />
                <AlertRow icon={Wrench} label="Assets in Repair" count={health.alerts.assetsUnderRepair} severity={health.alerts.assetsUnderRepair > 0 ? "warning" : "ok"} />
                <AlertRow icon={Truck} label="Vehicles in Maintenance" count={health.alerts.vehiclesInMaintenance} severity={health.alerts.vehiclesInMaintenance > 0 ? "warning" : "ok"} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live activity + Active users */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Live Activity Feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CircleDot className="w-4 h-4 text-green-500 animate-pulse" />
              Live Activity Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityFeed === undefined ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : activityFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {activityFeed.map((log) => {
                  const Icon = actionIcons[log.action] ?? Activity;
                  return (
                    <div key={log._id} className="flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{log.userName}</span>
                          <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", roleColors[log.userRole])}>
                            {log.userRole}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.action}
                          {log.details && <span className="font-medium text-foreground"> — {log.details}</span>}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-1">
                        {timeAgo(log._creationTime)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              User Activity (Last 24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityByUser === undefined ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : activityByUser.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No users found</p>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {activityByUser.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                      {user.name[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{user.name}</span>
                        <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", roleColors[user.role])}>
                          {user.role}
                        </Badge>
                      </div>
                      {user.lastActionText && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{user.lastActionText}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold">{user.actionsToday}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {user.lastAction ? timeAgo(user.lastAction) : "Inactive"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
        <Clock className="w-3 h-3" />
        <span>Data updates in real-time via live connection</span>
      </div>
    </div>
  );
}

// ── Alert Row Component ───────────────────────────────────────────────────────

function AlertRow({
  icon: Icon,
  label,
  count,
  severity,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  severity: "ok" | "warning" | "critical";
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg border",
      severity === "ok" && "bg-green-50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30",
      severity === "warning" && "bg-yellow-50 border-yellow-100 dark:bg-yellow-900/10 dark:border-yellow-900/30",
      severity === "critical" && "bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30",
    )}>
      <Icon className={cn(
        "w-4 h-4 flex-shrink-0",
        severity === "ok" && "text-green-600 dark:text-green-400",
        severity === "warning" && "text-yellow-600 dark:text-yellow-400",
        severity === "critical" && "text-red-600 dark:text-red-400",
      )} />
      <span className="text-sm flex-1">{label}</span>
      <span className={cn(
        "text-sm font-bold",
        severity === "ok" && "text-green-600 dark:text-green-400",
        severity === "warning" && "text-yellow-600 dark:text-yellow-400",
        severity === "critical" && "text-red-600 dark:text-red-400",
      )}>{count}</span>
    </div>
  );
}
