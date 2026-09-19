/**
 * Customer Statement — Report 8.
 *
 * Selectable customer + date range + mode (Open Item / Balance Forward).
 * Opening balance → transactions in date order with running balance → closing balance.
 * Ageing strip at footer.
 * Print / Excel / Share buttons.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import { Printer, FileSpreadsheet, Share2 } from "lucide-react";
import { toast } from "sonner";
import { fmt } from "../../_components/report-utils.tsx";
import { CURRENCY_DISCLAIMER } from "@/components/reports/ReportShell.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Mode = "open_item" | "balance_forward";

const BUCKET_LABELS = {
  current: "Current",
  days30: "1–30",
  days60: "31–60",
  days90: "61–90",
  over90: "90+",
} as const;

const LINE_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment",
  credit_memo: "Credit Memo",
  advance: "Advance",
};

function defaultDates(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return {
    startDate: `${year}-${month}-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

export default function CustomerStatement() {
  const defaults = defaultDates();
  const [customerId, setCustomerId] = useState<string>("");
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [mode, setMode] = useState<Mode>("open_item");

  const customers = useQuery(api.reports.ageing.listCustomers, {});

  const statement = useQuery(
    api.reports.ageing.getCustomerStatement,
    customerId
      ? {
          customerId: customerId as Id<"customers">,
          startDate,
          endDate,
          mode,
        }
      : "skip",
  );

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleExcel = () => {
    if (!statement) return;
    const rows = [
      ["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"],
      [`Opening Balance`, "", "", "", "", "", String(statement.openingBalance)],
      ...statement.lines.map((l) => [
        l.date,
        LINE_TYPE_LABELS[l.type] ?? l.type,
        l.docNumber,
        l.description,
        l.debit > 0 ? String(l.debit) : "",
        l.credit > 0 ? String(l.credit) : "",
        String(l.runningBalance),
      ]),
      ["Closing Balance", "", "", "", "", "", String(statement.closingBalance)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${customerId}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b print:hidden">
        <div>
          <h1 className="text-xl font-bold">Customer Statement</h1>
          {statement && (
            <p className="text-sm text-muted-foreground">
              {statement.customerName} · {startDate} to {endDate}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.print()} className="cursor-pointer gap-1.5">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExcel} disabled={!statement} className="cursor-pointer gap-1.5">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={handleShare} className="cursor-pointer gap-1.5">
            <Share2 className="w-4 h-4" /> Share
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 border-b bg-muted/20 print:hidden">
        <div>
          <Label className="text-xs text-muted-foreground">Customer</Label>
          <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
            <SelectTrigger className="w-52 mt-1 h-8 text-sm">
              <SelectValue placeholder="Select customer..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select customer...</SelectItem>
              {customers?.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-36 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-36 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger className="w-44 mt-1 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open_item">Open Item</SelectItem>
              <SelectItem value="balance_forward">Balance Forward</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!customerId && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Select a customer to view their statement.
          </div>
        )}

        {customerId && !statement && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        {statement && (
          <div className="space-y-4">
            {/* Statement table */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Reference</th>
                    <th className="text-left p-2 font-medium">Description</th>
                    <th className="text-right p-2 font-medium">Debit</th>
                    <th className="text-right p-2 font-medium">Credit</th>
                    <th className="text-right p-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {/* Opening balance row */}
                  <tr className="bg-muted/30 font-medium">
                    <td className="p-2 text-muted-foreground">{startDate}</td>
                    <td className="p-2" colSpan={5}>Opening Balance</td>
                    <td className="p-2 text-right tabular-nums">
                      {fmt(statement.openingBalance)}
                    </td>
                  </tr>

                  {statement.lines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No transactions in this period.
                      </td>
                    </tr>
                  )}

                  {statement.lines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-2 tabular-nums text-xs">{line.date}</td>
                      <td className="p-2">
                        <LineTypeBadge type={line.type} />
                      </td>
                      <td className="p-2 font-mono text-xs">{line.docNumber}</td>
                      <td className="p-2 text-xs text-muted-foreground">{line.description}</td>
                      <td className="p-2 text-right tabular-nums">
                        {line.debit > 0 ? fmt(line.debit) : "—"}
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {line.credit > 0 ? fmt(line.credit) : "—"}
                      </td>
                      <td className={cn(
                        "p-2 text-right tabular-nums font-medium",
                        line.runningBalance < 0 && "text-blue-600",
                        line.runningBalance > 0 && "text-foreground",
                      )}>
                        {fmt(line.runningBalance)}
                      </td>
                    </tr>
                  ))}

                  {/* Closing balance row */}
                  <tr className="bg-muted/30 font-bold border-t-2">
                    <td className="p-2 text-muted-foreground">{endDate}</td>
                    <td className="p-2" colSpan={5}>Closing Balance</td>
                    <td className={cn(
                      "p-2 text-right tabular-nums",
                      statement.closingBalance < 0 && "text-blue-600",
                    )}>
                      {fmt(statement.closingBalance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Ageing strip */}
            <div className="rounded-lg border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ageing Summary as of {endDate}
              </div>
              <div className="grid grid-cols-5 text-sm">
                {(Object.entries(BUCKET_LABELS) as [keyof typeof BUCKET_LABELS, string][]).map(([bk, label]) => (
                  <div key={bk} className={cn(
                    "p-3 text-center border-r last:border-r-0",
                    bk === "over90" && statement.ageing[bk] > 0 && "bg-red-50 dark:bg-red-950/20",
                    bk === "days90" && statement.ageing[bk] > 0 && "bg-amber-50 dark:bg-amber-950/20",
                  )}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={cn(
                      "font-bold mt-0.5",
                      bk === "over90" && statement.ageing[bk] > 0 && "text-red-600",
                      bk === "days90" && statement.ageing[bk] > 0 && "text-amber-600",
                    )}>
                      {fmt(statement.ageing[bk])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="px-4 py-3 border-t text-xs text-muted-foreground">
        {CURRENCY_DISCLAIMER}
      </footer>
    </div>
  );
}

function LineTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    invoice: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    payment: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    credit_memo: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    advance: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  };
  return (
    <span className={cn(
      "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium",
      styles[type] ?? "bg-muted text-muted-foreground",
    )}>
      {LINE_TYPE_LABELS[type] ?? type}
    </span>
  );
}
