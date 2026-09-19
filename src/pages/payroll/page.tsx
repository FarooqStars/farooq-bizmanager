import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Users, Plus, Pencil, Trash2, DollarSign, Calendar, FileText,
  CheckCircle2, Clock, BadgeCheck, AlertCircle, CalendarDays, Award, FileSpreadsheet,
  Heart, Printer, Receipt, Shield, BarChart3, XCircle, Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import EmployeePhoto from "./_components/employee-photo.tsx";
import EmployeeFormDialog from "./_components/employee-form.tsx";
import PayrollRunDialog from "./_components/payroll-run-dialog.tsx";
import LeaveTab from "./_components/leave-tab.tsx";
import GratuityTab from "./_components/gratuity-tab.tsx";
import WpsExportTab from "./_components/wps-export-tab.tsx";
import BenefitsTab from "./_components/benefits-tab.tsx";
import TaxDeclarationTab from "./_components/tax-declaration-tab.tsx";
import ChequeVoucherTab from "./_components/cheque-voucher-tab.tsx";
import SocialInsuranceTab from "./_components/social-insurance-tab.tsx";
import ComplianceReportsTab from "./_components/compliance-reports-tab.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

// ─── Employee Directory Tab ───────────────────────────────────

function EmployeesTab() {
  const employees = useQuery(api.payroll.listEmployees, {});
  const deleteEmployee = useMutation(api.payroll.deleteEmployee);
  const [formEmployee, setFormEmployee] = useState<Doc<"employees"> | null | "new">(null);
  const [search, setSearch] = useState("");

  if (!employees) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
    (e.department ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = employees.filter((e) => e.isActive).length;
  const totalSalary = employees.filter((e) => e.isActive).reduce((s, e) => s + e.baseSalary, 0);
  const totalAllowances = employees.filter((e) => e.isActive).reduce((s, e) =>
    s + (e.housingAllowance ?? 0) + (e.transportAllowance ?? 0) + (e.otherAllowances ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Employees</p>
              <p className="text-xl font-bold">{employees.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-bold">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Base Payroll</p>
              <p className="text-xl font-bold">{totalSalary.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Allowances</p>
              <p className="text-xl font-bold">{totalAllowances.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Add */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border bg-background text-sm"
        />
        <Button onClick={() => setFormEmployee("new")} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />Add Employee
        </Button>
      </div>

      {/* Employee list */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>No employees found</EmptyTitle>
            <EmptyDescription>
              {employees.length === 0 ? "Add your first employee to start managing payroll" : "Try a different search term"}
            </EmptyDescription>
          </EmptyHeader>
          {employees.length === 0 && (
            <EmptyContent>
              <Button size="sm" onClick={() => setFormEmployee("new")}>Add Employee</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-3">
          {filtered.map((emp) => (
            <Card key={emp._id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4 flex items-center gap-4">
                <EmployeePhoto
                  employeeId={emp._id}
                  photoUrl={emp.photoUrl}
                  name={emp.name}
                  size="md"
                  canEdit
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{emp.name}</p>
                    <Badge variant={emp.isActive ? "default" : "secondary"} className="text-xs">
                      {emp.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {emp.position ?? "No position"} {emp.department ? `• ${emp.department}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ID: {emp.employeeId} • Hired: {format(new Date(emp.hireDate), "MMM d, yyyy")}
                    {emp.nationality && ` • ${emp.nationality}`}
                    {emp.country && ` • ${({ QA: "Qatar", AE: "UAE", SA: "Saudi", PK: "Pakistan", IN: "India" } as Record<string, string>)[emp.country] ?? emp.country}`}
                  </p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="font-bold">{emp.currency} {emp.baseSalary.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {(emp.housingAllowance ?? 0) + (emp.transportAllowance ?? 0) + (emp.otherAllowances ?? 0) > 0
                      ? `+${((emp.housingAllowance ?? 0) + (emp.transportAllowance ?? 0) + (emp.otherAllowances ?? 0)).toLocaleString()} allow.`
                      : emp.payFrequency}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setFormEmployee(emp)} className="cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Employee?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete {emp.name} and their photo. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            try {
                              await deleteEmployee({ id: emp._id });
                              toast.success("Employee deleted");
                            } catch {
                              toast.error("Failed to delete employee");
                            }
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form dialog */}
      {formEmployee !== null && (
        <EmployeeFormDialog
          employee={formEmployee === "new" ? null : formEmployee}
          onClose={() => setFormEmployee(null)}
        />
      )}
    </div>
  );
}

// ─── Mark-as-Paid dialog (bank account selector) ─────────────

function MarkPaidDialog({
  runId,
  runTitle,
  onClose,
}: {
  runId: Id<"payrollRuns">;
  runTitle: string;
  onClose: () => void;
}) {
  const accounts = useQuery(api.accounting.listAccounts, {});
  const updateStatus = useMutation(api.payroll.updatePayrollStatus);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const bankAccounts = (accounts ?? []).filter(
    (a) => a.type === "bank" || a.type === "other_current_asset",
  );

  const handleConfirm = async () => {
    if (!selectedAccountId) {
      toast.error("Please select a payment account");
      return;
    }
    setLoading(true);
    try {
      await updateStatus({
        id: runId,
        status: "paid",
        paymentAccountId: selectedAccountId as Id<"accounts">,
      });
      toast.success("Payroll marked as paid — ledger entries posted");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to mark as paid";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Mark as Paid — {runTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Select the bank or cash account that this payroll will be paid from.
            This clears Salaries Payable against that account in the ledger.
            The selection cannot be changed after confirming.
          </p>
          <div className="space-y-1.5">
            <Label>Payment Account</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose bank or cash account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.length === 0 && (
                  <SelectItem value="none" disabled>No bank/cash accounts found</SelectItem>
                )}
                {bankAccounts.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.code} — {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selectedAccountId || loading} className="cursor-pointer">
            {loading ? "Posting…" : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payroll Runs Tab ─────────────────────────────────────────

function PayrollRunsTab() {
  const runs = useQuery(api.payroll.listPayrollRuns);
  const updateStatus = useMutation(api.payroll.updatePayrollStatus);
  const deleteRunDraft = useMutation(api.payroll.deletePayrollRunDraft);
  const voidRun = useMutation(api.payroll.voidPayrollRun);
  const [showCreate, setShowCreate] = useState(false);
  const [markPaidRunId, setMarkPaidRunId] = useState<Id<"payrollRuns"> | null>(null);
  const [markPaidRunTitle, setMarkPaidRunTitle] = useState("");

  if (!runs) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "draft": return <Clock className="w-4 h-4 text-yellow-500" />;
      case "approved": return <BadgeCheck className="w-4 h-4 text-blue-500" />;
      case "paid": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "voided": return <XCircle className="w-4 h-4 text-muted-foreground" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "approved": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "paid": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "voided": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{runs.length} payroll run{runs.length !== 1 ? "s" : ""}</p>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />New Payroll Run
        </Button>
      </div>

      {runs.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No payroll runs yet</EmptyTitle>
            <EmptyDescription>Create a payroll run to process employee payments</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)}>Create Payroll Run</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run._id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {statusIcon(run.status)}
                      <p className="font-medium truncate">{run.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(run.periodStart), "MMM d")} - {format(new Date(run.periodEnd), "MMM d, yyyy")}
                      </span>
                      <span>{run.employeeCount} employees</span>
                      <span>Pay: {format(new Date(run.payDate), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <p className="font-bold text-lg">{run.totalAmount.toLocaleString()}</p>
                  <div className="flex gap-1">
                    {run.status === "draft" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer"
                        onClick={async () => {
                          try {
                            await updateStatus({ id: run._id, status: "approved" });
                            toast.success("Payroll approved — accrual entries posted to ledger");
                          } catch (err) {
                            const msg = err instanceof Error ? err.message : "Failed to approve";
                            toast.error(msg);
                          }
                        }}
                      >
                        Approve
                      </Button>
                    )}
                    {run.status === "approved" && (
                      <Button
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => {
                          setMarkPaidRunId(run._id);
                          setMarkPaidRunTitle(run.title);
                        }}
                      >
                        Mark Paid
                      </Button>
                    )}
                    {/* Void button for approved/paid runs */}
                    {(run.status === "approved" || run.status === "paid") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive cursor-pointer" title="Void run">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Void Payroll Run?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will post reversing journal entries for "{run.title}", undoing all ledger
                              effects. The run and its payslips are preserved for audit. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                try {
                                  await voidRun({ id: run._id });
                                  toast.success("Payroll run voided — ledger entries reversed");
                                } catch (err) {
                                  const msg = err instanceof Error ? err.message : "Failed to void";
                                  toast.error(msg);
                                }
                              }}
                            >
                              Void Run
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {/* Delete only for draft runs with no ledger entries */}
                    {run.status === "draft" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive cursor-pointer">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Payroll Run?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will delete "{run.title}" and all its payslips. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  await deleteRunDraft({ id: run._id });
                                  toast.success("Payroll run deleted");
                                } catch (err) {
                                  const msg = err instanceof Error ? err.message : "Failed to delete";
                                  toast.error(msg);
                                }
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <PayrollRunDialog onClose={() => setShowCreate(false)} />}
      {markPaidRunId && (
        <MarkPaidDialog
          runId={markPaidRunId}
          runTitle={markPaidRunTitle}
          onClose={() => { setMarkPaidRunId(null); setMarkPaidRunTitle(""); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function PayrollPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-6 h-6" />
          Payroll & HR
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage employees, salaries, overtime, leave, and WPS compliance
        </p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="flex-wrap">
          <TabsTrigger value="employees" className="cursor-pointer">
            <Users className="w-4 h-4 mr-2" />Employees
          </TabsTrigger>
          <TabsTrigger value="payroll" className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" />Payroll Runs
          </TabsTrigger>
          <TabsTrigger value="leave" className="cursor-pointer">
            <CalendarDays className="w-4 h-4 mr-2" />Leave
          </TabsTrigger>
          <TabsTrigger value="benefits" className="cursor-pointer">
            <Heart className="w-4 h-4 mr-2" />Benefits
          </TabsTrigger>
          <TabsTrigger value="social-insurance" className="cursor-pointer">
            <Shield className="w-4 h-4 mr-2" />Social Insurance
          </TabsTrigger>
          <TabsTrigger value="gratuity" className="cursor-pointer">
            <Award className="w-4 h-4 mr-2" />Gratuity
          </TabsTrigger>
          <TabsTrigger value="tax" className="cursor-pointer">
            <Receipt className="w-4 h-4 mr-2" />Tax Filing
          </TabsTrigger>
          <TabsTrigger value="cheques" className="cursor-pointer">
            <Printer className="w-4 h-4 mr-2" />Cheques
          </TabsTrigger>
          <TabsTrigger value="wps" className="cursor-pointer">
            <FileSpreadsheet className="w-4 h-4 mr-2" />WPS Export
          </TabsTrigger>
          <TabsTrigger value="compliance" className="cursor-pointer">
            <BarChart3 className="w-4 h-4 mr-2" />Compliance & Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4">
          <EmployeesTab />
        </TabsContent>
        <TabsContent value="payroll" className="mt-4">
          <PayrollRunsTab />
        </TabsContent>
        <TabsContent value="leave" className="mt-4">
          <LeaveTab />
        </TabsContent>
        <TabsContent value="benefits" className="mt-4">
          <BenefitsTab />
        </TabsContent>
        <TabsContent value="social-insurance" className="mt-4">
          <SocialInsuranceTab />
        </TabsContent>
        <TabsContent value="gratuity" className="mt-4">
          <GratuityTab />
        </TabsContent>
        <TabsContent value="tax" className="mt-4">
          <TaxDeclarationTab />
        </TabsContent>
        <TabsContent value="cheques" className="mt-4">
          <ChequeVoucherTab />
        </TabsContent>
        <TabsContent value="wps" className="mt-4">
          <WpsExportTab />
        </TabsContent>
        <TabsContent value="compliance" className="mt-4">
          <ComplianceReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
