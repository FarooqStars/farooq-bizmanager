import { cn } from "@/lib/utils.ts";
import { useTranslation } from "react-i18next";

export type LeadStage = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export const STAGES: LeadStage[] = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

export const STAGE_COLORS: Record<LeadStage, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  contacted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  qualified: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  proposal: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  negotiation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  won: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function StageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STAGE_COLORS[stage], className)}>
      {t(`crm.stages.${stage}`)}
    </span>
  );
}


