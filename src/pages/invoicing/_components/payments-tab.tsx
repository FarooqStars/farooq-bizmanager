import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format } from "date-fns";
import {
  Banknote, CreditCard, Landmark, FileText, Wallet,
  Smartphone, Ticket, CircleDot, Settings2, SplitSquareVertical,
  CalendarClock, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { PrintReceiptButton } from "@/components/print-document-buttons.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="w-4 h-4" />,
  credit_card: <CreditCard className="w-4 h-4" />,
  debit_card: <CreditCard className="w-4 h-4" />,
  bank_transfer: <Landmark className="w-4 h-4" />,
  cheque: <FileText className="w-4 h-4" />,
  paypal: <Wallet className="w-4 h-4" />,
  mobile_pay: <Smartphone className="w-4 h-4" />,
  store_credit: <Ticket className="w-4 h-4" />,
  other: <CircleDot className="w-4 h-4" />,
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

export default function PaymentsTab() {
  return (
    <Tabs defaultValue="transactions" className="space-y-4">
      <TabsList>
        <TabsTrigger value="transactions" className="cursor-pointer">
          <CreditCard className="w-4 h-4 mr-1.5" /> Transactions
        </TabsTrigger>
        <TabsTrigger value="plans" className="cursor-pointer">
          <CalendarClock className="w-4 h-4 mr-1.5" /> Payment Plans
        </TabsTrigger>
        <TabsTrigger value="methods" className="cursor-pointer">
          <Settings2 className="w-4 h-4 mr-1.5" /> Payment Methods
        </TabsTrigger>
      </TabsList>

      <TabsContent value="transactions"><TransactionsPanel /></TabsContent>
      <TabsContent value="plans"><PaymentPlansPanel /></TabsContent>
      <TabsContent value="methods"><PaymentMethodsPanel /></TabsContent>
    </Tabs>
  );
}

// ─── Transactions Panel ─────────────────────────────────────

function TransactionsPanel() {
  const { fmt } = useCurrency();
  const summary = useQuery(api.payments.getPaymentSummary, {});
  const payments = useQuery(api.payments.listPayments, {});

  if (!summary || !payments) return <Skeleton className="h-60 w-full" />;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-lg font-bold text-green-600">{fmt(summary.totalToday)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="text-lg font-bold">{fmt(summary.totalWeek)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">All Time</p>
            <p className="text-lg font-bold">{fmt(summary.totalAll)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-lg font-bold">{summary.transactionCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Method Breakdown */}
      {Object.keys(summary.byMethod).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Payment Method Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(summary.byMethod)
                .sort(([, a], [, b]) => b - a)
                .map(([method, amount]) => (
                  <div key={method} className="flex items-center gap-2 p-2 rounded-lg border">
                    {METHOD_ICONS[method] ?? <CircleDot className="w-4 h-4" />}
                    <div>
                      <p className="text-xs text-muted-foreground">{METHOD_LABELS[method] ?? method}</p>
                      <p className="text-sm font-semibold">{fmt(amount)}</p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <SplitSquareVertical className="w-4 h-4" /> Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CreditCard /></EmptyMedia>
                <EmptyTitle>No transactions yet</EmptyTitle>
                <EmptyDescription>Record payments from the Invoices tab or through POS</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {payments.map((p) => (
                <div key={p._id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      {METHOD_ICONS[p.method] ?? <CircleDot className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{METHOD_LABELS[p.method] ?? p.method}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(p.date), "MMM d, yyyy")}
                        {p.reference && <span className="ml-2">Ref: {p.reference}</span>}
                        {p.cardLast4 && <span className="ml-2">****{p.cardLast4}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-green-600">
                      +{fmt(p.amount)}
                    </span>
                    <PrintReceiptButton paymentId={p._id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Payment Plans Panel ─────────────────────────────────────

function PaymentPlansPanel() {
  const { fmt } = useCurrency();
  const plans = useQuery(api.payments.listPaymentPlans, {});
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const cancelPlan = useMutation(api.payments.cancelPaymentPlan);
  const recordInstallment = useMutation(api.payments.recordInstallmentPayment);
  const [payingPlanId, setPayingPlanId] = useState<Id<"paymentPlans"> | null>(null);
  const [payMethod, setPayMethod] = useState("cash");
  const [payAccountId, setPayAccountId] = useState("");

  if (!plans) return <Skeleton className="h-40 w-full" />;

  const handlePayInstallment = async () => {
    if (!payingPlanId) return;
    if (!payAccountId) { toast.error("Select an account to deposit into"); return; }
    try {
      await recordInstallment({
        planId: payingPlanId,
        method: payMethod as "cash" | "credit_card" | "debit_card" | "bank_transfer" | "cheque" | "paypal" | "mobile_pay" | "store_credit" | "other",
        accountId: payAccountId as Id<"accounts">,
      });
      toast.success("Installment payment recorded");
      setPayingPlanId(null);
      setPayAccountId("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to record payment";
      toast.error(msg);
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    defaulted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };

  return (
    <div className="space-y-4">
      {plans.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarClock /></EmptyMedia>
            <EmptyTitle>No payment plans</EmptyTitle>
            <EmptyDescription>Create payment plans from an invoice to allow installment payments</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const installmentAmt = plan.totalAmount / plan.installments;
            const progress = (plan.paidInstallments / plan.installments) * 100;
            return (
              <Card key={plan._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[plan.status]}>{plan.status}</Badge>
                        <span className="text-sm font-medium">{fmt(plan.totalAmount)}</span>
                        <span className="text-xs text-muted-foreground">
                          ({plan.installments} x {fmt(installmentAmt)} {plan.frequency})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {plan.paidInstallments}/{plan.installments} paid
                        {plan.status === "active" && ` | Next due: ${format(new Date(plan.nextDueDate), "MMM d, yyyy")}`}
                      </p>
                      {/* Progress bar */}
                      <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    {plan.status === "active" && (
                      <div className="flex gap-2">
                        <Button size="sm" className="cursor-pointer" onClick={() => setPayingPlanId(plan._id)}>
                          Pay Installment
                        </Button>
                        <Button size="sm" variant="ghost" className="cursor-pointer text-destructive"
                          onClick={async () => {
                            await cancelPlan({ id: plan._id });
                            toast.success("Plan cancelled");
                          }}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pay Installment Dialog */}
      <Dialog open={!!payingPlanId} onOpenChange={() => setPayingPlanId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Installment Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code} className="cursor-pointer">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Deposit Into Account</Label>
              <Select value={payAccountId} onValueChange={setPayAccountId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select cash / bank account" /></SelectTrigger>
                <SelectContent>
                  {ledgerAccounts?.map((acc) => (
                    <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                      {acc.name} ({acc.subType ?? acc.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" className="cursor-pointer" onClick={() => setPayingPlanId(null)}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handlePayInstallment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Payment Methods Configuration Panel ────────────────────

function PaymentMethodsPanel() {
  const methods = useQuery(api.payments.listPaymentMethods, {});
  const seedMethods = useMutation(api.payments.seedPaymentMethods);
  const updateMethod = useMutation(api.payments.updatePaymentMethod);
  const [editingId, setEditingId] = useState<Id<"paymentMethods"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Auto-seed on first load if empty
  useEffect(() => {
    if (methods && methods.length === 0) {
      seedMethods({});
    }
  }, [methods, seedMethods]);

  if (!methods) return <Skeleton className="h-40 w-full" />;

  if (methods.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Settings2 /></EmptyMedia>
          <EmptyTitle>Setting up payment methods...</EmptyTitle>
          <EmptyDescription>Initializing your payment methods configuration</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" className="cursor-pointer" onClick={() => seedMethods({})}>Initialize</Button>
        </EmptyContent>
      </Empty>
    );
  }

  const sorted = [...methods].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Accepted Payment Methods
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Toggle which payment methods are available across POS and invoicing.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sorted.map((method) => (
              <div key={method._id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {METHOD_ICONS[method.code] ?? <CircleDot className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{method.name}</p>
                    <p className="text-xs text-muted-foreground">{method.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {method.requiresReference && (
                    <Badge variant="secondary" className="text-xs">Requires ref</Badge>
                  )}
                  <Switch
                    checked={method.isActive}
                    onCheckedChange={async (checked) => {
                      await updateMethod({ id: method._id, isActive: checked });
                      toast.success(`${method.name} ${checked ? "enabled" : "disabled"}`);
                    }}
                    className="cursor-pointer"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="cursor-pointer"
                    onClick={() => {
                      setEditingId(method._id);
                      setEditName(method.name);
                      setEditDesc(method.description ?? "");
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payment Method</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label>Display Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Method name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" className="cursor-pointer" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button className="cursor-pointer" onClick={async () => {
              if (!editingId) return;
              await updateMethod({ id: editingId, name: editName, description: editDesc });
              toast.success("Updated");
              setEditingId(null);
            }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
