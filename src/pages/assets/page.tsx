import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import {
  Package, Plus, Pencil, Trash2, Eye, Wrench, FileText,
  Hammer, TrendingDown, CheckCircle2, AlertTriangle, Archive,
  Tag, Settings, Calculator, DollarSign,
} from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";
import { DepreciationSettingsDialog, DepreciationPanel, DepreciationReport } from "./_components/depreciation-panel.tsx";
import { useFocusItem, focusElementId, FOCUS_RING_CLASS } from "@/hooks/use-focus-item.ts";

// ── Types & helpers ───────────────────────────────────────────────────────────

type AssetCondition = "excellent" | "good" | "fair" | "poor";
type AssetStatus = "active" | "under_repair" | "disposed";
type LogType = "maintenance" | "repair" | "note";

type FullAsset = Doc<"assets"> & {
  category: Doc<"assetCategories"> | null;
  assignedUser: Doc<"users"> | null;
  warehouse: Doc<"warehouses"> | null;
};

const conditionConfig: Record<AssetCondition, { label: string; class: string }> = {
  excellent: { label: "Excellent", class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  good: { label: "Good", class: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  fair: { label: "Fair", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  poor: { label: "Poor", class: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

const statusConfig: Record<AssetStatus, { label: string; icon: React.ElementType; class: string }> = {
  active: { label: "Active", icon: CheckCircle2, class: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  under_repair: { label: "Under Repair", icon: AlertTriangle, class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  disposed: { label: "Disposed", icon: Archive, class: "bg-muted text-muted-foreground" },
};

const logTypeConfig: Record<LogType, { label: string; icon: React.ElementType; class: string }> = {
  maintenance: { label: "Maintenance", icon: Wrench, class: "text-blue-600" },
  repair: { label: "Repair", icon: Hammer, class: "text-yellow-600" },
  note: { label: "Note", icon: FileText, class: "text-muted-foreground" },
};

// ── Category Dialog ───────────────────────────────────────────────────────────

const ASSET_GL_ACCOUNTS = [
  { code: "1500", name: "1500 – Fixed Assets" },
  { code: "1510", name: "1510 – Equipment" },
  { code: "1520", name: "1520 – Vehicles" },
  { code: "1530", name: "1530 – Furniture & Fixtures" },
  { code: "1540", name: "1540 – Computers & Technology" },
];

function CategoryDialog({ onClose }: { onClose: () => void }) {
  const categories = useQuery(api.assets.listCategories);
  const createCat = useMutation(api.assets.createCategory);
  const updateCat = useMutation(api.assets.updateCategory);
  const deleteCat = useMutation(api.assets.deleteCategory);
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAccount, setEditAccount] = useState("none");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createCat({ name: name.trim(), accountCode: accountCode !== "none" ? accountCode : undefined });
      setName(""); setAccountCode("none");
      toast.success("Category created");
    } catch { toast.error("Failed"); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateCat({ categoryId: editingId as Id<"assetCategories">, name: editName.trim(), accountCode: editAccount !== "none" ? editAccount : undefined });
      setEditingId(null);
      toast.success("Category updated");
    } catch { toast.error("Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Asset Categories</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="flex-1" onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
              <Select value={accountCode} onValueChange={setAccountCode}>
                <SelectTrigger className="w-52"><SelectValue placeholder="GL Account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No GL Account</SelectItem>
                  {ASSET_GL_ACCOUNTS.map((a) => <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} disabled={saving || !name.trim()}>Add</Button>
            </div>
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {categories === undefined ? <Skeleton className="h-8 w-full" /> : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
            ) : categories.map((c) => (
              <div key={c._id} className="rounded border px-2 py-1.5">
                {editingId === c._id ? (
                  <div className="flex gap-2 items-center">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 h-7 text-sm" />
                    <Select value={editAccount} onValueChange={setEditAccount}>
                      <SelectTrigger className="w-44 h-7 text-xs"><SelectValue placeholder="GL Account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No GL Account</SelectItem>
                        {ASSET_GL_ACCOUNTS.map((a) => <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-7" onClick={handleUpdate} disabled={saving}>Save</Button>
                    <Button size="sm" variant="secondary" className="h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{c.name}</span>
                      {c.accountCode && <span className="ml-2 text-xs text-muted-foreground">{ASSET_GL_ACCOUNTS.find((a) => a.code === c.accountCode)?.name ?? c.accountCode}</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6" onClick={() => { setEditingId(c._id); setEditName(c.name); setEditAccount(c.accountCode ?? "none"); }}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 text-destructive" onClick={() => deleteCat({ categoryId: c._id }).catch(() => toast.error("Failed"))}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Asset Form Dialog ─────────────────────────────────────────────────────────

function AssetDialog({ asset, onClose }: { asset?: FullAsset; onClose: () => void }) {
  const createAsset = useMutation(api.assets.createAsset);
  const updateAsset = useMutation(api.assets.updateAsset);
  const categories = useQuery(api.assets.listCategories);
  const users = useQuery(api.users.listUsers);
  const warehouses = useQuery(api.products.listWarehouses);

  const [name, setName] = useState(asset?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(asset?.categoryId ?? "none");
  const [accountCode, setAccountCode] = useState<string>(asset?.accountCode ?? "none");
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? "");
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchaseDate ?? "");
  const [purchasePrice, setPurchasePrice] = useState(asset?.purchasePrice ? String(asset.purchasePrice) : "");
  const [currentValue, setCurrentValue] = useState(asset?.currentValue ? String(asset.currentValue) : "");
  const [condition, setCondition] = useState<AssetCondition>(asset?.condition ?? "good");
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? "active");
  const [assignedTo, setAssignedTo] = useState<string>(asset?.assignedTo ?? "none");
  const [warehouseId, setWarehouseId] = useState<string>(asset?.warehouseId ?? "none");
  const [notes, setNotes] = useState(asset?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        categoryId: categoryId !== "none" ? categoryId as Id<"assetCategories"> : undefined,
        accountCode: accountCode !== "none" ? accountCode : undefined,
        serialNumber: serialNumber.trim() || undefined,
        purchaseDate: purchaseDate || undefined,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : undefined,
        currentValue: currentValue ? parseFloat(currentValue) : undefined,
        condition,
        assignedTo: assignedTo !== "none" ? assignedTo as Id<"users"> : undefined,
        warehouseId: warehouseId !== "none" ? warehouseId as Id<"warehouses"> : undefined,
        notes: notes.trim() || undefined,
      };
      if (asset) {
        await updateAsset({ assetId: asset._id, ...data, status });
        toast.success("Asset updated");
      } else {
        await createAsset(data);
        toast.success("Asset added");
      }
      onClose();
    } catch { toast.error("Failed to save asset"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{asset ? "Edit" : "Add"} Asset</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1 max-h-[65vh] overflow-y-auto pr-1">
          <div className="space-y-1.5"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptop, Forklift, Desk..." /></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Serial Number</Label><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="SN-123456" /></div>
          </div>

          <div className="space-y-1.5">
            <Label>GL Account <span className="text-xs text-muted-foreground">(overrides category default)</span></Label>
            <Select value={accountCode} onValueChange={setAccountCode}>
              <SelectTrigger><SelectValue placeholder="Use category default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Use category default (1500 Fixed Assets)</SelectItem>
                {ASSET_GL_ACCOUNTS.map((a) => <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Purchase Price</Label><Input type="number" min="0" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0.00" /></div>
          </div>

          <div className="space-y-1.5"><Label>Current Value</Label><Input type="number" min="0" step="0.01" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="Current market / book value" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as AssetCondition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {asset && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="under_repair">Under Repair</SelectItem>
                    <SelectItem value="disposed">Disposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users?.filter((u) => u.isActive).map((u) => <SelectItem key={u._id} value={u._id}>{u.name ?? u.email ?? "User"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location (Warehouse)</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Location</SelectItem>
                  {warehouses?.filter((w) => w.isActive).map((w) => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Asset Log Dialog ──────────────────────────────────────────────────────────

function AssetLogDialog({ assetId, onClose }: { assetId: Id<"assets">; onClose: () => void }) {
  const create = useMutation(api.assets.createAssetLog);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [type, setType] = useState<LogType>("maintenance");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    try {
      await create({ assetId, date, type, description: description.trim(), cost: cost ? parseFloat(cost) : undefined, performedBy: performedBy.trim() || undefined });
      toast.success("Log entry added");
      onClose();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Log Entry</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LogType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Description *</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the work or note..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Cost ($)</Label><Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-1.5"><Label>Performed By</Label><Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} placeholder="Technician name" /></div>
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

// ── Asset Detail Panel ─────────────────────────────────────────────────────────

function AssetDetailPanel({ asset, onClose }: { asset: FullAsset; onClose: () => void }) {
  const { fmt } = useCurrency();
  const logs = useQuery(api.assets.listAssetLogs, { assetId: asset._id });
  const deleteLog = useMutation(api.assets.deleteAssetLog);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [showLog, setShowLog] = useState(false);
  const [showDepSettings, setShowDepSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const canManage = currentUser?.role !== "staff";
  const totalLogCost = logs?.reduce((s, l) => s + (l.cost ?? 0), 0) ?? 0;
  const depreciation = asset.purchasePrice !== undefined && asset.currentValue !== undefined
    ? asset.purchasePrice - asset.currentValue : null;
  const cfg = statusConfig[asset.status];
  const StatusIcon = cfg.icon;
  const condCfg = conditionConfig[asset.condition];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="w-4 h-4 text-primary" />
            </div>
            {asset.name}
          </DialogTitle>
        </DialogHeader>

        {/* Badges */}
        <div className="flex flex-wrap gap-2">
          <span className={cn("text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1", cfg.class)}>
            <StatusIcon className="w-3 h-3" />{cfg.label}
          </span>
          <span className={cn("text-xs px-2 py-1 rounded-full font-medium", condCfg.class)}>{condCfg.label}</span>
          {asset.category && <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{asset.category.name}</span>}
          {asset.depreciationMethod && asset.depreciationMethod !== "none" && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
              <Calculator className="w-3 h-3" />
              {asset.depreciationMethod === "straight_line" ? "Straight-Line" : "Declining Balance"}
            </span>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="depreciation">Depreciation</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3 mt-3">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {asset.serialNumber && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Serial Number</p><p className="font-mono font-medium">{asset.serialNumber}</p></div>}
              {asset.purchaseDate && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Purchased</p><p className="font-medium">{new Date(asset.purchaseDate).toLocaleDateString()}</p></div>}
              {asset.purchasePrice !== undefined && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Purchase Price</p><p className="font-semibold">{fmt(asset.purchasePrice)}</p></div>}
              {asset.currentValue !== undefined && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Current Book Value</p><p className="font-semibold">{fmt(asset.currentValue)}</p></div>}
              {depreciation !== null && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Depreciation</p><p className={cn("font-semibold", depreciation > 0 ? "text-red-500" : "text-green-600")}>{fmt(depreciation)}</p></div>}
              {asset.salvageValue !== undefined && asset.salvageValue > 0 && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Salvage Value</p><p className="font-medium">{fmt(asset.salvageValue)}</p></div>}
              {asset.assignedUser && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Assigned To</p><p className="font-medium">{asset.assignedUser.name ?? "?"}</p></div>}
              {asset.warehouse && <div className="bg-muted/50 rounded p-2"><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{asset.warehouse.name}</p></div>}
            </div>
            {asset.notes && <p className="text-sm text-muted-foreground border-t pt-2">{asset.notes}</p>}
          </TabsContent>

          <TabsContent value="depreciation" className="mt-3">
            <div className="space-y-3">
              {canManage && (
                <div className="flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => setShowDepSettings(true)}>
                    <Settings className="w-3 h-3 mr-1" />Configure
                  </Button>
                </div>
              )}
              <DepreciationPanel assetId={asset._id} assetName={asset.name} />
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Log History {totalLogCost > 0 && <span className="text-muted-foreground font-normal ml-1">· {fmt(totalLogCost)} total cost</span>}</p>
                <Button size="sm" onClick={() => setShowLog(true)}><Plus className="w-3 h-3 mr-1" />Add Entry</Button>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {logs === undefined ? (
                  <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No log entries yet</p>
                ) : logs.map((log) => {
                  const tc = logTypeConfig[log.type];
                  const LogIcon = tc.icon;
                  return (
                    <div key={log._id} className="flex gap-3 p-3 rounded-lg border bg-card text-sm">
                      <LogIcon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", tc.class)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{log.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(log.date).toLocaleDateString()}
                          {log.performedBy && ` · ${log.performedBy}`}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {log.cost !== undefined && <p className="font-semibold text-primary">{fmt(log.cost)}</p>}
                        {canManage && (
                          <Button size="sm" variant="ghost" className="h-6 text-destructive mt-0.5"
                            onClick={() => deleteLog({ logId: log._id }).then(() => toast.success("Deleted")).catch(() => toast.error("Failed"))}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
      {showLog && <AssetLogDialog assetId={asset._id} onClose={() => setShowLog(false)} />}
      {showDepSettings && (
        <DepreciationSettingsDialog
          assetId={asset._id}
          currentMethod={asset.depreciationMethod}
          currentUsefulLife={asset.usefulLifeYears}
          currentSalvageValue={asset.salvageValue}
          currentRate={asset.depreciationRate}
          currentStartDate={asset.depreciationStartDate}
          purchaseDate={asset.purchaseDate}
          onClose={() => setShowDepSettings(false)}
        />
      )}
    </Dialog>
  );
}

// ── Dispose Asset Dialog ──────────────────────────────────────────────────────

function DisposeAssetDialog({ asset, onClose }: { asset: FullAsset; onClose: () => void }) {
  const { fmt } = useCurrency();
  const disposeAsset = useMutation(api.assets.disposeAsset);
  const bankAccounts = useQuery(api.accounting.listBankAccounts);

  const [salePrice, setSalePrice] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const originalCost = asset.purchasePrice ?? 0;
  const currentBookValue = asset.currentValue ?? originalCost;
  const salePriceNum = parseFloat(salePrice) || 0;
  const gainOrLoss = salePriceNum - currentBookValue;

  const handleDispose = async () => {
    if (!bankAccountId) { toast.error("Please select a bank/cash account"); return; }
    if (salePriceNum < 0) { toast.error("Sale price cannot be negative"); return; }
    setSaving(true);
    try {
      const result = await disposeAsset({
        assetId: asset._id,
        salePrice: salePriceNum,
        saleDate,
        bankAccountId: bankAccountId as Id<"accounts">,
        notes: notes.trim() || undefined,
      });
      if (result.gainOrLoss > 0) {
        toast.success(`Asset disposed with a gain of ${fmt(result.gainOrLoss)}`);
      } else if (result.gainOrLoss < 0) {
        toast.warning(`Asset disposed with a loss of ${fmt(Math.abs(result.gainOrLoss))}`);
      } else {
        toast.success("Asset disposed at book value — no gain or loss");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dispose asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />Dispose / Sell Asset
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Asset summary */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
            <p className="font-semibold">{asset.name}</p>
            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
              <span>Original Cost:</span><span className="text-foreground font-medium text-right">{fmt(originalCost)}</span>
              <span>Book Value:</span><span className="text-foreground font-medium text-right">{fmt(currentBookValue)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sale Price</Label>
            <Input type="number" min="0" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0.00" />
          </div>

          {/* Live gain/loss preview */}
          {salePrice !== "" && (
            <div className={cn(
              "rounded-lg p-3 text-sm flex items-center justify-between",
              gainOrLoss > 0 ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" :
              gainOrLoss < 0 ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" :
              "bg-muted text-muted-foreground"
            )}>
              <span>{gainOrLoss > 0 ? "Gain on Disposal" : gainOrLoss < 0 ? "Loss on Disposal" : "At Book Value"}</span>
              <span className="font-bold">{gainOrLoss !== 0 ? fmt(Math.abs(gainOrLoss)) : "—"}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Sale Date</Label>
            <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Deposit Sale Proceeds To</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Select bank / cash account" /></SelectTrigger>
              <SelectContent>
                {(bankAccounts ?? []).map((a) => (
                  <SelectItem key={a._id} value={a._id}>{a.name} ({a.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Buyer name, invoice #, etc." rows={2} />
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            This will post a journal entry removing the asset from the books, clearing accumulated depreciation, and recording any gain or loss. The asset will be marked as disposed.
          </p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDispose} disabled={saving}>
            {saving ? "Processing..." : "Confirm Disposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { fmt } = useCurrency();
  const assets = useQuery(api.assets.listAssets);
  const summary = useQuery(api.assets.getAssetSummary);
  const deleteAsset = useMutation(api.assets.deleteAsset);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { isFocused } = useFocusItem();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FullAsset | null>(null);
  const [viewing, setViewing] = useState<FullAsset | null>(null);
  const [disposing, setDisposing] = useState<FullAsset | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pageTab, setPageTab] = useState("assets");

  const canManage = currentUser?.role !== "staff";
  const isOwner = currentUser?.role === "owner";

  const filtered = (assets ?? []).filter((a) => {
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || (a.serialNumber ?? "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statCards = [
    { label: "Total Assets", value: summary?.total ?? 0, color: "text-primary" },
    { label: "Active", value: summary?.active ?? 0, color: "text-green-600" },
    { label: "Under Repair", value: summary?.underRepair ?? 0, color: "text-yellow-600" },
    { label: "Disposed", value: summary?.disposed ?? 0, color: "text-muted-foreground" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" />Asset Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track equipment, tools, furniture, and business assets</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="secondary" onClick={() => setShowCategories(true)}>
              <Tag className="w-4 h-4 mr-2" />Categories
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Asset
            </Button>
          )}
        </div>
      </div>

      {/* Page tabs: Assets / Depreciation Report */}
      <Tabs value={pageTab} onValueChange={setPageTab}>
        <TabsList>
          <TabsTrigger value="assets">All Assets</TabsTrigger>
          <TabsTrigger value="depreciation">
            <TrendingDown className="w-3.5 h-3.5 mr-1.5" />Depreciation Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6 mt-4">
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

          {/* Value summary */}
          {summary && (summary.totalPurchaseValue > 0 || summary.totalCurrentValue > 0) && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Purchase Value", value: fmt(summary.totalPurchaseValue) },
                { label: "Total Current Value", value: fmt(summary.totalCurrentValue) },
                { label: "Total Depreciation", value: fmt(summary.depreciation), highlight: summary.depreciation > 0 },
              ].map(({ label, value, highlight }) => (
                <Card key={label}>
                  <CardContent className="pt-5 flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg bg-muted", highlight ? "text-red-500" : "text-primary")}>
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-bold">{value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-2 flex-wrap">
              {["all", "active", "under_repair", "disposed"].map((s) => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={cn("px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                    filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  )}>
                  {s === "under_repair" ? "Under Repair" : s}
                </button>
              ))}
            </div>
            <Input className="max-w-xs" placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Asset grid */}
          {assets === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Package /></EmptyMedia>
                <EmptyTitle>No assets found</EmptyTitle>
                <EmptyDescription>Add equipment, tools, or other business assets to track them</EmptyDescription>
              </EmptyHeader>
              {canManage && filterStatus === "all" && !search && (
                <EmptyContent><Button size="sm" onClick={() => setShowAdd(true)}>Add Asset</Button></EmptyContent>
              )}
            </Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => {
                const cfg = statusConfig[a.status];
                const StatusIcon = cfg.icon;
                const condCfg = conditionConfig[a.condition];
                const hasDepreciation = a.purchasePrice !== undefined && a.currentValue !== undefined;
                const depreciation = hasDepreciation ? a.purchasePrice! - a.currentValue! : null;

                return (
                  <Card key={a._id} id={focusElementId(a._id)} className={cn(a.status === "disposed" && "opacity-60", isFocused(a._id) && FOCUS_RING_CLASS)}>
                    <CardContent className="pt-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate">{a.name}</p>
                          {a.category && <p className="text-xs text-muted-foreground mt-0.5">{a.category.name}</p>}
                        </div>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 flex-shrink-0", cfg.class)}>
                          <StatusIcon className="w-3 h-3" />{cfg.label}
                        </span>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", condCfg.class)}>{condCfg.label}</span>
                        {a.depreciationMethod && a.depreciationMethod !== "none" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {a.depreciationMethod === "straight_line" ? "SL" : "DB"}
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {a.serialNumber && <p className="font-mono text-xs">S/N: {a.serialNumber}</p>}
                        {a.currentValue !== undefined && <p>Book Value: <span className="text-foreground font-medium">{fmt(a.currentValue)}</span></p>}
                        {depreciation !== null && depreciation > 0 && (
                          <p className="text-red-500 text-xs">Depreciated: {fmt(depreciation)}</p>
                        )}
                        {a.assignedUser && <p>Assigned: <span className="text-foreground">{a.assignedUser.name ?? "?"}</span></p>}
                        {a.warehouse && <p>Location: <span className="text-foreground">{a.warehouse.name}</span></p>}
                      </div>

                      {a.notes && <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-2">{a.notes}</p>}

                      <div className="flex gap-1 pt-1 border-t">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(a)}><Eye className="w-3 h-3 mr-1" />Details</Button>
                        {canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(a)}><Pencil className="w-3 h-3 mr-1" />Edit</Button>}
                        {canManage && a.status !== "disposed" && (
                          <Button size="sm" variant="ghost" className="text-orange-600 dark:text-orange-400" onClick={() => setDisposing(a)}>
                            <DollarSign className="w-3 h-3 mr-1" />Sell
                          </Button>
                        )}
                        {isOwner && <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => deleteAsset({ assetId: a._id }).then(() => toast.success("Deleted")).catch(() => toast.error("Failed"))}><Trash2 className="w-3 h-3" /></Button>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="depreciation" className="mt-4">
          <DepreciationReport />
        </TabsContent>
      </Tabs>

      {showAdd && <AssetDialog onClose={() => setShowAdd(false)} />}
      {editing && <AssetDialog asset={editing} onClose={() => setEditing(null)} />}
      {viewing && <AssetDetailPanel asset={viewing} onClose={() => setViewing(null)} />}
      {disposing && <DisposeAssetDialog asset={disposing} onClose={() => setDisposing(null)} />}
      {showCategories && <CategoryDialog onClose={() => setShowCategories(false)} />}
    </div>
  );
}
