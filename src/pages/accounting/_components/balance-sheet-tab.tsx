import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Building2, Printer } from "lucide-react";
import { generateBalanceSheetHtml } from "@/lib/print-templates/balance-sheet-template.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";

export default function BalanceSheetTab() {
  const [asOfDate, setAsOfDate] = useState("");
  const { fmt } = useCurrency();
  const profile = useQuery(api.companyProfile.get);
  const data = useQuery(
    api.accounting.getBalanceSheet,
    asOfDate ? { asOfDate } : {}
  );

  if (!data) {
    return <Skeleton className="h-60 w-full" />;
  }

  const handlePrint = () => {
    const html = generateBalanceSheetHtml(
      {
        asOfDate: data.asOfDate ?? new Date().toISOString().slice(0, 10),
        assets: data.assets.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
        liabilities: data.liabilities.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
        equity: data.equity.map((a) => ({ code: a.code, name: a.name, balance: a.balance })),
        totalAssets: data.totalAssets,
        totalLiabilities: data.totalLiabilities,
        totalEquity: data.totalEquity,
        totalLiabilitiesAndEquity: data.totalLiabilitiesAndEquity,
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

  const AccountSection = ({ title, accounts, total, color }: {
    title: string;
    accounts: Array<{ _id: string; code: string; name: string; balance: number }>;
    total: number;
    color: string;
  }) => (
    <div className="space-y-2">
      <h3 className={`text-sm font-bold uppercase tracking-wide ${color}`}>{title}</h3>
      {accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-4">No balances</p>
      ) : (
        <div className="space-y-1">
          {accounts.map((acc) => (
            <div key={acc._id} className="flex items-center justify-between px-4 py-1.5 rounded hover:bg-muted/50">
              <span className="text-sm">
                <span className="font-mono text-xs text-muted-foreground mr-2">{acc.code}</span>
                {acc.name}
              </span>
              <span className="font-mono text-sm font-medium">
                {fmt(acc.balance)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 border-t font-bold">
        <span className="text-sm">Total {title}</span>
        <span className="font-mono text-sm">{fmt(total)}</span>
      </div>
    </div>
  );

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
            <Building2 className="w-4 h-4" />
            Balance Sheet
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            As of {data.asOfDate ?? "today"} — Assets = Liabilities + Equity
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <AccountSection
            title="Assets"
            accounts={data.assets}
            total={data.totalAssets}
            color="text-blue-600 dark:text-blue-400"
          />
          <AccountSection
            title="Liabilities"
            accounts={data.liabilities}
            total={data.totalLiabilities}
            color="text-red-600 dark:text-red-400"
          />
          <AccountSection
            title="Equity"
            accounts={data.equity}
            total={data.totalEquity}
            color="text-purple-600 dark:text-purple-400"
          />

          {/* Equation check */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 rounded-lg">
              <span className="text-sm font-bold">Total Liabilities + Equity</span>
              <span className="font-mono text-sm font-bold">{fmt(data.totalLiabilitiesAndEquity)}</span>
            </div>
            <div className="text-center">
              {Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01 ? (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Equation balanced: Assets ({fmt(data.totalAssets)}) = L+E ({fmt(data.totalLiabilitiesAndEquity)})
                </span>
              ) : (
                <span className="text-xs text-destructive font-medium">
                  Equation NOT balanced — difference of {fmt(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
