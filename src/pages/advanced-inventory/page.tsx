import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, ClipboardList, MapPin, Tag, ClipboardCheck } from "lucide-react";
import AssemblyTab from "./_components/assembly-tab.tsx";
import WorkOrdersTab from "./_components/work-orders-tab.tsx";
import BinLocationsTab from "./_components/bin-locations-tab.tsx";
import LotTrackingTab from "./_components/lot-tracking-tab.tsx";
import CycleCountsTab from "./_components/cycle-counts-tab.tsx";

export default function AdvancedInventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="w-6 h-6" />
          Advanced Inventory & Assembly
        </h1>
        <p className="text-muted-foreground">Assembly/BOM management, bin locations, lot tracking, and cycle counting</p>
      </div>

      <Tabs defaultValue="assembly" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="assembly" className="cursor-pointer gap-1.5">
            <Layers className="w-4 h-4" /> Assembly / BOM
          </TabsTrigger>
          <TabsTrigger value="work-orders" className="cursor-pointer gap-1.5">
            <ClipboardList className="w-4 h-4" /> Work Orders
          </TabsTrigger>
          <TabsTrigger value="bins" className="cursor-pointer gap-1.5">
            <MapPin className="w-4 h-4" /> Bin Locations
          </TabsTrigger>
          <TabsTrigger value="lots" className="cursor-pointer gap-1.5">
            <Tag className="w-4 h-4" /> Lot / Serial
          </TabsTrigger>
          <TabsTrigger value="cycle-counts" className="cursor-pointer gap-1.5">
            <ClipboardCheck className="w-4 h-4" /> Cycle Counts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assembly">
          <AssemblyTab />
        </TabsContent>
        <TabsContent value="work-orders">
          <WorkOrdersTab />
        </TabsContent>
        <TabsContent value="bins">
          <BinLocationsTab />
        </TabsContent>
        <TabsContent value="lots">
          <LotTrackingTab />
        </TabsContent>
        <TabsContent value="cycle-counts">
          <CycleCountsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
