import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarDays, Plus, CheckCircle2, XCircle, Clock, Scale, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table.tsx";
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

export default function LeaveTab() {
  const employees = useQuery(api.payroll.listEmployees, {});
  const leaveRecords = useQuery(api.payroll.listLeaveRecords, {});
  const updateLeaveStatus = useMutation(api.payroll.updateLeaveStatus);
  const recalculateAll = useMutation(api.payroll.recalculateAllLeaveEntitlements);
  const [showRequest, setShowRequest] = useState(false);
  const [showPolicies, setShowPolicies] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [recalculating, setRecalculating] = useState(false);

  if (!employees || !leaveRecords) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const employeeMap = new Map(employees.map((e) => [e._id, e]));

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "approved": return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default: return null;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "annual": return "Annual Leave";
      case "sick": return "Sick Leave";
      case "unpaid": return "Unpaid Leave";
      case "emergency": return "Emergency Leave";
      case "casual": return "Casual Leave";
      default: return type;
    }
  };

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      const result = await recalculateAll({});
      toast.success(`Leave entitlements updated: ${result.updated} of ${result.total} employees recalculated`);
    } catch {
      toast.error("Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Leave balance summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {employees.filter((e) => e.isActive).slice(0, 6).map((emp) => (
          <Card key={emp._id} className="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all" onClick={() => { setSelectedEmpId(emp._id); setShowPolicies(true); }}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate">{emp.name}</p>
                {emp.country && <span className="text-xs">{COUNTRY_FLAGS[emp.country]}</span>}
              </div>
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                <span>Annual: <strong className="text-foreground">{emp.annualLeaveBalance ?? 21}d</strong></span>
                <span>Sick: <strong className="text-foreground">{emp.sickLeaveBalance ?? 14}d</strong></span>
                <span>Unpaid: <strong className="text-foreground">{emp.unpaidLeaveTaken ?? 0}d</strong></span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">{leaveRecords.length} leave record{leaveRecords.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleRecalculateAll} disabled={recalculating} className="cursor-pointer">
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recalculating..." : "Recalculate Entitlements"}
          </Button>
          <Button onClick={() => setShowRequest(true)} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />New Leave Request
          </Button>
        </div>
      </div>

      {leaveRecords.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarDays /></EmptyMedia>
            <EmptyTitle>No leave records</EmptyTitle>
            <EmptyDescription>Submit leave requests for employees</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowRequest(true)}>New Request</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {leaveRecords.map((record) => {
            const emp = employeeMap.get(record.employeeId);
            return (
              <Card key={record._id}>
                <CardContent className="py-3 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{emp?.name ?? "Unknown"}</p>
                      {statusBadge(record.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {typeLabel(record.type)} • {record.days} day{record.days > 1 ? "s" : ""} •{" "}
                      {format(new Date(record.startDate), "MMM d")} - {format(new Date(record.endDate), "MMM d, yyyy")}
                    </p>
                    {record.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">"{record.reason}"</p>
                    )}
                  </div>
                  {record.status === "pending" && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="cursor-pointer text-xs"
                        onClick={async () => {
                          await updateLeaveStatus({ id: record._id, status: "approved" });
                          toast.success("Leave approved");
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer text-xs text-destructive"
                        onClick={async () => {
                          await updateLeaveStatus({ id: record._id, status: "rejected" });
                          toast.success("Leave rejected");
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showRequest && (
        <LeaveRequestDialog
          employees={employees.filter((e) => e.isActive)}
          onClose={() => setShowRequest(false)}
        />
      )}

      {showPolicies && selectedEmpId && (
        <LeavePolicyDialog
          employeeId={selectedEmpId as Id<"employees">}
          onClose={() => setShowPolicies(false)}
        />
      )}
    </div>
  );
}

// ─── Leave Policy Dialog ────────────────────────────────────

function LeavePolicyDialog({
  employeeId,
  onClose,
}: {
  employeeId: Id<"employees">;
  onClose: () => void;
}) {
  const policies = useQuery(api.payroll.getCountryLeavePolicies, { employeeId });
  const recalculate = useMutation(api.payroll.recalculateLeaveEntitlements);
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await recalculate({ employeeId });
      toast.success(`Leave updated: Annual ${result.annual}d, Sick ${result.sick}d`);
    } catch {
      toast.error("Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  const payRateBadge = (rate: string) => {
    switch (rate) {
      case "full": return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Full Pay</Badge>;
      case "half": return <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Half Pay</Badge>;
      case "75%": return <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">75% Pay</Badge>;
      case "unpaid": return <Badge variant="secondary" className="text-xs">Unpaid</Badge>;
      default: return <Badge variant="secondary" className="text-xs">{rate}</Badge>;
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Leave Policy & Entitlements
          </DialogTitle>
        </DialogHeader>

        {!policies ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Country header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{COUNTRY_FLAGS[policies.country]}</span>
                <div>
                  <p className="font-medium">{policies.countryName} Labour Law</p>
                  <p className="text-xs text-muted-foreground">Tenure: {policies.yearsWorked} years</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={handleRecalculate} disabled={recalculating} className="cursor-pointer">
                <RefreshCw className={`w-3 h-3 mr-1 ${recalculating ? "animate-spin" : ""}`} />
                Recalculate
              </Button>
            </div>

            {/* Current Balances */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Current Balances</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Annual</p>
                    <p className="text-xl font-bold">{policies.currentBalances.annual}<span className="text-sm text-muted-foreground ml-1">days</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sick</p>
                    <p className="text-xl font-bold">{policies.currentBalances.sick}<span className="text-sm text-muted-foreground ml-1">days</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Unpaid Taken</p>
                    <p className="text-xl font-bold">{policies.currentBalances.unpaidTaken}<span className="text-sm text-muted-foreground ml-1">days</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Policy Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Leave Entitlements per {policies.countryName} Law</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Days/Year</TableHead>
                      <TableHead>Pay</TableHead>
                      <TableHead>Law Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.policies.map((policy, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{policy.label}</p>
                            {policy.condition && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Info className="w-3 h-3" />{policy.condition}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold">{policy.days}</span>
                        </TableCell>
                        <TableCell>{payRateBadge(policy.payRate)}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{policy.law}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Leave Request Dialog ────────────────────────────────────

function LeaveRequestDialog({
  employees,
  onClose,
}: {
  employees: Array<{ _id: Id<"employees">; name: string; country?: string }>;
  onClose: () => void;
}) {
  const createLeave = useMutation(api.payroll.createLeaveRequest);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<"annual" | "sick" | "unpaid" | "emergency">("annual");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const days = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1
  ));

  const selectedEmp = employees.find((e) => e._id === employeeId);
  const countryFlag = selectedEmp?.country ? COUNTRY_FLAGS[selectedEmp.country] ?? "" : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      toast.error("Select an employee");
      return;
    }
    setSaving(true);
    try {
      await createLeave({
        employeeId: employeeId as Id<"employees">,
        type,
        startDate,
        endDate,
        days,
        reason: reason || undefined,
      });
      toast.success("Leave request submitted");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Leave Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp._id} value={emp._id}>
                    {emp.country ? `${COUNTRY_FLAGS[emp.country] ?? ""} ` : ""}{emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {countryFlag && (
              <p className="text-xs text-muted-foreground mt-1">{countryFlag} Leave policy applies based on employee's country</p>
            )}
          </div>
          <div>
            <Label>Leave Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">Annual Leave</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                <SelectItem value="emergency">Emergency Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{days} day{days > 1 ? "s" : ""}</p>
          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional reason..." rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
