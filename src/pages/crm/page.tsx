import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Users, TrendingUp, DollarSign, Target, Plus } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency.ts";
import PipelineView from "./_components/pipeline-view.tsx";
import LeadsTable from "./_components/leads-table.tsx";
import ActivitiesView from "./_components/activities-view.tsx";
import LeadDialog from "./_components/lead-dialog.tsx";
import LeadDetailSheet from "./_components/lead-detail-sheet.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

// ── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const stats = useQuery(api.crm.getPipelineStats, {});

  if (stats === undefined) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: t("crm.totalLeads"), value: stats.totalLeads.toString(), icon: Users, color: "text-blue-600 dark:text-blue-400" },
    { label: t("crm.pipelineValue"), value: fmt(stats.totalValue), icon: TrendingUp, color: "text-purple-600 dark:text-purple-400" },
    { label: t("crm.wonValue"), value: fmt(stats.wonValue), icon: DollarSign, color: "text-green-600 dark:text-green-400" },
    { label: t("crm.conversionRate"), value: `${stats.conversionRate.toFixed(1)}%`, icon: Target, color: "text-orange-600 dark:text-orange-400" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-lg font-bold">{card.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main CRM Content ─────────────────────────────────────────────────────────

function CrmContent() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("crm.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("crm.subtitle")}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" />
          {t("crm.newLead")}
        </Button>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Tabs */}
      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline" className="cursor-pointer">{t("crm.pipeline")}</TabsTrigger>
          <TabsTrigger value="all" className="cursor-pointer">{t("crm.allLeads")}</TabsTrigger>
          <TabsTrigger value="activities" className="cursor-pointer">{t("crm.activities")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineView onSelectLead={setSelectedLeadId} />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <LeadsTable onSelectLead={setSelectedLeadId} onCreateLead={() => setDialogOpen(true)} />
        </TabsContent>

        <TabsContent value="activities" className="mt-4">
          <ActivitiesView />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <LeadDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <LeadDetailSheet leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}

// ── Page Export ───────────────────────────────────────────────────────────────

export default function CrmPage() {
  const { t } = useTranslation();

  return (
    <>
      <Authenticated>
        <CrmContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">{t("crm.signInRequired")}</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="space-y-6 p-4 md:p-6 max-w-[1400px] mx-auto">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </AuthLoading>
    </>
  );
}
