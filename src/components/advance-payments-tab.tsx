import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Banknote, Plus, Pencil, Trash2, Eye, ArrowRightLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";



const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "credit_card", label: "Credit Card" },
  { value: "mobile_pay", label: "Mobile Pay" },
  { value: "other", label: "Other" },
];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  partially_settled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  settled: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  refunded: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

type Direction = "vendor" | "customer";

// ── Create Advance Dialog ─────────────────────────────────────────────────────

function CreateAdvanceDialog({ direction, onClose }: { direction: Direction; onClose: () => void }) {
  const { fmt } = useCurrency();
  const vendors = useQuery(api.vendors.listVendors);
  const customers = useQuery(api.sales.listCustomers);
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const createAdvance = useMutation(api.advancePayments.createAdvance);

  const [entityId, setEntityId] = useState("none");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [bankAccountId, setBankAccountId] = useState("none");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const entities = direction === "vendor"
    ? (vendors?.filter((v) => v.isActive) ?? [])
    : (customers ?? []);

  const activeLedgerAccounts = ledgerAccounts ?? [];

  const handleSave = async () => {
    if (entityId === "none") { toast.error(`Select a ${direction}`); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!date) { toast.error("Date is required"); return; }
    if (bankAccountId === "none") { toast.error(direction === "vendor" ? "Please select which account to pay from" : "Please select which account to receive into"); return; }

    setSaving(true);
    try {
      await createAdvance({
        direction,
        vendorId: direction === "vendor" ? entityId as Id<"vendors"> : undefined,
        customerId: direction === "customer" ? entityId as Id<"customers"> : undefined,
        date,
        amount: amt,
        method: method as "cash" | "bank_transfer" | "cheque" | "credit_card" | "mobile_pay" | "other",
        accountId: bankAccountId as Id<"accounts">,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Advance payment recorded");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{direction === "vendor" ? "Pay Vendor in Advance" : "Receive Customer Advance"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>{direction === "vendor" ? "Vendor" : "Customer"} *</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder={`Select ${direction}`} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select...</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e._id} value={e._id} className="cursor-pointer">{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.value} value={m.value} className="cursor-pointer">{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, TXN ID..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{direction === "vendor" ? "Pay From (Account) *" : "Receive Into (Account) *"}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select account...</SelectItem>
                {activeLedgerAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.name} ({acc.subType ?? acc.type}) · Balance: {fmt(acc.balance ?? 0)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Purpose of advance..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : direction === "vendor" ? "Pay Advance" : "Record Advance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Settle Advance Dialog ─────────────────────────────────────────────────────

function SettleAdvanceDialog({ advanceId, direction, onClose }: { advanceId: Id<"advancePayments">; direction: Direction; onClose: () => void }) {
  const { fmt } = useCurrency();
  const detail = useQuery(api.advancePayments.getAdvanceWithSettlements, { advanceId });
  const bills = useQuery(api.billPayments.getPayableBills, {});
  const invoices = useQuery(api.invoicing.listInvoices, {});
  const settle = useMutation(api.advancePayments.settleAdvance);

  const [amount, setAmount] = useState("");
  const [billId, setBillId] = useState("none");
  const [invoiceId, setInvoiceId] = useState("none");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const balance = detail ? detail.amount - detail.settledAmount : 0;

  // Filter bills/invoices by the specific vendor/customer
  const availableBills = direction === "vendor" && detail?.vendorId
    ? (bills ?? []).filter((b) => b.vendorId === detail.vendorId)
    : [];
  const availableInvoices = direction === "customer" && detail?.customerId
    ? (invoices ?? []).filter((inv) => inv.customerId === detail.customerId && inv.status !== "paid" && inv.status !== "void")
    : [];

  const handleSettle = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || amt > balance) {
      toast.error(`Amount must be between $0.01 and ${fmt(balance)}`);
      return;
    }
    setSaving(true);
    try {
      await settle({
        advanceId,
        amount: amt,
        billId: billId !== "none" ? billId as Id<"bills"> : undefined,
        invoiceId: invoiceId !== "none" ? invoiceId as Id<"invoices"> : undefined,
        date,
        notes: notes.trim() || undefined,
      });
      toast.success("Advance settled successfully");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to settle");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Settle Advance Payment</DialogTitle></DialogHeader>
        {!detail ? (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Summary */}
            <div className="rounded-lg border p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium">{detail.entityName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Advance</span><span className="font-medium">{fmt(detail.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Already Settled</span><span>{fmt(detail.settledAmount)}</span></div>
              <div className="flex justify-between border-t pt-1 font-bold"><span>Available Balance</span><span className="text-primary">{fmt(balance)}</span></div>
            </div>

            {/* Settlement history */}
            {detail.settlements.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Previous Settlements</p>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {detail.settlements.map((s) => (
                    <div key={s._id} className="flex justify-between text-xs py-1 border-b last:border-0">
                      <span>{new Date(s.date).toLocaleDateString()} · {s.docRef || "General"}</span>
                      <span className="font-medium">{fmt(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settle form */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount to Settle *</Label>
                <Input type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={balance.toFixed(2)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            {/* Link to bill or invoice */}
            {direction === "vendor" && availableBills.length > 0 && (
              <div className="space-y-1.5">
                <Label>Apply to Bill (optional)</Label>
                <Select value={billId} onValueChange={setBillId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select bill..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific bill</SelectItem>
                    {availableBills.map((b) => (
                      <SelectItem key={b._id} value={b._id} className="cursor-pointer">
                        {b.title} — Balance: {fmt(b.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {direction === "customer" && availableInvoices.length > 0 && (
              <div className="space-y-1.5">
                <Label>Apply to Invoice (optional)</Label>
                <Select value={invoiceId} onValueChange={setInvoiceId}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select invoice..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific invoice</SelectItem>
                    {availableInvoices.map((inv) => (
                      <SelectItem key={inv._id} value={inv._id} className="cursor-pointer">
                        {inv.invoiceNumber} — {fmt((inv.totalAmount ?? 0) - (inv.amountPaid ?? 0))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Settlement reference..." />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSettle} disabled={saving || !detail} className="cursor-pointer">
            {saving ? "Settling..." : "Settle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View Advance Dialog ───────────────────────────────────────────────────────

function ViewAdvanceDialog({ advanceId, onClose }: { advanceId: Id<"advancePayments">; onClose: () => void }) {
  const { fmt } = useCurrency();
  const detail = useQuery(api.advancePayments.getAdvanceWithSettlements, { advanceId });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Advance Payment Details</DialogTitle></DialogHeader>
        {!detail ? (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs">{detail.direction === "vendor" ? "Vendor" : "Customer"}</p><p className="font-medium">{detail.entityName}</p></div>
              <div><p className="text-muted-foreground text-xs">Date</p><p className="font-medium">{new Date(detail.date).toLocaleDateString()}</p></div>
              <div><p className="text-muted-foreground text-xs">Amount</p><p className="font-bold text-lg">{fmt(detail.amount)}</p></div>
              <div><p className="text-muted-foreground text-xs">Status</p><Badge className={STATUS_STYLES[detail.status]}>{detail.status.replace("_", " ")}</Badge></div>
              <div><p className="text-muted-foreground text-xs">Method</p><p className="font-medium capitalize">{detail.method.replace("_", " ")}</p></div>
              <div><p className="text-muted-foreground text-xs">Settled</p><p className="font-medium">{fmt(detail.settledAmount)} / {fmt(detail.amount)}</p></div>
              {detail.reference && <div><p className="text-muted-foreground text-xs">Reference</p><p className="font-medium">{detail.reference}</p></div>}
            </div>

            {detail.notes && <div className="text-sm border-t pt-2"><p className="text-muted-foreground text-xs mb-1">Notes</p><p>{detail.notes}</p></div>}

            {detail.settlements.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Settlement History</p>
                <div className="space-y-2">
                  {detail.settlements.map((s) => (
                    <div key={s._id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{fmt(s.amount)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString()} · {s.docRef || "General"} · by {s.settledByName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdvancePaymentsTab({ direction }: { direction: Direction }) {
  const { fmt } = useCurrency();
  const advances = useQuery(api.advancePayments.listAdvances, { direction });
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateAdvance = useMutation(api.advancePayments.updateAdvance);
  const deleteAdvance = useMutation(api.advancePayments.deleteAdvance);

  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<Id<"advancePayments"> | null>(null);
  const [settleId, setSettleId] = useState<Id<"advancePayments"> | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const canManage = currentUser?.role !== "staff";
  const filtered = (advances ?? []).filter((a) => filterStatus === "all" || a.status === filterStatus);

  const handleRefund = async (id: Id<"advancePayments">) => {
    try {
      await updateAdvance({ advanceId: id, status: "refunded" });
      toast.success("Advance marked as refunded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refund");
    }
  };

  const handleDelete = async (id: Id<"advancePayments">) => {
    try {
      await deleteAdvance({ advanceId: id });
      toast.success("Advance deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const label = direction === "vendor" ? "Vendor Advances" : "Customer Advances";
  const buttonLabel = direction === "vendor" ? "Pay Advance" : "Receive Advance";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "partially_settled", "settled", "refunded"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors cursor-pointer",
                filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}>
              {s === "partially_settled" ? "Partial" : s}
            </button>
          ))}
        </div>
        {canManage && <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer"><Plus className="w-4 h-4 mr-1" />{buttonLabel}</Button>}
      </div>

      {advances === undefined ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Banknote /></EmptyMedia>
            <EmptyTitle>No {label.toLowerCase()} {filterStatus !== "all" ? `(${filterStatus})` : "yet"}</EmptyTitle>
            <EmptyDescription>
              {direction === "vendor"
                ? "Pay vendors in advance and settle when you receive goods"
                : "Receive advance payments from customers and settle when you deliver goods"}
            </EmptyDescription>
          </EmptyHeader>
          {canManage && filterStatus === "all" && (
            <EmptyContent><Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">{buttonLabel}</Button></EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((adv) => {
            const balance = adv.amount - adv.settledAmount;
            return (
              <Card key={adv._id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Banknote className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{adv.entityName}</p>
                        <Badge className={STATUS_STYLES[adv.status]}>{adv.status.replace("_", " ")}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {new Date(adv.date).toLocaleDateString()} · {adv.method.replace("_", " ")} · by {adv.createdByName}
                        {adv.reference && ` · Ref: ${adv.reference}`}
                      </p>
                      {adv.settledAmount > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Settled: {fmt(adv.settledAmount)} · Remaining: {fmt(balance)}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-lg text-primary">{fmt(adv.amount)}</p>
                      <div className="flex gap-1 mt-1 justify-end flex-wrap">
                        <Button size="sm" variant="ghost" className="h-7 cursor-pointer" onClick={() => setViewId(adv._id)} title="View"><Eye className="w-3 h-3" /></Button>
                        {canManage && (adv.status === "pending" || adv.status === "partially_settled") && (
                          <Button size="sm" variant="ghost" className="h-7 text-blue-600 cursor-pointer" onClick={() => setSettleId(adv._id)} title="Settle">
                            <ArrowRightLeft className="w-3 h-3" />
                          </Button>
                        )}
                        {canManage && adv.status === "pending" && (
                          <Button size="sm" variant="ghost" className="h-7 text-amber-600 cursor-pointer" onClick={() => handleRefund(adv._id)} title="Refund">
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        )}
                        {canManage && adv.settledAmount === 0 && (
                          <Button size="sm" variant="ghost" className="h-7 text-destructive cursor-pointer" onClick={() => handleDelete(adv._id)} title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && <CreateAdvanceDialog direction={direction} onClose={() => setShowCreate(false)} />}
      {viewId && <ViewAdvanceDialog advanceId={viewId} onClose={() => setViewId(null)} />}
      {settleId && <SettleAdvanceDialog advanceId={settleId} direction={direction} onClose={() => setSettleId(null)} />}
    </div>
  );
}
