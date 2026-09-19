import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Calendar, Lock, Unlock, Archive } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

export default function FiscalPeriodsTab() {
  const periods = useQuery(api.accounting.listFiscalPeriods, {});
  const closePeriod = useMutation(api.accounting.closeFiscalPeriod);
  const lockPeriod = useMutation(api.accounting.lockFiscalPeriod);
  const [showCreate, setShowCreate] = useState(false);
  const [closingPeriodId, setClosingPeriodId] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState(new Date().toISOString().slice(0, 10));

  if (!periods) {
    return <Skeleton className="h-40 w-full" />;
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "closed": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "locked": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Fiscal Periods
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />New Period
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage fiscal years and closing dates. Locked periods prevent any edits before the closing date.
          </p>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Calendar /></EmptyMedia>
                <EmptyTitle>No fiscal periods</EmptyTitle>
                <EmptyDescription>Create a fiscal period to manage year-end closing</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreate(true)}>Create Period</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-3">
              {periods.map((period) => (
                <div key={period._id} className="flex items-center gap-4 p-3 border rounded-lg flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{period.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(period.status)}`}>
                        {period.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(period.startDate), "MMM d, yyyy")} — {format(new Date(period.endDate), "MMM d, yyyy")}
                    </p>
                    {period.closedAt && (
                      <p className="text-xs text-muted-foreground">
                        Closed: {format(new Date(period.closedAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {period.status === "open" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => setClosingPeriodId(period._id)}
                      >
                        <Lock className="w-3 h-3 mr-1" />Close Period
                      </Button>
                    )}
                    {period.status === "closed" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer"
                        onClick={async () => {
                          try {
                            await lockPeriod({ id: period._id });
                            toast.success("Period locked — no entries allowed before closing date");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        <Lock className="w-3 h-3 mr-1" />Lock Period
                      </Button>
                    )}
                    {period.status === "locked" && (
                      <Badge variant="destructive" className="text-xs">
                        <Lock className="w-3 h-3 mr-1" />Locked
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <YearEndCloseCard />

      {/* Close period dialog */}
      {closingPeriodId && (
        <Dialog open onOpenChange={(o) => !o && setClosingPeriodId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Close Fiscal Period</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set a closing date. After locking, no journal entries can be created on or before this date.
              </p>
              <div>
                <Label>Closing Date</Label>
                <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setClosingPeriodId(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  try {
                    await closePeriod({ id: closingPeriodId as Parameters<typeof closePeriod>[0]["id"] });
                    toast.success("Period closed");
                    setClosingPeriodId(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
              >
                Close Period
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create period dialog */}
      {showCreate && <CreatePeriodDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function YearEndCloseCard() {
  const closeYearEnd = useMutation(api.accounting.closeYearEnd);
  const [asOfDate, setAsOfDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleClose = async () => {
    setSaving(true);
    try {
      const res = await closeYearEnd({ asOfDate });
      if (!res.entryId) {
        toast.info("No income or expense balances to close for this period");
      } else {
        toast.success(
          `Year-end closed. Net ${res.netIncome >= 0 ? "income" : "loss"} of ${Math.abs(res.netIncome).toLocaleString(undefined, { minimumFractionDigits: 2 })} moved to Retained Earnings.`,
        );
      }
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to close year");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="w-4 h-4" />
          Year-End Close
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sweep all income and expense balances into Retained Earnings as of a date. This posts a
          closing journal entry so the new year starts fresh and the Balance Sheet ties to the Trial
          Balance.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">As of Date</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 w-44"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setConfirming(true)}
          >
            <Archive className="w-3 h-3 mr-1" />Post Closing Entry
          </Button>
        </div>
      </CardContent>

      {confirming && (
        <Dialog open onOpenChange={(o) => !o && setConfirming(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Post Year-End Closing Entry?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will zero out all income and expense accounts as of{" "}
              <span className="font-medium text-foreground">{asOfDate}</span> and move the net
              result into Retained Earnings. This action posts a real journal entry.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button onClick={handleClose} disabled={saving}>
                {saving ? "Posting..." : "Confirm & Post"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function CreatePeriodDialog({ onClose }: { onClose: () => void }) {
  const createPeriod = useMutation(api.accounting.createFiscalPeriod);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(new Date().getFullYear() + "-01-01");
  const [endDate, setEndDate] = useState(new Date().getFullYear() + "-12-31");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      await createPeriod({ name, startDate, endDate });
      toast.success("Fiscal period created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Fiscal Period</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="FY 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
