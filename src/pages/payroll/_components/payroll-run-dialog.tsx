import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import EmployeePhoto from "./employee-photo.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const payrollRunSchema = z.object({
  title: z.string().min(1, "Title is required"),
  periodStart: z.string().min(1, "Start date is required"),
  periodEnd: z.string().min(1, "End date is required"),
  payDate: z.string().min(1, "Pay date is required"),
  notes: z.string().optional(),
});

type PayrollRunFormData = z.infer<typeof payrollRunSchema>;

type EmployeeAdjustment = {
  overtimeHours: number;
  overtimeType: "regular" | "restDay" | "holiday";
  deduction: number;
  deductionDetails: string;
};

type Props = {
  onClose: () => void;
};

export default function PayrollRunDialog({ onClose }: Props) {
  const employees = useQuery(api.payroll.listEmployees, { activeOnly: true });
  const createPayrollRun = useMutation(api.payroll.createPayrollRun);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [adjustments, setAdjustments] = useState<Record<string, EmployeeAdjustment>>({});
  const [step, setStep] = useState<"select" | "adjust">("select");

  const { register, handleSubmit, formState: { errors } } = useForm<PayrollRunFormData>({
    resolver: zodResolver(payrollRunSchema),
    defaultValues: {
      title: "",
      periodStart: new Date().toISOString().slice(0, 10),
      periodEnd: new Date().toISOString().slice(0, 10),
      payDate: new Date().toISOString().slice(0, 10),
      notes: "",
    },
  });

  const toggleEmployee = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!employees) return;
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map((e) => e._id)));
    }
  };

  const getAdjustment = (id: string): EmployeeAdjustment => {
    return adjustments[id] ?? { overtimeHours: 0, overtimeType: "regular", deduction: 0, deductionDetails: "" };
  };

  const setAdj = (id: string, field: keyof EmployeeAdjustment, value: string | number) => {
    setAdjustments((prev) => ({
      ...prev,
      [id]: { ...getAdjustment(id), [field]: value },
    }));
  };

  const OVERTIME_RATES = { regular: 1.25, restDay: 1.50, holiday: 2.00 } as const;

  const selectedEmployees = employees?.filter((e) => selectedIds.has(e._id)) ?? [];

  const calcEmployeeNet = (emp: typeof selectedEmployees[number]) => {
    const adj = getAdjustment(emp._id);
    const housing = emp.housingAllowance ?? 0;
    const transport = emp.transportAllowance ?? 0;
    const other = emp.otherAllowances ?? 0;
    const hourlyRate = emp.baseSalary / (30 * 8);
    const otAmount = adj.overtimeHours > 0
      ? hourlyRate * OVERTIME_RATES[adj.overtimeType] * adj.overtimeHours
      : 0;
    return Math.round(emp.baseSalary + housing + transport + other + otAmount - adj.deduction);
  };

  const totalNet = selectedEmployees.reduce((sum, emp) => sum + calcEmployeeNet(emp), 0);

  const onSubmit = async (data: PayrollRunFormData) => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one employee");
      return;
    }
    setSaving(true);
    try {
      const overtime = selectedEmployees
        .filter((e) => getAdjustment(e._id).overtimeHours > 0)
        .map((e) => ({
          employeeId: e._id as Id<"employees">,
          hours: getAdjustment(e._id).overtimeHours,
          rateType: getAdjustment(e._id).overtimeType,
        }));
      const extraDeductions = selectedEmployees
        .filter((e) => getAdjustment(e._id).deduction > 0)
        .map((e) => ({
          employeeId: e._id as Id<"employees">,
          amount: getAdjustment(e._id).deduction,
          details: getAdjustment(e._id).deductionDetails || undefined,
        }));
      await createPayrollRun({
        title: data.title,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        payDate: data.payDate,
        notes: data.notes || undefined,
        employeeIds: [...selectedIds] as Id<"employees">[],
        overtime: overtime.length > 0 ? overtime : undefined,
        extraDeductions: extraDeductions.length > 0 ? extraDeductions : undefined,
      });
      toast.success("Payroll run created");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create payroll run";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!employees) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <Skeleton className="h-64 w-full" />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "New Payroll Run" : "Overtime & Deductions"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {step === "select" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Title *</Label>
                  <Input {...register("title")} placeholder="July 2026 Payroll" />
                  {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
                </div>
                <div>
                  <Label>Period Start *</Label>
                  <Input type="date" {...register("periodStart")} />
                </div>
                <div>
                  <Label>Period End *</Label>
                  <Input type="date" {...register("periodEnd")} />
                </div>
                <div>
                  <Label>Pay Date *</Label>
                  <Input type="date" {...register("payDate")} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input {...register("notes")} placeholder="Optional notes" />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Select Employees ({selectedIds.size}/{employees.length})</p>
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll} className="cursor-pointer">
                    {selectedIds.size === employees.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {employees.map((emp) => (
                    <label
                      key={emp._id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(emp._id)}
                        onCheckedChange={() => toggleEmployee(emp._id)}
                      />
                      <EmployeePhoto employeeId={emp._id} photoUrl={emp.photoUrl} name={emp.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.position ?? emp.department ?? emp.employeeId}</p>
                      </div>
                      <p className="text-sm font-mono">{emp.currency} {emp.baseSalary.toLocaleString()}</p>
                    </label>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={() => setStep("adjust")}
                  className="cursor-pointer"
                >
                  Next: Overtime & Deductions
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "adjust" && (
            <>
              <p className="text-xs text-muted-foreground">
                Overtime per Qatar Labour Law Art. 74: Regular 125%, Rest Day 150%, Holiday 200%
              </p>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {selectedEmployees.map((emp) => {
                  const adj = getAdjustment(emp._id);
                  const net = calcEmployeeNet(emp);
                  return (
                    <div key={emp._id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center gap-3">
                        <EmployeePhoto employeeId={emp._id} photoUrl={emp.photoUrl} name={emp.name} size="sm" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Base: {emp.baseSalary.toLocaleString()}
                            {(emp.housingAllowance ?? 0) > 0 && ` + H:${emp.housingAllowance}`}
                            {(emp.transportAllowance ?? 0) > 0 && ` + T:${emp.transportAllowance}`}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-primary">{emp.currency} {net.toLocaleString()}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">OT Hours</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={adj.overtimeHours || ""}
                            onChange={(e) => setAdj(emp._id, "overtimeHours", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">OT Type</Label>
                          <Select
                            value={adj.overtimeType}
                            onValueChange={(v) => setAdj(emp._id, "overtimeType", v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="regular">Regular (125%)</SelectItem>
                              <SelectItem value="restDay">Rest Day (150%)</SelectItem>
                              <SelectItem value="holiday">Holiday (200%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Deduction</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={adj.deduction || ""}
                            onChange={(e) => setAdj(emp._id, "deduction", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-3 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{selectedEmployees.length} employees</p>
                <p className="font-bold">Total Net: {selectedEmployees[0]?.currency ?? "QAR"} {totalNet.toLocaleString()}</p>
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setStep("select")}>Back</Button>
                <Button type="submit" disabled={saving} className="cursor-pointer">
                  {saving ? "Creating..." : "Create Payroll Run"}
                </Button>
              </DialogFooter>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
