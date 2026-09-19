import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { ShieldCheck, Save, RotateCcw } from "lucide-react";

// All app modules with their default permissions per role
const APP_MODULES = [
  { key: "dashboard", label: "Dashboard", category: "Core" },
  { key: "sales", label: "Sales & POS", category: "Core" },
  { key: "products", label: "Products & Services", category: "Core" },
  { key: "warehouses", label: "Warehouses", category: "Inventory" },
  { key: "stock_tracking", label: "Stock Tracking", category: "Inventory" },
  { key: "advanced_inventory", label: "Advanced Inventory", category: "Inventory" },
  { key: "invoicing", label: "Invoicing & Sales", category: "Finance" },
  { key: "vendors", label: "Vendors & Bills", category: "Finance" },
  { key: "general_ledger", label: "General Ledger", category: "Finance" },
  { key: "banking", label: "Multi-Currency & Banking", category: "Finance" },
  { key: "tax", label: "Tax Management", category: "Finance" },
  { key: "budget", label: "Budget & Cash Flow", category: "Finance" },
  { key: "expense_claims", label: "Expense Claims", category: "Finance" },
  { key: "batch_operations", label: "Batch Operations", category: "Finance" },
  { key: "returns", label: "Returns & Landed Cost", category: "Finance" },
  { key: "pricing", label: "Pricing", category: "Sales" },
  { key: "crm", label: "CRM & Leads", category: "Sales" },
  { key: "loyalty", label: "Loyalty Program", category: "Sales" },
  { key: "orders", label: "Orders", category: "Sales" },
  { key: "purchasing", label: "Purchasing", category: "Procurement" },
  { key: "projects", label: "Job Costing & Projects", category: "Operations" },
  { key: "assets", label: "Fixed Assets", category: "Operations" },
  { key: "vehicles", label: "Vehicles", category: "Operations" },
  { key: "payroll", label: "Payroll", category: "HR" },
  { key: "branches", label: "Branches", category: "Admin" },
  { key: "email_alerts", label: "Email Alerts", category: "Admin" },
  { key: "warranties", label: "Warranties", category: "Admin" },
  { key: "reports", label: "Scheduled Reports", category: "Admin" },
  { key: "monitoring", label: "Monitoring", category: "Admin" },
  { key: "data", label: "Data Import/Export", category: "Admin" },
  { key: "users", label: "Team Management", category: "Admin" },
  { key: "company_profile", label: "Company Profile", category: "Admin" },
] as const;

// Default permissions for each role
const DEFAULT_PERMISSIONS: Record<string, Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>> = {
  manager: Object.fromEntries(
    APP_MODULES.map((m) => [
      m.key,
      {
        canView: true,
        canCreate: m.category !== "Admin",
        canEdit: m.category !== "Admin",
        canDelete: false,
      },
    ])
  ),
  staff: Object.fromEntries(
    APP_MODULES.map((m) => [
      m.key,
      {
        canView: ["Core", "Inventory"].includes(m.category),
        canCreate: ["Core"].includes(m.category),
        canEdit: ["Core"].includes(m.category),
        canDelete: false,
      },
    ])
  ),
};

