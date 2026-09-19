import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  Package, ShoppingCart, Clock, CheckCircle2, Truck, XCircle, Mail, Phone, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";
import { useCurrency } from "@/hooks/use-currency.ts";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: CheckCircle2 },
  processing: { label: "Processing", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: Package },
  shipped: { label: "Shipped", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400", icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

// ── Order Detail Modal ───────────────────────────────────────────────────────

function OrderDetailModal({
  orderId,
  onClose,
}: {
  orderId: Id<"orders">;
  onClose: () => void;
}) {
  const order = useQuery(api.storefront.getOrderDetails, { orderId });
  const updateStatus = useMutation(api.storefront.updateOrderStatus);
  const { fmt } = useCurrency();
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    try {
      await updateStatus({
        orderId,
        status: newStatus as "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled",
      });
      toast.success(`Order status updated to ${statusConfig[newStatus]?.label ?? newStatus}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  if (!order) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <div className="space-y-4 py-8">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const config = statusConfig[order.status] ?? statusConfig.pending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Order {order.orderNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status + Date */}
          <div className="flex items-center justify-between">
            <Badge className={cn("px-3 py-1", config.color)}>{config.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(order.orderDate), "MMM d, yyyy h:mm a")}
            </span>
          </div>

          {/* Customer info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-3 h-3" />{order.customerEmail}
              </p>
              {order.customerPhone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-3 h-3" />{order.customerPhone}
                </p>
              )}
              {order.shippingAddress && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3 h-3" />{order.shippingAddress}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Order items */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.items.map((item) => (
                <div key={item._id} className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted rounded overflow-hidden flex-shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-4 h-4 opacity-30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} x {fmt(item.unitPrice)}</p>
                  </div>
                  <span className="text-sm font-semibold">{fmt(item.subtotal)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">{fmt(order.totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Status change */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Update Status</label>
            <Select
              value={order.status}
              onValueChange={handleStatusChange}
              disabled={updating}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Orders Page ─────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const orders = useQuery(api.storefront.listOrders, { status: statusFilter !== "all" ? statusFilter : undefined });
  const [selectedOrder, setSelectedOrder] = useState<Id<"orders"> | null>(null);
  const { fmt } = useCurrency();

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingCart className="w-6 h-6" />Orders
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Manage customer orders from the storefront</p>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="shipped">Shipped</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-4">
          {orders === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : orders.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
                <EmptyTitle>No orders yet</EmptyTitle>
                <EmptyDescription>
                  Orders from the storefront will appear here
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const config = statusConfig[order.status] ?? statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <Card
                    key={order._id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedOrder(order._id)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <StatusIcon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{order.orderNumber}</p>
                            <p className="text-xs text-muted-foreground">{order.customerName}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge className={cn("text-xs", config.color)}>{config.label}</Badge>
                          <div className="text-right">
                            <p className="font-bold text-sm">{fmt(order.totalAmount)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(order.orderDate), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedOrder && (
        <OrderDetailModal
          orderId={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
