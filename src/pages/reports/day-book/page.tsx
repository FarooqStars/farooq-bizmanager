/**
 * Report 9 — Day Book
 *
 * All posted transactions for a date range, grouped by type.
 * Summary strip at top; per-day totals when range > 1 day.
 * Total debits/credits shown at foot (must be equal).
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { cn } from "@/lib/utils.ts";
import {
  CheckCircle2,
  AlertCircle,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  TrendingDown,
  Hash,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { DayBookGroup, DayBookSummaryStrip, DayBookDaySummary } from "@/convex/reports/dayBook.ts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── subcomponents ────────────────────────────────────────────────────────────

function SummaryStrip({ summary, totalDebit, totalCredit, inBalance }: {
  summary: DayBookSummaryStrip;
  totalDebit: number;
  totalCredit: number;
  inBalance: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-1">
            <ArrowDownRight className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Cash In</span>
          </div>
          <p className="text-xl font-semibold text-green-800 dark:text-green-300">{fmt(summary.cashIn)}</p>
        </CardContent>
      </Card>
      <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-1">
            <ArrowUpRight className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Cash Out</span>
          </div>
          <p className="text-xl font-semibold text-red-800 dark:text-red-300">{fmt(summary.cashOut)}</p>
        </CardContent>
      </Card>
      <Card className={cn(
        summary.netCash >= 0
          ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900"
          : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
      )}>
        <CardContent className="pt-4 pb-3">
          <div className={cn("flex items-center gap-2 mb-1",
            summary.netCash >= 0 ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"
          )}>
            {summary.netCash >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span className="text-xs font-medium uppercase tracking-wide">Net Cash</span>
          </div>
          <p className={cn("text-xl font-semibold",
            summary.netCash >= 0 ? "text-blue-800 dark:text-blue-300" : "text-amber-800 dark:text-amber-300"
          )}>
            {summary.netCash >= 0 ? "+" : ""}{fmt(summary.netCash)}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-muted/50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Hash className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Documents</span>
          </div>
          <p className="text-xl font-semibold">{summary.documentCount}</p>
        </CardContent>
      </Card>

      {/* Balance check spans all columns */}
      <div className={cn(
        "col-span-2 sm:col-span-4 flex items-center justify-between rounded-lg px-4 py-2 text-sm font-medium",
        inBalance
          ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
          : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
      )}>
        <div className="flex items-center gap-2">
          {inBalance ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>Total Debits = Total Credits</span>
        </div>
        <div className="flex items-center gap-6 text-xs tabular-nums">
          <span>Dr: {fmt(totalDebit)}</span>
          <span>Cr: {fmt(totalCredit)}</span>
          {!inBalance && <span className="font-bold">Diff: {fmt(totalDebit - totalCredit)}</span>}
        </div>
      </div>
    </div>
  );
}

function DaySummaryRow({ daySummary }: { daySummary: DayBookDaySummary }) {
  return (
    <tr className="bg-muted/30 font-medium text-sm">
      <td colSpan={4} className="px-3 py-2 text-muted-foreground">{fmtDate(daySummary.date)} — Day Total</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(daySummary.totalDebit)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt(daySummary.totalCredit)}</td>
    </tr>
  );
}

