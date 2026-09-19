import { BookOpen, FileText, Scale, Building2, Calendar, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import ChartOfAccountsTab from "./_components/chart-of-accounts-tab.tsx";
import JournalEntriesTab from "./_components/journal-entries-tab.tsx";
import TrialBalanceTab from "./_components/trial-balance-tab.tsx";
import BalanceSheetTab from "./_components/balance-sheet-tab.tsx";
import FiscalPeriodsTab from "./_components/fiscal-periods-tab.tsx";
import IncomeStatementTab from "./_components/income-statement-tab.tsx";

export default function AccountingPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          General Ledger
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Chart of Accounts, Journal Entries, and Financial Statements
        </p>
      </div>

      <Tabs defaultValue="coa">
        <TabsList className="flex-wrap">
          <TabsTrigger value="coa" className="cursor-pointer">
            <BookOpen className="w-4 h-4 mr-2" />Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="journal" className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" />Journal Entries
          </TabsTrigger>
          <TabsTrigger value="trial" className="cursor-pointer">
            <Scale className="w-4 h-4 mr-2" />Trial Balance
          </TabsTrigger>
          <TabsTrigger value="balance" className="cursor-pointer">
            <Building2 className="w-4 h-4 mr-2" />Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="cursor-pointer">
            <Calendar className="w-4 h-4 mr-2" />Fiscal Periods
          </TabsTrigger>
          <TabsTrigger value="pnl" className="cursor-pointer">
            <TrendingUp className="w-4 h-4 mr-2" />Income Statement
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coa" className="mt-4">
          <ChartOfAccountsTab />
        </TabsContent>
        <TabsContent value="journal" className="mt-4">
          <JournalEntriesTab />
        </TabsContent>
        <TabsContent value="trial" className="mt-4">
          <TrialBalanceTab />
        </TabsContent>
        <TabsContent value="balance" className="mt-4">
          <BalanceSheetTab />
        </TabsContent>
        <TabsContent value="fiscal" className="mt-4">
          <FiscalPeriodsTab />
        </TabsContent>
        <TabsContent value="pnl" className="mt-4">
          <IncomeStatementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
