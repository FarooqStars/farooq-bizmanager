import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Plus, Shield, Trash2, Edit2, Wand2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const MODULES = [
  "dashboard", "sales", "products", "warehouses", "inventory",
  "vendors", "accounting", "banking", "invoicing", "purchasing",
  "advanced_inventory", "pricing", "communications", "projects",
  "vehicles", "assets", "orders", "payroll", "monitoring",
  "data", "users", "audit", "reports", "settings",
];

const ACTIONS = ["view", "create", "edit", "delete", "export", "approve"];

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  sales: "Sales",
  products: "Products",
  warehouses: "Warehouses",
  inventory: "Inventory",
  vendors: "Vendors & Bills",
  accounting: "Accounting",
  banking: "Banking",
  invoicing: "Invoicing",
  purchasing: "Purchasing",
  advanced_inventory: "Advanced Inventory",
  pricing: "Pricing",
  communications: "Communications",
  projects: "Job Costing",
  vehicles: "Vehicles",
  assets: "Assets",
  orders: "Orders",
  payroll: "Payroll & HR",
  monitoring: "Monitoring",
  data: "Data Import/Export",
  users: "User Management",
  audit: "Audit Log",
  reports: "Reports",
  settings: "Settings",
};

export default function RolesTab() {
  const roles = useQuery(api.security.listRoles);
  const createRole = useMutation(api.security.createRole);
  const updateRole = useMutation(api.security.updateRole);
  const deleteRole = useMutation(api.security.deleteRole);
  const seedRoles = useMutation(api.security.seedSystemRoles);

  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<{ id: Id<"customRoles">; name: string; description: string; permissions: Set<string> } | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  if (!roles) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  const handleSeed = async () => {
    try {
      await seedRoles({});
      toast.success("System role templates created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to seed roles");
    }
  };

  const handleCreate = async () => {
    if (!form.name) { toast.error("Role name is required"); return; }
    try {
      await createRole({ name: form.name, description: form.description || undefined, permissions: Array.from(selectedPerms) });
      toast.success("Role created");
      setShowCreate(false);
      setForm({ name: "", description: "" });
      setSelectedPerms(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create role");
    }
  };

  const handleUpdate = async () => {
    if (!editingRole) return;
    try {
      await updateRole({ roleId: editingRole.id, name: editingRole.name, description: editingRole.description || undefined, permissions: Array.from(editingRole.permissions) });
      toast.success("Role updated");
      setEditingRole(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleDelete = async (id: Id<"customRoles">) => {
    try {
      await deleteRole({ roleId: id });
      toast.success("Role deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete role");
    }
  };

  const togglePerm = (perm: string, perms: Set<string>, setPerms: (s: Set<string>) => void) => {
    const next = new Set(perms);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    setPerms(next);
  };

  const toggleModuleAll = (module: string, perms: Set<string>, setPerms: (s: Set<string>) => void) => {
    const next = new Set(perms);
    const modulePerms = ACTIONS.map((a) => `${module}.${a}`);
    const allSelected = modulePerms.every((p) => next.has(p));
    if (allSelected) {
      modulePerms.forEach((p) => next.delete(p));
    } else {
      modulePerms.forEach((p) => next.add(p));
    }
    setPerms(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {roles.length === 0 && (
            <Button variant="secondary" className="cursor-pointer" onClick={handleSeed}>
              <Wand2 className="w-4 h-4 mr-1" /> Generate Role Templates
            </Button>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> Create Custom Role
        </Button>
      </div>

      {roles.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Shield /></EmptyMedia>
            <EmptyTitle>No roles defined</EmptyTitle>
            <EmptyDescription>Click "Generate Role Templates" to create common role templates, or create custom roles</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={handleSeed}>Generate Templates</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <Card key={role._id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{role.name}</span>
                      {role.isSystem && <Badge variant="secondary">System</Badge>}
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {role.permissions.length} permissions
                      </Badge>
                    </div>
                    {role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {MODULES.filter((m) => role.permissions.some((p) => p.startsWith(m + "."))).map((m) => (
                        <Badge key={m} variant="secondary" className="text-xs">{MODULE_LABELS[m] ?? m}</Badge>
                      ))}
                    </div>
                  </div>
                  {!role.isSystem && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer"
                        onClick={() => setEditingRole({
                          id: role._id,
                          name: role.name,
                          description: role.description ?? "",
                          permissions: new Set(role.permissions),
                        })}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleDelete(role._id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Role Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Custom Role</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Role Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Senior Accountant" />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Access to financial modules" />
              </div>
            </div>
            <PermissionMatrix perms={selectedPerms} setPerms={setSelectedPerms} togglePerm={togglePerm} toggleModuleAll={toggleModuleAll} />
            <Button className="w-full cursor-pointer" onClick={handleCreate}>Create Role</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editingRole} onOpenChange={(o) => { if (!o) setEditingRole(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Role: {editingRole?.name}</DialogTitle></DialogHeader>
          {editingRole && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Role Name</Label>
                  <Input value={editingRole.name} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={editingRole.description} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} />
                </div>
              </div>
              <PermissionMatrix
                perms={editingRole.permissions}
                setPerms={(s) => setEditingRole({ ...editingRole, permissions: s })}
                togglePerm={togglePerm}
                toggleModuleAll={toggleModuleAll}
              />
              <Button className="w-full cursor-pointer" onClick={handleUpdate}>Save Changes</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionMatrix({
  perms, setPerms, togglePerm, toggleModuleAll,
}: {
  perms: Set<string>;
  setPerms: (s: Set<string>) => void;
  togglePerm: (perm: string, perms: Set<string>, setPerms: (s: Set<string>) => void) => void;
  toggleModuleAll: (module: string, perms: Set<string>, setPerms: (s: Set<string>) => void) => void;
}) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Module</th>
            {ACTIONS.map((a) => (
              <th key={a} className="px-2 py-2 text-center font-medium capitalize">{a}</th>
            ))}
            <th className="px-2 py-2 text-center font-medium">All</th>
          </tr>
        </thead>
        <tbody>
          {MODULES.map((mod) => {
            const modulePerms = ACTIONS.map((a) => `${mod}.${a}`);
            const allSelected = modulePerms.every((p) => perms.has(p));
            return (
              <tr key={mod} className="border-t">
                <td className="px-3 py-1.5 font-medium">{MODULE_LABELS[mod] ?? mod}</td>
                {ACTIONS.map((a) => {
                  const perm = `${mod}.${a}`;
                  return (
                    <td key={a} className="px-2 py-1.5 text-center">
                      <Checkbox
                        checked={perms.has(perm)}
                        onCheckedChange={() => togglePerm(perm, perms, setPerms)}
                        className="cursor-pointer"
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => toggleModuleAll(mod, perms, setPerms)}
                    className="cursor-pointer"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
