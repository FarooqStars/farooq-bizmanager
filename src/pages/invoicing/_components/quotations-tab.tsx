import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileCheck, Send, X, ArrowRight, Share2 } from "lucide-react";
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
import { PrintQuotationButton } from "@/components/print-document-buttons.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type LineItem = { description: string; quantity: number; unitPrice: number };
type StatusFilter = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-muted text-muted-foreground",
};

export default function QuotationsTab() {
  const quotations = useQuery(api.invoicing.listQuotations, {});
  const customers = useQuery(api.sales.listCustomers, {});
  const createQuotation = useMutation(api.invoicing.createQuotation);
  const updateStatus = useMutation(api.invoicing.updateQuotationStatus);
  const convertToInvoice = useMutation(api.invoicing.convertQuotationToInvoice);
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [shareQuote, setShareQuote] = useState<{ id: string; number: string; customer: string; email: string; phone: string; amount: number; validUntil: string } | null>(null);
  const [convertForm, setConvertForm] = useState({ dueDate: "", saleType: "cash" as "cash" | "credit", creditTerms: "", accountId: "" });

  // Create form state
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");

  const filtered = quotations?.filter((q) => filter === "all" || q.status === filter);
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const tax = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
  const total = subtotal + tax - (parseFloat(discount) || 0);

  const resetForm = () => {
    setCustomerId(""); setDate(format(new Date(), "yyyy-MM-dd")); setValidUntil("");
    setItems([{ description: "", quantity: 1, unitPrice: 0 }]);
    setTaxRate(""); setDiscount(""); setNotes("");
  };

  const handleCreate = async () => {
    if (!customerId || !validUntil || items.some((i) => !i.description)) {
      toast.error("Please fill in all required fields"); return;
    }
    try {
      await createQuotation({
        customerId: customerId as Id<"customers">, date, validUntil, items, notes,
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        discount: discount ? parseFloat(discount) : undefined,
      });
      toast.success("Quotation created"); setShowCreate(false); resetForm();
    } catch { toast.error("Failed to create quotation"); }
  };

  const handleConvert = async () => {
    if (!convertId || !convertForm.dueDate) { toast.error("Due date is required"); return; }
    if (convertForm.saleType === "cash" && !convertForm.accountId) {
      toast.error("Select a cash or bank account to receive this cash sale"); return;
    }
    try {
      const creditTermsValue = convertForm.saleType === "credit" && convertForm.creditTerms
        ? convertForm.creditTerms as "net_15" | "net_30" | "net_60" | "net_90"
        : undefined;
      await convertToInvoice({
        quotationId: convertId as Id<"quotations">, dueDate: convertForm.dueDate,
        saleType: convertForm.saleType, creditTerms: creditTermsValue,
        accountId: convertForm.saleType === "cash" && convertForm.accountId
          ? convertForm.accountId as Id<"accounts">
          : undefined,
      });
      toast.success("Converted to invoice"); setConvertId(null);
    } catch { toast.error("Failed to convert"); }
  };

  if (!quotations) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  const filters: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" }, { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" },
    { label: "Accepted", value: "accepted" }, { label: "Rejected", value: "rejected" }, { label: "Expired", value: "expired" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "ghost"}
              className="cursor-pointer" onClick={() => setFilter(f.value)}>{f.label}</Button>
          ))}
        </div>
        <Button className="cursor-pointer" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-4 w-4" />Create Quotation</Button>
      </div>

      {filtered?.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><FileCheck /></EmptyMedia>
          <EmptyTitle>No quotations</EmptyTitle><EmptyDescription>Create your first quotation to get started</EmptyDescription>
        </EmptyHeader><EmptyContent><Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Quotation</Button></EmptyContent></Empty>
      ) : (
        <div className="space-y-2">
          {filtered?.map((q) => (
            <Card key={q._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="space-y-1">
                  <p className="font-medium">{q.quoteNumber} — {q.customerName}</p>
                  <p className="text-sm text-muted-foreground">Date: {q.date} · Valid until: {q.validUntil}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">${q.totalAmount.toFixed(2)}</span>
                  <Badge className={STATUS_COLORS[q.status]}>{q.status}</Badge>
                  {q.status === "draft" && (<>
                    <Button size="sm" variant="ghost" className="cursor-pointer" onClick={async () => { await updateStatus({ id: q._id as Id<"quotations">, status: "sent" }); toast.success("Quotation sent"); }}><Send className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={async () => { await updateStatus({ id: q._id as Id<"quotations">, status: "expired" }); toast.success("Cancelled"); }}><X className="h-4 w-4" /></Button>
                  </>)}
                  {q.status === "sent" && (<>
                    <Button size="sm" variant="ghost" className="cursor-pointer text-green-600" onClick={() => setConvertId(q._id)}><ArrowRight className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={async () => { await updateStatus({ id: q._id as Id<"quotations">, status: "rejected" }); toast.success("Rejected"); }}><X className="h-4 w-4" /></Button>
                  </>)}
                  {q.status === "accepted" && <Badge variant="secondary">Converted</Badge>}
                  <PrintQuotationButton quotationId={q._id} />
                  <Button size="sm" variant="ghost" className="cursor-pointer" title="Share" onClick={() => setShareQuote({
                    id: q._id,
                    number: q.quoteNumber,
                    customer: q.customerName ?? "",
                    email: q.customerEmail ?? "",
                    phone: q.customerPhone ?? "",
                    amount: q.totalAmount,
                    validUntil: q.validUntil,
                  })}><Share2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Quotation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers?.map((c) => <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>Valid Until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
            </div>
            <div><Label>Line Items</Label>
              {items.map((item, idx) => (
                <div key={idx} className="mt-1 flex gap-1">
                  <Input placeholder="Description" value={item.description} onChange={(e) => { const n = [...items]; n[idx] = { ...item, description: e.target.value }; setItems(n); }} />
                  <Input type="number" className="w-16" placeholder="Qty" value={item.quantity} onChange={(e) => { const n = [...items]; n[idx] = { ...item, quantity: Number(e.target.value) }; setItems(n); }} />
                  <Input type="number" className="w-24" placeholder="Price" value={item.unitPrice || ""} onChange={(e) => { const n = [...items]; n[idx] = { ...item, unitPrice: Number(e.target.value) }; setItems(n); }} />
                  {items.length > 1 && <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setItems(items.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></Button>}
                </div>
              ))}
              <Button size="sm" variant="ghost" className="mt-1 cursor-pointer" onClick={() => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }])}><Plus className="mr-1 h-3 w-3" />Add</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Tax Rate %</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" /></div>
              <div><Label>Discount</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." /></div>
            <div className="rounded border p-2 text-sm">
              <p>Subtotal: ${subtotal.toFixed(2)}</p>
              {tax > 0 && <p>Tax: ${tax.toFixed(2)}</p>}
              {parseFloat(discount) > 0 && <p>Discount: -${parseFloat(discount).toFixed(2)}</p>}
              <p className="font-semibold">Total: ${total.toFixed(2)}</p>
            </div>
          </div>
          <DialogFooter><Button className="cursor-pointer" onClick={handleCreate}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert Dialog */}
      <Dialog open={!!convertId} onOpenChange={() => setConvertId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Convert to Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Due Date</Label><Input type="date" value={convertForm.dueDate} onChange={(e) => setConvertForm({ ...convertForm, dueDate: e.target.value })} /></div>
            <div><Label>Sale Type</Label>
              <Select value={convertForm.saleType} onValueChange={(v) => setConvertForm({ ...convertForm, saleType: v as "cash" | "credit" })}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="cash" className="cursor-pointer">Cash</SelectItem><SelectItem value="credit" className="cursor-pointer">Credit</SelectItem></SelectContent>
              </Select></div>
            {convertForm.saleType === "credit" && <div><Label>Credit Terms</Label><Input value={convertForm.creditTerms} onChange={(e) => setConvertForm({ ...convertForm, creditTerms: e.target.value })} placeholder="e.g. Net 30" /></div>}
            {convertForm.saleType === "cash" && <div><Label>Receive Into</Label>
              <Select value={convertForm.accountId} onValueChange={(v) => setConvertForm({ ...convertForm, accountId: v })}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{ledgerAccounts?.map((a) => <SelectItem key={a._id} value={a._id} className="cursor-pointer">{a.name}</SelectItem>)}</SelectContent>
              </Select></div>}
          </div>
          <DialogFooter><Button className="cursor-pointer" onClick={handleConvert}>Convert</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {shareQuote && (
        <ShareDocumentDialog
          open={!!shareQuote}
          onOpenChange={(open) => { if (!open) setShareQuote(null); }}
          documentType="quotation"
          documentId={shareQuote.id}
          documentNumber={shareQuote.number}
          recipientName={shareQuote.customer}
          recipientEmail={shareQuote.email}
          recipientPhone={shareQuote.phone}
          amount={shareQuote.amount}
          dueDate={shareQuote.validUntil}
        />
      )}
    </div>
  );
}
