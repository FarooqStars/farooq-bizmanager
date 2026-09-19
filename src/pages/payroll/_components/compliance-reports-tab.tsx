import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format } from "date-fns";
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, Info, Globe, Users,
  DollarSign, CalendarDays, Shield, FileText, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const COUNTRY_FLAGS: Record<string, string> = {
  QA: "🇶🇦",
  AE: "🇦🇪",
  SA: "🇸🇦",
  PK: "🇵🇰",
  IN: "🇮🇳",
  BH: "🇧🇭",
  KW: "🇰🇼",
  OM: "🇴🇲",
  EG: "🇪🇬",
  JO: "🇯🇴",
};

export default function ComplianceReportsTab() {
  const dashboard = useQuery(api.payroll.getComplianceDashboard, {});
  const payrollRuns = useQuery(api.payroll.listPayrollRuns);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const selectedRun = useQuery(
    api.payroll.getPayrollRun,
    selectedRunId ? { id: selectedRunId as Id<"payrollRuns"> } : "skip"
  );

  if (!dashboard || !payrollRuns) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (dashboard.totalEmployees === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ClipboardCheck /></EmptyMedia>
          <EmptyTitle>No employees found</EmptyTitle>
          <EmptyDescription>Add employees to view compliance reports</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const statusIcon = (status: "pass" | "warning" | "info") => {
    switch (status) {
      case "pass": return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case "info": return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Country Summary Cards ───────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4" /> Country Payroll Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboard.countryGroups.map((group) => (
            <Card key={group.country}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="text-lg">{COUNTRY_FLAGS[group.country]}</span>
                  <span>{group.countryName}</span>
                  <Badge variant="secondary" className="ml-auto">{group.count} emp</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Base Payroll:</span>
                  </div>
                  <div className="font-medium text-right">{Math.round(group.totalBaseSalary).toLocaleString()}</div>

                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">SI Employee:</span>
                  </div>
                  <div className="font-medium text-right text-red-600">
                    {group.siApplicable ? `-${Math.round(group.totalSIEmployee).toLocaleString()}` : "N/A"}
                  </div>

                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">SI Employer:</span>
                  </div>
                  <div className="font-medium text-right text-blue-600">
                    {group.siApplicable ? Math.round(group.totalSIEmployer).toLocaleString() : "N/A"}
                  </div>

                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Leave Days:</span>
                  </div>
                  <div className="font-medium text-right">{group.totalLeaveEntitlement}d total</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ─── Compliance Checklist ─────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" /> Compliance Checklist
        </h3>
        <div className="space-y-3">
          {dashboard.checklist.map((countryChecklist) => (
            <Card key={countryChecklist.country}>
              <CardContent className="py-3">
                <button
                  className="flex items-center gap-2 w-full text-left cursor-pointer"
                  onClick={() => setExpandedCountry(expandedCountry === countryChecklist.country ? null : countryChecklist.country)}
                >
                  {expandedCountry === countryChecklist.country ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="text-lg">{COUNTRY_FLAGS[countryChecklist.country]}</span>
                  <span className="font-medium text-sm">{countryChecklist.countryName}</span>
                  <div className="ml-auto flex gap-1">
                    {countryChecklist.items.some((i) => i.status === "warning") && (
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                        {countryChecklist.items.filter((i) => i.status === "warning").length} warnings
                      </Badge>
                    )}
                    {countryChecklist.items.every((i) => i.status !== "warning") && (
                      <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        All clear
                      </Badge>
                    )}
                  </div>
                </button>
                {expandedCountry === countryChecklist.country && (
                  <div className="mt-3 space-y-2 pl-6">
                    {countryChecklist.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {statusIcon(item.status)}
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground">— {item.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ─── Payslip Breakdown by Run ─────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Payslip Report with Social Insurance
        </h3>
        <div className="mb-3">
          <Select value={selectedRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="w-72 cursor-pointer">
              <SelectValue placeholder="Select a payroll run to view" />
            </SelectTrigger>
            <SelectContent>
              {payrollRuns.map((run) => (
                <SelectItem key={run._id} value={run._id}>
                  {run.title} ({format(new Date(run.periodStart), "MMM d")} - {format(new Date(run.periodEnd), "MMM d, yyyy")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedRunId && !selectedRun && (
          <Skeleton className="h-40 w-full" />
        )}

        {selectedRun && selectedRun.payslips.length > 0 && (
          <Card>
            <CardContent className="py-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Allowances</TableHead>
                      <TableHead className="text-right">SI (Emp)</TableHead>
                      <TableHead className="text-right">SI (Employer)</TableHead>
                      <TableHead className="text-right">Other Ded.</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.payslips.map((slip) => {
                      const country = (slip as { employeeCountry?: string }).employeeCountry ?? "QA";
                      return (
                        <TableRow key={slip._id}>
                          <TableCell className="font-medium">{slip.employeeName}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1 text-xs">
                              {COUNTRY_FLAGS[country]} {country}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{slip.baseSalary.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {slip.allowances > 0 ? `+${Math.round(slip.allowances).toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {slip.socialInsuranceEmployee ? `-${Math.round(slip.socialInsuranceEmployee).toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {slip.socialInsuranceEmployer ? Math.round(slip.socialInsuranceEmployer).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {(slip.deductions - (slip.socialInsuranceEmployee ?? 0)) > 0
                              ? `-${Math.round(slip.deductions - (slip.socialInsuranceEmployee ?? 0)).toLocaleString()}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-bold">{slip.netPay.toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    <TableRow className="border-t-2 font-bold">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">
                        {selectedRun.payslips.reduce((s, p) => s + p.baseSalary, 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        +{Math.round(selectedRun.payslips.reduce((s, p) => s + p.allowances, 0)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        -{Math.round(selectedRun.payslips.reduce((s, p) => s + (p.socialInsuranceEmployee ?? 0), 0)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {Math.round(selectedRun.payslips.reduce((s, p) => s + (p.socialInsuranceEmployer ?? 0), 0)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        -{Math.round(selectedRun.payslips.reduce((s, p) => s + p.deductions - (p.socialInsuranceEmployee ?? 0), 0)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {selectedRun.payslips.reduce((s, p) => s + p.netPay, 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* SI Details */}
              {selectedRun.payslips.some((p) => p.socialInsuranceDetails) && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs font-medium mb-2">Social Insurance Details</p>
                  <div className="space-y-1">
                    {selectedRun.payslips
                      .filter((p) => p.socialInsuranceDetails)
                      .map((p) => (
                        <div key={p._id} className="text-xs text-muted-foreground flex gap-2">
                          <span className="font-medium min-w-24">{p.employeeName}:</span>
                          <span>{p.socialInsuranceDetails}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedRun && selectedRun.payslips.length === 0 && (
          <p className="text-sm text-muted-foreground">No payslips in this run.</p>
        )}

        {!selectedRunId && payrollRuns.length === 0 && (
          <p className="text-sm text-muted-foreground">No payroll runs available. Create a payroll run first.</p>
        )}
      </div>

      {/* ─── Leave Balance Dashboard ──────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Leave Balance by Country
        </h3>
        <LeaveByCountry />
      </div>
    </div>
  );
}

// ─── Leave by Country Sub-component ─────────────────────────

function LeaveByCountry() {
  const employees = useQuery(api.payroll.listEmployees, { activeOnly: true });

  if (!employees) return <Skeleton className="h-32 w-full" />;

  const COUNTRY_NAMES: Record<string, string> = { QA: "Qatar", AE: "UAE", SA: "Saudi Arabia", PK: "Pakistan", IN: "India", BH: "Bahrain", KW: "Kuwait", OM: "Oman", EG: "Egypt", JO: "Jordan" };

  // Group employees by country
  const groups: Record<string, Array<{
    name: string;
    annual: number;
    sick: number;
    unpaid: number;
  }>> = {};

  for (const emp of employees) {
    const country = emp.country ?? "QA";
    if (!groups[country]) groups[country] = [];
    groups[country].push({
      name: emp.name,
      annual: emp.annualLeaveBalance ?? 0,
      sick: emp.sickLeaveBalance ?? 0,
      unpaid: emp.unpaidLeaveTaken ?? 0,
    });
  }

  if (Object.keys(groups).length === 0) {
    return <p className="text-sm text-muted-foreground">No active employees.</p>;
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([code, emps]) => (
        <Card key={code}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span>{COUNTRY_FLAGS[code]}</span>
              <span>{COUNTRY_NAMES[code] ?? code}</span>
              <Badge variant="secondary" className="ml-2">{emps.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Annual</TableHead>
                    <TableHead className="text-right">Sick</TableHead>
                    <TableHead className="text-right">Unpaid Taken</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emps.map((emp, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="text-right">{emp.annual}d</TableCell>
                      <TableCell className="text-right">{emp.sick}d</TableCell>
                      <TableCell className="text-right">{emp.unpaid}d</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t font-medium">
                    <TableCell>Average</TableCell>
                    <TableCell className="text-right">
                      {Math.round(emps.reduce((s, e) => s + e.annual, 0) / emps.length)}d
                    </TableCell>
                    <TableCell className="text-right">
                      {Math.round(emps.reduce((s, e) => s + e.sick, 0) / emps.length)}d
                    </TableCell>
                    <TableCell className="text-right">
                      {Math.round(emps.reduce((s, e) => s + e.unpaid, 0) / emps.length)}d
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