function GroupTable({
  group,
  daySummaries,
  showDayTotals,
}: {
  group: DayBookGroup;
  daySummaries: DayBookDaySummary[];
  showDayTotals: boolean;
}) {
  const [open, setOpen] = useState(true);
  if (group.rows.length === 0) return null;

  // We interleave day-total rows if showDayTotals
  const rowsByDate = new Map<string, DayBookGroup["rows"]>();
  for (const row of group.rows) {
    const arr = rowsByDate.get(row.date) ?? [];
    arr.push(row);
    rowsByDate.set(row.date, arr);
  }

  const daySummaryByDate = new Map(daySummaries.map((d) => [d.date, d]));

  return (
    <div className="mb-6">
      <button
        className="w-full flex items-center gap-2 text-left px-4 py-2.5 bg-muted/60 hover:bg-muted rounded-t-lg cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        <span className="font-semibold text-sm">{group.label}</span>
        <Badge variant="secondary" className="ml-auto text-xs">{group.rows.length}</Badge>
      </button>

      {open && (
        <div className="border rounded-b-lg overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-medium w-24">Date / Entry</th>
                <th className="px-3 py-2 text-left font-medium">Ref / Doc</th>
                <th className="px-3 py-2 text-left font-medium">Party</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium w-28">Debit</th>
                <th className="px-3 py-2 text-right font-medium w-28">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[...rowsByDate.entries()].map(([date, rows]) => (
                <>
                  {rows.map((row: DayBookGroup["rows"][number]) => (
                    <tr key={row.journalEntryId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        <div>{fmtDate(row.date).split(",")[0]}</div>
                        <div className="text-primary/80">{row.entryNumber}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[140px] truncate">
                        {row.reference ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate">
                        {row.party ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate">{row.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {row.debit > 0 ? fmt(row.debit) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {row.credit > 0 ? fmt(row.credit) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                  {showDayTotals && daySummaryByDate.has(date) && (
                    <DaySummaryRow key={`day-${date}`} daySummary={daySummaryByDate.get(date)!} />
                  )}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-sm">{group.label} — Subtotal</td>
                <td className="px-3 py-2 text-right tabular-nums text-sm">{fmt(group.subtotalDebit)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sm">{fmt(group.subtotalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

function DayBookInner() {
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [submitted, setSubmitted] = useState<{ start: string; end: string }>({ start: today(), end: today() });

  const result = useQuery(api.reports.dayBook.getDayBook, {
    startDate: submitted.start,
    endDate: submitted.end,
  });

  const isRange = submitted.start !== submitted.end;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Day Book</h1>
            <p className="text-xs text-muted-foreground">All posted transactions in date order, grouped by type</p>
          </div>
        </div>
        {result && (
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full",
            result.inBalance ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
              : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
          )}>
            {result.inBalance
              ? <><CheckCircle2 className="w-3.5 h-3.5" /> In Balance</>
              : <><AlertCircle className="w-3.5 h-3.5" /> Out of Balance</>
            }
          </div>
        )}
      </div>

      {/* Date range picker */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start-date" className="text-xs">From Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40 h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date" className="text-xs">To Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40 h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => setSubmitted({ start: startDate, end: endDate })}
            >
              View
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {result === undefined && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Summary strip */}
          <SummaryStrip
            summary={result.summary}
            totalDebit={result.totalDebit}
            totalCredit={result.totalCredit}
            inBalance={result.inBalance}
          />

          {/* Groups */}
          {result.groups.every((g) => g.rows.length === 0) ? (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No posted transactions found</p>
              <p className="text-xs mt-1">There are no posted journal entries for this date range.</p>
            </div>
          ) : (
            <>
              {result.groups.map((group) => (
                <GroupTable
                  key={group.label}
                  group={group}
                  daySummaries={result.daySummaries}
                  showDayTotals={isRange}
                />
              ))}

              {/* Footer totals */}
              <Card className="border-2">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">Grand Total</span>
                    <div className="flex gap-8 text-sm tabular-nums">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Total Debits</div>
                        <div className="font-semibold">{fmt(result.totalDebit)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Total Credits</div>
                        <div className="font-semibold">{fmt(result.totalCredit)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Difference</div>
                        <div className={cn("font-semibold",
                          result.inBalance ? "text-green-600 dark:text-green-400" : "text-red-600"
                        )}>
                          {result.inBalance ? "—" : fmt(result.totalDebit - result.totalCredit)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function DayBookPage() {
  return (
    <>
      <Unauthenticated><div className="p-8 text-center"><SignInButton /></div></Unauthenticated>
      <AuthLoading><div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></AuthLoading>
      <Authenticated><DayBookInner /></Authenticated>
    </>
  );
}
