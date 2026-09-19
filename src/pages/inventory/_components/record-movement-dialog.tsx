import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const movementSchema = z.object({
  productId: z.string().min(1, "Select a product"),
  warehouseId: z.string().min(1, "Select a warehouse"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  reason: z.enum(["purchase", "sale", "return", "transfer", "adjustment", "damage", "other"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type MovementFormData = z.infer<typeof movementSchema>;

type Props = {
  defaultType?: "in" | "out";
  onClose: () => void;
};

export default function RecordMovementDialog({ defaultType = "in", onClose }: Props) {
  const products = useQuery(api.products.listProducts, {});
  const warehouses = useQuery(api.products.listWarehouses);
  const recordMovement = useMutation(api.stockMovements.recordMovement);
  const [type, setType] = useState<"in" | "out">(defaultType);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<MovementFormData>({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      productId: "",
      warehouseId: "",
      quantity: 1,
      reason: defaultType === "in" ? "purchase" : "sale",
      reference: "",
      notes: "",
    },
  });

  const onSubmit = async (data: MovementFormData) => {
    setSaving(true);
    try {
      const result = await recordMovement({
        productId: data.productId as Id<"products">,
        warehouseId: data.warehouseId as Id<"warehouses">,
        type,
        quantity: data.quantity,
        reason: data.reason,
        reference: data.reference || undefined,
        notes: data.notes || undefined,
      });
      toast.success(`Stock ${type === "in" ? "received" : "issued"} — new level: ${result.newQty}`);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record movement";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!products || !warehouses) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent><Skeleton className="h-48 w-full" /></DialogContent>
      </Dialog>
    );
  }

  const productItems = products.filter((p) => p.type === "product");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "in" ? (
              <><ArrowDownToLine className="w-5 h-5 text-green-500" /> Stock In</>
            ) : (
              <><ArrowUpFromLine className="w-5 h-5 text-red-500" /> Stock Out</>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Type toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            type="button"
            onClick={() => { setType("in"); setValue("reason", "purchase"); }}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              type === "in" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "hover:bg-muted"
            }`}
          >
            <ArrowDownToLine className="w-4 h-4 inline mr-1.5" />Stock In
          </button>
          <button
            type="button"
            onClick={() => { setType("out"); setValue("reason", "sale"); }}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              type === "out" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" : "hover:bg-muted"
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4 inline mr-1.5" />Stock Out
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Product *</Label>
            <Select value={watch("productId")} onValueChange={(v) => setValue("productId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {productItems.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.productId && <p className="text-xs text-destructive mt-1">{errors.productId.message}</p>}
          </div>

          <div>
            <Label>Warehouse *</Label>
            <Select value={watch("warehouseId")} onValueChange={(v) => setValue("warehouseId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.warehouseId && <p className="text-xs text-destructive mt-1">{errors.warehouseId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                min={1}
                {...register("quantity", { valueAsNumber: true })}
              />
              {errors.quantity && <p className="text-xs text-destructive mt-1">{errors.quantity.message}</p>}
            </div>
            <div>
              <Label>Reason *</Label>
              <Select value={watch("reason")} onValueChange={(v) => setValue("reason", v as MovementFormData["reason"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {type === "in" ? (
                    <>
                      <SelectItem value="purchase">Purchase</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                      <SelectItem value="transfer">Transfer In</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="sale">Sale</SelectItem>
                      <SelectItem value="transfer">Transfer Out</SelectItem>
                      <SelectItem value="damage">Damage</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Reference</Label>
            <Input {...register("reference")} placeholder="PO#, Invoice#, etc." />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea {...register("notes")} placeholder="Optional notes..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">
              {saving ? "Recording..." : `Record ${type === "in" ? "Stock In" : "Stock Out"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
