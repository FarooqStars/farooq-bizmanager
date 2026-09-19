import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { BarChart3, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

export default function CollectionsTab() {
  const dashboard = useQuery(api.invoicing.getCollectionsDashboard, {});

  if (!dashboard) return <Skeleton className="h-60 w-full" />;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Outstanding</p>
            <p className="text-lg font-bold">
              {dashboard.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-500" />Overdue
            </p>
            <p className="text-lg font-bold text-red-600">
              {dashboard.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overdue Invoices</p>
            <p className="text-lg font-bold text-red-600">{dashboard.counts.overdue}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Open Invoices</p>
            <p className="text-lg font-bold">{dashboard.counts.sent + dashboard.counts.partially_paid}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Brackets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Aging Analysis
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Outstanding receivables grouped by days past due
          </p>
        </CardHeader>
        <CardContent>
          {dashboard.totalOutstanding === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
                <EmptyTitle>All clear</EmptyTitle>
                <EmptyDescription>No outstanding receivables to collect</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <AgingCard
                label="Current (0-30 days)"
                amount={dashboard.aging["0-30"]}
                total={dashboard.totalOutstanding}
                color="text-green-600"
              />
              <AgingCard
                label="31-60 days"
                amount={dashboard.aging["31-60"]}
                total={dashboard.totalOutstanding}
                color="text-amber-600"
              />
              <AgingCard
                label="61-90 days"
                amount={dashboard.aging["61-90"]}
                total={dashboard.totalOutstanding}
                color="text-orange-600"
              />
              <AgingCard
                label="90+ days"
                amount={dashboard.aging["90+"]}
                total={dashboard.totalOutstanding}
                color="text-red-600"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Invoice Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(dashboard.counts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm capitalize">{status.replace("_", " ")}</span>
                <span className="font-bold text-sm">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgingCard({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="p-3 border rounded-lg space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>
        {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </p>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color === "text-green-600" ? "bg-green-500" : color === "text-amber-600" ? "bg-amber-500" : color === "text-orange-600" ? "bg-orange-500" : "bg-red-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{percent}% of total</p>
    </div>
  );
}
