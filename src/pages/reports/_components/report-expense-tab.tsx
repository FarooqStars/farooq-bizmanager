import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";
import { fmt, tooltipFmtExpense, CHART_COLORS } from "./report-utils.tsx";

export default function ExpenseTab() {
  const expensesByCategory = useQuery(api.reports.expensesByCategory);
  const operationalCosts = useQuery(api.reports.operationalCosts);

  const opCostCards = [
    { label: "Vehicle Maintenance", value: operationalCosts?.vehicleMaintenance, color: "text-blue-600" },
    { label: "Vehicle Fuel", value: operationalCosts?.vehicleFuel, color: "text-amber-600" },
    { label: "Asset Maintenance", value: operationalCosts?.assetMaintenance, color: "text-purple-600" },
    { label: "Total Expenses", value: operationalCosts?.totalExpenses, color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {opCostCards.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              {value === undefined ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className={cn("text-lg font-bold mt-0.5 break-words leading-tight", color)}>{fmt(value)}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Expenses by Category</CardTitle></CardHeader>
          <CardContent>
            {expensesByCategory === undefined ? (
              <Skeleton className="h-64 w-full" />
            ) : expensesByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expense data</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {expensesByCategory.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipFmtExpense} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
          <CardContent>
            {expensesByCategory === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {expensesByCategory.map((cat, idx) => {
                  const total = expensesByCategory.reduce((s, c) => s + c.amount, 0);
                  const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{cat.name}</span>
                        <span className="text-muted-foreground">{fmt(cat.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
