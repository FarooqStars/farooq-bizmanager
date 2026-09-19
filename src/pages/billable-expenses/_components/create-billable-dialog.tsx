import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type CreateBillableDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function CreateBillableDialog({ open, onClose }: CreateBillableDialogProps) {
  const { t } = useTranslation();
  const createExpense = useMutation(api.billableExpenses.create);
  const customers = useQuery(api.sales.listCustomers, {});
  const projects = useQuery(api.projects.listProjects, {});
  const categories = useQuery(api.vendors.listExpenseCategories, {});

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [markup, setMarkup] = useState("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const calculatedBilled = Number(amount) * (1 + Number(markup) / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !customerId) {
      toast.error(t("billable.fill_required"));
      return;
    }

    setSubmitting(true);
    try {
      await createExpense({
        description,
        amount: Number(amount),
        date,
        customerId: customerId as Id<"customers">,
        projectId: projectId ? (projectId as Id<"projects">) : undefined,
        categoryId: categoryId ? (categoryId as Id<"expenseCategories">) : undefined,
        markup: Number(markup),
        notes: notes || undefined,
      });
      toast.success(t("billable.created_success"));
      resetForm();
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setCustomerId("");
    setProjectId("");
    setCategoryId("");
    setMarkup("0");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("billable.new_expense")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>{t("billable.description")} *</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("billable.desc_placeholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("billable.amount")} *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>{t("billable.date")} *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>{t("billable.customer")} *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder={t("billable.select_customer")} />
              </SelectTrigger>
              <SelectContent>
                {customers?.map((c) => (
                  <SelectItem key={c._id} value={c._id} className="cursor-pointer">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("billable.project")}</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder={t("billable.select_project")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="cursor-pointer">{t("common.none")}</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p._id} value={p._id} className="cursor-pointer">
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("billable.category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder={t("billable.select_category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="cursor-pointer">{t("common.none")}</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c._id} value={c._id} className="cursor-pointer">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("billable.markup_percent")}</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label>{t("billable.billed_amount")}</Label>
              <div className="h-9 flex items-center px-3 border rounded-md bg-muted text-sm font-medium">
                {calculatedBilled.toFixed(2)}
              </div>
            </div>
          </div>

          <div>
            <Label>{t("billable.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("billable.notes_placeholder")}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting} className="cursor-pointer">
              {submitting ? t("common.saving") : t("billable.create_expense")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
