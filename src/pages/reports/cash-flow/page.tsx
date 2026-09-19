/**
 * Cash Flow Statement page (indirect method).
 * Architecture: all amounts from posted journalLines only.
 * Reconciliation: Opening Cash + Net Change = Closing Cash, verified against
 * the sum of all cash/bank account balances at the end date.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import ReportShell from "@/components/reports/ReportShell.tsx";
import DrillDownDrawer, { useDrillDown } from "@/components/reports/DrillDownDrawer.tsx";
import type { CashFlowRow } from "@/convex/reports/financialStatements.ts";
import { cn } from "@/lib/utils.ts";

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CFRow({
  row,
  indent = false,
  drill,
}: {
  row: CashFlowRow;
  indent?: boolean;
  drill: ReturnType<typeof useDrillDown>;
}) {
  return (
    <tr className={cn("border-b hover:bg-muted/30 transition-colors", row.isSubtotal && "font-semibold bg-muted/10")}>
      <td className={cn("py-1.5 px-3 text-sm", indent && "pl-8")}>{row.label}</td>
      <td
        className={cn(
          "py-1.5 px-3 text-right tabular-nums text-sm",
          row.accountId && "cursor-pointer hover:text-primary",
          row.amount < 0 && "text-red-600 dark:text-red-400",
        )}
        onClick={() => row.accountId && drill.open({ label: row.label, lines: [] })}
      >
        {fmt(row.amount)}
      </td>
    </tr>
  );
}

export default function CashFlowPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const profile = useQuery(api.companyProfile.get);
  const drill = useDrillDown();

  const result = useQuery(api.reports.financialStatements.getCashFlow, {
    startDate,
    endDate,
    fiscalYearStartMonth: profile?.fiscalYearStartMonth ?? 1,
  });

  const dateRange = { startDate, endDate };

  return (
    <>
      <ReportShell
        title="Cash Flow Statement"
        subtitle={`${format(new Date(startDate), "d MMM yyyy")} – ${format(new Date(endDate), "d MMM yyyy")} · Indirect Method`}
        dateRange={dateRange}
        onDateRangeChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }}
      >
        {result === undefined ? (
          <div className="space-y-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <div className="space-y-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3 text-right w-36">Amount</th>
                </tr>
              </thead>

              {/* Operating */}
              <tbody>
                <tr><td colSpan={2} className="pt-4 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operating Activities</td></tr>
                {result.operating.map((row, i) => (
                  <CFRow key={i} row={row} indent={row.label !== "Net Profit"} drill={drill} />
                ))}
                <tr className="border-t font-semibold bg-muted/10">
                  <td className="py-2 px-3 text-sm">Net Cash from Operating Activities</td>
                  <td className={cn("py-2 px-3 text-right tabular-nums text-sm", result.netOperating < 0 && "text-red-600 dark:text-red-400")}>
                    {fmt(result.netOperating)}
                  </td>
                </tr>
              </tbody>

              {/* Investing */}
              <tbody>
                <tr><td colSpan={2} className="pt-4 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Investing Activities</td></tr>
                {result.investing.length === 0 && (
                  <tr><td colSpan={2} className="py-1.5 px-3 pl-8 text-sm text-muted-foreground italic">No investing activity</td></tr>
                )}
                {result.investing.map((row, i) => (
                  <CFRow key={i} row={row} indent drill={drill} />
                ))}
                <tr className="border-t font-semibold bg-muted/10">
                  <td className="py-2 px-3 text-sm">Net Cash from Investing Activities</td>
                  <td className={cn("py-2 px-3 text-right tabular-nums text-sm", result.netInvesting < 0 && "text-red-600 dark:text-red-400")}>
                    {fmt(result.netInvesting)}
                  </td>
                </tr>
              </tbody>

              {/* Financing */}
              <tbody>
                <tr><td colSpan={2} className="pt-4 pb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Financing Activities</td></tr>
                {result.financing.length === 0 && (
                  <tr><td colSpan={2} className="py-1.5 px-3 pl-8 text-sm text-muted-foreground italic">No financing activity</td></tr>
                )}
                {result.financing.map((row, i) => (
                  <CFRow key={i} row={row} indent drill={drill} />
                ))}
                <tr className="border-t font-semibold bg-muted/10">
                  <td className="py-2 px-3 text-sm">Net Cash from Financing Activities</td>
                  <td className={cn("py-2 px-3 text-right tabular-nums text-sm", result.netFinancing < 0 && "text-red-600 dark:text-red-400")}>
                    {fmt(result.netFinancing)}
                  </td>
                </tr>
              </tbody>

              {/* Summary */}
              <tbody>
                <tr><td colSpan={2} className="pt-4" /></tr>
                <tr className="border-t">
                  <td className="py-1.5 px-3 text-sm">Opening Cash Balance</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-sm">{fmt(result.openingCash)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-3 text-sm">Net Change in Cash</td>
                  <td className={cn("py-1.5 px-3 text-right tabular-nums text-sm", result.netChange < 0 && "text-red-600 dark:text-red-400")}>
                    {result.netChange >= 0 ? "+" : ""}{fmt(result.netChange)}
                  </td>
                </tr>
                <tr className="border-t-2 font-bold bg-muted/20">
                  <td className="py-2 px-3">Closing Cash Balance</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(result.closingCash)}</td>
                </tr>
              </tbody>
            </table>

            {/* Reconciliation check */}
            <div className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-lg border text-sm",
              result.reconciliationOk
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
                : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
            )}>
              {result.reconciliationOk
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-semibold">
                  {result.reconciliationOk ? "Cash reconciliation: PASS" : "Cash reconciliation: FAIL"}
                </p>
                <p className="text-xs mt-0.5">
                  Computed closing cash: {fmt(result.closingCash)} ·
                  Sum of cash/bank account balances: {fmt(result.cashAccountsSum)}
                  {!result.reconciliationOk && ` · Difference: ${fmt(Math.abs(result.closingCash - result.cashAccountsSum))}`}
                </p>
              </div>
            </div>
          </div>
        )}
      </ReportShell>
      <DrillDownDrawer state={drill} />
    </>
  );
}
