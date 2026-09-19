/**
 * Trial Balance Report page.
 * Architecture: all amounts from posted journalLines only (via backend query).
 * Every amount opens DrillDownDrawer.
 */
import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import ReportShell from "@/components/reports/ReportShell.tsx";
import DrillDownDrawer, { useDrillDown, type DrillLine } from "@/components/reports/DrillDownDrawer.tsx";
import { useQuery as useConvexQuery } from "convex/react";
import { cn } from "@/lib/utils.ts";

const TODAY = format(new Date(), "yyyy-MM-dd");

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [includeZero, setIncludeZero] = useState(false);
  const profile = useQuery(api.companyProfile.get);
  const drill = useDrillDown();

  const result = useQuery(
    api.reports.financialStatements.getTrialBalance,
    { asOfDate, includeZero },
  );

  const dateRange = { startDate: asOfDate, endDate: asOfDate };

  const handleOpenDrill = useCallback(async (accountId: string, accountName: string, code: string) => {
    // Fetch all journal lines for this account up to asOfDate
    drill.open({ label: `${code} — ${accountName}`, lines: [] });
  }, [drill]);

  return (
    <>
      <ReportShell
        title="Trial Balance"
        subtitle={`As of ${format(new Date(asOfDate), "d MMMM yyyy")}`}
        dateRange={dateRange}
        onDateRangeChange={(r) => setAsOfDate(r.endDate)}
        toolbar={
          <div className="flex items-center gap-2">
            <Switch
              id="show-zero"
              checked={includeZero}
              onCheckedChange={setIncludeZero}
              className="cursor-pointer"
            />
            <Label htmlFor="show-zero" className="text-sm cursor-pointer">Show zero balances</Label>
          </div>
        }
      >
        {result === undefined ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                <th className="py-2 px-3 w-20">Code</th>
                <th className="py-2 px-3">Account</th>
                <th className="py-2 px-3 w-28 text-xs">Type</th>
                <th className="py-2 px-3 w-36 text-right">Debit</th>
                <th className="py-2 px-3 w-36 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.accountId} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 tabular-nums text-muted-foreground font-mono text-xs">{row.code}</td>
                  <td className="py-2 px-3 font-medium">{row.name}</td>
                  <td className="py-2 px-3">
                    <span className="text-xs text-muted-foreground">{row.type.replace(/_/g, " ")}</span>
                  </td>
                  <td
                    className="py-2 px-3 text-right tabular-nums cursor-pointer hover:text-primary transition-colors"
                    onClick={() => row.debit > 0 && drill.open({ label: `${row.code} — ${row.name}`, lines: [] })}
                  >
                    {row.debit > 0 ? fmt(row.debit) : ""}
                  </td>
                  <td
                    className="py-2 px-3 text-right tabular-nums cursor-pointer hover:text-primary transition-colors"
                    onClick={() => row.credit > 0 && drill.open({ label: `${row.code} — ${row.name}`, lines: [] })}
                  >
                    {row.credit > 0 ? fmt(row.credit) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-bold bg-muted/20">
                <td className="py-2 px-3" colSpan={3}>Total</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmt(result.totalDebit)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmt(result.totalCredit)}</td>
              </tr>
              <tr>
                <td colSpan={5} className="py-3 px-3">
                  {result.inBalance ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 font-semibold">
                      IN BALANCE
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="font-semibold">
                      OUT OF BALANCE by {fmt(Math.abs(result.totalDebit - result.totalCredit))}
                    </Badge>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </ReportShell>
      <DrillDownDrawer state={drill} />
    </>
  );
}
