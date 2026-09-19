import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { fmt, CHART_COLORS } from "./report-utils.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";

export default function InventoryTab() {
  const inventory = useQuery(api.reports.inventorySummary);
  const topProducts = useQuery(api.reports.topProducts, { limit: 10 });
  const valuation = useQuery(api.advancedReports.inventoryValuation);
  const movements = useQuery(api.advancedReports.stockMovementReport, { days: 30 });

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Active Products</p>
            {inventory === undefined ? <Skeleton className="h-6 w-12 mt-1" /> : (
              <p className="text-xl font-bold mt-0.5 break-words leading-tight">{inventory.totalProducts}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Total Inventory Value</p>
            {valuation === undefined ? <Skeleton className="h-6 w-20 mt-1" /> : (
              <p className="text-xl font-bold mt-0.5 text-primary break-words leading-tight">{fmt(valuation.totalValue)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Low Stock Items</p>
            {inventory === undefined ? <Skeleton className="h-6 w-12 mt-1" /> : (
              <p className={cn("text-xl font-bold mt-0.5 break-words leading-tight", inventory.lowStockCount > 0 ? "text-amber-600" : "text-green-600")}>
                {inventory.lowStockCount}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">30-Day Movements</p>
            {movements === undefined ? <Skeleton className="h-6 w-12 mt-1" /> : (
              <p className="text-xl font-bold mt-0.5 break-words leading-tight">{movements.totalMovements}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stock Movement Chart */}
      {movements && movements.dailyVolume.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Stock Movements (Last 30 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={movements.dailyVolume}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(l: unknown) => new Date(String(l)).toLocaleDateString()} />
                <Bar dataKey="inQty" name="Stock In" fill="oklch(0.6 0.118 184.704)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="outQty" name="Stock Out" fill="oklch(0.577 0.245 27.325)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 text-sm mt-3">
              <span className="text-green-600 font-medium">In: {movements.totalIn}</span>
              <span className="text-red-600 font-medium">Out: {movements.totalOut}</span>
              <span className="font-medium">Net: {movements.netChange >= 0 ? "+" : ""}{movements.netChange}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Value by Category */}
        {valuation && valuation.byCategory.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Value by Category</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={valuation.byCategory}
                    dataKey="value"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {valuation.byCategory.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Top Products by units sold */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Products by Units Sold</CardTitle></CardHeader>
          <CardContent>
            {topProducts === undefined ? <Skeleton className="h-64 w-full" /> : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No sales data yet</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-sm font-bold text-primary">{p.quantity} units</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Movers Table */}
      {movements && movements.topMovers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top Moving Products (Last 30 Days)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Product</th>
                    <th className="text-right p-2 font-medium">Stock In</th>
                    <th className="text-right p-2 font-medium">Stock Out</th>
                    <th className="text-right p-2 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.topMovers.map((m, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium">{m.name}</td>
                      <td className="p-2 text-right text-green-600">+{m.inQty}</td>
                      <td className="p-2 text-right text-red-600">-{m.outQty}</td>
                      <td className={cn("p-2 text-right font-medium", m.net >= 0 ? "text-green-600" : "text-red-600")}>
                        {m.net >= 0 ? "+" : ""}{m.net}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Low stock list */}
      {inventory && inventory.lowStockItems.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader><CardTitle className="text-base text-amber-700 dark:text-amber-400">Low Stock Alerts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {inventory.lowStockItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm py-2 border-b last:border-0">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-amber-600">{item.quantity} / {item.threshold} min</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
