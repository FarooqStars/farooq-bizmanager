import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import {
  CreditCard, DollarSign, Calendar, CheckCircle, AlertTriangle,
  Banknote, Zap, History, Building, Landmark, Wallet,
} from "lucide-react";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";


type PaymentMethod = "cash" | "bank_transfer" | "check" | "credit_card" | "vendor_credit" | "advance_settlement" | "other";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "bank_transfer", label: "Bank Transfer", icon: Landmark },
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "check", label: "Check", icon: CreditCard },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "vendor_credit", label: "Vendor Credit", icon: Wallet },
  { value: "advance_settlement", label: "From Advance Payment", icon: DollarSign },
  { value: "other", label: "Other", icon: Wallet },
];

// ─── Pay Single Bill Dialog ──────────────────────────────────────────────────

export function PayBillDialog({
  bill,
  onClose,
}: {
  bill: {
    _id: Id<"bills">;
    title: string;
    vendorId: Id<"vendors">;
    vendorName: string;
    amount: number;
    balance: number;
    dueDate: string;
  };
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const payBill = useMutation(api.billPayments.payBill);
  const availableCredits = useQuery(api.billPayments.getAvailableCredits, { vendorId: bill.vendorId });
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const unsettledAdvances = useQuery(api.advancePayments.getUnsettledAdvances, {
    direction: "vendor",
    vendorId: bill.vendorId,
  });

  const [amount, setAmount] = useState(String(bill.balance));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCreditId, setSelectedCreditId] = useState<string>("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [selectedAdvanceId, setSelectedAdvanceId] = useState<string>("");
  const [paying, setPaying] = useState(false);

  // Active bank/cash ledger accounts for the "Pay From" picker
  const activeLedgerAccounts = ledgerAccounts ?? [];

  // Filter advances with remaining balance
  const availableAdvances = unsettledAdvances?.filter(
    (a) => (a.amount - (a.settledAmount ?? 0)) > 0
  ) ?? [];

  const handlePay = async () => {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (payAmount > bill.balance + 0.01) {
      toast.error("Payment exceeds balance due");
      return;
    }

    // Validate payment source
    if ((paymentMethod === "bank_transfer" || paymentMethod === "cash" || paymentMethod === "check" || paymentMethod === "credit_card" || paymentMethod === "other") && !selectedBankAccountId) {
      toast.error("Please select which account to pay from");
      return;
    }
    if (paymentMethod === "advance_settlement" && !selectedAdvanceId) {
      toast.error("Please select an advance payment to settle from");
      return;
    }
    if (paymentMethod === "advance_settlement" && selectedAdvanceId) {
      const adv = availableAdvances.find((a) => a._id === selectedAdvanceId);
      if (adv) {
        const advBalance = adv.amount - (adv.settledAmount ?? 0);
        if (payAmount > advBalance + 0.01) {
          toast.error(`Payment exceeds advance balance (${fmt(advBalance)})`);
          return;
        }
      }
    }

    setPaying(true);
    try {
      const result = await payBill({
        billId: bill._id,
        amount: payAmount,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        accountId: (paymentMethod !== "vendor_credit" && paymentMethod !== "advance_settlement" && selectedBankAccountId)
          ? selectedBankAccountId as Id<"accounts">
          : undefined,
        vendorCreditId: paymentMethod === "vendor_credit" && selectedCreditId
          ? selectedCreditId as Id<"vendorCredits">
          : undefined,
        advancePaymentId: paymentMethod === "advance_settlement" && selectedAdvanceId
          ? selectedAdvanceId as Id<"advancePayments">
          : undefined,
        notes: notes || undefined,
      });
      if (result.isFullyPaid) {
        toast.success(`Bill "${bill.title}" paid in full`);
      } else {
        toast.success(`Payment of ${fmt(payAmount)} recorded. Remaining: ${fmt(result.newBalance)}`);
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Pay Bill
          </DialogTitle>
          <DialogDescription>
            Record a payment for <strong>{bill.title}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          {/* Bill info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded bg-muted">
              <p className="text-muted-foreground">Vendor</p>
              <p className="font-medium">{bill.vendorName}</p>
            </div>
            <div className="p-3 rounded bg-muted">
              <p className="text-muted-foreground">Due Date</p>
              <p className="font-medium">{bill.dueDate}</p>
            </div>
            <div className="p-3 rounded bg-muted">
              <p className="text-muted-foreground">Total Bill</p>
              <p className="font-medium">{fmt(bill.amount)}</p>
            </div>
            <div className="p-3 rounded bg-destructive/10">
              <p className="text-muted-foreground">Balance Due</p>
              <p className="font-bold text-destructive">{fmt(bill.balance)}</p>
            </div>
          </div>

          {/* Payment Amount */}
          <div className="space-y-2">
            <Label>Payment Amount</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="0.01"
              max={bill.balance}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setAmount(String(bill.balance))}
                className="cursor-pointer text-xs"
              >
                Pay Full Balance
              </Button>
            </div>
          </div>

          {/* Payment Source / Method */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Pay From</Label>
            <Select value={paymentMethod} onValueChange={(v) => {
              setPaymentMethod(v as PaymentMethod);
              setSelectedBankAccountId("");
              setSelectedAdvanceId("");
              setSelectedCreditId("");
            }}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="cursor-pointer">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bank/Cash Account Selection - show for all direct payment methods */}
          {(paymentMethod === "bank_transfer" || paymentMethod === "cash" || paymentMethod === "check" || paymentMethod === "credit_card" || paymentMethod === "other") && (
            <div className="space-y-2 p-3 rounded border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
              <Label className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Landmark className="w-4 h-4" /> Pay From Account *
              </Label>
              {activeLedgerAccounts.length > 0 ? (
                <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Choose account..." /></SelectTrigger>
                  <SelectContent>
                    {activeLedgerAccounts.map((acc) => (
                      <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                        {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance ?? 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">No accounts configured. Go to General Ledger to add accounts.</p>
              )}
            </div>
          )}

          {/* Vendor Credit Selection */}
          {paymentMethod === "vendor_credit" && (
            <div className="space-y-2 p-3 rounded border border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20">
              <Label className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Wallet className="w-4 h-4" /> Select Vendor Credit
              </Label>
              {availableCredits && availableCredits.length > 0 ? (
                <Select value={selectedCreditId} onValueChange={setSelectedCreditId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select a credit..." /></SelectTrigger>
                  <SelectContent>
                    {availableCredits.map((credit) => (
                      <SelectItem key={credit._id} value={credit._id} className="cursor-pointer">
                        {credit.creditNumber} — {fmt(credit.amount)} ({credit.reason})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">No active credits available for this vendor</p>
              )}
            </div>
          )}

          {/* Advance Settlement Selection */}
          {paymentMethod === "advance_settlement" && (
            <div className="space-y-2 p-3 rounded border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
              <Label className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <DollarSign className="w-4 h-4" /> Settle from Earlier Advance
              </Label>
              {availableAdvances.length > 0 ? (
                <>
                  <Select value={selectedAdvanceId} onValueChange={(v) => {
                    setSelectedAdvanceId(v);
                    // Auto-set amount to min of advance balance and bill balance
                    const adv = availableAdvances.find((a) => a._id === v);
                    if (adv) {
                      const advBalance = adv.amount - (adv.settledAmount ?? 0);
                      setAmount(String(Math.min(advBalance, bill.balance).toFixed(2)));
                    }
                  }}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Choose advance payment..." /></SelectTrigger>
                    <SelectContent>
                      {availableAdvances.map((adv) => {
                        const remaining = adv.amount - (adv.settledAmount ?? 0);
                        return (
                          <SelectItem key={adv._id} value={adv._id} className="cursor-pointer">
                            {adv.date} — {fmt(adv.amount)} (Remaining: {fmt(remaining)}) {adv.reference ? `Ref: ${adv.reference}` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedAdvanceId && (
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Available: {fmt(
                        (availableAdvances.find((a) => a._id === selectedAdvanceId)?.amount ?? 0) -
                        (availableAdvances.find((a) => a._id === selectedAdvanceId)?.settledAmount ?? 0)
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No unsettled advance payments for this vendor</p>
              )}
            </div>
          )}

          {/* Reference Number */}
          <div className="space-y-2">
            <Label>Reference / Check Number</Label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Optional reference..."
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handlePay} disabled={paying} className="cursor-pointer">
            {paying ? "Processing..." : `Pay ${fmt(parseFloat(amount) || 0)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Batch Pay Dialog ────────────────────────────────────────────────────────

function BatchPayDialog({
  bills,
  onClose,
}: {
  bills: Array<{
    _id: Id<"bills">;
    title: string;
    vendorName: string;
    balance: number;
  }>;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const payMultiple = useMutation(api.billPayments.payMultipleBillsWithAllocations);
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [paying, setPaying] = useState(false);
  // Track individual amounts (default to full balance)
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(bills.map((b) => [b._id, String(b.balance)]))
  );

  const activeLedgerAccounts = ledgerAccounts ?? [];
  const totalPayment = bills.reduce((sum, b) => sum + (parseFloat(amounts[b._id] ?? "0") || 0), 0);

  const handlePay = async () => {
    const payments = bills
      .map((b) => ({
        billId: b._id,
        amount: parseFloat(amounts[b._id] ?? "0") || 0,
      }))
      .filter((p) => p.amount > 0);

    if (payments.length === 0) {
      toast.error("No valid payment amounts");
      return;
    }

    if (!selectedBankAccountId) {
      toast.error("Please select which account to pay from");
      return;
    }

    setPaying(true);
    try {
      const result = await payMultiple({
        payments,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: paymentMethod === "vendor_credit" ? "other" : (paymentMethod === "advance_settlement" ? "other" : paymentMethod),
        referenceNumber: referenceNumber || undefined,
        accountId: selectedBankAccountId as Id<"accounts">,
        notes: notes || undefined,
      });
      toast.success(`${result.paidCount} bills paid, total: ${fmt(result.totalPaid)}`);
      onClose();
    } catch {
      toast.error("Batch payment failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" /> Pay {bills.length} Bills
          </DialogTitle>
          <DialogDescription>
            Review and confirm payment amounts for selected bills.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          {/* Bill amounts */}
          <div className="space-y-2">
            {bills.map((bill) => (
              <div key={bill._id} className="flex items-center gap-3 p-2 rounded border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{bill.title}</p>
                  <p className="text-xs text-muted-foreground">{bill.vendorName} · Balance: {fmt(bill.balance)}</p>
                </div>
                <Input
                  value={amounts[bill._id] ?? ""}
                  onChange={(e) => setAmounts({ ...amounts, [bill._id]: e.target.value })}
                  type="number"
                  step="0.01"
                  className="w-28"
                />
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="p-3 rounded bg-primary/10 flex justify-between items-center">
            <span className="font-medium">Total Payment</span>
            <span className="text-lg font-bold">{fmt(totalPayment)}</span>
          </div>

          {/* Method */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Pay From</Label>
            <Select value={paymentMethod} onValueChange={(v) => {
              setPaymentMethod(v as PaymentMethod);
              setSelectedBankAccountId("");
            }}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.filter((m) => m.value !== "vendor_credit" && m.value !== "advance_settlement").map((m) => (
                  <SelectItem key={m.value} value={m.value} className="cursor-pointer">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account Selection for batch */}
          <div className="space-y-2 p-3 rounded border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
            <Label className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Landmark className="w-4 h-4" /> Pay From Account *
            </Label>
            {activeLedgerAccounts.length > 0 ? (
              <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Choose account..." /></SelectTrigger>
                <SelectContent>
                  {activeLedgerAccounts.map((acc) => (
                    <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                      {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance ?? 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No accounts configured. Go to General Ledger to add accounts.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Reference Number</Label>
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional..." />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handlePay} disabled={paying || totalPayment <= 0} className="cursor-pointer">
            {paying ? "Processing..." : `Pay ${fmt(totalPayment)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Pay Bills Tab ──────────────────────────────────────────────────────

type PayableBill = {
  _id: Id<"bills">;
  title: string;
  vendorId: Id<"vendors">;
  vendorName: string;
  amount: number;
  amountPaid?: number;
  balance: number;
  dueDate: string;
  status: "unpaid" | "overdue" | "partially_paid";
};

export default function PayBillsTab() {
  const { fmt } = useCurrency();
  const payableBills = useQuery(api.billPayments.getPayableBills, {});
  const paymentHistory = useQuery(api.billPayments.getPaymentHistory, {});
  const summary = useQuery(api.billPayments.getPaymentSummary);

  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [payingBill, setPayingBill] = useState<PayableBill | null>(null);
  const [showBatchPay, setShowBatchPay] = useState(false);
  const [subTab, setSubTab] = useState("pay");
  const [filterVendor, setFilterVendor] = useState("all");

  const toggleSelection = (id: string) => {
    const next = new Set(selectedBills);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBills(next);
  };

  const toggleAll = () => {
    if (!payableBills) return;
    if (selectedBills.size === payableBills.length) {
      setSelectedBills(new Set());
    } else {
      setSelectedBills(new Set(payableBills.map((b) => b._id)));
    }
  };

  // Get unique vendors for filter
  const vendorNames = [...new Set(payableBills?.map((b) => b.vendorName) ?? [])].sort();
  const filteredBills = payableBills?.filter(
    (b) => filterVendor === "all" || b.vendorName === filterVendor
  ) ?? [];

  const selectedBillsData = filteredBills.filter((b) => selectedBills.has(b._id));
  const selectedTotal = selectedBillsData.reduce((sum, b) => sum + b.balance, 0);

  const handleBatchPay = () => {
    if (selectedBillsData.length === 0) {
      toast.error("Select at least one bill");
      return;
    }
    setShowBatchPay(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5" /> Pay Bills
        </h2>
        <p className="text-sm text-muted-foreground">Select bills to pay individually or in batch</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">Total Owed</p>
                  <p className="text-lg font-bold text-red-600 break-words leading-tight">{fmt(summary.totalOwed)}</p>
                </div>
                <DollarSign className="w-5 h-5 text-red-500 flex-shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{summary.unpaidBillCount} bills</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">Overdue</p>
                  <p className="text-lg font-bold text-amber-600 break-words leading-tight">{fmt(summary.overdueAmount)}</p>
                </div>
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{summary.overdueBillCount} overdue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">Paid This Month</p>
                  <p className="text-lg font-bold text-green-600 break-words leading-tight">{fmt(summary.monthPaid)}</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">Total Paid (All Time)</p>
                  <p className="text-lg font-bold break-words leading-tight">{fmt(summary.totalPaid)}</p>
                </div>
                <Banknote className="w-5 h-5 text-primary flex-shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{summary.paymentCount} payments</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="pay" className="cursor-pointer">
            <CreditCard className="w-4 h-4 mr-1" /> Bills to Pay ({payableBills?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history" className="cursor-pointer">
            <History className="w-4 h-4 mr-1" /> Payment History ({paymentHistory?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Bills to Pay */}
        <TabsContent value="pay" className="mt-4">
          {payableBills === undefined ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : payableBills.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle /></EmptyMedia>
                <EmptyTitle>All bills are paid</EmptyTitle>
                <EmptyDescription>No outstanding bills at this time</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {/* Filter & Actions */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedBills.size === filteredBills.length && filteredBills.length > 0}
                    onChange={toggleAll}
                    className="cursor-pointer w-4 h-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedBills.size > 0 ? `${selectedBills.size} selected (${fmt(selectedTotal)})` : "Select all"}
                  </span>
                  {vendorNames.length > 1 && (
                    <Select value={filterVendor} onValueChange={setFilterVendor}>
                      <SelectTrigger className="w-40 cursor-pointer h-8 text-xs">
                        <SelectValue placeholder="Filter vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Vendors</SelectItem>
                        {vendorNames.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleBatchPay}
                  disabled={selectedBills.size === 0}
                  className="cursor-pointer"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Pay Selected ({selectedBills.size})
                </Button>
              </div>

              {/* Bill List */}
              <div className="border rounded-lg divide-y">
                {filteredBills.map((bill) => {
                  const isOverdue = bill.status === "overdue";
                  const isPartial = bill.status === "partially_paid";
                  return (
                    <div key={bill._id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedBills.has(bill._id)}
                        onChange={() => toggleSelection(bill._id)}
                        className="cursor-pointer w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{bill.title}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            <Building className="w-2.5 h-2.5 mr-0.5" />{bill.vendorName}
                          </Badge>
                          {isOverdue && (
                            <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Overdue</Badge>
                          )}
                          {isPartial && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Partial</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Due: {bill.dueDate}
                          </span>
                          {isPartial && (
                            <span>Paid: {fmt(bill.amountPaid ?? 0)} of {fmt(bill.amount)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn("text-sm font-bold", isOverdue && "text-red-600")}>
                          {fmt(bill.balance)}
                        </p>
                        {bill.balance !== bill.amount && (
                          <p className="text-xs text-muted-foreground">of {fmt(bill.amount)}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPayingBill(bill as PayableBill)}
                        className="cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Payment History */}
        <TabsContent value="history" className="mt-4">
          {paymentHistory === undefined ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : paymentHistory.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><History /></EmptyMedia>
                <EmptyTitle>No payment history</EmptyTitle>
                <EmptyDescription>Payments will appear here once you pay bills</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="border rounded-lg divide-y">
              {paymentHistory.map((payment) => (
                <div key={payment._id} className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{payment.billTitle}</p>
                      <span className="text-xs text-muted-foreground">{payment.vendorName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {payment.paymentDate}
                      </span>
                      <span className="capitalize">{payment.paymentMethod.replace(/_/g, " ")}</span>
                      {payment.referenceNumber && <span>Ref: {payment.referenceNumber}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-green-600">{fmt(payment.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {payingBill && <PayBillDialog bill={payingBill} onClose={() => setPayingBill(null)} />}
      {showBatchPay && (
        <BatchPayDialog
          bills={selectedBillsData}
          onClose={() => { setShowBatchPay(false); setSelectedBills(new Set()); }}
        />
      )}
    </div>
  );
}
