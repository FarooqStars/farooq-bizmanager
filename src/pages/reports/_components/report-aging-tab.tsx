import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { Printer, Clock, AlertTriangle, Users, Building2, CheckCircle2, XCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { fmt } from "./report-utils.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";
import { generateAgingReportHtml } from "@/lib/print-templates/aging-report-template.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";

type ViewMode = "summary" | "detailed";

export default function AgingTab() {
  const { symbol } = useCurrency();
  const [view, setView] = useState<"receivable" | "payable">("receivable");
  const [mode, setMode] = useState<ViewMode>("summary");
  const [asOfDate, setAsOfDate] = useState("");

  const asOfArg = asOfDate ? { asOfDate } : {};

  // Canonical Milestone-5 ageing — reconciles to AR/AP control accounts.
  const arAging = useQuery(api.reports.ageing.getARAgeing, asOfArg);
  const apAging = useQuery(api.reports.ageing.getAPAgeing, asOfArg);
  const profile = useQuery(api.companyProfile.get);

  const aging = view === "receivable" ? arAging : apAging;

  if (!aging) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  // New shape: summary has {current, days30, days60, days90, over90, total}
  const summary = aging.summary;
  const totalOutstanding = summary.total;

  const bucketData = [
    { bucket: "Current", amount: summary.current, color: "oklch(0.6 0.118 184.704)" },
    { bucket: "1-30 Days", amount: summary.days30, color: "oklch(0.7 0.15 90)" },
    { bucket: "31-60 Days", amount: summary.days60, color: "oklch(0.7 0.2 60)" },
    { bucket: "61-90 Days", amount: summary.days90, color: "oklch(0.6 0.2 40)" },
    { bucket: "90+ Days", amount: summary.over90, color: "oklch(0.5 0.25 15)" },
  ];

  // Rows: ARAgingRow has {customerId, customerName, ...buckets, total, invoices[]}
  //        APAgingRow has {vendorId, vendorName, ...buckets, total, bills[]}
  const rows = aging.rows as Array<{
    customerId?: string; vendorId?: string;
    customerName?: string; vendorName?: string;
    current: number; days30: number; days60: number; days90: number; over90: number;
    total: number;
    invoices?: Array<{ invoiceNumber: string; date: string; dueDate: string; totalAmount: number; amountPaid: number; balance: number; daysPast: number; bucket: string }>;
    bills?: Array<{ title: string; dueDate: string; amount: number; amountPaid: number; balance: number; daysPast: number; bucket: string }>;
  }>;

  const handlePrint = () => {
    // Map new shape to the existing print-template interface
    const entityData = rows.map((r) => ({
      name: r.customerName ?? r.vendorName ?? "Unknown",
      current: r.current,
      days30: r.days30,
      days60: r.days60,
      days90: r.days90,
      days120: 0,
      over120: r.over90,
      total: r.total,
    }));

    const detailRows = view === "receivable"
      ? rows.flatMap((r) => (r.invoices ?? []).map((inv) => ({
          reference: inv.invoiceNumber,
          entityName: r.customerName ?? "Unknown",
          dueDate: inv.dueDate,
          amount: inv.totalAmount,
          balance: inv.balance,
          daysPast: inv.daysPast,
          bucket: inv.bucket,
        })))
      : rows.flatMap((r) => (r.bills ?? []).map((b) => ({
          reference: b.title,
          entityName: r.vendorName ?? "Unknown",
          dueDate: b.dueDate,
          amount: b.amount,
          balance: b.balance,
          daysPast: b.daysPast,
          bucket: b.bucket,
        })));

    const printSummary = {
      current: summary.current,
      days30: summary.days30,
      days60: summary.days60,
      days90: summary.days90,
      days120: 0,
      over120: summary.over90,
    };

    const html = generateAgingReportHtml(
      {
        type: view,
        asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
        summary: printSummary,
        totalOutstanding,
        byEntity: entityData,
        details: mode === "detailed" ? detailRows : undefined,
      },
      profile ? {
        nameEn: profile.nameEn,
        nameAr: profile.nameAr,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        crNumber: profile.crNumber,
        taxId: profile.taxId,
        invoiceFooterEn: profile.invoiceFooterEn,
        invoiceFooterAr: profile.invoiceFooterAr,
      } : undefined,
      null
    );
    openPrintWindow(html);
  };

  return (
    <div className="space-y-6">
      {/* Controls bar */}
      <div className="flex flex-wrap items-end gap-3">
        {/* AR/AP Toggle */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={view === "receivable" ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setView("receivable")}
          >
            <Users className="w-3.5 h-3.5 mr-1" />
            Receivable (AR)
          </Button>
          <Button
            size="sm"
            variant={view === "payable" ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setView("payable")}
          >
            <Building2 className="w-3.5 h-3.5 mr-1" />
            Payable (AP)
          </Button>
        </div>

        {/* Summary / Detailed toggle */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === "summary" ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setMode("summary")}
          >
            Summary
          </Button>
          <Button
            size="sm"
            variant={mode === "detailed" ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => setMode("detailed")}
          >
            Detailed
          </Button>
        </div>

        {/* As of Date */}
        <div>
          <Label className="text-xs">As of Date</Label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="mt-1 w-40"
          />
        </div>

        {/* Print */}
        <Button size="sm" onClick={handlePrint} className="cursor-pointer ml-auto">
          <Printer className="w-4 h-4 mr-1" /> Print
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground truncate">Total Outstanding</p>
            <p className="text-lg font-bold break-words leading-tight">{fmt(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground truncate">Current (Not Due)</p>
            <p className="text-lg font-bold text-green-600 break-words leading-tight">{fmt(summary.current)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 flex-shrink-0" /> Overdue (1-90)
            </p>
            <p className="text-lg font-bold text-amber-600 break-words leading-tight">
              {fmt(summary.days30 + summary.days60 + summary.days90)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" /> Critical (90+)
            </p>
            <p className="text-lg font-bold text-red-600 break-words leading-tight">{fmt(summary.over90)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation status */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md text-sm border",
        aging.isReconciled
          ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
          : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300"
      )}>
        {aging.isReconciled
          ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          : <XCircle className="w-4 h-4 flex-shrink-0" />}
        <span>
          {view === "receivable" ? "AR" : "AP"} sub-ledger ({fmt(totalOutstanding)}) &nbsp;
          {aging.isReconciled ? "reconciles to" : "differs from"} control account
          &ldquo;{aging.controlAccountName}&rdquo; ({fmt(aging.controlBalance)})
          {!aging.isReconciled && ` — diff ${fmt(aging.reconciliationDiff)}`}
        </span>
      </div>

      {/* Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {view === "receivable" ? "AR" : "AP"} Aging Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bucketData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v: number) => `${symbol} ${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: unknown) => [fmt(Number(v)), "Amount"]} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {bucketData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Summary View: By Customer/Vendor */}
      {mode === "summary" && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>By {view === "receivable" ? "Customer" : "Vendor"}</span>
              <Badge variant="secondary">{rows.length} {rows.length === 1 ? "entry" : "entries"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">{view === "receivable" ? "Customer" : "Vendor"}</th>
                    <th className="text-right p-2 font-medium">Current</th>
                    <th className="text-right p-2 font-medium">1-30</th>
                    <th className="text-right p-2 font-medium">31-60</th>
                    <th className="text-right p-2 font-medium">61-90</th>
                    <th className="text-right p-2 font-medium text-red-600">90+</th>
                    <th className="text-right p-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-2 font-medium">{row.customerName ?? row.vendorName}</td>
                      <td className="p-2 text-right">{row.current > 0 ? fmt(row.current) : "—"}</td>
                      <td className="p-2 text-right">{row.days30 > 0 ? fmt(row.days30) : "—"}</td>
                      <td className="p-2 text-right">{row.days60 > 0 ? fmt(row.days60) : "—"}</td>
                      <td className="p-2 text-right text-amber-600">{row.days90 > 0 ? fmt(row.days90) : "—"}</td>
                      <td className="p-2 text-right text-red-600">{row.over90 > 0 ? fmt(row.over90) : "—"}</td>
                      <td className="p-2 text-right font-bold">{fmt(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 border-t font-bold">
                  <tr>
                    <td className="p-2">Total</td>
                    <td className="p-2 text-right">{fmt(summary.current)}</td>
                    <td className="p-2 text-right">{fmt(summary.days30)}</td>
                    <td className="p-2 text-right">{fmt(summary.days60)}</td>
                    <td className="p-2 text-right text-amber-600">{fmt(summary.days90)}</td>
                    <td className="p-2 text-right text-red-600">{fmt(summary.over90)}</td>
                    <td className="p-2 text-right">{fmt(totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed View: Individual Invoices/Bills */}
      {mode === "detailed" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Invoice/Bill Details</span>
              <Badge variant="secondary">
                {rows.reduce((s, r) => s + (r.invoices?.length ?? r.bills?.length ?? 0), 0)} items
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No outstanding {view === "receivable" ? "invoices" : "bills"} found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Reference</th>
                      <th className="text-left p-2 font-medium">{view === "receivable" ? "Customer" : "Vendor"}</th>
                      <th className="text-center p-2 font-medium">Due Date</th>
                      {view === "receivable" && (
                        <>
                          <th className="text-right p-2 font-medium">Total</th>
                          <th className="text-right p-2 font-medium">Paid</th>
                        </>
                      )}
                      <th className="text-right p-2 font-medium">Balance</th>
                      <th className="text-center p-2 font-medium">Days Past</th>
                      <th className="text-center p-2 font-medium">Bucket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {view === "receivable"
                      ? rows.flatMap((r) =>
                          (r.invoices ?? []).map((inv, idx) => (
                            <tr key={`${r.customerId}-${idx}`} className="hover:bg-muted/30">
                              <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                              <td className="p-2">{r.customerName}</td>
                              <td className="p-2 text-center text-xs">{inv.dueDate}</td>
                              <td className="p-2 text-right">{fmt(inv.totalAmount)}</td>
                              <td className="p-2 text-right text-muted-foreground">{fmt(inv.amountPaid)}</td>
                              <td className="p-2 text-right font-bold">{fmt(inv.balance)}</td>
                              <td className="p-2 text-center">
                                <span className={cn(
                                  "text-xs font-medium",
                                  inv.daysPast > 90 && "text-red-600",
                                  inv.daysPast > 60 && inv.daysPast <= 90 && "text-amber-600",
                                )}>
                                  {inv.daysPast}
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <BucketBadge bucket={inv.bucket} />
                              </td>
                            </tr>
                          ))
                        )
                      : rows.flatMap((r) =>
                          (r.bills ?? []).map((b, idx) => (
                            <tr key={`${r.vendorId}-${idx}`} className="hover:bg-muted/30">
                              <td className="p-2 font-medium text-xs">{b.title}</td>
                              <td className="p-2">{r.vendorName}</td>
                              <td className="p-2 text-center text-xs">{b.dueDate}</td>
                              <td className="p-2 text-right font-bold">{fmt(b.balance)}</td>
                              <td className="p-2 text-center">
                                <span className={cn(
                                  "text-xs font-medium",
                                  b.daysPast > 90 && "text-red-600",
                                  b.daysPast > 60 && b.daysPast <= 90 && "text-amber-600",
                                )}>
                                  {b.daysPast}
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <BucketBadge bucket={b.bucket} />
                              </td>
                            </tr>
                          ))
                        )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BucketBadge({ bucket }: { bucket: string }) {
  const labels: Record<string, string> = {
    current: "Current",
    days30: "1-30",
    days60: "31-60",
    days90: "61-90",
    over90: "90+",
  };
  const colors: Record<string, string> = {
    current: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    days30: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    days60: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    days90: "bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-300",
    over90: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-medium", colors[bucket] ?? "bg-muted")}>
      {labels[bucket] ?? bucket}
    </span>
  );
}
