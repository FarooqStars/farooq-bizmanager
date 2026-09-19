import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  Truck, Plus, Pencil, Trash2, Wrench, Fuel, Eye,
  CheckCircle2, AlertTriangle, XCircle, DollarSign, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { useFocusItem, focusElementId, FOCUS_RING_CLASS } from "@/hooks/use-focus-item.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig = {
  active: { label: "Active", icon: CheckCircle2, class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  in_maintenance: { label: "In Maintenance", icon: AlertTriangle, class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  retired: { label: "Retired", icon: XCircle, class: "bg-muted text-muted-foreground" },
};

type VehicleStatus = "active" | "in_maintenance" | "retired";
type VehicleWithUser = Doc<"vehicles"> & { assignedUser: Doc<"users"> | null };

// ── Vehicle Form Dialog ────────────────────────────────────────────────────────

function VehicleDialog({ vehicle, onClose }: { vehicle?: VehicleWithUser; onClose: () => void }) {
  const createVehicle = useMutation(api.vehicles.createVehicle);
  const updateVehicle = useMutation(api.vehicles.updateVehicle);
  const users = useQuery(api.users.listUsers);

  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : "");
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [vin, setVin] = useState(vehicle?.vin ?? "");
  const [color, setColor] = useState(vehicle?.color ?? "");
  const [status, setStatus] = useState<VehicleStatus>(vehicle?.status ?? "active");
  const [assignedTo, setAssignedTo] = useState(vehicle?.assignedTo ?? "none");
  const [notes, setNotes] = useState(vehicle?.notes ?? "");
  const [purchasePrice, setPurchasePrice] = useState(vehicle?.purchasePrice ? String(vehicle.purchasePrice) : "");
  const [purchaseDate, setPurchaseDate] = useState(vehicle?.purchaseDate ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!make.trim() || !model.trim() || !plate.trim()) { toast.error("Make, model, and plate are required"); return; }
    const yr = parseInt(year);
    if (isNaN(yr) || yr < 1900 || yr > new Date().getFullYear() + 2) { toast.error("Enter a valid year"); return; }
    setSaving(true);
    try {
      const data = {
        make: make.trim(), model: model.trim(), year: yr, plate: plate.trim(),
        vin: vin.trim() || undefined, color: color.trim() || undefined,
        notes: notes.trim() || undefined,
        assignedTo: assignedTo !== "none" ? assignedTo as Id<"users"> : undefined,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) || undefined : undefined,
        purchaseDate: purchaseDate || undefined,
      };
      if (vehicle) {
        await updateVehicle({ vehicleId: vehicle._id, ...data, status });
        toast.success("Vehicle updated");
      } else {
        await createVehicle(data);
        toast.success("Vehicle added");
      }
      onClose();
    } catch { toast.error("Failed to save vehicle"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{vehicle ? "Edit" : "Add"} Vehicle</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Make *</Label><Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" /></div>
            <div className="space-y-2"><Label>Model *</Label><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Hilux" /></div>
            <div className="space-y-2"><Label>Year *</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2022" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Plate Number *</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC-1234" /></div>
            <div className="space-y-2"><Label>Color</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="White" /></div>
          </div>
          <div className="space-y-2"><Label>VIN</Label><Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="1HGBH41JXMN109186" /></div>
          {!vehicle && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Purchase Price</Label>
                <Input type="number" min="0" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0.00" />
                <p className="text-xs text-muted-foreground">Posts to Vehicles account in GL</p>
              </div>
              <div className="space-y-2">
                <Label>Purchase Date</Label>
                <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>
            </div>
          )}
          {vehicle && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as VehicleStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="in_maintenance">In Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={typeof assignedTo === "string" ? assignedTo : "none"} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users?.filter((u) => u.isActive).map((u) => <SelectItem key={u._id} value={u._id}>{u.name ?? u.email ?? "User"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Maintenance Log Dialog ─────────────────────────────────────────────────────

function MaintenanceDialog({ vehicleId, onClose }: { vehicleId: Id<"vehicles">; onClose: () => void }) {
  const create = useMutation(api.vehicles.createMaintenanceLog);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [mileage, setMileage] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    try {
      await create({
        vehicleId, date, description: description.trim(),
        cost: cost ? parseFloat(cost) : undefined,
        mileageAtService: mileage ? parseFloat(mileage) : undefined,
        performedBy: performedBy.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Maintenance log added");
      onClose();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="w-4 h-4" />Log Maintenance</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2"><Label>Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>Description *</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Oil change, tire rotation..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Cost ($)</Label><Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Mileage (km)</Label><Input type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="50000" /></div>
          </div>
          <div className="space-y-2"><Label>Performed By</Label><Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Service center name" /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Fuel Log Dialog ────────────────────────────────────────────────────────────

function FuelDialog({ vehicleId, onClose }: { vehicleId: Id<"vehicles">; onClose: () => void }) {
  const { fmt } = useCurrency();
  const create = useMutation(api.vehicles.createFuelLog);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [liters, setLiters] = useState("");
  const [costPerLiter, setCostPerLiter] = useState("");
  const [mileage, setMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const total = (parseFloat(liters) || 0) * (parseFloat(costPerLiter) || 0);

  const handleSave = async () => {
    const l = parseFloat(liters), c = parseFloat(costPerLiter);
    if (isNaN(l) || l <= 0) { toast.error("Enter valid liters"); return; }
    if (isNaN(c) || c <= 0) { toast.error("Enter valid cost per liter"); return; }
    setSaving(true);
    try {
      await create({
        vehicleId, date, liters: l, costPerLiter: c,
        mileage: mileage ? parseFloat(mileage) : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Fuel log added");
      onClose();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Fuel className="w-4 h-4" />Log Fuel</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2"><Label>Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Liters *</Label><Input type="number" min="0" step="0.01" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="40.0" /></div>
            <div className="space-y-2"><Label>Cost / Liter *</Label><Input type="number" min="0" step="0.001" value={costPerLiter} onChange={(e) => setCostPerLiter(e.target.value)} placeholder="1.50" /></div>
          </div>
          {total > 0 && <p className="text-sm text-muted-foreground text-right">Total: <span className="font-semibold text-foreground">{fmt(total)}</span></p>}
          <div className="space-y-2"><Label>Odometer (km)</Label><Input type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="52500" /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Vehicle Detail Panel ───────────────────────────────────────────────────────

function VehicleDetailPanel({ vehicle, onClose }: { vehicle: VehicleWithUser; onClose: () => void }) {
  const { fmt } = useCurrency();
  const maintenanceLogs = useQuery(api.vehicles.listMaintenanceLogs, { vehicleId: vehicle._id });
  const fuelLogs = useQuery(api.vehicles.listFuelLogs, { vehicleId: vehicle._id });
  const deleteMaintenance = useMutation(api.vehicles.deleteMaintenanceLog);
  const deleteFuel = useMutation(api.vehicles.deleteFuelLog);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [tab, setTab] = useState("maintenance");
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showFuel, setShowFuel] = useState(false);

  const canManage = currentUser?.role !== "staff";
  const totalMaintCost = maintenanceLogs?.reduce((s, l) => s + (l.cost ?? 0), 0) ?? 0;
  const totalFuelCost = fuelLogs?.reduce((s, l) => s + l.totalCost, 0) ?? 0;
  const totalFuelLiters = fuelLogs?.reduce((s, l) => s + l.liters, 0) ?? 0;
  const cfg = statusConfig[vehicle.status];
  const StatusIcon = cfg.icon;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </DialogTitle>
        </DialogHeader>

        {/* Vehicle info bar */}
        <div className="flex flex-wrap gap-3 py-1">
          <span className={cn("text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1", cfg.class)}>
            <StatusIcon className="w-3 h-3" />{cfg.label}
          </span>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">Plate: <strong>{vehicle.plate}</strong></span>
          {vehicle.color && <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">{vehicle.color}</span>}
          {vehicle.assignedUser && <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">Assigned: <strong>{vehicle.assignedUser.name ?? "?"}</strong></span>}
        </div>

        {/* Cost summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Maintenance Cost", value: fmt(totalMaintCost) },
            { label: "Fuel Cost", value: fmt(totalFuelCost) },
            { label: "Total Fuel", value: `${totalFuelLiters.toFixed(1)} L` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-muted/50 border p-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-bold mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="maintenance" className="flex items-center gap-1.5"><Wrench className="w-3 h-3" />Maintenance</TabsTrigger>
              <TabsTrigger value="fuel" className="flex items-center gap-1.5"><Fuel className="w-3 h-3" />Fuel</TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={() => tab === "maintenance" ? setShowMaintenance(true) : setShowFuel(true)}>
              <Plus className="w-3 h-3 mr-1" />Log {tab === "maintenance" ? "Maintenance" : "Fuel"}
            </Button>
          </div>

          <TabsContent value="maintenance" className="mt-3 max-h-64 overflow-y-auto space-y-2">
            {maintenanceLogs === undefined ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : maintenanceLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No maintenance logs yet</p>
            ) : maintenanceLogs.map((log) => (
              <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{log.description}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {new Date(log.date).toLocaleDateString()}
                    {log.mileageAtService && ` · ${log.mileageAtService.toLocaleString()} km`}
                    {log.performedBy && ` · ${log.performedBy}`}
                  </p>
                  {log.notes && <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {log.cost !== undefined && <p className="font-semibold text-primary">{fmt(log.cost)}</p>}
                  {canManage && (
                    <Button size="sm" variant="ghost" className="h-6 text-destructive mt-1"
                      onClick={() => deleteMaintenance({ logId: log._id }).then(() => toast.success("Deleted")).catch(() => toast.error("Failed"))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="fuel" className="mt-3 max-h-64 overflow-y-auto space-y-2">
            {fuelLogs === undefined ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : fuelLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No fuel logs yet</p>
            ) : fuelLogs.map((log) => (
              <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{log.liters.toFixed(1)} L @ {fmt(log.costPerLiter)}/L</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {new Date(log.date).toLocaleDateString()}
                    {log.mileage && ` · ${log.mileage.toLocaleString()} km`}
                  </p>
                  {log.notes && <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-primary">{fmt(log.totalCost)}</p>
                  {canManage && (
                    <Button size="sm" variant="ghost" className="h-6 text-destructive mt-1"
                      onClick={() => deleteFuel({ logId: log._id }).then(() => toast.success("Deleted")).catch(() => toast.error("Failed"))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>

      {showMaintenance && <MaintenanceDialog vehicleId={vehicle._id} onClose={() => setShowMaintenance(false)} />}
      {showFuel && <FuelDialog vehicleId={vehicle._id} onClose={() => setShowFuel(false)} />}
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function VehiclesPage() {
  const { fmt } = useCurrency();
  const vehicles = useQuery(api.vehicles.listVehicles);
  const summary = useQuery(api.vehicles.getFleetSummary);
  const deleteVehicle = useMutation(api.vehicles.deleteVehicle);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { isFocused } = useFocusItem();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<VehicleWithUser | null>(null);
  const [viewing, setViewing] = useState<VehicleWithUser | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const canManage = currentUser?.role !== "staff";
  const isOwner = currentUser?.role === "owner";

  const filtered = (vehicles ?? []).filter((v) => filterStatus === "all" || v.status === filterStatus);

  const handleDelete = async (id: Id<"vehicles">) => {
    try { await deleteVehicle({ vehicleId: id }); toast.success("Vehicle removed"); }
    catch { toast.error("Failed to delete"); }
  };

  const statCards = [
    { label: "Total Fleet", value: summary?.total ?? 0, color: "text-primary" },
    { label: "Active", value: summary?.active ?? 0, color: "text-green-600" },
    { label: "In Maintenance", value: summary?.inMaintenance ?? 0, color: "text-yellow-600" },
    { label: "Retired", value: summary?.retired ?? 0, color: "text-muted-foreground" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6" />Vehicle Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your fleet, maintenance, and fuel expenses</p>
        </div>
        {canManage && <Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" />Add Vehicle</Button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              {summary === undefined ? <Skeleton className="h-8 w-12 mt-1" /> : <p className={cn("text-2xl sm:text-3xl font-bold mt-0.5 break-words leading-tight", color)}>{value}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cost summary */}
      {summary && (summary.totalMaintenanceCost > 0 || summary.totalFuelCost > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-yellow-600"><Wrench className="w-4 h-4" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Maintenance</p>
                <p className="font-bold">{fmt(summary.totalMaintenanceCost)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-blue-600"><Fuel className="w-4 h-4" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Fuel Cost</p>
                <p className="font-bold">{fmt(summary.totalFuelCost)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {["all", "active", "in_maintenance", "retired"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cn("px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors",
              filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}>
            {s === "in_maintenance" ? "In Maintenance" : s}
          </button>
        ))}
      </div>

      {/* Vehicle grid */}
      {vehicles === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Truck /></EmptyMedia>
            <EmptyTitle>No vehicles {filterStatus !== "all" ? `with status "${filterStatus === "in_maintenance" ? "In Maintenance" : filterStatus}"` : "yet"}</EmptyTitle>
            <EmptyDescription>Add your business vehicles to track maintenance and fuel</EmptyDescription>
          </EmptyHeader>
          {canManage && filterStatus === "all" && <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Add Vehicle</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const cfg = statusConfig[v.status];
            const StatusIcon = cfg.icon;
            return (
              <Card key={v._id} id={focusElementId(v._id)} className={cn(v.status === "retired" && "opacity-60", isFocused(v._id) && FOCUS_RING_CLASS)}>
                <CardContent className="pt-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{v.year} {v.make} {v.model}</p>
                      <p className="text-sm text-muted-foreground font-mono">{v.plate}</p>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 flex-shrink-0", cfg.class)}>
                      <StatusIcon className="w-3 h-3" />{cfg.label}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    {v.color && <p>Color: {v.color}</p>}
                    {v.vin && <p className="font-mono text-xs truncate">VIN: {v.vin}</p>}
                    {v.assignedUser && <p>Driver: <span className="text-foreground">{v.assignedUser.name ?? "?"}</span></p>}
                  </div>

                  {v.notes && <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-2">{v.notes}</p>}

                  {/* Actions */}
                  <div className="flex gap-1 pt-1 border-t">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(v)}><Eye className="w-3 h-3 mr-1" />Logs</Button>
                    {canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(v)}><Pencil className="w-3 h-3 mr-1" />Edit</Button>}
                    {isOwner && <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => handleDelete(v._id)}><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showAdd && <VehicleDialog onClose={() => setShowAdd(false)} />}
      {editing && <VehicleDialog vehicle={editing} onClose={() => setEditing(null)} />}
      {viewing && <VehicleDetailPanel vehicle={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
