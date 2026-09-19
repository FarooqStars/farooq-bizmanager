import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Phone, Mail, Calendar, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  meeting: <Calendar className="w-4 h-4" />,
  note: <MessageSquare className="w-4 h-4" />,
  task: <CheckCircle className="w-4 h-4" />,
  follow_up: <Clock className="w-4 h-4" />,
};

export default function ActivitiesView() {
  const { t } = useTranslation();
  const stats = useQuery(api.crm.getPipelineStats, {});
  const completeActivity = useMutation(api.crm.completeActivity);

  if (stats === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const activities = stats.upcomingFollowUps;

  if (activities.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Clock /></EmptyMedia>
          <EmptyTitle>{t("crm.noActivities")}</EmptyTitle>
          <EmptyDescription>{t("crm.noActivitiesDesc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const handleComplete = async (id: typeof activities[0]["_id"]) => {
    try {
      await completeActivity({ id });
      toast.success(t("crm.activityCompleted"));
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-2">
      {activities.map((activity) => {
        const dueDate = activity.dueDate ?? activity.date;
        const isOverdue = new Date(dueDate) < new Date();
        return (
          <div
            key={activity._id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-colors",
              isOverdue && "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
            )}
          >
            <div className="flex-shrink-0 p-2 rounded-md bg-muted">
              {ACTIVITY_ICONS[activity.type] ?? <Clock className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{activity.title}</p>
              <p className="text-xs text-muted-foreground">
                {activity.leadName} &middot; {new Date(dueDate).toLocaleDateString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer"
              onClick={() => handleComplete(activity._id)}
            >
              <CheckCircle className="w-4 h-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
