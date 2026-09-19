import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ShieldAlert } from "lucide-react";
import AdminVoidDialog from "@/components/admin-void-dialog.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Props = {
  entryId: string;
  onClose: () => void;
};

export default function JournalEntryViewDialog({ entryId, onClose }: Props) {
  const entry = useQuery(api.accounting.getJournalEntry, { id: entryId as Id<"journalEntries"> });
  const currentUser = useQuery(api.users.getCurrentUser);
  const adminVoidEntry = useMutation(api.accounting.adminVoidPostedEntry);

  const [showAdminVoid, setShowAdminVoid] = useState(false);

  const isOwner = currentUser?.role === "owner";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Journal Entry Details</DialogTitle>
        </DialogHeader>

        {!entry ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Entry #</p>
                <p className="font-mono font-bold">{entry.entryNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium">{format(new Date(entry.date), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={entry.status === "posted" ? "default" : entry.status === "void" ? "destructive" : "secondary"}>
                  {entry.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reference</p>
                <p className="font-medium">{entry.reference || "—"}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{entry.description}</p>
            </div>

            {entry.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm italic">{entry.notes}</p>
              </div>
            )}

            {/* Lines table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Account</th>
                    <th className="text-left py-2 px-3 font-medium">Description</th>
                    <th className="text-right py-2 px-3 font-medium">Debit</th>
                    <th className="text-right py-2 px-3 font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((line) => (
                    <tr key={line._id} className="border-t">
                      <td className="py-2 px-3">
                        <span className="font-mono text-xs mr-2">{line.accountCode}</span>
                        {line.accountName}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{line.description || "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {line.debit > 0 ? line.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {line.credit > 0 ? line.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 border-t font-bold">
                  <tr>
                    <td colSpan={2} className="py-2 px-3">Total</td>
                    <td className="py-2 px-3 text-right font-mono">{entry.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-mono">{entry.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {entry.postedAt && (
              <p className="text-xs text-muted-foreground">
                Posted: {format(new Date(entry.postedAt), "MMM d, yyyy HH:mm")}
              </p>
            )}

            {/* Owner-only admin actions */}
            {isOwner && entry.status === "posted" && (
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                  onClick={() => setShowAdminVoid(true)}
                >
                  <ShieldAlert className="h-4 w-4 mr-1.5" />
                  Admin Void
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {showAdminVoid && (
        <AdminVoidDialog
          isOpen
          onClose={() => setShowAdminVoid(false)}
          title="Admin Void Journal Entry"
          description="This will reverse all related ledger entries and mark this journal entry as void."
          confirmLabel="Void Entry"
          onConfirm={async (reason) => {
            await adminVoidEntry({ journalEntryId: entryId as Id<"journalEntries">, reason });
            toast.success("Journal entry voided. Ledger entries reversed.");
            setShowAdminVoid(false);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
