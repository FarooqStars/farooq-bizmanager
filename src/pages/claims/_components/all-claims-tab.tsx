import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { CheckCircle, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { toast } from "sonner";

function getStatusVariant(status: string): "default" | "secondary" | "destructive" {
  switch (status) {
    case "approved":
    case "reimbursed":
      return "default";
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}

export default function AllClaimsTab() {
  const { t } = useTranslation();
  const claims = useQuery(api.claims.listClaims, { view: "all" });
  const markReimbursed = useMutation(api.claims.markReimbursed);

  if (!claims) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><CheckCircle /></EmptyMedia>
          <EmptyTitle>{t("claims.no_claims_all")}</EmptyTitle>
          <EmptyDescription>{t("claims.no_claims_all_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3">
      {claims.map((claim) => (
        <Card key={claim._id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="space-y-1">
              <div className="font-medium">{claim.title}</div>
              <div className="text-sm text-muted-foreground">
                {claim.claimNumber} &bull; {t("claims.by")} {claim.submitterName} &bull; {claim.date}
              </div>
              <div className="text-xs text-muted-foreground">{claim.categoryName}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{claim.amount.toLocaleString()}</span>
              <Badge variant={getStatusVariant(claim.status)}>
                {t(`claims.status_${claim.status}`)}
              </Badge>
              {claim.status === "approved" && (
                <Button
                  size="sm"
                  className="cursor-pointer"
                  onClick={async () => {
                    try {
                      await markReimbursed({ id: claim._id });
                      toast.success(t("claims.reimbursed_success"));
                    } catch {
                      toast.error(t("claims.action_error"));
                    }
                  }}
                >
                  <Banknote className="w-4 h-4 mr-1" />{t("claims.mark_reimbursed")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
