import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, Send, Ban, CreditCard, Trash2, CalendarClock, Share2, Pencil, Landmark, DollarSign, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import ShareDocumentDialog from "@/components/share-document-dialog.tsx";
import { PrintInvoiceButton } from "@/components/print-document-buttons.tsx";
import AdminVoidDialog from "@/components/admin-void-dialog.tsx";
import ProductPicker from "./product-picker.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type StatusFilter = "all" | "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "void" | "written_off";

type LineItem = { productId?: Id<"products">; description: string; quantity: number; unitPrice: number };

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Partially Paid", value: "partially_paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Void", value: "void" },
  { label: "Written Off", value: "written_off" },
];

const CREDIT_TERMS = [
  { label: "Net 15", value: "net_15" },
  { label: "Net 30", value: "net_30" },
  { label: "Net 60", value: "net_60" },
  { label: "Net 90", value: "net_90" },
];

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    void: "bg-muted text-muted-foreground",
    // written_off: money was owed and not collected — distinct from "paid"
    written_off: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  };
  const label = status === "written_off" ? "Written Off" : status.replace("_", " ");
  return (
    <Badge className={styles[status] ?? styles.draft}>
      {label}
    </Badge>
  );
}

export default function InvoicesTab() {
  const { fmt } = useCurrency();
  const invoices = useQuery(api.invoicing.listInvoices, {});
  const customers = useQuery(api.sales.listCustomers, {});
  const createInvoice = useMutation(api.invoicing.createInvoice);
  const updateInvoice = useMutation(api.invoicing.updateInvoice);
  const recordPayment = useMutation(api.invoicing.recordPayment);
  const updateStatus = useMutation(api.invoicing.updateInvoiceStatus);
  const voidInvoice = useMutation(api.invoicing.voidInvoice);
  const adminVoidInvoice = useMutation(api.invoicing.adminVoidPostedInvoice);
  const currentUser = useQuery(api.users.getCurrentUser);
  const createPaymentPlan = useMutation(api.payments.createPaymentPlan);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [planInvoice, setPlanInvoice] = useState<{ id: string; balance: number } | null>(null);
  const [shareInvoice, setShareInvoice] = useState<{ id: string; number: string; customer: string; email: string; phone: string; amount: number; dueDate: string } | null>(null);
  const [planInstallments, setPlanInstallments] = useState("3");
  const [planFrequency, setPlanFrequency] = useState("monthly");
  const [planStartDate, setPlanStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentInvoice, setPaymentInvoice] = useState<{ id: string; balance: number; customerId: string } | null>(null);

  // Create form state
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [saleType, setSaleType] = useState<"cash" | "credit">("cash");
  const [creditTerms, setCreditTerms] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });

  // Payment form state
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payBankAccountId, setPayBankAccountId] = useState("");
  const [payAdvanceId, setPayAdvanceId] = useState("");
  const [adminVoidInvoiceId, setAdminVoidInvoiceId] = useState<string | null>(null);

  const isOwner = currentUser?.role === "owner";

  const filteredInvoices = invoices?.filter(
    (inv) => statusFilter === "all" || inv.status === statusFilter
  );

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
  const discountAmount = discount ? parseFloat(discount) : 0;
  const total = subtotal + taxAmount - discountAmount;

  function resetCreateForm() {
    setCustomerId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate("");
    setSaleType("cash");
    setCreditTerms("");
    setDepositAccountId("");
    setLineItems([{ description: "", quantity: 1, unitPrice: 0 }]);
    setTaxRate("");
    setDiscount("");
    setNotes("");
  }

  async function handleCreate() {
    if (!customerId || !date || !dueDate || lineItems.some((li) => !li.description)) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (saleType === "cash" && !depositAccountId) {
      toast.error("Select a cash or bank account to receive this cash sale");
      return;
    }
    try {
      const creditTermsValue = saleType === "credit" && creditTerms
        ? creditTerms as "net_15" | "net_30" | "net_60" | "net_90"
        : undefined;
      await createInvoice({
        customerId: customerId as Id<"customers">,
        date,
        dueDate,
        saleType,
        creditTerms: creditTermsValue,
        items: lineItems,
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        discount: discountAmount || undefined,
        notes: notes || undefined,
        accountId: saleType === "cash" && depositAccountId ? depositAccountId as Id<"accounts"> : undefined,
      });
      toast.success("Invoice created");
      setShowCreate(false);
      resetCreateForm();
    } catch (e) {
      const errorData = e && typeof e === "object" && "data" in e
        ? (e as { data: { message?: string } }).data
        : null;
      const msg = errorData?.message ?? (e instanceof Error ? e.message : "Failed to create invoice");
      toast.error(msg);
    }
  }

  async function handleSend(id: string) {
    try {
      await updateStatus({ id: id as Id<"invoices">, status: "sent" });
      toast.success("Invoice sent");
    } catch {
      toast.error("Failed to send invoice");
    }
  }

  async function handleVoid(id: string) {
    try {
      await voidInvoice({ id: id as Id<"invoices"> });
      toast.success("Invoice voided");
    } catch {
      toast.error("Failed to void invoice");
    }
  }

  async function handleRecordPayment() {
    // The amount field shows the outstanding balance by default (see the input's
    // `value={payAmount || paymentInvoice?.balance}`), but `payAmount` stays empty
    // until the user edits it. Fall back to the displayed balance so submitting
    // without retyping still records the full payment.
    const effectiveAmount = payAmount !== "" ? payAmount : String(paymentInvoice?.balance ?? "");
    if (!paymentInvoice || !effectiveAmount || !payDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (payMethod !== "advance_settlement" && !payBankAccountId) {
      toast.error("Please select a cash or bank account");
      return;
    }
    if (payMethod === "advance_settlement" && !payAdvanceId) {
      toast.error("Please select an advance payment to settle from");
      return;
    }
    try {
      await recordPayment({
        invoiceId: paymentInvoice.id as Id<"invoices">,
        amount: parseFloat(effectiveAmount),
        date: payDate,
        method: payMethod as "cash" | "credit_card" | "debit_card" | "bank_transfer" | "cheque" | "paypal" | "mobile_pay" | "store_credit" | "advance_settlement" | "other",
        reference: payReference || undefined,
        accountId: (payMethod !== "advance_settlement" && payBankAccountId)
          ? payBankAccountId as Id<"accounts">
          : undefined,
        advancePaymentId: payMethod === "advance_settlement" && payAdvanceId
          ? payAdvanceId as Id<"advancePayments">
          : undefined,
        notes: payNotes || undefined,
      });
      toast.success("Payment recorded");
      setPaymentInvoice(null);
      setPayBankAccountId("");
      setPayAdvanceId("");
    } catch {
      toast.error("Failed to record payment");
    }
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    setLineItems((items) =>
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  if (!invoices) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? "default" : "ghost"}
              className="cursor-pointer"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button className="cursor-pointer" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> Create Invoice
        </Button>
      </div>

      {/* Invoice list */}
      {filteredInvoices && filteredInvoices.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No invoices found</EmptyTitle>
            <EmptyDescription>Create your first invoice to get started</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" /> Create Invoice
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Invoice #</th>
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Due Date</th>
                  <th className="pb-2 pr-4 text-right">Total</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices?.map((inv) => (
                  <tr key={inv._id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{inv.invoiceNumber}</td>
                    <td className="py-2 pr-4">{inv.customerName}</td>
                    <td className="py-2 pr-4">{inv.date}</td>
                    <td className="py-2 pr-4">{inv.dueDate}</td>
                    <td className="py-2 pr-4 text-right">{fmt(inv.totalAmount ?? 0)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(inv.amountPaid ?? 0)}</td>
                    <td className="py-2 pr-4">{getStatusBadge(inv.status)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {inv.status === "draft" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" title="Edit Invoice" onClick={() => {
                            setEditingInvoice(inv._id);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.status === "draft" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" onClick={() => handleSend(inv._id)}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.status !== "void" && inv.status !== "paid" && inv.status !== "written_off" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" onClick={() => setPaymentInvoice({ id: inv._id, balance: (inv.totalAmount ?? 0) - (inv.amountPaid ?? 0) - (inv.amountWrittenOff ?? 0), customerId: inv.customerId })}>
                            <CreditCard className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.status !== "void" && inv.status !== "paid" && inv.status !== "written_off" && inv.saleType === "credit" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" title="Create Payment Plan" onClick={() => setPlanInvoice({ id: inv._id, balance: (inv.totalAmount ?? 0) - (inv.amountPaid ?? 0) - (inv.amountWrittenOff ?? 0) })}>
                            <CalendarClock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.status !== "void" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0 text-destructive" onClick={() => handleVoid(inv._id)}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isOwner && inv.status !== "void" && inv.status !== "draft" && (
                          <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0 text-orange-600" title="Admin Void (Owner)" onClick={() => setAdminVoidInvoiceId(inv._id)}>
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <PrintInvoiceButton invoiceId={inv._id} />
                        <Button size="sm" variant="ghost" className="cursor-pointer h-7 w-7 p-0" title="Share" onClick={() => setShareInvoice({
                          id: inv._id,
                          number: inv.invoiceNumber,
                          customer: inv.customerName ?? "",
                          email: inv.customerEmail ?? "",
                          phone: inv.customerPhone ?? "",
                          amount: inv.totalAmount ?? 0,
                          dueDate: inv.dueDate ?? "",
                        })}>
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sale Type</Label>
                <Select value={saleType} onValueChange={(v) => setSaleType(v as "cash" | "credit")}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="cursor-pointer">Cash</SelectItem>
                    <SelectItem value="credit" className="cursor-pointer">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              {saleType === "credit" && (
                <div className="space-y-1.5">
                  <Label>Credit Terms</Label>
                  <Select value={creditTerms} onValueChange={setCreditTerms}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select terms" /></SelectTrigger>
                    <SelectContent>
                      {CREDIT_TERMS.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="cursor-pointer">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {saleType === "cash" && (
                <div className="space-y-1.5">
                  <Label>Deposit Into Account</Label>
                  <Select value={depositAccountId} onValueChange={setDepositAccountId}>
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
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <Label>Line Items</Label>
              {lineItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <ProductPicker
                      value={item.description}
                      onSelectProduct={({ id, name, unitPrice }) =>
                        setLineItems((items) => items.map((it, idx) => idx === i ? { ...it, productId: id as Id<"products">, description: name, unitPrice } : it))
                      }
                      onDescriptionChange={(desc) => setLineItems((items) => items.map((it, idx) => idx === i ? { ...it, productId: undefined, description: desc } : it))}
                    />
                  </div>
                  <Input type="number" placeholder="Qty" value={item.quantity || ""} onChange={(e) => updateLineItem(i, "quantity", parseFloat(e.target.value) || 0)} className="w-20" />
                  <Input type="number" placeholder="Price" value={item.unitPrice || ""} onChange={(e) => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)} className="w-24" />
                  <span className="w-20 text-right text-sm text-muted-foreground">{fmt(item.quantity * item.unitPrice)}</span>
                  {lineItems.length > 1 && (
                    <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0" onClick={() => setLineItems((items) => items.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" placeholder="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Discount</Label>
                <Input type="number" placeholder="0.00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {/* Totals */}
            <div className="rounded-md border p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              {taxAmount > 0 && <div className="flex justify-between"><span>Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span></div>}
              {discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmt(discountAmount)}</span></div>}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{fmt(total)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="cursor-pointer" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handleCreate}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={!!paymentInvoice} onOpenChange={(open) => { if (!open) { setPaymentInvoice(null); setPayBankAccountId(""); setPayAdvanceId(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <RecordPaymentForm
            paymentInvoice={paymentInvoice}
            payAmount={payAmount}
            setPayAmount={setPayAmount}
            payDate={payDate}
            setPayDate={setPayDate}
            payMethod={payMethod}
            setPayMethod={setPayMethod}
            payReference={payReference}
            setPayReference={setPayReference}
            payNotes={payNotes}
            setPayNotes={setPayNotes}
            payBankAccountId={payBankAccountId}
            setPayBankAccountId={setPayBankAccountId}
            payAdvanceId={payAdvanceId}
            setPayAdvanceId={setPayAdvanceId}
          />
          <DialogFooter>
            <Button variant="ghost" className="cursor-pointer" onClick={() => { setPaymentInvoice(null); setPayBankAccountId(""); setPayAdvanceId(""); }}>Cancel</Button>
            <Button className="cursor-pointer" onClick={handleRecordPayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Payment Plan Dialog */}
      <Dialog open={!!planInvoice} onOpenChange={(open) => { if (!open) setPlanInvoice(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Payment Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">Remaining Balance: <span className="text-primary">{fmt(planInvoice?.balance ?? 0)}</span></p>
              {planInvoice && planInstallments && (
                <p className="text-xs text-muted-foreground mt-1">
                  {planInstallments} installments of {fmt(planInvoice.balance / parseInt(planInstallments || "1"))} each
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Number of Installments</Label>
              <Input type="number" min={2} max={24} value={planInstallments} onChange={(e) => setPlanInstallments(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={planFrequency} onValueChange={setPlanFrequency}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly" className="cursor-pointer">Weekly</SelectItem>
                  <SelectItem value="biweekly" className="cursor-pointer">Bi-weekly</SelectItem>
                  <SelectItem value="monthly" className="cursor-pointer">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={planStartDate} onChange={(e) => setPlanStartDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="cursor-pointer" onClick={() => setPlanInvoice(null)}>Cancel</Button>
            <Button className="cursor-pointer" onClick={async () => {
              if (!planInvoice) return;
              try {
                await createPaymentPlan({
                  invoiceId: planInvoice.id as Id<"invoices">,
                  installments: parseInt(planInstallments),
                  frequency: planFrequency as "weekly" | "biweekly" | "monthly",
                  startDate: planStartDate,
                });
                toast.success("Payment plan created");
                setPlanInvoice(null);
              } catch {
                toast.error("Failed to create payment plan");
              }
            }}>Create Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      {editingInvoice && (
        <EditInvoiceDialogInner
          invoiceId={editingInvoice as Id<"invoices">}
          customers={customers ?? []}
          onClose={() => { setEditingInvoice(null); resetCreateForm(); }}
          updateInvoice={updateInvoice}
        />
      )}

      {/* Share Dialog */}
      {shareInvoice && (
        <ShareDocumentDialog
          open={!!shareInvoice}
          onOpenChange={(open) => { if (!open) setShareInvoice(null); }}
          documentType="invoice"
          documentId={shareInvoice.id}
          documentNumber={shareInvoice.number}
          recipientName={shareInvoice.customer}
          recipientEmail={shareInvoice.email}
          recipientPhone={shareInvoice.phone}
          amount={shareInvoice.amount}
          dueDate={shareInvoice.dueDate}
        />
      )}
      {adminVoidInvoiceId && (
        <AdminVoidDialog
          isOpen
          onClose={() => setAdminVoidInvoiceId(null)}
          title="Admin Void Invoice"
          description="This will reverse all related ledger entries and mark the invoice as void."
          confirmLabel="Void Invoice"
          onConfirm={async (reason) => {
            await adminVoidInvoice({ invoiceId: adminVoidInvoiceId as Id<"invoices">, reason });
            toast.success("Invoice admin voided. Ledger entries reversed.");
            setAdminVoidInvoiceId(null);
          }}
        />
      )}
    </div>
  );
}

// ── Record Payment Form (with bank account & advance selection) ──────────────

function RecordPaymentForm({
  paymentInvoice,
  payAmount, setPayAmount,
  payDate, setPayDate,
  payMethod, setPayMethod,
  payReference, setPayReference,
  payNotes, setPayNotes,
  payBankAccountId, setPayBankAccountId,
  payAdvanceId, setPayAdvanceId,
}: {
  paymentInvoice: { id: string; balance: number; customerId: string } | null;
  payAmount: string;
  setPayAmount: (v: string) => void;
  payDate: string;
  setPayDate: (v: string) => void;
  payMethod: string;
  setPayMethod: (v: string) => void;
  payReference: string;
  setPayReference: (v: string) => void;
  payNotes: string;
  setPayNotes: (v: string) => void;
  payBankAccountId: string;
  setPayBankAccountId: (v: string) => void;
  payAdvanceId: string;
  setPayAdvanceId: (v: string) => void;
}) {
  const { fmt: fmt$ } = useCurrency();
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const unsettledAdvances = useQuery(
    api.advancePayments.getUnsettledAdvances,
    paymentInvoice?.customerId
      ? { direction: "customer" as const, customerId: paymentInvoice.customerId as Id<"customers"> }
      : "skip"
  );

  const activeLedgerAccounts = ledgerAccounts ?? [];
  const availableAdvances = unsettledAdvances?.filter(
    (a) => (a.amount - (a.settledAmount ?? 0)) > 0
  ) ?? [];

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto">
      {/* Balance info */}
      <div className="p-3 rounded bg-muted">
        <p className="text-sm text-muted-foreground">Remaining Balance</p>
        <p className="text-lg font-bold text-primary">{fmt$(paymentInvoice?.balance ?? 0)}</p>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label>Payment Amount</Label>
        <Input type="number" value={payAmount || paymentInvoice?.balance || ""} onChange={(e) => setPayAmount(e.target.value)} placeholder={paymentInvoice?.balance.toFixed(2)} />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="cursor-pointer text-xs"
          onClick={() => setPayAmount(String(paymentInvoice?.balance ?? 0))}
        >
          Pay Full Balance
        </Button>
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label>Date</Label>
        <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
      </div>

      {/* Payment Source */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Received Into / Payment Source</Label>
        <Select value={payMethod} onValueChange={(v) => {
          setPayMethod(v);
          setPayBankAccountId("");
          setPayAdvanceId("");
        }}>
          <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bank_transfer" className="cursor-pointer">Bank Account</SelectItem>
            <SelectItem value="cash" className="cursor-pointer">Cash</SelectItem>
            <SelectItem value="credit_card" className="cursor-pointer">Credit Card</SelectItem>
            <SelectItem value="debit_card" className="cursor-pointer">Debit Card</SelectItem>
            <SelectItem value="cheque" className="cursor-pointer">Cheque</SelectItem>
            <SelectItem value="advance_settlement" className="cursor-pointer">From Customer Advance</SelectItem>
            <SelectItem value="paypal" className="cursor-pointer">PayPal</SelectItem>
            <SelectItem value="mobile_pay" className="cursor-pointer">Mobile Pay</SelectItem>
            <SelectItem value="store_credit" className="cursor-pointer">Store Credit</SelectItem>
            <SelectItem value="other" className="cursor-pointer">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bank / Cash Account Selection */}
      {payMethod !== "advance_settlement" && (
        <div className="space-y-2 p-3 rounded border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <Label className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <Landmark className="w-4 h-4" /> Receive Into Account
          </Label>
          {activeLedgerAccounts.length > 0 ? (
            <Select value={payBankAccountId} onValueChange={setPayBankAccountId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Choose account..." /></SelectTrigger>
              <SelectContent>
                {activeLedgerAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt$(acc.balance ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">No accounts configured. Go to General Ledger to add accounts.</p>
          )}
        </div>
      )}

      {/* Advance Settlement Selection */}
      {payMethod === "advance_settlement" && (
        <div className="space-y-2 p-3 rounded border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
          <Label className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <DollarSign className="w-4 h-4" /> Settle from Customer Advance
          </Label>
          {availableAdvances.length > 0 ? (
            <>
              <Select value={payAdvanceId} onValueChange={(v) => {
                setPayAdvanceId(v);
                const adv = availableAdvances.find((a) => a._id === v);
                if (adv) {
                  const advBalance = adv.amount - (adv.settledAmount ?? 0);
                  setPayAmount(String(Math.min(advBalance, paymentInvoice?.balance ?? 0).toFixed(2)));
                }
              }}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Choose customer advance..." /></SelectTrigger>
                <SelectContent>
                  {availableAdvances.map((adv) => {
                    const remaining = adv.amount - (adv.settledAmount ?? 0);
                    return (
                      <SelectItem key={adv._id} value={adv._id} className="cursor-pointer">
                        {adv.date} — {fmt$(adv.amount)} (Remaining: {fmt$(remaining)}) {adv.reference ? `Ref: ${adv.reference}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {payAdvanceId && (
                <p className="text-xs text-green-700 dark:text-green-400">
                  Available: {fmt$(
                    (availableAdvances.find((a) => a._id === payAdvanceId)?.amount ?? 0) -
                    (availableAdvances.find((a) => a._id === payAdvanceId)?.settledAmount ?? 0)
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No unsettled advance payments for this customer</p>
          )}
        </div>
      )}

      {/* Reference */}
      <div className="space-y-1.5">
        <Label>Reference</Label>
        <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="Transaction reference" />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Payment notes..." />
      </div>
    </div>
  );
}

// ── Edit Invoice Dialog Inner ─────────────────────────────────────────────────

type EditInvoiceProps = {
  invoiceId: Id<"invoices">;
  customers: { _id: string; name: string }[];
  onClose: () => void;
  updateInvoice: ReturnType<typeof useMutation>;
};

function EditInvoiceDialogInner({ invoiceId, customers, onClose, updateInvoice }: EditInvoiceProps) {
  const { fmt } = useCurrency();
  const invoice = useQuery(api.invoicing.getInvoice, { id: invoiceId });
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saleType, setSaleType] = useState<"cash" | "credit">("cash");
  const [creditTerms, setCreditTerms] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Populate form once invoice data loads
  if (invoice && !loaded) {
    setCustomerId(invoice.customerId ?? "");
    setDate(invoice.date ?? "");
    setDueDate(invoice.dueDate ?? "");
    setSaleType((invoice.saleType as "cash" | "credit") ?? "cash");
    setCreditTerms((invoice as Record<string, unknown>).creditTerms as string ?? "");
    setTaxRate(invoice.taxRate ? String(invoice.taxRate) : "");
    setDiscount(invoice.discount ? String(invoice.discount) : "");
    setNotes(invoice.notes ?? "");
    if (invoice.items && invoice.items.length > 0) {
      setLineItems(invoice.items.map((item: { description: string; quantity: number; unitPrice: number }) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })));
    }
    setLoaded(true);
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
  const discountAmount = discount ? parseFloat(discount) : 0;
  const total = subtotal + taxAmount - discountAmount;

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    setLineItems((items) =>
      items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  async function handleSave() {
    if (!customerId || !date || !dueDate || lineItems.some((li) => !li.description)) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (saleType === "cash" && !depositAccountId) {
      toast.error("Select a cash or bank account to receive this cash sale");
      return;
    }
    setSaving(true);
    try {
      const creditTermsValue = saleType === "credit" && creditTerms
        ? creditTerms as "net_15" | "net_30" | "net_60" | "net_90"
        : undefined;
      await updateInvoice({
        id: invoiceId,
        customerId: customerId as Id<"customers">,
        date,
        dueDate,
        saleType,
        creditTerms: creditTermsValue,
        items: lineItems,
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        discount: discountAmount || undefined,
        notes: notes || undefined,
        accountId: saleType === "cash" && depositAccountId ? depositAccountId as Id<"accounts"> : undefined,
      });
      toast.success("Invoice updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit Invoice</DialogTitle></DialogHeader>
        {!invoice ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sale Type</Label>
                <Select value={saleType} onValueChange={(v) => setSaleType(v as "cash" | "credit")}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="cursor-pointer">Cash Sale</SelectItem>
                    <SelectItem value="credit" className="cursor-pointer">Credit Sale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              {saleType === "credit" && (
                <div className="space-y-1.5">
                  <Label>Credit Terms</Label>
                  <Select value={creditTerms} onValueChange={setCreditTerms}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select terms" /></SelectTrigger>
                    <SelectContent>
                      {CREDIT_TERMS.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="cursor-pointer">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {saleType === "cash" && (
                <div className="space-y-1.5">
                  <Label>Deposit Into Account</Label>
                  <Select value={depositAccountId} onValueChange={setDepositAccountId}>
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
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <Label className="font-semibold">Line Items</Label>
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px_32px] gap-2 items-end">
                  <ProductPicker
                    value={item.description}
                    onSelectProduct={({ id, name, unitPrice }) =>
                      setLineItems((items) => items.map((it, idx) => idx === i ? { ...it, productId: id as Id<"products">, description: name, unitPrice } : it))
                    }
                    onDescriptionChange={(desc) => setLineItems((items) => items.map((it, idx) => idx === i ? { ...it, productId: undefined, description: desc } : it))}
                  />
                  <Input type="number" placeholder="Qty" value={item.quantity || ""} onChange={(e) => updateLineItem(i, "quantity", parseFloat(e.target.value) || 0)} />
                  <Input type="number" placeholder="Price" value={item.unitPrice || ""} onChange={(e) => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)} />
                  <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-destructive"
                    onClick={() => setLineItems((items) => items.filter((_, idx) => idx !== i))}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Discount</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." />
            </div>

            {/* Totals */}
            <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              {taxAmount > 0 && <div className="flex justify-between"><span>Tax</span><span>{fmt(taxAmount)}</span></div>}
              {discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmt(discountAmount)}</span></div>}
              <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{fmt(total)}</span></div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" className="cursor-pointer" onClick={onClose}>Cancel</Button>
          <Button className="cursor-pointer" onClick={handleSave} disabled={saving || !loaded}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
