import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { FileUp, CheckCircle, Clock, XCircle, DollarSign, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

export default function ClaimStatsCards() {
  const { t } = useTranslation();
  const stats = useQuery(api.claims.getClaimStats, {});

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: t("claims.stat_submitted"), value: stats.totalSubmitted, icon: FileUp, color: "text-blue-600" },
    { label: t("claims.stat_pending"), value: stats.totalPending, icon: Clock, color: "text-yellow-600" },
    { label: t("claims.stat_approved"), value: stats.totalApproved, icon: CheckCircle, color: "text-green-600" },
    { label: t("claims.stat_rejected"), value: stats.totalRejected, icon: XCircle, color: "text-red-600" },
    { label: t("claims.stat_total_amount"), value: stats.totalAmount.toLocaleString(), icon: DollarSign, color: "text-emerald-600" },
    { label: t("claims.stat_awaiting_me"), value: stats.pendingMyApproval, icon: AlertCircle, color: "text-orange-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <card.icon className={`w-5 h-5 ${card.color}`} />
            <div>
              <div className="text-lg font-bold">{card.value}</div>
              <div className="text-xs text-muted-foreground">{card.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
