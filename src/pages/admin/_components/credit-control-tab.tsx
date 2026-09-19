import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { InfoIcon, SaveIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { CreditStatusBadge } from "@/pages/sales/_components/customer-dialog.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

const THRESHOLD_OPTIONS = [
  { label: "No threshold (disabled)", days: "none" },
  { label: "3 months (91 days)", days: "91" },
  { label: "4 months (122 days)", days: "122" },
  { label: "6 months (183 days)", days: "183" },
  { label: "1 year (365 days)", days: "365" },
  { label: "2 years (730 days)", days: "730" },
  { label: "3 years (1,095 days)", days: "1095" },
] as const;

function daysToOption(days: number | null | undefined): string {
  if (days == null) return "none";
  return String(days);
}

function optionToDays(val: string): number | undefined {
  if (val === "none") return undefined;
  return Number(val);
}

// ─── Inline status change dialog (used from the hold/blacklist list) ──────────
type CreditStatus = "active" | "watch" | "hold" | "blacklisted";

function QuickStatusDialog({
  customer,
  onClose,
}: {
  customer: Doc<"customers">;
  onClose: () => void;
}) {
  const [newStatus, setNewStatus] = useState<CreditStatus>(
    (customer.creditStatus as CreditStatus | undefined) ?? "active",
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const updateStatus = useMutation(api.sales.updateCustomerCreditStatus);

  const handleSave = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await updateStatus({ customerId: customer._id, newStatus, reason: reason.trim() });
      toast.success("Credit status updated");
      onClose();
    } catch {
      toast.error("Failed to update credit status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Credit Status — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CreditStatus)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="watch">Watch (informational)</SelectItem>
                <SelectItem value="hold">Credit Hold (blocks credit sales)</SelectItem>
                <SelectItem value="blacklisted">Blacklisted (blocks credit sales)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is the status being changed?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !reason.trim()} className="cursor-pointer">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hold / Blacklist customer list ──────────────────────────────────────────

function CreditHoldList() {
  const customers = useQuery(api.sales.listNonActiveCustomers, {});
  const [selectedCustomer, setSelectedCustomer] = useState<Doc<"customers"> | null>(null);

  if (customers === undefined) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (customers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No customers are on watch, hold, or blacklisted.
      </p>
    );
  }

  return (
    <>
      <div className="divide-y rounded-md border">
        {customers.map((c) => (
          <div key={c._id} className="flex items-center justify-between px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{c.name}</p>
              {c.creditStatusReason && (
                <p className="text-xs text-muted-foreground">{c.creditStatusReason}</p>
              )}
              {c.creditStatusChangedAt && (
                <p className="text-xs text-muted-foreground">
                  Since {new Date(c.creditStatusChangedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <CreditStatusBadge status={c.creditStatus} />
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setSelectedCustomer(c)}
              >
                Change
              </Button>
            </div>
          </div>
        ))}
      </div>

      {selectedCustomer && (
        <QuickStatusDialog
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────

export default function CreditControlTab() {
  const settings = useQuery(api.creditControlSettings.getCreditControlSettings, {});
  const save = useMutation(api.creditControlSettings.saveCreditControlSettings);

  const [doubtful, setDoubtful] = useState<string | null>(null);
  const [blacklist, setBlacklist] = useState<string | null>(null);
  const [writeOff, setWriteOff] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialise local state from loaded settings once
  const effectiveDoubtful = doubtful ?? daysToOption(settings?.doubtfulDays);
  const effectiveBlacklist = blacklist ?? daysToOption(settings?.blacklistDays);
  const effectiveWriteOff = writeOff ?? daysToOption(settings?.writeOffDays);

  const isDirty =
    settings != null &&
    (effectiveDoubtful !== daysToOption(settings.doubtfulDays) ||
      effectiveBlacklist !== daysToOption(settings.blacklistDays) ||
      effectiveWriteOff !== daysToOption(settings.writeOffDays));

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        doubtfulDays: optionToDays(effectiveDoubtful),
        blacklistDays: optionToDays(effectiveBlacklist),
        writeOffDays: optionToDays(effectiveWriteOff),
      });
      setDoubtful(null);
      setBlacklist(null);
      setWriteOff(null);
      toast.success("Credit control settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (settings === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Thresholds ── */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Control Thresholds</CardTitle>
          <CardDescription>
            Company-wide defaults used by the Bad Debt Review screen to flag overdue invoices.
            These are for detection only — no status changes happen automatically.
            Per-customer overrides can be set on the individual customer record.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="font-medium">Doubtful threshold</Label>
              <Badge variant="outline" className="text-yellow-600 border-yellow-400">Watch</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Invoices overdue by this many days appear on the watch list in the Bad Debt
              Review screen.
            </p>
            <Select value={effectiveDoubtful} onValueChange={(v) => setDoubtful(v)}>
              <SelectTrigger className="w-64 cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                {THRESHOLD_OPTIONS.map((o) => (
                  <SelectItem key={o.days} value={String(o.days)} className="cursor-pointer">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="font-medium">Credit block threshold</Label>
              <Badge variant="outline" className="text-orange-600 border-orange-400">Hold</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Invoices overdue beyond this threshold are flagged as hold candidates on the
              Bad Debt Review screen. The owner decides whether to place the customer on
              credit hold — this threshold does not change the customer status automatically.
            </p>
            <Select value={effectiveBlacklist} onValueChange={(v) => setBlacklist(v)}>
              <SelectTrigger className="w-64 cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                {THRESHOLD_OPTIONS.map((o) => (
                  <SelectItem key={o.days} value={String(o.days)} className="cursor-pointer">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="font-medium">Write-off proposal threshold</Label>
              <Badge variant="destructive">Bad Debt</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              After this many days overdue, the invoice is proposed for bad-debt write-off
              review. No write-off is posted automatically — the owner reviews and decides.
            </p>
            <Select value={effectiveWriteOff} onValueChange={(v) => setWriteOff(v)}>
              <SelectTrigger className="w-64 cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                {THRESHOLD_OPTIONS.map((o) => (
                  <SelectItem key={o.days} value={String(o.days)} className="cursor-pointer">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              All three thresholds are for detection only — they drive the review screen,
              not automatic actions. A typical configuration: doubtful at 6 months, credit
              block at 1 year, write-off at 2 years. Setting "No threshold" disables that
              stage on the review screen.
            </span>
          </div>

          <Button onClick={handleSave} disabled={saving || !isDirty} className="cursor-pointer">
            <SaveIcon className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Hold / Blacklist list ── */}
      <Card>
        <CardHeader>
          <CardTitle>Customers on Hold or Blacklisted</CardTitle>
          <CardDescription>
            Customers with a non-active credit status. Watch is informational. Hold and
            Blacklisted block all credit sales. Only the account owner can change these.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreditHoldList />
        </CardContent>
      </Card>

    </div>
  );
}
