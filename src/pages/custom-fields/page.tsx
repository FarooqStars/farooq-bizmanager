import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Settings2, Plus, Trash2, Pencil, Layers } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// ── Constants ───────────────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Vendors" },
  { value: "product", label: "Products" },
  { value: "invoice", label: "Invoices" },
  { value: "bill", label: "Bills" },
  { value: "employee", label: "Employees" },
] as const;

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Dropdown" },
  { value: "textarea", label: "Long Text" },
] as const;

type EntityType = (typeof ENTITY_TYPES)[number]["value"];
type FieldType = (typeof FIELD_TYPES)[number]["value"];

// ── Main component ──────────────────────────────────────────────────────────

export default function CustomFieldsPage() {
  const [selectedEntity, setSelectedEntity] = useState<EntityType>("customer");
  const [showCreate, setShowCreate] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const fields = useQuery(api.customFields.listByEntity, {
    entityType: selectedEntity,
  });
  const createField = useMutation(api.customFields.create);
  const updateField = useMutation(api.customFields.update);
  const removeField = useMutation(api.customFields.remove);

  const handleDelete = async (id: Id<"customFields">) => {
    if (!confirm("Delete this custom field and all its values?")) return;
    try {
      await removeField({ id });
      toast.success("Field deleted");
    } catch {
      toast.error("Failed to delete field");
    }
  };

  const handleToggleActive = async (id: Id<"customFields">, isActive: boolean) => {
    try {
      await updateField({ id, isActive: !isActive });
      toast.success(isActive ? "Field disabled" : "Field enabled");
    } catch {
      toast.error("Failed to update field");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="w-6 h-6" /> Custom Fields
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Define custom fields to capture additional information on records
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" /> Add Field
        </Button>
      </div>

      {/* Entity Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {ENTITY_TYPES.map((et) => (
          <Badge
            key={et.value}
            variant={selectedEntity === et.value ? "default" : "secondary"}
            className="cursor-pointer text-sm px-3 py-1.5"
            onClick={() => setSelectedEntity(et.value)}
          >
            {et.label}
          </Badge>
        ))}
      </div>

      {/* Fields Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="w-4 h-4" />
            {ENTITY_TYPES.find((e) => e.value === selectedEntity)?.label} Fields
            {fields && <Badge variant="secondary" className="ml-2">{fields.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {!fields && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
          {fields && fields.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Settings2 /></EmptyMedia>
                <EmptyTitle>No custom fields</EmptyTitle>
                <EmptyDescription>
                  Add custom fields to capture extra data on {ENTITY_TYPES.find((e) => e.value === selectedEntity)?.label.toLowerCase()}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
                  <Plus className="w-4 h-4 mr-1" /> Add Field
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {fields && fields.length > 0 && (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Label</TableHead>
                    <TableHead className="text-xs">Field Name</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Required</TableHead>
                    <TableHead className="text-xs">Active</TableHead>
                    <TableHead className="text-xs w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field) => (
                    <TableRow key={field._id}>
                      <TableCell className="text-sm font-medium">{field.fieldLabel}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {field.fieldName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {FIELD_TYPES.find((ft) => ft.value === field.fieldType)?.label ?? field.fieldType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {field.isRequired ? (
                          <Badge className="text-xs">Yes</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={field.isActive}
                          onCheckedChange={() => handleToggleActive(field._id, field.isActive)}
                          className="cursor-pointer"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingField(field._id)}
                            className="cursor-pointer h-7 w-7 p-0"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(field._id)}
                            className="cursor-pointer h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <CreateFieldDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        entityType={selectedEntity}
        onCreate={createField}
      />

      {/* Edit Dialog */}
      {editingField && fields && (
        <EditFieldDialog
          open={!!editingField}
          onClose={() => setEditingField(null)}
          field={fields.find((f) => f._id === editingField)!}
          onUpdate={updateField}
        />
      )}
    </div>
  );
}

// ── Create Dialog ───────────────────────────────────────────────────────────

function CreateFieldDialog({
  open,
  onClose,
  entityType,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  entityType: EntityType;
  onCreate: (args: {
    entityType: "customer" | "vendor" | "product" | "invoice" | "bill" | "employee";
    fieldName: string;
    fieldLabel: string;
    fieldType: "text" | "number" | "date" | "boolean" | "select" | "textarea";
    options?: string[];
    isRequired: boolean;
  }) => Promise<unknown>;
}) {
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState("");

  const handleSubmit = async () => {
    if (!fieldLabel.trim()) {
      toast.error("Enter a field label");
      return;
    }
    // Generate fieldName from label
    const fieldName = fieldLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    try {
      await onCreate({
        entityType,
        fieldName,
        fieldLabel: fieldLabel.trim(),
        fieldType,
        options: fieldType === "select" && options.trim()
          ? options.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
        isRequired,
      });
      toast.success("Custom field created");
      setFieldLabel("");
      setFieldType("text");
      setIsRequired(false);
      setOptions("");
      onClose();
    } catch {
      toast.error("Failed to create field");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Field Label</Label>
            <Input
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              placeholder="e.g. Tax ID, Preferred Color"
            />
          </div>
          <div className="space-y-2">
            <Label>Field Type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldType === "select" && (
            <div className="space-y-2">
              <Label>Options (comma-separated)</Label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} className="cursor-pointer" />
            <Label>Required field</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Entity: {ENTITY_TYPES.find((e) => e.value === entityType)?.label}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="cursor-pointer">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

function EditFieldDialog({
  open,
  onClose,
  field,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  field: {
    _id: Id<"customFields">;
    fieldLabel: string;
    fieldType: string;
    isRequired: boolean;
    options?: string[];
  };
  onUpdate: (args: {
    id: Id<"customFields">;
    fieldLabel?: string;
    fieldType?: "text" | "number" | "date" | "boolean" | "select" | "textarea";
    options?: string[];
    isRequired?: boolean;
  }) => Promise<unknown>;
}) {
  const [fieldLabel, setFieldLabel] = useState(field.fieldLabel);
  const [fieldType, setFieldType] = useState<FieldType>(field.fieldType as FieldType);
  const [isRequired, setIsRequired] = useState(field.isRequired);
  const [options, setOptions] = useState(field.options?.join(", ") ?? "");

  const handleSubmit = async () => {
    if (!fieldLabel.trim()) {
      toast.error("Enter a field label");
      return;
    }
    try {
      await onUpdate({
        id: field._id,
        fieldLabel: fieldLabel.trim(),
        fieldType,
        options: fieldType === "select" && options.trim()
          ? options.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined,
        isRequired,
      });
      toast.success("Field updated");
      onClose();
    } catch {
      toast.error("Failed to update field");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Custom Field</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Field Label</Label>
            <Input
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Field Type</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldType === "select" && (
            <div className="space-y-2">
              <Label>Options (comma-separated)</Label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} className="cursor-pointer" />
            <Label>Required field</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="cursor-pointer">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
