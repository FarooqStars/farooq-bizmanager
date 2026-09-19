import { useState } from "react";
import { useMutation } from "convex/react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { useSystemDefaults } from "@/hooks/use-system-defaults.ts";
import { COUNTRY_LIST, getCountryConfig } from "@/lib/country-defaults.ts";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  employeeId: z.string().min(1, "Employee ID is required"),
  hireDate: z.string().min(1, "Hire date is required"),
  baseSalary: z.number().min(0, "Salary must be positive"),
  housingAllowance: z.number().min(0).optional(),
  transportAllowance: z.number().min(0).optional(),
  otherAllowances: z.number().min(0).optional(),
  currency: z.string().min(1, "Currency is required"),
  payFrequency: z.enum(["monthly", "biweekly", "weekly"]),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  routingNumber: z.string().optional(),
  taxId: z.string().optional(),
  nationality: z.string().optional(),
  country: z.enum(["QA", "AE", "SA", "PK", "IN", "BH", "KW", "OM", "EG", "JO", "US", "CA"]).optional(),
  passportNumber: z.string().optional(),
  qidNumber: z.string().optional(),
  secondaryId: z.string().optional(),
  tertiaryId: z.string().optional(),
  annualLeaveBalance: z.number().min(0).optional(),
  sickLeaveBalance: z.number().min(0).optional(),
  notes: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

type Props = {
  employee?: Doc<"employees"> | null;
  onClose: () => void;
};

