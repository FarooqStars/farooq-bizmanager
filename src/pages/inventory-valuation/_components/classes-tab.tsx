import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { FolderTree, Plus, Pencil, Trash2, Circle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

export default function ClassesTab() {
  const classes = useQuery(api.inventoryValuation.listClasses);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingClass, setEditingClass] = useState<Doc<"inventoryClasses"> | null>(null);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";

  if (!classes) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  // Group by parent
  const topLevel = classes.filter((c) => !c.parentId);
  const children = (parentId: Id<"inventoryClasses">) => classes.filter((c) => c.parentId === parentId);

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button className="cursor-pointer" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Class
          </Button>
        </div>
      )}

      {classes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FolderTree /></EmptyMedia>
            <EmptyTitle>No classes yet</EmptyTitle>
            <EmptyDescription>Classes help you organize products and track P&L by department</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canManage && (
              <Button size="sm" className="cursor-pointer" onClick={() => setShowCreateDialog(true)}>
                Create First Class
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderTree className="w-4 h-4" /> Classes / Departments
              <Badge variant="secondary" className="text-xs">{classes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {topLevel.map((cls) => (
                <ClassRow
                  key={cls._id}
                  cls={cls}
                  depth={0}
                  children={children(cls._id)}
                  allClasses={classes}
                  canManage={canManage}
                  onEdit={setEditingClass}
                  isOwner={currentUser?.role === "owner"}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showCreateDialog && (
        <CreateClassDialog
          classes={classes}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
      {editingClass && (
        <EditClassDialog
          cls={editingClass}
          classes={classes}
          onClose={() => setEditingClass(null)}
          isOwner={currentUser?.role === "owner"}
        />
      )}
    </div>
  );
}

function ClassRow({
  cls,
  depth,
  children,
  allClasses,
  canManage,
  onEdit,
  isOwner,
}: {
  cls: Doc<"inventoryClasses">;
  depth: number;
  children: Doc<"inventoryClasses">[];
  allClasses: Doc<"inventoryClasses">[];
  canManage: boolean;
  onEdit: (c: Doc<"inventoryClasses">) => void;
  isOwner?: boolean;
}) {
  const deleteClass = useMutation(api.inventoryValuation.deleteClass);

  const handleDelete = async () => {
    try {
      await deleteClass({ id: cls._id });
      toast.success(`"${cls.name}" deleted`);
    } catch {
      toast.error("Cannot delete: class is in use by products");
    }
  };

  const subChildren = (parentId: Id<"inventoryClasses">) => allClasses.filter((c) => c.parentId === parentId);

  return (
    <>
      <div
        className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 group"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        <Circle className={cn("w-2.5 h-2.5 fill-current flex-shrink-0", cls.isActive ? "text-green-500" : "text-gray-400")} />
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm">{cls.name}</span>
          {cls.description && (
            <span className="text-xs text-muted-foreground ml-2">{cls.description}</span>
          )}
        </div>
        {!cls.isActive && (
          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
        )}
        {canManage && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" onClick={() => onEdit(cls)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {isOwner && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer text-destructive hover:text-destructive" onClick={handleDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
      {children.map((child) => (
        <ClassRow
          key={child._id}
          cls={child}
          depth={depth + 1}
          children={subChildren(child._id)}
          allClasses={allClasses}
          canManage={canManage}
          onEdit={onEdit}
          isOwner={isOwner}
        />
      ))}
    </>
  );
}

function CreateClassDialog({
  classes,
  onClose,
}: {
  classes: Doc<"inventoryClasses">[];
  onClose: () => void;
}) {
  const createClass = useMutation(api.inventoryValuation.createClass);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await createClass({
        name: name.trim(),
        description: description.trim() || undefined,
        parentId: parentId !== "none" ? (parentId as Id<"inventoryClasses">) : undefined,
      });
      toast.success(`Class "${name}" created`);
      onClose();
    } catch {
      toast.error("Failed to create class");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Class</DialogTitle>
          <DialogDescription>Add a new class/department to organize your products</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electronics, Furniture..." autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Parent Class</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Top Level)</SelectItem>
                {classes.filter((c) => c.isActive).map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} className="cursor-pointer">
            {saving ? "Creating..." : "Create Class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditClassDialog({
  cls,
  classes,
  onClose,
  isOwner,
}: {
  cls: Doc<"inventoryClasses">;
  classes: Doc<"inventoryClasses">[];
  onClose: () => void;
  isOwner?: boolean;
}) {
  const updateClass = useMutation(api.inventoryValuation.updateClass);
  const [name, setName] = useState(cls.name);
  const [description, setDescription] = useState(cls.description ?? "");
  const [parentId, setParentId] = useState<string>(cls.parentId ?? "none");
  const [isActive, setIsActive] = useState(cls.isActive);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await updateClass({
        id: cls._id,
        name: name.trim(),
        description: description.trim() || undefined,
        parentId: parentId !== "none" ? (parentId as Id<"inventoryClasses">) : undefined,
        isActive,
      });
      toast.success("Class updated");
      onClose();
    } catch {
      toast.error("Failed to update class");
    } finally {
      setSaving(false);
    }
  };

  // Filter self and children from parent options
  const availableParents = classes.filter((c) => c._id !== cls._id && c.isActive);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Class</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Parent Class</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {availableParents.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={isActive ? "active" : "inactive"} onValueChange={(v) => setIsActive(v === "active")}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="cursor-pointer">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
