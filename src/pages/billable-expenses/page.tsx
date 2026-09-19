import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Receipt, Plus, FileText, Trash2, Clock, CheckCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import BillableSummaryCards from "./_components/billable-summary-cards.tsx";
import CreateBillableDialog from "./_components/create-billable-dialog.tsx";
import BillToInvoiceDialog from "./_components/bill-to-invoice-dialog.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type StatusFilter = "all" | "unbilled" | "billed" | "paid";

export default function BillableExpensesPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [selectedCustomerForBilling, setSelectedCustomerForBilling] = useState<Id<"customers"> | null>(null);

  const removeExpense = useMutation(api.billableExpenses.remove);

  const queryArgs = statusFilter === "all"
    ? {}
    : { status: statusFilter as "unbilled" | "billed" | "paid" };

  const expenses = useQuery(api.billableExpenses.list, queryArgs);

  const statusBadge = (status: string) => {
    switch (status) {
      case "unbilled":
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />{t("billable.unbilled")}</Badge>;
      case "billed":
        return <Badge className="gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"><FileText className="w-3 h-3" />{t("billable.billed")}</Badge>;
      case "paid":
        return <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle className="w-3 h-3" />{t("billable.paid")}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleDelete = async (id: Id<"billableExpenses">) => {
    try {
      await removeExpense({ id });
      toast.success(t("billable.deleted_success"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete";
      toast.error(msg);
    }
  };

  const handleBillCustomer = (customerId: Id<"customers">) => {
    setSelectedCustomerForBilling(customerId);
    setShowBillDialog(true);
  };

  // Group unbilled expenses by customer for quick action
  const unbilledByCustomer = expenses
    ?.filter((e) => e.status === "unbilled")
    .reduce<Record<string, { name: string; count: number; total: number; customerId: Id<"customers"> }>>((acc, e) => {
      if (!acc[e.customerId]) {
        acc[e.customerId] = { name: e.customerName, count: 0, total: 0, customerId: e.customerId };
      }
      acc[e.customerId].count += 1;
      acc[e.customerId].total += e.billedAmount;
      return acc;
    }, {});

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            {t("billable.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("billable.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="cursor-pointer gap-2">
          <Plus className="w-4 h-4" />
          {t("billable.new_expense")}
        </Button>
      </div>

      {/* Summary Cards */}
      <BillableSummaryCards />

      {/* Unbilled by Customer Quick Actions */}
      {unbilledByCustomer && Object.keys(unbilledByCustomer).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {t("billable.ready_to_bill")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.values(unbilledByCustomer).map((group) => (
                <Button
                  key={group.customerId}
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer gap-2"
                  onClick={() => handleBillCustomer(group.customerId)}
                >
                  <FileText className="w-3 h-3" />
                  {group.name} ({group.count}) — {group.total.toFixed(2)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter & Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("billable.all_expenses")}</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-[160px] cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">{t("common.all")}</SelectItem>
                <SelectItem value="unbilled" className="cursor-pointer">{t("billable.unbilled")}</SelectItem>
                <SelectItem value="billed" className="cursor-pointer">{t("billable.billed")}</SelectItem>
                <SelectItem value="paid" className="cursor-pointer">{t("billable.paid")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!expenses ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
                <EmptyTitle>{t("billable.no_expenses")}</EmptyTitle>
                <EmptyDescription>{t("billable.no_expenses_desc")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreateDialog(true)} className="cursor-pointer">
                  {t("billable.new_expense")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("billable.description")}</TableHead>
                    <TableHead>{t("billable.customer")}</TableHead>
                    <TableHead>{t("billable.project")}</TableHead>
                    <TableHead className="text-right">{t("billable.cost")}</TableHead>
                    <TableHead className="text-right">{t("billable.markup_percent")}</TableHead>
                    <TableHead className="text-right">{t("billable.billed_amount")}</TableHead>
                    <TableHead>{t("billable.date")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense._id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {expense.description}
                      </TableCell>
                      <TableCell>{expense.customerName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {expense.projectName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {expense.amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {expense.markup > 0 ? `${expense.markup}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {expense.billedAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm">{expense.date}</TableCell>
                      <TableCell>{statusBadge(expense.status)}</TableCell>
                      <TableCell>
                        {expense.status === "unbilled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="cursor-pointer text-destructive hover:text-destructive"
                            onClick={() => handleDelete(expense._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateBillableDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
      <BillToInvoiceDialog
        open={showBillDialog}
        onClose={() => { setShowBillDialog(false); setSelectedCustomerForBilling(null); }}
        customerId={selectedCustomerForBilling}
      />
    </div>
  );
}
