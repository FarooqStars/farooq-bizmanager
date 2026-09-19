/**
 * Balance Sheet Report page.
 * Architecture: all amounts from posted journalLines only.
 * Equity section includes two computed rows: Retained Earnings (prior periods)
 * and Current Period Earnings.
 * Equation check displayed on the report.
 * Comparative column: same date one year earlier.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import ReportShell from "@/components/reports/ReportShell.tsx";
import DrillDownDrawer, { useDrillDown } from "@/components/reports/DrillDownDrawer.tsx";
import type { BalanceSheetSection } from "@/convex/reports/financialStatements.ts";
import { cn } from "@/lib/utils.ts";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionTable({
  section,
  drill,
  showComparative,
}: {
  section: BalanceSheetSection;
  drill: ReturnType<typeof useDrillDown>;
  showComparative: boolean;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-1 px-3 font-semibold text-sm text-muted-foreground uppercase tracking-wide text-xs">
          {section.label}
        </td>
      </tr>
      {section.rows.map((row) => (
        <tr key={row.accountId} className="border-b hover:bg-muted/30 transition-colors">
          <td className="py-1.5 px-3 pl-8 text-sm">{row.name}</td>
          <td
            className="py-1.5 px-3 text-right tabular-nums text-sm cursor-pointer hover:text-primary"
            onClick={() => drill.open({ label: row.name, lines: [] })}
          >
            {fmt(row.amount)}
          </td>
          {showComparative && (
            <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
              {fmt(row.comparativeAmount)}
            </td>
          )}
        </tr>
      ))}
      <tr className="border-t font-semibold">
        <td className="py-2 px-3 text-sm">Total {section.label}</td>
        <td className="py-2 px-3 text-right tabular-nums text-sm">{fmt(section.total)}</td>
        {showComparative && (
          <td className="py-2 px-3 text-right tabular-nums text-sm text-muted-foreground">{fmt(section.comparativeTotal)}</td>
        )}
      </tr>
    </tbody>
  );
}

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const profile = useQuery(api.companyProfile.get);
  const drill = useDrillDown();

  const result = useQuery(api.reports.financialStatements.getBalanceSheet, {
    asOfDate,
    fiscalYearStartMonth: profile?.fiscalYearStartMonth ?? 1,
  });

  const dateRange = { startDate: asOfDate, endDate: asOfDate };
  const showComparative = true;

  return (
    <>
      <ReportShell
        title="Balance Sheet"
        subtitle={`As of ${format(new Date(asOfDate), "d MMMM yyyy")}`}
        dateRange={dateRange}
        onDateRangeChange={(r) => setAsOfDate(r.endDate)}
      >
        {result === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : (
          <div className="space-y-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 px-3">Account</th>
                  <th className="py-2 px-3 text-right w-36">{format(new Date(asOfDate), "dd MMM yyyy")}</th>
                  {showComparative && (
                    <th className="py-2 px-3 text-right w-36 text-muted-foreground">
                      {format(new Date(result.comparativeDate), "dd MMM yyyy")}
                    </th>
                  )}
                </tr>
              </thead>

              {/* ASSETS */}
              <SectionTable section={result.sections.currentAssets} drill={drill} showComparative={showComparative} />
              <SectionTable section={result.sections.nonCurrentAssets} drill={drill} showComparative={showComparative} />
              <tbody>
                <tr className="border-t-2 font-bold bg-muted/20">
                  <td className="py-2 px-3">TOTAL ASSETS</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(result.totalAssets)}</td>
                  {showComparative && <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{fmt(result.comparativeTotalAssets)}</td>}
                </tr>
              </tbody>

              {/* LIABILITIES */}
              <SectionTable section={result.sections.currentLiabilities} drill={drill} showComparative={showComparative} />
              <SectionTable section={result.sections.nonCurrentLiabilities} drill={drill} showComparative={showComparative} />

              {/* EQUITY */}
              <tbody>
                <tr>
                  <td colSpan={showComparative ? 3 : 2} className="pt-4 pb-1 px-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Equity</td>
                </tr>
                {result.sections.equity.rows.map((row) => (
                  <tr key={row.accountId} className="border-b hover:bg-muted/30">
                    <td className="py-1.5 px-3 pl-8 text-sm">{row.name}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-sm cursor-pointer hover:text-primary" onClick={() => drill.open({ label: row.name, lines: [] })}>
                      {fmt(row.amount)}
                    </td>
                    {showComparative && <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">{fmt(row.comparativeAmount)}</td>}
                  </tr>
                ))}
                {/* Computed equity rows */}
                <tr className="border-b hover:bg-muted/30">
                  <td className="py-1.5 px-3 pl-8 text-sm italic text-muted-foreground">Retained Earnings (Prior Periods)</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-sm">{fmt(result.retainedEarnings)}</td>
                  {showComparative && <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">{fmt(result.comparativeRetainedEarnings)}</td>}
                </tr>
                <tr className="border-b hover:bg-muted/30">
                  <td className="py-1.5 px-3 pl-8 text-sm italic text-muted-foreground">Current Period Earnings</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-sm">{fmt(result.currentPeriodEarnings)}</td>
                  {showComparative && <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">{fmt(result.comparativeCurrentPeriodEarnings)}</td>}
                </tr>
                <tr className="border-t font-semibold">
                  <td className="py-2 px-3 text-sm">Total Equity</td>
                  <td className="py-2 px-3 text-right tabular-nums text-sm">
                    {fmt(result.sections.equity.total + result.retainedEarnings + result.currentPeriodEarnings)}
                  </td>
                  {showComparative && (
                    <td className="py-2 px-3 text-right tabular-nums text-sm text-muted-foreground">
                      {fmt(result.sections.equity.comparativeTotal + result.comparativeRetainedEarnings + result.comparativeCurrentPeriodEarnings)}
                    </td>
                  )}
                </tr>
              </tbody>

              {/* TOTAL LIABILITIES + EQUITY */}
              <tbody>
                <tr className="border-t-2 font-bold bg-muted/20">
                  <td className="py-2 px-3">TOTAL LIABILITIES + EQUITY</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(result.totalLiabilitiesAndEquity)}</td>
                  {showComparative && <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{fmt(result.comparativeTotalLiabilitiesAndEquity)}</td>}
                </tr>
              </tbody>
            </table>

            {/* Equation check */}
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium",
              result.inBalance
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
                : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
            )}>
              {result.inBalance ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {result.inBalance
                ? `Assets (${fmt(result.totalAssets)}) = Liabilities + Equity (${fmt(result.totalLiabilitiesAndEquity)}) — BALANCED`
                : `Assets (${fmt(result.totalAssets)}) ≠ Liabilities + Equity (${fmt(result.totalLiabilitiesAndEquity)}) — difference: ${fmt(Math.abs(result.totalAssets - result.totalLiabilitiesAndEquity))}`
              }
            </div>
          </div>
        )}
      </ReportShell>
      <DrillDownDrawer state={drill} />
    </>
  );
}
