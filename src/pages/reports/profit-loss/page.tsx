/**
 * Profit & Loss Report page.
 * Architecture: all amounts from posted journalLines only.
 * Contra-revenue accounts (e.g. Sales Returns) appear as deductions from Revenue.
 * Comparative column switchable between previous period / same period last year.
 * % of Net Revenue column on every line.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import ReportShell from "@/components/reports/ReportShell.tsx";
import DrillDownDrawer, { useDrillDown } from "@/components/reports/DrillDownDrawer.tsx";
import type { PLRow } from "@/convex/reports/financialStatements.ts";
import { cn } from "@/lib/utils.ts";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function PLRow({
  label,
  amount,
  compAmount,
  variance,
  variancePct,
  pctOfRevenue,
  indent = false,
  bold = false,
  drill,
  accountId,
}: {
  label: string;
  amount: number;
  compAmount?: number;
  variance?: number;
  variancePct?: number | null;
  pctOfRevenue?: number | null;
  indent?: boolean;
  bold?: boolean;
  drill: ReturnType<typeof useDrillDown>;
  accountId?: string;
}) {
  return (
    <tr className={cn("border-b hover:bg-muted/30 transition-colors", bold && "font-semibold bg-muted/10")}>
      <td className={cn("py-1.5 px-3 text-sm", indent && "pl-8")}>{label}</td>
      <td
        className="py-1.5 px-3 text-right tabular-nums text-sm cursor-pointer hover:text-primary"
        onClick={() => accountId && drill.open({ label, lines: [] })}
      >
        {fmt(amount)}
      </td>
      <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">
        {pctOfRevenue !== undefined ? fmtPct(pctOfRevenue) : ""}
      </td>
      {compAmount !== undefined && (
        <td className="py-1.5 px-3 text-right tabular-nums text-sm text-muted-foreground">{fmt(compAmount)}</td>
      )}
      {variance !== undefined && (
        <td className={cn("py-1.5 px-3 text-right tabular-nums text-sm", variance >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
          {variance >= 0 ? "+" : ""}{fmt(variance)}
        </td>
      )}
      {variancePct !== undefined && (
        <td className={cn("py-1.5 px-3 text-right tabular-nums text-sm", (variancePct ?? 0) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
          {fmtPct(variancePct)}
        </td>
      )}
    </tr>
  );
}

export default function ProfitLossPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [comparativeMode, setComparativeMode] = useState<"same_period_last_year" | "previous_period">("same_period_last_year");
  const drill = useDrillDown();

  const result = useQuery(api.reports.financialStatements.getProfitAndLoss, {
    startDate, endDate, comparativeMode,
  });

  const dateRange = { startDate, endDate };

  const cols = 5; // label, amount, %, comp, variance, variance%

  return (
    <>
      <ReportShell
        title="Profit & Loss"
        subtitle={`${format(new Date(startDate), "d MMM yyyy")} – ${format(new Date(endDate), "d MMM yyyy")}`}
        dateRange={dateRange}
        onDateRangeChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }}
        toolbar={
          <Select value={comparativeMode} onValueChange={(v) => setComparativeMode(v as typeof comparativeMode)}>
            <SelectTrigger className="w-[200px] h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same_period_last_year">vs Same Period Last Year</SelectItem>
              <SelectItem value="previous_period">vs Previous Period</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        {result === undefined ? (
          <div className="space-y-2">{Array.from({ length: 15 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2 px-3">Account</th>
                <th className="py-2 px-3 text-right w-32">Amount</th>
                <th className="py-2 px-3 text-right w-20">% Rev</th>
                <th className="py-2 px-3 text-right w-32">Comparative</th>
                <th className="py-2 px-3 text-right w-28">Variance</th>
                <th className="py-2 px-3 text-right w-20">Var %</th>
              </tr>
            </thead>
            <tbody>
              {/* Revenue */}
              <tr><td colSpan={6} className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</td></tr>
              {result.revenueRows.map((r) => (
                <PLRow key={r.accountId} label={r.name} amount={r.amount} compAmount={r.comparativeAmount} variance={r.variance} variancePct={r.variancePct} pctOfRevenue={r.pctOfRevenue} indent drill={drill} accountId={r.accountId} />
              ))}
              <PLRow label="Total Revenue" amount={result.totalRevenue} compAmount={result.comparativeTotalRevenue} variance={result.totalRevenue - result.comparativeTotalRevenue} variancePct={result.comparativeTotalRevenue !== 0 ? ((result.totalRevenue - result.comparativeTotalRevenue) / Math.abs(result.comparativeTotalRevenue)) * 100 : null} pctOfRevenue={100} bold drill={drill} />

              {/* Contra Revenue */}
              {result.contraRevenueRows.length > 0 && (
                <>
                  <tr><td colSpan={6} className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Less: Sales Returns & Discounts</td></tr>
                  {result.contraRevenueRows.map((r) => (
                    <PLRow key={r.accountId} label={r.name} amount={r.amount} compAmount={r.comparativeAmount} variance={r.variance} variancePct={r.variancePct} pctOfRevenue={r.pctOfRevenue} indent drill={drill} accountId={r.accountId} />
                  ))}
                </>
              )}

              <PLRow label="Net Revenue" amount={result.netRevenue} compAmount={result.comparativeNetRevenue} variance={result.netRevenue - result.comparativeNetRevenue} variancePct={result.comparativeNetRevenue !== 0 ? ((result.netRevenue - result.comparativeNetRevenue) / Math.abs(result.comparativeNetRevenue)) * 100 : null} pctOfRevenue={100} bold drill={drill} />

              {/* COGS */}
              {result.cogsRows.length > 0 && (
                <>
                  <tr><td colSpan={6} className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cost of Goods Sold</td></tr>
                  {result.cogsRows.map((r) => (
                    <PLRow key={r.accountId} label={r.name} amount={r.amount} compAmount={r.comparativeAmount} variance={r.variance} variancePct={r.variancePct} pctOfRevenue={r.pctOfRevenue} indent drill={drill} accountId={r.accountId} />
                  ))}
                </>
              )}

              <PLRow
                label={`Gross Profit${result.grossMarginPct !== null ? ` (margin ${result.grossMarginPct.toFixed(1)}%)` : ""}`}
                amount={result.grossProfit}
                compAmount={result.comparativeGrossProfit}
                variance={result.grossProfit - result.comparativeGrossProfit}
                variancePct={result.comparativeGrossProfit !== 0 ? ((result.grossProfit - result.comparativeGrossProfit) / Math.abs(result.comparativeGrossProfit)) * 100 : null}
                pctOfRevenue={result.netRevenue !== 0 ? (result.grossProfit / result.netRevenue) * 100 : null}
                bold
                drill={drill}
              />

              {/* Operating Expenses */}
              {result.expenseRows.length > 0 && (
                <>
                  <tr><td colSpan={6} className="pt-3 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operating Expenses</td></tr>
                  {result.expenseRows.map((r) => (
                    <PLRow key={r.accountId} label={r.name} amount={r.amount} compAmount={r.comparativeAmount} variance={r.variance} variancePct={r.variancePct} pctOfRevenue={r.pctOfRevenue} indent drill={drill} accountId={r.accountId} />
                  ))}
                  <PLRow label="Total Operating Expenses" amount={result.totalExpenses} compAmount={result.comparativeTotalExpenses} variance={result.totalExpenses - result.comparativeTotalExpenses} variancePct={result.comparativeTotalExpenses !== 0 ? ((result.totalExpenses - result.comparativeTotalExpenses) / Math.abs(result.comparativeTotalExpenses)) * 100 : null} pctOfRevenue={result.netRevenue !== 0 ? (result.totalExpenses / result.netRevenue) * 100 : null} bold drill={drill} />
                </>
              )}

              {/* Net Profit */}
              <tr className="border-t-2">
                <td colSpan={6} className="py-1" />
              </tr>
              <PLRow
                label="Net Profit"
                amount={result.netProfit}
                compAmount={result.comparativeNetProfit}
                variance={result.netProfit - result.comparativeNetProfit}
                variancePct={result.comparativeNetProfit !== 0 ? ((result.netProfit - result.comparativeNetProfit) / Math.abs(result.comparativeNetProfit)) * 100 : null}
                pctOfRevenue={result.netRevenue !== 0 ? (result.netProfit / result.netRevenue) * 100 : null}
                bold
                drill={drill}
              />
            </tbody>
          </table>
        )}
      </ReportShell>
      <DrillDownDrawer state={drill} />
    </>
  );
}
