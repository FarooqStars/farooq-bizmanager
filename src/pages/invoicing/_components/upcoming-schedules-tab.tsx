import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

export default function UpcomingSchedulesTab() {
  const { t } = useTranslation();
  const upcoming = useQuery(api.recurring.getUpcomingSchedules, {});

  if (!upcoming) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (upcoming.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Calendar /></EmptyMedia>
          <EmptyTitle>{t("recurring.no_upcoming")}</EmptyTitle>
          <EmptyDescription>{t("recurring.no_upcoming_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("recurring.upcoming_subtitle")}</p>
      {upcoming.map((item, idx) => (
        <Card key={idx}>
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.type === "invoice" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}`}>
                {item.type === "invoice" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              </div>
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-muted-foreground">
                  {item.entityName} &bull; {t(`recurring.freq_${item.frequency}`)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">
                {item.type === "invoice" ? "+" : "-"}{item.amount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">{item.nextDate}</div>
              <Badge variant={item.type === "invoice" ? "default" : "secondary"} className="text-xs mt-1">
                {item.type === "invoice" ? t("recurring.type_invoice") : t("recurring.type_bill")}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
