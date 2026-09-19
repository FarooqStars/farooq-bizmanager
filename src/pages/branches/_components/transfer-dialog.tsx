import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Plus, Trash2 } from "lucide-react";

type TransferItem = {
  productId: Id<"products"> | "";
  quantity: number;
  notes: string;
};

export default function TransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const branches = useQuery(api.branches.listBranches, {});
  const warehouses = useQuery(api.products.listWarehouses, {});
  const products = useQuery(api.products.listProducts, {});
  const createTransfer = useMutation(api.branches.createTransfer);

  const [fromBranch, setFromBranch] = useState<Id<"branches"> | "">("");
  const [toBranch, setToBranch] = useState<Id<"branches"> | "">("");
  const [fromWarehouse, setFromWarehouse] = useState<Id<"warehouses"> | "">("");
  const [toWarehouse, setToWarehouse] = useState<Id<"warehouses"> | "">("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TransferItem[]>([{ productId: "", quantity: 1, notes: "" }]);
  const [submitting, setSubmitting] = useState(false);

  // Filter warehouses by branch
  const fromWarehouses = warehouses?.filter((w) => w.branchId === fromBranch && w.isActive) ?? [];
  const toWarehouses = warehouses?.filter((w) => w.branchId === toBranch && w.isActive) ?? [];

  const addItem = () => setItems([...items, { productId: "", quantity: 1, notes: "" }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: keyof TransferItem, value: string | number) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const handleSubmit = async () => {
    if (!fromBranch || !toBranch || !fromWarehouse || !toWarehouse) {
      toast.error(t("branches.transfers.selectBranches"));
      return;
    }
    const validItems = items.filter((item) => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error(t("branches.transfers.addItems"));
      return;
    }

    setSubmitting(true);
    try {
      await createTransfer({
        fromBranchId: fromBranch as Id<"branches">,
        toBranchId: toBranch as Id<"branches">,
        fromWarehouseId: fromWarehouse as Id<"warehouses">,
        toWarehouseId: toWarehouse as Id<"warehouses">,
        items: validItems.map((item) => ({
          productId: item.productId as Id<"products">,
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
        notes: notes || undefined,
      });
      toast.success(t("branches.transfers.created"));
      onOpenChange(false);
      // Reset form
      setFromBranch("");
      setToBranch("");
      setFromWarehouse("");
      setToWarehouse("");
      setNotes("");
      setItems([{ productId: "", quantity: 1, notes: "" }]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("branches.transfers.createFailed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("branches.transfers.create")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* From/To Branch */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branches.transfers.fromBranch")} *</Label>
              <Select value={fromBranch} onValueChange={(v) => { setFromBranch(v as Id<"branches">); setFromWarehouse(""); }}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder={t("branches.transfers.selectBranch")} /></SelectTrigger>
                <SelectContent>
                  {branches?.map((b) => (
                    <SelectItem key={b._id} value={b._id} className="cursor-pointer">{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("branches.transfers.toBranch")} *</Label>
              <Select value={toBranch} onValueChange={(v) => { setToBranch(v as Id<"branches">); setToWarehouse(""); }}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder={t("branches.transfers.selectBranch")} /></SelectTrigger>
                <SelectContent>
                  {branches?.filter((b) => b._id !== fromBranch).map((b) => (
                    <SelectItem key={b._id} value={b._id} className="cursor-pointer">{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* From/To Warehouse */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branches.transfers.fromWarehouse")} *</Label>
              <Select value={fromWarehouse} onValueChange={(v) => setFromWarehouse(v as Id<"warehouses">)} disabled={!fromBranch}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder={t("branches.transfers.selectWarehouse")} /></SelectTrigger>
                <SelectContent>
                  {fromWarehouses.map((w) => (
                    <SelectItem key={w._id} value={w._id} className="cursor-pointer">{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromBranch && fromWarehouses.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("branches.transfers.noWarehouses")}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("branches.transfers.toWarehouse")} *</Label>
              <Select value={toWarehouse} onValueChange={(v) => setToWarehouse(v as Id<"warehouses">)} disabled={!toBranch}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder={t("branches.transfers.selectWarehouse")} /></SelectTrigger>
                <SelectContent>
                  {toWarehouses.map((w) => (
                    <SelectItem key={w._id} value={w._id} className="cursor-pointer">{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toBranch && toWarehouses.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("branches.transfers.noWarehouses")}</p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("branches.transfers.items")} *</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 cursor-pointer text-xs" onClick={addItem}>
                <Plus className="mr-1 size-3" /> {t("branches.transfers.addItem")}
              </Button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select value={item.productId} onValueChange={(v) => updateItem(index, "productId", v)}>
                  <SelectTrigger className="flex-1 cursor-pointer">
                    <SelectValue placeholder={t("branches.transfers.selectProduct")} />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.filter((p) => p.isActive && p.type === "product").map((p) => (
                      <SelectItem key={p._id} value={p._id} className="cursor-pointer">
                        {p.name} {p.sku ? `(${p.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                  className="w-20"
                  placeholder="Qty"
                />
                {items.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" className="size-7 cursor-pointer p-0 text-destructive" onClick={() => removeItem(index)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{t("branches.transfers.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" className="cursor-pointer" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="cursor-pointer" disabled={submitting} onClick={handleSubmit}>
              {t("branches.transfers.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
