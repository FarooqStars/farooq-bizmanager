import { useState } from "react";
import { useQuery, useMutation, Authenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Repeat,
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card } from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty.tsx";

type RecurringType = "invoice" | "bill" | "expense" | "journal_entry";
type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

type RecurringTransaction = {
  _id: Id<"recurringTransactions">;
  name: string;
  type: RecurringType;
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  lastRunDate?: string;
  runCount: number;
  maxRuns?: number;
  isActive: boolean;
  templateData: {
    customerId?: string;
    customerName?: string;
    vendorId?: string;
    vendorName?: string;
    amount: number;
    description?: string;
    debitAccountId?: string;
    creditAccountId?: string;
    category?: string;
  };
};

const TYPE_LABELS: Record<RecurringType, string> = {
  invoice: "Invoice",
  bill: "Bill",
  expense: "Expense",
  journal_entry: "Journal Entry",
};

const TYPE_STYLES: Record<RecurringType, string> = {
  invoice: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  bill: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  expense: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  journal_entry: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

type FormState = {
  name: string;
  type: RecurringType;
  frequency: Frequency;
  startDate: string;
  endDate: string;
  amount: string;
  description: string;
  partyName: string; // customer or vendor name depending on type
  maxRuns: string;
};

const emptyForm: FormState = {
  name: "",
  type: "invoice",
  frequency: "monthly",
  startDate: todayStr(),
  endDate: "",
  amount: "",
  description: "",
  partyName: "",
  maxRuns: "",
};

function RecurringTransactionsInner() {
  const items = useQuery(api.recurringTransactions.list, {});
  const createMut = useMutation(api.recurringTransactions.create);
  const updateMut = useMutation(api.recurringTransactions.update);
  const removeMut = useMutation(api.recurringTransactions.remove);
  const pauseMut = useMutation(api.recurringTransactions.pause);
  const processDueMut = useMutation(api.recurringTransactions.processdue);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"recurringTransactions"> | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<Id<"recurringTransactions"> | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, startDate: todayStr() });
    setDialogOpen(true);
  };

  const openEdit = (rt: RecurringTransaction) => {
    setEditingId(rt._id);
    setForm({
      name: rt.name,
      type: rt.type,
      frequency: rt.frequency,
      startDate: rt.startDate,
      endDate: rt.endDate ?? "",
      amount: String(rt.templateData.amount ?? ""),
      description: rt.templateData.description ?? "",
      partyName: rt.templateData.customerName ?? rt.templateData.vendorName ?? "",
      maxRuns: rt.maxRuns !== undefined ? String(rt.maxRuns) : "",
    });
    setDialogOpen(true);
  };

  const buildTemplateData = () => {
    const amount = parseFloat(form.amount) || 0;
    const base = {
      amount,
      description: form.description.trim() || undefined,
    };
    if (form.type === "invoice") {
      return { ...base, customerName: form.partyName.trim() || undefined };
    }
    if (form.type === "bill") {
      return { ...base, vendorName: form.partyName.trim() || undefined };
    }
    return base;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    setSubmitting(true);
    try {
      const templateData = buildTemplateData();
      const maxRuns = form.maxRuns.trim() ? parseInt(form.maxRuns, 10) : undefined;
      if (editingId) {
        await updateMut({
          id: editingId,
          name: form.name,
          type: form.type,
          frequency: form.frequency,
          startDate: form.startDate,
          endDate: form.endDate.trim() || undefined,
          maxRuns,
          templateData,
        });
        toast.success("Recurring transaction updated");
      } else {
        await createMut({
          name: form.name,
          type: form.type,
          frequency: form.frequency,
          startDate: form.startDate,
          endDate: form.endDate.trim() || undefined,
          maxRuns,
          templateData,
        });
        toast.success("Recurring transaction created");
      }
      setDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof ConvexError
          ? (error.data as { message: string }).message
          : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await removeMut({ id: deleteId });
      toast.success("Recurring transaction deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteId(null);
    }
  };

  const handlePause = async (id: Id<"recurringTransactions">) => {
    try {
      await pauseMut({ id });
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleProcessDue = async () => {
    try {
      const result = await processDueMut({});
      if (result.processed > 0) {
        toast.success(`Processed ${result.processed} due transaction${result.processed === 1 ? "" : "s"}`);
      } else {
        toast.info("No transactions are due right now");
      }
    } catch {
      toast.error("Failed to process due transactions");
    }
  };

  const partyLabel = form.type === "invoice" ? "Customer name" : form.type === "bill" ? "Vendor name" : null;
  const isLoading = items === undefined;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Repeat className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Recurring Transactions</h1>
            <p className="text-muted-foreground text-sm">
              Automate repetitive invoices, bills, and journal entries
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleProcessDue} className="cursor-pointer">
            <PlayCircle className="w-4 h-4 mr-2" />
            Run Due
          </Button>
          <Button onClick={openCreate} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />
            New Recurring
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Repeat />
            </EmptyMedia>
            <EmptyTitle>No recurring transactions yet</EmptyTitle>
            <EmptyDescription>
              Set up templates that repeat automatically on a schedule to save time on regular billing.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={openCreate} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Create your first template
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Table */}
      {!isLoading && items.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((rt) => (
                  <TableRow key={rt._id}>
                    <TableCell className="font-medium">
                      {rt.name}
                      {rt.maxRuns !== undefined && (
                        <span className="block text-xs text-muted-foreground">
                          {rt.runCount}/{rt.maxRuns} runs
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={TYPE_STYLES[rt.type]} variant="secondary">
                        {TYPE_LABELS[rt.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{FREQUENCY_LABELS[rt.frequency]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rt.templateData.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell>{formatDate(rt.nextRunDate)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(rt.lastRunDate)}</TableCell>
                    <TableCell>
                      {rt.isActive ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" variant="secondary">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="cursor-pointer h-8 w-8"
                          onClick={() => openEdit(rt)}
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="cursor-pointer h-8 w-8"
                          onClick={() => handlePause(rt._id)}
                          title={rt.isActive ? "Pause" : "Resume"}
                        >
                          {rt.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="cursor-pointer h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(rt._id)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Recurring Transaction" : "New Recurring Transaction"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rt-name">Name</Label>
              <Input
                id="rt-name"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Monthly office rent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setField("type", v as RecurringType)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="bill">Bill</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="journal_entry">Journal Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setField("frequency", v as Frequency)}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rt-start">Start Date</Label>
                <Input
                  id="rt-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setField("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rt-end">End Date (optional)</Label>
                <Input
                  id="rt-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setField("endDate", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rt-amount">Amount</Label>
                <Input
                  id="rt-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rt-maxruns">Max Runs (optional)</Label>
                <Input
                  id="rt-maxruns"
                  type="number"
                  min="1"
                  step="1"
                  value={form.maxRuns}
                  onChange={(e) => setField("maxRuns", e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            {partyLabel && (
              <div className="space-y-2">
                <Label htmlFor="rt-party">{partyLabel}</Label>
                <Input
                  id="rt-party"
                  value={form.partyName}
                  onChange={(e) => setField("partyName", e.target.value)}
                  placeholder={form.type === "invoice" ? "John Smith" : "Acme Supplies"}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rt-description">Description</Label>
              <Input
                id="rt-description"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="What is this for?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="cursor-pointer"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="cursor-pointer" disabled={submitting}>
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the template and stop it from repeating. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function RecurringTransactionsPage() {
  return (
    <>
      <AuthLoading>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AuthLoading>
      <Authenticated>
        <RecurringTransactionsInner />
      </Authenticated>
    </>
  );
}
