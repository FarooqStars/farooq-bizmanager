import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, Briefcase, Send, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Link } from "react-router-dom";

type LineItem = { description: string; quantity: number; unitPrice: number };

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  void: "bg-muted text-muted-foreground",
};

export default function JobInvoicesProjectTab() {
  const { fmt } = useCurrency();
  const invoices = useQuery(api.invoicing.listJobInvoices, {});
  const projects = useQuery(api.projects.listProjects, {});
  const customers = useQuery(api.sales.listCustomers);
  const createInvoice = useMutation(api.invoicing.createInvoice);
  const updateStatus = useMutation(api.invoicing.updateInvoiceStatus);
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });

  const [showCreate, setShowCreate] = useState(false);
  const [filterProject, setFilterProject] = useState("all");

  // Create form
  const [projectId, setProjectId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [saleType, setSaleType] = useState<"cash" | "credit">("credit");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");

  const filtered = invoices?.filter(
    (inv) => filterProject === "all" || inv.projectId === filterProject
  );

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
  const discountAmount = discount ? parseFloat(discount) : 0;
  const total = subtotal + taxAmount - discountAmount;

  function handleProjectSelect(projId: string) {
    setProjectId(projId);
    if (projId && projId !== "none") {
      const project = projects?.find((p) => p._id === projId);
      if (project?.customerId) {
        setCustomerId(project.customerId);
      }
    }
  }

  function resetForm() {
    setProjectId("");
    setCustomerId("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate("");
    setSaleType("credit");
    setDepositAccountId("");
    setLineItems([{ description: "", quantity: 1, unitPrice: 0 }]);
    setTaxRate("");
    setDiscount("");
    setNotes("");
  }

  async function handleCreate() {
    if (!projectId || !customerId || !date || !dueDate || lineItems.some((li) => !li.description)) {
      toast.error("Project, customer, dates, and line items are required");
      return;
    }
    if (saleType === "cash" && !depositAccountId) {
      toast.error("Select a cash or bank account to receive this cash sale");
      return;
    }
    try {
      await createInvoice({
        customerId: customerId as Id<"customers">,
        date,
        dueDate,
        saleType,
        items: lineItems,
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        discount: discountAmount || undefined,
        notes: notes || undefined,
        accountId: saleType === "cash" && depositAccountId ? depositAccountId as Id<"accounts"> : undefined,
        projectId: projectId as Id<"projects">,
      });
      toast.success("Job invoice created");
      setShowCreate(false);
      resetForm();
    } catch {
      toast.error("Failed to create invoice");
    }
  }

  async function handleSend(id: string) {
    try {
      await updateStatus({ id: id as Id<"invoices">, status: "sent" });
      toast.success("Invoice sent");
    } catch { toast.error("Failed to send"); }
  }

  // Summary
  const totalInvoiced = filtered?.reduce((s, inv) => s + inv.totalAmount, 0) ?? 0;
  const totalPaid = filtered?.reduce((s, inv) => s + inv.amountPaid, 0) ?? 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-56 cursor-pointer"><SelectValue placeholder="Filter by job" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Jobs</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p._id} value={p._id}>{p.code} - {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">
            {filtered?.length ?? 0} invoices · {fmt(totalInvoiced)} invoiced · {fmt(totalPaid)} paid
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" asChild className="cursor-pointer">
            <Link to="/sales?tab=jobinvoices">
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Full View
            </Link>
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> New Job Invoice
          </Button>
        </div>
      </div>

      {/* Invoice List */}
      {invoices === undefined ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered && filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No job invoices yet</EmptyTitle>
            <EmptyDescription>Create invoices linked to your jobs to track project billing</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Job Invoice</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {filtered?.map((inv) => (
            <Card key={inv._id}>
              <CardContent className="py-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{inv.invoiceNumber}</span>
                      <Badge className={STATUS_STYLES[inv.status]}>{inv.status.replace("_", " ")}</Badge>
                      <Badge variant="secondary" className="text-xs">
                        <Briefcase className="w-3 h-3 mr-1" />{inv.projectCode} - {inv.projectName}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <span>Customer: {inv.customerName}</span>
                      <span>Date: {inv.date}</span>
                      <span>Due: {inv.dueDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold">{fmt(inv.totalAmount)}</p>
                      {inv.amountPaid > 0 && inv.amountPaid < inv.totalAmount && (
                        <p className="text-xs text-muted-foreground">Paid: {fmt(inv.amountPaid)}</p>
                      )}
                    </div>
                    {inv.status === "draft" && (
                      <Button size="sm" variant="ghost" onClick={() => handleSend(inv._id)} className="cursor-pointer" title="Send">
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Job Invoice Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" />Create Job Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Job / Project *</Label>
              <Select value={projectId} onValueChange={handleProjectSelect}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select job" /></SelectTrigger>
                <SelectContent>
                  {projects?.filter((p) => p.status === "active" || p.status === "planning").map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.code} - {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Invoice Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Due Date *</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Sale Type</Label>
              <Select value={saleType} onValueChange={(v) => setSaleType(v as "cash" | "credit")}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {saleType === "cash" && (
              <div className="space-y-1">
                <Label>Deposit Into Account *</Label>
                <Select value={depositAccountId} onValueChange={setDepositAccountId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select cash / bank account" /></SelectTrigger>
                  <SelectContent>
                    {ledgerAccounts?.map((acc) => (
                      <SelectItem key={acc._id} value={acc._id}>
                        {acc.name} ({acc.subType ?? acc.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Line Items</Label>
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px] gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[i] = { ...updated[i], description: e.target.value };
                      setLineItems(updated);
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity || ""}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[i] = { ...updated[i], quantity: parseInt(e.target.value) || 0 };
                      setLineItems(updated);
                    }}
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={item.unitPrice || ""}
                    onChange={(e) => {
                      const updated = [...lineItems];
                      updated[i] = { ...updated[i], unitPrice: parseFloat(e.target.value) || 0 };
                      setLineItems(updated);
                    }}
                  />
                </div>
              ))}
              <Button size="sm" variant="secondary" className="cursor-pointer"
                onClick={() => setLineItems([...lineItems, { description: "", quantity: 1, unitPrice: 0 }])}
              >
                <Plus className="w-3 h-3 mr-1" />Add Line
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tax Rate (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>Discount</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes..." />
            </div>

            <div className="bg-muted rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {taxAmount > 0 && <div className="flex justify-between"><span>Tax</span><span>{fmt(taxAmount)}</span></div>}
              {discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmt(discountAmount)}</span></div>}
              <div className="flex justify-between font-bold border-t mt-1 pt-1">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="cursor-pointer">Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
