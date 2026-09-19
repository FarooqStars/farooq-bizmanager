import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from "@/components/ui/empty.tsx";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  ChevronDown, Plus, Save, Trash2, ListTree, Sparkles, RefreshCw, GitMerge,
} from "lucide-react";

// ─── Account type definitions ─────────────────────────────────────

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "accounts_receivable", label: "Accounts Receivable" },
  { value: "other_current_asset", label: "Other Current Asset" },
  { value: "fixed_asset", label: "Fixed Asset" },
  { value: "other_asset", label: "Other Asset" },
  { value: "asset", label: "Asset (legacy)" },
  { value: "accounts_payable", label: "Accounts Payable" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other_current_liability", label: "Other Current Liability" },
  { value: "long_term_liability", label: "Long Term Liability" },
  { value: "loan", label: "Loan" },
  { value: "liability", label: "Liability (legacy)" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "other_income", label: "Other Income" },
  { value: "cost_of_goods_sold", label: "Cost of Goods Sold" },
  { value: "expense", label: "Expense" },
  { value: "other_expense", label: "Other Expense" },
  { value: "revenue", label: "Revenue (legacy)" },
] as const;

type AccountType = typeof ACCOUNT_TYPES[number]["value"];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, t.label]),
);

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// Local editable copy of a row's editable fields.
type RowDraft = {
  code: string;
  name: string;
  type: AccountType;
  subType: string;
};

function toDraft(a: Doc<"accounts">): RowDraft {
  return {
    code: a.code,
    name: a.name,
    type: a.type as AccountType,
    subType: a.subType ?? "",
  };
}

// ─── Add Account dialog ────────────────────────────────────────────

