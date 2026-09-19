import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Ruler, Plus, Pencil, Trash2, ArrowRight, Boxes } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// Pre-built unit group templates
const TEMPLATES = [
  { name: "Weight", baseUnit: "kg", conversions: [{ from: "kg", to: "g", factor: 1000 }, { from: "kg", to: "lb", factor: 2.20462 }, { from: "kg", to: "oz", factor: 35.274 }] },
  { name: "Length", baseUnit: "m", conversions: [{ from: "m", to: "cm", factor: 100 }, { from: "m", to: "mm", factor: 1000 }, { from: "m", to: "ft", factor: 3.28084 }, { from: "m", to: "in", factor: 39.3701 }] },
  { name: "Volume", baseUnit: "L", conversions: [{ from: "L", to: "mL", factor: 1000 }, { from: "L", to: "gal", factor: 0.264172 }] },
  { name: "Packaging", baseUnit: "pc", conversions: [{ from: "pc", to: "dozen", factor: 1 / 12 }, { from: "pc", to: "box (12)", factor: 1 / 12 }, { from: "pc", to: "carton (48)", factor: 1 / 48 }, { from: "pc", to: "pallet (480)", factor: 1 / 480 }] },
  { name: "Time", baseUnit: "hr", conversions: [{ from: "hr", to: "min", factor: 60 }, { from: "hr", to: "day", factor: 1 / 8 }] },
];

