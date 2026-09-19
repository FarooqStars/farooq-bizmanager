import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

type JournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
};

type Props = {
  entry?: Doc<"journalEntries"> | null;
  onClose: () => void;
};

export default function JournalEntryFormDialog({ entry, onClose }: Props) {
  const accounts = useQuery(api.accounting.listAccounts, { activeOnly: true });
  const existingEntry = useQuery(
    api.accounting.getJournalEntry,
    entry ? { id: entry._id } : "skip"
  );
  const createEntry = useMutation(api.accounting.createJournalEntry);
  const updateEntry = useMutation(api.accounting.updateJournalEntry);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState(entry?.description ?? "");
  const [reference, setReference] = useState(entry?.reference ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [lines, setLines] = useState<JournalLine[]>(
    existingEntry?.lines?.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? "",
    })) ?? [
      { accountId: "", debit: 0, credit: 0, description: "" },
      { accountId: "", debit: 0, credit: 0, description: "" },
    ]
  );

  // Update lines when existing entry loads
  const [initializedFromEntry, setInitializedFromEntry] = useState(!entry);
  if (existingEntry?.lines && !initializedFromEntry) {
    setLines(existingEntry.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? "",
    })));
    setInitializedFromEntry(true);
  }

  if (!accounts) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent><Skeleton className="h-64 w-full" /></DialogContent>
      </Dialog>
    );
  }

  const addLine = () => {
    setLines([...lines, { accountId: "", debit: 0, credit: 0, description: "" }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof JournalLine, value: string | number) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    updated[idx] = { ...updated[idx] } satisfies JournalLine;
    setLines(updated);
  };

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    if (!isBalanced) {
      toast.error("Debits must equal credits");
      return;
    }
    if (lines.some((l) => !l.accountId)) {
      toast.error("All lines must have an account selected");
      return;
    }
    if (totalDebit === 0) {
      toast.error("Entry must have at least one amount");
      return;
    }

    setSaving(true);
    try {
      const lineData = lines
        .filter((l) => l.debit > 0 || l.credit > 0)
        .map((l) => ({
          accountId: l.accountId as Id<"accounts">,
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || undefined,
        }));

      if (entry) {
        await updateEntry({
          id: entry._id,
          date,
          description,
          reference: reference || undefined,
          notes: notes || undefined,
          lines: lineData,
        });
        toast.success("Journal entry updated");
      } else {
        await createEntry({
          date,
          description,
          reference: reference || undefined,
          notes: notes || undefined,
          lines: lineData,
        });
        toast.success("Journal entry created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit Journal Entry" : "New Journal Entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <Label>Description *</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe this entry" />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-001" />
            </div>
          </div>

          {/* Journal Lines */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Account</th>
                  <th className="text-left py-2 px-3 font-medium w-20">Description</th>
                  <th className="text-right py-2 px-3 font-medium w-28">Debit</th>
                  <th className="text-right py-2 px-3 font-medium w-28">Credit</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="py-2 px-3">
                      <Select value={line.accountId} onValueChange={(v) => updateLine(idx, "accountId", v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc) => (
                            <SelectItem key={acc._id} value={acc._id}>
                              {acc.code} - {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(idx, "description", e.target.value)}
                        placeholder="—"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={line.debit || ""}
                        onChange={(e) => updateLine(idx, "debit", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        type="number"
                        step="0.01"
                        value={line.credit || ""}
                        onChange={(e) => updateLine(idx, "credit", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs text-right"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-2 px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive cursor-pointer"
                        disabled={lines.length <= 2}
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 border-t">
                <tr>
                  <td colSpan={2} className="py-2 px-3">
                    <Button type="button" variant="ghost" size="sm" onClick={addLine} className="cursor-pointer text-xs">
                      <Plus className="w-3 h-3 mr-1" />Add Line
                    </Button>
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-sm">
                    {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-sm">
                    {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <p className="text-xs text-destructive">
              Out of balance: difference of {Math.abs(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !isBalanced}>
              {saving ? "Saving..." : entry ? "Update Entry" : "Create Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
