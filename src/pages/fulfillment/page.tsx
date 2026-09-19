import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Package, ClipboardList, Truck, CheckCircle2, BoxesIcon } from "lucide-react";
import FulfillmentDashboard from "./_components/fulfillment-dashboard.tsx";
import FulfillmentList from "./_components/fulfillment-list.tsx";
import ReadyToFulfill from "./_components/ready-to-fulfill.tsx";

export default function FulfillmentPage() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BoxesIcon className="w-6 h-6" />
          Pick / Pack / Ship
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage order fulfillment from picking through shipment
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />Dashboard
          </TabsTrigger>
          <TabsTrigger value="ready" className="flex items-center gap-2">
            <Package className="w-4 h-4" />Ready to Fulfill
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <BoxesIcon className="w-4 h-4" />Active Orders
          </TabsTrigger>
          <TabsTrigger value="shipped" className="flex items-center gap-2">
            <Truck className="w-4 h-4" />Shipped
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <FulfillmentDashboard />
        </TabsContent>
        <TabsContent value="ready" className="mt-4">
          <ReadyToFulfill />
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          <FulfillmentList filter="active" />
        </TabsContent>
        <TabsContent value="shipped" className="mt-4">
          <FulfillmentList filter="shipped" />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <FulfillmentList filter="completed" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
