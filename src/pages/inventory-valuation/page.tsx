import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Calculator, FolderTree, BarChart3 } from "lucide-react";
import ValuationReportTab from "./_components/valuation-report-tab.tsx";
import ClassesTab from "./_components/classes-tab.tsx";
import ClassProfitTab from "./_components/class-profit-tab.tsx";

export default function InventoryValuationPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="w-6 h-6" /> Inventory Valuation & Classes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track inventory value using FIFO, LIFO, or Weighted Average methods. Organize products by class/department.
        </p>
      </div>

      <Tabs defaultValue="valuation">
        <TabsList>
          <TabsTrigger value="valuation" className="cursor-pointer">
            <Calculator className="w-4 h-4 mr-2" /> Valuation Report
          </TabsTrigger>
          <TabsTrigger value="classes" className="cursor-pointer">
            <FolderTree className="w-4 h-4 mr-2" /> Classes
          </TabsTrigger>
          <TabsTrigger value="profit" className="cursor-pointer">
            <BarChart3 className="w-4 h-4 mr-2" /> Class P&L
          </TabsTrigger>
        </TabsList>

        <TabsContent value="valuation" className="mt-4">
          <ValuationReportTab />
        </TabsContent>
        <TabsContent value="classes" className="mt-4">
          <ClassesTab />
        </TabsContent>
        <TabsContent value="profit" className="mt-4">
          <ClassProfitTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
