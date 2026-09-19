import { Landmark, Coins, ArrowLeftRight, Building, CheckCircle2, FileCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import CurrenciesTab from "./_components/currencies-tab.tsx";
import ExchangeRatesTab from "./_components/exchange-rates-tab.tsx";
import BankAccountsTab from "./_components/bank-accounts-tab.tsx";
import ReconciliationTab from "./_components/reconciliation-tab.tsx";
import BankOperationsTab from "./_components/bank-operations-tab.tsx";

export default function BankingPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6" />
          Multi-Currency & Banking
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage currencies, exchange rates, bank accounts, and banking operations
        </p>
      </div>

      <Tabs defaultValue="operations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="operations" className="cursor-pointer">
            <FileCheck className="w-4 h-4 mr-2" />Operations
          </TabsTrigger>
          <TabsTrigger value="accounts" className="cursor-pointer">
            <Building className="w-4 h-4 mr-2" />Bank Accounts
          </TabsTrigger>
          <TabsTrigger value="currencies" className="cursor-pointer">
            <Coins className="w-4 h-4 mr-2" />Currencies
          </TabsTrigger>
          <TabsTrigger value="rates" className="cursor-pointer">
            <ArrowLeftRight className="w-4 h-4 mr-2" />Exchange Rates
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="cursor-pointer">
            <CheckCircle2 className="w-4 h-4 mr-2" />Reconciliation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-4">
          <BankOperationsTab />
        </TabsContent>
        <TabsContent value="accounts" className="mt-4">
          <BankAccountsTab />
        </TabsContent>
        <TabsContent value="currencies" className="mt-4">
          <CurrenciesTab />
        </TabsContent>
        <TabsContent value="rates" className="mt-4">
          <ExchangeRatesTab />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
