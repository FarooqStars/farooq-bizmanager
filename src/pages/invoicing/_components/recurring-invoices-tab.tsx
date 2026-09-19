import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Plus, Pause, Play, XCircle, Calendar, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function RecurringInvoicesTab() {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const invoices = useQuery(api.recurring.listRecurringInvoices, 
    statusFilter === "all" ? {} : { status: statusFilter }
  );
  const customers = useQuery(api.invoicing.listInvoices, {});
  const createRecurring = useMutation(api.recurring.createRecurringInvoice);
  const updateStatus = useMutation(api.recurring.updateRecurringInvoiceStatus);

  if (!invoices) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="cursor-pointer">{t("recurring.all")}</SelectItem>
            <SelectItem value="active" className="cursor-pointer">{t("recurring.active")}</SelectItem>
            <SelectItem value="paused" className="cursor-pointer">{t("recurring.paused")}</SelectItem>
            <SelectItem value="cancelled" className="cursor-pointer">{t("recurring.cancelled")}</SelectItem>
          </SelectContent>
        </Select>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />{t("recurring.add_invoice")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("recurring.add_invoice")}</DialogTitle>
            </DialogHeader>
            <CreateRecurringInvoiceForm
              onSuccess={() => setShowDialog(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {invoices.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
            <EmptyTitle>{t("recurring.no_invoices")}</EmptyTitle>
            <EmptyDescription>{t("recurring.no_invoices_desc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowDialog(true)} className="cursor-pointer">
              {t("recurring.add_invoice")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {invoices.map((inv) => (
            <Card key={inv._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-1">
                  <div className="font-medium">{inv.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {inv.customerName} &bull; {t(`recurring.freq_${inv.frequency}`)}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t("recurring.next")}: {inv.nextGenerationDate}
                    {inv.lastGeneratedDate && (
                      <span className="ml-3">
                        {t("recurring.last")}: {inv.lastGeneratedDate}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    inv.status === "active" ? "default" :
                    inv.status === "paused" ? "secondary" :
                    "destructive"
                  }>
                    {t(`recurring.${inv.status}`)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {inv.totalGenerated} {t("recurring.generated")}
                  </span>
                  {inv.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        await updateStatus({ id: inv._id, status: "paused" });
                        toast.success(t("recurring.paused_success"));
                      }}
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  )}
                  {inv.status === "paused" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        await updateStatus({ id: inv._id, status: "active" });
                        toast.success(t("recurring.resumed_success"));
                      }}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  {(inv.status === "active" || inv.status === "paused") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer text-destructive"
                      onClick={async () => {
                        await updateStatus({ id: inv._id, status: "cancelled" });
                        toast.success(t("recurring.cancelled_success"));
                      }}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateRecurringInvoiceForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const customers = useQuery(api.invoicing.listInvoices, {});
  const createRecurring = useMutation(api.recurring.createRecurringInvoice);

  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly" | "quarterly" | "yearly">("monthly");
  const [saleType, setSaleType] = useState<"cash" | "credit">("credit");
  const [creditTerms, setCreditTerms] = useState<"net_15" | "net_30" | "net_60" | "net_90">("net_30");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);

  // Get unique customers from invoices
  const customerList = customers
    ? Array.from(new Map(customers.map((c) => [c.customerId, { id: c.customerId, name: c.customerName }])).values())
    : [];

  const addItem = () => setItems([...items, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string | number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async () => {
    if (!name || !customerId || items.length === 0 || items.some((i) => !i.description)) {
      toast.error(t("recurring.validation_error"));
      return;
    }

    setSaving(true);
    try {
      await createRecurring({
        name,
        customerId: customerId as Id<"customers">,
        frequency,
        saleType,
        creditTerms: saleType === "credit" ? creditTerms : undefined,
        items: items.map((i) => ({
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
        taxRate: taxRate ? Number(taxRate) : undefined,
        notes: notes || undefined,
        startDate,
        endDate: endDate || undefined,
      });
      toast.success(t("recurring.created"));
      onSuccess();
    } catch {
      toast.error(t("recurring.save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("common.name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("recurring.name_placeholder")} />
      </div>

      <div>
        <Label>{t("recurring.customer")}</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="cursor-pointer">
            <SelectValue placeholder={t("recurring.select_customer")} />
          </SelectTrigger>
          <SelectContent>
            {customerList.map((c) => (
              <SelectItem key={c.id} value={c.id} className="cursor-pointer">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("recurring.frequency")}</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
            <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly" className="cursor-pointer">{t("recurring.freq_weekly")}</SelectItem>
              <SelectItem value="biweekly" className="cursor-pointer">{t("recurring.freq_biweekly")}</SelectItem>
              <SelectItem value="monthly" className="cursor-pointer">{t("recurring.freq_monthly")}</SelectItem>
              <SelectItem value="quarterly" className="cursor-pointer">{t("recurring.freq_quarterly")}</SelectItem>
              <SelectItem value="yearly" className="cursor-pointer">{t("recurring.freq_yearly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("recurring.sale_type")}</Label>
          <Select value={saleType} onValueChange={(v) => setSaleType(v as "cash" | "credit")}>
            <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash" className="cursor-pointer">{t("recurring.cash")}</SelectItem>
              <SelectItem value="credit" className="cursor-pointer">{t("recurring.credit")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {saleType === "credit" && (
        <div>
          <Label>{t("recurring.credit_terms")}</Label>
          <Select value={creditTerms} onValueChange={(v) => setCreditTerms(v as typeof creditTerms)}>
            <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="net_15" className="cursor-pointer">Net 15</SelectItem>
              <SelectItem value="net_30" className="cursor-pointer">Net 30</SelectItem>
              <SelectItem value="net_60" className="cursor-pointer">Net 60</SelectItem>
              <SelectItem value="net_90" className="cursor-pointer">Net 90</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("recurring.start_date")}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("recurring.end_date")}</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder={t("recurring.no_end")} />
        </div>
      </div>

      <div>
        <Label>{t("recurring.tax_rate")}</Label>
        <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
      </div>

      {/* Line items */}
      <div className="space-y-2">
        <Label>{t("recurring.items")}</Label>
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-end">
            <Input
              placeholder={t("recurring.item_desc")}
              value={item.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder={t("recurring.qty")}
              value={item.quantity}
              onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
              className="w-20"
            />
            <Input
              type="number"
              placeholder={t("recurring.price")}
              value={item.unitPrice}
              onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
              className="w-28"
            />
            {items.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} className="cursor-pointer text-destructive">
                <XCircle className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addItem} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" />{t("recurring.add_item")}
        </Button>
      </div>

      <div>
        <Label>{t("common.notes")}</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("recurring.notes_placeholder")} />
      </div>

      <Button onClick={handleSubmit} disabled={saving} className="w-full cursor-pointer">
        {saving ? t("common.saving") : t("recurring.create_schedule")}
      </Button>
    </div>
  );
}
