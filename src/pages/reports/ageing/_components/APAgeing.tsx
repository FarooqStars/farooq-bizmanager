/**
 * AP Ageing Summary — Report 7.
 * Mirror of AR Ageing but for vendors/bills, reconciled to AP control account.
 * Uses remaining balance = amount − (amountPaid ?? 0).
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Printer, FileSpreadsheet } from "lucide-react";
import { fmt } from "../../_components/report-utils.tsx";
import { CURRENCY_DISCLAIMER } from "@/components/reports/ReportShell.tsx";
import type { APAgingRow, APAgingBill } from "@/convex/reports/ageing.ts";
import { generateAgeingCsv } from "../_lib/ageing-export.ts";

type BucketKey = "current" | "days30" | "days60" | "days90" | "over90";

const BUCKET_LABELS: Record<BucketKey, string> = {
  current: "Current",
  days30: "1–30",
  days60: "31–60",
  days90: "61–90",
  over90: "90+",
};

const BUCKET_KEYS: BucketKey[] = ["current", "days30", "days60", "days90", "over90"];

type DrillBill = APAgingBill & { vendorName: string };

export default function APAgeing() {
  const [asOfDate, setAsOfDate] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillBucket, setDrillBucket] = useState<{ label: string; bills: DrillBill[] } | null>(null);

  const data = useQuery(api.reports.ageing.getAPAgeing, asOfDate ? { asOfDate } : {});

  if (!data) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openBucket = (label: string, rows: APAgingRow[], bucket: BucketKey) => {
    const bills: DrillBill[] = rows.flatMap((r) =>
      r.bills.filter((b) => b.bucket === bucket).map((b) => ({ ...b, vendorName: r.vendorName })),
    );
    setDrillBucket({ label, bills });
  };

  const handleExcel = () => {
    const csv = generateAgeingCsv("ap", data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ap-ageing-${data.asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b print:hidden">
        <div>
          <h1 className="text-xl font-bold">AP Ageing Summary</h1>
          <p className="text-sm text-muted-foreground">As of {data.asOfDate}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">As of Date</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 w-40 h-8 text-sm"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.print()} className="cursor-pointer gap-1.5">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExcel} className="cursor-pointer gap-1.5">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
        </div>
      </div>

      {/* Reconciliation banner */}
      <div className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b",
        data.isReconciled
          ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400"
          : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400",
      )}>
        {data.isReconciled
          ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
        <span>
          {data.controlAccountName} control{" "}
          <strong>{fmt(data.controlBalance)}</strong>
          {" · "}Ageing total{" "}
          <strong>{fmt(data.summary.total)}</strong>
          {" "}
          {data.isReconciled
            ? "✓ Reconciled"
            : `⚠ Difference ${fmt(Math.abs(data.reconciliationDiff))}`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2 font-medium">Vendor</th>
                {BUCKET_KEYS.map((bk) => (
                  <th key={bk} className="text-right p-2 font-medium">{BUCKET_LABELS[bk]}</th>
                ))}
                <th className="text-right p-2 font-medium">Total</th>
                <th className="p-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No outstanding payables found.
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => (
                  <>
                    <tr
                      key={row.vendorId}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => toggleExpand(row.vendorId)}
                    >
                      <td className="p-2 font-medium flex items-center gap-1">
                        {expanded.has(row.vendorId)
                          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        {row.vendorName}
                      </td>
                      {BUCKET_KEYS.map((bk) => (
                        <td
                          key={bk}
                          className={cn(
                            "p-2 text-right",
                            bk === "over90" && row[bk] > 0 && "text-red-600 font-medium",
                            bk === "days90" && row[bk] > 0 && "text-amber-600",
                            bk === "days60" && row[bk] > 0 && "text-orange-500",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (row[bk] !== 0) openBucket(`${row.vendorName} — ${BUCKET_LABELS[bk]}`, [row], bk);
                          }}
                        >
                          {row[bk] !== 0 ? (
                            <button className="cursor-pointer hover:underline tabular-nums">
                              {fmt(row[bk])}
                            </button>
                          ) : "—"}
                        </td>
                      ))}
                      <td className="p-2 text-right font-bold">{fmt(row.total)}</td>
                      <td className="p-2 w-6" />
                    </tr>

                    {expanded.has(row.vendorId) && row.bills.map((bill) => (
                      <tr key={bill.billId} className="bg-muted/20 text-xs">
                        <td className="p-2 pl-8 text-muted-foreground">
                          <span className="font-medium">{bill.title}</span>{" "}
                          <span>Due {bill.dueDate}</span>
                        </td>
                        {BUCKET_KEYS.map((bk) => (
                          <td key={bk} className={cn(
                            "p-2 text-right text-muted-foreground",
                            bill.bucket === bk && bk === "over90" && "text-red-600 font-medium",
                            bill.bucket === bk && bk === "days90" && "text-amber-600",
                            bill.bucket === bk && bk !== "over90" && bk !== "days90" && "text-foreground font-medium",
                          )}>
                            {bill.bucket === bk ? fmt(bill.balance) : "—"}
                          </td>
                        ))}
                        <td className="p-2 text-right font-medium tabular-nums">{fmt(bill.balance)}</td>
                        <td className="p-2">
                          <BucketBadge bucket={bill.bucket} />
                        </td>
                      </tr>
                    ))}
                  </>
                ))
              )}
            </tbody>
            <tfoot className="bg-muted/50 font-bold border-t">
              <tr>
                <td className="p-2">Grand Total</td>
                {BUCKET_KEYS.map((bk) => (
                  <td
                    key={bk}
                    className={cn(
                      "p-2 text-right",
                      bk === "over90" && data.summary[bk] > 0 && "text-red-600",
                    )}
                    onClick={() => {
                      if (data.summary[bk] !== 0) openBucket(`All — ${BUCKET_LABELS[bk]}`, data.rows, bk);
                    }}
                  >
                    {data.summary[bk] !== 0 ? (
                      <button className="cursor-pointer hover:underline tabular-nums">
                        {fmt(data.summary[bk])}
                      </button>
                    ) : "—"}
                  </td>
                ))}
                <td className="p-2 text-right">{fmt(data.summary.total)}</td>
                <td className="p-2 w-6" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <footer className="px-4 py-3 border-t text-xs text-muted-foreground">
        {CURRENCY_DISCLAIMER}
      </footer>

      {drillBucket && (
        <BillDrillDrawer
          label={drillBucket.label}
          bills={drillBucket.bills}
          onClose={() => setDrillBucket(null)}
        />
      )}
    </div>
  );
}

