import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function StockTransferDialog({ onClose }: { onClose: () => void }) {
  const warehouses = useQuery(api.products.listWarehouses);
  const products = useQuery(api.products.listProducts, { type: "product" });
  const transfer = useMutation(api.warehouseBins.transferStock);

  const [productId, setProductId] = useState<Id<"products"> | "">("");
  const [fromId, setFromId] = useState<Id<"warehouses"> | "">("");
  const [toId, setToId] = useState<Id<"warehouses"> | "">("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const activeWarehouses = warehouses?.filter((w) => w.isActive) ?? [];

  const handleTransfer = async () => {
    if (!productId) { toast.error("Select a product"); return; }
    if (!fromId) { toast.error("Select source warehouse"); return; }
    if (!toId) { toast.error("Select destination warehouse"); return; }
    if (fromId === toId) { toast.error("Source and destination must be different"); return; }
    const qty = Number(quantity);
    if (!qty || qty <= 0) { toast.error("Enter a valid quantity"); return; }

    setSaving(true);
    try {
      await transfer({
        productId: productId as Id<"products">,
        fromWarehouseId: fromId as Id<"warehouses">,
        toWarehouseId: toId as Id<"warehouses">,
        quantity: qty,
        notes: notes || undefined,
      });
      toast.success("Stock transferred successfully");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />Transfer Stock Between Warehouses
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={(v) => setProductId(v as Id<"products">)}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products?.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>From Warehouse *</Label>
              <Select value={fromId} onValueChange={(v) => setFromId(v as Id<"warehouses">)}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  {activeWarehouses.map((w) => (
                    <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>To Warehouse *</Label>
              <Select value={toId} onValueChange={(v) => setToId(v as Id<"warehouses">)}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>
                  {activeWarehouses.filter((w) => w._id !== fromId).map((w) => (
                    <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quantity *</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} placeholder="0" />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Reason for transfer..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleTransfer} disabled={saving}>{saving ? "Transferring..." : "Transfer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
