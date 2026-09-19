import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type BillToInvoiceDialogProps = {
  open: boolean;
  onClose: () => void;
  customerId: Id<"customers"> | null;
};

export default function BillToInvoiceDialog({ open, onClose, customerId }: BillToInvoiceDialogProps) {
  const { t } = useTranslation();
  const billToInvoice = useMutation(api.billableExpenses.billToInvoice);

  const unbilledExpenses = useQuery(
    api.billableExpenses.getUnbilledByCustomer,
    customerId ? { customerId } : "skip"
  );

  // Get customer's invoices (draft/sent only)
  const invoices = useQuery(
    api.invoicing.listInvoices,
    customerId ? { customerId } : "skip"
  );
  const customerInvoices = invoices?.filter(
    (inv) => inv.status === "draft" || inv.status === "sent"
  );

  const [selectedExpenses, setSelectedExpenses] = useState<Id<"billableExpenses">[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleExpense = (id: Id<"billableExpenses">) => {
    setSelectedExpenses((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (!unbilledExpenses) return;
    if (selectedExpenses.length === unbilledExpenses.length) {
      setSelectedExpenses([]);
    } else {
      setSelectedExpenses(unbilledExpenses.map((e) => e._id));
    }
  };

  const totalSelected = unbilledExpenses
    ?.filter((e) => selectedExpenses.includes(e._id))
    .reduce((sum, e) => sum + e.billedAmount, 0) ?? 0;

  const handleSubmit = async () => {
    if (selectedExpenses.length === 0 || !selectedInvoice) {
      toast.error(t("billable.select_expenses_invoice"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await billToInvoice({
        expenseIds: selectedExpenses,
        invoiceId: selectedInvoice as Id<"invoices">,
      });
      toast.success(
        t("billable.billed_success", {
          count: result.itemsAdded,
          total: result.totalAdded.toFixed(2),
        })
      );
      setSelectedExpenses([]);
      setSelectedInvoice("");
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to bill";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("billable.bill_to_invoice")}</DialogTitle>
        </DialogHeader>

        {!customerId ? (
          <p className="text-sm text-muted-foreground">{t("billable.select_customer_first")}</p>
        ) : (
          <div className="space-y-4">
            {/* Invoice selection */}
            <div>
              <label className="text-sm font-medium">{t("billable.target_invoice")}</label>
              <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
                <SelectTrigger className="cursor-pointer mt-1">
                  <SelectValue placeholder={t("billable.select_invoice")} />
                </SelectTrigger>
                <SelectContent>
                  {customerInvoices?.map((inv) => (
                    <SelectItem key={inv._id} value={inv._id} className="cursor-pointer">
                      {inv.invoiceNumber} — {inv.status} ({inv.totalAmount.toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expense selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">
                  {t("billable.select_expenses")} ({unbilledExpenses?.length ?? 0})
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  className="cursor-pointer text-xs"
                >
                  {selectedExpenses.length === (unbilledExpenses?.length ?? 0)
                    ? t("common.deselect_all")
                    : t("common.select_all")}
                </Button>
              </div>

              <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
                {unbilledExpenses?.length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    {t("billable.no_unbilled")}
                  </p>
                )}
                {unbilledExpenses?.map((expense) => (
                  <div
                    key={expense._id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleExpense(expense._id)}
                  >
                    <Checkbox
                      checked={selectedExpenses.includes(expense._id)}
                      onCheckedChange={() => toggleExpense(expense._id)}
                      className="cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{expense.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.date} {expense.projectName && `• ${expense.projectName}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{expense.billedAmount.toFixed(2)}</p>
                      {expense.markup > 0 && (
                        <p className="text-xs text-muted-foreground">
                          +{expense.markup}% markup
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="text-sm font-medium">
                {t("billable.selected_total")} ({selectedExpenses.length} {t("billable.items")})
              </span>
              <span className="text-lg font-bold">{totalSelected.toFixed(2)}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || selectedExpenses.length === 0 || !selectedInvoice}
                className="cursor-pointer"
              >
                {submitting ? t("common.saving") : t("billable.add_to_invoice")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
