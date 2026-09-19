import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, Play, CheckCircle, XCircle, ClipboardList } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function WorkOrdersTab() {
  const orders = useQuery(api.assembly.listAssemblyOrders, {});
  const assemblies = useQuery(api.assembly.listAssemblies, {});
  const warehouses = useQuery(api.products.listWarehouses, {});
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const startOrder = useMutation(api.assembly.startAssemblyOrder);
  const completeOrder = useMutation(api.assembly.completeAssemblyOrder);
  const cancelOrder = useMutation(api.assembly.cancelAssemblyOrder);

  if (!orders || !assemblies || !warehouses) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const filteredOrders = statusFilter === "all"
    ? orders
    : orders.filter((o) => o.status === statusFilter);

  const statusColors: Record<string, string> = {
    planned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const handleStart = async (orderId: Id<"assemblyOrders">) => {
    try {
      await startOrder({ orderId });
      toast.success("Order started - components consumed from inventory");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start order");
    }
  };

  const handleComplete = async (orderId: Id<"assemblyOrders">) => {
    try {
      await completeOrder({ orderId });
      toast.success("Order completed - finished goods added to inventory");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete order");
    }
  };

  const handleCancel = async (orderId: Id<"assemblyOrders">) => {
    try {
      await cancelOrder({ orderId });
      toast.success("Order cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {["all", "planned", "in_progress", "completed", "cancelled"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "secondary"}
              className="cursor-pointer capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === "in_progress" ? "In Progress" : s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Create Work Order</Button>
          </DialogTrigger>
          <CreateWorkOrderDialog assemblies={assemblies} warehouses={warehouses} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {filteredOrders.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
            <EmptyTitle>No work orders</EmptyTitle>
            <EmptyDescription>Create a work order to start producing assembled goods</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Work Order</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Order #</th>
                <th className="text-left p-3 font-medium">Assembly</th>
                <th className="text-left p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">Warehouse</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.map((order) => (
                <tr key={order._id} className="hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{order.orderNumber}</td>
                  <td className="p-3">{order.assemblyName}</td>
                  <td className="p-3">{order.quantity}</td>
                  <td className="p-3">{order.warehouseName}</td>
                  <td className="p-3">
                    <Badge className={statusColors[order.status]}>
                      {order.status === "in_progress" ? "In Progress" : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {order.status === "planned" && (
                        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handleStart(order._id)}>
                          <Play className="w-3 h-3 mr-1" /> Start
                        </Button>
                      )}
                      {order.status === "in_progress" && (
                        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handleComplete(order._id)}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Complete
                        </Button>
                      )}
                      {(order.status === "planned" || order.status === "in_progress") && (
                        <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleCancel(order._id)}>
                          <XCircle className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type AssemblyOption = { _id: Id<"assemblies">; name: string; isActive: boolean };
type WarehouseOption = { _id: Id<"warehouses">; name: string; isActive: boolean };

function CreateWorkOrderDialog({
  assemblies,
  warehouses,
  onClose,
}: {
  assemblies: AssemblyOption[];
  warehouses: WarehouseOption[];
  onClose: () => void;
}) {
  const createOrder = useMutation(api.assembly.createAssemblyOrder);
  const [assemblyId, setAssemblyId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!assemblyId || !warehouseId) {
      toast.error("Select assembly and warehouse");
      return;
    }
    try {
      await createOrder({
        assemblyId: assemblyId as Id<"assemblies">,
        quantity: Number(quantity),
        warehouseId: warehouseId as Id<"warehouses">,
        notes: notes || undefined,
      });
      toast.success("Work order created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create order");
    }
  };

  const activeAssemblies = assemblies.filter((a) => a.isActive);
  const activeWarehouses = warehouses.filter((w) => w.isActive);

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Assembly</Label>
          <Select value={assemblyId} onValueChange={setAssemblyId}>
            <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select assembly" /></SelectTrigger>
            <SelectContent>
              {activeAssemblies.map((a) => (
                <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((w) => (
                  <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Order</Button>
      </div>
    </DialogContent>
  );
}
