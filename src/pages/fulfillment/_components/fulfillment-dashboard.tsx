import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, Package, CheckCircle2, Truck, BoxesIcon, AlertTriangle, TrendingUp
} from "lucide-react";

export default function FulfillmentDashboard() {
  const summary = useQuery(api.fulfillment.getSummary, {});

  if (!summary) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: "Pending", value: summary.pending, icon: Clock, color: "text-amber-500" },
    { label: "Picking", value: summary.picking, icon: Package, color: "text-blue-500" },
    { label: "Picked", value: summary.picked, icon: CheckCircle2, color: "text-indigo-500" },
    { label: "Packing", value: summary.packing, icon: BoxesIcon, color: "text-purple-500" },
    { label: "Packed", value: summary.packed, icon: BoxesIcon, color: "text-violet-500" },
    { label: "Shipped", value: summary.shipped, icon: Truck, color: "text-emerald-500" },
    { label: "Delivered", value: summary.delivered, icon: CheckCircle2, color: "text-green-600" },
    { label: "Total", value: summary.total, icon: TrendingUp, color: "text-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground truncate">{c.label}</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1 break-words leading-tight">{c.value}</p>
                </div>
                <c.icon className={`w-8 h-8 flex-shrink-0 ${c.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow pipeline visual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fulfillment Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {[
              { label: "Pending", count: summary.pending, bg: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
              { label: "Picking", count: summary.picking, bg: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
              { label: "Picked", count: summary.picked, bg: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" },
              { label: "Packing", count: summary.packing, bg: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
              { label: "Packed", count: summary.packed, bg: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" },
              { label: "Shipped", count: summary.shipped, bg: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
              { label: "Delivered", count: summary.delivered, bg: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" },
            ].map((stage, i, arr) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className={`px-4 py-3 rounded-lg ${stage.bg} min-w-[100px] text-center`}>
                  <p className="text-xs font-medium">{stage.label}</p>
                  <p className="text-xl font-bold">{stage.count}</p>
                </div>
                {i < arr.length - 1 && (
                  <span className="text-muted-foreground text-lg">&rarr;</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
