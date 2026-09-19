import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Users, Building2 } from "lucide-react";
import { StageBadge } from "./stage-badge.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type LeadsTableProps = {
  onSelectLead: (id: Id<"leads">) => void;
  onCreateLead: () => void;
};

export default function LeadsTable({ onSelectLead, onCreateLead }: LeadsTableProps) {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const leads = useQuery(api.crm.listLeads, {});

  if (leads === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Users /></EmptyMedia>
          <EmptyTitle>{t("crm.emptyLeads")}</EmptyTitle>
          <EmptyDescription>{t("crm.emptyLeadsDesc")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={onCreateLead}>{t("crm.newLead")}</Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium">{t("crm.name")}</th>
            <th className="text-left p-3 font-medium hidden md:table-cell">{t("crm.company")}</th>
            <th className="text-left p-3 font-medium">{t("crm.stage")}</th>
            <th className="text-right p-3 font-medium hidden sm:table-cell">{t("crm.value")}</th>
            <th className="text-left p-3 font-medium hidden lg:table-cell">{t("crm.source")}</th>
            <th className="text-left p-3 font-medium hidden lg:table-cell">{t("crm.assignedTo")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {leads.map((lead) => (
            <tr
              key={lead._id}
              className="hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => onSelectLead(lead._id)}
            >
              <td className="p-3 font-medium">{lead.name}</td>
              <td className="p-3 text-muted-foreground hidden md:table-cell">
                {lead.company || "—"}
              </td>
              <td className="p-3">
                <StageBadge stage={lead.stage} />
              </td>
              <td className="p-3 text-right hidden sm:table-cell">
                {lead.dealValue != null ? fmt(lead.dealValue) : "—"}
              </td>
              <td className="p-3 text-muted-foreground capitalize hidden lg:table-cell">
                {lead.source?.replace("_", " ") || "—"}
              </td>
              <td className="p-3 text-muted-foreground hidden lg:table-cell">
                {lead.assignedUserName || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
