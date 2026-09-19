import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { FileText, Receipt, TicketMinus, TrendingDown, AlertTriangle, DollarSign } from "lucide-react";

export default function APSummaryTab() {
  const summary = useQuery(api.purchasing.getAPSummary, {});

  if (!summary) return <Skeleton className="h-60 w-full" />;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <FileText className="w-4 h-4" /> Open Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.openPOs}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Total value: ${summary.totalPOValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Receipt className="w-4 h-4" /> Unpaid Bills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{summary.unpaidBillCount}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Total owed: ${summary.unpaidBillTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <TicketMinus className="w-4 h-4" /> Active Vendor Credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{summary.activeCreditCount}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Credit balance: ${summary.activeCreditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Net Payable */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Accounts Payable Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <TrendingDown className="w-4 h-4" />
                <span className="text-sm font-medium">Total Payable</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                ${summary.unpaidBillTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <TicketMinus className="w-4 h-4" />
                <span className="text-sm font-medium">Vendor Credits</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                -${summary.activeCreditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Net Payable</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                ${(summary.unpaidBillTotal - summary.activeCreditTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
