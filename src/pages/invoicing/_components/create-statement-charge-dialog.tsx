import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type LineItem = {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
};

export default function CreateStatementChargeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const customers = useQuery(api.sales.listCustomers);
  const create = useMutation(api.statementCharges.create);

  const [customerId, setCustomerId] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
  const [saving, setSaving] = useState(false);

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === "description") {
        item.description = value as string;
      } else if (field === "quantity") {
        item.quantity = Number(value) || 0;
        item.amount = item.quantity * item.rate;
      } else if (field === "rate") {
        item.rate = Number(value) || 0;
        item.amount = item.quantity * item.rate;
      }
      updated[index] = item;
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxAmt = taxRate ? subtotal * (parseFloat(taxRate) / 100) : 0;
  const total = subtotal + taxAmt;

  const handleSubmit = async () => {
    if (!customerId) { toast.error(t("statementCharges.select_customer")); return; }
    if (items.some((i) => !i.description.trim())) { toast.error(t("statementCharges.item_desc_required")); return; }
    if (items.some((i) => i.amount <= 0)) { toast.error(t("statementCharges.item_amount_required")); return; }

    setSaving(true);
    try {
      await create({
        customerId: customerId as Id<"customers">,
        date,
        dueDate,
        items: items.map((i) => ({ description: i.description, quantity: i.quantity, rate: i.rate, amount: i.amount })),
        taxRate: taxRate ? parseFloat(taxRate) : undefined,
        memo: memo || undefined,
      });
      toast.success(t("statementCharges.created"));
      onOpenChange(false);
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCustomerId("");
    setDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setTaxRate("");
    setMemo("");
    setItems([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("statementCharges.create_title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("statementCharges.customer")}</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder={t("statementCharges.select_customer")} />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("statementCharges.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("statementCharges.due_date")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <Label>{t("statementCharges.line_items")}</Label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input
                      placeholder={t("statementCharges.description")}
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder={t("statementCharges.qty")}
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      min={1}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder={t("statementCharges.rate")}
                      value={item.rate || ""}
                      onChange={(e) => updateItem(i, "rate", e.target.value)}
                      min={0}
                      step="0.01"
                    />
                  </div>
                  <div className="col-span-2 text-right font-medium text-sm">
                    ${item.amount.toFixed(2)}
                  </div>
                  <div className="col-span-1">
                    <Button variant="ghost" size="sm" onClick={() => removeItem(i)} disabled={items.length <= 1} className="cursor-pointer">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={addItem} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />{t("statementCharges.add_line")}
            </Button>
          </div>

          {/* Tax & Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("statementCharges.tax_rate")}</Label>
              <Input
                type="number"
                placeholder="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                min={0}
                step="0.01"
              />
            </div>
            <div className="space-y-1 text-right pt-6">
              <p className="text-sm text-muted-foreground">{t("statementCharges.subtotal")}: ${subtotal.toFixed(2)}</p>
              {taxAmt > 0 && <p className="text-sm text-muted-foreground">{t("statementCharges.tax")}: ${taxAmt.toFixed(2)}</p>}
              <p className="text-lg font-bold">{t("statementCharges.total")}: ${total.toFixed(2)}</p>
            </div>
          </div>

          {/* Memo */}
          <div className="space-y-2">
            <Label>{t("statementCharges.memo")}</Label>
            <Textarea
              placeholder={t("statementCharges.memo_placeholder")}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? t("common.saving") : t("statementCharges.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
