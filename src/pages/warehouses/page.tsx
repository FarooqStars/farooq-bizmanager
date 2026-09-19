import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  Warehouse, Plus, Pencil, MapPin, CheckCircle, XCircle,
  Package, ArrowRightLeft, Grid3X3, BarChart3, Eye
} from "lucide-react";
import { toast } from "sonner";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import BinManagement from "./_components/bin-management.tsx";
import WarehouseStockView from "./_components/warehouse-stock-view.tsx";
import StockTransferDialog from "./_components/stock-transfer-dialog.tsx";
import MovementHistory from "./_components/movement-history.tsx";
import { useFocusItem, focusElementId, FOCUS_RING_CLASS } from "@/hooks/use-focus-item.ts";
import { cn } from "@/lib/utils.ts";

// ─── Warehouse Dialog ────────────────────────────────────────

function WarehouseDialog({
  warehouse,
  onClose,
}: {
  warehouse?: Doc<"warehouses">;
  onClose: () => void;
}) {
  const createWarehouse = useMutation(api.products.createWarehouse);
  const updateWarehouse = useMutation(api.products.updateWarehouse);
  const [name, setName] = useState(warehouse?.name ?? "");
  const [address, setAddress] = useState(warehouse?.address ?? "");
  const [notes, setNotes] = useState(warehouse?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (warehouse) {
        await updateWarehouse({ warehouseId: warehouse._id, name, address: address || undefined, notes: notes || undefined });
        toast.success("Warehouse updated");
      } else {
        await createWarehouse({ name, address: address || undefined, notes: notes || undefined });
        toast.success("Warehouse created");
      }
      onClose();
    } catch {
      toast.error("Failed to save warehouse");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warehouse ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Warehouse" />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Storage St" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Warehouse Summary Card ──────────────────────────────────

function WarehouseSummaryCard({
  warehouse,
  isSelected,
  onSelect,
  onEdit,
  onToggleActive,
  canManage,
  focused,
}: {
  warehouse: Doc<"warehouses">;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  canManage: boolean;
  focused: boolean;
}) {
  const summary = useQuery(api.warehouseBins.getWarehouseSummary, { warehouseId: warehouse._id });

  return (
    <Card
      id={focusElementId(warehouse._id)}
      className={cn(
        "cursor-pointer transition-all",
        isSelected ? "ring-2 ring-primary" : "hover:shadow-md",
        !warehouse.isActive && "opacity-60",
        focused && FOCUS_RING_CLASS,
      )}
      onClick={onSelect}
    >
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{warehouse.name}</p>
            {warehouse.address && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{warehouse.address}</span>
              </p>
            )}
          </div>
          <Badge variant={warehouse.isActive ? "default" : "secondary"}>
            {warehouse.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <p className="text-lg font-bold">{summary.totalProducts}</p>
              <p className="text-xs text-muted-foreground">Products</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{summary.totalQty.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Qty</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{summary.totalBins}</p>
              <p className="text-xs text-muted-foreground">Bins</p>
            </div>
          </div>
        )}

        {summary && summary.zones.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {summary.zones.map((z) => (
              <Badge key={z} variant="secondary" className="text-xs">{z}</Badge>
            ))}
          </div>
        )}

        {canManage && (
          <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="w-3 h-3 mr-1" />Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onToggleActive}>
              {warehouse.isActive ? <><XCircle className="w-3 h-3 mr-1" />Deactivate</> : <><CheckCircle className="w-3 h-3 mr-1" />Activate</>}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function WarehousesPage() {
  const warehouses = useQuery(api.products.listWarehouses);
  const updateWarehouse = useMutation(api.products.updateWarehouse);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { focusId, isFocused } = useFocusItem();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Doc<"warehouses"> | null>(null);
  const [selectedId, setSelectedId] = useState<Id<"warehouses"> | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  const selectedWarehouse = warehouses?.find((w) => w._id === selectedId) ?? null;

  // Auto-select the warehouse when arriving from global search.
  useEffect(() => {
    if (focusId && warehouses?.some((w) => w._id === focusId)) {
      setSelectedId(focusId as Id<"warehouses">);
      setActiveTab("overview");
    }
  }, [focusId, warehouses]);

  const toggleActive = async (w: Doc<"warehouses">) => {
    try {
      await updateWarehouse({ warehouseId: w._id, isActive: !w.isActive });
      toast.success(w.isActive ? "Warehouse deactivated" : "Warehouse activated");
    } catch {
      toast.error("Failed to update");
    }
  };

  if (warehouses === undefined || currentUser === undefined) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Warehouse className="w-6 h-6" /> Warehouses & Locations
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage storage locations, bins, racks, shelves, and stock levels
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && warehouses.length >= 2 && (
            <Button variant="secondary" onClick={() => setShowTransfer(true)}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />Transfer Stock
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Warehouse
            </Button>
          )}
        </div>
      </div>

      {warehouses.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Warehouse /></EmptyMedia>
            <EmptyTitle>No warehouses yet</EmptyTitle>
            <EmptyDescription>Add your first storage location to start tracking inventory by location</EmptyDescription>
          </EmptyHeader>
          {canManage && <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Add Warehouse</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Warehouse List Sidebar */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Locations ({warehouses.length})
            </p>
            <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {warehouses.map((w) => (
                <WarehouseSummaryCard
                  key={w._id}
                  warehouse={w}
                  isSelected={selectedId === w._id}
                  onSelect={() => { setSelectedId(w._id); setActiveTab("overview"); }}
                  onEdit={() => setEditing(w)}
                  onToggleActive={() => toggleActive(w)}
                  canManage={canManage}
                  focused={isFocused(w._id)}
                />
              ))}
            </div>
          </div>

          {/* Detail Panel */}
          <div className="min-w-0">
            {selectedWarehouse ? (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Warehouse className="w-5 h-5" />
                      {selectedWarehouse.name}
                    </CardTitle>
                    <Badge variant={selectedWarehouse.isActive ? "default" : "secondary"}>
                      {selectedWarehouse.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {selectedWarehouse.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{selectedWarehouse.address}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full justify-start mb-4 overflow-x-auto">
                      <TabsTrigger value="overview" className="cursor-pointer">
                        <BarChart3 className="w-4 h-4 mr-1" />Overview
                      </TabsTrigger>
                      <TabsTrigger value="bins" className="cursor-pointer">
                        <Grid3X3 className="w-4 h-4 mr-1" />Bins & Locations
                      </TabsTrigger>
                      <TabsTrigger value="stock" className="cursor-pointer">
                        <Package className="w-4 h-4 mr-1" />Stock Levels
                      </TabsTrigger>
                      <TabsTrigger value="movements" className="cursor-pointer">
                        <Eye className="w-4 h-4 mr-1" />Movements
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview">
                      <WarehouseOverview warehouseId={selectedWarehouse._id} />
                    </TabsContent>
                    <TabsContent value="bins">
                      <BinManagement warehouseId={selectedWarehouse._id} canManage={canManage} />
                    </TabsContent>
                    <TabsContent value="stock">
                      <WarehouseStockView warehouseId={selectedWarehouse._id} />
                    </TabsContent>
                    <TabsContent value="movements">
                      <MovementHistory warehouseId={selectedWarehouse._id} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex items-center justify-center min-h-[400px]">
                <CardContent className="text-center">
                  <Warehouse className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Select a warehouse to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {showAdd && <WarehouseDialog onClose={() => setShowAdd(false)} />}
      {editing && <WarehouseDialog warehouse={editing} onClose={() => setEditing(null)} />}
      {showTransfer && <StockTransferDialog onClose={() => setShowTransfer(false)} />}
    </div>
  );
}

// ─── Warehouse Overview Tab ──────────────────────────────────

function WarehouseOverview({ warehouseId }: { warehouseId: Id<"warehouses"> }) {
  const summary = useQuery(api.warehouseBins.getWarehouseSummary, { warehouseId });
  const movements = useQuery(api.stockMovements.listMovements, { warehouseId, limit: 5 });

  if (!summary) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{summary.totalProducts}</p>
          <p className="text-sm text-muted-foreground truncate">Products</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{summary.totalQty.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground truncate">Total Units</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{summary.totalBins}</p>
          <p className="text-sm text-muted-foreground truncate">Bin Locations</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{summary.zones.length}</p>
          <p className="text-sm text-muted-foreground truncate">Zones</p>
        </div>
      </div>

      {/* Zones */}
      {summary.zones.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Zones</p>
          <div className="flex flex-wrap gap-2">
            {summary.zones.map((z) => (
              <Badge key={z} variant="secondary">{z}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recent Movements */}
      {movements && movements.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Recent Activity</p>
          <div className="space-y-2">
            {movements.map((m) => (
              <div key={m._id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge variant={m.type === "in" ? "default" : "secondary"} className="text-xs">
                    {m.type === "in" ? "IN" : "OUT"}
                  </Badge>
                  <span className="truncate">{m.productName}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{m.type === "in" ? "+" : "-"}{m.quantity}</span>
                  <span className="text-xs">{new Date(m.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
