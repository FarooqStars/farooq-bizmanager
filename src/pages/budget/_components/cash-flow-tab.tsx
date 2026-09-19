import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import { Banknote, ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";

export default function CashFlowTab() {
  const { t } = useTranslation();
  const forecast = useQuery(api.budgets.getCashFlowForecast);

  if (forecast === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!forecast) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Banknote /></EmptyMedia>
          <EmptyTitle>{t("budget.no_cashflow")}</EmptyTitle>
          <EmptyDescription>{t("budget.no_cashflow_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const chartData = forecast.forecast.map((f) => ({
    month: new Date(f.month + "-01").toLocaleDateString(undefined, { month: "short" }),
    inflow: f.inflow,
    outflow: f.outflow,
    balance: f.cumulativeBalance,
  }));

  const flowData = forecast.forecast.map((f) => ({
    month: new Date(f.month + "-01").toLocaleDateString(undefined, { month: "short" }),
    inflow: f.inflow,
    outflow: f.outflow,
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Banknote className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget.current_balance")}</p>
                <p className="text-2xl font-bold">{forecast.currentBalance.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget.receivables")}</p>
                <p className="text-2xl font-bold text-green-600">{forecast.totalReceivables.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("budget.payables")}</p>
                <p className="text-2xl font-bold text-red-600">{forecast.totalPayables.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projected Cash Position */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            {t("budget.projected_balance")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  name={t("budget.balance")}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Inflow vs Outflow */}
      <Card>
        <CardHeader>
          <CardTitle>{t("budget.inflow_vs_outflow")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="inflow" fill="#22c55e" name={t("budget.inflow")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" fill="#ef4444" name={t("budget.outflow")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Forecast table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("budget.forecast_detail")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">{t("budget.month")}</th>
                  <th className="text-right py-2 font-medium text-green-600">{t("budget.inflow")}</th>
                  <th className="text-right py-2 font-medium text-red-600">{t("budget.outflow")}</th>
                  <th className="text-right py-2 font-medium">{t("budget.net")}</th>
                  <th className="text-right py-2 font-medium">{t("budget.balance")}</th>
                </tr>
              </thead>
              <tbody>
                {forecast.forecast.map((f) => (
                  <tr key={f.month} className="border-b last:border-0">
                    <td className="py-2">
                      {new Date(f.month + "-01").toLocaleDateString(undefined, { year: "numeric", month: "long" })}
                    </td>
                    <td className="py-2 text-right text-green-600">+{f.inflow.toLocaleString()}</td>
                    <td className="py-2 text-right text-red-600">-{f.outflow.toLocaleString()}</td>
                    <td className={`py-2 text-right font-medium ${f.netCash >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {f.netCash >= 0 ? "+" : ""}{f.netCash.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-bold">{f.cumulativeBalance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
