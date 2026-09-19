import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { FileText, Eye, ChevronLeft, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";

const statusColors: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function InvoicesView({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const invoices = useQuery(api.customerPortal.getCustomerInvoices, { customerId });
  const [selectedInvoice, setSelectedInvoice] = useState<Id<"invoices"> | null>(null);

  if (invoices === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (selectedInvoice) {
    return (
      <InvoiceDetail
        invoiceId={selectedInvoice}
        customerId={customerId}
        onBack={() => setSelectedInvoice(null)}
      />
    );
  }

  if (invoices.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileText /></EmptyMedia>
          <EmptyTitle>{t("portal.invoices.empty")}</EmptyTitle>
          <EmptyDescription>{t("portal.invoices.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <Card key={inv._id} className="cursor-pointer transition-colors hover:bg-muted/30" onClick={() => setSelectedInvoice(inv._id)}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <FileText className="size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{inv.invoiceNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {t("portal.invoices.issued")}: {new Date(inv.date).toLocaleDateString()} | {t("portal.invoices.due")}: {new Date(inv.dueDate).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-semibold">{inv.currency ?? "QAR"} {inv.totalAmount.toLocaleString()}</p>
                {inv.amountPaid > 0 && inv.amountPaid < inv.totalAmount && (
                  <p className="text-xs text-muted-foreground">
                    {t("portal.invoices.paid")}: {inv.currency ?? "QAR"} {inv.amountPaid.toLocaleString()}
                  </p>
                )}
              </div>
              <Badge className={statusColors[inv.status] ?? "bg-muted text-muted-foreground"}>
                {t(`portal.invoices.status.${inv.status}`)}
              </Badge>
              <Eye className="size-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InvoiceDetail({
  invoiceId,
  customerId,
  onBack,
}: {
  invoiceId: Id<"invoices">;
  customerId: Id<"customers">;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const detail = useQuery(api.customerPortal.getCustomerInvoiceDetail, { invoiceId, customerId });

  if (detail === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!detail) {
    return <p className="text-muted-foreground">{t("portal.invoices.notFound")}</p>;
  }

  const balanceDue = detail.totalAmount - detail.amountPaid - (detail.amountWrittenOff ?? 0);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5" onClick={onBack}>
        <ChevronLeft className="size-4" /> {t("portal.back")}
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("portal.invoices.invoice")} {detail.invoiceNumber}</CardTitle>
            <Badge className={statusColors[detail.status] ?? ""}>
              {t(`portal.invoices.status.${detail.status}`)}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2 text-sm text-muted-foreground sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-foreground">{t("portal.invoices.issued")}</p>
              <p>{new Date(detail.date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{t("portal.invoices.due")}</p>
              <p>{new Date(detail.dueDate).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{t("portal.invoices.total")}</p>
              <p className="font-semibold text-foreground">{detail.currency ?? "QAR"} {detail.totalAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">{t("portal.invoices.balance")}</p>
              <p className={`font-semibold ${balanceDue > 0 ? "text-destructive" : "text-green-600"}`}>
                {detail.currency ?? "QAR"} {balanceDue.toLocaleString()}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Items table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("portal.invoices.description")}</th>
                  <th className="px-4 py-2 text-center font-medium">{t("portal.invoices.qty")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("portal.invoices.unitPrice")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("portal.invoices.subtotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{item.description}</td>
                    <td className="px-4 py-2 text-center">{item.quantity}</td>
                    <td className="px-4 py-2 text-right">{item.unitPrice.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-medium">{item.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right font-medium">{t("portal.invoices.subtotal")}</td>
                  <td className="px-4 py-2 text-right">{detail.subtotal.toLocaleString()}</td>
                </tr>
                {detail.taxAmount && detail.taxAmount > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                      {t("portal.invoices.tax")} ({detail.taxRate}%)
                    </td>
                    <td className="px-4 py-2 text-right">{detail.taxAmount.toLocaleString()}</td>
                  </tr>
                )}
                {detail.discount && detail.discount > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">{t("portal.invoices.discount")}</td>
                    <td className="px-4 py-2 text-right text-green-600">-{detail.discount.toLocaleString()}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right">{t("portal.invoices.total")}</td>
                  <td className="px-4 py-2 text-right">{detail.currency ?? "QAR"} {detail.totalAmount.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Payment history */}
          {detail.payments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("portal.invoices.paymentHistory")}</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">{t("portal.invoices.payDate")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("portal.invoices.method")}</th>
                      <th className="px-4 py-2 text-left font-medium">{t("portal.invoices.reference")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("portal.invoices.amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.payments.map((p, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{new Date(p.date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 capitalize">{p.method.replace(/_/g, " ")}</td>
                        <td className="px-4 py-2 text-muted-foreground">{p.reference ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-medium text-green-600">{p.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {detail.notes && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t("portal.invoices.notes")}</p>
              <p className="mt-1 text-sm">{detail.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