function BucketBadge({ bucket }: { bucket: BucketKey }) {
  const colors: Record<BucketKey, string> = {
    current: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    days30: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    days60: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    days90: "bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
    over90: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", colors[bucket])}>
      {BUCKET_LABELS[bucket]}
    </span>
  );
}

function BillDrillDrawer({
  label,
  bills,
  onClose,
}: {
  label: string;
  bills: DrillBill[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" onClick={onClose}>
      <div
        className="bg-background border-l shadow-xl w-full max-w-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground">{bills.length} bill{bills.length !== 1 ? "s" : ""}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} className="cursor-pointer">Close</Button>
        </div>
        <div className="p-4">
          <table className="w-full text-sm">
            <thead className="text-xs border-b">
              <tr>
                <th className="text-left pb-2">Bill</th>
                <th className="text-left pb-2">Vendor</th>
                <th className="text-left pb-2">Due</th>
                <th className="text-right pb-2">Amount</th>
                <th className="text-right pb-2">Paid</th>
                <th className="text-right pb-2">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bills.map((bill) => (
                <tr key={bill.billId} className="hover:bg-muted/30">
                  <td className="py-1.5 text-xs font-medium">{bill.title}</td>
                  <td className="py-1.5 text-xs">{bill.vendorName}</td>
                  <td className="py-1.5 text-xs">{bill.dueDate}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(bill.amount)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmt(bill.amountPaid)}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{fmt(bill.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t">
              <tr className="font-bold">
                <td colSpan={5} className="pt-2 text-right text-xs">Total</td>
                <td className="pt-2 text-right tabular-nums">
                  {fmt(bills.reduce((s, b) => s + b.balance, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
