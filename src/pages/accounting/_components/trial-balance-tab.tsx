import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Scale, Printer } from "lucide-react";
import { generateTrialBalanceHtml } from "@/lib/print-templates/trial-balance-template.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";

export default function TrialBalanceTab() {
  const [asOfDate, setAsOfDate] = useState("");
  const profile = useQuery(api.companyProfile.get);
  const trialBalance = useQuery(
    api.accounting.getTrialBalance,
    asOfDate ? { asOfDate } : {}
  );

  if (!trialBalance) {
    return <Skeleton className="h-60 w-full" />;
  }

  const totalDebit = trialBalance.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialBalance.reduce((s, r) => s + r.credit, 0);

  const handlePrint = () => {
    const html = generateTrialBalanceHtml(
      {
        asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
        rows: trialBalance.map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          debit: r.debit,
          credit: r.credit,
        })),
        totalDebit,
        totalCredit,
      },
      profile ? {
        nameEn: profile.nameEn,
        nameAr: profile.nameAr,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
        website: profile.website,
        crNumber: profile.crNumber,
        taxId: profile.taxId,
        invoiceFooterEn: profile.invoiceFooterEn,
        invoiceFooterAr: profile.invoiceFooterAr,
      } : undefined,
      null
    );
    openPrintWindow(html);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <Label className="text-xs">As of Date</Label>
          <Input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="mt-1 w-44"
            placeholder="Today"
          />
        </div>
        <Button size="sm" onClick={handlePrint} className="cursor-pointer">
          <Printer className="w-4 h-4 mr-1" /> Print
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="w-4 h-4" />
            Trial Balance
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {asOfDate ? `As of ${asOfDate}` : "Current balances"} — posted entries only
          </p>
        </CardHeader>
        <CardContent>
          {trialBalance.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No posted transactions yet. Post journal entries to see balances here.
            </p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Code</th>
                    <th className="text-left py-2 px-3 font-medium">Account Name</th>
                    <th className="text-left py-2 px-3 font-medium">Type</th>
                    <th className="text-right py-2 px-3 font-medium">Debit</th>
                    <th className="text-right py-2 px-3 font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="py-2 px-3 font-mono text-xs">{row.code}</td>
                      <td className="py-2 px-3">{row.name}</td>
                      <td className="py-2 px-3 capitalize text-xs text-muted-foreground">{row.type}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 border-t font-bold">
                  <tr>
                    <td colSpan={3} className="py-2 px-3">Totals</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {trialBalance.length > 0 && (
            <div className="mt-3 text-sm flex items-center gap-2">
              {Math.abs(totalDebit - totalCredit) < 0.01 ? (
                <span className="text-green-600 dark:text-green-400 font-medium">Balanced</span>
              ) : (
                <span className="text-destructive font-medium">
                  Out of balance by {Math.abs(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
