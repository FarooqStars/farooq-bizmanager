/**
 * WPS Export Tab
 *
 * Provides:
 *  1. Payroll run selector + preview table (existing behaviour, unchanged)
 *  2. WPS Validation Panel — shown as soon as a run is selected, before the
 *     download button.
 *
 * Validation rules
 * ──────────────────────────────────────────────────────────────────────────
 * BLOCKING (prevents export; owner must fix or use "Export anyway"):
 *   • employeeId missing / blank
 *   • qidNumber missing / blank
 *   • bankAccount (IBAN) missing / blank
 *   • bankName missing / blank
 *   • routingNumber missing / blank
 *   • netPay ≤ 0
 *   • duplicate bankAccount across two or more employees — both flagged
 *   • duplicate qidNumber across two or more employees — both flagged
 *
 * WARNING (advisory; export is still allowed):
 *   • qidNumber present but not EXPECTED_QID_LENGTH characters
 *   • bankAccount present but not EXPECTED_IBAN_LENGTH characters, OR does
 *     not start with two letters
 *
 * Constants below are UNVERIFIED — confirm against the current WPS /
 * authority spec before relying on them for hard rejections.
 */

// UNVERIFIED — confirm against the current WPS/authority spec before trusting these.
const EXPECTED_QID_LENGTH = 11;   // Qatar QID
const EXPECTED_IBAN_LENGTH = 29;  // Qatar IBAN (QA + 27)

