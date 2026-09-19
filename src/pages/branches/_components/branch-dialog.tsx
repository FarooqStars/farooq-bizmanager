import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

const branchSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(10),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  country: z.string().optional(),
  isHeadquarters: z.boolean(),
  isActive: z.boolean(),
  taxRegistrationNumber: z.string().optional(),
  notes: z.string().optional(),
});

type BranchFormData = z.infer<typeof branchSchema>;

export default function BranchDialog({
  open,
  onOpenChange,
  branchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: Id<"branches"> | null;
}) {
  const { t } = useTranslation();
  const branch = useQuery(api.branches.getBranch, branchId ? { branchId } : "skip");
  const createBranch = useMutation(api.branches.createBranch);
  const updateBranch = useMutation(api.branches.updateBranch);

  const form = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: "",
      code: "",
      address: "",
      phone: "",
      email: "",
      city: "",
      country: "",
      isHeadquarters: false,
      isActive: true,
      taxRegistrationNumber: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (branch && branchId) {
      form.reset({
        name: branch.name,
        code: branch.code,
        address: branch.address ?? "",
        phone: branch.phone ?? "",
        email: branch.email ?? "",
        city: branch.city ?? "",
        country: branch.country ?? "",
        isHeadquarters: branch.isHeadquarters,
        isActive: branch.isActive,
        taxRegistrationNumber: branch.taxRegistrationNumber ?? "",
        notes: branch.notes ?? "",
      });
    } else if (!branchId) {
      form.reset({
        name: "",
        code: "",
        address: "",
        phone: "",
        email: "",
        city: "",
        country: "",
        isHeadquarters: false,
        isActive: true,
        taxRegistrationNumber: "",
        notes: "",
      });
    }
  }, [branch, branchId, form]);

  const onSubmit = async (data: BranchFormData) => {
    try {
      const payload = {
        name: data.name,
        code: data.code,
        address: data.address || undefined,
        phone: data.phone || undefined,
        email: data.email || undefined,
        city: data.city || undefined,
        country: data.country || undefined,
        isHeadquarters: data.isHeadquarters,
        taxRegistrationNumber: data.taxRegistrationNumber || undefined,
        notes: data.notes || undefined,
      };

      if (branchId) {
        await updateBranch({ branchId, ...payload, isActive: data.isActive });
        toast.success(t("branches.updated"));
      } else {
        await createBranch(payload);
        toast.success(t("branches.created"));
      }
      onOpenChange(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("branches.saveFailed");
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {branchId ? t("branches.editBranch") : t("branches.addBranch")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branches.fields.name")} *</Label>
              <Input {...form.register("name")} placeholder="Main Office" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("branches.fields.code")} *</Label>
              <Input {...form.register("code")} placeholder="HQ" maxLength={10} />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("branches.fields.address")}</Label>
            <Input {...form.register("address")} placeholder="123 Business St" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branches.fields.city")}</Label>
              <Input {...form.register("city")} placeholder="Doha" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("branches.fields.country")}</Label>
              <Input {...form.register("country")} placeholder="Qatar" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branches.fields.phone")}</Label>
              <Input {...form.register("phone")} placeholder="+974 1234 5678" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("branches.fields.email")}</Label>
              <Input {...form.register("email")} placeholder="branch@company.com" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("branches.fields.taxReg")}</Label>
            <Input {...form.register("taxRegistrationNumber")} placeholder="TAX-12345" />
          </div>

          <div className="space-y-1.5">
            <Label>{t("branches.fields.notes")}</Label>
            <Textarea {...form.register("notes")} rows={2} />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.watch("isHeadquarters")}
                onCheckedChange={(val) => form.setValue("isHeadquarters", val)}
              />
              <Label className="text-sm">{t("branches.fields.isHQ")}</Label>
            </div>
            {branchId && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.watch("isActive")}
                  onCheckedChange={(val) => form.setValue("isActive", val)}
                />
                <Label className="text-sm">{t("branches.fields.isActive")}</Label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" className="cursor-pointer" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={form.formState.isSubmitting}>
              {branchId ? t("common.save") : t("branches.addBranch")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
