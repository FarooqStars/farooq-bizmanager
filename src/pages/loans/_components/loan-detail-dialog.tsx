import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Calendar, CheckCircle2, Circle, Clock, DollarSign, Trash2, XCircle, AlertTriangle
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const paymentStatusColors: Record<string, string> = {
  scheduled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  waived: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function LoanDetailDialog({
  loanId,
  onClose,
}: {
  loanId: Id<"loans">;
  onClose: () => void;
}) {
  const loan = useQuery(api.loans.getLoan, { id: loanId });
  const payments = useQuery(api.loans.getLoanPayments, { loanId });
  const schedule = useQuery(api.loans.getAmortizationSchedule, { loanId });
  const recordPayment = useMutation(api.loans.recordLoanPayment);
  const updateStatus = useMutation(api.loans.updateLoanStatus);
  const deleteLoan = useMutation(api.loans.deleteLoan);

  const [payingPayment, setPayingPayment] = useState<Id<"loanPayments"> | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payMethod, setPayMethod] = useState<string>("bank_transfer");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("payments");

  if (!loan || payments === undefined) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleRecordPayment = async (paymentId: Id<"loanPayments">, amount: number) => {
    setProcessing(true);
    try {
      await recordPayment({
        loanId,
        paymentId,
        date: payDate,
        amount,
        method: payMethod as "cash" | "bank_transfer" | "cheque" | "other",
        reference: payReference.trim() || undefined,
        notes: payNotes.trim() || undefined,
      });
      toast.success("Payment recorded");
      setPayingPayment(null);
      setPayReference("");
      setPayNotes("");
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusChange = async (status: "active" | "defaulted" | "cancelled") => {
    try {
      await updateStatus({ id: loanId, status });
      toast.success(`Loan marked as ${status}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure? This will delete the loan and all its payments.")) return;
    try {
      await deleteLoan({ id: loanId });
      toast.success("Loan deleted");
      onClose();
    } catch {
      toast.error("Failed to delete loan");
    }
  };

  const progressPct = loan.principalAmount > 0
    ? Math.round((loan.principalPaid / loan.principalAmount) * 100)
    : 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{loan.loanNumber}</span>
            <span>{loan.name}</span>
          </DialogTitle>
          <DialogDescription>
            {loan.type === "receivable" ? "Receivable from" : "Payable to"} {loan.entityName}
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
          <div className="text-center p-2 rounded bg-muted">
            <p className="text-xs text-muted-foreground">Principal</p>
            <p className="font-bold">{loan.principalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center p-2 rounded bg-muted">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="font-bold text-red-600">{loan.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center p-2 rounded bg-muted">
            <p className="text-xs text-muted-foreground">Total Interest</p>
            <p className="font-bold">{loan.totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center p-2 rounded bg-muted">
            <p className="text-xs text-muted-foreground">Monthly EMI</p>
            <p className="font-bold">{loan.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Paid: {loan.principalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span>{progressPct}% complete</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div className="bg-primary h-2.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-muted-foreground">Rate:</span> {loan.interestRate}% ({loan.interestType})</div>
          <div><span className="text-muted-foreground">Term:</span> {loan.termMonths} months</div>
          <div><span className="text-muted-foreground">Start:</span> {loan.startDate}</div>
          <div><span className="text-muted-foreground">End:</span> {loan.endDate}</div>
        </div>

        {/* Tabs for payments/schedule */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payments" className="cursor-pointer">Payments ({payments.filter((p) => p.status === "paid").length}/{payments.length})</TabsTrigger>
            <TabsTrigger value="schedule" className="cursor-pointer">Amortization Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="mt-3">
            <div className="overflow-x-auto max-h-60 overflow-y-auto border rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2">#</th>
                    <th className="p-2">Due Date</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-right">Principal</th>
                    <th className="p-2 text-right">Interest</th>
                    <th className="p-2 text-right">Balance</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p._id} className="border-b hover:bg-muted/30">
                      <td className="p-2">{p.paymentNumber}</td>
                      <td className="p-2">{p.date}</td>
                      <td className="p-2 text-right font-medium">{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{p.principalPortion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{p.interestPortion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{p.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2">
                        <Badge className={cn("text-[10px]", paymentStatusColors[p.status])}>{p.status}</Badge>
                      </td>
                      <td className="p-2">
                        {p.status === "scheduled" && loan.status === "active" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-6 text-xs" onClick={() => setPayingPayment(p._id)}>
                            Pay
                          </Button>
                        )}
                        {p.status === "paid" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-3">
            <div className="overflow-x-auto max-h-60 overflow-y-auto border rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2">#</th>
                    <th className="p-2">Date</th>
                    <th className="p-2 text-right">Payment</th>
                    <th className="p-2 text-right">Principal</th>
                    <th className="p-2 text-right">Interest</th>
                    <th className="p-2 text-right">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(schedule ?? []).map((entry) => (
                    <tr key={entry.paymentNumber} className="border-b hover:bg-muted/30">
                      <td className="p-2">{entry.paymentNumber}</td>
                      <td className="p-2">{entry.date}</td>
                      <td className="p-2 text-right font-medium">{entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{entry.principalPortion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{entry.interestPortion.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">{entry.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <DialogFooter className="flex-wrap gap-2">
          {loan.status === "active" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => handleStatusChange("defaulted")} className="cursor-pointer text-red-600">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Mark Defaulted
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleStatusChange("cancelled")} className="cursor-pointer">
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
            </>
          )}
          <Button size="sm" variant="destructive" onClick={handleDelete} className="cursor-pointer">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
          </Button>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer ml-auto">Close</Button>
        </DialogFooter>

        {/* Pay dialog */}
        {payingPayment && (
          <Dialog open onOpenChange={() => setPayingPayment(null)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label>Payment Date</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Cheque #, transfer ref..." />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPayingPayment(null)} className="cursor-pointer">Cancel</Button>
                <Button
                  onClick={() => {
                    const payment = payments.find((p) => p._id === payingPayment);
                    if (payment) handleRecordPayment(payingPayment, payment.amount);
                  }}
                  disabled={processing}
                  className="cursor-pointer"
                >
                  {processing ? "Processing..." : "Confirm Payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
