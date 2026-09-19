import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Badge } from "@/components/ui/badge.tsx";

const methodColors: Record<string, string> = {
  cash: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  credit_card: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  bank_transfer: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  cheque: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

export default function PaymentsView({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const payments = useQuery(api.customerPortal.getCustomerPaymentHistory, { customerId });

  if (payments === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CreditCard /></EmptyMedia>
          <EmptyTitle>{t("portal.payments.empty")}</EmptyTitle>
          <EmptyDescription>{t("portal.payments.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">{t("portal.payments.totalPaid")}</p>
        <p className="text-2xl font-bold">QAR {totalPaid.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{t("portal.payments.count", { count: payments.length })}</p>
      </div>

      {/* Payment list */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t("portal.payments.date")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("portal.payments.invoice")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("portal.payments.method")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("portal.payments.reference")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("portal.payments.amount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.map((p) => (
              <tr key={p._id} className="hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(p.date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 font-medium">{p.invoiceNumber}</td>
                <td className="px-4 py-3">
                  <Badge className={methodColors[p.method] ?? "bg-muted text-muted-foreground"}>
                    {p.method.replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.reference ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-green-600">
                  QAR {p.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
