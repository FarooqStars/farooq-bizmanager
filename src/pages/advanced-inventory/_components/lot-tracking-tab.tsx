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
import { Plus, Tag, Calendar } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";
import { useCurrency } from "@/hooks/use-currency.ts";

export default function LotTrackingTab() {
  const { fmt } = useCurrency();
  const lots = useQuery(api.advancedInventory.listLots, {});
  const products = useQuery(api.products.listProducts, { type: "product" });
  const warehouses = useQuery(api.products.listWarehouses, {});
  const bins = useQuery(api.advancedInventory.listBins, {});
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const updateStatus = useMutation(api.advancedInventory.updateLotStatus);

  if (!lots || !products || !warehouses || !bins) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const filteredLots = statusFilter === "all"
    ? lots
    : lots.filter((l) => l.status === statusFilter);

  const statusColors: Record<string, string> = {
    available: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    reserved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    expired: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    consumed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  };

  const handleStatusChange = async (lotId: Id<"lotNumbers">, newStatus: "available" | "reserved" | "expired" | "consumed") => {
    try {
      await updateStatus({ lotId, status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {["all", "available", "reserved", "expired", "consumed"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "secondary"}
              className="cursor-pointer capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Add Lot</Button>
          </DialogTrigger>
          <CreateLotDialog products={products} warehouses={warehouses} bins={bins} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      {filteredLots.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Tag /></EmptyMedia>
            <EmptyTitle>No lot/serial records</EmptyTitle>
            <EmptyDescription>Track inventory by lot number and serial number for traceability and FIFO costing</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Add Lot</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Lot #</th>
                <th className="text-left p-3 font-medium">Serial #</th>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">Warehouse</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-right p-3 font-medium">Cost/Unit</th>
                <th className="text-left p-3 font-medium">Expiry</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLots.map((lot) => (
                <tr key={lot._id} className="hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{lot.lotNumber}</td>
                  <td className="p-3 font-mono text-xs">{lot.serialNumber || "—"}</td>
                  <td className="p-3 truncate max-w-[150px]">{lot.productName}</td>
                  <td className="p-3">{lot.warehouseName}</td>
                  <td className="p-3 text-right">{lot.quantity}</td>
                  <td className="p-3 text-right">{lot.costPerUnit ? fmt(lot.costPerUnit) : "—"}</td>
                  <td className="p-3">
                    {lot.expiryDate ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(lot.expiryDate), "MMM dd, yyyy")}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="p-3">
                    <Badge className={statusColors[lot.status]}>
                      {lot.status.charAt(0).toUpperCase() + lot.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Select
                      value={lot.status}
                      onValueChange={(v) => handleStatusChange(lot._id, v as "available" | "reserved" | "expired" | "consumed")}
                    >
                      <SelectTrigger className="w-28 h-7 text-xs cursor-pointer"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="reserved">Reserved</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="consumed">Consumed</SelectItem>
                      </SelectContent>
                    </Select>
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

type ProductOption = { _id: Id<"products">; name: string; sku?: string };
type WarehouseOption = { _id: Id<"warehouses">; name: string };
type BinOption = { _id: Id<"warehouseBins">; label: string; warehouseId: Id<"warehouses"> };

function CreateLotDialog({
  products,
  warehouses,
  bins,
  onClose,
}: {
  products: ProductOption[];
  warehouses: WarehouseOption[];
  bins: BinOption[];
  onClose: () => void;
}) {
  const createLot = useMutation(api.advancedInventory.createLot);
  const [productId, setProductId] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [binId, setBinId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [manufacturedDate, setManufacturedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");

  const filteredBins = warehouseId
    ? bins.filter((b) => b.warehouseId === warehouseId)
    : [];

  const handleSubmit = async () => {
    if (!productId || !lotNumber || !warehouseId || !quantity) {
      toast.error("Product, lot number, warehouse, and quantity are required");
      return;
    }
    try {
      await createLot({
        productId: productId as Id<"products">,
        lotNumber,
        serialNumber: serialNumber || undefined,
        warehouseId: warehouseId as Id<"warehouses">,
        binId: binId ? (binId as Id<"warehouseBins">) : undefined,
        quantity: Number(quantity),
        costPerUnit: costPerUnit ? Number(costPerUnit) : undefined,
        manufacturedDate: manufacturedDate || undefined,
        expiryDate: expiryDate || undefined,
        notes: notes || undefined,
      });
      toast.success("Lot record created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create lot");
    }
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Add Lot / Serial Number</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Product</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p._id} value={p._id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Lot Number</Label>
            <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="e.g. LOT-2024-001" />
          </div>
          <div className="space-y-1">
            <Label>Serial Number</Label>
            <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={(v) => { setWarehouseId(v); setBinId(""); }}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Bin Location</Label>
            <Select value={binId} onValueChange={setBinId} disabled={filteredBins.length === 0}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder={filteredBins.length === 0 ? "No bins" : "Select bin"} /></SelectTrigger>
              <SelectContent>
                {filteredBins.map((b) => (
                  <SelectItem key={b._id} value={b._id}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cost per Unit</Label>
            <Input type="number" min="0" step="0.01" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Manufactured Date</Label>
            <Input type="date" value={manufacturedDate} onChange={(e) => setManufacturedDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
        </div>
        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Lot Record</Button>
      </div>
    </DialogContent>
  );
}
