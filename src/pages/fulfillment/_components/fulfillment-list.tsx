import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  BoxesIcon, Eye
} from "lucide-react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import FulfillmentDetail from "./fulfillment-detail.tsx";

type FilterType = "active" | "shipped" | "completed";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  picking: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  picked: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
  packing: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  packed: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  shipped: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  delivered: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  cancelled: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  high: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
  urgent: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

export default function FulfillmentList({ filter }: { filter: FilterType }) {
  const allOrders = useQuery(api.fulfillment.list, {});
  const [selectedId, setSelectedId] = useState<Id<"fulfillmentOrders"> | null>(null);

  if (!allOrders) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const activeStatuses = ["pending", "picking", "picked", "packing", "packed"];
  const filtered = allOrders.filter((o) => {
    if (filter === "active") return activeStatuses.includes(o.status);
    if (filter === "shipped") return o.status === "shipped";
    if (filter === "completed") return o.status === "delivered";
    return true;
  });

  const emptyConfig = {
    active: { title: "No active fulfillment orders", desc: "Create one from Ready to Fulfill tab" },
    shipped: { title: "No shipped orders", desc: "Orders will appear here once shipped" },
    completed: { title: "No completed deliveries", desc: "Delivered orders will appear here" },
  };

  if (filtered.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><BoxesIcon /></EmptyMedia>
          <EmptyTitle>{emptyConfig[filter].title}</EmptyTitle>
          <EmptyDescription>{emptyConfig[filter].desc}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{filtered.length} order(s)</p>

      {filtered.map((order) => (
        <Card key={order._id} className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setSelectedId(order._id)}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{order.fulfillmentNumber}</p>
                  <Badge className={statusColors[order.status]}>{order.status}</Badge>
                  <Badge className={priorityColors[order.priority]}>{order.priority}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  SO: {order.orderNumber} &bull; {order.customerName}
                </p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {order.warehouseName && <span>Warehouse: {order.warehouseName}</span>}
                  {order.assignedToName && <span>Assigned: {order.assignedToName}</span>}
                  {order.carrier && <span>Carrier: {order.carrier}</span>}
                  {order.trackingNumber && <span>Tracking: {order.trackingNumber}</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="cursor-pointer">
                <Eye className="w-4 h-4 mr-1" />View
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Detail dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedId && (
            <FulfillmentDetail id={selectedId} onClose={() => setSelectedId(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