type PermRow = {
  module: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export default function AccessRulesTab() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const [selectedRole, setSelectedRole] = useState<"manager" | "staff">("manager");
  const rules = useQuery(api.users.listAccessRules, { role: selectedRole });
  const bulkUpdate = useMutation(api.users.bulkUpdateAccessRules);
  const [localRules, setLocalRules] = useState<PermRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Build local rules from saved rules + defaults
  useEffect(() => {
    const built: PermRow[] = APP_MODULES.map((m) => {
      const saved = rules?.find((r) => r.module === m.key);
      if (saved) {
        return { module: m.key, canView: saved.canView, canCreate: saved.canCreate, canEdit: saved.canEdit, canDelete: saved.canDelete };
      }
      const def = DEFAULT_PERMISSIONS[selectedRole][m.key];
      return { module: m.key, ...def };
    });
    setLocalRules(built);
    setHasChanges(false);
  }, [rules, selectedRole]);

  const isOwner = currentUser?.role === "owner";

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Only owners can manage access rules</p>
        </CardContent>
      </Card>
    );
  }

  if (!rules) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const togglePerm = (module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete") => {
    setLocalRules((prev) =>
      prev.map((r) => {
        if (r.module !== module) return r;
        const updated = { ...r, [field]: !r[field] };
        // If canView is turned off, disable all
        if (field === "canView" && !updated.canView) {
          updated.canCreate = false;
          updated.canEdit = false;
          updated.canDelete = false;
        }
        // If any permission is enabled, ensure canView is on
        if (field !== "canView" && updated[field]) {
          updated.canView = true;
        }
        return updated;
      })
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await bulkUpdate({ role: selectedRole, rules: localRules });
      toast.success(`Access rules saved for ${selectedRole}`);
      setHasChanges(false);
    } catch {
      toast.error("Failed to save access rules");
    }
  };

  const handleReset = () => {
    const reset: PermRow[] = APP_MODULES.map((m) => {
      const def = DEFAULT_PERMISSIONS[selectedRole][m.key];
      return { module: m.key, ...def };
    });
    setLocalRules(reset);
    setHasChanges(true);
  };

  // Group modules by category
  const categories = [...new Set(APP_MODULES.map((m) => m.category))];

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Access Rules Configuration</p>
              <p className="text-muted-foreground">
                Control what each role can view, create, edit, and delete across all modules.
                Owners always have full access.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role selector */}
      <Tabs value={selectedRole} onValueChange={(v) => setSelectedRole(v as "manager" | "staff")}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="manager" className="cursor-pointer">
              Manager Permissions
            </TabsTrigger>
            <TabsTrigger value="staff" className="cursor-pointer">
              Staff Permissions
            </TabsTrigger>
          </TabsList>

          {hasChanges && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-1" /> Reset to Default
              </Button>
              <Button size="sm" className="cursor-pointer" onClick={handleSave}>
                <Save className="w-4 h-4 mr-1" /> Save Changes
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="manager" className="mt-4">
          <PermissionsGrid
            categories={categories}
            localRules={localRules}
            togglePerm={togglePerm}
          />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <PermissionsGrid
            categories={categories}
            localRules={localRules}
            togglePerm={togglePerm}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PermissionsGrid({
  categories,
  localRules,
  togglePerm,
}: {
  categories: string[];
  localRules: PermRow[];
  togglePerm: (module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete") => void;
}) {
  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const modules = APP_MODULES.filter((m) => m.category === category);
        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="secondary">{category}</Badge>
                <span className="text-muted-foreground font-normal text-xs">
                  {modules.length} module{modules.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium w-[200px]">Module</th>
                      <th className="text-center py-2 px-2 font-medium w-[80px]">View</th>
                      <th className="text-center py-2 px-2 font-medium w-[80px]">Create</th>
                      <th className="text-center py-2 px-2 font-medium w-[80px]">Edit</th>
                      <th className="text-center py-2 px-2 font-medium w-[80px]">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((m) => {
                      const rule = localRules.find((r) => r.module === m.key);
                      if (!rule) return null;
                      return (
                        <tr key={m.key} className="border-t">
                          <td className="py-2 px-2 font-medium">{m.label}</td>
                          <td className="text-center py-2 px-2">
                            <Checkbox
                              checked={rule.canView}
                              onCheckedChange={() => togglePerm(m.key, "canView")}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="text-center py-2 px-2">
                            <Checkbox
                              checked={rule.canCreate}
                              onCheckedChange={() => togglePerm(m.key, "canCreate")}
                              disabled={!rule.canView}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="text-center py-2 px-2">
                            <Checkbox
                              checked={rule.canEdit}
                              onCheckedChange={() => togglePerm(m.key, "canEdit")}
                              disabled={!rule.canView}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="text-center py-2 px-2">
                            <Checkbox
                              checked={rule.canDelete}
                              onCheckedChange={() => togglePerm(m.key, "canDelete")}
                              disabled={!rule.canView}
                              className="cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
