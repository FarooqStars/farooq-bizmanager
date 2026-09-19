import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Activity } from "lucide-react";

export default function ActivityPage() {
  const activityLog = useQuery(api.users.getActivityLog, { limit: 100 });

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Activity className="w-6 h-6" /> Activity Log
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground font-normal">
            All actions performed by your team, newest first.
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLog === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4 pl-10">
                {activityLog.map((log) => (
                  <div key={log._id} className="relative">
                    <div className="absolute -left-[1.65rem] top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-sm">{log.user?.name ?? "Unknown"}</span>
                        <span className="text-muted-foreground text-sm"> — {log.action}</span>
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
                        )}
                        {log.resourceType && (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded mt-1 inline-block capitalize">
                            {log.resourceType}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {new Date(log._creationTime).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
