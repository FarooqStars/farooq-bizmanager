/**
 * Sales Analytics tab — operational counts only.
 *
 * The old salesAnalytics query was deleted in Milestone 7 because it derived
 * totalRevenue and avgOrderValue from the operational sales table, creating a
 * second revenue figure that could diverge from the ledger-based P&L.
 *
 * This replacement shows purely operational information:
 *  - Number of orders per period
 *  - Top customers ranked by transaction COUNT (not spend)
 *  - Top products ranked by units sold (not revenue)
 * No monetary figures are shown here. For revenue, see the Financial tab.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CHART_COLORS } from "./report-utils.tsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

type Period = "week" | "month" | "quarter" | "year";

// Query sales orders with a count-only aggregate
import { useConvex } from "convex/react";
import { useMemo } from "react";

type OrderStat = { date: string; orders: number };
type CustomerStat = { name: string; count: number };
type ProductStat = { name: string; quantity: number };

function useSalesOperational(period: Period) {
  // We read from the revenueKpis only to get totalSales count (already ledger-safe).
  // For the breakdowns we use the Report Builder's "sales" source which returns
  // individual records — we then aggregate client-side by count, not by money.
  const rows = useQuery(api.reportBuilder.runReport, {
    dataSource: "sales",
    filters: [],
    sortBy: "date",
    sortOrder: "asc",
  });

  return useMemo(() => {
    if (!rows) return null;

    const now = new Date();
    let cutoff: Date;
    switch (period) {
      case "week": cutoff = new Date(now.getTime() - 7 * 86400000); break;
      case "month": cutoff = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "quarter": cutoff = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); break;
      case "year": cutoff = new Date(now.getFullYear(), 0, 1); break;
    }
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const periodRows = rows.rows.filter(
      (r) => typeof r.date === "string" && r.date >= cutoffStr && r.status !== "refunded"
    );

    // Daily order count
    const dailyMap: Record<string, number> = {};
    for (const r of periodRows) {
      const date = String(r.date);
      dailyMap[date] = (dailyMap[date] ?? 0) + 1;
    }
    const dailyBreakdown: OrderStat[] = Object.entries(dailyMap)
      .map(([date, orders]) => ({ date, orders }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top customers by count
    const custMap: Record<string, number> = {};
    for (const r of periodRows) {
      const name = String(r.customerName || "Unknown");
      if (name && name !== "Unknown") custMap[name] = (custMap[name] ?? 0) + 1;
    }
    const topCustomers: CustomerStat[] = Object.entries(custMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { totalOrders: periodRows.length, dailyBreakdown, topCustomers };
  }, [rows, period]);
}

export default function SalesAnalyticsTab() {
  const [period, setPeriod] = useState<Period>("month");
  const analytics = useSalesOperational(period);
  const topProducts = useQuery(api.reports.topProducts, { limit: 10 });

  if (!analytics) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {(["week", "month", "quarter", "year"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "default" : "secondary"}
            className="cursor-pointer capitalize"
            onClick={() => setPeriod(p)}
          >
            {p === "week" ? "This Week" : p === "month" ? "This Month" : p === "quarter" ? "This Quarter" : "This Year"}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing order counts only. For revenue figures, use the <strong>Financial</strong> or <strong>P&amp;L</strong> tabs — those read exclusively from the ledger.
      </p>

      {/* KPIs — counts only */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total Orders</p>
            <p className="text-xl font-bold">{analytics.totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Unique Days with Orders</p>
            <p className="text-xl font-bold">{analytics.dailyBreakdown.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily order count trend */}
      {analytics.dailyBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Order Count by Day</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analytics.dailyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: unknown) => [Number(v), "Orders"]}
                  labelFormatter={(l: unknown) => new Date(String(l)).toLocaleDateString()}
                />
                <Bar dataKey="orders" fill="oklch(0.45 0.18 250)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Customers by order count */}
        {analytics.topCustomers.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Top Customers (by Order Count)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics.topCustomers.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-sm font-bold">{c.count} order{c.count !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Products by units sold */}
        {topProducts && topProducts.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Top Products (by Units Sold)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                    <span className="text-sm font-bold">{p.quantity} units</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
