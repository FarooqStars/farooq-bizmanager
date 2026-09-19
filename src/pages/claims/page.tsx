import { ClipboardCheck, FileUp, CheckCircle, Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { useTranslation } from "react-i18next";
import MyClaimsTab from "./_components/my-claims-tab.tsx";
import PendingApprovalsTab from "./_components/pending-approvals-tab.tsx";
import AllClaimsTab from "./_components/all-claims-tab.tsx";
import ClaimStatsCards from "./_components/claim-stats-cards.tsx";

export default function ClaimsPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6" />
          {t("claims.title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("claims.subtitle")}
        </p>
      </div>

      <ClaimStatsCards />

      <Tabs defaultValue="my-claims">
        <TabsList className="flex-wrap">
          <TabsTrigger value="my-claims" className="cursor-pointer">
            <FileUp className="w-4 h-4 mr-2" />{t("claims.tab_my_claims")}
          </TabsTrigger>
          <TabsTrigger value="pending" className="cursor-pointer">
            <Clock className="w-4 h-4 mr-2" />{t("claims.tab_pending")}
          </TabsTrigger>
          <TabsTrigger value="all" className="cursor-pointer">
            <CheckCircle className="w-4 h-4 mr-2" />{t("claims.tab_all")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-claims" className="mt-4">
          <MyClaimsTab />
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          <PendingApprovalsTab />
        </TabsContent>
        <TabsContent value="all" className="mt-4">
          <AllClaimsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
