import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Authenticated } from "convex/react";
import BudgetListTab from "./_components/budget-list-tab.tsx";
import BudgetVsActualTab from "./_components/budget-vs-actual-tab.tsx";
import CashFlowTab from "./_components/cash-flow-tab.tsx";

export default function BudgetPage() {
  const { t } = useTranslation();

  return (
    <Authenticated>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">{t("budget.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("budget.subtitle")}</p>
        </div>

        <Tabs defaultValue="budgets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="budgets">{t("budget.tab_budgets")}</TabsTrigger>
            <TabsTrigger value="comparison">{t("budget.tab_comparison")}</TabsTrigger>
            <TabsTrigger value="cashflow">{t("budget.tab_cashflow")}</TabsTrigger>
          </TabsList>

          <TabsContent value="budgets">
            <BudgetListTab />
          </TabsContent>
          <TabsContent value="comparison">
            <BudgetVsActualTab />
          </TabsContent>
          <TabsContent value="cashflow">
            <CashFlowTab />
          </TabsContent>
        </Tabs>
      </div>
    </Authenticated>
  );
}
