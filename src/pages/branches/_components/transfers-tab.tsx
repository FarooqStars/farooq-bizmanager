import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  ArrowRightLeft,
  Plus,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import TransferDialog from "./transfer-dialog.tsx";

const statusConfig = {
  draft: { label: "Draft", icon: Clock, color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  in_transit: { label: "In Transit", icon: Truck, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  received: { label: "Received", icon: CheckCircle, color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
} as const;

export default function TransfersTab() {
  const { t } = useTranslation();
  const transfers = useQuery(api.branches.listTransfers, {});
  const shipTransfer = useMutation(api.branches.shipTransfer);
  const receiveTransfer = useMutation(api.branches.receiveTransfer);
  const cancelTransfer = useMutation(api.branches.cancelTransfer);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (transfers === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const handleShip = async (id: Id<"branchTransfers">) => {
    try {
      await shipTransfer({ transferId: id });
      toast.success(t("branches.transfers.shipped"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("branches.transfers.shipFailed");
      toast.error(msg);
    }
  };

  const handleReceive = async (id: Id<"branchTransfers">) => {
    try {
      await receiveTransfer({ transferId: id });
      toast.success(t("branches.transfers.received"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("branches.transfers.receiveFailed");
      toast.error(msg);
    }
  };

  const handleCancel = async (id: Id<"branchTransfers">) => {
    try {
      await cancelTransfer({ transferId: id });
      toast.success(t("branches.transfers.cancelled"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("branches.transfers.cancelFailed");
      toast.error(msg);
    }
  };

  if (transfers.length === 0) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ArrowRightLeft /></EmptyMedia>
            <EmptyTitle>{t("branches.transfers.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("branches.transfers.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 size-4" /> {t("branches.transfers.create")}
            </Button>
          </EmptyContent>
        </Empty>
        <TransferDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("branches.transfers.total", { count: transfers.length })}
        </p>
        <Button size="sm" className="cursor-pointer" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 size-4" /> {t("branches.transfers.create")}
        </Button>
      </div>

      <div className="space-y-3">
        {transfers.map((transfer) => {
          const config = statusConfig[transfer.status];
          const StatusIcon = config.icon;
          return (
            <Card key={transfer._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{transfer.transferNumber}</CardTitle>
                    <Badge className={`gap-1 text-xs ${config.color}`}>
                      <StatusIcon className="size-3" />
                      {t(`branches.transfers.status.${transfer.status}`)}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    {transfer.status === "draft" && (
                      <>
                        <Button size="sm" variant="secondary" className="h-7 cursor-pointer text-xs" onClick={() => handleShip(transfer._id)}>
                          <Truck className="mr-1 size-3" /> {t("branches.transfers.ship")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 cursor-pointer text-xs text-destructive" onClick={() => handleCancel(transfer._id)}>
                          {t("common.cancel")}
                        </Button>
                      </>
                    )}
                    {transfer.status === "in_transit" && (
                      <>
                        <Button size="sm" className="h-7 cursor-pointer text-xs" onClick={() => handleReceive(transfer._id)}>
                          <CheckCircle className="mr-1 size-3" /> {t("branches.transfers.receive")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 cursor-pointer text-xs text-destructive" onClick={() => handleCancel(transfer._id)}>
                          {t("common.cancel")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{transfer.fromBranchName}</span>
                  <span className="text-xs text-muted-foreground">({transfer.fromWarehouseName})</span>
                  <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{transfer.toBranchName}</span>
                  <span className="text-xs text-muted-foreground">({transfer.toWarehouseName})</span>
                </div>
                {transfer.shippedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("branches.transfers.shippedAt")}: {new Date(transfer.shippedAt).toLocaleDateString()}
                  </p>
                )}
                {transfer.receivedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("branches.transfers.receivedAt")}: {new Date(transfer.receivedAt).toLocaleDateString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TransferDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
