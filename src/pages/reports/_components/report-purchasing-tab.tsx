import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmt, CHART_COLORS } from "./report-utils.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";

export default function PurchasingTab() {
  const { symbol } = useCurrency();
  const purchasing = useQuery(api.advancedReports.purchaseAnalysis);

  if (!purchasing) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    draft: "Draft",
    approved: "Approved",
    sent: "Sent",
    received: "Received",
    cancelled: "Cancelled",
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Total POs</p>
            <p className="text-xl font-bold break-words leading-tight">{purchasing.totalPOs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Total Spend</p>
            <p className="text-xl font-bold text-primary break-words leading-tight">{fmt(purchasing.totalSpend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">Avg PO Value</p>
            <p className="text-xl font-bold break-words leading-tight">
              {purchasing.totalPOs > 0 ? fmt(purchasing.totalSpend / purchasing.totalPOs) : "$0.00"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground truncate">By Status</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(purchasing.byStatus).filter(([, count]) => count > 0).map(([status, count]) => (
                <Badge key={status} variant="secondary" className="text-xs">{statusLabels[status]}: {count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly PO Volume */}
      {purchasing.monthlyVolume.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Monthly Purchase Volume</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={purchasing.monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${symbol} ${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: unknown) => [fmt(Number(v)), "Amount"]} />
                <Bar dataKey="amount" fill="oklch(0.6 0.118 184.704)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Vendors */}
      {purchasing.topVendors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top Vendors by Spend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={purchasing.topVendors} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tickFormatter={(v: number) => `${symbol} ${v}`} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                <Tooltip formatter={(v: unknown) => [fmt(Number(v)), "Total Spend"]} />
                <Bar dataKey="totalAmount" radius={[0, 4, 4, 0]}>
                  {purchasing.topVendors.map((_, idx) => (
                    <Bar key={idx} dataKey="totalAmount" fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Vendor details table */}
      {purchasing.topVendors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Vendor Spend Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Vendor</th>
                    <th className="text-right p-2 font-medium">Orders</th>
                    <th className="text-right p-2 font-medium">Total Spend</th>
                    <th className="text-right p-2 font-medium">Avg Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchasing.topVendors.map((v, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-2 font-medium">{v.name}</td>
                      <td className="p-2 text-right">{v.orderCount}</td>
                      <td className="p-2 text-right font-bold">{fmt(v.totalAmount)}</td>
                      <td className="p-2 text-right">{fmt(v.orderCount > 0 ? v.totalAmount / v.orderCount : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
