import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Users, DollarSign, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { ConvexError } from "convex/values";
import { STAGES, STAGE_COLORS, StageBadge } from "./stage-badge.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";
import type { LeadStage } from "./stage-badge.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type PipelineViewProps = {
  onSelectLead: (id: Id<"leads">) => void;
};

export default function PipelineView({ onSelectLead }: PipelineViewProps) {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const leads = useQuery(api.crm.listLeads, {});
  const updateStage = useMutation(api.crm.updateLeadStage);

  if (leads === undefined) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {STAGES.map((s) => (
          <Skeleton key={s} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  const handleMoveNext = async (leadId: Id<"leads">, currentStage: LeadStage) => {
    const idx = STAGES.indexOf(currentStage);
    if (idx >= STAGES.length - 2) return; // can't move past "won" (lost is separate)
    const nextStage = STAGES[idx + 1];
    try {
      await updateStage({ id: leadId, stage: nextStage });
      toast.success(t("crm.stageUpdated"));
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 overflow-x-auto">
      {STAGES.map((stage) => {
        const stageLeads = leads.filter((l) => l.stage === stage);
        return (
          <div key={stage} className="min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <StageBadge stage={stage} />
              <span className="text-xs text-muted-foreground">({stageLeads.length})</span>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {stageLeads.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  {t("crm.noLeads")}
                </div>
              ) : (
                stageLeads.map((lead) => (
                  <Card
                    key={lead._id}
                    className="cursor-pointer hover:shadow-md transition-shadow py-3"
                    onClick={() => onSelectLead(lead._id)}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <p className="font-medium text-sm truncate">{lead.name}</p>
                      {lead.company && (
                        <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
                      )}
                      {lead.dealValue != null && (
                        <p className="text-xs font-semibold text-primary">
                          {fmt(lead.dealValue)}
                        </p>
                      )}
                      {stage !== "won" && stage !== "lost" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveNext(lead._id, stage); }}
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary cursor-pointer mt-1"
                        >
                          <ArrowRight className="w-3 h-3" />
                          {t("crm.moveNext")}
                        </button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
