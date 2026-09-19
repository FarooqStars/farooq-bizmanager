import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import {
  BarChart3, TrendingUp, DollarSign, Package,
  Wallet, Users, Truck, ArrowLeftRight, ShoppingBag, Briefcase,
} from "lucide-react";
import RevenueTab from "./_components/report-revenue-tab.tsx";
import PerItemTab from "./_components/report-per-item-tab.tsx";
import ExpenseTab from "./_components/report-expense-tab.tsx";
import InventoryTab from "./_components/report-inventory-tab.tsx";
import SalesAnalyticsTab from "./_components/report-sales-analytics-tab.tsx";
import PayrollTab from "./_components/report-payroll-tab.tsx";
import PurchasingTab from "./_components/report-purchasing-tab.tsx";
import JobCostTab from "./_components/report-job-cost-tab.tsx";
import ReceivablesPayablesTab from "./receivables-payables/page.tsx";

const VALID_TABS = [
  "financial",
  "sales",
  "peritem",
  "expenses",
  "inventory",
  "purchasing",
  "payroll",
  "jobcost",
  "receivables-payables",
];

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");

  const initialTab = requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : "financial";
  const [tab, setTab] = useState(initialTab);

  const handleTabChange = (value: string) => {
    setTab(value);
    setSearchParams((prev) => {
      prev.set("tab", value);
      return prev;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6" /> Advanced Reports & Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Comprehensive financial insights, performance metrics, and business intelligence
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="financial" className="flex items-center gap-1.5 text-xs">
            <DollarSign className="w-3.5 h-3.5" /> Financial
          </TabsTrigger>
          <TabsTrigger value="sales" className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5" /> Sales
          </TabsTrigger>
          <TabsTrigger value="peritem" className="flex items-center gap-1.5 text-xs">
            <ShoppingBag className="w-3.5 h-3.5" /> Per Item
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-1.5 text-xs">
            <Wallet className="w-3.5 h-3.5" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-1.5 text-xs">
            <Package className="w-3.5 h-3.5" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="purchasing" className="flex items-center gap-1.5 text-xs">
            <Truck className="w-3.5 h-3.5" /> Purchasing
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex items-center gap-1.5 text-xs">
            <Users className="w-3.5 h-3.5" /> Payroll
          </TabsTrigger>
          <TabsTrigger value="jobcost" className="flex items-center gap-1.5 text-xs">
            <Briefcase className="w-3.5 h-3.5" /> Job Cost
          </TabsTrigger>
          <TabsTrigger value="receivables-payables" className="flex items-center gap-1.5 text-xs">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Receivables &amp; Payables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financial" className="mt-4"><RevenueTab /></TabsContent>
        <TabsContent value="sales" className="mt-4"><SalesAnalyticsTab /></TabsContent>
        <TabsContent value="peritem" className="mt-4"><PerItemTab /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpenseTab /></TabsContent>
        <TabsContent value="inventory" className="mt-4"><InventoryTab /></TabsContent>
        <TabsContent value="purchasing" className="mt-4"><PurchasingTab /></TabsContent>
        <TabsContent value="payroll" className="mt-4"><PayrollTab /></TabsContent>
        <TabsContent value="jobcost" className="mt-4"><JobCostTab /></TabsContent>
        <TabsContent value="receivables-payables" className="mt-4"><ReceivablesPayablesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
