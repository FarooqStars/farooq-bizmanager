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
import { toast } from "sonner";
import { CreditCard, Send, CheckCircle2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "paypal", label: "PayPal" },
  { value: "mobile_pay", label: "Mobile Pay" },
  { value: "store_credit", label: "Store Credit" },
  { value: "other", label: "Other" },
] as const;

type PaymentMethod = typeof PAYMENT_METHODS[number]["value"];

export default function BatchPaymentsTab() {
  const unpaidInvoices = useQuery(api.batch.getUnpaidInvoices);
  const batchPay = useMutation(api.batch.batchRecordPayments);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [payFullAmount, setPayFullAmount] = useState(true);
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  if (!unpaidInvoices) return <Skeleton className="h-60 w-full" />;

  if (unpaidInvoices.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
          <EmptyTitle>All invoices are paid</EmptyTitle>
          <EmptyDescription>There are no outstanding invoices to process payments for</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === unpaidInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unpaidInvoices.map((inv) => inv._id)));
    }
  };

  const getPayAmount = (inv: { _id: string; balance: number }) => {
    if (payFullAmount) return inv.balance;
    return customAmounts[inv._id] ?? inv.balance;
  };

  const totalPayment = unpaidInvoices
    .filter((inv) => selectedIds.has(inv._id))
    .reduce((sum, inv) => sum + getPayAmount(inv), 0);

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    setIsProcessing(true);
    try {
      const payments = unpaidInvoices
        .filter((inv) => selectedIds.has(inv._id))
        .map((inv) => ({
          invoiceId: inv._id as Id<"invoices">,
          date: paymentDate,
          amount: getPayAmount(inv),
          method,
          reference: reference || undefined,
        }));

      const result = await batchPay({ payments });

      if (result.errors.length > 0) {
        toast.warning(`Recorded ${result.recorded} payments with ${result.errors.length} errors`, {
          description: result.errors.join("; "),
        });
      } else {
        toast.success(`Successfully recorded ${result.recorded} payments totaling $${totalPayment.toFixed(2)}`);
      }

      setSelectedIds(new Set());
      setReference("");
    } catch (error) {
      toast.error("Failed to process batch payments");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Date:</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Method:</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-40 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="cursor-pointer">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Reference:</Label>
              <Input placeholder="Check # / Ref" value={reference} onChange={(e) => setReference(e.target.value)} className="w-36" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={payFullAmount}
                onCheckedChange={(c) => setPayFullAmount(!!c)}
                id="payFull"
                className="cursor-pointer"
              />
              <Label htmlFor="payFull" className="text-xs cursor-pointer">Pay full balance</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary + action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={selectAll} className="cursor-pointer">
            {selectedIds.size === unpaidInvoices.length ? "Deselect All" : "Select All"}
          </Button>
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          <span className="text-sm font-medium">Total: ${totalPayment.toFixed(2)}</span>
        </div>
        <Button onClick={handleSubmit} disabled={isProcessing || selectedIds.size === 0} className="cursor-pointer">
          <Send className="w-4 h-4 mr-1" />
          {isProcessing ? "Processing..." : `Record ${selectedIds.size} Payment${selectedIds.size !== 1 ? "s" : ""}`}
        </Button>
      </div>

      {/* Invoice list */}
      <div className="space-y-2">
        {unpaidInvoices.map((inv) => (
          <Card
            key={inv._id}
            className={`cursor-pointer transition-colors ${selectedIds.has(inv._id) ? "border-primary bg-primary/5" : ""}`}
            onClick={() => toggleSelect(inv._id)}
          >
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.has(inv._id)}
                  onCheckedChange={() => toggleSelect(inv._id)}
                  className="cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                  <div>
                    <p className="font-medium text-sm">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{inv.customerName}</p>
                  </div>
                  <div className="text-sm">
                    <Badge variant={inv.status === "overdue" ? "destructive" : "secondary"} className="text-xs">
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Due: {inv.dueDate}
                  </div>
                  <div className="text-sm">
                    Total: ${inv.totalAmount.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-2">
                    {payFullAmount ? (
                      <span className="font-semibold text-sm text-primary">${inv.balance.toFixed(2)}</span>
                    ) : (
                      <Input
                        type="number"
                        min={0.01}
                        max={inv.balance}
                        step={0.01}
                        value={customAmounts[inv._id] ?? inv.balance}
                        onChange={(e) => {
                          setCustomAmounts({ ...customAmounts, [inv._id]: Number(e.target.value) || 0 });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-28"
                      />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
