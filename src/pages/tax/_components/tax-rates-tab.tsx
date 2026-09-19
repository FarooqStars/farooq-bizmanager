import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Percent, Pencil, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type TaxCategory = "standard" | "reduced" | "zero" | "exempt";
type AppliesTo = "goods" | "services" | "both";

const categoryColors: Record<TaxCategory, string> = {
  standard: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  reduced: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  zero: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  exempt: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

export default function TaxRatesTab() {
  const { t } = useTranslation();
  const rates = useQuery(api.tax.listRates);
  const createRate = useMutation(api.tax.createRate);
  const updateRate = useMutation(api.tax.updateRate);
  const deleteRate = useMutation(api.tax.deleteRate);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"taxRates"> | null>(null);
  const [name, setName] = useState("");
  const [rate, setRate] = useState(0);
  const [category, setCategory] = useState<TaxCategory>("standard");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("both");

  if (rates === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const resetForm = () => {
    setName("");
    setRate(0);
    setCategory("standard");
    setDescription("");
    setIsDefault(false);
    setAppliesTo("both");
    setEditingId(null);
  };

  const handleEdit = (taxRate: typeof rates[number]) => {
    setEditingId(taxRate._id);
    setName(taxRate.name);
    setRate(taxRate.rate);
    setCategory(taxRate.category);
    setDescription(taxRate.description ?? "");
    setIsDefault(taxRate.isDefault);
    setAppliesTo(taxRate.appliesTo ?? "both");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("tax.name_required"));
      return;
    }
    try {
      if (editingId) {
        await updateRate({
          id: editingId,
          name: name.trim(),
          rate,
          category,
          description: description || undefined,
          isDefault,
          appliesTo,
        });
        toast.success(t("tax.rate_updated"));
      } else {
        await createRate({
          name: name.trim(),
          rate,
          category,
          description: description || undefined,
          isDefault,
          appliesTo,
        });
        toast.success(t("tax.rate_created"));
      }
      setDialogOpen(false);
      resetForm();
    } catch {
      toast.error(t("tax.rate_save_error"));
    }
  };

  const handleDelete = async (id: Id<"taxRates">) => {
    try {
      await deleteRate({ id });
      toast.success(t("tax.rate_deleted"));
    } catch {
      toast.error(t("tax.rate_delete_error"));
    }
  };

  const handleToggleActive = async (id: Id<"taxRates">, currentActive: boolean) => {
    try {
      await updateRate({ id, isActive: !currentActive });
      toast.success(!currentActive ? t("tax.rate_activated") : t("tax.rate_deactivated"));
    } catch {
      toast.error(t("tax.rate_save_error"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{t("tax.tax_rates")}</h3>
          <p className="text-sm text-muted-foreground">{t("tax.tax_rates_desc")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="cursor-pointer">
              <Plus className="w-4 h-4 mr-1" />
              {t("tax.add_rate")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t("tax.edit_rate") : t("tax.add_rate")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard VAT" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("tax.rate_percent")}</Label>
                  <Input type="number" min={0} max={100} step={0.01} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("tax.category")}</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as TaxCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{t("tax.cat_standard")}</SelectItem>
                      <SelectItem value="reduced">{t("tax.cat_reduced")}</SelectItem>
                      <SelectItem value="zero">{t("tax.cat_zero")}</SelectItem>
                      <SelectItem value="exempt">{t("tax.cat_exempt")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("tax.applies_to")}</Label>
                <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as AppliesTo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{t("tax.applies_both")}</SelectItem>
                    <SelectItem value="goods">{t("tax.applies_goods")}</SelectItem>
                    <SelectItem value="services">{t("tax.applies_services")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("tax.description")}</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("tax.description_placeholder")} />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                <Label>{t("tax.set_as_default")}</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setDialogOpen(false); resetForm(); }} className="cursor-pointer">{t("common.cancel")}</Button>
                <Button onClick={handleSubmit} className="cursor-pointer">{t("common.save")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rates.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Percent /></EmptyMedia>
            <EmptyTitle>{t("tax.no_rates")}</EmptyTitle>
            <EmptyDescription>{t("tax.no_rates_desc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="cursor-pointer">{t("tax.add_rate")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {rates.map((taxRate) => (
            <Card key={taxRate._id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{taxRate.rate}%</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{taxRate.name}</span>
                      {taxRate.isDefault && (
                        <Badge variant="secondary" className="text-xs">{t("tax.default")}</Badge>
                      )}
                      <Badge className={categoryColors[taxRate.category]}>{t(`tax.cat_${taxRate.category}`)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("tax.applies_to")}: {t(`tax.applies_${taxRate.appliesTo ?? "both"}`)}
                      {taxRate.description && ` — ${taxRate.description}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={taxRate.isActive}
                    onCheckedChange={() => handleToggleActive(taxRate._id, taxRate.isActive)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(taxRate)} className="cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(taxRate._id)} className="cursor-pointer text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
