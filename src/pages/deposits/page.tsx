import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Authenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  PiggyBank,
  Plus,
  ArrowRightCircle,
  XCircle,
  RotateCcw,
  Eye,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Banknote,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type DepositStatus = "active" | "fully_applied" | "refunded" | "void";
type DepositType = "deposit" | "retainer";
type PaymentMethod = "cash" | "check" | "bank_transfer" | "credit_card" | "other";

function DepositsContent() {
  const { fmt } = useCurrency();
  const { t } = useTranslation();
  const deposits = useQuery(api.customerDeposits.list, {});
  const summary = useQuery(api.customerDeposits.getSummary, {});
  const customers = useQuery(api.sales.listCustomers, {});
  const bankAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const createDeposit = useMutation(api.customerDeposits.create);
  const voidDeposit = useMutation(api.customerDeposits.voidDeposit);
  const refundDeposit = useMutation(api.customerDeposits.refund);
  const applyToInvoice = useMutation(api.customerDeposits.applyToInvoice);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedDepositId, setSelectedDepositId] = useState<Id<"customerDeposits"> | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Create form state
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formType, setFormType] = useState<DepositType>("deposit");
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [formReference, setFormReference] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAccountId, setFormAccountId] = useState("");

  // Apply form state
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const [applyNotes, setApplyNotes] = useState("");

  const filteredDeposits = deposits?.filter((d) => {
    if (statusFilter === "all") return true;
    return d.status === statusFilter;
  });

  const handleCreate = async () => {
    if (!formCustomerId || !formAmount || parseFloat(formAmount) <= 0) {
      toast.error("Please fill in required fields");
      return;
    }
    if (!formAccountId) {
      toast.error("Select the cash / bank account the money went into");
      return;
    }
    try {
      await createDeposit({
        customerId: formCustomerId as Id<"customers">,
        date: formDate,
        amount: parseFloat(formAmount),
        type: formType,
        paymentMethod: formPaymentMethod,
        referenceNumber: formReference || undefined,
        description: formDescription || undefined,
        notes: formNotes || undefined,
        accountId: formAccountId as Id<"accounts">,
      });
      toast.success("Deposit created successfully");
      setShowCreateDialog(false);
      resetForm();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create deposit";
      toast.error(msg);
    }
  };

  const handleVoid = async (id: Id<"customerDeposits">) => {
    try {
      await voidDeposit({ id });
      toast.success("Deposit voided");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to void deposit";
      toast.error(msg);
    }
  };

  const handleRefund = async (id: Id<"customerDeposits">) => {
    try {
      await refundDeposit({ id });
      toast.success("Deposit refunded");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to refund deposit";
      toast.error(msg);
    }
  };

  const handleApply = async () => {
    if (!selectedDepositId || !applyInvoiceId || !applyAmount || parseFloat(applyAmount) <= 0) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      await applyToInvoice({
        depositId: selectedDepositId,
        invoiceId: applyInvoiceId as Id<"invoices">,
        amount: parseFloat(applyAmount),
        notes: applyNotes || undefined,
      });
      toast.success("Deposit applied to invoice successfully");
      setShowApplyDialog(false);
      setApplyInvoiceId("");
      setApplyAmount("");
      setApplyNotes("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to apply deposit";
      toast.error(msg);
    }
  };

  const resetForm = () => {
    setFormCustomerId("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormAmount("");
    setFormType("deposit");
    setFormPaymentMethod("bank_transfer");
    setFormReference("");
    setFormDescription("");
    setFormNotes("");
    setFormAccountId("");
  };

  const getStatusBadge = (status: DepositStatus) => {
    const variants: Record<DepositStatus, { label: string; className: string }> = {
      active: { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
      fully_applied: { label: "Fully Applied", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
      refunded: { label: "Refunded", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
      void: { label: "Void", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
    };
    const v = variants[status];
    return <Badge className={v.className}>{v.label}</Badge>;
  };

  const getTypeBadge = (type: DepositType) => {
    if (type === "deposit") {
      return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">Deposit</Badge>;
    }
    return <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">Retainer</Badge>;
  };

  if (!deposits || !summary) {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customer Deposits & Retainers</h1>
          <p className="text-muted-foreground mt-1">
            Accept upfront deposits and retainers, track balances, and apply to invoices
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          New Deposit
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <PiggyBank className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Deposits</p>
                <p className="text-xl font-semibold">{summary.activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-xl font-semibold">{fmt(summary.totalActive)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Banknote className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deposited</p>
                <p className="text-xl font-semibold">{fmt(summary.totalDeposits)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Applied</p>
                <p className="text-xl font-semibold">{fmt(summary.totalApplied)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm">Status:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="cursor-pointer">All</SelectItem>
            <SelectItem value="active" className="cursor-pointer">Active</SelectItem>
            <SelectItem value="fully_applied" className="cursor-pointer">Fully Applied</SelectItem>
            <SelectItem value="refunded" className="cursor-pointer">Refunded</SelectItem>
            <SelectItem value="void" className="cursor-pointer">Void</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filteredDeposits && filteredDeposits.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deposit #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeposits.map((deposit) => (
                  <TableRow key={deposit._id}>
                    <TableCell className="font-mono text-sm">{deposit.depositNumber}</TableCell>
                    <TableCell className="font-medium">{deposit.customerName}</TableCell>
                    <TableCell>{format(parseISO(deposit.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{getTypeBadge(deposit.type)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(deposit.amount)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(deposit.balance)}</TableCell>
                    <TableCell>{getStatusBadge(deposit.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {deposit.status === "active" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer h-8 w-8 p-0"
                              title="Apply to Invoice"
                              onClick={() => {
                                setSelectedDepositId(deposit._id);
                                setApplyAmount(deposit.balance.toString());
                                setShowApplyDialog(true);
                              }}
                            >
                              <ArrowRightCircle className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer h-8 w-8 p-0"
                              title="Refund"
                              onClick={() => handleRefund(deposit._id)}
                            >
                              <RotateCcw className="h-4 w-4 text-orange-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer h-8 w-8 p-0"
                              title="Void"
                              onClick={() => handleVoid(deposit._id)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="cursor-pointer h-8 w-8 p-0"
                          title="View Details"
                          onClick={() => {
                            setSelectedDepositId(deposit._id);
                            setShowDetailDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><PiggyBank /></EmptyMedia>
            <EmptyTitle>No deposits found</EmptyTitle>
            <EmptyDescription>
              Create your first customer deposit or retainer to get started
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="cursor-pointer">
              <Plus className="h-4 w-4 mr-2" />
              New Deposit
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer Deposit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Customer *</Label>
              <Select value={formCustomerId} onValueChange={setFormCustomerId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="cursor-pointer">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Amount *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as DepositType)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit" className="cursor-pointer">Deposit</SelectItem>
                    <SelectItem value="retainer" className="cursor-pointer">Retainer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={formPaymentMethod} onValueChange={(v) => setFormPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="cursor-pointer">Cash</SelectItem>
                    <SelectItem value="check" className="cursor-pointer">Check</SelectItem>
                    <SelectItem value="bank_transfer" className="cursor-pointer">Bank Transfer</SelectItem>
                    <SelectItem value="credit_card" className="cursor-pointer">Credit Card</SelectItem>
                    <SelectItem value="other" className="cursor-pointer">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Deposit Into (Cash / Bank Account) *</Label>
              <Select value={formAccountId} onValueChange={setFormAccountId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select cash / bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts?.map((a) => (
                    <SelectItem key={a._id} value={a._id} className="cursor-pointer">
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input
                placeholder="e.g. CHK-1234"
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                placeholder="Brief description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreateDialog(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleCreate} className="cursor-pointer">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Create Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to Invoice Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Deposit to Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Invoice ID *</Label>
              <Input
                placeholder="Paste invoice ID"
                value={applyInvoiceId}
                onChange={(e) => setApplyInvoiceId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the ID of the invoice to apply this deposit to
              </p>
            </div>
            <div>
              <Label>Amount to Apply *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={applyAmount}
                onChange={(e) => setApplyAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input
                placeholder="Optional notes"
                value={applyNotes}
                onChange={(e) => setApplyNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowApplyDialog(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleApply} className="cursor-pointer">
              <ArrowRightCircle className="h-4 w-4 mr-2" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deposit Details</DialogTitle>
          </DialogHeader>
          {selectedDepositId && <DepositDetail depositId={selectedDepositId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DepositDetail({ depositId }: { depositId: Id<"customerDeposits"> }) {
  const { fmt } = useCurrency();
  const deposit = useQuery(api.customerDeposits.getById, { id: depositId });
  const applications = useQuery(api.customerDeposits.getApplications, { depositId });

  if (!deposit) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Deposit #:</span>
          <span className="ml-2 font-mono">{deposit.depositNumber}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Customer:</span>
          <span className="ml-2 font-medium">{deposit.customerName}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Date:</span>
          <span className="ml-2">{format(parseISO(deposit.date), "MMM d, yyyy")}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Type:</span>
          <span className="ml-2 capitalize">{deposit.type}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Amount:</span>
          <span className="ml-2 font-medium">{fmt(deposit.amount)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Balance:</span>
          <span className="ml-2 font-medium text-green-600">{fmt(deposit.balance)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Applied:</span>
          <span className="ml-2">{fmt(deposit.appliedAmount)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Payment:</span>
          <span className="ml-2 capitalize">{deposit.paymentMethod?.replace("_", " ") ?? "N/A"}</span>
        </div>
      </div>

      {deposit.description && (
        <div className="text-sm">
          <span className="text-muted-foreground">Description:</span>
          <p className="mt-1">{deposit.description}</p>
        </div>
      )}

      {applications && applications.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">Applications</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((app) => (
                  <TableRow key={app._id}>
                    <TableCell className="font-mono text-sm">{app.invoiceNumber}</TableCell>
                    <TableCell>{format(parseISO(app.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">{fmt(app.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DepositsPage() {
  return (
    <>
      <AuthLoading>
        <div className="p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </AuthLoading>
      <Authenticated>
        <DepositsContent />
      </Authenticated>
    </>
  );
}
