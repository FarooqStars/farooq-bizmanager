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
import { PackageCheck, Plus, Pencil, Trash2, Eye, X, Package, Ban } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReceiptItem = {
  productId: Id<"products">;
  productName: string;
  quantity: number;
  unitCost: number;
  warehouseId: Id<"warehouses">;
};

// ── Create Receipt Dialog ─────────────────────────────────────────────────────

function CreateReceiptDialog({ onClose }: { onClose: () => void }) {
  const { fmt } = useCurrency();
  const vendors = useQuery(api.vendors.listVendors);
  const products = useQuery(api.products.listProducts, {});
  const warehouses = useQuery(api.products.listWarehouses);
  const createReceipt = useMutation(api.goodsReceipts.createGoodsReceipt);

  const [vendorId, setVendorId] = useState("none");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptType, setReceiptType] = useState<"without_bill" | "with_bill">("without_bill");
  const [billTitle, setBillTitle] = useState("");
  const [billDueDate, setBillDueDate] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Add item form
  const [selProduct, setSelProduct] = useState("none");
  const [selQty, setSelQty] = useState("1");
  const [selCost, setSelCost] = useState("");
  const [selWarehouse, setSelWarehouse] = useState("none");

  const activeProducts = products?.filter((p) => p.isActive) ?? [];
  const activeWarehouses = warehouses?.filter((w) => w.isActive) ?? [];

  const handleSelectProduct = (id: string) => {
    setSelProduct(id);
    const p = activeProducts.find((p) => p._id === id);
    if (p) setSelCost(String(p.costPrice ?? p.unitPrice ?? 0));
  };

  const handleAddItem = () => {
    if (selProduct === "none") { toast.error("Select a product"); return; }
    if (selWarehouse === "none") { toast.error("Select a warehouse"); return; }
    const qty = parseFloat(selQty);
    const cost = parseFloat(selCost);
    if (isNaN(qty) || qty <= 0) { toast.error("Enter a valid quantity"); return; }
    if (isNaN(cost) || cost < 0) { toast.error("Enter a valid cost"); return; }
    const prod = activeProducts.find((p) => p._id === selProduct);
    if (!prod) return;

    setItems((prev) => [...prev, {
      productId: selProduct as Id<"products">,
      productName: prod.name,
      quantity: qty,
      unitCost: cost,
      warehouseId: selWarehouse as Id<"warehouses">,
    }]);
    setSelProduct("none");
    setSelQty("1");
    setSelCost("");
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const totalCost = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const handleSave = async () => {
    if (vendorId === "none") { toast.error("Select a vendor"); return; }
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    if (!date) { toast.error("Date is required"); return; }
    if (receiptType === "with_bill" && !billDueDate) { toast.error("Bill due date is required"); return; }

    setSaving(true);
    try {
      await createReceipt({
        vendorId: vendorId as Id<"vendors">,
        date,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        type: receiptType,
        billTitle: receiptType === "with_bill" ? (billTitle.trim() || `Bill from ${vendors?.find((v) => v._id === vendorId)?.name ?? "vendor"}`) : undefined,
        billAmount: receiptType === "with_bill" ? totalCost : undefined,
        billDueDate: receiptType === "with_bill" ? billDueDate : undefined,
        items,
      });
      toast.success(receiptType === "with_bill" ? "Items received & bill created" : "Items received (no bill)");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save receipt");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Receive Items</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Receipt Type */}
          <div className="flex gap-3">
            <button
              onClick={() => setReceiptType("without_bill")}
              className={cn("flex-1 rounded-lg border p-3 text-left transition-colors cursor-pointer",
                receiptType === "without_bill" ? "border-primary bg-primary/5" : "border-muted hover:bg-accent"
              )}
            >
              <p className="font-medium text-sm">Without Bill</p>
              <p className="text-xs text-muted-foreground mt-0.5">Items received, no invoice yet</p>
            </button>
            <button
              onClick={() => setReceiptType("with_bill")}
              className={cn("flex-1 rounded-lg border p-3 text-left transition-colors cursor-pointer",
                receiptType === "with_bill" ? "border-primary bg-primary/5" : "border-muted hover:bg-accent"
              )}
            >
              <p className="font-medium text-sm">With Bill</p>
              <p className="text-xs text-muted-foreground mt-0.5">Items received with vendor invoice</p>
            </button>
          </div>

          {/* Header Fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select vendor...</SelectItem>
                  {vendors?.filter((v) => v.isActive).map((v) => (
                    <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reference # (optional)</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="PO-001, DN-123..." />
            </div>
            {receiptType === "with_bill" && (
              <>
                <div className="space-y-1.5">
                  <Label>Bill Due Date *</Label>
                  <Input type="date" value={billDueDate} onChange={(e) => setBillDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Bill Title (optional)</Label>
                  <Input value={billTitle} onChange={(e) => setBillTitle(e.target.value)} placeholder="Vendor invoice reference" />
                </div>
              </>
            )}
          </div>

          {/* Items Table */}
          {items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2">Product</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{activeWarehouses.find((w) => w._id === item.warehouseId)?.name ?? "?"}</p>
                      </td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">{fmt(item.unitCost)}</td>
                      <td className="p-2 text-right font-medium">{fmt(item.quantity * item.unitCost)}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive cursor-pointer" onClick={() => removeItem(i)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/50">
                    <td colSpan={3} className="p-2 text-right font-semibold">Total</td>
                    <td className="p-2 text-right font-bold text-primary">{fmt(totalCost)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Add Item Form */}
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase">Add Item</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Product</Label>
                <Select value={selProduct} onValueChange={handleSelectProduct}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select --</SelectItem>
                    {activeProducts.map((p) => (
                      <SelectItem key={p._id} value={p._id} className="cursor-pointer">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Warehouse</Label>
                <Select value={selWarehouse} onValueChange={setSelWarehouse}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select --</SelectItem>
                    {activeWarehouses.map((w) => (
                      <SelectItem key={w._id} value={w._id} className="cursor-pointer">{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" value={selQty} onChange={(e) => setSelQty(e.target.value)} min={1} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit Cost</Label>
                <Input type="number" value={selCost} onChange={(e) => setSelCost(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <Button size="sm" onClick={handleAddItem} className="cursor-pointer"><Plus className="w-3 h-3 mr-1" />Add Item</Button>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Delivery notes, condition remarks..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0} className="cursor-pointer">
            {saving ? "Saving..." : `Receive ${items.length} Item(s) · ${fmt(totalCost)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View Receipt Dialog ───────────────────────────────────────────────────────

function ViewReceiptDialog({ receiptId, onClose }: { receiptId: Id<"goodsReceipts">; onClose: () => void }) {
  const { fmt } = useCurrency();
  const receipt = useQuery(api.goodsReceipts.getReceiptWithItems, { receiptId });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Receipt Details</DialogTitle></DialogHeader>
        {!receipt ? (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs">Vendor</p><p className="font-medium">{receipt.vendor?.name ?? "Unknown"}</p></div>
              <div><p className="text-muted-foreground text-xs">Date</p><p className="font-medium">{new Date(receipt.date).toLocaleDateString()}</p></div>
              <div><p className="text-muted-foreground text-xs">Type</p><p className="font-medium">{receipt.type === "with_bill" ? "With Bill" : "Without Bill"}</p></div>
              <div><p className="text-muted-foreground text-xs">Status</p>
                <Badge className={receipt.status === "received" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {receipt.status}
                </Badge>
              </div>
              {receipt.referenceNumber && <div><p className="text-muted-foreground text-xs">Reference</p><p className="font-medium">{receipt.referenceNumber}</p></div>}
              <div><p className="text-muted-foreground text-xs">Received By</p><p className="font-medium">{receipt.receivedByUser?.name ?? "?"}</p></div>
            </div>

            {/* Items */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Product</th><th className="p-2 text-center">Qty</th><th className="p-2 text-right">Cost</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item._id} className="border-t">
                      <td className="p-2">{item.productName}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">{fmt(item.unitCost)}</td>
                      <td className="p-2 text-right font-medium">{fmt(item.quantity * item.unitCost)}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/50">
                    <td colSpan={3} className="p-2 text-right font-semibold">Total</td>
                    <td className="p-2 text-right font-bold text-primary">{fmt(receipt.totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {receipt.notes && <div className="text-sm"><p className="text-muted-foreground text-xs mb-1">Notes</p><p>{receipt.notes}</p></div>}
          </div>
        )}
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Receipt Dialog ───────────────────────────────────────────────────────

function EditReceiptDialog({ receiptId, onClose }: { receiptId: Id<"goodsReceipts">; onClose: () => void }) {
  const receipt = useQuery(api.goodsReceipts.getReceiptWithItems, { receiptId });
  const vendors = useQuery(api.vendors.listVendors);
  const updateReceipt = useMutation(api.goodsReceipts.updateGoodsReceipt);

  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  if (receipt && !loaded) {
    setVendorId(receipt.vendorId);
    setDate(receipt.date);
    setReferenceNumber(receipt.referenceNumber ?? "");
    setNotes(receipt.notes ?? "");
    setLoaded(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateReceipt({
        receiptId,
        vendorId: vendorId as Id<"vendors">,
        date,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Receipt updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Receipt</DialogTitle></DialogHeader>
        {!receipt ? (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {vendors?.filter((v) => v.isActive).map((v) => (
                    <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reference #</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !loaded} className="cursor-pointer">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function ReceiveItemsTab() {
  const { fmt } = useCurrency();
  const receipts = useQuery(api.goodsReceipts.listGoodsReceipts);
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateReceipt = useMutation(api.goodsReceipts.updateGoodsReceipt);
  const deleteReceipt = useMutation(api.goodsReceipts.deleteGoodsReceipt);

  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<Id<"goodsReceipts"> | null>(null);
  const [editId, setEditId] = useState<Id<"goodsReceipts"> | null>(null);
  const [filterType, setFilterType] = useState<"all" | "without_bill" | "with_bill">("all");

  const canManage = currentUser?.role !== "staff";
  const filtered = (receipts ?? []).filter((r) => filterType === "all" || r.type === filterType);

  const handleCancel = async (id: Id<"goodsReceipts">) => {
    try {
      await updateReceipt({ receiptId: id, status: "cancelled" });
      toast.success("Receipt cancelled — inventory reversed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel");
    }
  };

  const handleDelete = async (id: Id<"goodsReceipts">) => {
    try {
      await deleteReceipt({ receiptId: id });
      toast.success("Receipt deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {([
            { key: "all", label: "All" },
            { key: "without_bill", label: "Without Bill" },
            { key: "with_bill", label: "With Bill" },
          ] as const).map((f) => (
            <button key={f.key} onClick={() => setFilterType(f.key)}
              className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                filterType === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}>
              {f.label}
            </button>
          ))}
        </div>
        {canManage && <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer"><Plus className="w-4 h-4 mr-1" />Receive Items</Button>}
      </div>

      {receipts === undefined ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><PackageCheck /></EmptyMedia>
            <EmptyTitle>No goods receipts {filterType !== "all" ? `(${filterType.replace("_", " ")})` : "yet"}</EmptyTitle>
            <EmptyDescription>Receive inventory items from vendors with or without a bill</EmptyDescription>
          </EmptyHeader>
          {canManage && filterType === "all" && (
            <EmptyContent><Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">Receive Items</Button></EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r._id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{r.vendor?.name ?? "Unknown Vendor"}</p>
                      <Badge className={r.type === "with_bill" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}>
                        {r.type === "with_bill" ? "With Bill" : "No Bill"}
                      </Badge>
                      {r.status === "cancelled" && (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Cancelled</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(r.date).toLocaleDateString()} · by {r.receivedByUser?.name ?? "?"}
                      {r.referenceNumber && ` · Ref: ${r.referenceNumber}`}
                    </p>
                    {r.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-lg text-primary">{fmt(r.totalCost)}</p>
                    <div className="flex gap-1 mt-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 cursor-pointer" onClick={() => setViewId(r._id)}><Eye className="w-3 h-3" /></Button>
                      {canManage && r.status !== "cancelled" && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 cursor-pointer" onClick={() => setEditId(r._id)}><Pencil className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 text-amber-600 cursor-pointer" title="Cancel & reverse inventory" onClick={() => handleCancel(r._id)}><Ban className="w-3 h-3" /></Button>
                        </>
                      )}
                      {canManage && (
                        <Button size="sm" variant="ghost" className="h-7 text-destructive cursor-pointer" onClick={() => handleDelete(r._id)}><Trash2 className="w-3 h-3" /></Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateReceiptDialog onClose={() => setShowCreate(false)} />}
      {viewId && <ViewReceiptDialog receiptId={viewId} onClose={() => setViewId(null)} />}
      {editId && <EditReceiptDialog receiptId={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}
