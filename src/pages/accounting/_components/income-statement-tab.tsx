/**
 * Formal Profit & Loss (Income Statement) tab for the Accounting page.
 * Shows revenue, COGS, gross profit, operating expenses, and net profit
 * from posted journal entries, with period comparison.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Printer, TrendingUp, TrendingDown, ArrowUpDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";
import { generateProfitLossHtml } from "@/lib/print-templates/profit-loss-template.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

export default function IncomeStatementTab() {
  const { t, i18n } = useTranslation();
  const [periodType, setPeriodType] = useState<string>("month");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // first of current month
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showReport, setShowReport] = useState(false);

  const profile = useQuery(api.companyProfile.get);
  const logoUrl = useQuery(
    api.companyProfile.getLogoUrl,
    profile?.logoStorageId ? { storageId: profile.logoStorageId as Id<"_storage"> } : "skip"
  );

  const plData = useQuery(
    api.profitAndLoss.getProfitAndLoss,
    showReport ? { startDate, endDate } : "skip"
  );

  const handlePresetChange = (preset: string) => {
    setPeriodType(preset);
    const now = new Date();
    let start: Date;
    const end = now;

    switch (preset) {
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter":
        start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "last_month": {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end.setDate(0); // last day of previous month
        break;
      }
      case "last_quarter": {
        const qStart = Math.floor(now.getMonth() / 3) * 3 - 3;
        start = new Date(now.getFullYear(), qStart, 1);
        end.setFullYear(now.getFullYear());
        end.setMonth(qStart + 3);
        end.setDate(0);
        break;
      }
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
    setShowReport(false);
  };

  const handleGenerate = () => {
    setShowReport(true);
  };

  const handlePrint = () => {
    if (!plData) return;
    const html = generateProfitLossHtml(plData, profile, logoUrl, i18n.language);
    openPrintWindow(html);
  };

  const { fmt: fmtCurrency } = useCurrency();

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t("profitLoss.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>{t("profitLoss.period")}</Label>
              <Select value={periodType} onValueChange={handlePresetChange}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month" className="cursor-pointer">{t("profitLoss.thisMonth")}</SelectItem>
                  <SelectItem value="quarter" className="cursor-pointer">{t("profitLoss.thisQuarter")}</SelectItem>
                  <SelectItem value="year" className="cursor-pointer">{t("profitLoss.thisYear")}</SelectItem>
                  <SelectItem value="last_month" className="cursor-pointer">{t("profitLoss.lastMonth")}</SelectItem>
                  <SelectItem value="last_quarter" className="cursor-pointer">{t("profitLoss.lastQuarter")}</SelectItem>
                  <SelectItem value="custom" className="cursor-pointer">{t("profitLoss.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("profitLoss.from")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPeriodType("custom");
                  setShowReport(false);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("profitLoss.to")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPeriodType("custom");
                  setShowReport(false);
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerate} className="w-full cursor-pointer">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                {t("profitLoss.generate")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {showReport && !plData && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {/* Report results */}
      {plData && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("profitLoss.totalRevenue")}</p>
                <p className="text-lg font-bold mt-1 text-green-600 break-words leading-tight">{fmtCurrency(plData.revenue.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("profitLoss.cogs")}</p>
                <p className="text-lg font-bold mt-1 text-orange-600 break-words leading-tight">{fmtCurrency(plData.costOfGoodsSold.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("profitLoss.grossProfit")}</p>
                <p className={cn("text-lg font-bold mt-1 break-words leading-tight", plData.grossProfit >= 0 ? "text-green-600" : "text-red-600")}>
                  {fmtCurrency(plData.grossProfit)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("profitLoss.opExpenses")}</p>
                <p className="text-lg font-bold mt-1 text-red-600 break-words leading-tight">{fmtCurrency(plData.operatingExpenses.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("profitLoss.netProfit")}</p>
                <p className={cn("text-lg font-bold mt-1 break-words leading-tight", plData.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                  {fmtCurrency(plData.netProfit)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Print button */}
          <div className="flex gap-2">
            <Button onClick={handlePrint} className="cursor-pointer">
              <Printer className="w-4 h-4 mr-2" />
              {t("profitLoss.print")}
            </Button>
          </div>

          {/* Detailed P&L table */}
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-2 text-left font-semibold w-16">{t("profitLoss.code")}</th>
                    <th className="py-2 px-2 text-left font-semibold">{t("profitLoss.account")}</th>
                    <th className="py-2 px-2 text-right font-semibold">{t("profitLoss.current")}</th>
                    <th className="py-2 px-2 text-right font-semibold">{t("profitLoss.previous")}</th>
                    <th className="py-2 px-2 text-right font-semibold">{t("profitLoss.change")}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue Section */}
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={5} className="py-2 px-2 uppercase text-xs tracking-wider">
                      {t("profitLoss.revenue")}
                    </td>
                  </tr>
                  {plData.revenue.accounts.map((acc) => (
                    <AccountRow key={acc.accountId} acc={acc} type="revenue" fmtCurrency={fmtCurrency} />
                  ))}
                  <SubtotalRow label={t("profitLoss.totalRevenue")} current={plData.revenue.total} previous={plData.revenue.previousTotal} fmtCurrency={fmtCurrency} positiveIsGood />

                  {/* COGS Section */}
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={5} className="py-2 px-2 uppercase text-xs tracking-wider">
                      {t("profitLoss.cogs")}
                    </td>
                  </tr>
                  {plData.costOfGoodsSold.accounts.map((acc) => (
                    <AccountRow key={acc.accountId} acc={acc} type="expense" fmtCurrency={fmtCurrency} />
                  ))}
                  {plData.costOfGoodsSold.accounts.length === 0 && (
                    <tr><td colSpan={5} className="py-2 px-2 text-muted-foreground italic text-xs">{t("profitLoss.noActivity")}</td></tr>
                  )}
                  <SubtotalRow label={t("profitLoss.totalCogs")} current={plData.costOfGoodsSold.total} previous={plData.costOfGoodsSold.previousTotal} fmtCurrency={fmtCurrency} positiveIsGood={false} />

                  {/* Gross Profit */}
                  <tr className="bg-green-50 dark:bg-green-950/20 font-bold border-y-2 border-green-200 dark:border-green-900">
                    <td className="py-2 px-2"></td>
                    <td className="py-2 px-2">{t("profitLoss.grossProfit")}</td>
                    <td className={cn("py-2 px-2 text-right", plData.grossProfit >= 0 ? "text-green-600" : "text-red-600")}>
                      {fmtCurrency(plData.grossProfit)}
                    </td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{fmtCurrency(plData.previousGrossProfit)}</td>
                    <td className="py-2 px-2 text-right">
                      <ChangeIndicator current={plData.grossProfit} previous={plData.previousGrossProfit} positiveIsGood />
                    </td>
                  </tr>

                  {/* Operating Expenses Section */}
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={5} className="py-2 px-2 uppercase text-xs tracking-wider">
                      {t("profitLoss.opExpenses")}
                    </td>
                  </tr>
                  {plData.operatingExpenses.accounts.map((acc) => (
                    <AccountRow key={acc.accountId} acc={acc} type="expense" fmtCurrency={fmtCurrency} />
                  ))}
                  {plData.operatingExpenses.accounts.length === 0 && (
                    <tr><td colSpan={5} className="py-2 px-2 text-muted-foreground italic text-xs">{t("profitLoss.noActivity")}</td></tr>
                  )}
                  <SubtotalRow label={t("profitLoss.totalOpExp")} current={plData.operatingExpenses.total} previous={plData.operatingExpenses.previousTotal} fmtCurrency={fmtCurrency} positiveIsGood={false} />

                  {/* Net Profit */}
                  <tr className="bg-blue-50 dark:bg-blue-950/20 font-bold border-y-2 border-blue-300 dark:border-blue-800">
                    <td className="py-3 px-2"></td>
                    <td className="py-3 px-2 text-base">{t("profitLoss.netProfit")}</td>
                    <td className={cn("py-3 px-2 text-right text-base", plData.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                      {fmtCurrency(plData.netProfit)}
                    </td>
                    <td className="py-3 px-2 text-right text-muted-foreground">{fmtCurrency(plData.previousNetProfit)}</td>
                    <td className="py-3 px-2 text-right">
                      <ChangeIndicator current={plData.netProfit} previous={plData.previousNetProfit} positiveIsGood />
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Margins */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase">{t("profitLoss.grossMargin")}</p>
                <p className={cn("text-2xl font-bold mt-1", (plData.grossProfitMargin ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                  {plData.grossProfitMargin !== null ? plData.grossProfitMargin.toFixed(1) + "%" : "N/A"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-muted-foreground font-semibold uppercase">{t("profitLoss.netMargin")}</p>
                <p className={cn("text-2xl font-bold mt-1", (plData.netProfitMargin ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                  {plData.netProfitMargin !== null ? plData.netProfitMargin.toFixed(1) + "%" : "N/A"}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

type AccountRowProps = {
  acc: { accountId: string; code: string; name: string; amount: number; previousAmount: number; changePercent: number | null };
  type: "revenue" | "expense";
  fmtCurrency: (n: number) => string;
};

function AccountRow({ acc, type, fmtCurrency }: AccountRowProps) {
  const change = acc.amount - acc.previousAmount;
  // For revenue, increase is good. For expenses, decrease is good.
  const isGood = type === "revenue" ? change >= 0 : change <= 0;

  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="py-1.5 px-2 text-xs font-mono text-muted-foreground">{acc.code}</td>
      <td className="py-1.5 px-2">{acc.name}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{fmtCurrency(acc.amount)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{fmtCurrency(acc.previousAmount)}</td>
      <td className="py-1.5 px-2 text-right">
        <span className={cn("text-xs font-medium", isGood ? "text-green-600" : "text-red-600")}>
          {acc.changePercent !== null
            ? `${acc.changePercent >= 0 ? "+" : ""}${acc.changePercent.toFixed(1)}%`
            : "-"}
        </span>
      </td>
    </tr>
  );
}

type SubtotalRowProps = {
  label: string;
  current: number;
  previous: number;
  fmtCurrency: (n: number) => string;
  positiveIsGood: boolean;
};

function SubtotalRow({ label, current, previous, fmtCurrency, positiveIsGood }: SubtotalRowProps) {
  return (
    <tr className="border-y font-semibold bg-muted/30">
      <td className="py-2 px-2"></td>
      <td className="py-2 px-2">{label}</td>
      <td className="py-2 px-2 text-right tabular-nums">{fmtCurrency(current)}</td>
      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtCurrency(previous)}</td>
      <td className="py-2 px-2 text-right">
        <ChangeIndicator current={current} previous={previous} positiveIsGood={positiveIsGood} />
      </td>
    </tr>
  );
}

function ChangeIndicator({ current, previous, positiveIsGood }: { current: number; previous: number; positiveIsGood: boolean }) {
  const change = current - previous;
  const isGood = positiveIsGood ? change >= 0 : change <= 0;

  if (change === 0) return <span className="text-xs text-muted-foreground">-</span>;

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", isGood ? "text-green-600" : "text-red-600")}>
      {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {previous !== 0 ? `${((change / Math.abs(previous)) * 100).toFixed(1)}%` : "New"}
    </span>
  );
}
