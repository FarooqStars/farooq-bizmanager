import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  Settings, DollarSign, AlertCircle, CheckCircle, XCircle, Percent,
  Calendar, Clock, Zap, Eye, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";

function fmt(amount: number, currency = "QAR") {
  return new Intl.NumberFormat("en-QA", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

// ─── Settings Dialog ─────────────────────────────────────────────────────────

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const currentSettings = useQuery(api.financeCharges.getSettings);
  const saveSettings = useMutation(api.financeCharges.saveSettings);

  const [chargeMethod, setChargeMethod] = useState<"percentage" | "flat">(currentSettings?.chargeMethod ?? "percentage");
  const [percentageRate, setPercentageRate] = useState(String(currentSettings?.percentageRate ?? 1.5));
  const [flatFee, setFlatFee] = useState(String(currentSettings?.flatFee ?? 50));
  const [period, setPeriod] = useState<"monthly" | "daily">(currentSettings?.period ?? "monthly");
  const [gracePeriodDays, setGracePeriodDays] = useState(String(currentSettings?.gracePeriodDays ?? 15));
  const [minimumBalance, setMinimumBalance] = useState(String(currentSettings?.minimumBalance ?? 100));
  const [compounding, setCompounding] = useState(currentSettings?.compounding ?? false);
  const [currency, setCurrency] = useState(currentSettings?.currency ?? "QAR");
  const [autoAssess, setAutoAssess] = useState(currentSettings?.autoAssess ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        chargeMethod,
        percentageRate: chargeMethod === "percentage" ? parseFloat(percentageRate) || 0 : undefined,
        flatFee: chargeMethod === "flat" ? parseFloat(flatFee) || 0 : undefined,
        period,
        gracePeriodDays: parseInt(gracePeriodDays) || 0,
        minimumBalance: parseFloat(minimumBalance) || 0,
        compounding,
        currency,
        autoAssess,
      });
      toast.success("Finance charge settings saved");
      onClose();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" /> Finance Charge Settings
          </DialogTitle>
          <DialogDescription>
            Configure how late fees are calculated on overdue invoices.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          {/* Method */}
          <div className="space-y-2">
            <Label>Charge Method</Label>
            <Select value={chargeMethod} onValueChange={(v) => setChargeMethod(v as "percentage" | "flat")}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage of Overdue Balance</SelectItem>
                <SelectItem value="flat">Flat Fee per Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {chargeMethod === "percentage" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Rate (%)</Label>
                <Input value={percentageRate} onChange={(e) => setPercentageRate(e.target.value)} type="number" step="0.1" placeholder="1.5" />
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={period} onValueChange={(v) => setPeriod(v as "monthly" | "daily")}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Per Month</SelectItem>
                    <SelectItem value="daily">Per Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Flat Fee Amount</Label>
              <Input value={flatFee} onChange={(e) => setFlatFee(e.target.value)} type="number" placeholder="50" />
            </div>
          )}

          {/* Grace Period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Grace Period (days)</Label>
              <Input value={gracePeriodDays} onChange={(e) => setGracePeriodDays(e.target.value)} type="number" placeholder="15" />
              <p className="text-xs text-muted-foreground">Days after due date before charges apply</p>
            </div>
            <div className="space-y-2">
              <Label>Minimum Balance</Label>
              <Input value={minimumBalance} onChange={(e) => setMinimumBalance(e.target.value)} type="number" placeholder="100" />
              <p className="text-xs text-muted-foreground">Minimum overdue amount to trigger charges</p>
            </div>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="QAR">QAR - Qatari Riyal</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="PKR">PKR - Pakistani Rupee</SelectItem>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                <SelectItem value="SAR">SAR - Saudi Riyal</SelectItem>
                <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Compounding</p>
                <p className="text-xs text-muted-foreground">Charge on previous unpaid finance charges</p>
              </div>
              <Switch checked={compounding} onCheckedChange={setCompounding} className="cursor-pointer" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-Assess</p>
                <p className="text-xs text-muted-foreground">Automatically assess charges on overdue invoices</p>
              </div>
              <Switch checked={autoAssess} onCheckedChange={setAutoAssess} className="cursor-pointer" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assess Single Charge Dialog ─────────────────────────────────────────────

function AssessChargeDialog({
  invoice,
  onClose,
}: {
  invoice: {
    _id: Id<"invoices">;
    invoiceNumber: string;
    customerName: string;
    daysOverdue: number;
    overdueAmount: number;
    calculatedCharge: number;
    currency: string;
  };
  onClose: () => void;
}) {
  const assessCharge = useMutation(api.financeCharges.assessCharge);
  const [notes, setNotes] = useState("");
  const [assessing, setAssessing] = useState(false);

  const handleAssess = async () => {
    setAssessing(true);
    try {
      await assessCharge({ invoiceId: invoice._id, notes: notes || undefined });
      toast.success(`Finance charge of ${fmt(invoice.calculatedCharge, invoice.currency)} assessed on ${invoice.invoiceNumber}`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assess charge";
      toast.error(msg);
    } finally {
      setAssessing(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assess Finance Charge</DialogTitle>
          <DialogDescription>
            Apply a late fee to invoice <strong>{invoice.invoiceNumber}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded bg-muted">
              <p className="text-muted-foreground">Customer</p>
              <p className="font-medium">{invoice.customerName}</p>
            </div>
            <div className="p-3 rounded bg-muted">
              <p className="text-muted-foreground">Days Overdue</p>
              <p className="font-medium text-red-600">{invoice.daysOverdue} days</p>
            </div>
            <div className="p-3 rounded bg-muted">
              <p className="text-muted-foreground">Overdue Amount</p>
              <p className="font-medium">{fmt(invoice.overdueAmount, invoice.currency)}</p>
            </div>
            <div className="p-3 rounded bg-destructive/10">
              <p className="text-muted-foreground">Finance Charge</p>
              <p className="font-bold text-destructive">{fmt(invoice.calculatedCharge, invoice.currency)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleAssess} disabled={assessing} className="cursor-pointer">
            {assessing ? "Assessing..." : "Assess Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Update Status Dialog ────────────────────────────────────────────────────

function UpdateStatusDialog({
  charge,
  onClose,
}: {
  charge: { _id: Id<"financeCharges">; invoiceNumber: string; chargeAmount: number; currency: string; customerName: string };
  onClose: () => void;
}) {
  const updateStatus = useMutation(api.financeCharges.updateChargeStatus);
  const [status, setStatus] = useState<"paid" | "waived" | "void">("paid");
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updateStatus({ chargeId: charge._id, status, notes: notes || undefined });
      toast.success(`Charge marked as ${status}`);
      onClose();
    } catch {
      toast.error("Failed to update charge");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update Finance Charge</DialogTitle>
          <DialogDescription>
            {fmt(charge.chargeAmount, charge.currency)} on {charge.invoiceNumber} ({charge.customerName})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "paid" | "waived" | "void")}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="waived">Waived (forgiven)</SelectItem>
                <SelectItem value="void">Void (cancelled)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for status change..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleUpdate} disabled={updating} className="cursor-pointer">
            {updating ? "Updating..." : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    assessed: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", label: "Assessed" },
    paid: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", label: "Paid" },
    waived: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", label: "Waived" },
    void: { color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", label: "Void" },
  };
  const { color, label } = map[status] ?? { color: "bg-muted", label: status };
  return <Badge className={cn("text-xs", color)}>{label}</Badge>;
}

type OverdueInvoice = {
  _id: Id<"invoices">;
  invoiceNumber: string;
  customerId: Id<"customers">;
  customerName: string;
  dueDate: string;
  daysOverdue: number;
  totalAmount: number;
  amountPaid: number;
  overdueAmount: number;
  calculatedCharge: number;
  currency: string;
};

type ChargeRecord = {
  _id: Id<"financeCharges">;
  invoiceNumber: string;
  customerName: string;
  chargeDate: string;
  daysOverdue: number;
  overdueAmount: number;
  chargeMethod: "percentage" | "flat";
  rate?: number;
  flatFee?: number;
  chargeAmount: number;
  currency: string;
  status: "assessed" | "paid" | "waived" | "void";
  notes?: string;
};

// ─── Main Tab Component ──────────────────────────────────────────────────────

export default function FinanceChargesTab() {
  const settings = useQuery(api.financeCharges.getSettings);
  const overdueInvoices = useQuery(api.financeCharges.getOverdueInvoices);
  const charges = useQuery(api.financeCharges.listCharges, {});
  const summary = useQuery(api.financeCharges.getChargeSummary);
  const batchAssess = useMutation(api.financeCharges.batchAssess);
  const { currency: companyCurrency } = useCurrency();

  const [showSettings, setShowSettings] = useState(false);
  const [assessingInvoice, setAssessingInvoice] = useState<OverdueInvoice | null>(null);
  const [updatingCharge, setUpdatingCharge] = useState<ChargeRecord | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [batchingAll, setBatchingAll] = useState(false);
  const [subTab, setSubTab] = useState("overdue");

  const handleBatchAssess = async () => {
    if (selectedInvoices.size === 0 && overdueInvoices) {
      // Assess all
      const ids = overdueInvoices.map((inv) => inv._id);
      if (ids.length === 0) {
        toast.error("No eligible invoices");
        return;
      }
      setBatchingAll(true);
      try {
        const result = await batchAssess({ invoiceIds: ids as Id<"invoices">[] });
        toast.success(`${result.assessed} charges assessed totaling ${fmt(result.totalAmount, companyCurrency)}`);
      } catch {
        toast.error("Failed to batch assess");
      } finally {
        setBatchingAll(false);
      }
    } else {
      const ids = Array.from(selectedInvoices) as Id<"invoices">[];
      setBatchingAll(true);
      try {
        const result = await batchAssess({ invoiceIds: ids });
        toast.success(`${result.assessed} charges assessed totaling ${fmt(result.totalAmount, companyCurrency)}`);
        setSelectedInvoices(new Set());
      } catch {
        toast.error("Failed to batch assess");
      } finally {
        setBatchingAll(false);
      }
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedInvoices);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInvoices(next);
  };

  const toggleAll = () => {
    if (!overdueInvoices) return;
    if (selectedInvoices.size === overdueInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(overdueInvoices.map((i) => i._id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Finance Charges</h2>
          <p className="text-sm text-muted-foreground">Assess late fees on overdue invoices</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShowSettings(true)} className="cursor-pointer">
          <Settings className="w-4 h-4 mr-1" /> Settings
        </Button>
      </div>

      {/* Settings not configured warning */}
      {settings === null && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-300">Settings Required</p>
                <p className="text-sm text-muted-foreground">Configure finance charge settings before assessing charges.</p>
              </div>
              <Button size="sm" onClick={() => setShowSettings(true)} className="cursor-pointer ml-auto">
                Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-bold text-amber-600">{fmt(summary.totalAssessed, companyCurrency)}</p>
                </div>
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{summary.countAssessed} charges</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <p className="text-lg font-bold text-green-600">{fmt(summary.totalPaid, companyCurrency)}</p>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{summary.countPaid} paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Waived</p>
                  <p className="text-lg font-bold text-blue-600">{fmt(summary.totalWaived, companyCurrency)}</p>
                </div>
                <XCircle className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{summary.countWaived} waived</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Current Rate</p>
                  <p className="text-lg font-bold">
                    {settings?.chargeMethod === "percentage"
                      ? `${settings.percentageRate}%/${settings.period === "monthly" ? "mo" : "day"}`
                      : settings?.flatFee ? fmt(settings.flatFee, companyCurrency) : "—"}
                  </p>
                </div>
                <Percent className="w-5 h-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{settings?.gracePeriodDays ?? 0} days grace</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="overdue" className="cursor-pointer">
            <AlertCircle className="w-4 h-4 mr-1" /> Eligible Invoices ({overdueInvoices?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="history" className="cursor-pointer">
            <DollarSign className="w-4 h-4 mr-1" /> Charge History ({charges?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Overdue Invoices Tab */}
        <TabsContent value="overdue" className="mt-4">
          {overdueInvoices === undefined ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : overdueInvoices.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle /></EmptyMedia>
                <EmptyTitle>No eligible invoices</EmptyTitle>
                <EmptyDescription>No overdue invoices currently qualify for finance charges (after grace period and minimum balance filters)</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {/* Batch Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedInvoices.size === overdueInvoices.length}
                    onChange={toggleAll}
                    className="cursor-pointer w-4 h-4"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedInvoices.size > 0 ? `${selectedInvoices.size} selected` : "Select all"}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleBatchAssess}
                  disabled={batchingAll || !settings}
                  className="cursor-pointer"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  {batchingAll ? "Assessing..." : selectedInvoices.size > 0 ? `Assess ${selectedInvoices.size} Selected` : "Assess All"}
                </Button>
              </div>

              {/* Invoice List */}
              <div className="border rounded-lg divide-y">
                {overdueInvoices.map((inv) => (
                  <div key={inv._id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedInvoices.has(inv._id)}
                      onChange={() => toggleSelection(inv._id)}
                      className="cursor-pointer w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{inv.invoiceNumber}</p>
                        <span className="text-xs text-muted-foreground">{inv.customerName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Due: {inv.dueDate}
                        </span>
                        <span className="text-red-600 font-medium">{inv.daysOverdue} days overdue</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium">{fmt(inv.overdueAmount, inv.currency)}</p>
                      <p className="text-xs text-destructive font-semibold">+{fmt(inv.calculatedCharge, inv.currency)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAssessingInvoice(inv)}
                      disabled={!settings}
                      className="cursor-pointer"
                    >
                      <DollarSign className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {charges === undefined ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : charges.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><DollarSign /></EmptyMedia>
                <EmptyTitle>No finance charges yet</EmptyTitle>
                <EmptyDescription>Assessed finance charges will appear here</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="border rounded-lg divide-y">
              {charges.map((charge) => (
                <div key={charge._id} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{charge.invoiceNumber}</p>
                      <span className="text-xs text-muted-foreground">{charge.customerName}</span>
                      <StatusBadge status={charge.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Assessed: {charge.chargeDate}</span>
                      <span>{charge.daysOverdue} days overdue</span>
                      {charge.chargeMethod === "percentage" && <span>{charge.rate}% rate</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold">{fmt(charge.chargeAmount, charge.currency)}</p>
                    <p className="text-xs text-muted-foreground">on {fmt(charge.overdueAmount, charge.currency)}</p>
                  </div>
                  {charge.status === "assessed" && (
                    <Button size="sm" variant="ghost" onClick={() => setUpdatingCharge(charge)} className="cursor-pointer">
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {assessingInvoice && (
        <AssessChargeDialog
          invoice={assessingInvoice}
          onClose={() => setAssessingInvoice(null)}
        />
      )}
      {updatingCharge && (
        <UpdateStatusDialog
          charge={updatingCharge}
          onClose={() => setUpdatingCharge(null)}
        />
      )}
    </div>
  );
}
