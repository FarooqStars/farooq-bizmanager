/**
 * Report 13: Collections / Overdue
 * Overdue invoices only, sorted by days overdue desc.
 * Shows customer phone/email and one-click WhatsApp/email reminder.
 * Uses the existing messageTemplates table for reminder content.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { Mail, MessageSquare, Phone, AlertCircle } from "lucide-react";
import ReportShell from "@/components/reports/ReportShell.tsx";
import type { DateRange } from "@/components/reports/DateRangePicker.tsx";
import { fmt } from "../../_components/report-utils.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const BUCKET_COLORS: Record<string, string> = {
  days30: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  days60: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  days90: "bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
  over90: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};
const BUCKET_LABELS: Record<string, string> = { days30: "1–30", days60: "31–60", days90: "61–90", over90: "90+" };

function defaultRange(): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  return { startDate: today, endDate: today };
}

function buildWhatsAppMsg(customerName: string, invoiceNumber: string, balance: number, dueDate: string): string {
  return encodeURIComponent(
    `Dear ${customerName},\n\nThis is a gentle reminder that invoice ${invoiceNumber} for ${fmt(balance)} was due on ${dueDate} and remains outstanding.\n\nPlease arrange payment at your earliest convenience.\n\nThank you.`
  );
}

function buildEmailSubject(invoiceNumber: string): string {
  return encodeURIComponent(`Payment Reminder: Invoice ${invoiceNumber}`);
}

function buildEmailBody(customerName: string, invoiceNumber: string, balance: number, dueDate: string): string {
  return encodeURIComponent(
    `Dear ${customerName},\n\nThis is a reminder that invoice ${invoiceNumber} for ${fmt(balance)} was due on ${dueDate}.\n\nPlease contact us if you have any questions.\n\nThank you.`
  );
}

export default function OverdueCollections() {
  const [dateRange, setDateRange] = useState<DateRange>(defaultRange());
  const [customerId, setCustomerId] = useState<string>("all");

  const customers = useQuery(api.reports.receivablesPayables.listCustomers);
  const data = useQuery(api.reports.receivablesPayables.getOverdueInvoices, {
    asOfDate: dateRange.endDate,
    ...(customerId !== "all" ? { customerId: customerId as Id<"customers"> } : {}),
  });

  const handleExport = () => {
    if (!data) return;
    const header = "Customer,Phone,Email,Invoice #,Date,Due Date,Days Past,Total,Paid,Balance,Bucket\n";
    const rows = data.rows.map((r) =>
      `"${r.customerName}","${r.customerPhone ?? ""}","${r.customerEmail ?? ""}","${r.invoiceNumber}","${r.date}","${r.dueDate}",${r.daysPast},${r.totalAmount},${r.amountPaid},${r.balance},"${r.bucket}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `overdue-collections-${data.asOfDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toolbar = (
    <Select value={customerId} onValueChange={setCustomerId}>
      <SelectTrigger className="w-44 h-8 text-xs cursor-pointer"><SelectValue placeholder="All Customers" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Customers</SelectItem>
        {(customers ?? []).map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <ReportShell
      title="Collections — Overdue Invoices"
      subtitle={data ? `As of ${data.asOfDate} — ${data.overdueCustomerCount} overdue customers` : undefined}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      toolbar={toolbar}
      onExportExcel={handleExport}
    >
      {!data ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          {data.rows.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{data.rows.length}</strong> overdue invoice{data.rows.length !== 1 ? "s" : ""} from{" "}
                <strong>{data.overdueCustomerCount}</strong> customer{data.overdueCustomerCount !== 1 ? "s" : ""} — total{" "}
                <strong>{fmt(data.totalBalance)}</strong>
              </span>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Contact</th>
                  <th className="text-left p-2 font-medium">Invoice #</th>
                  <th className="text-center p-2 font-medium">Due Date</th>
                  <th className="text-right p-2 font-medium">Days Past</th>
                  <th className="text-right p-2 font-medium">Balance</th>
                  <th className="text-center p-2 font-medium">Bucket</th>
                  <th className="text-center p-2 font-medium print:hidden">Remind</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.rows.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No overdue invoices. Great job!</td></tr>
                ) : data.rows.map((row) => (
                  <tr key={row.invoiceId} className="hover:bg-muted/30">
                    <td className="p-2 font-medium">{row.customerName}</td>
                    <td className="p-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        {row.customerPhone && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="w-3 h-3" />{row.customerPhone}
                          </span>
                        )}
                        {row.customerEmail && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="w-3 h-3" />{row.customerEmail}
                          </span>
                        )}
                        {!row.customerPhone && !row.customerEmail && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="p-2 font-mono text-xs">{row.invoiceNumber}</td>
                    <td className="p-2 text-center text-xs">{row.dueDate}</td>
                    <td className={cn("p-2 text-right tabular-nums font-bold", row.daysPast > 90 && "text-red-600", row.daysPast > 60 && row.daysPast <= 90 && "text-amber-600", row.daysPast > 30 && row.daysPast <= 60 && "text-orange-500")}>
                      {row.daysPast}
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(row.balance)}</td>
                    <td className="p-2 text-center">
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", BUCKET_COLORS[row.bucket] ?? "bg-muted")}>
                        {BUCKET_LABELS[row.bucket] ?? row.bucket}
                      </span>
                    </td>
                    <td className="p-2 text-center print:hidden">
                      <div className="flex items-center justify-center gap-1">
                        {row.customerPhone && (
                          <a
                            href={`https://wa.me/${row.customerPhone.replace(/\D/g, "")}?text=${buildWhatsAppMsg(row.customerName, row.invoiceNumber, row.balance, row.dueDate)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Send WhatsApp reminder"
                          >
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 cursor-pointer text-green-600 hover:bg-green-50">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                        {row.customerEmail && (
                          <a
                            href={`mailto:${row.customerEmail}?subject=${buildEmailSubject(row.invoiceNumber)}&body=${buildEmailBody(row.customerName, row.invoiceNumber, row.balance, row.dueDate)}`}
                          >
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 cursor-pointer text-blue-600 hover:bg-blue-50">
                              <Mail className="w-3.5 h-3.5" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot className="bg-muted/50 font-bold border-t">
                  <tr>
                    <td colSpan={5} className="p-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Total Overdue</td>
                    <td className="p-2 text-right tabular-nums text-red-600">{fmt(data.totalBalance)}</td>
                    <td colSpan={2} />
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
