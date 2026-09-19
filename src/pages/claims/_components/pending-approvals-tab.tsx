import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Check, X, Clock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function PendingApprovalsTab() {
  const { t } = useTranslation();
  const claims = useQuery(api.claims.listClaims, { view: "pending" });
  const approveClaim = useMutation(api.claims.approveClaim);
  const rejectClaim = useMutation(api.claims.rejectClaim);

  const [actionDialog, setActionDialog] = useState<{
    claimId: Id<"expenseClaims">;
    action: "approve" | "reject";
    title: string;
  } | null>(null);
  const [comments, setComments] = useState("");
  const [processing, setProcessing] = useState(false);

  if (!claims) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const handleAction = async () => {
    if (!actionDialog) return;
    setProcessing(true);
    try {
      if (actionDialog.action === "approve") {
        await approveClaim({ id: actionDialog.claimId, comments: comments || undefined });
        toast.success(t("claims.approved_success"));
      } else {
        await rejectClaim({ id: actionDialog.claimId, comments: comments || undefined });
        toast.success(t("claims.rejected_success"));
      }
      setActionDialog(null);
      setComments("");
    } catch {
      toast.error(t("claims.action_error"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {claims.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Clock /></EmptyMedia>
            <EmptyTitle>{t("claims.no_pending")}</EmptyTitle>
            <EmptyDescription>{t("claims.no_pending_desc")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {claims.map((claim) => (
            <Card key={claim._id}>
              <CardContent className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">{claim.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {claim.claimNumber} &bull; {t("claims.by")} {claim.submitterName} &bull; {claim.date}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {claim.categoryName}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">{claim.amount.toLocaleString()}</span>
                    <Badge variant="secondary">
                      {t(`claims.status_${claim.status}`)}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="cursor-pointer text-destructive"
                    onClick={() => setActionDialog({ claimId: claim._id, action: "reject", title: claim.title })}
                  >
                    <X className="w-4 h-4 mr-1" />{t("claims.reject")}
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setActionDialog({ claimId: claim._id, action: "approve", title: claim.title })}
                  >
                    <Check className="w-4 h-4 mr-1" />{t("claims.approve")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approval/Rejection Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) setActionDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === "approve" ? t("claims.approve_title") : t("claims.reject_title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {actionDialog?.title}
          </p>
          <div>
            <Label className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />{t("claims.comments")}
            </Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={t("claims.comments_placeholder")}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setActionDialog(null)} className="cursor-pointer">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              className="cursor-pointer"
              variant={actionDialog?.action === "reject" ? "destructive" : "default"}
            >
              {actionDialog?.action === "approve" ? t("claims.confirm_approve") : t("claims.confirm_reject")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
