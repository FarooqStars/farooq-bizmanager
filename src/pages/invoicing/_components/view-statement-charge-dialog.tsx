import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function ViewStatementChargeDialog({ id, onClose }: { id: Id<"statementCharges">; onClose: () => void }) {
  const { t } = useTranslation();
  const charge = useQuery(api.statementCharges.getById, { id });

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "paid": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "partially_paid": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "void": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      default: return "";
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("statementCharges.view_title")}</DialogTitle>
        </DialogHeader>

        {!charge ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header Info */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-bold">{charge.chargeNumber}</span>
              <Badge className={statusColor(charge.status)}>{charge.status.replace("_", " ")}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">{t("statementCharges.customer")}</p>
                <p className="font-medium">{charge.customerName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("statementCharges.date")}</p>
                <p className="font-medium">{format(new Date(charge.date), "MMM dd, yyyy")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("statementCharges.due_date")}</p>
                <p className="font-medium">{format(new Date(charge.dueDate), "MMM dd, yyyy")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("statementCharges.balance")}</p>
                <p className="font-medium text-red-600">${(charge.totalAmount - charge.amountPaid).toFixed(2)}</p>
              </div>
            </div>

            <Separator />

            {/* Line Items */}
            <div>
              <p className="font-medium text-sm mb-2">{t("statementCharges.line_items")}</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left pb-1">{t("statementCharges.description")}</th>
                    <th className="text-right pb-1">{t("statementCharges.qty")}</th>
                    <th className="text-right pb-1">{t("statementCharges.rate")}</th>
                    <th className="text-right pb-1">{t("statementCharges.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {charge.items.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{item.description}</td>
                      <td className="py-1 text-right">{item.quantity}</td>
                      <td className="py-1 text-right">${item.rate.toFixed(2)}</td>
                      <td className="py-1 text-right">${item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-1 text-sm text-right">
              <p>{t("statementCharges.subtotal")}: ${charge.subtotal.toFixed(2)}</p>
              {charge.taxAmount && charge.taxRate && (
                <p>{t("statementCharges.tax")} ({charge.taxRate}%): ${charge.taxAmount.toFixed(2)}</p>
              )}
              <p className="font-bold text-base">{t("statementCharges.total")}: ${charge.totalAmount.toFixed(2)}</p>
              {charge.amountPaid > 0 && (
                <p className="text-green-600">{t("statementCharges.paid_amount")}: ${charge.amountPaid.toFixed(2)}</p>
              )}
            </div>

            {charge.memo && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">{t("statementCharges.memo")}</p>
                  <p className="text-sm">{charge.memo}</p>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
