import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Target } from "lucide-react";

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetVsActualTab() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const data = useQuery(api.budgets.getBudgetVsActual, { period });

  const now = new Date();
  const periods: string[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(now.getFullYear(), m, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  if (data === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Target /></EmptyMedia>
          <EmptyTitle>{t("budget.no_comparison")}</EmptyTitle>
          <EmptyDescription>{t("budget.no_comparison_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const totalBudget = data.reduce((sum, d) => sum + d.amount, 0);
  const totalActual = data.reduce((sum, d) => sum + d.actual, 0);
  const totalVariance = totalBudget - totalActual;
  const overBudgetCount = data.filter((d) => d.status === "over").length;

  const chartData = data.map((d) => ({
    name: d.name.length > 12 ? d.name.slice(0, 12) + "..." : d.name,
    budget: d.amount,
    actual: d.actual,
  }));

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((p) => (
            <SelectItem key={p} value={p}>
              {new Date(p + "-01").toLocaleDateString(undefined, { year: "numeric", month: "long" })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget.total_budget")}</p>
                <p className="text-2xl font-bold">{totalBudget.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget.total_actual")}</p>
                <p className="text-2xl font-bold">{totalActual.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalVariance >= 0 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                {totalVariance >= 0 ? <TrendingDown className="w-5 h-5 text-green-600" /> : <TrendingUp className="w-5 h-5 text-red-600" />}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget.variance")}</p>
                <p className={`text-2xl font-bold ${totalVariance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {totalVariance >= 0 ? "+" : ""}{totalVariance.toLocaleString()}
                </p>
                {overBudgetCount > 0 && (
                  <Badge variant="destructive" className="text-xs mt-1">{overBudgetCount} {t("budget.over_budget")}</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("budget.comparison_chart")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="budget" fill="#3b82f6" name={t("budget.budgeted")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#22c55e" name={t("budget.actual")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detail list */}
      <Card>
        <CardHeader>
          <CardTitle>{t("budget.variance_detail")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.map((item) => {
            const percent = item.amount > 0 ? Math.min((item.actual / item.amount) * 100, 150) : 0;
            return (
              <div key={item._id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{item.actual.toLocaleString()} / {item.amount.toLocaleString()}</span>
                    <Badge className={item.status === "under" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"}>
                      {item.variancePercent > 0 ? "+" : ""}{item.variancePercent}%
                    </Badge>
                  </div>
                </div>
                <Progress value={Math.min(percent, 100)} className={percent > 100 ? "[&>div]:bg-red-500" : ""} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
