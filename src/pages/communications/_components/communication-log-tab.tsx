import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { History, Mail, MessageCircle, Link2 } from "lucide-react";
import { format } from "date-fns";

export default function CommunicationLogTab() {
  const log = useQuery(api.communications.listCommunicationLog, { limit: 100 });

  if (!log) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (log.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><History /></EmptyMedia>
          <EmptyTitle>No communications sent yet</EmptyTitle>
          <EmptyDescription>Share invoices and quotations, or send payment reminders to see your history here</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const channelIcons = {
    email: <Mail className="w-3.5 h-3.5" />,
    whatsapp: <MessageCircle className="w-3.5 h-3.5" />,
    link: <Link2 className="w-3.5 h-3.5" />,
  };

  const channelColors = {
    email: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    whatsapp: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    link: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Communication History</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Channel</th>
                <th className="text-left p-2 font-medium">Document</th>
                <th className="text-left p-2 font-medium">Recipient</th>
                <th className="text-left p-2 font-medium">Contact</th>
                <th className="text-left p-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {log.map((entry) => (
                <tr key={entry._id} className="hover:bg-muted/30">
                  <td className="p-2">
                    <Badge className={channelColors[entry.channel]}>
                      <span className="flex items-center gap-1">
                        {channelIcons[entry.channel]}
                        {entry.channel}
                      </span>
                    </Badge>
                  </td>
                  <td className="p-2">
                    <span className="font-medium">{entry.documentNumber}</span>
                    <span className="text-xs text-muted-foreground ml-1.5 capitalize">({entry.documentType.replace("_", " ")})</span>
                  </td>
                  <td className="p-2">{entry.recipientName}</td>
                  <td className="p-2 text-xs text-muted-foreground">{entry.recipientContact}</td>
                  <td className="p-2 text-xs">{format(new Date(entry.sentAt), "MMM dd, yyyy HH:mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
