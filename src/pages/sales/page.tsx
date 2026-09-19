import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  ShoppingCart, Plus, Trash2, DollarSign, TrendingUp,
  Calendar, User, Eye, X, Users, Pencil, Phone, Mail, MapPin, Link2, Briefcase, Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import CustomerDialog from "./_components/customer-dialog.tsx";
import { CreditStatusBadge } from "./_components/customer-dialog.tsx";
import { LinkedEntityBadge, LinkCustomerToVendorDialog, RelationshipSummaryCard } from "@/components/entity-link.tsx";
import JobInvoicesTab from "./_components/job-invoices-tab.tsx";
import AdvancePaymentsTab from "@/components/advance-payments-tab.tsx";
import { useSearchParams } from "react-router-dom";
import { useFocusItem, focusElementId, FOCUS_RING_CLASS } from "@/hooks/use-focus-item.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig = {
  completed: { label: "Completed", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  pending: { label: "Pending", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  refunded: { label: "Refunded", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

// ── Sale Detail Modal ──────────────────────────────────────────────────────────

function SaleDetailModal({ saleId, onClose }: { saleId: Id<"sales">; onClose: () => void }) {
  const { fmt } = useCurrency();
  const sale = useQuery(api.sales.getSaleWithItems, { saleId });
  const updateStatus = useMutation(api.sales.updateSaleStatus);
  const currentUser = useQuery(api.users.getCurrentUser);
  const canManage = currentUser?.role !== "staff";

  const handleStatus = async (status: "completed" | "refunded" | "pending") => {
    try { await updateStatus({ saleId, status }); toast.success(`Marked as ${status}`); }
    catch { toast.error("Failed to update status"); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Sale Details</DialogTitle>
        </DialogHeader>
        {sale === undefined ? (
          <div className="space-y-3 py-4"><Skeleton className="h-6 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Customer & date */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-semibold">{sale.customer?.name ?? sale.customerName ?? "Walk-in"}</p>
                <p className="text-sm text-muted-foreground">{new Date(sale.date).toLocaleDateString()} · by {sale.recordedByUser?.name ?? "?"}</p>
              </div>
              <span className={cn("text-xs px-2 py-1 rounded-full font-medium", statusConfig[sale.status].class)}>
                {statusConfig[sale.status].label}
              </span>
            </div>

            {/* Items */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-medium">Item</th>
                    <th className="text-center p-2 font-medium">Qty</th>
                    <th className="text-right p-2 font-medium">Price</th>
                    <th className="text-right p-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sale.items.map((item) => (
                    <tr key={item._id}>
                      <td className="p-2">{item.productName}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">{fmt(item.unitPrice)}</td>
                      <td className="p-2 text-right font-medium">{fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50">
                  <tr>
                    <td colSpan={3} className="p-2 text-right font-semibold">Total</td>
                    <td className="p-2 text-right font-bold text-primary">{fmt(sale.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {sale.notes && <p className="text-sm text-muted-foreground border-t pt-2">{sale.notes}</p>}

            {/* Status actions */}
            {canManage && sale.status !== "refunded" && (
              <div className="flex gap-2 pt-1">
                {sale.status !== "completed" && (
                  <Button size="sm" variant="secondary" onClick={() => handleStatus("completed")}>Mark Completed</Button>
                )}
                <Button size="sm" variant="secondary" className="text-red-500" onClick={() => handleStatus("refunded")}>Refund</Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New Sale Dialog ────────────────────────────────────────────────────────────

type SaleLineItem = {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitPrice: number;
};

function NewSaleDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const products = useQuery(api.products.listProducts, {});
  const customers = useQuery(api.sales.listCustomers);
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const createSale = useMutation(api.sales.createSale);

  const [customerId, setCustomerId] = useState("none");
  const [walkInName, setWalkInName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SaleLineItem[]>([]);
  const [selProduct, setSelProduct] = useState("none");
  const [selQty, setSelQty] = useState("1");
  const [selPrice, setSelPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const activeProducts = products?.filter((p) => p.isActive) ?? [];

  const handleSelectProduct = (id: string) => {
    setSelProduct(id);
    const p = activeProducts.find((p) => p._id === id);
    if (p) setSelPrice(String(p.unitPrice));
  };

  const handleAddItem = () => {
    if (selProduct === "none") { toast.error("Select a product"); return; }
    const qty = parseFloat(selQty);
    const price = parseFloat(selPrice);
    if (isNaN(qty) || qty <= 0) { toast.error("Enter a valid quantity"); return; }
    if (isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    const prod = activeProducts.find((p) => p._id === selProduct);
    if (!prod) return;
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === selProduct);
      if (existing >= 0) {
        return prev.map((i, idx) => idx === existing ? { ...i, quantity: i.quantity + qty } : i);
      }
      return [...prev, { productId: selProduct as Id<"products">, productName: prod.name, quantity: qty, unitPrice: price }];
    });
    setSelProduct("none");
    setSelQty("1");
    setSelPrice("");
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const handleSave = async () => {
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    if (!date) { toast.error("Date is required"); return; }
    if (!accountId) { toast.error("Select an account to deposit into"); return; }
    setSaving(true);
    try {
      await createSale({
        customerId: customerId !== "none" ? customerId as Id<"customers"> : undefined,
        customerName: customerId === "none" && walkInName.trim() ? walkInName.trim() : undefined,
        date,
        accountId: accountId as Id<"accounts">,
        notes: notes.trim() || undefined,
        items,
      });
      toast.success("Sale recorded!");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save sale";
      toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Sale</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Walk-in / No account</SelectItem>
                  {customers?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {customerId === "none" && (
              <div className="space-y-2 col-span-2">
                <Label>Customer Name (optional)</Label>
                <Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Walk-in customer" />
              </div>
            )}
            <div className="space-y-2 col-span-2">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Deposit Into Account *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Select cash / bank account" /></SelectTrigger>
                <SelectContent>
                  {ledgerAccounts?.map((acc) => (
                    <SelectItem key={acc._id} value={acc._id}>
                      {acc.name} ({acc.subType ?? acc.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add item row */}
          <div className="space-y-2">
            <Label>Add Item</Label>
            <div className="flex gap-2 flex-wrap">
              <Select value={selProduct} onValueChange={handleSelectProduct}>
                <SelectTrigger className="flex-1 min-w-[160px]"><SelectValue placeholder="Product / Service" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select...</SelectItem>
                  {activeProducts.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" min="0.01" step="0.01" className="w-20" value={selQty} onChange={(e) => setSelQty(e.target.value)} placeholder="Qty" />
              <Input type="number" min="0" step="0.01" className="w-24" value={selPrice} onChange={(e) => setSelPrice(e.target.value)} placeholder="Price" />
              <Button type="button" size="sm" onClick={handleAddItem}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2 font-medium">Item</th>
                    <th className="text-center p-2 font-medium">Qty</th>
                    <th className="text-right p-2 font-medium">Price</th>
                    <th className="text-right p-2 font-medium">Sub</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 truncate max-w-[120px]">{item.productName}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">{fmt(item.unitPrice)}</td>
                      <td className="p-2 text-right font-medium">{fmt(item.quantity * item.unitPrice)}</td>
                      <td className="p-2">
                        <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50">
                  <tr>
                    <td colSpan={3} className="p-2 text-right font-semibold">Total</td>
                    <td className="p-2 text-right font-bold text-primary">{fmt(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0}>
            {saving ? "Saving..." : `Record Sale · ${fmt(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Sale Dialog ──────────────────────────────────────────────────────────

function EditSaleDialog({ saleId, onClose }: { saleId: Id<"sales">; onClose: () => void }) {
  const { fmt } = useCurrency();
  const sale = useQuery(api.sales.getSaleWithItems, { saleId });
  const products = useQuery(api.products.listProducts, {});
  const customers = useQuery(api.sales.listCustomers);
  const updateSale = useMutation(api.sales.updateSale);

  const [customerId, setCustomerId] = useState("none");
  const [walkInName, setWalkInName] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SaleLineItem[]>([]);
  const [selProduct, setSelProduct] = useState("none");
  const [selQty, setSelQty] = useState("1");
  const [selPrice, setSelPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Populate form when sale data loads
  if (sale && !loaded) {
    setCustomerId(sale.customerId ?? "none");
    setWalkInName(sale.customerName ?? "");
    setDate(sale.date);
    setNotes(sale.notes ?? "");
    setItems(sale.items.map((i) => ({
      productId: i.productId as Id<"products">,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })));
    setLoaded(true);
  }

  const activeProducts = products?.filter((p) => p.isActive) ?? [];

  const handleSelectProduct = (id: string) => {
    setSelProduct(id);
    const p = activeProducts.find((p) => p._id === id);
    if (p) setSelPrice(String(p.unitPrice));
  };

  const handleAddItem = () => {
    if (selProduct === "none") { toast.error("Select a product"); return; }
    const qty = parseFloat(selQty);
    const price = parseFloat(selPrice);
    if (isNaN(qty) || qty <= 0) { toast.error("Enter a valid quantity"); return; }
    if (isNaN(price) || price < 0) { toast.error("Enter a valid price"); return; }
    const prod = activeProducts.find((p) => p._id === selProduct);
    if (!prod) return;
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === selProduct);
      if (existing >= 0) {
        return prev.map((i, idx) => idx === existing ? { ...i, quantity: i.quantity + qty } : i);
      }
      return [...prev, { productId: selProduct as Id<"products">, productName: prod.name, quantity: qty, unitPrice: price }];
    });
    setSelProduct("none");
    setSelQty("1");
    setSelPrice("");
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const handleSave = async () => {
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    if (!date) { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      await updateSale({
        saleId,
        customerId: customerId !== "none" ? customerId as Id<"customers"> : undefined,
        customerName: customerId === "none" && walkInName.trim() ? walkInName.trim() : undefined,
        date,
        notes: notes.trim() || undefined,
        items,
      });
      toast.success("Sale updated!");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update sale";
      toast.error(msg);
    } finally { setSaving(false); }
  };

  if (!sale) {
    return (
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Sale</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Edit Sale</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Customer */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="cursor-pointer">Walk-in Customer</SelectItem>
                  {customers?.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {customerId === "none" && (
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Walk-in name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Product</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{item.productName}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">{fmt(item.unitPrice)}</td>
                      <td className="p-2 text-right font-medium">{fmt(item.quantity * item.unitPrice)}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive cursor-pointer" onClick={() => removeItem(i)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add item */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Product</Label>
              <Select value={selProduct} onValueChange={handleSelectProduct}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="cursor-pointer">-- Select --</SelectItem>
                  {activeProducts.map((p) => (
                    <SelectItem key={p._id} value={p._id} className="cursor-pointer">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-16">
              <Label className="text-xs">Qty</Label>
              <Input type="number" value={selQty} onChange={(e) => setSelQty(e.target.value)} min={1} />
            </div>
            <div className="w-24">
              <Label className="text-xs">Price</Label>
              <Input type="number" value={selPrice} onChange={(e) => setSelPrice(e.target.value)} />
            </div>
            <Button size="sm" onClick={handleAddItem} className="cursor-pointer"><Plus className="w-3 h-3 mr-1" />Add</Button>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0} className="cursor-pointer">
            {saving ? "Saving..." : `Update Sale · ${fmt(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Customer Dialog ────────────────────────────────────────────────────────────

// ── Sales Tab ──────────────────────────────────────────────────────────────────

function SalesTab() {
  const { fmt } = useCurrency();
  const sales = useQuery(api.sales.listSales);
  const deleteSale = useMutation(api.sales.deleteSale);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [showNew, setShowNew] = useState(false);
  const [viewId, setViewId] = useState<Id<"sales"> | null>(null);
  const [editId, setEditId] = useState<Id<"sales"> | null>(null);
  const [filter, setFilter] = useState("all");

  const canManage = currentUser?.role !== "staff";
  type SaleRow = NonNullable<typeof sales>[number];
  const filtered: SaleRow[] = (sales ?? []).filter((s) => filter === "all" || s.status === filter);

  const handleDelete = async (id: Id<"sales">) => {
    try { await deleteSale({ saleId: id }); toast.success("Sale deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {["all", "completed", "pending", "refunded"].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn("px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" />New Sale</Button>
      </div>

      {sales === undefined ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
            <EmptyTitle>No sales {filter !== "all" ? `with status "${filter}"` : "yet"}</EmptyTitle>
            <EmptyDescription>Record your first sale to track revenue</EmptyDescription>
          </EmptyHeader>
          {filter === "all" && <EmptyContent><Button size="sm" onClick={() => setShowNew(true)}>New Sale</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((sale) => (
            <Card key={sale._id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{sale.customer?.name ?? sale.customerName ?? "Walk-in"}</p>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusConfig[sale.status].class)}>
                        {statusConfig[sale.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(sale.date).toLocaleDateString()} · by {sale.recordedByUser?.name ?? "?"}
                    </p>
                    {sale.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{sale.notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="font-bold text-lg text-primary">{fmt(sale.totalAmount)}</p>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setViewId(sale._id)}><Eye className="w-3 h-3" /></Button>
                      {canManage && <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditId(sale._id)} title="Edit Sale"><Pencil className="w-3 h-3" /></Button>}
                      {canManage && <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => handleDelete(sale._id)}><Trash2 className="w-3 h-3" /></Button>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNew && <NewSaleDialog onClose={() => setShowNew(false)} />}
      {viewId && <SaleDetailModal saleId={viewId} onClose={() => setViewId(null)} />}
      {editId && <EditSaleDialog saleId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}

// ── Customers Tab ──────────────────────────────────────────────────────────────

function CustomersTab() {
  const customers = useQuery(api.sales.listCustomers);
  const vendors = useQuery(api.vendors.listVendors);
  const { isFocused } = useFocusItem();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Doc<"customers"> | null>(null);
  const [linkingCustomer, setLinkingCustomer] = useState<Doc<"customers"> | null>(null);
  const [showRelationship, setShowRelationship] = useState<Id<"customers"> | null>(null);

  // Build lookup of vendor names for linked customers
  const vendorNameMap = new Map<string, string>();
  vendors?.forEach((v) => {
    vendorNameMap.set(v._id, v.name);
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1" />Add Customer</Button>
      </div>

      {customers === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : customers.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>No customers yet</EmptyTitle>
            <EmptyDescription>Add customer accounts to track purchase history</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Add Customer</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card key={c._id} id={focusElementId(c._id)} className={cn(isFocused(c._id) && FOCUS_RING_CLASS)}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{c.name}</p>
                        {c.creditStatus && c.creditStatus !== "active" && (
                          <CreditStatusBadge status={c.creditStatus} />
                        )}
                      </div>
                      {c.linkedVendorId && vendorNameMap.get(c.linkedVendorId) && (
                        <LinkedEntityBadge
                          type="customer"
                          linkedName={vendorNameMap.get(c.linkedVendorId) ?? ""}
                          onViewLink={() => setShowRelationship(c._id)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!c.linkedVendorId && (
                      <Button size="sm" variant="ghost" onClick={() => setLinkingCustomer(c)} title="Link as Vendor" className="cursor-pointer">
                        <Link2 className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} className="cursor-pointer"><Pencil className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {c.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{c.phone}</p>}
                  {c.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{c.email}</p>}
                  {c.address && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{c.address}</p>}
                </div>
                {c.notes && <p className="text-xs text-muted-foreground border-t pt-2">{c.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && <CustomerDialog onClose={() => setShowAdd(false)} />}
      {editing && <CustomerDialog customer={editing} onClose={() => setEditing(null)} />}
      {linkingCustomer && (
        <LinkCustomerToVendorDialog
          customerId={linkingCustomer._id}
          customerName={linkingCustomer.name}
          onClose={() => setLinkingCustomer(null)}
        />
      )}
      {showRelationship && (
        <Dialog open onOpenChange={() => setShowRelationship(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Entity Relationship</DialogTitle></DialogHeader>
            <RelationshipSummaryCard customerId={showRelationship} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { fmt } = useCurrency();
  const summary = useQuery(api.sales.getSalesSummary);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab && ["sales", "jobinvoices", "advances", "customers"].includes(requestedTab) ? requestedTab : "sales";

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      prev.set("tab", value);
      return prev;
    });
  };

  const statCards = [
    { label: "Today's Revenue", value: summary ? fmt(summary.todayRevenue) : "...", icon: Calendar, color: "text-blue-600" },
    { label: "This Month", value: summary ? fmt(summary.monthRevenue) : "...", icon: TrendingUp, color: "text-green-600" },
    { label: "Total Revenue", value: summary ? fmt(summary.totalRevenue) : "...", icon: DollarSign, color: "text-primary" },
    { label: "Total Sales", value: summary ? String(summary.totalSales) : "...", icon: ShoppingCart, color: "text-purple-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart className="w-6 h-6" />Sales</h1>
        <p className="text-muted-foreground text-sm mt-1">Record sales, manage customers, and track revenue</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  {summary === undefined
                    ? <Skeleton className="h-6 w-16 mt-1" />
                    : <p className="text-xl font-bold mt-0.5 break-words leading-tight">{value}</p>}
                </div>
                <div className={cn("p-2 rounded-lg bg-muted flex-shrink-0", color)}><Icon className="w-4 h-4" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="sales" className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Sales</TabsTrigger>
          <TabsTrigger value="jobinvoices" className="flex items-center gap-2"><Briefcase className="w-4 h-4" />Job Invoices</TabsTrigger>
          <TabsTrigger value="advances" className="flex items-center gap-2"><Banknote className="w-4 h-4" />Advances</TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2"><Users className="w-4 h-4" />Customers</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4"><SalesTab /></TabsContent>
        <TabsContent value="jobinvoices" className="mt-4"><JobInvoicesTab /></TabsContent>
        <TabsContent value="advances" className="mt-4"><AdvancePaymentsTab direction="customer" /></TabsContent>
        <TabsContent value="customers" className="mt-4"><CustomersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
