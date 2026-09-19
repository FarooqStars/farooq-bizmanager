import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Receipt, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPeriodsForYear(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const periods: string[] = [];
  for (let m = 1; m <= 12; m++) {
    periods.push(`${year}-${String(m).padStart(2, "0")}`);
  }
  return periods;
}

export default function TaxReportsTab() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const summary = useQuery(api.tax.getTaxSummary, { period });
  const transactions = useQuery(api.tax.getTransactionsByPeriod, { period });
  const settings = useQuery(api.tax.getSettings);

  const periods = getPeriodsForYear();

  if (summary === undefined || transactions === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!settings?.isEnabled) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
          <EmptyTitle>{t("tax.reports_disabled_title")}</EmptyTitle>
          <EmptyDescription>{t("tax.reports_disabled_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Build chart data for monthly view
  const chartData = periods.map((p) => {
    const monthTransactions = transactions.filter((tx) => tx.period === p);
    const collected = monthTransactions
      .filter((tx) => tx.type === "collected")
      .reduce((sum, tx) => sum + tx.taxAmount, 0);
    const paid = monthTransactions
      .filter((tx) => tx.type === "paid")
      .reduce((sum, tx) => sum + tx.taxAmount, 0);
    return {
      month: p.split("-")[1],
      collected,
      paid,
    };
  });

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-4">
        <Label className="font-medium">{t("tax.period")}</Label>
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("tax.total_collected")}</p>
                <p className="text-2xl font-bold">{fmt(summary?.totalCollected ?? 0)}</p>
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
                <p className="text-sm text-muted-foreground">{t("tax.total_paid")}</p>
                <p className="text-2xl font-bold">{fmt(summary?.totalPaid ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Scale className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("tax.net_liability")}</p>
                <p className="text-2xl font-bold">{fmt(summary?.netLiability ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tax.yearly_overview")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="collected" fill="#22c55e" name={t("tax.collected")} radius={[4, 4, 0, 0]} />
                <Bar dataKey="paid" fill="#ef4444" name={t("tax.paid_label")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Transaction List */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("tax.transactions")} ({transactions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.slice(0, 20).map((tx) => (
                <div key={tx._id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{tx.referenceNumber ?? tx.referenceId}</p>
                    <p className="text-xs text-muted-foreground">{tx.description ?? tx.referenceType}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${tx.type === "collected" ? "text-green-600" : "text-red-600"}`}>
                      {tx.type === "collected" ? "+" : "-"}{fmt(tx.taxAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={className}>{children}</span>;
}
