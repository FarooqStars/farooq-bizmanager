/**
 * Report 18: Purchases by Vendor
 * Spend per vendor for the period, comparative, % of total.
 * Sourced from posted journal lines (AP credits = purchase obligations).
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import ReportShell from "@/components/reports/ReportShell.tsx";
import type { DateRange } from "@/components/reports/DateRangePicker.tsx";
import { fmt } from "../../_components/report-utils.tsx";

function defaultRange(): DateRange {
  const now = new Date();
  return { startDate: `${now.getFullYear()}-01-01`, endDate: now.toISOString().slice(0, 10) };
}

function prevYearRange(r: DateRange) {
  return {
    comparativeStartDate: r.startDate.replace(/^\d{4}/, String(parseInt(r.startDate.slice(0, 4)) - 1)),
    comparativeEndDate: r.endDate.replace(/^\d{4}/, String(parseInt(r.endDate.slice(0, 4)) - 1)),
  };
}

export default function PurchasesByVendor() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange());

  const comp = prevYearRange(dateRange);
  const data = useQuery(api.reports.receivablesPayables.getPurchasesByVendor, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    ...comp,
  });

  const handleExport = () => {
    if (!data) return;
    const header = "Vendor,Spend,Comparative,% of Total\n";
    const rows = data.rows.map((r) =>
      `"${r.vendorName}",${r.spend},${r.comparativeSpend},${r.pctOfTotal}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `purchases-by-vendor-${dateRange.startDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const compLabel = `${comp.comparativeStartDate.slice(0,4)}`;

  return (
    <ReportShell
      title="Purchases by Vendor"
      subtitle={data ? `${dateRange.startDate} to ${dateRange.endDate} — ledger-sourced spend` : undefined}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onExportExcel={handleExport}
    >
      {!data ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4 text-sm">
            <div>Period Spend: <span className="font-bold text-base">{fmt(data.totalSpend)}</span></div>
            <div className="text-muted-foreground">Comparative ({compLabel}): {fmt(data.comparativeTotalSpend)}</div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Vendor</th>
                  <th className="text-right p-2 font-medium">Spend</th>
                  <th className="text-right p-2 font-medium">% of Total</th>
                  <th className="text-right p-2 font-medium">Comparative ({compLabel})</th>
                  <th className="text-right p-2 font-medium">Change</th>
                  <th className="p-2 font-medium min-w-[100px]">Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No purchases posted in this period.</td></tr>
                ) : data.rows.map((row) => {
                  const change = row.comparativeSpend > 0
                    ? ((row.spend - row.comparativeSpend) / row.comparativeSpend) * 100
                    : null;
                  return (
                    <tr key={row.vendorId ?? "unassigned"} className="hover:bg-muted/30">
                      <td className="p-2 font-medium">{row.vendorName}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{fmt(row.spend)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{row.pctOfTotal.toFixed(1)}%</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(row.comparativeSpend)}</td>
                      <td className={cn("p-2 text-right tabular-nums text-xs", change === null ? "text-muted-foreground" : change >= 0 ? "text-red-600" : "text-green-600")}>
                        {change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}
                      </td>
                      <td className="p-2">
                        <div className="bg-muted rounded-full h-1.5 w-full overflow-hidden">
                          <div className="bg-orange-500 h-full rounded-full" style={{ width: `${Math.min(100, row.pctOfTotal)}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot className="bg-muted/50 font-bold border-t">
                  <tr>
                    <td className="p-2">Total</td>
                    <td className="p-2 text-right tabular-nums">{fmt(data.totalSpend)}</td>
                    <td className="p-2 text-right tabular-nums">100%</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(data.comparativeTotalSpend)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Spend sourced from AP credit lines in posted journal entries only.
          </p>
        </>
      )}
    </ReportShell>
  );
}
