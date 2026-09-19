import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function ReadyToFulfill() {
  const readyOrders = useQuery(api.fulfillment.getReadyToFulfill, {});
  const warehouses = useQuery(api.products.listWarehouses);
  const createFulfillment = useMutation(api.fulfillment.create);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  if (!readyOrders) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (readyOrders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Package /></EmptyMedia>
          <EmptyTitle>No orders ready to fulfill</EmptyTitle>
          <EmptyDescription>
            Confirmed sales orders will appear here for fulfillment
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const handleCreate = async () => {
    if (!selectedOrder) return;
    setIsCreating(true);
    try {
      await createFulfillment({
        salesOrderId: selectedOrder as Id<"salesOrders">,
        priority,
        warehouseId: warehouseId ? (warehouseId as Id<"warehouses">) : undefined,
        notes: notes || undefined,
      });
      toast.success("Fulfillment order created");
      setDialogOpen(false);
      setSelectedOrder(null);
      setPriority("normal");
      setWarehouseId("");
      setNotes("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {readyOrders.length} order(s) ready for fulfillment
        </p>
      </div>

      <div className="space-y-3">
        {readyOrders.map((order) => (
          <Card key={order!._id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">{order!.orderNumber}</p>
                <p className="text-sm text-muted-foreground">{order!.customerName}</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Date: {order!.date}</span>
                  <span>Total: ${order!.totalAmount.toFixed(2)}</span>
                  <span>Fulfilled: {order!.fulfilledPercentage}%</span>
                </div>
              </div>
              <Dialog open={dialogOpen && selectedOrder === order!._id} onOpenChange={(open) => {
                setDialogOpen(open);
                if (open) setSelectedOrder(order!._id);
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="cursor-pointer">
                    <Plus className="w-4 h-4 mr-1" />Create Fulfillment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Fulfillment Order</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Sales Order: <strong>{order!.orderNumber}</strong> - {order!.customerName}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Warehouse</Label>
                      <Select value={warehouseId} onValueChange={setWarehouseId}>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No specific warehouse</SelectItem>
                          {(warehouses ?? []).map((w) => (
                            <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Special instructions..."
                      />
                    </div>

                    <Button
                      onClick={handleCreate}
                      disabled={isCreating}
                      className="w-full cursor-pointer"
                    >
                      {isCreating ? "Creating..." : "Create Fulfillment Order"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
