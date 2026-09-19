import { FileText, FileCheck, CreditCard, BarChart3, RefreshCw, CalendarClock, ScrollText, Truck, ClipboardList, DollarSign, Percent } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { useTranslation } from "react-i18next";
import InvoicesTab from "./_components/invoices-tab.tsx";
import QuotationsTab from "./_components/quotations-tab.tsx";
import PaymentsTab from "./_components/payments-tab.tsx";
import CollectionsTab from "./_components/collections-tab.tsx";
import RecurringInvoicesTab from "./_components/recurring-invoices-tab.tsx";
import RecurringBillsTab from "./_components/recurring-bills-tab.tsx";
import UpcomingSchedulesTab from "./_components/upcoming-schedules-tab.tsx";
import StatementsTab from "./_components/statements-tab.tsx";
import DeliveryNotesTab from "./_components/delivery-notes-tab.tsx";
import SalesOrdersTab from "./_components/sales-orders-tab.tsx";
import StatementChargesTab from "./_components/statement-charges-tab.tsx";
import FinanceChargesTab from "./_components/finance-charges-tab.tsx";

export default function InvoicingPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          {t("nav.invoicing")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("recurring.page_subtitle")}
        </p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoices" className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" />{t("recurring.tab_invoices")}
          </TabsTrigger>
          <TabsTrigger value="quotations" className="cursor-pointer">
            <FileCheck className="w-4 h-4 mr-2" />{t("recurring.tab_quotations")}
          </TabsTrigger>
          <TabsTrigger value="sales-orders" className="cursor-pointer">
            <ClipboardList className="w-4 h-4 mr-2" />Sales Orders
          </TabsTrigger>
          <TabsTrigger value="payments" className="cursor-pointer">
            <CreditCard className="w-4 h-4 mr-2" />{t("recurring.tab_payments")}
          </TabsTrigger>
          <TabsTrigger value="collections" className="cursor-pointer">
            <BarChart3 className="w-4 h-4 mr-2" />{t("recurring.tab_collections")}
          </TabsTrigger>
          <TabsTrigger value="recurring-invoices" className="cursor-pointer">
            <RefreshCw className="w-4 h-4 mr-2" />{t("recurring.tab_recurring_invoices")}
          </TabsTrigger>
          <TabsTrigger value="recurring-bills" className="cursor-pointer">
            <RefreshCw className="w-4 h-4 mr-2" />{t("recurring.tab_recurring_bills")}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="cursor-pointer">
            <CalendarClock className="w-4 h-4 mr-2" />{t("recurring.tab_upcoming")}
          </TabsTrigger>
          <TabsTrigger value="statements" className="cursor-pointer">
            <ScrollText className="w-4 h-4 mr-2" />{t("statement.tab")}
          </TabsTrigger>
          <TabsTrigger value="delivery-notes" className="cursor-pointer">
            <Truck className="w-4 h-4 mr-2" />{t("delivery.tab")}
          </TabsTrigger>
          <TabsTrigger value="statement-charges" className="cursor-pointer">
            <DollarSign className="w-4 h-4 mr-2" />{t("statementCharges.tab")}
          </TabsTrigger>
          <TabsTrigger value="finance-charges" className="cursor-pointer">
            <Percent className="w-4 h-4 mr-2" />{t("financeCharges.tab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="quotations" className="mt-4">
          <QuotationsTab />
        </TabsContent>
        <TabsContent value="sales-orders" className="mt-4">
          <SalesOrdersTab />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="collections" className="mt-4">
          <CollectionsTab />
        </TabsContent>
        <TabsContent value="recurring-invoices" className="mt-4">
          <RecurringInvoicesTab />
        </TabsContent>
        <TabsContent value="recurring-bills" className="mt-4">
          <RecurringBillsTab />
        </TabsContent>
        <TabsContent value="upcoming" className="mt-4">
          <UpcomingSchedulesTab />
        </TabsContent>
        <TabsContent value="statements" className="mt-4">
          <StatementsTab />
        </TabsContent>
        <TabsContent value="delivery-notes" className="mt-4">
          <DeliveryNotesTab />
        </TabsContent>
        <TabsContent value="statement-charges" className="mt-4">
          <StatementChargesTab />
        </TabsContent>
        <TabsContent value="finance-charges" className="mt-4">
          <FinanceChargesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
