/**
 * Report 10: AR Ageing Detail
 * Every open invoice: customer, invoice #, date, due date, days overdue,
 * original amount, amount paid, balance, ageing bucket.
 * Total reconciles to AR Ageing Summary and AR control account.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import ReportShell from "@/components/reports/ReportShell.tsx";
import type { DateRange } from "@/components/reports/DateRangePicker.tsx";
import { fmt } from "../../_components/report-utils.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const BUCKET_LABELS = { current: "Current", days30: "1–30", days60: "31–60", days90: "61–90", over90: "90+" };
const BUCKET_COLORS: Record<string, string> = {
  current: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  days30: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  days60: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  days90: "bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
  over90: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function defaultRange(): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  return { startDate: today, endDate: today };
}

export default function ARAgingDetail() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange());
  const [customerId, setCustomerId] = useState<string>("all");
  const [bucket, setBucket] = useState<string>("all");

  const customers = useQuery(api.reports.receivablesPayables.listCustomers);
  const data = useQuery(api.reports.receivablesPayables.getARAgingDetail, {
    asOfDate: dateRange.endDate,
    ...(customerId !== "all" ? { customerId: customerId as Id<"customers"> } : {}),
    ...(bucket !== "all" ? { bucket: bucket as "current" | "days30" | "days60" | "days90" | "over90" } : {}),
  });

  const handleExport = () => {
    if (!data) return;
    const header = "Customer,Invoice #,Date,Due Date,Days Past,Original,Paid,Balance,Bucket\n";
    const rows = data.rows.map((r) =>
      `"${r.customerName}","${r.invoiceNumber}","${r.date}","${r.dueDate}",${r.daysPast},${r.originalAmount},${r.amountPaid},${r.balance},"${r.bucket}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ar-aging-detail-${data.asOfDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toolbar = (
    <div className="flex flex-wrap gap-2">
      <Select value={customerId} onValueChange={setCustomerId}>
        <SelectTrigger className="w-44 h-8 text-xs cursor-pointer">
          <SelectValue placeholder="All Customers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Customers</SelectItem>
          {(customers ?? []).map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={bucket} onValueChange={setBucket}>
        <SelectTrigger className="w-32 h-8 text-xs cursor-pointer">
          <SelectValue placeholder="All Buckets" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Buckets</SelectItem>
          {Object.entries(BUCKET_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <ReportShell
      title="AR Ageing Detail"
      subtitle={data ? `As of ${data.asOfDate} — ${data.rows.length} open invoices` : undefined}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      toolbar={toolbar}
      onExportExcel={handleExport}
    >
      {!data ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          {/* Reconciliation banner */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md text-sm border mb-4",
            data.isReconciled
              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
              : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300",
          )}>
            {data.isReconciled ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            <span>
              AR Control Account <strong>{fmt(data.controlBalance)}</strong>
              {" · "}Detail Total <strong>{fmt(data.totalBalance)}</strong>
              {" "}{data.isReconciled ? "✓ Reconciled" : `⚠ Diff ${fmt(Math.abs(data.reconciliationDiff))}`}
            </span>
          </div>

          {/* Bucket summary pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(Object.keys(BUCKET_LABELS) as Array<keyof typeof BUCKET_LABELS>).map((bk) => (
              <div key={bk} className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium bg-background">
                <span className={cn("w-2 h-2 rounded-full", BUCKET_COLORS[bk].split(" ")[0])} />
                {BUCKET_LABELS[bk]}: {fmt(data.summaryByBucket[bk])}
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Invoice #</th>
                  <th className="text-center p-2 font-medium">Date</th>
                  <th className="text-center p-2 font-medium">Due Date</th>
                  <th className="text-right p-2 font-medium">Days Past</th>
                  <th className="text-right p-2 font-medium">Original</th>
                  <th className="text-right p-2 font-medium">Paid</th>
                  <th className="text-right p-2 font-medium">Balance</th>
                  <th className="text-center p-2 font-medium">Bucket</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No open invoices found.</td></tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.invoiceId} className="hover:bg-muted/30">
                      <td className="p-2 font-medium">{row.customerName}</td>
                      <td className="p-2 font-mono text-xs">{row.invoiceNumber}</td>
                      <td className="p-2 text-center text-xs">{row.date}</td>
                      <td className="p-2 text-center text-xs">{row.dueDate}</td>
                      <td className={cn("p-2 text-right tabular-nums font-medium", row.daysPast > 90 && "text-red-600", row.daysPast > 60 && row.daysPast <= 90 && "text-amber-600")}>
                        {row.daysPast}
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmt(row.originalAmount)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(row.amountPaid)}</td>
                      <td className="p-2 text-right tabular-nums font-semibold">{fmt(row.balance)}</td>
                      <td className="p-2 text-center">
                        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", BUCKET_COLORS[row.bucket])}>
                          {BUCKET_LABELS[row.bucket as keyof typeof BUCKET_LABELS]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot className="bg-muted/50 font-bold border-t text-sm">
                  <tr>
                    <td colSpan={5} className="p-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Totals</td>
                    <td className="p-2 text-right tabular-nums">{fmt(data.totalOriginal)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(data.totalPaid)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(data.totalBalance)}</td>
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
