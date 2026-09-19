import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Plus, Pause, Play, XCircle, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
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

export default function RecurringBillsTab() {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const bills = useQuery(api.recurring.listRecurringBills,
    statusFilter === "all" ? {} : { status: statusFilter }
  );
  const updateStatus = useMutation(api.recurring.updateRecurringBillStatus);

  if (!bills) {
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
              <Plus className="w-4 h-4 mr-2" />{t("recurring.add_bill")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("recurring.add_bill")}</DialogTitle>
            </DialogHeader>
            <CreateRecurringBillForm onSuccess={() => setShowDialog(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {bills.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>{t("recurring.no_bills")}</EmptyTitle>
            <EmptyDescription>{t("recurring.no_bills_desc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowDialog(true)} className="cursor-pointer">
              {t("recurring.add_bill")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {bills.map((bill) => (
            <Card key={bill._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-1">
                  <div className="font-medium">{bill.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {bill.vendorName} &bull; {t(`recurring.freq_${bill.frequency}`)} &bull;{" "}
                    {bill.amount.toLocaleString()} {t("recurring.per_cycle")}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t("recurring.next")}: {bill.nextGenerationDate}
                    {bill.lastGeneratedDate && (
                      <span className="ml-3">
                        {t("recurring.last")}: {bill.lastGeneratedDate}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    bill.status === "active" ? "default" :
                    bill.status === "paused" ? "secondary" :
                    "destructive"
                  }>
                    {t(`recurring.${bill.status}`)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {bill.totalGenerated} {t("recurring.generated")}
                  </span>
                  {bill.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        await updateStatus({ id: bill._id, status: "paused" });
                        toast.success(t("recurring.paused_success"));
                      }}
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  )}
                  {bill.status === "paused" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        await updateStatus({ id: bill._id, status: "active" });
                        toast.success(t("recurring.resumed_success"));
                      }}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  {(bill.status === "active" || bill.status === "paused") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer text-destructive"
                      onClick={async () => {
                        await updateStatus({ id: bill._id, status: "cancelled" });
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

function CreateRecurringBillForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const vendors = useQuery(api.vendors.listVendors, {});
  const createBill = useMutation(api.recurring.createRecurringBill);

  const [name, setName] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly" | "quarterly" | "yearly">("monthly");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name || !vendorId || !amount || Number(amount) <= 0) {
      toast.error(t("recurring.validation_error"));
      return;
    }

    setSaving(true);
    try {
      await createBill({
        name,
        vendorId: vendorId as Id<"vendors">,
        frequency,
        amount: Number(amount),
        category: category || undefined,
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
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("recurring.bill_name_placeholder")} />
      </div>

      <div>
        <Label>{t("recurring.vendor")}</Label>
        <Select value={vendorId} onValueChange={setVendorId}>
          <SelectTrigger className="cursor-pointer">
            <SelectValue placeholder={t("recurring.select_vendor")} />
          </SelectTrigger>
          <SelectContent>
            {vendors?.map((v) => (
              <SelectItem key={v._id} value={v._id} className="cursor-pointer">{v.name}</SelectItem>
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
          <Label>{t("budget.amount")}</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>

      <div>
        <Label>{t("recurring.category")}</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("recurring.category_placeholder")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("recurring.start_date")}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>{t("recurring.end_date")}</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
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
