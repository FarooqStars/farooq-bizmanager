import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format } from "date-fns";
import {
  ArrowDownToLine, ArrowUpFromLine, Package, TrendingUp, TrendingDown,
  Activity, BarChart3, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import RecordMovementDialog from "./_components/record-movement-dialog.tsx";
import { cn } from "@/lib/utils.ts";

// ─── Movement Timeline ────────────────────────────────────────

function MovementTimeline() {
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const movements = useQuery(api.stockMovements.listMovements, {
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 50,
  });

  if (!movements) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const reasonLabels: Record<string, string> = {
    purchase: "Purchase",
    sale: "Sale",
    return: "Return",
    transfer: "Transfer",
    adjustment: "Adjustment",
    damage: "Damage",
    other: "Other",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | "in" | "out")}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in">Stock In</SelectItem>
            <SelectItem value="out">Stock Out</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {movements.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Activity /></EmptyMedia>
            <EmptyTitle>No movements recorded</EmptyTitle>
            <EmptyDescription>Stock movements will appear here as they are recorded</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {movements.map((m) => (
            <div key={m._id} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                m.type === "in" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
              )}>
                {m.type === "in" ? (
                  <ArrowDownToLine className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <ArrowUpFromLine className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{m.productName}</p>
                  <Badge variant="secondary" className="text-xs">
                    {m.type === "in" ? "+" : "-"}{m.quantity}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{reasonLabels[m.reason] ?? m.reason}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {m.warehouseName} • by {m.userName}
                  {m.reference && ` • Ref: ${m.reference}`}
                </p>
                {m.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{m.notes}</p>}
              </div>
              <p className="text-xs text-muted-foreground flex-shrink-0">
                {format(new Date(m.timestamp), "MMM d, HH:mm")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Daily Chart ──────────────────────────────────────────────

function DailyChart() {
  const [days, setDays] = useState(14);
  const summary = useQuery(api.stockMovements.movementSummary, { days });

  if (!summary) {
    return <Skeleton className="h-64 w-full" />;
  }

  const chartData = summary.map((d) => ({
    date: format(new Date(d.date), "MMM d"),
    "Stock In": d.inQty,
    "Stock Out": d.outQty,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Daily Movement Volume</p>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
                days === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {chartData.every((d) => d["Stock In"] === 0 && d["Stock Out"] === 0) ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          No movement data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
            <Tooltip
              contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Stock In" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Stock Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function InventoryTrackingPage() {
  const stats = useQuery(api.stockMovements.movementStats);
  const [showRecord, setShowRecord] = useState<"in" | "out" | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            Inventory Tracking
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time stock movement monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowRecord("in")} className="cursor-pointer">
            <ArrowDownToLine className="w-4 h-4 mr-2 text-green-500" />Stock In
          </Button>
          <Button variant="secondary" onClick={() => setShowRecord("out")} className="cursor-pointer">
            <ArrowUpFromLine className="w-4 h-4 mr-2 text-red-500" />Stock Out
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">Today In</p>
              {stats ? (
                <p className="text-xl font-bold text-green-600 dark:text-green-400 break-words leading-tight">+{stats.todayIn}</p>
              ) : <Skeleton className="h-6 w-12" />}
              <p className="text-xs text-muted-foreground">{stats?.todayInCount ?? 0} movements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">Today Out</p>
              {stats ? (
                <p className="text-xl font-bold text-red-600 dark:text-red-400 break-words leading-tight">-{stats.todayOut}</p>
              ) : <Skeleton className="h-6 w-12" />}
              <p className="text-xs text-muted-foreground">{stats?.todayOutCount ?? 0} movements</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <ArrowDownToLine className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">This Week In</p>
              {stats ? (
                <p className="text-xl font-bold break-words leading-tight">+{stats.weekIn}</p>
              ) : <Skeleton className="h-6 w-12" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <ArrowUpFromLine className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground truncate">This Week Out</p>
              {stats ? (
                <p className="text-xl font-bold break-words leading-tight">-{stats.weekOut}</p>
              ) : <Skeleton className="h-6 w-12" />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Timeline + Chart */}
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline" className="cursor-pointer">
            <Activity className="w-4 h-4 mr-2" />Timeline
          </TabsTrigger>
          <TabsTrigger value="chart" className="cursor-pointer">
            <BarChart3 className="w-4 h-4 mr-2" />Daily Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <MovementTimeline />
        </TabsContent>
        <TabsContent value="chart" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <DailyChart />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record movement dialog */}
      {showRecord && (
        <RecordMovementDialog
          defaultType={showRecord}
          onClose={() => setShowRecord(null)}
        />
      )}
    </div>
  );
}
