import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { ScrollText, Check, X } from "lucide-react";

export default function AccessLogTab() {
  const entries = useQuery(api.security.listAccessLog, { limit: 100 });

  if (!entries) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (entries.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ScrollText /></EmptyMedia>
          <EmptyTitle>No access log entries</EmptyTitle>
          <EmptyDescription>Access events will be logged as users interact with the system</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Showing the {entries.length} most recent access events</p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <Card key={entry._id}>
            <CardContent className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                {entry.success ? (
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                    <X className="w-3 h-3 text-red-600 dark:text-red-400" />
                  </div>
                )}
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{entry.userName}</span>
                    <Badge variant="secondary" className="text-xs capitalize">{entry.userRole}</Badge>
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs capitalize">{entry.module}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.action}
                    {entry.details && ` — ${entry.details}`}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(entry.timestamp).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
