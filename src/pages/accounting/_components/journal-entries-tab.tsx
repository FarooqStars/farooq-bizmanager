import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, CheckCircle2, Clock, XCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import JournalEntryFormDialog from "./journal-entry-form.tsx";
import JournalEntryViewDialog from "./journal-entry-view.tsx";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

export default function JournalEntriesTab() {
  const entries = useQuery(api.accounting.listJournalEntries, {});
  const postEntry = useMutation(api.accounting.postJournalEntry);
  const voidEntry = useMutation(api.accounting.voidJournalEntry);
  const [showCreate, setShowCreate] = useState(false);
  const [editEntry, setEditEntry] = useState<Doc<"journalEntries"> | null>(null);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);

  if (!entries) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
      case "posted":
        return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3 h-3 mr-1" />Posted</Badge>;
      case "void":
        return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Void</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{entries.length} journal entries</p>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />New Journal Entry
        </Button>
      </div>

      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No journal entries</EmptyTitle>
            <EmptyDescription>Create your first journal entry to record transactions</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)}>New Entry</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry._id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-muted-foreground">{entry.entryNumber}</span>
                    {statusBadge(entry.status)}
                  </div>
                  <p className="text-sm font-medium truncate mt-0.5">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.date), "MMM d, yyyy")}
                    {entry.reference && ` • Ref: ${entry.reference}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-bold">{entry.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-muted-foreground">Dr = Cr</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer h-8 w-8"
                    onClick={() => setViewEntryId(entry._id)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  {entry.status === "draft" && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="cursor-pointer text-xs"
                        onClick={async () => {
                          try {
                            await postEntry({ id: entry._id });
                            toast.success("Entry posted — balances updated");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to post");
                          }
                        }}
                      >
                        Post
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer text-xs"
                        onClick={() => setEditEntry(entry)}
                      >
                        Edit
                      </Button>
                    </>
                  )}
                  {entry.status === "posted" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="cursor-pointer text-xs text-destructive"
                      onClick={async () => {
                        try {
                          await voidEntry({ id: entry._id });
                          toast.success("Entry voided — balances reversed");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to void");
                        }
                      }}
                    >
                      Void
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(showCreate || editEntry) && (
        <JournalEntryFormDialog
          entry={editEntry}
          onClose={() => { setShowCreate(false); setEditEntry(null); }}
        />
      )}

      {viewEntryId && (
        <JournalEntryViewDialog
          entryId={viewEntryId}
          onClose={() => setViewEntryId(null)}
        />
      )}
    </div>
  );
}