function AddAccountDialog({ onClose }: { onClose: () => void }) {
  const createAccount = useMutation(api.accounting.createAccount);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [subType, setSubType] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  const handleCreate = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      await createAccount({
        code: code.trim(),
        name: name.trim(),
        type,
        subType: subType.trim() || undefined,
        openingBalance: openingBalance.trim() ? Number(openingBalance) : undefined,
      });
      toast.success("Account created");
      onClose();
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : "Failed to create account";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1000" />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cash in Bank" />
          </div>
          <div className="space-y-1.5">
            <Label>Sub-type</Label>
            <Input value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="Checking" />
          </div>
          <div className="space-y-1.5">
            <Label>Opening Balance</Label>
            <Input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button type="button" onClick={handleCreate} disabled={saving} className="cursor-pointer">
            {saving ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Merge Dialog ──────────────────────────────────────────────────────────────

function MergeAccountDialog({
  source,
  allAccounts,
  onClose,
}: {
  source: Doc<"accounts">;
  allAccounts: Doc<"accounts">[];
  onClose: () => void;
}) {
  const mergeAccounts = useMutation(api.accounting.mergeAccounts);
  const [targetId, setTargetId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Only show same-type accounts that are not the source itself and not already merged
  const candidates = allAccounts.filter(
    (a) => a._id !== source._id && a.type === source.type && a.isActive && !a.replacedBy,
  );

  const handleMerge = async () => {
    if (!targetId) { toast.error("Select a target account"); return; }
    if (!reason.trim()) { toast.error("Please enter a reason for this merge"); return; }
    setSaving(true);
    try {
      const result = await mergeAccounts({
        sourceId: source._id,
        targetId: targetId as Doc<"accounts">["_id"],
        reason: reason.trim(),
      });
      toast.success(
        `Merged ${source.code} into target. ${result.linesRepointed} journal line(s) re-pointed. It will never come back.`,
      );
      onClose();
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : "Merge failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const target = candidates.find((a) => a._id === targetId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-primary" />
            Merge Account
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <p className="font-medium">Source (will be removed):</p>
            <p className="text-muted-foreground">{source.code} — {source.name}</p>
            <p className="text-xs text-muted-foreground">Balance: {source.balance.toFixed(2)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Merge into (target account) *</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Select target account..." />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {candidates.length === 0 && (
                  <SelectItem value="__none" disabled>No matching accounts of same type</SelectItem>
                )}
                {candidates.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.code} — {a.name} (balance: {a.balance.toFixed(2)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason for merge *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Consolidating duplicate accounts after renumbering"
            />
          </div>
          {target && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3 text-sm space-y-1">
              <p className="font-medium text-green-800 dark:text-green-400">After merge:</p>
              <p className="text-muted-foreground">
                {target.code} — {target.name} will have balance {(target.balance + source.balance).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                All journal lines from {source.code} will move to {target.code}.
                {source.code} will be permanently deactivated and can never be recreated by the system.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button
            type="button"
            onClick={handleMerge}
            disabled={!targetId || !reason.trim() || saving || candidates.length === 0}
            className="cursor-pointer"
          >
            <GitMerge className="w-4 h-4 mr-1" />
            {saving ? "Merging..." : "Merge & Remove Source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Account row ───────────────────────────────────────────────────

function AccountRow({ account, allAccounts }: { account: Doc<"accounts">; allAccounts: Doc<"accounts">[] }) {
  const { fmt } = useCurrency();
  const updateAccount = useMutation(api.accounting.updateAccount);
  const deleteAccount = useMutation(api.accounting.deleteAccount);

  const [draft, setDraft] = useState<RowDraft>(() => toDraft(account));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  // Detect changes vs the persisted account.
  const dirty = useMemo(() => {
    return (
      draft.code !== account.code ||
      draft.name !== account.name ||
      draft.type !== account.type ||
      (draft.subType || "") !== (account.subType ?? "")
    );
  }, [draft, account]);

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await updateAccount({
        id: account._id,
        code: draft.code.trim(),
        name: draft.name.trim(),
        type: draft.type,
        subType: draft.subType.trim() || undefined,
      });
      toast.success(`Saved ${draft.code}`);
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (next: boolean) => {
    try {
      await updateAccount({ id: account._id, isActive: next });
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : "Failed to update";
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount({ id: account._id });
      toast.success("Account deleted");
    } catch (err) {
      const msg = err instanceof ConvexError
        ? (err.data as { message: string }).message
        : "Failed to delete";
      toast.error(msg);
    } finally {
      setConfirmDelete(false);
    }
  };

  const balanceZero = Math.abs(account.balance) < 0.005;

  return (
    <TableRow>
      {/* Code */}
      <TableCell className="align-top">
        <Input
          value={draft.code}
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
          className="h-8 w-24"
          placeholder="1000"
        />
      </TableCell>
      {/* Name */}
      <TableCell className="align-top">
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="h-8 min-w-40"
        />
      </TableCell>
      {/* Type */}
      <TableCell className="align-top">
        <Select
          value={draft.type}
          onValueChange={(v) => setDraft((d) => ({ ...d, type: v as AccountType }))}
        >
          <SelectTrigger className="h-8 w-48 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {/* Sub-type */}
      <TableCell className="align-top">
        <Input
          value={draft.subType}
          onChange={(e) => setDraft((d) => ({ ...d, subType: e.target.value }))}
          className="h-8 w-36"
          placeholder="—"
        />
      </TableCell>
      {/* Normal side */}
      <TableCell className="align-top">
        <Badge
          variant="secondary"
          className={cn(
            "capitalize",
            account.normalSide === "debit"
              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
          )}
        >
          {account.normalSide}
        </Badge>
      </TableCell>
      {/* Balance */}
      <TableCell className="align-top text-right font-mono text-sm whitespace-nowrap">
        {fmt(account.balance)}
      </TableCell>
      {/* Active */}
      <TableCell className="align-top text-center">
        <Checkbox
          checked={account.isActive}
          onCheckedChange={(c) => handleToggleActive(c === true)}
          className="cursor-pointer"
        />
      </TableCell>
      {/* Actions */}
      <TableCell className="align-top">
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="cursor-pointer h-8"
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            {saving ? "..." : "Save"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowMerge(true)}
            title="Merge this account into another (permanent)"
            className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <GitMerge className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            disabled={!balanceZero}
            title={balanceZero ? "Delete account" : "Cannot delete: balance is not zero"}
            className="cursor-pointer h-8 w-8 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>

      {showMerge && (
        <MergeAccountDialog
          source={account}
          allAccounts={allAccounts}
          onClose={() => setShowMerge(false)}
        />
      )}

      {confirmDelete && (
        <AlertDialog open onOpenChange={(o) => !o && setConfirmDelete(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {account.code} — {account.name}. This action cannot be undone.
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
      )}
    </TableRow>
  );
}

// ─── Group section ─────────────────────────────────────────────────

function GroupSection({ type, accounts, allAccounts }: { type: string; accounts: Doc<"accounts">[]; allAccounts: Doc<"accounts">[] }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-2.5 bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
        <ChevronDown
          className={cn("w-4 h-4 transition-transform duration-200", !open && "-rotate-90")}
        />
        <span className="font-semibold text-sm">{typeLabel(type)}</span>
        <Badge variant="secondary" className="ml-1">{accounts.length}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-52">Type</TableHead>
                <TableHead className="w-40">Sub-type</TableHead>
                <TableHead className="w-24">Normal</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-16 text-center">Active</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <AccountRow key={a._id} account={a} allAccounts={allAccounts} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main tab ──────────────────────────────────────────────────────

export default function GLAccountsTab() {
  const accounts = useQuery(api.accounting.listAccounts, {});
  const [showAdd, setShowAdd] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const cleanupDuplicates = useMutation(api.accounting.cleanupDuplicateAccounts);
  const backfillLoans = useMutation(api.loans.backfillLoanGLEntries);

  async function handleCleanup() {
    setCleaningUp(true);
    try {
      const result = await cleanupDuplicates();
      toast.success(`Cleaned up ${result.deactivated} duplicate account(s)`);
    } catch (e) {
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Cleanup failed");
    } finally {
      setCleaningUp(false);
    }
  }

  async function handleBackfillLoans() {
    setBackfilling(true);
    try {
      const result = await backfillLoans();
      if (result.posted === 0) {
        toast.info(`All ${result.skipped} loan(s) already have GL entries`);
      } else {
        toast.success(`Posted GL entries for ${result.posted} loan(s)${result.skipped > 0 ? `, ${result.skipped} already had entries` : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof ConvexError ? (e.data as { message: string }).message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  // Group accounts by type, preserving the ACCOUNT_TYPES order, sorted by code.
  const visibleAccounts = useMemo(
    () => (accounts ? accounts.filter((a) => !a.replacedBy) : []),
    [accounts],
  );

  const grouped = useMemo(() => {
    if (!accounts) return [];
    const byType = new Map<string, Doc<"accounts">[]>();
    for (const a of visibleAccounts) {
      const list = byType.get(a.type) ?? [];
      list.push(a);
      byType.set(a.type, list);
    }
    const orderedTypes = ACCOUNT_TYPES.map((t) => t.value as string);
    // Include any types present that aren't in the known list at the end.
    for (const t of byType.keys()) {
      if (!orderedTypes.includes(t)) orderedTypes.push(t);
    }
    return orderedTypes
      .filter((t) => byType.has(t))
      .map((t) => ({
        type: t,
        accounts: (byType.get(t) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
      }));
  }, [accounts, visibleAccounts]);

  if (accounts === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {visibleAccounts.length} account{visibleAccounts.length === 1 ? "" : "s"} across {grouped.length} type{grouped.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={handleBackfillLoans} disabled={backfilling} className="cursor-pointer">
            <RefreshCw className={cn("w-4 h-4 mr-1", backfilling && "animate-spin")} />
            Backfill Loan GL Entries
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCleanup} disabled={cleaningUp} className="cursor-pointer">
            <Sparkles className="w-4 h-4 mr-1" />
            {cleaningUp ? "Cleaning..." : "Clean Up Duplicates"}
          </Button>
          <Button onClick={() => setShowAdd(true)} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-1" /> Add Account
          </Button>
        </div>
      </div>

      {visibleAccounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ListTree /></EmptyMedia>
            <EmptyTitle>No accounts yet</EmptyTitle>
            <EmptyDescription>Create your first general ledger account to get started.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowAdd(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-1" /> Add Account
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <GroupSection key={g.type} type={g.type} accounts={g.accounts} allAccounts={visibleAccounts} />
          ))}
        </div>
      )}

      {showAdd && <AddAccountDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}
