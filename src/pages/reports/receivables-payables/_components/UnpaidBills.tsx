/**
 * Report 17: Unpaid Bills / Payment Due
 * Bills due within a selectable window (7 / 15 / 30 / 60 / 90 days).
 * Sorted by due date. Total cash required is the point of this report.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { Banknote } from "lucide-react";
import ReportShell from "@/components/reports/ReportShell.tsx";
import type { DateRange } from "@/components/reports/DateRangePicker.tsx";
import { fmt } from "../../_components/report-utils.tsx";

function defaultRange(): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  return { startDate: today, endDate: today };
}

const WINDOW_OPTIONS = [
  { value: 7, label: "Next 7 Days" },
  { value: 15, label: "Next 15 Days" },
  { value: 30, label: "Next 30 Days" },
  { value: 60, label: "Next 60 Days" },
  { value: 90, label: "Next 90 Days" },
] as const;

type WindowDays = 7 | 15 | 30 | 60 | 90;

export default function UnpaidBills() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange());
  const [windowDays, setWindowDays] = useState<WindowDays>(30);

  const data = useQuery(api.reports.receivablesPayables.getUnpaidBills, {
    asOfDate: dateRange.endDate,
    windowDays,
  });

  const handleExport = () => {
    if (!data) return;
    const header = "Vendor,Bill,Due Date,Days to Due,Total,Paid,Balance,Status\n";
    const rows = data.rows.map((r) =>
      `"${r.vendorName}","${r.billTitle}","${r.dueDate}",${r.daysToDue},${r.totalAmount},${r.amountPaid},${r.balance},"${r.status}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `unpaid-bills-${data.asOfDate}-${windowDays}d.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toolbar = (
    <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as WindowDays)}>
      <SelectTrigger className="w-36 h-8 text-xs cursor-pointer"><SelectValue /></SelectTrigger>
      <SelectContent>
        {WINDOW_OPTIONS.map((opt) => <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <ReportShell
      title="Unpaid Bills — Payment Due"
      subtitle={data ? `As of ${data.asOfDate} — due within ${windowDays} days` : undefined}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      toolbar={toolbar}
      onExportExcel={handleExport}
    >
      {!data ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          {/* Cash required callout — the point of this report */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Cash Required</p>
              <p className="text-2xl font-bold">{fmt(data.cashRequired)}</p>
              <p className="text-xs text-muted-foreground">{data.totalCount} bill{data.totalCount !== 1 ? "s" : ""} due in {windowDays} days</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Vendor</th>
                  <th className="text-left p-2 font-medium">Bill</th>
                  <th className="text-center p-2 font-medium">Due Date</th>
                  <th className="text-right p-2 font-medium">Days</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-right p-2 font-medium">Paid</th>
                  <th className="text-right p-2 font-medium">Balance</th>
                  <th className="text-center p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No bills due in this window.</td></tr>
                ) : data.rows.map((row) => (
                  <tr key={row.billId} className="hover:bg-muted/30">
                    <td className="p-2 font-medium">{row.vendorName}</td>
                    <td className="p-2 text-sm">{row.billTitle}</td>
                    <td className="p-2 text-center text-xs">{row.dueDate}</td>
                    <td className={cn("p-2 text-right tabular-nums font-medium", row.daysToDue <= 0 && "text-red-600", row.daysToDue > 0 && row.daysToDue <= 7 && "text-amber-600")}>
                      {row.daysToDue <= 0 ? `${Math.abs(row.daysToDue)}d overdue` : `${row.daysToDue}d`}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmt(row.totalAmount)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(row.amountPaid)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(row.balance)}</td>
                    <td className="p-2 text-center"><Badge variant="secondary" className="text-[10px]">{row.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot className="bg-muted/50 font-bold border-t">
                  <tr>
                    <td colSpan={6} className="p-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Cash Required</td>
                    <td className="p-2 text-right tabular-nums text-primary">{fmt(data.cashRequired)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </ReportShell>
  );
}
