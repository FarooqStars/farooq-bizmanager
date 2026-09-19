import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription as EmptyDesc, EmptyContent } from "@/components/ui/empty.tsx";
import { UserCheck, Plus, Banknote, CircleDollarSign, TrendingDown, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  fully_repaid: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function SalaryAdvancesTab() {
  const advances = useQuery(api.salaryAdvances.listSalaryAdvances, {});
  const summary = useQuery(api.salaryAdvances.getSalaryAdvanceSummary, {});
  const { fmt } = useCurrency();
  const [showCreate, setShowCreate] = useState(false);
  const [deductionAdvanceId, setDeductionAdvanceId] = useState<Id<"salaryAdvances"> | null>(null);

  if (advances === undefined || summary === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const deductionAdvance = deductionAdvanceId
    ? advances.find((a) => a._id === deductionAdvanceId)
    : null;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <UserCheck className="w-4 h-4 text-green-600" /> Active
            </div>
            <div className="text-xl font-bold break-words leading-tight">{summary.totalActive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingDown className="w-4 h-4 text-orange-600" /> Outstanding
            </div>
            <div className="text-xl font-bold text-orange-700 dark:text-orange-400 break-words leading-tight">{fmt(summary.totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Banknote className="w-4 h-4 text-blue-600" /> Total Issued
            </div>
            <div className="text-xl font-bold break-words leading-tight">{fmt(summary.totalIssued)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" /> Total Repaid
            </div>
            <div className="text-xl font-bold text-green-700 dark:text-green-400 break-words leading-tight">{fmt(summary.totalRepaid)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" /> Issue Advance
        </Button>
      </div>

      {/* Advances List */}
      {advances.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CircleDollarSign /></EmptyMedia>
            <EmptyTitle>No salary advances</EmptyTitle>
            <EmptyDesc>Issue salary advances to employees and track repayments here</EmptyDesc>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Issue Advance
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Advance #</th>
                    <th className="p-3 font-medium">Employee</th>
                    <th className="p-3 font-medium text-right">Issued</th>
                    <th className="p-3 font-medium text-right">Repaid</th>
                    <th className="p-3 font-medium text-right">Outstanding</th>
                    <th className="p-3 font-medium text-right">Monthly Deduction</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((adv) => (
                    <tr key={adv._id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-3 font-mono text-xs">{adv.advanceNumber}</td>
                      <td className="p-3 font-medium">{adv.employeeName}</td>
                      <td className="p-3 text-right">{fmt(adv.amount)}</td>
                      <td className="p-3 text-right">{fmt(adv.amountRepaid)}</td>
                      <td className="p-3 text-right font-semibold">{fmt(adv.outstandingBalance)}</td>
                      <td className="p-3 text-right">{fmt(adv.monthlyDeduction)}</td>
                      <td className="p-3">
                        <Badge className={cn("text-xs capitalize", statusStyles[adv.status])}>
                          {adv.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{adv.date}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {adv.status === "active" && (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="cursor-pointer text-xs"
                                onClick={() => setDeductionAdvanceId(adv._id)}
                              >
                                Record Deduction
                              </Button>
                              <CancelButton advanceId={adv._id} advanceNumber={adv.advanceNumber} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      {showCreate && <IssueAdvanceDialog onClose={() => setShowCreate(false)} />}
      {deductionAdvance && (
        <RecordDeductionDialog
          advance={deductionAdvance}
          onClose={() => setDeductionAdvanceId(null)}
        />
      )}
    </div>
  );
}

// ─── Cancel Button ────────────────────────────────────────────────────────────

function CancelButton({ advanceId, advanceNumber }: { advanceId: Id<"salaryAdvances">; advanceNumber: string }) {
  const cancel = useMutation(api.salaryAdvances.cancelSalaryAdvance);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!window.confirm(`Are you sure you want to cancel advance ${advanceNumber}?`)) return;
    setCancelling(true);
    try {
      await cancel({ advanceId });
      toast.success("Advance cancelled");
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to cancel advance");
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="cursor-pointer text-xs text-destructive hover:text-destructive"
      disabled={cancelling}
      onClick={handleCancel}
    >
      Cancel
    </Button>
  );
}

// ─── Issue Advance Dialog ─────────────────────────────────────────────────────

function IssueAdvanceDialog({ onClose }: { onClose: () => void }) {
  const employees = useQuery(api.payroll.listEmployees, { activeOnly: true });
  const bankAccounts = useQuery(api.accounting.listBankAccounts, {});
  const createAdvance = useMutation(api.salaryAdvances.createSalaryAdvance);

  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [repaymentMonths, setRepaymentMonths] = useState("3");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!employeeId) { toast.error("Please select an employee"); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Please enter a valid amount"); return; }
    if (!repaymentMonths || Number(repaymentMonths) <= 0) { toast.error("Repayment months must be at least 1"); return; }

    setSaving(true);
    try {
      await createAdvance({
        employeeId: employeeId as Id<"employees">,
        amount: Number(amount),
        date,
        repaymentMonths: Number(repaymentMonths),
        bankAccountId: bankAccountId ? (bankAccountId as Id<"accounts">) : undefined,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Salary advance issued successfully");
      onClose();
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to issue advance");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5" /> Issue Salary Advance
          </DialogTitle>
          <DialogDescription>
            Issue an advance to an employee with automatic monthly deduction tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {employees?.map((emp) => (
                  <SelectItem key={emp._id} value={emp._id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" min="0" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Repayment Months *</Label>
              <Input type="number" value={repaymentMonths} onChange={(e) => setRepaymentMonths(e.target.value)} placeholder="3" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Bank Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Default bank..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Use Default</SelectItem>
                  {bankAccounts?.map((acc) => (
                    <SelectItem key={acc._id} value={acc._id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical emergency, Education..." />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>

          {/* Preview */}
          {amount && repaymentMonths && Number(amount) > 0 && Number(repaymentMonths) > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Deduction Preview</p>
                <p className="text-sm">
                  Monthly deduction: <span className="font-semibold">{(Number(amount) / Number(repaymentMonths)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> for {repaymentMonths} months
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? "Issuing..." : "Issue Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Deduction Dialog ──────────────────────────────────────────────────

function RecordDeductionDialog({
  advance,
  onClose,
}: {
  advance: { _id: Id<"salaryAdvances">; advanceNumber: string; monthlyDeduction: number; outstandingBalance: number; employeeName: string };
  onClose: () => void;
}) {
  const recordDeduction = useMutation(api.salaryAdvances.recordAdvanceDeduction);
  const [deductionAmount, setDeductionAmount] = useState(String(advance.monthlyDeduction));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!deductionAmount || Number(deductionAmount) <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    try {
      await recordDeduction({
        advanceId: advance._id,
        amount: Number(deductionAmount),
        date,
        notes: notes.trim() || undefined,
      });
      toast.success("Deduction recorded successfully");
      onClose();
    } catch (error) {
      if (error instanceof ConvexError) {
        const { message } = error.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error("Failed to record deduction");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Deduction</DialogTitle>
          <DialogDescription>
            Record a deduction for advance {advance.advanceNumber} ({advance.employeeName}). Outstanding: {advance.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Amount *</Label>
            <Input type="number" value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} min="0" step="0.01" />
          </div>
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? "Recording..." : "Record Deduction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
