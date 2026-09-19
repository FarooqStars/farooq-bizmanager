import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription as EmptyDesc, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Landmark, Plus, Eye, Trash2, PlayCircle, PauseCircle, XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import LoanDetailDialog from "./loan-detail-dialog.tsx";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  paid_off: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  defaulted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

type LoanType = "receivable" | "payable";

export default function LoansListTab({ type }: { type?: LoanType }) {
  const loans = useQuery(api.loans.listLoans, type ? { type } : {});
  const customers = useQuery(api.sales.listCustomers);
  const vendors = useQuery(api.vendors.listVendors);
  const bankAccounts = useQuery(api.accounting.listBankAccounts, {});
  const [showCreate, setShowCreate] = useState(false);
  const [viewingLoanId, setViewingLoanId] = useState<Id<"loans"> | null>(null);

  if (loans === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (loans.length === 0 && !showCreate) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-2" /> New Loan
          </Button>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Landmark /></EmptyMedia>
            <EmptyTitle>No loans yet</EmptyTitle>
            <EmptyDesc>Create your first loan to track receivables or payables with amortization</EmptyDesc>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Create Loan
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" /> New Loan
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">Loan #</th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Entity</th>
                  <th className="p-3 font-medium text-right">Principal</th>
                  <th className="p-3 font-medium text-right">Outstanding</th>
                  <th className="p-3 font-medium">Rate</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Next Due</th>
                  <th className="p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan._id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="p-3 font-mono text-xs">{loan.loanNumber}</td>
                    <td className="p-3 font-medium">{loan.name}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={cn("text-xs", loan.type === "receivable" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400")}>
                        {loan.type === "receivable" ? "Receivable" : "Payable"}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">{loan.entityName}</td>
                    <td className="p-3 text-right font-medium">{loan.principalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right font-semibold">{loan.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">{loan.interestRate}%</td>
                    <td className="p-3">
                      <Badge className={cn("text-xs capitalize", statusColors[loan.status])}>{loan.status.replace("_", " ")}</Badge>
                    </td>
                    <td className="p-3 text-xs">{loan.status === "active" ? loan.nextPaymentDate : "—"}</td>
                    <td className="p-3">
                      <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setViewingLoanId(loan._id)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreate && (
        <CreateLoanDialog
          onClose={() => setShowCreate(false)}
          defaultType={type}
          customers={customers ?? []}
          vendors={vendors ?? []}
          bankAccounts={bankAccounts ?? []}
        />
      )}

      {viewingLoanId && (
        <LoanDetailDialog
          loanId={viewingLoanId}
          onClose={() => setViewingLoanId(null)}
        />
      )}
    </div>
  );
}

// ─── Create Loan Dialog ──────────────────────────────────────────

function CreateLoanDialog({
  onClose,
  defaultType,
  customers,
  vendors,
  bankAccounts,
}: {
  onClose: () => void;
  defaultType?: LoanType;
  customers: Array<{ _id: Id<"customers">; name: string }>;
  vendors: Array<{ _id: Id<"vendors">; name: string }>;
  bankAccounts: Array<{ _id: Id<"accounts">; name: string }>;
}) {
  const createLoan = useMutation(api.loans.createLoan);
  const [name, setName] = useState("");
  const [loanType, setLoanType] = useState<LoanType>(defaultType ?? "payable");
  const [customerId, setCustomerId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string>("");
  const [lenderName, setLenderName] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [interestType, setInterestType] = useState<"simple" | "compound">("compound");
  const [termMonths, setTermMonths] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentFrequency, setPaymentFrequency] = useState<string>("monthly");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!principalAmount || Number(principalAmount) <= 0) { toast.error("Valid principal amount is required"); return; }
    if (!termMonths || Number(termMonths) <= 0) { toast.error("Valid term is required"); return; }

    setSaving(true);
    try {
      await createLoan({
        name: name.trim(),
        type: loanType,
        customerId: loanType === "receivable" && customerId ? customerId as Id<"customers"> : undefined,
        vendorId: loanType === "payable" && vendorId ? vendorId as Id<"vendors"> : undefined,
        lenderName: loanType === "payable" && !vendorId ? lenderName.trim() || undefined : undefined,
        bankAccountId: bankAccountId && bankAccountId !== "default" ? bankAccountId as Id<"accounts"> : undefined,
        principalAmount: Number(principalAmount),
        interestRate: Number(interestRate) || 0,
        interestType,
        termMonths: Number(termMonths),
        startDate,
        paymentFrequency: paymentFrequency as "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly",
        notes: notes.trim() || undefined,
      });
      toast.success("Loan created with amortization schedule");
      onClose();
    } catch (error) {
      toast.error("Failed to create loan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5" /> New Loan
          </DialogTitle>
          <DialogDescription>
            Create a loan with automatic amortization schedule generation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Loan Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Business Expansion Loan" />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={loanType} onValueChange={(v) => setLoanType(v as LoanType)}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receivable">Receivable (Owed to us)</SelectItem>
                  <SelectItem value="payable">Payable (We owe)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Entity selection based on type */}
          {loanType === "receivable" && (
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loanType === "payable" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vendor (optional)</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vendor..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (external)</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v._id} value={v._id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lender Name</Label>
                <Input value={lenderName} onChange={(e) => setLenderName(e.target.value)} placeholder="Bank name..." />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Principal Amount *</Label>
              <Input type="number" value={principalAmount} onChange={(e) => setPrincipalAmount(e.target.value)} placeholder="50000" min="0" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>Interest Rate (% pa)</Label>
              <Input type="number" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="5" min="0" step="0.01" />
            </div>
            <div className="space-y-2">
              <Label>Interest Type</Label>
              <Select value={interestType} onValueChange={(v) => setInterestType(v as "simple" | "compound")}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compound">Compound</SelectItem>
                  <SelectItem value="simple">Simple</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Term (months) *</Label>
              <Input type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="24" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Frequency</Label>
              <Select value={paymentFrequency} onValueChange={setPaymentFrequency}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bank Account</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Default bank..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Use Default</SelectItem>
                {bankAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>

          {/* Preview calculation */}
          {principalAmount && termMonths && Number(principalAmount) > 0 && Number(termMonths) > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Estimated Payment Summary</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Monthly Payment</p>
                    <p className="font-semibold">
                      {(() => {
                        const p = Number(principalAmount);
                        const r = Number(interestRate) || 0;
                        const t = Number(termMonths);
                        if (interestType === "compound" && r > 0) {
                          const mr = r / 100 / 12;
                          return (p * mr * Math.pow(1 + mr, t) / (Math.pow(1 + mr, t) - 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                        const ti = p * (r / 100) * (t / 12);
                        return ((p + ti) / t).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total Interest</p>
                    <p className="font-semibold">
                      {(() => {
                        const p = Number(principalAmount);
                        const r = Number(interestRate) || 0;
                        const t = Number(termMonths);
                        if (interestType === "compound" && r > 0) {
                          const mr = r / 100 / 12;
                          const emi = p * mr * Math.pow(1 + mr, t) / (Math.pow(1 + mr, t) - 1);
                          return (emi * t - p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                        return (p * (r / 100) * (t / 12)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total Payable</p>
                    <p className="font-semibold">
                      {(() => {
                        const p = Number(principalAmount);
                        const r = Number(interestRate) || 0;
                        const t = Number(termMonths);
                        if (interestType === "compound" && r > 0) {
                          const mr = r / 100 / 12;
                          const emi = p * mr * Math.pow(1 + mr, t) / (Math.pow(1 + mr, t) - 1);
                          return (emi * t).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }
                        const ti = p * (r / 100) * (t / 12);
                        return (p + ti).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="cursor-pointer">
            {saving ? "Creating..." : "Create Loan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
