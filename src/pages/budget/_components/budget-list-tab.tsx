import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type BudgetType = "monthly" | "quarterly" | "yearly";

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetListTab() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const budgets = useQuery(api.budgets.list, { period });
  const accounts = useQuery(api.accounting.listAccounts, { activeOnly: true });
  const createBudget = useMutation(api.budgets.create);
  const updateBudget = useMutation(api.budgets.update);
  const removeBudget = useMutation(api.budgets.remove);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"budgets"> | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<BudgetType>("monthly");
  const [amount, setAmount] = useState(0);
  const [department, setDepartment] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [notes, setNotes] = useState("");

  if (budgets === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const expenseAccounts = (accounts ?? []).filter((a) => a.type === "expense" && a.isActive);

  const resetForm = () => {
    setName("");
    setType("monthly");
    setAmount(0);
    setDepartment("");
    setAccountId("");
    setNotes("");
    setEditingId(null);
  };

  const handleEdit = (b: typeof budgets[number]) => {
    setEditingId(b._id);
    setName(b.name);
    setType(b.type);
    setAmount(b.amount);
    setDepartment(b.department ?? "");
    setAccountId(b.accountId ?? "");
    setNotes(b.notes ?? "");
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || amount <= 0) {
      toast.error(t("budget.validation_error"));
      return;
    }
    try {
      if (editingId) {
        await updateBudget({
          id: editingId,
          name: name.trim(),
          amount,
          notes: notes || undefined,
          department: department || undefined,
          accountId: accountId ? (accountId as Id<"accounts">) : undefined,
        });
        toast.success(t("budget.updated"));
      } else {
        await createBudget({
          name: name.trim(),
          type,
          period,
          amount,
          notes: notes || undefined,
          department: department || undefined,
          accountId: accountId ? (accountId as Id<"accounts">) : undefined,
        });
        toast.success(t("budget.created"));
      }
      setDialogOpen(false);
      resetForm();
    } catch {
      toast.error(t("budget.save_error"));
    }
  };

  const handleDelete = async (id: Id<"budgets">) => {
    try {
      await removeBudget({ id });
      toast.success(t("budget.deleted"));
    } catch {
      toast.error(t("budget.delete_error"));
    }
  };

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);

  // Generate periods
  const now = new Date();
  const periods: string[] = [];
  for (let m = 0; m < 12; m++) {
    const d = new Date(now.getFullYear(), m, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {new Date(p + "-01").toLocaleDateString(undefined, { year: "numeric", month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-sm">
            {t("budget.total")}: {totalBudget.toLocaleString()}
          </Badge>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="cursor-pointer">
              <Plus className="w-4 h-4 mr-1" />
              {t("budget.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t("budget.edit") : t("budget.add")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{t("common.name")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("budget.name_placeholder")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("budget.amount")}</Label>
                  <Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("budget.type")}</Label>
                  <Select value={type} onValueChange={(v) => setType(v as BudgetType)} disabled={!!editingId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("budget.monthly")}</SelectItem>
                      <SelectItem value="quarterly">{t("budget.quarterly")}</SelectItem>
                      <SelectItem value="yearly">{t("budget.yearly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("budget.account")}</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder={t("budget.select_account")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("budget.no_account")}</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a._id} value={a._id}>{a.code} - {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("budget.department")}</Label>
                  <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t("budget.dept_placeholder")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("common.notes")}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("budget.notes_placeholder")} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setDialogOpen(false); resetForm(); }} className="cursor-pointer">{t("common.cancel")}</Button>
                <Button onClick={handleSubmit} className="cursor-pointer">{t("common.save")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {budgets.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Wallet /></EmptyMedia>
            <EmptyTitle>{t("budget.no_budgets")}</EmptyTitle>
            <EmptyDescription>{t("budget.no_budgets_desc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="cursor-pointer">{t("budget.add")}</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {budgets.map((b) => (
            <Card key={b._id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.department && `${b.department} • `}
                      {t(`budget.${b.type}`)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{b.amount.toLocaleString()}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(b)} className="cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(b._id)} className="cursor-pointer text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
