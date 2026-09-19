/**
 * Financial KPI tab — all figures sourced from the ledger only.
 * Previously this tab showed revenueByDay / revenueByMonth charts derived from
 * the sales table. Those functions were removed in Milestone 7 because they
 * produced a second, potentially conflicting revenue figure.
 * The KPI cards (revenueKpis) remain unchanged — they were already ledger-based.
 * The charts now use the ledger cash-flow query so every number on this page
 * traces back to a posted journal entry.
 */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Calendar, TrendingUp, BarChart3, DollarSign,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";
import { fmt, tooltipFmt, tooltipLabelDate } from "./report-utils.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";

export default function RevenueTab() {
  const { symbol } = useCurrency();
  const kpis = useQuery(api.reports.revenueKpis);
  // Cash flow from the ledger — used for both the trend and bar charts
  const cashFlow12 = useQuery(api.advancedReports.cashFlow, { months: 12 });
  const cashFlow1 = useQuery(api.advancedReports.cashFlow, { months: 1 });

  const kpiCards = [
    { label: "Today", value: kpis?.todayRev, icon: Calendar, color: "text-blue-600" },
    { label: "This Month", value: kpis?.monthRev, icon: TrendingUp, color: "text-green-600", change: kpis?.monthChange },
    { label: "This Year", value: kpis?.yearRev, icon: BarChart3, color: "text-purple-600" },
    { label: "All Time", value: kpis?.allRev, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color, change }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  {value === undefined ? (
                    <Skeleton className="h-6 w-20 mt-1" />
                  ) : (
                    <p className="text-lg font-bold mt-0.5 break-words leading-tight">{fmt(value)}</p>
                  )}
                  {change !== undefined && change !== null && (
                    <div className={cn("flex items-center gap-0.5 text-xs mt-0.5", change >= 0 ? "text-green-600" : "text-red-600")}>
                      {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(change).toFixed(1)}% vs last month
                    </div>
                  )}
                </div>
                <div className={cn("p-2 rounded-lg bg-muted flex-shrink-0", color)}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly cash in/out over last 12 months — ledger-based */}
      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Cash Flow (Last 12 Months) — Ledger</CardTitle></CardHeader>
        <CardContent>
          {cashFlow12 === undefined ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cashFlow12.monthly}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${symbol} ${v}`} />
                <Tooltip formatter={tooltipFmt} />
                <Bar dataKey="inflow" name="Cash In" fill="oklch(0.6 0.118 184.704)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Cash Out" fill="oklch(0.577 0.245 27.325)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Net cash flow trend */}
      <Card>
        <CardHeader><CardTitle className="text-base">Net Cash Flow Trend — Ledger</CardTitle></CardHeader>
        <CardContent>
          {cashFlow12 === undefined ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cashFlow12.monthly}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${symbol} ${v}`} />
                <Tooltip formatter={tooltipFmt} labelFormatter={tooltipLabelDate} />
                <Area type="monotone" dataKey="net" name="Net" stroke="oklch(0.45 0.18 250)" fill="oklch(0.45 0.18 250 / 0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Month net profit KPI */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">Month Expenses (Ledger)</p>
              <p className="text-lg font-bold mt-0.5 text-red-600 break-words leading-tight">{fmt(kpis.monthExpenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">Month Net Profit (Ledger)</p>
              <p className={cn("text-lg font-bold mt-0.5 break-words leading-tight", kpis.monthNetProfit >= 0 ? "text-green-600" : "text-red-600")}>
                {fmt(kpis.monthNetProfit)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">Total Sale Transactions</p>
              <p className="text-lg font-bold mt-0.5 break-words leading-tight">{kpis.totalSales}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
