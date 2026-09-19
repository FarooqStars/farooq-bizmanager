/**
 * AccountRegisterDialog
 *
 * Opens when the user double-clicks an account in the Chart of Accounts.
 * Replaced the old getAccountRegister query (which merged bankTransactions
 * with journalLines, caused double-entries, had a wrong running balance, and
 * inverted bank conventions) with the new getGeneralLedger query.
 *
 * This dialog is a lightweight wrapper around the GL data for a single account.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription as EmptyDesc } from "@/components/ui/empty.tsx";
import { BookOpen, ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Link } from "react-router-dom";
import DrillDownDrawer, { useDrillDown, type DrillLine } from "@/components/reports/DrillDownDrawer.tsx";

type Props = {
  accountId: Id<"accounts">;
  onClose: () => void;
};

function sourceDocPath(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;
  if (sourceType.startsWith("invoice")) return `/invoicing?highlight=${sourceId}`;
  if (sourceType.startsWith("bill") || sourceType.startsWith("goods_receipt")) return `/purchasing?highlight=${sourceId}`;
  if (sourceType.startsWith("payment")) return `/banking?highlight=${sourceId}`;
  if (sourceType.startsWith("sale")) return `/sales?highlight=${sourceId}`;
  return null;
}

// Default: year to date
function yearRange(): { startDate: string; endDate: string } {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

export default function AccountRegisterDialog({ accountId, onClose }: Props) {
  const { fmt } = useCurrency();
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const drill = useDrillDown();

  const range = yearRange();

  const data = useQuery(api.reports.generalLedger.getGeneralLedger, {
    startDate: range.startDate,
    endDate: range.endDate,
    accountIds: [accountId],
    includeDrafts,
  });

  const accountDetail = data?.accounts?.[0];

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            {accountDetail ? (
              <>
                <DialogTitle className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <span>Account Register</span>
                  <Badge variant="secondary" className="font-mono text-xs">{accountDetail.code}</Badge>
                  {!accountDetail.reconciledOk && (
                    <Badge variant="destructive" className="text-xs gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Balance mismatch
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-medium text-foreground">{accountDetail.name}</span>
                  <div className="flex items-center gap-3">
                    {/* Include drafts toggle */}
                    <div className="flex items-center gap-1.5">
                      <Switch
                        id="reg-drafts"
                        checked={includeDrafts}
                        onCheckedChange={setIncludeDrafts}
                        className="scale-75 cursor-pointer"
                      />
                      <Label htmlFor="reg-drafts" className="text-xs text-muted-foreground cursor-pointer">
                        Include drafts
                      </Label>
                    </div>
                    <span className="font-mono font-bold text-base text-foreground">
                      Balance: {fmt(accountDetail.closingBalance)}
                    </span>
                    {!accountDetail.reconciledOk && (
                      <span className="text-xs text-muted-foreground">
                        (ledger: {fmt(accountDetail.storedBalance)})
                      </span>
                    )}
                  </div>
                </DialogDescription>
                <p className="text-xs text-muted-foreground mt-1">
                  YTD {range.startDate} — {range.endDate}
                  {" · "}
                  <Link to={`/reports/general-ledger?accounts=${accountId}`} className="text-primary hover:underline cursor-pointer">
                    Open in Full Ledger
                  </Link>
                </p>
              </>
            ) : (
              <>
                <DialogTitle>Account Register</DialogTitle>
                <DialogDescription>Loading transactions...</DialogDescription>
              </>
            )}
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {!data ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !accountDetail || accountDetail.lines.length === 0 ? (
              <div className="p-12">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><BookOpen /></EmptyMedia>
                    <EmptyTitle>No transactions</EmptyTitle>
                    <EmptyDesc>This account has no posted transactions in the current year.</EmptyDesc>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <ScrollArea className="h-[60vh]">
                <div className="min-w-[780px]">
                  {/* Table header */}
                  <div className="grid grid-cols-[90px_100px_1fr_140px_90px_90px_110px] gap-1 px-4 py-2.5 bg-muted/50 text-xs font-semibold text-muted-foreground border-b sticky top-0 z-10">
                    <span>Date</span>
                    <span>Entry #</span>
                    <span>Description</span>
                    <span>Document</span>
                    <span className="text-right">Debit</span>
                    <span className="text-right">Credit</span>
                    <span className="text-right">Balance</span>
                  </div>

                  {/* Opening balance row */}
                  <div className="grid grid-cols-[90px_100px_1fr_140px_90px_90px_110px] gap-1 px-4 py-2 text-xs border-b bg-muted/20 italic text-muted-foreground">
                    <span>—</span><span>—</span>
                    <span className="font-medium text-foreground not-italic">Opening Balance</span>
                    <span></span><span></span><span></span>
                    <span className="text-right font-mono font-semibold text-foreground not-italic">
                      {fmt(accountDetail.openingBalance)}
                    </span>
                  </div>

                  {/* Lines */}
                  <div className="divide-y">
                    {accountDetail.lines.map((line, idx) => {
                      const docPath = sourceDocPath(line.sourceType, line.sourceId);
                      return (
                        <div
                          key={line.lineId + idx}
                          className="grid grid-cols-[90px_100px_1fr_140px_90px_90px_110px] gap-1 px-4 py-2 items-center text-xs hover:bg-muted/20 transition-colors"
                        >
                          <span className="font-mono text-muted-foreground">{line.date}</span>
                          <span className="font-mono text-muted-foreground truncate">{line.entryNumber || "—"}</span>
                          <span className="truncate">{line.description}</span>
                          <span className="truncate">
                            {docPath ? (
                              <Link to={docPath} className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer">
                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{line.sourceLabel}</span>
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">{line.sourceLabel}</span>
                            )}
                          </span>
                          <span
                            className={cn("text-right font-mono cursor-pointer hover:text-primary", line.debit > 0 && "text-green-600 dark:text-green-400 font-medium")}
                            onClick={() => line.debit > 0 && drill.open({
                              label: `${accountDetail.code} — Debit ${fmt(line.debit)}`,
                              lines: [{ _id: line.lineId as Id<"journalLines">, date: line.date, debit: line.debit, credit: line.credit, description: line.description, accountId: accountDetail.accountId as Id<"accounts">, entryNumber: line.entryNumber } satisfies DrillLine],
                            })}
                          >
                            {line.debit > 0 ? fmt(line.debit) : ""}
                          </span>
                          <span
                            className={cn("text-right font-mono cursor-pointer hover:text-primary", line.credit > 0 && "text-red-600 dark:text-red-400 font-medium")}
                            onClick={() => line.credit > 0 && drill.open({
                              label: `${accountDetail.code} — Credit ${fmt(line.credit)}`,
                              lines: [{ _id: line.lineId as Id<"journalLines">, date: line.date, debit: line.debit, credit: line.credit, description: line.description, accountId: accountDetail.accountId as Id<"accounts">, entryNumber: line.entryNumber } satisfies DrillLine],
                            })}
                          >
                            {line.credit > 0 ? fmt(line.credit) : ""}
                          </span>
                          <span className={cn("text-right font-mono font-semibold", line.runningBalance < 0 && "text-destructive")}>
                            {fmt(line.runningBalance)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer totals */}
                  <div className="grid grid-cols-[90px_100px_1fr_140px_90px_90px_110px] gap-1 px-4 py-3 bg-muted/50 border-t text-xs font-bold sticky bottom-0">
                    <span className="col-span-4 text-muted-foreground">
                      {accountDetail.lines.length} transaction{accountDetail.lines.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-right font-mono text-green-600 dark:text-green-400">
                      {fmt(accountDetail.periodTotalDebit)}
                    </span>
                    <span className="text-right font-mono text-red-600 dark:text-red-400">
                      {fmt(accountDetail.periodTotalCredit)}
                    </span>
                    <span className={cn("text-right font-mono", !accountDetail.reconciledOk && "text-destructive")}>
                      {fmt(accountDetail.closingBalance)}
                    </span>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-3 border-t flex justify-end gap-2">
            <Button variant="secondary" size="sm" asChild className="cursor-pointer">
              <Link to={`/reports/general-ledger?accounts=${accountId}`}>
                Open full report
              </Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose} className="cursor-pointer">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DrillDown drawer — outside the dialog */}
      <DrillDownDrawer state={drill} />
    </>
  );
}
