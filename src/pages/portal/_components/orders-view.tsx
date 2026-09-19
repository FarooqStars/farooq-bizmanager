import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Package, Eye, ChevronLeft, MapPin, Phone, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

const orderStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  processing: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  shipped: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function OrdersView({ email }: { email: string }) {
  const { t } = useTranslation();
  const orders = useQuery(api.customerPortal.getCustomerOrders, { email });
  const [selectedOrder, setSelectedOrder] = useState<Id<"orders"> | null>(null);

  if (orders === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <OrderDetail
        orderId={selectedOrder}
        email={email}
        onBack={() => setSelectedOrder(null)}
      />
    );
  }

  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Package /></EmptyMedia>
          <EmptyTitle>{t("portal.orders.empty")}</EmptyTitle>
          <EmptyDescription>{t("portal.orders.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Card key={order._id} className="cursor-pointer transition-colors hover:bg-muted/30" onClick={() => setSelectedOrder(order._id)}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Package className="size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.orderDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-semibold">QAR {order.totalAmount.toLocaleString()}</p>
              <Badge className={orderStatusColors[order.status] ?? ""}>
                {t(`portal.orders.status.${order.status}`)}
              </Badge>
              <Eye className="size-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrderDetail({
  orderId,
  email,
  onBack,
}: {
  orderId: Id<"orders">;
  email: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const detail = useQuery(api.customerPortal.getCustomerOrderDetail, { orderId, email });

  if (detail === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!detail) {
    return <p className="text-muted-foreground">{t("portal.orders.notFound")}</p>;
  }

  // Progress steps
  const stages = ["pending", "confirmed", "processing", "shipped", "delivered"];
  const currentIdx = stages.indexOf(detail.status);
  const isCancelled = detail.status === "cancelled";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5" onClick={onBack}>
        <ChevronLeft className="size-4" /> {t("portal.back")}
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("portal.orders.order")} {detail.orderNumber}</CardTitle>
            <Badge className={orderStatusColors[detail.status] ?? ""}>
              {t(`portal.orders.status.${detail.status}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Order progress */}
          {!isCancelled && (
            <div className="flex items-center justify-between">
              {stages.map((stage, idx) => (
                <div key={stage} className="flex flex-1 items-center">
                  <div className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                    idx <= currentIdx
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {idx + 1}
                  </div>
                  {idx < stages.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 ${
                      idx < currentIdx ? "bg-primary" : "bg-muted"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          )}
          {!isCancelled && (
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {stages.map((stage) => (
                <span key={stage} className="text-center">{t(`portal.orders.status.${stage}`)}</span>
              ))}
            </div>
          )}

          {/* Contact & shipping */}
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t("portal.orders.customer")}</p>
              <p className="text-sm font-medium">{detail.customerName}</p>
              {detail.customerEmail && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="size-3" /> {detail.customerEmail}
                </div>
              )}
              {detail.customerPhone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="size-3" /> {detail.customerPhone}
                </div>
              )}
            </div>
            {detail.shippingAddress && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t("portal.orders.shipping")}</p>
                <div className="flex items-start gap-1.5 text-sm">
                  <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  {detail.shippingAddress}
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("portal.orders.product")}</th>
                  <th className="px-4 py-2 text-center font-medium">{t("portal.invoices.qty")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("portal.invoices.unitPrice")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("portal.invoices.subtotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt="" className="size-8 rounded object-cover" />
                        )}
                        <span>{item.productName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">{item.quantity}</td>
                    <td className="px-4 py-2 text-right">{item.unitPrice.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium">{item.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right">{t("portal.invoices.total")}</td>
                  <td className="px-4 py-2 text-right">QAR {detail.totalAmount.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {detail.notes && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("portal.invoices.notes")}</p>
              <p className="mt-1 text-sm">{detail.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