import { useState, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import {
  Download, FileSpreadsheet, AlertTriangle, CheckCircle2,
  AlertCircle, Printer, FileDown, Sheet, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────────────────

type WpsRow = {
  employeeId: string;
  employeeName: string;
  qidNumber: string;
  bankAccount: string;
  bankName: string;
  routingNumber: string;
  netPay: number;
  baseSalary: number;
  totalAllowances: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimeAmount: number;
  deductions: number;
  payDate: string;
  periodStart: string;
  periodEnd: string;
};

type BlockingIssue = {
  employeeId: string;
  employeeName: string;
  fields: string[];
};

type WarningIssue = {
  employeeId: string;
  employeeName: string;
  messages: string[];
};

type ValidationResult = {
  blockingIssues: BlockingIssue[];
  warningIssues: WarningIssue[];
  totalEmployees: number;
  passingCount: number;
  totalNetPay: number;
};

// ─── Pure validation logic ───────────────────────────────────────────────────

function validateRows(rows: WpsRow[]): ValidationResult {
  // Build duplicate maps first (whole-array scans, O(n))
  const bankAccountCounts = new Map<string, number>();
  const qidCounts = new Map<string, number>();

  for (const row of rows) {
    const ba = row.bankAccount?.trim();
    const qid = row.qidNumber?.trim();
    if (ba) bankAccountCounts.set(ba, (bankAccountCounts.get(ba) ?? 0) + 1);
    if (qid) qidCounts.set(qid, (qidCounts.get(qid) ?? 0) + 1);
  }

  const blockingIssues: BlockingIssue[] = [];
  const warningIssues: WarningIssue[] = [];

  for (const row of rows) {
    const blockingFields: string[] = [];
    const warningMessages: string[] = [];

    // ── Blocking checks ───────────────────────────────────────────────────
    if (!row.employeeId?.trim())       blockingFields.push("Employee ID missing");
    if (!row.qidNumber?.trim())        blockingFields.push("QID Number missing");
    if (!row.bankAccount?.trim())      blockingFields.push("Bank Account (IBAN) missing");
    if (!row.bankName?.trim())         blockingFields.push("Bank Name missing");
    if (!row.routingNumber?.trim())    blockingFields.push("Routing Number missing");
    if (row.netPay <= 0)               blockingFields.push(`Net Pay is ${row.netPay <= 0 ? (row.netPay === 0 ? "zero" : "negative") : ""}`);

    const ba = row.bankAccount?.trim();
    const qid = row.qidNumber?.trim();
    if (ba && (bankAccountCounts.get(ba) ?? 0) > 1)
      blockingFields.push("Duplicate Bank Account (shared with another employee)");
    if (qid && (qidCounts.get(qid) ?? 0) > 1)
      blockingFields.push("Duplicate QID Number (shared with another employee)");

    // ── Warning checks ────────────────────────────────────────────────────
    if (qid && qid.length !== EXPECTED_QID_LENGTH)
      warningMessages.push(`QID is ${qid.length} characters (expected ${EXPECTED_QID_LENGTH})`);

    if (ba) {
      if (ba.length !== EXPECTED_IBAN_LENGTH)
        warningMessages.push(`IBAN is ${ba.length} characters (expected ${EXPECTED_IBAN_LENGTH})`);
      if (!/^[A-Za-z]{2}/.test(ba))
        warningMessages.push("IBAN does not start with two letters");
    }

    if (blockingFields.length > 0) {
      blockingIssues.push({
        employeeId: row.employeeId || "(no ID)",
        employeeName: row.employeeName,
        fields: blockingFields,
      });
    }

    if (warningMessages.length > 0) {
      warningIssues.push({
        employeeId: row.employeeId || "(no ID)",
        employeeName: row.employeeName,
        messages: warningMessages,
      });
    }
  }

  const passingCount = rows.filter(
    (row) => !blockingIssues.some((b) => b.employeeId === (row.employeeId || "(no ID)") && b.employeeName === row.employeeName)
  ).length;

  const totalNetPay = rows.reduce((sum, r) => sum + r.netPay, 0);

  return { blockingIssues, warningIssues, totalEmployees: rows.length, passingCount, totalNetPay };
}

// ─── Validation Panel ────────────────────────────────────────────────────────

function ValidationPanel({
  validation,
  runTitle,
  onExportCsv,
  onExportAnyway,
  onExportNormal,
}: {
  validation: ValidationResult;
  runTitle: string;
  onExportCsv: () => void;
  onExportAnyway: () => void;
  onExportNormal: () => void;
}) {
  const { blockingIssues, warningIssues, totalEmployees, passingCount, totalNetPay } = validation;
  const hasBlocking = blockingIssues.length > 0;
  const hasWarnings = warningIssues.length > 0;
  const contentRef = useRef<HTMLDivElement>(null);

  const [overrideClicked, setOverrideClicked] = useState(false);

  const handlePrint = () => {
    const el = contentRef.current;
    if (!el) return;
    const html = `<html><head><title>WPS Validation — ${runTitle}</title>
      <style>body{font-family:sans-serif;font-size:12px;padding:24px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f4f4f4}.block{color:#dc2626}.warn{color:#d97706}.ok{color:#16a34a}
      h1{font-size:16px}h2{font-size:13px;margin-top:16px}</style></head>
      <body>${el.innerHTML}</body></html>`;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked — please allow pop-ups"); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const handleExcelExport = () => {
    // Produce a CSV of the validation results
    const rows: string[][] = [
      ["Employee ID", "Employee Name", "Type", "Issue"],
    ];
    for (const b of blockingIssues) {
      for (const f of b.fields) rows.push([b.employeeId, b.employeeName, "BLOCKING", f]);
    }
    for (const w of warningIssues) {
      for (const m of w.messages) rows.push([w.employeeId, w.employeeName, "WARNING", m]);
    }
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WPS-Validation-${runTitle.replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Validation report downloaded");
  };

  return (
    <div className="space-y-4" ref={contentRef}>
      {/* Summary strip */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            {hasBlocking
              ? <AlertCircle className="w-4 h-4 text-destructive" />
              : <CheckCircle2 className="w-4 h-4 text-green-600" />}
            WPS Validation — {runTitle}
          </h3>
          {/* Toolbar */}
          <div className="flex items-center gap-1.5 print:hidden">
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Print</span>
            </Button>
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={handleExcelExport}>
              <Sheet className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">Excel / CSV</span>
            </Button>
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={onExportCsv}>
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline ml-1">WPS CSV</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Kpi label="Total Employees" value={totalEmployees} icon={<Users className="w-4 h-4 text-muted-foreground" />} />
          <Kpi label="Passing" value={passingCount} valueClass="text-green-600" />
          <Kpi
            label="Blocking Problems"
            value={blockingIssues.length}
            valueClass={blockingIssues.length > 0 ? "text-destructive font-bold" : "text-green-600"}
          />
          <Kpi
            label="Warnings"
            value={warningIssues.length}
            valueClass={warningIssues.length > 0 ? "text-amber-600" : "text-green-600"}
          />
          <Kpi
            label="Total Net Pay"
            value={totalNetPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            valueClass="font-bold"
          />
        </div>
      </div>

      {/* Blocking issues */}
      {hasBlocking ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Blocking Problems — must be fixed before export
            <Badge variant="destructive" className="ml-1">{blockingIssues.length} employee{blockingIssues.length !== 1 ? "s" : ""}</Badge>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-destructive/20">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[90px]">Emp ID</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Problems</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-destructive/10">
                {blockingIssues.map((issue, i) => (
                  <tr key={i}>
                    <td className="py-2 px-2 font-mono">{issue.employeeId}</td>
                    <td className="py-2 px-2 font-medium">{issue.employeeName}</td>
                    <td className="py-2 px-2">
                      <ul className="space-y-0.5">
                        {issue.fields.map((f, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-destructive">
                            <span className="mt-0.5">•</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-green-500/30 bg-green-50 dark:bg-green-950/20 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            No blocking problems found — all {totalEmployees} employees pass.
          </p>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Format Warnings — advisory only, export is not blocked
            <Badge className="ml-1 bg-amber-500 text-white">{warningIssues.length}</Badge>
          </h4>
          <p className="text-xs text-muted-foreground">
            Expected lengths are <strong>unverified</strong> — confirm against the current WPS / authority spec before relying on them.
            (QID: {EXPECTED_QID_LENGTH} chars, IBAN: {EXPECTED_IBAN_LENGTH} chars)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-amber-300/30">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[90px]">Emp ID</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/30">
                {warningIssues.map((issue, i) => (
                  <tr key={i}>
                    <td className="py-2 px-2 font-mono">{issue.employeeId}</td>
                    <td className="py-2 px-2 font-medium">{issue.employeeName}</td>
                    <td className="py-2 px-2">
                      <ul className="space-y-0.5">
                        {issue.messages.map((m, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                            <span className="mt-0.5">•</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export actions */}
      <div className="flex flex-wrap items-center gap-3 pt-1 print:hidden">
        {hasBlocking ? (
          <>
            <Button disabled className="cursor-not-allowed opacity-60">
              <Download className="w-4 h-4 mr-2" />
              Download WPS File
              <Badge variant="destructive" className="ml-2">{blockingIssues.length} problem{blockingIssues.length !== 1 ? "s" : ""}</Badge>
            </Button>

            {!overrideClicked ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground cursor-pointer hover:text-destructive"
                onClick={() => setOverrideClicked(true)}
              >
                Export anyway…
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                className="cursor-pointer"
                onClick={() => { onExportAnyway(); setOverrideClicked(false); }}
              >
                <AlertCircle className="w-4 h-4 mr-1.5" />
                Confirm — export with problems
              </Button>
            )}
          </>
        ) : (
          <Button onClick={onExportNormal} className="cursor-pointer">
            <Download className="w-4 h-4 mr-2" />
            Download WPS File (.csv)
          </Button>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className={cn("text-lg font-semibold leading-tight", valueClass)}>{value}</p>
    </div>
  );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function WpsExportTab() {
  const runs = useQuery(api.payroll.listPayrollRuns);
  const [selectedRunId, setSelectedRunId] = useState<string>("");

  const wpsData = useQuery(
    api.payroll.getWpsExportData,
    selectedRunId ? { payrollRunId: selectedRunId as Id<"payrollRuns"> } : "skip"
  );

  if (!runs) {
    return <Skeleton className="h-40 w-full" />;
  }

  const paidRuns = runs.filter((r) => r.status === "paid" || r.status === "approved");

  const buildCsvBlob = (): { blob: Blob; filename: string } | null => {
    if (!wpsData) return null;

    const headers = [
      "Employee ID", "Employee Name", "QID Number",
      "Bank Name", "Account Number", "Routing/IBAN",
      "Basic Salary", "Housing Allowance", "Transport Allowance",
      "Other Allowances", "Overtime", "Total Earnings",
      "Deductions", "Net Pay", "Pay Date",
      "Period Start", "Period End",
    ];

    const rows = wpsData.rows.map((r) => [
      r.employeeId,
      r.employeeName,
      r.qidNumber,
      r.bankName,
      r.bankAccount,
      r.routingNumber,
      r.baseSalary.toString(),
      r.housingAllowance.toString(),
      r.transportAllowance.toString(),
      r.otherAllowances.toString(),
      r.overtimeAmount.toString(),
      (r.baseSalary + r.totalAllowances + r.overtimeAmount).toString(),
      r.deductions.toString(),
      r.netPay.toString(),
      r.payDate,
      r.periodStart,
      r.periodEnd,
    ]);

    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const filename = `WPS-${wpsData.runTitle.replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    return { blob, filename };
  };

  const triggerDownload = () => {
    const result = buildCsvBlob();
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("WPS file downloaded");
  };

  const validation = wpsData ? validateRows(wpsData.rows as WpsRow[]) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            WPS Export (Wage Protection System)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Generate WPS-compliant salary transfer files for your bank
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {paidRuns.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia>
                <EmptyTitle>No approved payroll runs</EmptyTitle>
                <EmptyDescription>Approve or mark a payroll run as paid first</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-6">
              {/* Run selector */}
              <div>
                <Label>Select Payroll Run</Label>
                <Select value={selectedRunId} onValueChange={setSelectedRunId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a payroll run" />
                  </SelectTrigger>
                  <SelectContent>
                    {paidRuns.map((run) => (
                      <SelectItem key={run._id} value={run._id}>
                        {run.title} ({run.status}) — {run.employeeCount} emp
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRunId && !wpsData && <Skeleton className="h-32 w-full" />}

              {wpsData && (
                <>
                  {/* ── Validation Panel (shown first) ───────────── */}
                  {validation && (
                    <ValidationPanel
                      validation={validation}
                      runTitle={wpsData.runTitle}
                      onExportCsv={triggerDownload}
                      onExportAnyway={triggerDownload}
                      onExportNormal={triggerDownload}
                    />
                  )}

                  {/* ── Run metadata strip ────────────────────────── */}
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Payroll</p>
                        <p className="font-medium">{wpsData.runTitle}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Pay Date</p>
                        <p className="font-medium">{format(new Date(wpsData.payDate), "MMM d, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Employees</p>
                        <p className="font-medium">{wpsData.employeeCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Amount</p>
                        <p className="font-bold">{wpsData.totalAmount.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Row preview table ─────────────────────────── */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">ID</th>
                          <th className="text-left py-2 px-2">Name</th>
                          <th className="text-left py-2 px-2">Bank</th>
                          <th className="text-right py-2 px-2">Basic</th>
                          <th className="text-right py-2 px-2">Allow.</th>
                          <th className="text-right py-2 px-2">Deduct.</th>
                          <th className="text-right py-2 px-2 font-bold">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wpsData.rows.map((row) => (
                          <tr key={row.employeeId} className="border-b last:border-0">
                            <td className="py-2 px-2">{row.employeeId}</td>
                            <td className="py-2 px-2">{row.employeeName}</td>
                            <td className="py-2 px-2 truncate max-w-[100px]">{row.bankName}</td>
                            <td className="py-2 px-2 text-right">{row.baseSalary.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right">{row.totalAllowances.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right">{row.deductions.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-bold">{row.netPay.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
