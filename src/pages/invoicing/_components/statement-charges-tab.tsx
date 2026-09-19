import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Plus, Search, DollarSign, Clock, CheckCircle2, Ban, MoreHorizontal, Eye, CreditCard, XCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/use-currency.ts";
import CreateStatementChargeDialog from "./create-statement-charge-dialog.tsx";
import ViewStatementChargeDialog from "./view-statement-charge-dialog.tsx";
import RecordPaymentDialog from "./record-payment-dialog.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function StatementChargesTab() {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const charges = useQuery(api.statementCharges.list, {});
  const summary = useQuery(api.statementCharges.getSummary, {});
  const voidCharge = useMutation(api.statementCharges.voidCharge);
  const removeCharge = useMutation(api.statementCharges.remove);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<Id<"statementCharges"> | null>(null);
  const [payId, setPayId] = useState<Id<"statementCharges"> | null>(null);

  const filtered = charges?.filter((c) =>
    c.chargeNumber.toLowerCase().includes(search.toLowerCase()) ||
    c.customerName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleVoid = async (id: Id<"statementCharges">) => {
    try {
      await voidCharge({ id });
      toast.success(t("statementCharges.voided"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: Id<"statementCharges">) => {
    try {
      await removeCharge({ id });
      toast.success(t("statementCharges.deleted"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"><Clock className="w-3 h-3 mr-1" />{t("statementCharges.status_pending")}</Badge>;
      case "paid":
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />{t("statementCharges.status_paid")}</Badge>;
      case "partially_paid":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"><DollarSign className="w-3 h-3 mr-1" />{t("statementCharges.status_partial")}</Badge>;
      case "void":
        return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"><Ban className="w-3 h-3 mr-1" />{t("statementCharges.status_void")}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (!charges || !summary) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("statementCharges.total_charges")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalCharges}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("statementCharges.pending")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{fmt(summary.pendingAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.pendingCount} {t("statementCharges.charges")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("statementCharges.outstanding")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{fmt(summary.totalOutstanding)}</p>
            <p className="text-xs text-muted-foreground">{summary.pendingCount + summary.partiallyPaidCount} {t("statementCharges.charges")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("statementCharges.collected")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{fmt(summary.paidAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.paidCount} {t("statementCharges.charges")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("statementCharges.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />{t("statementCharges.create")}
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><DollarSign /></EmptyMedia>
            <EmptyTitle>{t("statementCharges.no_charges")}</EmptyTitle>
            <EmptyDescription>{t("statementCharges.no_charges_desc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />{t("statementCharges.create")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">{t("statementCharges.charge_number")}</th>
                    <th className="text-left p-3 font-medium">{t("statementCharges.customer")}</th>
                    <th className="text-left p-3 font-medium">{t("statementCharges.date")}</th>
                    <th className="text-left p-3 font-medium">{t("statementCharges.due_date")}</th>
                    <th className="text-right p-3 font-medium">{t("statementCharges.amount")}</th>
                    <th className="text-right p-3 font-medium">{t("statementCharges.balance")}</th>
                    <th className="text-center p-3 font-medium">{t("statementCharges.status")}</th>
                    <th className="text-center p-3 font-medium">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((charge) => (
                    <tr key={charge._id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs">{charge.chargeNumber}</td>
                      <td className="p-3">{charge.customerName}</td>
                      <td className="p-3">{format(new Date(charge.date), "MMM dd, yyyy")}</td>
                      <td className="p-3">{format(new Date(charge.dueDate), "MMM dd, yyyy")}</td>
                      <td className="p-3 text-right font-medium">{fmt(charge.totalAmount)}</td>
                      <td className="p-3 text-right font-medium text-red-600">
                        {fmt(charge.totalAmount - charge.amountPaid)}
                      </td>
                      <td className="p-3 text-center">{statusBadge(charge.status)}</td>
                      <td className="p-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="cursor-pointer">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => setViewId(charge._id)}>
                              <Eye className="w-4 h-4 mr-2" />{t("common.view")}
                            </DropdownMenuItem>
                            {(charge.status === "pending" || charge.status === "partially_paid") && (
                              <DropdownMenuItem className="cursor-pointer" onClick={() => setPayId(charge._id)}>
                                <CreditCard className="w-4 h-4 mr-2" />{t("statementCharges.record_payment")}
                              </DropdownMenuItem>
                            )}
                            {charge.status !== "paid" && charge.status !== "void" && (
                              <DropdownMenuItem className="cursor-pointer text-amber-600" onClick={() => handleVoid(charge._id)}>
                                <XCircle className="w-4 h-4 mr-2" />{t("statementCharges.void")}
                              </DropdownMenuItem>
                            )}
                            {charge.status !== "paid" && (
                              <DropdownMenuItem className="cursor-pointer text-destructive" onClick={() => handleDelete(charge._id)}>
                                <Trash2 className="w-4 h-4 mr-2" />{t("common.delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CreateStatementChargeDialog open={showCreate} onOpenChange={setShowCreate} />
      {viewId && <ViewStatementChargeDialog id={viewId} onClose={() => setViewId(null)} />}
      {payId && <RecordPaymentDialog id={payId} onClose={() => setPayId(null)} />}
    </div>
  );
}
