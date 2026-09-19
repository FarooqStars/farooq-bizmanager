import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { Settings, TrendingDown, Calendar, BarChart3, DollarSign } from "lucide-react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// ── Depreciation Settings Dialog ──────────────────────────────────────────────

export function DepreciationSettingsDialog({
  assetId,
  currentMethod,
  currentUsefulLife,
  currentSalvageValue,
  currentRate,
  currentStartDate,
  purchaseDate,
  onClose,
}: {
  assetId: Id<"assets">;
  currentMethod?: string;
  currentUsefulLife?: number;
  currentSalvageValue?: number;
  currentRate?: number;
  currentStartDate?: string;
  purchaseDate?: string;
  onClose: () => void;
}) {
  const updateSettings = useMutation(api.depreciation.updateDepreciationSettings);
  const [method, setMethod] = useState(currentMethod ?? "none");
  const [usefulLife, setUsefulLife] = useState(String(currentUsefulLife ?? 5));
  const [salvageValue, setSalvageValue] = useState(String(currentSalvageValue ?? 0));
  const [rate, setRate] = useState(String(currentRate ?? 20));
  const [startDate, setStartDate] = useState(currentStartDate ?? purchaseDate ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        assetId,
        depreciationMethod: method as "straight_line" | "declining_balance" | "none",
        usefulLifeYears: method === "straight_line" ? parseFloat(usefulLife) : undefined,
        salvageValue: parseFloat(salvageValue) || 0,
        depreciationRate: method === "declining_balance" ? parseFloat(rate) : undefined,
        depreciationStartDate: startDate || undefined,
      });
      toast.success("Depreciation settings updated");
      onClose();
    } catch {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Depreciation Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Depreciation Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Depreciation</SelectItem>
                <SelectItem value="straight_line">Straight-Line</SelectItem>
                <SelectItem value="declining_balance">Declining Balance</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {method === "straight_line" && "Equal depreciation each period over the asset's useful life."}
              {method === "declining_balance" && "Higher depreciation early, decreasing over time based on a fixed rate."}
              {method === "none" && "No automatic depreciation calculation."}
            </p>
          </div>

          {method !== "none" && (
            <>
              <div className="space-y-1.5">
                <Label>Depreciation Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">When depreciation begins (defaults to purchase date)</p>
              </div>

              <div className="space-y-1.5">
                <Label>Salvage / Residual Value ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salvageValue}
                  onChange={(e) => setSalvageValue(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">Value at the end of useful life</p>
              </div>

              {method === "straight_line" && (
                <div className="space-y-1.5">
                  <Label>Useful Life (Years)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    value={usefulLife}
                    onChange={(e) => setUsefulLife(e.target.value)}
                    placeholder="5"
                  />
                </div>
              )}

              {method === "declining_balance" && (
                <div className="space-y-1.5">
                  <Label>Annual Depreciation Rate (%)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="20"
                  />
                  <p className="text-xs text-muted-foreground">Common rates: 20% (5-year), 15% (7-year), 10% (10-year)</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Depreciation Detail Panel ─────────────────────────────────────────────────

export function DepreciationPanel({ assetId, assetName }: { assetId: Id<"assets">; assetName: string }) {
  const { fmt, symbol } = useCurrency();
  const schedule = useQuery(api.depreciation.getDepreciationSchedule, { assetId });

  if (schedule === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!schedule.method || schedule.method === "none") {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p>No depreciation method configured for this asset.</p>
        <p className="text-xs mt-1">Configure depreciation settings to see the schedule.</p>
      </div>
    );
  }

  const methodLabel = schedule.method === "straight_line" ? "Straight-Line" : "Declining Balance";
  const chartData = schedule.schedule.map((entry) => ({
    label: entry.label,
    bookValue: entry.closingValue,
    depreciation: entry.depreciationAmount,
    accumulated: entry.accumulatedDepreciation,
  }));

  // Show yearly summary for the table (aggregate months into years)
  const yearlyData: Array<{
    year: number;
    openingValue: number;
    yearDepreciation: number;
    accumulatedDepreciation: number;
    closingValue: number;
  }> = [];

  let currentYear = -1;
  let yearStart = 0;
  let yearDep = 0;

  for (const entry of schedule.schedule) {
    if (entry.year !== currentYear) {
      if (currentYear !== -1) {
        yearlyData.push({
          year: currentYear,
          openingValue: yearStart,
          yearDepreciation: Math.round(yearDep * 100) / 100,
          accumulatedDepreciation: schedule.schedule.find((e) => e.year === currentYear && e.month === 12)?.accumulatedDepreciation
            ?? schedule.schedule.filter((e) => e.year === currentYear).slice(-1)[0]?.accumulatedDepreciation ?? 0,
          closingValue: schedule.schedule.filter((e) => e.year === currentYear).slice(-1)[0]?.closingValue ?? 0,
        });
      }
      currentYear = entry.year;
      yearStart = entry.openingValue;
      yearDep = 0;
    }
    yearDep += entry.depreciationAmount;
  }
  // Final year
  if (currentYear !== -1) {
    yearlyData.push({
      year: currentYear,
      openingValue: yearStart,
      yearDepreciation: Math.round(yearDep * 100) / 100,
      accumulatedDepreciation: schedule.schedule.filter((e) => e.year === currentYear).slice(-1)[0]?.accumulatedDepreciation ?? 0,
      closingValue: schedule.schedule.filter((e) => e.year === currentYear).slice(-1)[0]?.closingValue ?? 0,
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Method</p>
          <p className="font-semibold text-sm mt-0.5">{methodLabel}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Book Value</p>
          <p className="font-bold text-sm mt-0.5 text-primary">{fmt(schedule.summary.currentBookValue)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Depreciation</p>
          <p className="font-bold text-sm mt-0.5 text-red-500">{fmt(schedule.summary.totalDepreciation)}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="bookValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.45 0.18 250)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.45 0.18 250)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(chartData.length / 8))}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${symbol} ${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value) => [fmt(Number(value)), "Book Value"]}
                labelFormatter={(label) => `Period: ${String(label)}`}
              />
              <Area
                type="monotone"
                dataKey="bookValue"
                stroke="oklch(0.45 0.18 250)"
                strokeWidth={2}
                fill="url(#bookValueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Yearly schedule table */}
      {yearlyData.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Year</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Depreciation</th>
                <th className="px-3 py-2 text-right font-medium">Accumulated</th>
                <th className="px-3 py-2 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {yearlyData.map((row) => (
                <tr key={row.year} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{row.year}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.openingValue)}</td>
                  <td className="px-3 py-2 text-right text-red-500">{fmt(row.yearDepreciation)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.accumulatedDepreciation)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(row.closingValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Depreciation Report Page Component ────────────────────────────────────────

export function DepreciationReport() {
  const { fmt } = useCurrency();
  const summary = useQuery(api.depreciation.getDepreciationSummary);
  const recalculate = useMutation(api.depreciation.recalculateAllDepreciation);
  const postDepreciation = useMutation(api.depreciation.postMonthlyDepreciation);
  const postDepreciationUpTo = useMutation(api.depreciation.postDepreciationUpTo);
  const [recalculating, setRecalculating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [showBackfillConfirm, setShowBackfillConfirm] = useState(false);

  // Default to current month
  const currentYearMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentYearMonth);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const result = await recalculate({});
      toast.success(`Updated ${result.updated} asset(s)`);
    } catch {
      toast.error("Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  };

  const handlePostDepreciation = async () => {
    setPosting(true);
    try {
      const result = await postDepreciation({ yearMonth: selectedMonth });
      if (result.posted === 0) {
        toast.info(`No new entries to post for ${selectedMonth} (${result.skipped} already posted or no depreciation)`);
      } else {
        toast.success(`Posted ${result.posted} depreciation entr${result.posted === 1 ? "y" : "ies"} for ${selectedMonth}`);
      }
    } catch {
      toast.error("Failed to post depreciation");
    } finally {
      setPosting(false);
    }
  };

  const handleBackfill = async () => {
    setShowBackfillConfirm(false);
    setBackfilling(true);
    try {
      const result = await postDepreciationUpTo({ toYearMonth: selectedMonth });
      if (result.posted === 0) {
        toast.info(`All entries already posted up to ${selectedMonth} — nothing new to add.`);
      } else {
        toast.success(
          `Backfill complete: posted ${result.posted} journal entr${result.posted === 1 ? "y" : "ies"} across ${result.assetsProcessed} asset(s) up to ${selectedMonth}.`
        );
      }
    } catch {
      toast.error("Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  if (summary === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <p className="text-xs text-muted-foreground">Original Cost</p>
            </div>
            <p className="text-xl font-bold">{fmt(summary.totalOriginalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Current Book Value</p>
            </div>
            <p className="text-xl font-bold text-green-600">{fmt(summary.totalCurrentBookValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <p className="text-xs text-muted-foreground">Total Depreciation</p>
            </div>
            <p className="text-xl font-bold text-red-500">{fmt(summary.totalAccumulatedDepreciation)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Assets Tracked</p>
            </div>
            <p className="text-xl font-bold">{summary.assetsWithDepreciation} <span className="text-sm font-normal text-muted-foreground">/ {summary.totalAssets}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Month:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
          />
          <Button size="sm" onClick={handlePostDepreciation} disabled={posting || backfilling}>
            {posting ? "Posting..." : "Post This Month"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowBackfillConfirm(true)}
            disabled={posting || backfilling}
          >
            {backfilling ? "Catching Up..." : "Catch Up All Backlog"}
          </Button>
        </div>
        <Button variant="secondary" size="sm" onClick={handleRecalculate} disabled={recalculating}>
          {recalculating ? "Recalculating..." : "Recalculate All Values"}
        </Button>
      </div>

      {/* Backfill confirmation dialog */}
      <Dialog open={showBackfillConfirm} onOpenChange={setShowBackfillConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Post All Backlog Depreciation?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              This will automatically post a journal entry for <strong>every unposted month</strong> from
              each asset's depreciation start date up to <strong>{selectedMonth}</strong>.
            </p>
            <p>Already-posted months will be skipped — it's safe to run more than once.</p>
            <p className="text-foreground font-medium">This may create many entries if assets have long histories.</p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowBackfillConfirm(false)}>Cancel</Button>
            <Button onClick={handleBackfill}>Yes, Catch Up All Backlog</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset breakdown table */}
      {summary.assetSummaries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asset Depreciation Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Asset</th>
                    <th className="px-3 py-2 text-left font-medium">Method</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                    <th className="px-3 py-2 text-right font-medium">Book Value</th>
                    <th className="px-3 py-2 text-right font-medium">Accumulated</th>
                    <th className="px-3 py-2 text-right font-medium">Monthly</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.assetSummaries.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.name}</span>
                          {a.status !== "active" && <Badge variant="secondary" className="text-xs">{a.status}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className="text-xs">
                          {a.method === "straight_line" ? "SL" : "DB"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">{fmt(a.purchasePrice)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{fmt(a.currentBookValue)}</td>
                      <td className="px-3 py-2.5 text-right text-red-500">{fmt(a.accumulatedDepreciation)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(a.monthlyDepreciation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No assets with depreciation configured.</p>
          <p className="text-xs mt-1">Set up depreciation on individual assets to see the report.</p>
        </div>
      )}
    </div>
  );
}
