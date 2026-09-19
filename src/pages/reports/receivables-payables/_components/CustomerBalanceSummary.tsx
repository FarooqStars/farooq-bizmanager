/**
 * Report 11: Customer Balance Summary
 * Per customer: opening, invoiced, received, credited, closing.
 * Sortable by closing balance. opening + invoiced − received − credited = closing.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ArrowUpDown } from "lucide-react";
import ReportShell from "@/components/reports/ReportShell.tsx";
import type { DateRange } from "@/components/reports/DateRangePicker.tsx";
import { fmt } from "../../_components/report-utils.tsx";
import { cn } from "@/lib/utils.ts";

function defaultRange(): DateRange {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

type SortField = "opening" | "invoiced" | "received" | "credited" | "closing";

export default function CustomerBalanceSummary() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange());
  const [sortField, setSortField] = useState<SortField>("closing");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const data = useQuery(api.reports.receivablesPayables.getCustomerBalanceSummary, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const sorted = data
    ? [...data.rows].sort((a, b) => (sortDir === "desc" ? b[sortField] - a[sortField] : a[sortField] - b[sortField]))
    : [];

  const handleExport = () => {
    if (!data) return;
    const header = "Customer,Opening,Invoiced,Received,Credited,Closing\n";
    const rows = sorted.map((r) =>
      `"${r.customerName}",${r.opening},${r.invoiced},${r.received},${r.credited},${r.closing}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `customer-balance-${dateRange.startDate}-${dateRange.endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button className="flex items-center gap-0.5 cursor-pointer hover:text-foreground" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className={cn("w-3 h-3", sortField === field ? "text-foreground" : "text-muted-foreground/50")} />
    </button>
  );

  return (
    <ReportShell
      title="Customer Balance Summary"
      subtitle={data ? `${dateRange.startDate} to ${dateRange.endDate} — ${data.rows.length} customers` : undefined}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onExportExcel={handleExport}
    >
      {!data ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2 font-medium">Customer</th>
                <th className="text-right p-2 font-medium"><SortButton field="opening" label="Opening" /></th>
                <th className="text-right p-2 font-medium"><SortButton field="invoiced" label="Invoiced" /></th>
                <th className="text-right p-2 font-medium"><SortButton field="received" label="Received" /></th>
                <th className="text-right p-2 font-medium"><SortButton field="credited" label="Credited" /></th>
                <th className="text-right p-2 font-medium"><SortButton field="closing" label="Closing" /></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No customer activity in this period.</td></tr>
              ) : sorted.map((row) => (
                <tr key={row.customerId} className="hover:bg-muted/30">
                  <td className="p-2 font-medium">{row.customerName}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(row.opening)}</td>
                  <td className="p-2 text-right tabular-nums text-blue-600">{fmt(row.invoiced)}</td>
                  <td className="p-2 text-right tabular-nums text-green-600">{fmt(row.received)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(row.credited)}</td>
                  <td className={cn("p-2 text-right tabular-nums font-bold", row.closing < 0 && "text-red-600")}>
                    {fmt(row.closing)}
                  </td>
                </tr>
              ))}
            </tbody>
            {sorted.length > 0 && (
              <tfoot className="bg-muted/50 font-bold border-t">
                <tr>
                  <td className="p-2">Totals</td>
                  <td className="p-2 text-right tabular-nums">{fmt(data.totals.opening)}</td>
                  <td className="p-2 text-right tabular-nums text-blue-600">{fmt(data.totals.invoiced)}</td>
                  <td className="p-2 text-right tabular-nums text-green-600">{fmt(data.totals.received)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(data.totals.credited)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(data.totals.closing)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </ReportShell>
  );
}
