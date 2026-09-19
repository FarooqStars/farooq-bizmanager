import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Heart, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import type { Id, Doc } from "@/convex/_generated/dataModel.d.ts";

const BENEFIT_TYPES = [
  { value: "medical_insurance", label: "Medical Insurance" },
  { value: "life_insurance", label: "Life Insurance" },
  { value: "dental", label: "Dental" },
  { value: "vision", label: "Vision" },
  { value: "housing_benefit", label: "Housing Benefit" },
  { value: "education", label: "Education" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Other" },
] as const;

type BenefitType = typeof BENEFIT_TYPES[number]["value"];

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function BenefitsTab() {
  const employees = useQuery(api.payroll.listEmployees, {});
  const benefits = useQuery(api.payrollEnhancements.listBenefits, {});
  const deleteBenefit = useMutation(api.payrollEnhancements.deleteBenefit);
  const [showCreate, setShowCreate] = useState(false);
  const [editingBenefit, setEditingBenefit] = useState<Doc<"employeeBenefits"> | null>(null);

  if (!employees || !benefits) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const employeeMap = new Map(employees.map((e) => [e._id, e]));
  const activeBenefits = benefits.filter((b) => b.status === "active");
  const totalMonthlyPremium = activeBenefits.reduce((s, b) => s + (b.monthlyPremium ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Active Benefits</p>
            <p className="text-2xl font-bold">{activeBenefits.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Employees Covered</p>
            <p className="text-2xl font-bold">{new Set(activeBenefits.map((b) => b.employeeId)).size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground">Total Monthly Premium</p>
            <p className="text-2xl font-bold">{totalMonthlyPremium.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" /> Add Benefit
        </Button>
      </div>

      {/* List */}
      {benefits.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Heart /></EmptyMedia>
            <EmptyTitle>No benefits registered</EmptyTitle>
            <EmptyDescription>Add employee benefits like medical insurance, dental, vision etc.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">Add Benefit</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Employee</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Provider</th>
                    <th className="p-3 font-medium text-right">Premium/mo</th>
                    <th className="p-3 font-medium text-right">Coverage</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Dates</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {benefits.map((b) => {
                    const emp = employeeMap.get(b.employeeId);
                    return (
                      <tr key={b._id} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-medium">{emp?.name ?? "Unknown"}</td>
                        <td className="p-3">{BENEFIT_TYPES.find((t) => t.value === b.type)?.label ?? b.type}</td>
                        <td className="p-3 text-muted-foreground">{b.provider ?? "—"}</td>
                        <td className="p-3 text-right">{b.monthlyPremium?.toLocaleString() ?? "—"}</td>
                        <td className="p-3 text-right">{b.coverageAmount?.toLocaleString() ?? "—"}</td>
                        <td className="p-3">
                          <Badge className={`text-xs capitalize ${statusColors[b.status]}`}>{b.status}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{b.startDate} → {b.endDate ?? "Ongoing"}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setEditingBenefit(b)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer text-destructive"
                              onClick={async () => {
                                try {
                                  await deleteBenefit({ id: b._id });
                                  toast.success("Benefit deleted");
                                } catch { toast.error("Failed to delete"); }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <BenefitFormDialog employees={employees} onClose={() => setShowCreate(false)} />
      )}
      {editingBenefit && (
        <BenefitFormDialog employees={employees} benefit={editingBenefit} onClose={() => setEditingBenefit(null)} />
      )}
    </div>
  );
}

// ─── Benefit Form Dialog ─────────────────────────────────────────

function BenefitFormDialog({
  employees,
  benefit,
  onClose,
}: {
  employees: Array<{ _id: Id<"employees">; name: string; employeeId: string }>;
  benefit?: Doc<"employeeBenefits">;
  onClose: () => void;
}) {
  const createBenefit = useMutation(api.payrollEnhancements.createBenefit);
  const updateBenefit = useMutation(api.payrollEnhancements.updateBenefit);

  const [employeeId, setEmployeeId] = useState(benefit?.employeeId ?? "");
  const [type, setType] = useState<string>(benefit?.type ?? "medical_insurance");
  const [provider, setProvider] = useState(benefit?.provider ?? "");
  const [policyNumber, setPolicyNumber] = useState(benefit?.policyNumber ?? "");
  const [coverageAmount, setCoverageAmount] = useState(benefit?.coverageAmount?.toString() ?? "");
  const [monthlyPremium, setMonthlyPremium] = useState(benefit?.monthlyPremium?.toString() ?? "");
  const [companyContribution, setCompanyContribution] = useState(benefit?.companyContribution?.toString() ?? "70");
  const [employeeContribution, setEmployeeContribution] = useState(benefit?.employeeContribution?.toString() ?? "30");
  const [startDate, setStartDate] = useState(benefit?.startDate ?? new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(benefit?.endDate ?? "");
  const [status, setStatus] = useState(benefit?.status ?? "active");
  const [notes, setNotes] = useState(benefit?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!employeeId) { toast.error("Select an employee"); return; }
    setSaving(true);
    try {
      if (benefit) {
        await updateBenefit({
          id: benefit._id,
          type: type as BenefitType,
          provider: provider.trim() || undefined,
          policyNumber: policyNumber.trim() || undefined,
          coverageAmount: coverageAmount ? Number(coverageAmount) : undefined,
          monthlyPremium: monthlyPremium ? Number(monthlyPremium) : undefined,
          companyContribution: companyContribution ? Number(companyContribution) : undefined,
          employeeContribution: employeeContribution ? Number(employeeContribution) : undefined,
          startDate,
          endDate: endDate || undefined,
          status: status as "active" | "expired" | "cancelled",
          notes: notes.trim() || undefined,
        });
        toast.success("Benefit updated");
      } else {
        await createBenefit({
          employeeId: employeeId as Id<"employees">,
          type: type as BenefitType,
          provider: provider.trim() || undefined,
          policyNumber: policyNumber.trim() || undefined,
          coverageAmount: coverageAmount ? Number(coverageAmount) : undefined,
          monthlyPremium: monthlyPremium ? Number(monthlyPremium) : undefined,
          companyContribution: companyContribution ? Number(companyContribution) : undefined,
          employeeContribution: employeeContribution ? Number(employeeContribution) : undefined,
          startDate,
          endDate: endDate || undefined,
          status: "active",
          notes: notes.trim() || undefined,
        });
        toast.success("Benefit added");
      }
      onClose();
    } catch { toast.error("Failed to save benefit"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{benefit ? "Edit" : "Add"} Employee Benefit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!benefit}>
                <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e._id} value={e._id}>{e.name} ({e.employeeId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Benefit Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BENEFIT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Insurance company..." />
            </div>
            <div className="space-y-2">
              <Label>Policy Number</Label>
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="POL-12345" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Coverage Amount</Label>
              <Input type="number" value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} placeholder="100000" />
            </div>
            <div className="space-y-2">
              <Label>Monthly Premium</Label>
              <Input type="number" value={monthlyPremium} onChange={(e) => setMonthlyPremium(e.target.value)} placeholder="500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Company Contribution (%)</Label>
              <Input type="number" value={companyContribution} onChange={(e) => setCompanyContribution(e.target.value)} placeholder="70" />
            </div>
            <div className="space-y-2">
              <Label>Employee Contribution (%)</Label>
              <Input type="number" value={employeeContribution} onChange={(e) => setEmployeeContribution(e.target.value)} placeholder="30" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {benefit && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "active" | "expired" | "cancelled")}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional details..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : benefit ? "Update" : "Add Benefit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
