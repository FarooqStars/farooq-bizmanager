import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { toast } from "sonner";
import { Landmark, Send, Wallet, CheckCircle2, Clock } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function BatchDepositsTab() {
  const undepositedPayments = useQuery(api.batch.getUndepositedPayments);
  // Use unified accounts table (bank type) instead of deprecated bankAccounts
  const bankAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const deposits = useQuery(api.batch.listBatchDeposits);
  const batchDeposit = useMutation(api.batch.batchDeposit);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bankAccountId, setBankAccountId] = useState("");
  const [depositDate, setDepositDate] = useState(new Date().toISOString().split("T")[0]);
  const [memo, setMemo] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  if (!undepositedPayments || !bankAccounts || !deposits) {
    return <Skeleton className="h-60 w-full" />;
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === undepositedPayments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(undepositedPayments.map((p) => p._id)));
    }
  };

  const selectedTotal = undepositedPayments
    .filter((p) => selectedIds.has(p._id))
    .reduce((sum, p) => sum + p.amount, 0);

  const handleDeposit = async () => {
    if (!bankAccountId) {
      toast.error("Please select a bank account");
      return;
    }
    if (selectedIds.size === 0) {
      toast.error("Please select at least one payment");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await batchDeposit({
        accountId: bankAccountId as Id<"accounts">,
        date: depositDate,
        paymentIds: Array.from(selectedIds) as Id<"payments">[],
        memo: memo || undefined,
      });

      toast.success(
        `Deposit created: $${result.totalAmount.toFixed(2)} deposited to bank account`
      );
      setSelectedIds(new Set());
      setMemo("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create deposit";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const METHOD_LABELS: Record<string, string> = {
    cash: "Cash",
    credit_card: "Credit Card",
    debit_card: "Debit Card",
    bank_transfer: "Bank Transfer",
    cheque: "Cheque",
    paypal: "PayPal",
    mobile_pay: "Mobile Pay",
    store_credit: "Store Credit",
    other: "Other",
  };

  return (
    <div className="space-y-4">
      {/* Toggle history vs create */}
      <div className="flex gap-2">
        <Button
          variant={!showHistory ? "default" : "secondary"}
          size="sm"
          onClick={() => setShowHistory(false)}
          className="cursor-pointer"
        >
          <Wallet className="w-4 h-4 mr-1" /> Create Deposit
        </Button>
        <Button
          variant={showHistory ? "default" : "secondary"}
          size="sm"
          onClick={() => setShowHistory(true)}
          className="cursor-pointer"
        >
          <Clock className="w-4 h-4 mr-1" /> Deposit History ({deposits.length})
        </Button>
      </div>

      {showHistory ? (
        <DepositHistory deposits={deposits} />
      ) : (
        <>
          {/* Deposit settings */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Bank Account:</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger className="w-56 cursor-pointer"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((a) => (
                        <SelectItem key={a._id} value={a._id} className="cursor-pointer">
                          {a.code} — {a.name} ({a.subType ?? "Bank"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Date:</Label>
                  <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className="w-40" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Memo:</Label>
                  <Input placeholder="Optional memo" value={memo} onChange={(e) => setMemo(e.target.value)} className="w-48" />
                </div>
              </div>
            </CardContent>
          </Card>

          {undepositedPayments.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>No undeposited payments</EmptyTitle>
                <EmptyDescription>All received payments have been deposited</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {/* Summary + action */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="secondary" size="sm" onClick={selectAll} className="cursor-pointer">
                    {selectedIds.size === undepositedPayments.length ? "Deselect All" : "Select All"}
                  </Button>
                  <Badge variant="secondary">{selectedIds.size} selected</Badge>
                  <span className="text-sm font-medium">Deposit Total: ${selectedTotal.toFixed(2)}</span>
                </div>
                <Button onClick={handleDeposit} disabled={isProcessing || selectedIds.size === 0 || !bankAccountId} className="cursor-pointer">
                  <Send className="w-4 h-4 mr-1" />
                  {isProcessing ? "Processing..." : "Create Deposit"}
                </Button>
              </div>

              {/* Payment list */}
              <div className="space-y-2">
                {undepositedPayments.map((pmt) => (
                  <Card
                    key={pmt._id}
                    className={`cursor-pointer transition-colors ${selectedIds.has(pmt._id) ? "border-primary bg-primary/5" : ""}`}
                    onClick={() => toggleSelect(pmt._id)}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedIds.has(pmt._id)}
                          onCheckedChange={() => toggleSelect(pmt._id)}
                          className="cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                          <div>
                            <p className="font-medium text-sm">{pmt.invoiceNumber || "Direct Payment"}</p>
                            <p className="text-xs text-muted-foreground">{pmt.customerName}</p>
                          </div>
                          <div>
                            <Badge variant="secondary" className="text-xs">
                              {METHOD_LABELS[pmt.method] ?? pmt.method}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">{pmt.date}</div>
                          <div className="text-sm">{pmt.reference || "—"}</div>
                          <div className="text-right">
                            <span className="font-semibold text-primary">${pmt.amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Deposit History ─────────────────────────────────────────

type DepositRecord = {
  _id: string;
  depositNumber: string;
  bankAccountName: string;
  date: string;
  totalAmount: number;
  paymentCount: number;
  memo?: string;
  status: string;
  _creationTime: number;
};

function DepositHistory({ deposits }: { deposits: DepositRecord[] }) {
  if (deposits.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Landmark /></EmptyMedia>
          <EmptyTitle>No deposits yet</EmptyTitle>
          <EmptyDescription>Create your first batch deposit to see it here</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {deposits.map((dep) => (
        <Card key={dep._id}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-medium text-sm">{dep.depositNumber}</p>
                  <p className="text-xs text-muted-foreground">{dep.bankAccountName}</p>
                </div>
                <Badge variant="secondary">{dep.paymentCount} payments</Badge>
                <span className="text-sm text-muted-foreground">{dep.date}</span>
              </div>
              <div className="flex items-center gap-3">
                {dep.memo && <span className="text-xs text-muted-foreground">{dep.memo}</span>}
                <span className="font-bold text-primary">${dep.totalAmount.toFixed(2)}</span>
                <Badge variant={dep.status === "completed" ? "default" : "destructive"}>{dep.status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
