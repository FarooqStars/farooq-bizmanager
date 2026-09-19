import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Grid3X3, Plus, Trash2, Wand2, CheckCircle, XCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Id, Doc } from "@/convex/_generated/dataModel.d.ts";

// ─── Single Bin Dialog ────────────────────────────────────────

function BinDialog({
  warehouseId,
  bin,
  onClose,
}: {
  warehouseId: Id<"warehouses">;
  bin?: Doc<"warehouseBins">;
  onClose: () => void;
}) {
  const createBin = useMutation(api.warehouseBins.createBin);
  const updateBin = useMutation(api.warehouseBins.updateBin);
  const [zone, setZone] = useState(bin?.zone ?? "");
  const [row, setRow] = useState(bin?.row ?? "");
  const [shelf, setShelf] = useState(bin?.shelf ?? "");
  const [binCode, setBinCode] = useState(bin?.bin ?? "");
  const [label, setLabel] = useState(bin?.label ?? "");
  const [saving, setSaving] = useState(false);

  // Auto-generate label
  const autoLabel = [zone, row, shelf, binCode].filter(Boolean).join("-");

  const handleSave = async () => {
    if (!binCode.trim()) { toast.error("Bin code is required"); return; }
    const finalLabel = label.trim() || autoLabel || binCode;
    setSaving(true);
    try {
      if (bin) {
        await updateBin({
          binId: bin._id,
          zone: zone || undefined,
          row: row || undefined,
          shelf: shelf || undefined,
          bin: binCode,
          label: finalLabel,
        });
        toast.success("Bin updated");
      } else {
        await createBin({
          warehouseId,
          zone: zone || undefined,
          row: row || undefined,
          shelf: shelf || undefined,
          bin: binCode,
          label: finalLabel,
        });
        toast.success("Bin created");
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bin ? "Edit Bin Location" : "Add Bin Location"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Zone</Label>
              <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="A, B, Cold..." />
            </div>
            <div className="space-y-2">
              <Label>Row</Label>
              <Input value={row} onChange={(e) => setRow(e.target.value)} placeholder="R1, R2..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Shelf</Label>
              <Input value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="S1, S2..." />
            </div>
            <div className="space-y-2">
              <Label>Bin Code *</Label>
              <Input value={binCode} onChange={(e) => setBinCode(e.target.value)} placeholder="B1, B2..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Label (auto-generated if empty)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={autoLabel || "Zone-Row-Shelf-Bin"} />
            {autoLabel && !label && (
              <p className="text-xs text-muted-foreground">Will use: {autoLabel}</p>
            )}
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

// ─── Bulk Generate Dialog ─────────────────────────────────────

function BulkGenerateDialog({
  warehouseId,
  onClose,
}: {
  warehouseId: Id<"warehouses">;
  onClose: () => void;
}) {
  const bulkCreate = useMutation(api.warehouseBins.bulkCreateBins);
  const [zone, setZone] = useState("");
  const [rowPrefix, setRowPrefix] = useState("R");
  const [rowStart, setRowStart] = useState(1);
  const [rowEnd, setRowEnd] = useState(3);
  const [shelfPrefix, setShelfPrefix] = useState("S");
  const [shelfStart, setShelfStart] = useState(1);
  const [shelfEnd, setShelfEnd] = useState(4);
  const [binPrefix, setBinPrefix] = useState("B");
  const [binStart, setBinStart] = useState(1);
  const [binEnd, setBinEnd] = useState(5);
  const [saving, setSaving] = useState(false);

  const estimatedCount = Math.max(0,
    (rowEnd - rowStart + 1) *
    (shelfEnd - shelfStart + 1) *
    (binEnd - binStart + 1)
  );

  const handleGenerate = async () => {
    if (estimatedCount <= 0) { toast.error("Invalid range"); return; }
    if (estimatedCount > 500) { toast.error("Maximum 500 bins at once"); return; }
    setSaving(true);
    try {
      const count = await bulkCreate({
        warehouseId,
        zone: zone || undefined,
        rowPrefix,
        rowStart,
        rowEnd,
        shelfPrefix,
        shelfStart,
        shelfEnd,
        binPrefix,
        binStart,
        binEnd,
      });
      toast.success(`Created ${count} bin locations`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />Bulk Generate Bin Locations
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Auto-generate a grid of bin locations. Labels are created as Zone-Row-Shelf-Bin format.
          </p>

          <div className="space-y-2">
            <Label>Zone (optional)</Label>
            <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="A, Cold, Main..." />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Row Prefix</Label>
              <Input value={rowPrefix} onChange={(e) => setRowPrefix(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="number" value={rowStart} onChange={(e) => setRowStart(Number(e.target.value))} min={1} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type="number" value={rowEnd} onChange={(e) => setRowEnd(Number(e.target.value))} min={1} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Shelf Prefix</Label>
              <Input value={shelfPrefix} onChange={(e) => setShelfPrefix(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="number" value={shelfStart} onChange={(e) => setShelfStart(Number(e.target.value))} min={1} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type="number" value={shelfEnd} onChange={(e) => setShelfEnd(Number(e.target.value))} min={1} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Bin Prefix</Label>
              <Input value={binPrefix} onChange={(e) => setBinPrefix(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="number" value={binStart} onChange={(e) => setBinStart(Number(e.target.value))} min={1} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type="number" value={binEnd} onChange={(e) => setBinEnd(Number(e.target.value))} min={1} />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm font-medium">Preview: {estimatedCount} bins will be created</p>
            <p className="text-xs text-muted-foreground mt-1">
              Example: {zone ? `${zone}-` : ""}{rowPrefix}{rowStart}-{shelfPrefix}{shelfStart}-{binPrefix}{binStart}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={saving || estimatedCount <= 0}>
            {saving ? "Generating..." : `Generate ${estimatedCount} Bins`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Bin Management Component ────────────────────────────

export default function BinManagement({
  warehouseId,
  canManage,
}: {
  warehouseId: Id<"warehouses">;
  canManage: boolean;
}) {
  const bins = useQuery(api.warehouseBins.listBins, { warehouseId });
  const updateBin = useMutation(api.warehouseBins.updateBin);
  const deleteBin = useMutation(api.warehouseBins.deleteBin);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editingBin, setEditingBin] = useState<Doc<"warehouseBins"> | null>(null);
  const [search, setSearch] = useState("");
  const [filterZone, setFilterZone] = useState<string | null>(null);

  if (bins === undefined) return <Skeleton className="h-40 w-full" />;

  // Get unique zones for filtering
  const zones = Array.from(new Set(bins.map((b) => b.zone).filter(Boolean))) as string[];

  // Filter
  const filtered = bins.filter((b) => {
    if (filterZone && b.zone !== filterZone) return false;
    if (search) {
      const s = search.toLowerCase();
      return b.label.toLowerCase().includes(s) ||
        (b.zone?.toLowerCase().includes(s) ?? false) ||
        (b.row?.toLowerCase().includes(s) ?? false) ||
        (b.shelf?.toLowerCase().includes(s) ?? false) ||
        b.bin.toLowerCase().includes(s);
    }
    return true;
  });

  const handleToggle = async (b: Doc<"warehouseBins">) => {
    try {
      await updateBin({ binId: b._id, isActive: !b.isActive });
      toast.success(b.isActive ? "Bin deactivated" : "Bin activated");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (b: Doc<"warehouseBins">) => {
    if (!confirm(`Delete bin "${b.label}"?`)) return;
    try {
      await deleteBin({ binId: b._id });
      toast.success("Bin deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search bins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
          {zones.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <Badge
                variant={filterZone === null ? "default" : "secondary"}
                className="cursor-pointer"
                onClick={() => setFilterZone(null)}
              >
                All
              </Badge>
              {zones.map((z) => (
                <Badge
                  key={z}
                  variant={filterZone === z ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setFilterZone(z)}
                >
                  {z}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowBulk(true)}>
              <Wand2 className="w-4 h-4 mr-1" />Bulk Generate
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1" />Add Bin
            </Button>
          </div>
        )}
      </div>

      {/* Bin Grid */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Grid3X3 /></EmptyMedia>
            <EmptyTitle>{bins.length === 0 ? "No bins defined" : "No bins match filter"}</EmptyTitle>
            <EmptyDescription>
              {bins.length === 0
                ? "Create bin locations to track exactly where items are stored (zone, row, shelf, bin)"
                : "Try adjusting your search or zone filter"
              }
            </EmptyDescription>
          </EmptyHeader>
          {bins.length === 0 && canManage && (
            <EmptyContent>
              <Button size="sm" onClick={() => setShowBulk(true)}>
                <Wand2 className="w-4 h-4 mr-1" />Bulk Generate
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Label</th>
                  <th className="text-left px-3 py-2 font-medium">Zone</th>
                  <th className="text-left px-3 py-2 font-medium">Row</th>
                  <th className="text-left px-3 py-2 font-medium">Shelf</th>
                  <th className="text-left px-3 py-2 font-medium">Bin</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  {canManage && <th className="text-right px-3 py-2 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((b) => (
                  <tr key={b._id} className={`hover:bg-muted/30 ${!b.isActive ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{b.label}</td>
                    <td className="px-3 py-2">{b.zone || "—"}</td>
                    <td className="px-3 py-2">{b.row || "—"}</td>
                    <td className="px-3 py-2">{b.shelf || "—"}</td>
                    <td className="px-3 py-2">{b.bin}</td>
                    <td className="px-3 py-2">
                      <Badge variant={b.isActive ? "default" : "secondary"} className="text-xs">
                        {b.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingBin(b)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggle(b)}>
                            {b.isActive ? <XCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(b)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
            Showing {filtered.length} of {bins.length} bins
          </div>
        </div>
      )}

      {/* Dialogs */}
      {showAdd && <BinDialog warehouseId={warehouseId} onClose={() => setShowAdd(false)} />}
      {editingBin && <BinDialog warehouseId={warehouseId} bin={editingBin} onClose={() => setEditingBin(null)} />}
      {showBulk && <BulkGenerateDialog warehouseId={warehouseId} onClose={() => setShowBulk(false)} />}
    </div>
  );
}
