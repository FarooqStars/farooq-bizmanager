import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { Plus, Ship, Eye, Trash2, Check } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const METHOD_LABELS: Record<string, string> = {
  by_value: "By Value (proportional to item cost)",
  by_quantity: "By Quantity (proportional to quantity)",
  by_weight: "By Weight (equal if no weight)",
  equal: "Equal (split evenly)",
};

export default function LandedCostTab() {
  const landedCosts = useQuery(api.landedCost.listLandedCosts, {});
  const purchaseOrders = useQuery(api.landedCost.listReceivedPurchaseOrders);
  const createLC = useMutation(api.landedCost.createLandedCost);
  const applyLC = useMutation(api.landedCost.applyLandedCost);
  const deleteLC = useMutation(api.landedCost.deleteLandedCost);

  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  if (!landedCosts || !purchaseOrders) return <Skeleton className="h-60 w-full" />;

  if (landedCosts.length === 0 && !showCreate) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> New Landed Cost
          </Button>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Ship /></EmptyMedia>
            <EmptyTitle>No landed costs</EmptyTitle>
            <EmptyDescription>
              Allocate shipping, customs, and other costs to purchase order items to get accurate product costs
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">Create Landed Cost</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> New Landed Cost
        </Button>
      </div>

      {/* Landed Cost list */}
      <div className="space-y-2">
        {landedCosts.map((lc) => (
          <Card key={lc._id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium">{lc.lcNumber}</p>
                    <p className="text-sm text-muted-foreground">PO: {lc.poNumber}</p>
                  </div>
                  <Badge variant={lc.status === "applied" ? "default" : "secondary"}>
                    {lc.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{lc.date}</span>
                  <Badge variant="secondary" className="text-xs">
                    {METHOD_LABELS[lc.allocationMethod]?.split(" (")[0] ?? lc.allocationMethod}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">${lc.totalLandedCost.toFixed(2)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setViewId(lc._id)} className="cursor-pointer">
                    <Eye className="w-3 h-3" />
                  </Button>
                  {lc.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await applyLC({ id: lc._id as Id<"landedCosts"> });
                            toast.success("Landed cost applied");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to apply");
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <Check className="w-3 h-3 mr-1" /> Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await deleteLC({ id: lc._id as Id<"landedCosts"> });
                            toast.success("Landed cost deleted");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to delete");
                          }
                        }}
                        className="cursor-pointer text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {/* Cost breakdown */}
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                {lc.shippingCost > 0 && <span>Shipping: ${lc.shippingCost.toFixed(2)}</span>}
                {lc.customsDuty > 0 && <span>Customs: ${lc.customsDuty.toFixed(2)}</span>}
                {lc.insuranceCost > 0 && <span>Insurance: ${lc.insuranceCost.toFixed(2)}</span>}
                {lc.handlingCost > 0 && <span>Handling: ${lc.handlingCost.toFixed(2)}</span>}
                {lc.otherCosts > 0 && <span>Other: ${lc.otherCosts.toFixed(2)}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <CreateLandedCostDialog
          purchaseOrders={purchaseOrders}
          onCreate={createLC}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* View detail dialog */}
      {viewId && (
        <LandedCostDetailDialog id={viewId as Id<"landedCosts">} onClose={() => setViewId(null)} />
      )}
    </div>
  );
}

// ─── Create Landed Cost Dialog ───────────────────────────────

function CreateLandedCostDialog({
  purchaseOrders,
  onCreate,
  onClose,
}: {
  purchaseOrders: Array<{ _id: string; poNumber: string; vendorName: string; totalAmount: number }>;
  onCreate: (args: {
    purchaseOrderId: Id<"purchaseOrders">;
    date: string;
    shippingCost: number;
    customsDuty: number;
    insuranceCost: number;
    handlingCost: number;
    otherCosts: number;
    allocationMethod: "by_value" | "by_quantity" | "by_weight" | "equal";
    notes?: string;
  }) => Promise<Id<"landedCosts">>;
  onClose: () => void;
}) {
  const [poId, setPoId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [shipping, setShipping] = useState(0);
  const [customs, setCustoms] = useState(0);
  const [insurance, setInsurance] = useState(0);
  const [handling, setHandling] = useState(0);
  const [other, setOther] = useState(0);
  const [method, setMethod] = useState<"by_value" | "by_quantity" | "by_weight" | "equal">("by_value");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = shipping + customs + insurance + handling + other;

  const handleSubmit = async () => {
    if (!poId) {
      toast.error("Please select a purchase order");
      return;
    }
    if (total <= 0) {
      toast.error("Total landed cost must be positive");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        purchaseOrderId: poId as Id<"purchaseOrders">,
        date,
        shippingCost: shipping,
        customsDuty: customs,
        insuranceCost: insurance,
        handlingCost: handling,
        otherCosts: other,
        allocationMethod: method,
        notes: notes || undefined,
      });
      toast.success("Landed cost created with allocations");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create landed cost");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Landed Cost Allocation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Purchase Order *</Label>
            <Select value={poId} onValueChange={setPoId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select PO" /></SelectTrigger>
              <SelectContent>
                {purchaseOrders.length === 0 ? (
                  <SelectItem value="none" disabled className="cursor-pointer">No received POs available</SelectItem>
                ) : (
                  purchaseOrders.map((po) => (
                    <SelectItem key={po._id} value={po._id} className="cursor-pointer">
                      {po.poNumber} — {po.vendorName} (${po.totalAmount.toFixed(2)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Allocation Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="by_value" className="cursor-pointer">By Value</SelectItem>
                  <SelectItem value="by_quantity" className="cursor-pointer">By Quantity</SelectItem>
                  <SelectItem value="by_weight" className="cursor-pointer">By Weight</SelectItem>
                  <SelectItem value="equal" className="cursor-pointer">Equal Split</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="font-semibold">Cost Components</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Shipping / Freight</Label>
                <Input type="number" min={0} step={0.01} value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Customs Duty</Label>
                <Input type="number" min={0} step={0.01} value={customs} onChange={(e) => setCustoms(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Insurance</Label>
                <Input type="number" min={0} step={0.01} value={insurance} onChange={(e) => setInsurance(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Handling</Label>
                <Input type="number" min={0} step={0.01} value={handling} onChange={(e) => setHandling(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Other Costs</Label>
                <Input type="number" min={0} step={0.01} value={other} onChange={(e) => setOther(Number(e.target.value) || 0)} />
              </div>
              <div className="flex items-end">
                <div className="p-2 bg-primary/10 rounded w-full text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold text-primary">${total.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="cursor-pointer">
            {isSubmitting ? "Creating..." : "Create & Allocate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Landed Cost Detail Dialog ───────────────────────────────

function LandedCostDetailDialog({ id, onClose }: { id: Id<"landedCosts">; onClose: () => void }) {
  const lc = useQuery(api.landedCost.getLandedCost, { id });

  if (!lc) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lc.lcNumber} — Cost Allocation Detail</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><span className="text-muted-foreground">PO:</span> {lc.poNumber}</div>
            <div><span className="text-muted-foreground">Date:</span> {lc.date}</div>
            <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">${lc.totalLandedCost.toFixed(2)}</span></div>
          </div>

          {/* Allocations table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Item</th>
                  <th className="text-right p-2 font-medium">Original Cost</th>
                  <th className="text-right p-2 font-medium">Allocated</th>
                  <th className="text-right p-2 font-medium">New Unit Cost</th>
                </tr>
              </thead>
              <tbody>
                {lc.allocations.map((alloc) => (
                  <tr key={alloc._id} className="border-t">
                    <td className="p-2">{alloc.productName}</td>
                    <td className="p-2 text-right">${alloc.originalCost.toFixed(2)}</td>
                    <td className="p-2 text-right text-primary font-medium">+${alloc.allocatedAmount.toFixed(2)}</td>
                    <td className="p-2 text-right font-semibold">${alloc.newUnitCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lc.notes && (
            <p className="text-sm text-muted-foreground">{lc.notes}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
