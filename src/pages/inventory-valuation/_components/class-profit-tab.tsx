import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export default function ClassProfitTab() {
  const summary = useQuery(api.inventoryValuation.getClassProfitSummary);

  if (!summary) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  if (summary.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><BarChart3 /></EmptyMedia>
          <EmptyTitle>No class data yet</EmptyTitle>
          <EmptyDescription>Create classes and assign products to them to see profit breakdown by class/department</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const totalRevenue = summary.reduce((s, c) => s + c.totalRevenue, 0);
  const totalCost = summary.reduce((s, c) => s + c.totalCostOfGoods, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overall summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-red-600">{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-muted-foreground">Cost of Goods</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className={cn("text-2xl font-bold", totalProfit >= 0 ? "text-green-600" : "text-red-600")}>
              {totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Gross Profit</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className={cn("text-2xl font-bold", overallMargin >= 0 ? "text-green-600" : "text-red-600")}>
              {overallMargin.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Overall Margin</p>
          </CardContent>
        </Card>
      </div>

      {/* Class breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profit & Loss by Class</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-2 px-2 font-medium">Class</th>
                  <th className="text-right py-2 px-2 font-medium">Products</th>
                  <th className="text-right py-2 px-2 font-medium">Revenue</th>
                  <th className="text-right py-2 px-2 font-medium">COGS</th>
                  <th className="text-right py-2 px-2 font-medium">Gross Profit</th>
                  <th className="text-right py-2 px-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((cls) => (
                  <tr key={cls.classId} className="border-b last:border-0">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cls.className}</span>
                        <Badge variant="secondary" className="text-[10px]">{cls.productCount} items</Badge>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-mono">{cls.productCount}</td>
                    <td className="py-2 px-2 text-right font-mono">{cls.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2 px-2 text-right font-mono text-red-600">{cls.totalCostOfGoods.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2 px-2 text-right font-mono">
                      <span className={cn("flex items-center justify-end gap-1", cls.grossProfit >= 0 ? "text-green-600" : "text-red-600")}>
                        {cls.grossProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {cls.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px]",
                          cls.margin >= 20 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          cls.margin >= 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        )}
                      >
                        {cls.margin.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="py-2 px-2">Total</td>
                  <td className="py-2 px-2 text-right font-mono">{summary.reduce((s, c) => s + c.productCount, 0)}</td>
                  <td className="py-2 px-2 text-right font-mono">{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-2 text-right font-mono text-red-600">{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-2 px-2 text-right font-mono">
                    <span className={cn(totalProfit >= 0 ? "text-green-600" : "text-red-600")}>
                      {totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Badge variant="secondary" className="text-[10px]">{overallMargin.toFixed(1)}%</Badge>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
