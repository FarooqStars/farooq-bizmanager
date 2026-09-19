/**
 * Reconciliation Panel — live health check component.
 * Used at the top of the Reports Hub.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { Authenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { cn } from "@/lib/utils.ts";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import type { ReconciliationCheck } from "@/convex/reports/reconciliation.ts";

type DrillDownItem = NonNullable<ReconciliationCheck["drillDown"]>[number];

// ─── helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d?: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Check Row ────────────────────────────────────────────────────────────────

function CheckRow({
  check,
  onClick,
}: {
  check: ReconciliationCheck;
  onClick: () => void;
}) {
  const hasIssue = !check.reconciled && check.drillDown && check.drillDown.length > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors",
        check.reconciled
          ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20"
          : check.severity === "warn"
          ? "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20"
          : "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20",
        hasIssue ? "cursor-pointer hover:border-primary/50" : "cursor-default"
      )}
      onClick={hasIssue ? onClick : undefined}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {check.reconciled ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
        ) : check.severity === "warn" ? (
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{check.label}</p>
        {!check.isCount && (
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {check.leftLabel}: {fmt(check.leftValue)} &nbsp;·&nbsp; {check.rightLabel}: {fmt(check.rightValue)}
          </p>
        )}
        {check.isCount && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {check.count} found
            {check.value != null && check.value > 0 ? ` · Value: ${fmt(check.value)}` : ""}
          </p>
        )}
      </div>

      {/* Difference badge */}
      {!check.reconciled && !check.isCount && (
        <Badge
          variant="secondary"
          className={cn(
            "text-xs tabular-nums whitespace-nowrap",
            check.severity === "warn"
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
              : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"
          )}
        >
          {check.difference > 0 ? "+" : ""}{fmt(check.difference)}
        </Badge>
      )}
      {!check.reconciled && check.isCount && (
        <Badge
          variant="secondary"
          className={cn(
            "text-xs tabular-nums whitespace-nowrap",
            check.severity === "warn"
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
              : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"
          )}
        >
          {check.count}
        </Badge>
      )}
      {check.reconciled && (
        <Badge variant="secondary" className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
          ✓ OK
        </Badge>
      )}

      {/* Drill-down chevron */}
      {hasIssue && (
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );
}

// ─── DrillDown Drawer ─────────────────────────────────────────────────────────

function DrillDownDrawer({
  check,
  open,
  onClose,
}: {
  check: ReconciliationCheck | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!check) return null;
  const items = check.drillDown ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-[480px] max-w-full overflow-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <XCircle className="w-4 h-4 text-red-500" />
            {check.label}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {check.isCount
              ? `${check.count} item(s) contributing to this issue`
              : `Difference: ${fmt(check.difference)} (${check.leftLabel}: ${fmt(check.leftValue)} vs ${check.rightLabel}: ${fmt(check.rightValue)})`
            }
          </p>
        </SheetHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No details available.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item: DrillDownItem) => (
              <div key={item.id} className="flex items-start justify-between rounded-lg border px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{item.label}</p>
                  <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                    {item.date && <span>{fmtDate(item.date)}</span>}
                    {item.type && <span className="capitalize">{item.type}</span>}
                  </div>
                </div>
                <span className="ml-3 font-semibold tabular-nums text-sm flex-shrink-0">
                  {fmt(item.amount)}
                </span>
              </div>
            ))}
            {items.length >= 20 && (
              <p className="text-xs text-muted-foreground text-center pt-2">Showing first 20 items</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const CORE_IDS = ["total_balance", "ar_reconciliation", "ap_reconciliation", "inventory_reconciliation", "pl_vs_bs"];
const HEALTH_IDS = ["unbalanced_entries", "lines_missing_fields", "old_drafts", "orphans"];

function ReconciliationPanelInner() {
  const [selectedCheck, setSelectedCheck] = useState<ReconciliationCheck | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const result = useQuery(api.reports.reconciliation.getReconciliationPanel, {
    asOfDate: today(),
  });

  if (result === undefined) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const coreChecks = result.checks.filter((c) => CORE_IDS.includes(c.id));
  const healthChecks = result.checks.filter((c) => HEALTH_IDS.includes(c.id));

  const openDrawer = (check: ReconciliationCheck) => {
    setSelectedCheck(check);
    setDrawerOpen(true);
  };

  return (
    <>
      <Card className={cn(
        "border-2",
        result.allCoreReconciled
          ? "border-green-300 dark:border-green-800"
          : "border-red-300 dark:border-red-800"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {result.allCoreReconciled ? (
                <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              Reconciliation Panel
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">As of {fmtDate(result.asOfDate)}</span>
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          {result.allCoreReconciled ? (
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
              All core checks passed — books are in balance
            </p>
          ) : (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">
              One or more checks failed — click a red row to see details
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Core checks */}
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Core Reconciliation</p>
            <div className="grid grid-cols-1 gap-2">
              {coreChecks.map((check) => (
                <CheckRow key={check.id} check={check} onClick={() => openDrawer(check)} />
              ))}
            </div>
          </div>

          {/* Health checks */}
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Data Health</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {healthChecks.map((check) => (
                <CheckRow key={check.id} check={check} onClick={() => openDrawer(check)} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <DrillDownDrawer
        check={selectedCheck}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}

export function ReconciliationPanel() {
  return (
    <>
      <AuthLoading>
        <Skeleton className="h-60 w-full" />
      </AuthLoading>
      <Authenticated>
        <ReconciliationPanelInner />
      </Authenticated>
    </>
  );
}
