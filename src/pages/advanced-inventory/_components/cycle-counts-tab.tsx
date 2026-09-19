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
import { Plus, ClipboardCheck, Play, CheckCircle, XCircle, Save } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";

export default function CycleCountsTab() {
  const counts = useQuery(api.advancedInventory.listCycleCounts, {});
  const warehouses = useQuery(api.products.listWarehouses, {});
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCount, setSelectedCount] = useState<Id<"cycleCounts"> | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const startCount = useMutation(api.advancedInventory.startCycleCount);
  const completeCount = useMutation(api.advancedInventory.completeCycleCount);
  const cancelCount = useMutation(api.advancedInventory.cancelCycleCount);

  if (!counts || !warehouses) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const filteredCounts = statusFilter === "all"
    ? counts
    : counts.filter((c) => c.status === statusFilter);

  const statusColors: Record<string, string> = {
    planned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  if (selectedCount) {
    return <CycleCountDetail countId={selectedCount} onBack={() => setSelectedCount(null)} />;
  }

  const handleStart = async (countId: Id<"cycleCounts">) => {
    try {
      await startCount({ cycleCountId: countId });
      toast.success("Cycle count started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start");
    }
  };

  const handleComplete = async (countId: Id<"cycleCounts">) => {
    try {
      await completeCount({ cycleCountId: countId, adjustInventory: true });
      toast.success("Cycle count completed with inventory adjustments");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete");
    }
  };

  const handleCancel = async (countId: Id<"cycleCounts">) => {
    try {
      await cancelCount({ cycleCountId: countId });
      toast.success("Cycle count cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
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
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Schedule Count</Button>
          </DialogTrigger>
          <CreateCycleCountDialog warehouses={warehouses} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {filteredCounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardCheck /></EmptyMedia>
            <EmptyTitle>No cycle counts</EmptyTitle>
            <EmptyDescription>Schedule regular cycle counts to verify physical inventory matches your records</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Schedule Count</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Count #</th>
                <th className="text-left p-3 font-medium">Warehouse</th>
                <th className="text-left p-3 font-medium">Scheduled</th>
                <th className="text-left p-3 font-medium">Progress</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCounts.map((count) => (
                <tr key={count._id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedCount(count._id)}>
                  <td className="p-3 font-mono text-xs">{count.countNumber}</td>
                  <td className="p-3">{count.warehouseName}</td>
                  <td className="p-3 text-xs">{format(new Date(count.scheduledDate), "MMM dd, yyyy")}</td>
                  <td className="p-3">
                    <span className="text-xs">{count.countedItems}/{count.totalItems} items</span>
                  </td>
                  <td className="p-3">
                    <Badge className={statusColors[count.status]}>
                      {count.status === "in_progress" ? "In Progress" : count.status.charAt(0).toUpperCase() + count.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {count.status === "planned" && (
                        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handleStart(count._id)}>
                          <Play className="w-3 h-3 mr-1" /> Start
                        </Button>
                      )}
                      {count.status === "in_progress" && count.countedItems === count.totalItems && (
                        <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handleComplete(count._id)}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Complete
                        </Button>
                      )}
                      {(count.status === "planned" || count.status === "in_progress") && (
                        <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleCancel(count._id)}>
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

function CycleCountDetail({ countId, onBack }: { countId: Id<"cycleCounts">; onBack: () => void }) {
  const count = useQuery(api.advancedInventory.getCycleCount, { cycleCountId: countId });
  const recordCount = useMutation(api.advancedInventory.recordCount);
  const [editingItem, setEditingItem] = useState<Id<"cycleCountItems"> | null>(null);
  const [countedQty, setCountedQty] = useState("");

  if (!count) {
    return <Skeleton className="h-64 w-full" />;
  }

  const handleSaveCount = async (itemId: Id<"cycleCountItems">) => {
    try {
      await recordCount({ itemId, countedQuantity: Number(countedQty) });
      setEditingItem(null);
      setCountedQty("");
      toast.success("Count recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{count.countNumber}</h3>
          <p className="text-sm text-muted-foreground">{count.warehouseName} - {format(new Date(count.scheduledDate), "MMM dd, yyyy")}</p>
        </div>
        <Button variant="secondary" className="cursor-pointer" onClick={onBack}>Back to List</Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Product</th>
              <th className="text-right p-3 font-medium">Expected</th>
              <th className="text-right p-3 font-medium">Counted</th>
              <th className="text-right p-3 font-medium">Variance</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {count.items.map((item) => (
              <tr key={item._id} className="hover:bg-muted/30">
                <td className="p-3">
                  <span className="font-medium">{item.productName}</span>
                  {item.productSku && <span className="text-xs text-muted-foreground ml-2">{item.productSku}</span>}
                </td>
                <td className="p-3 text-right">{item.expectedQuantity}</td>
                <td className="p-3 text-right">
                  {editingItem === item._id ? (
                    <Input
                      type="number"
                      min="0"
                      value={countedQty}
                      onChange={(e) => setCountedQty(e.target.value)}
                      className="w-24 ml-auto text-right"
                      autoFocus
                    />
                  ) : (
                    item.countedQuantity !== undefined ? item.countedQuantity : "—"
                  )}
                </td>
                <td className="p-3 text-right">
                  {item.variance !== undefined && item.variance !== null ? (
                    <span className={item.variance > 0 ? "text-green-600" : item.variance < 0 ? "text-red-600" : ""}>
                      {item.variance > 0 ? "+" : ""}{item.variance}
                    </span>
                  ) : "—"}
                </td>
                <td className="p-3 text-right">
                  {count.status === "in_progress" && (
                    editingItem === item._id ? (
                      <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => handleSaveCount(item._id)}>
                        <Save className="w-3 h-3 mr-1" /> Save
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer"
                        onClick={() => {
                          setEditingItem(item._id);
                          setCountedQty(item.countedQuantity?.toString() ?? "");
                        }}
                      >
                        Count
                      </Button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateCycleCountDialog({ warehouses, onClose }: { warehouses: Array<{ _id: Id<"warehouses">; name: string }>; onClose: () => void }) {
  const createCycleCount = useMutation(api.advancedInventory.createCycleCount);
  const [warehouseId, setWarehouseId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!warehouseId || !scheduledDate) {
      toast.error("Warehouse and date are required");
      return;
    }
    try {
      await createCycleCount({
        warehouseId: warehouseId as Id<"warehouses">,
        scheduledDate: new Date(scheduledDate).toISOString(),
        notes: notes || undefined,
      });
      toast.success("Cycle count scheduled");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Schedule Cycle Count</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Warehouse</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Scheduled Date</Label>
          <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes about this count" rows={2} />
        </div>
        <p className="text-xs text-muted-foreground">All products with stock in this warehouse will be included automatically.</p>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Schedule Count</Button>
      </div>
    </DialogContent>
  );
}
