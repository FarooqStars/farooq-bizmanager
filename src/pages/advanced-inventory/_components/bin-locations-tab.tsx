import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, MapPin, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function BinLocationsTab() {
  const bins = useQuery(api.advancedInventory.listBins, {});
  const warehouses = useQuery(api.products.listWarehouses, {});
  const [showCreate, setShowCreate] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");

  const deleteBin = useMutation(api.advancedInventory.deleteBin);

  if (!bins || !warehouses) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const filteredBins = warehouseFilter === "all"
    ? bins
    : bins.filter((b) => b.warehouseId === warehouseFilter);

  const handleDelete = async (binId: Id<"warehouseBins">) => {
    try {
      await deleteBin({ binId });
      toast.success("Bin deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-48 cursor-pointer"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Add Bin Location</Button>
          </DialogTrigger>
          <CreateBinDialog warehouses={warehouses} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {filteredBins.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><MapPin /></EmptyMedia>
            <EmptyTitle>No bin locations</EmptyTitle>
            <EmptyDescription>Define zones, rows, shelves, and bins within your warehouses for precise item location</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Add Bin Location</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Label</th>
                <th className="text-left p-3 font-medium">Warehouse</th>
                <th className="text-left p-3 font-medium">Zone</th>
                <th className="text-left p-3 font-medium">Row</th>
                <th className="text-left p-3 font-medium">Shelf</th>
                <th className="text-left p-3 font-medium">Bin</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredBins.map((bin) => (
                <tr key={bin._id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{bin.label}</td>
                  <td className="p-3">{bin.warehouseName}</td>
                  <td className="p-3">{bin.zone || "—"}</td>
                  <td className="p-3">{bin.row || "—"}</td>
                  <td className="p-3">{bin.shelf || "—"}</td>
                  <td className="p-3 font-mono">{bin.bin}</td>
                  <td className="p-3">
                    <Badge variant={bin.isActive ? "default" : "secondary"}>
                      {bin.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleDelete(bin._id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
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

function CreateBinDialog({ warehouses, onClose }: { warehouses: Array<{ _id: Id<"warehouses">; name: string }>; onClose: () => void }) {
  const createBin = useMutation(api.advancedInventory.createBin);
  const [warehouseId, setWarehouseId] = useState("");
  const [zone, setZone] = useState("");
  const [row, setRow] = useState("");
  const [shelf, setShelf] = useState("");
  const [bin, setBin] = useState("");
  const [label, setLabel] = useState("");

  const handleSubmit = async () => {
    if (!warehouseId || !bin || !label) {
      toast.error("Warehouse, bin code, and label are required");
      return;
    }
    try {
      await createBin({
        warehouseId: warehouseId as Id<"warehouses">,
        zone: zone || undefined,
        row: row || undefined,
        shelf: shelf || undefined,
        bin,
        label,
      });
      toast.success("Bin location created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bin");
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add Bin Location</DialogTitle></DialogHeader>
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
          <Label>Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Zone A - Row 1 - Shelf 3 - Bin 2" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Zone</Label>
            <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. A" />
          </div>
          <div className="space-y-1">
            <Label>Row</Label>
            <Input value={row} onChange={(e) => setRow(e.target.value)} placeholder="e.g. 1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Shelf</Label>
            <Input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="e.g. 3" />
          </div>
          <div className="space-y-1">
            <Label>Bin Code</Label>
            <Input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="e.g. B02" />
          </div>
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Bin</Button>
      </div>
    </DialogContent>
  );
}
