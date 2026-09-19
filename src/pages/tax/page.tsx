import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Authenticated } from "convex/react";
import TaxSettingsTab from "./_components/tax-settings-tab.tsx";
import TaxRatesTab from "./_components/tax-rates-tab.tsx";
import TaxReportsTab from "./_components/tax-reports-tab.tsx";

export default function TaxPage() {
  const { t } = useTranslation();

  return (
    <Authenticated>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">{t("tax.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("tax.subtitle")}</p>
        </div>

        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings">{t("tax.tab_settings")}</TabsTrigger>
            <TabsTrigger value="rates">{t("tax.tab_rates")}</TabsTrigger>
            <TabsTrigger value="reports">{t("tax.tab_reports")}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <TaxSettingsTab />
          </TabsContent>
          <TabsContent value="rates">
            <TaxRatesTab />
          </TabsContent>
          <TabsContent value="reports">
            <TaxReportsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Authenticated>
  );
}
