/**
 * General Ledger Detail — Report 5
 *
 * Per-account detail with opening balance, every posted line (date order),
 * running balance, period totals, and closing balance reconciliation.
 *
 * Features:
 *  - Multi-account selector with type-group filter
 *  - Date range via ReportShell
 *  - Virtual scrolling for large datasets
 *  - "Include drafts" toggle (off by default)
 *  - Source document column linking to originating document
 *  - DrillDownDrawer on every amount
 *  - Closing balance reconciliation (red if it differs from ledger)
 */
import { useState, useCallback, useRef } from "react";
import { useQuery } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import ReportShell from "@/components/reports/ReportShell.tsx";
import DrillDownDrawer, { useDrillDown, type DrillLine } from "@/components/reports/DrillDownDrawer.tsx";
import type { DateRange } from "@/components/reports/DateRangePicker.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import { useCurrency } from "@/hooks/use-currency.ts";
import {
  BookOpen, ChevronsUpDown, CheckIcon, AlertTriangle,
  ExternalLink, FileText,
} from "lucide-react";
import { Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type GLLineRow = {
  lineId: string;
  journalEntryId: string;
  entryNumber: string;
  date: string;
  description: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceLabel: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

type GLAccountDetail = {
  accountId: string;
  code: string;
  name: string;
  type: string;
  normalSide: "debit" | "credit";
  openingBalance: number;
  lines: GLLineRow[];
  periodTotalDebit: number;
  periodTotalCredit: number;
  closingBalance: number;
  storedBalance: number;
  reconciledOk: boolean;
};

// ─── Source doc link helper ───────────────────────────────────────────────────

function sourceDocPath(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  if (sourceType.startsWith("invoice")) return `/invoicing?highlight=${sourceId}`;
  if (sourceType.startsWith("bill") || sourceType.startsWith("goods_receipt")) return `/purchasing?highlight=${sourceId}`;
  if (sourceType.startsWith("payment")) return `/banking?highlight=${sourceId}`;
  if (sourceType.startsWith("sale")) return `/sales?highlight=${sourceId}`;
  if (sourceType.startsWith("return")) return `/returns?highlight=${sourceId}`;
  return null;
}

// ─── Account multi-selector ───────────────────────────────────────────────────

function AccountSelector({
  accounts,
  selected,
  onChange,
}: {
  accounts: Array<{ _id: string; code: string; name: string; type: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
    );
  };

  const label =
    selected.length === 0
      ? "All accounts"
      : selected.length === 1
      ? accounts.find((a) => a._id === selected[0])?.name ?? "1 account"
      : `${selected.length} accounts`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="cursor-pointer gap-1.5 min-w-[180px] justify-between">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => { onChange([]); setOpen(false); }}
                className="cursor-pointer"
              >
                <CheckIcon className={cn("w-4 h-4 mr-2", selected.length === 0 ? "opacity-100" : "opacity-0")} />
                All accounts
              </CommandItem>
              {accounts.map((a) => (
                <CommandItem
                  key={a._id}
                  value={`${a.code} ${a.name}`}
                  onSelect={() => toggle(a._id)}
                  className="cursor-pointer"
                >
                  <CheckIcon className={cn("w-4 h-4 mr-2", selected.includes(a._id) ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{a.code}</span>
                  <span className="truncate">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Virtualised account section ─────────────────────────────────────────────

function AccountSection({
  detail,
  fmt,
  onDrillDown,
}: {
  detail: GLAccountDetail;
  fmt: (n: number) => string;
  onDrillDown: (line: GLLineRow, isDebit: boolean) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: detail.lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  return (
    <div className="mb-8 break-inside-avoid-page">
      {/* Account header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 rounded-t border-b font-semibold text-sm">
        <BookOpen className="w-4 h-4 text-primary shrink-0" />
        <span className="font-mono text-xs text-muted-foreground">{detail.code}</span>
        <span>{detail.name}</span>
        <Badge variant="outline" className="ml-auto text-[10px]">{detail.type}</Badge>
        {!detail.reconciledOk && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="w-3 h-3" />
            Balance mismatch
          </Badge>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[90px_100px_1fr_140px_80px_80px_100px] gap-1 px-3 py-1.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground border-b sticky top-0 z-10">
        <span>Date</span>
        <span>Entry #</span>
        <span>Source / Description</span>
        <span className="truncate">Document</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
        <span className="text-right">Balance</span>
      </div>

      {/* Opening balance row */}
      <div className="grid grid-cols-[90px_100px_1fr_140px_80px_80px_100px] gap-1 px-3 py-2 text-xs bg-muted/20 border-b italic text-muted-foreground">
        <span>—</span>
        <span>—</span>
        <span className="font-medium text-foreground not-italic">Opening Balance</span>
        <span></span>
        <span></span>
        <span></span>
        <span className="text-right font-mono font-semibold text-foreground not-italic">
          {fmt(detail.openingBalance)}
        </span>
      </div>

      {/* Virtualised lines */}
      {detail.lines.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground italic">No posted lines in this period.</div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ maxHeight: Math.min(detail.lines.length * 36 + 2, 480) }}
        >
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const line = detail.lines[vRow.index];
              if (!line) return null;
              const docPath = sourceDocPath(line.sourceType, line.sourceId);
              return (
                <div
                  key={line.lineId}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vRow.start}px)`,
                    height: vRow.size,
                  }}
                  className="grid grid-cols-[90px_100px_1fr_140px_80px_80px_100px] gap-1 px-3 items-center text-xs border-b hover:bg-muted/20 transition-colors"
                >
                  <span className="font-mono text-muted-foreground">{line.date}</span>
                  <span className="font-mono text-muted-foreground truncate">{line.entryNumber || "—"}</span>
                  <span className="truncate">{line.description}</span>
                  {/* Source document cell */}
                  <span className="truncate">
                    {docPath ? (
                      <Link
                        to={docPath}
                        className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer"
                      >
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{line.sourceLabel}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{line.sourceLabel}</span>
                    )}
                  </span>
                  {/* Debit */}
                  <span
                    className="text-right font-mono cursor-pointer hover:text-primary"
                    onClick={() => line.debit > 0 && onDrillDown(line, true)}
                  >
                    {line.debit > 0 ? fmt(line.debit) : ""}
                  </span>
                  {/* Credit */}
                  <span
                    className="text-right font-mono cursor-pointer hover:text-primary"
                    onClick={() => line.credit > 0 && onDrillDown(line, false)}
                  >
                    {line.credit > 0 ? fmt(line.credit) : ""}
                  </span>
                  {/* Running balance */}
                  <span className={cn(
                    "text-right font-mono font-semibold",
                    line.runningBalance < 0 && "text-destructive"
                  )}>
                    {fmt(line.runningBalance)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Period totals */}
      <div className="grid grid-cols-[90px_100px_1fr_140px_80px_80px_100px] gap-1 px-3 py-2 border-t bg-muted/20 text-xs font-semibold">
        <span className="col-span-4 text-muted-foreground">Period totals</span>
        <span className="text-right font-mono">{fmt(detail.periodTotalDebit)}</span>
        <span className="text-right font-mono">{fmt(detail.periodTotalCredit)}</span>
        <span></span>
      </div>

      {/* Closing balance */}
      <div className={cn(
        "grid grid-cols-[90px_100px_1fr_140px_80px_80px_100px] gap-1 px-3 py-2 border-t text-xs font-bold rounded-b",
        detail.reconciledOk ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"
      )}>
        <span className="col-span-4">
          Closing Balance
          {!detail.reconciledOk && (
            <span className="ml-2 text-destructive font-normal">
              (ledger: {fmt(detail.storedBalance)})
            </span>
          )}
        </span>
        <span></span>
        <span></span>
        <span className={cn(
          "text-right font-mono",
          !detail.reconciledOk && "text-destructive"
        )}>
          {fmt(detail.closingBalance)}
        </span>
      </div>
    </div>
  );
}

// ─── Inner (authenticated) component ─────────────────────────────────────────

function GeneralLedgerInner() {
  const { fmt } = useCurrency();

  const now = new Date();
  const thisYearStart = `${now.getFullYear()}-01-01`;
  const thisYearEnd = `${now.getFullYear()}-12-31`;

  const [dateRange, setDateRange] = useState<DateRange>({ startDate: thisYearStart, endDate: thisYearEnd });
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [typeGroup, setTypeGroup] = useState("all");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const drill = useDrillDown();

  const allAccounts = useQuery(api.accounting.listAccounts, { activeOnly: true });

  const queryArgs = {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    accountIds: selectedAccountIds.length > 0
      ? (selectedAccountIds as Id<"accounts">[])
      : undefined,
    accountTypeGroup: typeGroup !== "all" ? typeGroup : undefined,
    includeDrafts,
  };

  const result = useQuery(api.reports.generalLedger.getGeneralLedger, queryArgs);

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    const rows: string[] = [
      "Account Code,Account Name,Date,Entry #,Source,Description,Debit,Credit,Running Balance",
    ];
    for (const acc of result.accounts) {
      rows.push(`${acc.code},${acc.name},,,,,,,`);
      rows.push(`${acc.code},${acc.name},Opening Balance,,,,,, ${acc.openingBalance}`);
      for (const line of acc.lines) {
        rows.push(
          [
            acc.code,
            acc.name,
            line.date,
            line.entryNumber,
            line.sourceLabel,
            `"${line.description.replace(/"/g, '""')}"`,
            line.debit,
            line.credit,
            line.runningBalance,
          ].join(",")
        );
      }
      rows.push(`${acc.code},${acc.name},Closing Balance,,,,,, ${acc.closingBalance}`);
      rows.push("");
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `general-ledger-${result.startDate}-to-${result.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const accounts = allAccounts ?? [];

  return (
    <ReportShell
      title="General Ledger"
      subtitle={result ? `${result.accounts.length} account${result.accounts.length !== 1 ? "s" : ""} · ${dateRange.startDate} to ${dateRange.endDate}` : undefined}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onExportCsv={handleExportCsv}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          {/* Account type group filter */}
          <Select value={typeGroup} onValueChange={setTypeGroup}>
            <SelectTrigger className="h-8 text-xs w-[140px] cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="asset">Assets</SelectItem>
              <SelectItem value="liability">Liabilities</SelectItem>
              <SelectItem value="equity">Equity</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
            </SelectContent>
          </Select>

          {/* Account multi-selector */}
          <AccountSelector
            accounts={accounts}
            selected={selectedAccountIds}
            onChange={setSelectedAccountIds}
          />

          {/* Include drafts toggle */}
          <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-background">
            <Switch
              id="include-drafts"
              checked={includeDrafts}
              onCheckedChange={setIncludeDrafts}
              className="scale-75 cursor-pointer"
            />
            <Label htmlFor="include-drafts" className="text-xs text-muted-foreground cursor-pointer">
              Include drafts
            </Label>
          </div>
        </div>
      }
    >
      {/* Loading */}
      {result === undefined && (
        <div className="space-y-6 py-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {result !== undefined && result.accounts.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No ledger activity</EmptyTitle>
            <EmptyDescription>
              No posted journal lines found for the selected accounts and date range.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Report content */}
      {result !== undefined && result.accounts.length > 0 && (
        <div className="print:text-xs">
          {/* Draft warning banner */}
          {result.includeDrafts && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Draft entries included — these are unposted and may change.</span>
            </div>
          )}

          {result.accounts.map((acc) => (
            <AccountSection
              key={acc.accountId}
              detail={acc as GLAccountDetail}
              fmt={fmt}
              onDrillDown={(line, isDebit) => {
                const drillLine = {
                  _id: line.lineId as Id<"journalLines">,
                  date: line.date,
                  debit: line.debit,
                  credit: line.credit,
                  description: line.description,
                  accountId: acc.accountId as Id<"accounts">,
                  entryNumber: line.entryNumber,
                  entryDescription: line.description,
                } satisfies DrillLine;
                drill.open({
                  label: `${acc.code} ${acc.name} — ${isDebit ? "Debit" : "Credit"} ${fmt(isDebit ? line.debit : line.credit)}`,
                  lines: [drillLine],
                });
              }}
            />
          ))}
        </div>
      )}

      {/* DrillDown drawer */}
      <DrillDownDrawer state={drill} />
    </ReportShell>
  );
}

export default function GeneralLedgerPage() {
  return (
    <>
      <AuthLoading>
        <div className="p-8 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex items-center justify-center h-full">
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <GeneralLedgerInner />
      </Authenticated>
    </>
  );
}
