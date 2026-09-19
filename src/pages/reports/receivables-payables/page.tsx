/**
 * Receivables & Payables Reports hub — Reports 10–18.
 * Sub-tabs for each report, reflected in URL search param `sub`.
 *
 * URL shape: /reports?tab=receivables-payables&sub=<value>
 * Deep-linkable from the Reports Hub cards.
 */
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import ARAgingDetail from "./_components/ARAgingDetail.tsx";
import CustomerBalanceSummary from "./_components/CustomerBalanceSummary.tsx";
import OpenInvoices from "./_components/OpenInvoices.tsx";
import OverdueCollections from "./_components/OverdueCollections.tsx";
import SalesByCustomer from "./_components/SalesByCustomer.tsx";
import APAgingDetail from "./_components/APAgingDetail.tsx";
import VendorBalanceSummary from "./_components/VendorBalanceSummary.tsx";
import UnpaidBills from "./_components/UnpaidBills.tsx";
import PurchasesByVendor from "./_components/PurchasesByVendor.tsx";

const SUB_TAB_VALUES = [
  "ar-detail",
  "customer-balance",
  "open-invoices",
  "overdue",
  "sales-by-customer",
  "ap-detail",
  "vendor-balance",
  "unpaid-bills",
  "purchases-by-vendor",
] as const;

type SubTabValue = (typeof SUB_TAB_VALUES)[number];

const DEFAULT_SUB: SubTabValue = "ar-detail";

const SUB_TABS: Array<{ value: SubTabValue; label: string }> = [
  { value: "ar-detail",           label: "AR Detail" },
  { value: "customer-balance",    label: "Customer Balances" },
  { value: "open-invoices",       label: "Open Invoices" },
  { value: "overdue",             label: "Collections" },
  { value: "sales-by-customer",   label: "Sales by Customer" },
  { value: "ap-detail",           label: "AP Detail" },
  { value: "vendor-balance",      label: "Vendor Balances" },
  { value: "unpaid-bills",        label: "Unpaid Bills" },
  { value: "purchases-by-vendor", label: "Purchases by Vendor" },
];

function isValidSub(value: string | null): value is SubTabValue {
  return SUB_TAB_VALUES.includes(value as SubTabValue);
}

export default function ReceivablesPayablesTab() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSub = searchParams.get("sub");
  const sub: SubTabValue = isValidSub(rawSub) ? rawSub : DEFAULT_SUB;

  const handleSubChange = (value: string) => {
    setSearchParams((prev) => {
      prev.set("sub", value);
      return prev;
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={sub} onValueChange={handleSubChange}>
        <TabsList className="flex-wrap h-auto gap-1">
          {SUB_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ar-detail"           className="mt-4"><ARAgingDetail /></TabsContent>
        <TabsContent value="customer-balance"    className="mt-4"><CustomerBalanceSummary /></TabsContent>
        <TabsContent value="open-invoices"       className="mt-4"><OpenInvoices /></TabsContent>
        <TabsContent value="overdue"             className="mt-4"><OverdueCollections /></TabsContent>
        <TabsContent value="sales-by-customer"   className="mt-4"><SalesByCustomer /></TabsContent>
        <TabsContent value="ap-detail"           className="mt-4"><APAgingDetail /></TabsContent>
        <TabsContent value="vendor-balance"      className="mt-4"><VendorBalanceSummary /></TabsContent>
        <TabsContent value="unpaid-bills"        className="mt-4"><UnpaidBills /></TabsContent>
        <TabsContent value="purchases-by-vendor" className="mt-4"><PurchasesByVendor /></TabsContent>
      </Tabs>
    </div>
  );
}