export default function UnitsOfMeasurePage() {
  const groups = useQuery(api.unitMeasures.listGroups, {});
  const createGroup = useMutation(api.unitMeasures.createGroup);
  const deleteGroup = useMutation(api.unitMeasures.deleteGroup);
  const addConversion = useMutation(api.unitMeasures.addConversion);
  const deleteConversion = useMutation(api.unitMeasures.deleteConversion);

  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newBaseUnit, setNewBaseUnit] = useState("");

  // Conversion form
  const [showAddConv, setShowAddConv] = useState<string | null>(null);
  const [convFrom, setConvFrom] = useState("");
  const [convTo, setConvTo] = useState("");
  const [convFactor, setConvFactor] = useState("");

  const handleCreateGroup = async () => {
    if (!newName.trim() || !newBaseUnit.trim()) {
      toast.error("Name and base unit are required");
      return;
    }
    try {
      await createGroup({ name: newName.trim(), description: newDesc.trim() || undefined, baseUnit: newBaseUnit.trim() });
      toast.success("Unit group created");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewBaseUnit("");
    } catch {
      toast.error("Failed to create");
    }
  };

  const handleCreateFromTemplate = async (template: typeof TEMPLATES[number]) => {
    try {
      const groupId = await createGroup({ name: template.name, baseUnit: template.baseUnit });
      for (const conv of template.conversions) {
        await addConversion({
          unitGroupId: groupId,
          fromUnit: conv.from,
          toUnit: conv.to,
          conversionFactor: conv.factor,
        });
      }
      toast.success(`"${template.name}" group created with ${template.conversions.length} conversions`);
    } catch {
      toast.error("Failed to create from template");
    }
  };

  const handleAddConversion = async () => {
    if (!showAddConv || !convFrom.trim() || !convTo.trim() || !convFactor) {
      toast.error("All fields are required");
      return;
    }
    const factor = parseFloat(convFactor);
    if (isNaN(factor) || factor <= 0) {
      toast.error("Factor must be a positive number");
      return;
    }
    try {
      await addConversion({
        unitGroupId: showAddConv as Id<"unitGroups">,
        fromUnit: convFrom.trim(),
        toUnit: convTo.trim(),
        conversionFactor: factor,
      });
      toast.success("Conversion added");
      setShowAddConv(null);
      setConvFrom("");
      setConvTo("");
      setConvFactor("");
    } catch {
      toast.error("Failed to add conversion");
    }
  };

  const handleDeleteGroup = async (id: Id<"unitGroups">) => {
    if (!confirm("Delete this unit group and all its conversions?")) return;
    try {
      await deleteGroup({ id });
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleDeleteConversion = async (id: Id<"unitConversions">) => {
    try {
      await deleteConversion({ id });
      toast.success("Conversion removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  if (!groups) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ruler className="w-6 h-6" />
            Units of Measure
          </h1>
          <p className="text-muted-foreground mt-1">
            Define unit groups and conversion rules for products
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" />New Unit Group
        </Button>
      </div>

      {/* Templates section */}
      {groups.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Quick Start Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Button key={t.name} variant="secondary" size="sm"
                  onClick={() => handleCreateFromTemplate(t)}
                  className="cursor-pointer">
                  <Plus className="w-3 h-3 mr-1" />{t.name} ({t.baseUnit})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
            <EmptyTitle>No unit groups defined</EmptyTitle>
            <EmptyDescription>
              Create unit groups to define measurement conversions for your products
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
              Create Unit Group
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Unit groups list */}
      <div className="grid gap-4">
        {groups.map((group) => (
          <GroupCard
            key={group._id}
            group={group}
            onAddConversion={() => {
              setShowAddConv(group._id);
              setConvFrom(group.baseUnit);
              setConvTo("");
              setConvFactor("");
            }}
            onDeleteGroup={() => handleDeleteGroup(group._id)}
            onDeleteConversion={handleDeleteConversion}
          />
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Unit Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Group Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Weight, Length, Packaging" />
            </div>
            <div className="space-y-2">
              <Label>Base Unit *</Label>
              <Input value={newBaseUnit} onChange={(e) => setNewBaseUnit(e.target.value)} placeholder="e.g. kg, m, pc" />
              <p className="text-xs text-muted-foreground">The fundamental unit all others convert to/from</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleCreateGroup} className="cursor-pointer">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add conversion dialog */}
      <Dialog open={!!showAddConv} onOpenChange={(open) => !open && setShowAddConv(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Conversion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Label>From Unit</Label>
                <Input value={convFrom} onChange={(e) => setConvFrom(e.target.value)} placeholder="e.g. kg" />
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground mt-6" />
              <div className="flex-1 space-y-2">
                <Label>To Unit</Label>
                <Input value={convTo} onChange={(e) => setConvTo(e.target.value)} placeholder="e.g. g" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Conversion Factor *</Label>
              <Input type="number" step="any" min="0" value={convFactor} onChange={(e) => setConvFactor(e.target.value)} placeholder="e.g. 1000" />
              <p className="text-xs text-muted-foreground">
                1 {convFrom || "from"} = {convFactor || "?"} {convTo || "to"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddConv(null)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleAddConversion} className="cursor-pointer">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Group Card ────────────────────────────────────────────────────
type GroupData = {
  _id: Id<"unitGroups">;
  name: string;
  description?: string;
  baseUnit: string;
  isActive: boolean;
  conversionsCount: number;
  units: string[];
};

function GroupCard({
  group,
  onAddConversion,
  onDeleteGroup,
  onDeleteConversion,
}: {
  group: GroupData;
  onAddConversion: () => void;
  onDeleteGroup: () => void;
  onDeleteConversion: (id: Id<"unitConversions">) => void;
}) {
  const conversions = useQuery(api.unitMeasures.listConversions, { unitGroupId: group._id });

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg">{group.name}</h3>
            <Badge variant="secondary">Base: {group.baseUnit}</Badge>
            {!group.isActive && <Badge variant="destructive">Inactive</Badge>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onAddConversion} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-1" />Add Unit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDeleteGroup} className="cursor-pointer text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {group.description && (
          <p className="text-sm text-muted-foreground">{group.description}</p>
        )}
        {/* Units list */}
        <div className="flex flex-wrap gap-2">
          {group.units.map((u) => (
            <Badge key={u} className={u === group.baseUnit ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
              {u}{u === group.baseUnit && " (base)"}
            </Badge>
          ))}
        </div>
        {/* Conversions table */}
        {conversions && conversions.length > 0 && (
          <div className="border rounded-lg overflow-hidden mt-2">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2">From</th>
                  <th className="text-center px-3 py-2"></th>
                  <th className="text-left px-3 py-2">To</th>
                  <th className="text-right px-3 py-2">Factor</th>
                  <th className="text-right px-3 py-2">Meaning</th>
                  <th className="text-center px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="px-3 py-2 font-medium">{c.fromUnit}</td>
                    <td className="text-center px-1"><ArrowRight className="w-3 h-3 text-muted-foreground inline" /></td>
                    <td className="px-3 py-2 font-medium">{c.toUnit}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{c.conversionFactor}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      1 {c.fromUnit} = {c.conversionFactor} {c.toUnit}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => onDeleteConversion(c._id)}
                        className="text-destructive hover:text-destructive/80 cursor-pointer">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
