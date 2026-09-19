import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Package, Truck, CheckCircle2, BoxesIcon, XCircle, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { format } from "date-fns";

type FulfillmentDetailProps = {
  id: Id<"fulfillmentOrders">;
  onClose: () => void;
};

export default function FulfillmentDetail({ id, onClose }: FulfillmentDetailProps) {
  const detail = useQuery(api.fulfillment.get, { id });
  const startPicking = useMutation(api.fulfillment.startPicking);
  const completePicking = useMutation(api.fulfillment.completePicking);
  const startPacking = useMutation(api.fulfillment.startPacking);
  const completePacking = useMutation(api.fulfillment.completePacking);
  const shipOrder = useMutation(api.fulfillment.shipOrder);
  const markDelivered = useMutation(api.fulfillment.markDelivered);
  const cancelOrder = useMutation(api.fulfillment.cancel);
  const updatePickedQty = useMutation(api.fulfillment.updatePickedQty);
  const updatePackedQty = useMutation(api.fulfillment.updatePackedQty);

  // Shipping form state
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [weight, setWeight] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [packageCount, setPackageCount] = useState("");

  if (!detail) {
    return <Skeleton className="h-64 w-full" />;
  }

  const handleAction = async (
    action: () => Promise<unknown>,
    successMsg: string
  ) => {
    try {
      await action();
      toast.success(successMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Action failed";
      toast.error(msg);
    }
  };

  const handleShip = async () => {
    if (!carrier) {
      toast.error("Please enter a carrier");
      return;
    }
    try {
      await shipOrder({
        id,
        carrier,
        trackingNumber: trackingNumber || undefined,
        shippingMethod: shippingMethod || undefined,
        estimatedDelivery: estimatedDelivery || undefined,
      });
      toast.success("Order shipped!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to ship";
      toast.error(msg);
    }
  };

  const handleCompletePacking = async () => {
    try {
      await completePacking({
        id,
        weight: weight ? parseFloat(weight) : undefined,
        dimensions: dimensions || undefined,
        packageCount: packageCount ? parseInt(packageCount) : undefined,
      });
      toast.success("Packing complete!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    }
  };

  const statusSteps = ["pending", "picking", "picked", "packing", "packed", "shipped", "delivered"];
  const currentStep = statusSteps.indexOf(detail.status);

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          {detail.fulfillmentNumber}
          <Badge className="capitalize">{detail.status}</Badge>
          <Badge variant="secondary" className="capitalize">{detail.priority}</Badge>
        </DialogTitle>
      </DialogHeader>

      {/* Progress stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {statusSteps.map((step, i) => (
          <div key={step} className="flex items-center gap-1">
            <div className={`px-2 py-1 rounded text-xs font-medium capitalize ${
              i < currentStep ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" :
              i === currentStep ? "bg-primary text-primary-foreground" :
              "bg-muted text-muted-foreground"
            }`}>
              {step}
            </div>
            {i < statusSteps.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Order info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Sales Order</p>
          <p className="font-medium">{detail.orderNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Customer</p>
          <p className="font-medium">{detail.customerName}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Shipping Address</p>
          <p className="font-medium">{detail.shippingAddress || "Not specified"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Warehouse</p>
          <p className="font-medium">{detail.warehouseName || "Not assigned"}</p>
        </div>
        {detail.pickedAt && (
          <div>
            <p className="text-muted-foreground">Picked</p>
            <p className="font-medium">{format(new Date(detail.pickedAt), "PPp")} by {detail.pickedByName}</p>
          </div>
        )}
        {detail.packedAt && (
          <div>
            <p className="text-muted-foreground">Packed</p>
            <p className="font-medium">{format(new Date(detail.packedAt), "PPp")} by {detail.packedByName}</p>
          </div>
        )}
        {detail.shippedAt && (
          <div>
            <p className="text-muted-foreground">Shipped</p>
            <p className="font-medium">{format(new Date(detail.shippedAt), "PPp")} by {detail.shippedByName}</p>
          </div>
        )}
        {detail.carrier && (
          <div>
            <p className="text-muted-foreground">Carrier</p>
            <p className="font-medium">{detail.carrier} {detail.trackingNumber && `(${detail.trackingNumber})`}</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Items table */}
      <div>
        <h3 className="font-semibold mb-3">Items</h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-center px-3 py-2">Ordered</th>
                <th className="text-center px-3 py-2">Picked</th>
                <th className="text-center px-3 py-2">Packed</th>
                <th className="text-center px-3 py-2">Shipped</th>
                {detail.status === "picking" && <th className="text-center px-3 py-2">Action</th>}
                {detail.status === "packing" && <th className="text-center px-3 py-2">Action</th>}
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item._id} className="border-t">
                  <td className="px-3 py-2">
                    <p className="font-medium">{item.description}</p>
                    {item.binLocation && <p className="text-xs text-muted-foreground">Bin: {item.binLocation}</p>}
                    {item.lotNumber && <p className="text-xs text-muted-foreground">Lot: {item.lotNumber}</p>}
                  </td>
                  <td className="text-center px-3 py-2">{item.orderedQty}</td>
                  <td className="text-center px-3 py-2">
                    <span className={item.pickedQty >= item.orderedQty ? "text-green-600 font-medium" : ""}>
                      {item.pickedQty}
                    </span>
                  </td>
                  <td className="text-center px-3 py-2">
                    <span className={item.packedQty >= item.pickedQty && item.pickedQty > 0 ? "text-green-600 font-medium" : ""}>
                      {item.packedQty}
                    </span>
                  </td>
                  <td className="text-center px-3 py-2">{item.shippedQty}</td>
                  {detail.status === "picking" && (
                    <td className="text-center px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={item.orderedQty}
                        defaultValue={item.pickedQty}
                        className="w-16 mx-auto text-center"
                        onBlur={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          if (val !== item.pickedQty) {
                            updatePickedQty({ itemId: item._id, pickedQty: val });
                          }
                        }}
                      />
                    </td>
                  )}
                  {detail.status === "packing" && (
                    <td className="text-center px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={item.pickedQty}
                        defaultValue={item.packedQty}
                        className="w-16 mx-auto text-center"
                        onBlur={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          if (val !== item.packedQty) {
                            updatePackedQty({ itemId: item._id, packedQty: val });
                          }
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Separator />

      {/* Shipping form (visible when status is packed) */}
      {detail.status === "packed" && (
        <div className="space-y-4">
          <h3 className="font-semibold">Shipping Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Carrier *</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="FedEx, DHL, Aramex..." />
            </div>
            <div className="space-y-1">
              <Label>Tracking Number</Label>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Shipping Method</Label>
              <Input value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)} placeholder="Express, Standard..." />
            </div>
            <div className="space-y-1">
              <Label>Estimated Delivery</Label>
              <Input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Packing form (visible when packing) */}
      {detail.status === "packing" && (
        <div className="space-y-4">
          <h3 className="font-semibold">Package Information</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Weight (kg)</Label>
              <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.0" />
            </div>
            <div className="space-y-1">
              <Label>Dimensions (LxWxH cm)</Label>
              <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="30x20x15" />
            </div>
            <div className="space-y-1">
              <Label>Packages</Label>
              <Input type="number" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} placeholder="1" />
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {detail.status === "pending" && (
          <Button onClick={() => handleAction(() => startPicking({ id }), "Picking started!")}
            className="cursor-pointer">
            <Package className="w-4 h-4 mr-1" />Start Picking
          </Button>
        )}
        {detail.status === "picking" && (
          <Button onClick={() => handleAction(() => completePicking({ id }), "Picking complete!")}
            className="cursor-pointer">
            <CheckCircle2 className="w-4 h-4 mr-1" />Complete Picking
          </Button>
        )}
        {detail.status === "picked" && (
          <Button onClick={() => handleAction(() => startPacking({ id }), "Packing started!")}
            className="cursor-pointer">
            <BoxesIcon className="w-4 h-4 mr-1" />Start Packing
          </Button>
        )}
        {detail.status === "packing" && (
          <Button onClick={handleCompletePacking} className="cursor-pointer">
            <CheckCircle2 className="w-4 h-4 mr-1" />Complete Packing
          </Button>
        )}
        {detail.status === "packed" && (
          <Button onClick={handleShip} className="cursor-pointer">
            <Truck className="w-4 h-4 mr-1" />Ship Order
          </Button>
        )}
        {detail.status === "shipped" && (
          <Button onClick={() => handleAction(() => markDelivered({ id }), "Marked as delivered!")}
            className="cursor-pointer bg-green-600 hover:bg-green-700">
            <CheckCircle2 className="w-4 h-4 mr-1" />Mark Delivered
          </Button>
        )}
        {!["shipped", "delivered", "cancelled"].includes(detail.status) && (
          <Button variant="destructive" onClick={() => handleAction(() => cancelOrder({ id }), "Order cancelled")}
            className="cursor-pointer">
            <XCircle className="w-4 h-4 mr-1" />Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
