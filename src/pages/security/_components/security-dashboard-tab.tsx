import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Shield, Users, AlertTriangle, Activity, Eye, Lock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function SecurityDashboardTab() {
  const stats = useQuery(api.security.getAccessStats);
  const users = useQuery(api.users.listUsers);
  const roles = useQuery(api.security.listRoles);

  if (!stats || !users || !roles) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const activeUsers = users.filter((u) => u.isActive);
  const moduleData = Object.entries(stats.moduleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const roleDistribution = [
    { role: "Owner", count: users.filter((u) => u.role === "owner").length },
    { role: "Manager", count: users.filter((u) => u.role === "manager").length },
    { role: "Staff", count: users.filter((u) => u.role === "staff").length },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <Users className="w-6 h-6 mx-auto text-blue-500 mb-2" />
            <div className="text-xl sm:text-2xl font-bold break-words leading-tight">{activeUsers.length}</div>
            <div className="text-xs text-muted-foreground truncate">Active Users</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Activity className="w-6 h-6 mx-auto text-green-500 mb-2" />
            <div className="text-xl sm:text-2xl font-bold break-words leading-tight">{stats.activeUsersToday}</div>
            <div className="text-xs text-muted-foreground truncate">Active Today</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <Eye className="w-6 h-6 mx-auto text-purple-500 mb-2" />
            <div className="text-xl sm:text-2xl font-bold break-words leading-tight">{stats.todayAccesses}</div>
            <div className="text-xs text-muted-foreground truncate">Accesses Today</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <AlertTriangle className={`w-6 h-6 mx-auto mb-2 ${stats.failedAttempts > 0 ? "text-red-500" : "text-gray-400"}`} />
            <div className={`text-xl sm:text-2xl font-bold break-words leading-tight ${stats.failedAttempts > 0 ? "text-red-600" : ""}`}>{stats.failedAttempts}</div>
            <div className="text-xs text-muted-foreground truncate">Failed Attempts</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* User Role Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" /> User Role Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roleDistribution.map((r) => (
                <div key={r.role} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{r.role}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${activeUsers.length > 0 ? (r.count / activeUsers.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-6 text-right">{r.count}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Custom Roles Defined</span>
                <span className="font-medium">{roles.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">System Roles</span>
                <span className="font-medium">{roles.filter((r) => r.isSystem).length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Module Access Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="w-4 h-4" /> Access by Module
            </CardTitle>
          </CardHeader>
          <CardContent>
            {moduleData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={moduleData} layout="vertical">
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                No access data yet. Activity will appear as users interact with the system.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Security Recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Security Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <SecurityCheck
              label="Role-based access control"
              status="active"
              detail="Permissions enforced per module"
            />
            <SecurityCheck
              label="Audit trail"
              status="active"
              detail="All data changes are logged"
            />
            <SecurityCheck
              label="Authentication"
              status="active"
              detail="Built-in email + password sign-in (scrypt-hashed, 1-hour tokens)"
            />
            <SecurityCheck
              label="Data access logging"
              status="active"
              detail="Module access tracked per user"
            />
            <SecurityCheck
              label="Two-factor authentication"
              status="recommended"
              detail="Not built in yet — planned for a future version"
            />
            <SecurityCheck
              label="Session timeout"
              status="active"
              detail="Sessions expire after inactivity"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityCheck({ label, status, detail }: { label: string; status: "active" | "recommended"; detail: string }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        {status === "active" ? (
          <div className="w-2 h-2 rounded-full bg-green-500" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{detail}</span>
        <Badge variant="secondary" className={status === "active" ? "text-green-700 bg-green-100 dark:bg-green-900 dark:text-green-300" : "text-yellow-700 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300"}>
          {status === "active" ? "Active" : "Recommended"}
        </Badge>
      </div>
    </div>
  );
}