export default function EmployeeFormDialog({ employee, onClose }: Props) {
  const createEmployee = useMutation(api.payroll.createEmployee);
  const updateEmployee = useMutation(api.payroll.updateEmployee);
  const [saving, setSaving] = useState(false);
  const { defaultCountry, defaultCurrency } = useSystemDefaults();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: employee?.name ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      department: employee?.department ?? "",
      position: employee?.position ?? "",
      employeeId: employee?.employeeId ?? "",
      hireDate: employee?.hireDate ?? new Date().toISOString().slice(0, 10),
      baseSalary: employee?.baseSalary ?? 0,
      housingAllowance: employee?.housingAllowance ?? 0,
      transportAllowance: employee?.transportAllowance ?? 0,
      otherAllowances: employee?.otherAllowances ?? 0,
      currency: employee?.currency ?? defaultCurrency,
      payFrequency: employee?.payFrequency ?? "monthly",
      bankName: employee?.bankName ?? "",
      bankAccount: employee?.bankAccount ?? "",
      routingNumber: employee?.routingNumber ?? "",
      taxId: employee?.taxId ?? "",
      nationality: employee?.nationality ?? "",
      country: employee?.country ?? (defaultCountry as "QA" | "AE" | "SA" | "PK" | "IN" | "BH" | "KW" | "OM" | "EG" | "JO" | "US" | "CA") ?? "QA",
      passportNumber: employee?.passportNumber ?? "",
      qidNumber: employee?.qidNumber ?? "",
      secondaryId: employee?.secondaryId ?? "",
      tertiaryId: employee?.tertiaryId ?? "",
      annualLeaveBalance: employee?.annualLeaveBalance ?? 21,
      sickLeaveBalance: employee?.sickLeaveBalance ?? 14,
      notes: employee?.notes ?? "",
    },
  });

  const selectedCountry = watch("country") ?? defaultCountry;
  const countryConfig = getCountryConfig(selectedCountry);

  const onSubmit = async (data: EmployeeFormData) => {
    setSaving(true);
    try {
      if (employee) {
        await updateEmployee({
          id: employee._id,
          name: data.name,
          email: data.email || undefined,
          phone: data.phone || undefined,
          department: data.department || undefined,
          position: data.position || undefined,
          hireDate: data.hireDate,
          baseSalary: data.baseSalary,
          housingAllowance: data.housingAllowance || undefined,
          transportAllowance: data.transportAllowance || undefined,
          otherAllowances: data.otherAllowances || undefined,
          currency: data.currency,
          payFrequency: data.payFrequency,
          bankName: data.bankName || undefined,
          bankAccount: data.bankAccount || undefined,
          routingNumber: data.routingNumber || undefined,
          taxId: data.taxId || undefined,
          nationality: data.nationality || undefined,
          country: data.country || undefined,
          passportNumber: data.passportNumber || undefined,
          qidNumber: data.qidNumber || undefined,
          secondaryId: data.secondaryId || undefined,
          tertiaryId: data.tertiaryId || undefined,
          annualLeaveBalance: data.annualLeaveBalance,
          sickLeaveBalance: data.sickLeaveBalance,
          notes: data.notes || undefined,
        });
        toast.success("Employee updated");
      } else {
        await createEmployee({
          name: data.name,
          email: data.email || undefined,
          phone: data.phone || undefined,
          department: data.department || undefined,
          position: data.position || undefined,
          employeeId: data.employeeId,
          hireDate: data.hireDate,
          baseSalary: data.baseSalary,
          housingAllowance: data.housingAllowance || undefined,
          transportAllowance: data.transportAllowance || undefined,
          otherAllowances: data.otherAllowances || undefined,
          currency: data.currency,
          payFrequency: data.payFrequency,
          bankName: data.bankName || undefined,
          bankAccount: data.bankAccount || undefined,
          routingNumber: data.routingNumber || undefined,
          taxId: data.taxId || undefined,
          nationality: data.nationality || undefined,
          country: data.country || undefined,
          passportNumber: data.passportNumber || undefined,
          qidNumber: data.qidNumber || undefined,
          secondaryId: data.secondaryId || undefined,
          tertiaryId: data.tertiaryId || undefined,
          annualLeaveBalance: data.annualLeaveBalance,
          sickLeaveBalance: data.sickLeaveBalance,
          notes: data.notes || undefined,
        });
        toast.success("Employee added");
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save employee";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit Employee" : "Add Employee"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Personal Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Full Name *</Label>
              <Input {...register("name")} placeholder="Ahmad Al-Farsi" />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Label>Employee ID *</Label>
              <Input {...register("employeeId")} placeholder="EMP-001" disabled={!!employee} />
              {errors.employeeId && <p className="text-xs text-destructive mt-1">{errors.employeeId.message}</p>}
            </div>
            <div>
              <Label>Hire Date *</Label>
              <Input type="date" {...register("hireDate")} />
              {errors.hireDate && <p className="text-xs text-destructive mt-1">{errors.hireDate.message}</p>}
            </div>
            <div>
              <Label>Email</Label>
              <Input {...register("email")} placeholder="ahmad@company.qa" type="email" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...register("phone")} placeholder="+974 5555 1234" />
            </div>
            <div>
              <Label>Department</Label>
              <Input {...register("department")} placeholder="Operations" />
            </div>
            <div>
              <Label>Position</Label>
              <Input {...register("position")} placeholder="Senior Engineer" />
            </div>
            <div>
              <Label>Nationality</Label>
              <Input {...register("nationality")} placeholder="Qatari" />
            </div>
            <div>
              <Label>Labour Law Country</Label>
              <Select value={watch("country") ?? "QA"} onValueChange={(v) => setValue("country", v as "QA" | "AE" | "SA" | "PK" | "IN" | "BH" | "KW" | "OM" | "EG" | "JO")}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_LIST.filter((c) => ["QA", "AE", "SA", "PK", "IN", "BH", "KW", "OM", "EG", "JO", "US", "CA"].includes(c.code)).map((c) => (
                    <SelectItem key={c.code} value={c.code} className="cursor-pointer">{c.flag} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Determines gratuity, overtime, leave rules, and ID fields</p>
            </div>
            <div>
              <Label>{countryConfig.idLabels.primary}</Label>
              <Input {...register("qidNumber")} placeholder={`Enter ${countryConfig.idLabels.primary}`} />
            </div>
            <div>
              <Label>{countryConfig.idLabels.secondary}</Label>
              <Input {...register("secondaryId")} placeholder={`Enter ${countryConfig.idLabels.secondary}`} />
            </div>
            {countryConfig.idLabels.tertiary && (
              <div>
                <Label>{countryConfig.idLabels.tertiary}</Label>
                <Input {...register("tertiaryId")} placeholder={`Enter ${countryConfig.idLabels.tertiary}`} />
              </div>
            )}
            <div>
              <Label>Passport Number</Label>
              <Input {...register("passportNumber")} placeholder="Passport number" />
            </div>
          </div>

          {/* Compensation */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Compensation</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Base Salary *</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("baseSalary", { valueAsNumber: true })}
                  placeholder="10000"
                />
                {errors.baseSalary && <p className="text-xs text-destructive mt-1">{errors.baseSalary.message}</p>}
              </div>
              <div>
                <Label>Currency *</Label>
                <Select value={watch("currency")} onValueChange={(v) => setValue("currency", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QAR">QAR</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                    <SelectItem value="PKR">PKR</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="BHD">BHD</SelectItem>
                    <SelectItem value="KWD">KWD</SelectItem>
                    <SelectItem value="OMR">OMR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Housing Allowance</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("housingAllowance", { valueAsNumber: true })}
                  placeholder="3000"
                />
              </div>
              <div>
                <Label>Transport Allowance</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("transportAllowance", { valueAsNumber: true })}
                  placeholder="1500"
                />
              </div>
              <div>
                <Label>Other Allowances</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("otherAllowances", { valueAsNumber: true })}
                  placeholder="500"
                />
              </div>
              <div>
                <Label>Pay Frequency</Label>
                <Select value={watch("payFrequency")} onValueChange={(v) => setValue("payFrequency", v as "monthly" | "biweekly" | "weekly")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Bank Details (for WPS)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bank Name</Label>
                <Input {...register("bankName")} placeholder="Qatar National Bank" />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input {...register("bankAccount")} placeholder="Account number" />
              </div>
              <div>
                <Label>Routing / IBAN</Label>
                <Input {...register("routingNumber")} placeholder="IBAN / Routing" />
              </div>
              <div>
                <Label>Tax ID</Label>
                <Input {...register("taxId")} placeholder="Tax identifier" />
              </div>
            </div>
          </div>

          {/* Leave Balances */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Leave Balances (days)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Annual Leave</Label>
                <Input
                  type="number"
                  {...register("annualLeaveBalance", { valueAsNumber: true })}
                  placeholder="21"
                />
              </div>
              <div>
                <Label>Sick Leave</Label>
                <Input
                  type="number"
                  {...register("sickLeaveBalance", { valueAsNumber: true })}
                  placeholder="14"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea {...register("notes")} placeholder="Additional notes..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : employee ? "Update" : "Add Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
