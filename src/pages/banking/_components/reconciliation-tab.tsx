import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CheckCircle2, Circle, Plus, FileUp, AlertCircle, History,
  Scale, Printer, CheckCheck, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function ReconciliationTab() {
  const { fmt } = useCurrency();
  // Use the unified accounts table (bank type) instead of the deprecated bankAccounts table
  const bankAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  if (!bankAccounts) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {/* Account Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="w-4 h-4" />
            Bank Reconciliation
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Match bank statement entries with book entries, mark items as cleared, and complete reconciliations.
            Accounts are loaded from your Chart of Accounts.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select bank account to reconcile" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id} className="cursor-pointer">
                      {a.code} — {a.name} ({a.subType ?? "Bank"}) | {fmt(a.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedAccountId && (
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => setShowImport(true)} className="cursor-pointer">
                  <FileUp className="w-4 h-4 mr-1" />Import CSV
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowAddTxn(true)} className="cursor-pointer">
                  <Plus className="w-4 h-4 mr-1" />Add Txn
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowHistory(true)} className="cursor-pointer">
                  <History className="w-4 h-4 mr-1" />History
                </Button>
                <Button size="sm" onClick={() => setShowComplete(true)} className="cursor-pointer">
                  <CheckCircle2 className="w-4 h-4 mr-1" />Complete Reconciliation
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedAccountId ? (
        <ReconciliationView accountId={selectedAccountId as Id<"accounts">} />
      ) : (
        <Card>
          <CardContent className="py-8">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Scale /></EmptyMedia>
                <EmptyTitle>Select a bank account</EmptyTitle>
                <EmptyDescription>Choose a bank account above to view and reconcile transactions</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      {showAddTxn && selectedAccountId && (
        <AddTransactionDialog
          accountId={selectedAccountId as Id<"accounts">}
          onClose={() => setShowAddTxn(false)}
        />
      )}

      {showImport && selectedAccountId && (
        <ImportStatementDialog
          accountId={selectedAccountId as Id<"accounts">}
          onClose={() => setShowImport(false)}
        />
      )}

      {showHistory && selectedAccountId && (
        <ReconciliationHistoryDialog
          accountId={selectedAccountId as Id<"accounts">}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showComplete && selectedAccountId && (
        <CompleteReconciliationDialog
          accountId={selectedAccountId as Id<"accounts">}
          onClose={() => setShowComplete(false)}
        />
      )}
    </div>
  );
}

// ─── Reconciliation View ─────────────────────────────────────

function ReconciliationView({ accountId }: { accountId: Id<"accounts"> }) {
  const { fmt } = useCurrency();
  // Use accountId for the reconciliation summary and transactions
  const summary = useQuery(api.banking.getReconciliationSummary, { accountId });
  const transactions = useQuery(api.banking.listBankTransactions, { accountId });
  const reconcile = useMutation(api.banking.reconcileTransaction);
  const unreconcile = useMutation(api.banking.unreconcileTransaction);
  const bulkReconcileMutation = useMutation(api.banking.bulkReconcile);
  const bulkUnreconcileMutation = useMutation(api.banking.bulkUnreconcile);

  const [filter, setFilter] = useState<"all" | "unreconciled" | "reconciled">("unreconciled");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!summary || !transactions) return <Skeleton className="h-40 w-full" />;

  const filteredTxns = transactions.filter((t) => {
    if (filter === "unreconciled") return !t.isReconciled;
    if (filter === "reconciled") return t.isReconciled;
    return true;
  });

  const handleToggleReconcile = async (txnId: string, isReconciled: boolean) => {
    try {
      if (isReconciled) {
        await unreconcile({ transactionId: txnId as Id<"bankTransactions"> });
        toast.success("Marked as unreconciled");
      } else {
        await reconcile({ transactionId: txnId as Id<"bankTransactions"> });
        toast.success("Marked as reconciled");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredTxns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredTxns.map((t) => t._id)));
    }
  };

  const handleBulkReconcile = async () => {
    const ids = [...selected] as Id<"bankTransactions">[];
    try {
      await bulkReconcileMutation({ transactionIds: ids });
      toast.success(`Marked ${ids.length} transactions as reconciled`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleBulkUnreconcile = async () => {
    const ids = [...selected] as Id<"bankTransactions">[];
    try {
      await bulkUnreconcileMutation({ transactionIds: ids });
      toast.success(`Marked ${ids.length} transactions as unreconciled`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handlePrint = () => {
    const rows = filteredTxns.map((t) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;">${format(new Date(t.date), "MMM d, yyyy")}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;">${t.description}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;font-size:11px;">${t.reference || "—"}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">${t.type === "debit" ? t.amount.toFixed(2) : "—"}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">${t.type === "credit" ? t.amount.toFixed(2) : "—"}</td>
        <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-size:11px;">${t.isReconciled ? "Yes" : "No"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html><head><title>Bank Reconciliation</title>
    <style>body{font-family:'Segoe UI',sans-serif;padding:20px;} @media print{.no-print{display:none!important;}}</style></head><body>
    <div class="no-print" style="text-align:center;margin-bottom:16px;">
      <button onclick="window.print()" style="padding:8px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">Print</button>
      <button onclick="window.close()" style="padding:8px 24px;background:#6b7280;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-left:8px;">Close</button>
    </div>
    <h1 style="font-size:16px;text-align:center;">Bank Reconciliation Report</h1>
    <p style="text-align:center;font-size:12px;color:#555;">
      Balance: ${summary.bankBalance.toFixed(2)} | Reconciled: ${summary.reconciledCount} | Unreconciled: ${summary.unreconciledCount}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead><tr style="background:#f4f4f4;">
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;font-size:11px;">Date</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;font-size:11px;">Description</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;font-size:11px;">Reference</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">Debit</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-size:11px;">Credit</th>
        <th style="padding:6px 8px;border:1px solid #ddd;text-align:center;font-size:11px;">Cleared</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></body></html>`;
    openPrintWindow(html);
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Book Balance</p>
            <p className="text-lg font-bold">{fmt(summary.bankBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cleared Total</p>
            <p className="text-lg font-bold text-green-600">{fmt(summary.reconciledAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Uncleared Total</p>
            <p className="text-lg font-bold text-amber-600">{fmt(summary.unreconciledAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Reconciled</p>
            <p className="text-lg font-bold text-green-600">{summary.reconciledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Unreconciled</p>
            <p className="text-lg font-bold text-amber-600">{summary.unreconciledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Transactions</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                {(["all", "unreconciled", "reconciled"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "ghost"}
                    onClick={() => { setFilter(f); setSelected(new Set()); }}
                    className="cursor-pointer text-xs capitalize"
                  >
                    {f}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={handlePrint} className="cursor-pointer">
                <Printer className="w-3.5 h-3.5 mr-1" />Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded-lg">
              <span className="text-xs font-medium">{selected.size} selected</span>
              {filter !== "reconciled" && (
                <Button size="sm" variant="secondary" onClick={handleBulkReconcile} className="cursor-pointer text-xs">
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />Mark Cleared
                </Button>
              )}
              {filter !== "unreconciled" && (
                <Button size="sm" variant="secondary" onClick={handleBulkUnreconcile} className="cursor-pointer text-xs">
                  <XCircle className="w-3.5 h-3.5 mr-1" />Mark Uncleared
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="cursor-pointer text-xs ml-auto">
                Clear Selection
              </Button>
            </div>
          )}

          {filteredTxns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No transactions to show</p>
          ) : (
            <>
              {/* Select All */}
              <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                <Checkbox
                  checked={selected.size === filteredTxns.length && filteredTxns.length > 0}
                  onCheckedChange={selectAll}
                  className="cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">Select All ({filteredTxns.length})</span>
              </div>

              <div className="space-y-1 max-h-[450px] overflow-y-auto">
                {filteredTxns.map((txn) => (
                  <div
                    key={txn._id}
                    className={cn(
                      "flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors",
                      selected.has(txn._id) && "bg-primary/5 border-primary/30"
                    )}
                  >
                    <Checkbox
                      checked={selected.has(txn._id)}
                      onCheckedChange={() => toggleSelect(txn._id)}
                      className="cursor-pointer"
                    />
                    <button
                      onClick={() => handleToggleReconcile(txn._id, txn.isReconciled)}
                      className="cursor-pointer shrink-0"
                      title={txn.isReconciled ? "Mark as unreconciled" : "Mark as reconciled"}
                    >
                      {txn.isReconciled ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{txn.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(txn.date), "MMM d, yyyy")}</span>
                        {txn.reference && <span>Ref: {txn.reference}</span>}
                        {txn.category && <Badge variant="secondary" className="text-[10px]">{txn.category}</Badge>}
                      </div>
                    </div>
                    <div className={cn(
                      "font-mono text-sm font-bold",
                      txn.type === "credit" ? "text-green-600" : "text-red-600"
                    )}>
                      {txn.type === "credit" ? "+" : "-"}{fmt(txn.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Complete Reconciliation Dialog ─────────────────────────

function CompleteReconciliationDialog({
  accountId,
  onClose,
}: {
  accountId: Id<"accounts">;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const summary = useQuery(api.banking.getReconciliationSummary, { accountId });
  const completeReconciliation = useMutation(api.banking.completeReconciliation);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [statementBalance, setStatementBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const stmtBal = parseFloat(statementBalance) || 0;
  const clearedBal = summary?.reconciledAmount ?? 0;
  const difference = Math.round((stmtBal - clearedBal) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statementBalance) {
      toast.error("Statement balance is required");
      return;
    }
    setSaving(true);
    try {
      const result = await completeReconciliation({
        accountId,
        statementDate,
        statementBalance: stmtBal,
        notes: notes || undefined,
      });
      if (Math.abs(result.difference) < 0.01) {
        toast.success("Reconciliation complete! Accounts are balanced.");
      } else {
        toast.success(`Reconciliation saved. Difference: ${result.difference.toFixed(2)}`);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Reconciliation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Book Balance:</span>
              <span className="font-bold">{fmt(summary?.bankBalance ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cleared Items Total:</span>
              <span className="font-bold text-green-600">{fmt(clearedBal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Uncleared Items:</span>
              <span className="font-bold text-amber-600">{summary?.unreconciledCount ?? 0}</span>
            </div>
          </div>

          <div>
            <Label>Statement Date *</Label>
            <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </div>
          <div>
            <Label>Statement Ending Balance *</Label>
            <Input
              type="number"
              step="0.01"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              placeholder="Enter balance from bank statement"
            />
          </div>

          {statementBalance && (
            <div className={cn(
              "p-3 rounded-lg border-2",
              Math.abs(difference) < 0.01 ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-red-500 bg-red-50 dark:bg-red-950/20"
            )}>
              <div className="flex justify-between text-sm font-bold">
                <span>Difference:</span>
                <span className={Math.abs(difference) < 0.01 ? "text-green-600" : "text-red-600"}>
                  {fmt(difference)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.abs(difference) < 0.01
                  ? "Balanced! Statement matches cleared items."
                  : "Statement does not match cleared items. Review uncleared transactions."}
              </p>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional reconciliation notes" />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">{saving ? "Saving..." : "Complete Reconciliation"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reconciliation History Dialog ──────────────────────────

function ReconciliationHistoryDialog({
  accountId,
  onClose,
}: {
  accountId: Id<"accounts">;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const history = useQuery(api.banking.getReconciliationHistory, { accountId });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Reconciliation History
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto">
          {!history ? (
            <Skeleton className="h-20 w-full" />
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No reconciliation history yet. Complete your first reconciliation to see it here.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((session) => (
                <div key={session._id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Statement: {format(new Date(session.statementDate), "MMM d, yyyy")}
                    </span>
                    <Badge variant={Math.abs(session.difference) < 0.01 ? "default" : "destructive"}>
                      {Math.abs(session.difference) < 0.01 ? "Balanced" : `Diff: ${fmt(session.difference)}`}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Statement Bal:</span>
                      <p className="font-mono font-medium">{fmt(session.statementBalance)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cleared Bal:</span>
                      <p className="font-mono font-medium">{fmt(session.clearedBalance)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Transactions:</span>
                      <p className="font-mono font-medium">{session.transactionCount}</p>
                    </div>
                  </div>
                  {session.completedAt && (
                    <p className="text-[10px] text-muted-foreground">
                      Completed: {format(new Date(session.completedAt), "MMM d, yyyy h:mm a")}
                    </p>
                  )}
                  {session.notes && (
                    <p className="text-xs text-muted-foreground italic">{session.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Transaction Dialog ─────────────────────────────────

function AddTransactionDialog({
  accountId,
  onClose,
}: {
  accountId: Id<"accounts">;
  onClose: () => void;
}) {
  const createTxn = useMutation(api.banking.createBankTransaction);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"debit" | "credit">("debit");
  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) {
      toast.error("Description and amount are required");
      return;
    }
    setSaving(true);
    try {
      await createTxn({
        accountId,
        date,
        description,
        amount: parseFloat(amount),
        type,
        reference: reference || undefined,
        category: category || undefined,
      });
      toast.success("Transaction added");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Bank Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Description *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Payment description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "debit" | "credit")}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit" className="cursor-pointer">Debit (Outflow)</SelectItem>
                  <SelectItem value="credit" className="cursor-pointer">Credit (Inflow)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Utilities" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">{saving ? "Adding..." : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Statement Dialog ────────────────────────────────

function ImportStatementDialog({
  accountId,
  onClose,
}: {
  accountId: Id<"accounts">;
  onClose: () => void;
}) {
  const importTransactions = useMutation(api.banking.importBankTransactions);
  const [csvText, setCsvText] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Array<{ date: string; description: string; amount: number; type: "debit" | "credit" }>>([]);

  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const parsed: Array<{ date: string; description: string; amount: number; type: "debit" | "credit" }> = [];

    const header = lines[0].toLowerCase();
    const hasDebitCredit = header.includes("debit") && header.includes("credit");

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 3) continue;

      const date = cols[0];
      const description = cols[1];

      if (hasDebitCredit) {
        const debit = parseFloat(cols[2]) || 0;
        const credit = parseFloat(cols[3]) || 0;
        if (debit > 0) {
          parsed.push({ date, description, amount: debit, type: "debit" });
        } else if (credit > 0) {
          parsed.push({ date, description, amount: credit, type: "credit" });
        }
      } else {
        const amountRaw = parseFloat(cols[2]);
        if (isNaN(amountRaw)) continue;
        parsed.push({
          date,
          description,
          amount: Math.abs(amountRaw),
          type: amountRaw >= 0 ? "credit" : "debit",
        });
      }
    }
    return parsed;
  };

  const handleParse = () => {
    const parsed = parseCSV(csvText);
    if (parsed.length === 0) {
      toast.error("No valid transactions found. Formats: (Date, Description, Amount) or (Date, Description, Debit, Credit)");
      return;
    }
    setPreview(parsed);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setSaving(true);
    try {
      const result = await importTransactions({
        accountId,
        transactions: preview,
      });
      toast.success(`Imported ${result.count} transactions`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Bank Statement (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Paste CSV data in one of these formats:</p>
              <p className="font-mono">Date, Description, Amount</p>
              <p className="text-[10px]">(positive = credit/inflow, negative = debit/outflow)</p>
              <p className="font-mono">Date, Description, Debit, Credit</p>
            </div>
          </div>
          <div>
            <Label>CSV Data</Label>
            <textarea
              className="w-full h-32 p-3 border rounded-lg text-xs font-mono bg-background resize-none"
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setPreview([]); }}
              placeholder={`Date,Description,Amount\n2026-01-15,Salary Deposit,5000.00\n2026-01-16,Office Rent,-2000.00`}
            />
          </div>

          {preview.length === 0 ? (
            <Button type="button" onClick={handleParse} className="w-full cursor-pointer">
              Parse & Preview
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium">{preview.length} transactions found:</p>
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
                {preview.map((txn, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1.5 hover:bg-muted/50 rounded">
                    <div className="flex-1 min-w-0">
                      <span className="text-muted-foreground mr-2">{txn.date}</span>
                      <span className="truncate">{txn.description}</span>
                    </div>
                    <span className={cn("font-mono font-medium", txn.type === "credit" ? "text-green-600" : "text-red-600")}>
                      {txn.type === "credit" ? "+" : "-"}{txn.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
            {preview.length > 0 && (
              <Button onClick={handleImport} disabled={saving} className="cursor-pointer">
                {saving ? "Importing..." : `Import ${preview.length} Transactions`}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
