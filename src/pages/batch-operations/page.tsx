import { Layers, FileText, CreditCard, Landmark, RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import BatchInvoicesTab from "./_components/batch-invoices-tab.tsx";
import BatchPaymentsTab from "./_components/batch-payments-tab.tsx";
import BatchDepositsTab from "./_components/batch-deposits-tab.tsx";
import BatchStatusTab from "./_components/batch-status-tab.tsx";

export default function BatchOperationsPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="w-6 h-6" />
          Batch Operations
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Process multiple transactions at once — create invoices, record payments, make deposits, and update statuses in bulk
        </p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoices" className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" />Batch Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="cursor-pointer">
            <CreditCard className="w-4 h-4 mr-2" />Batch Payments
          </TabsTrigger>
          <TabsTrigger value="deposits" className="cursor-pointer">
            <Landmark className="w-4 h-4 mr-2" />Batch Deposits
          </TabsTrigger>
          <TabsTrigger value="status" className="cursor-pointer">
            <RefreshCw className="w-4 h-4 mr-2" />Batch Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <BatchInvoicesTab />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <BatchPaymentsTab />
        </TabsContent>
        <TabsContent value="deposits" className="mt-4">
          <BatchDepositsTab />
        </TabsContent>
        <TabsContent value="status" className="mt-4">
          <BatchStatusTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
