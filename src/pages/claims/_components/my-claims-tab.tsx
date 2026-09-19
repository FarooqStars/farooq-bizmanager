import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Plus, Send, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

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

export default function MyClaimsTab() {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);
  const claims = useQuery(api.claims.listClaims, { view: "my" });
  const submitClaim = useMutation(api.claims.submitClaim);

  if (!claims) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />{t("claims.new_claim")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("claims.new_claim")}</DialogTitle>
            </DialogHeader>
            <CreateClaimForm onSuccess={() => setShowDialog(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {claims.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>{t("claims.no_claims")}</EmptyTitle>
            <EmptyDescription>{t("claims.no_claims_desc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" onClick={() => setShowDialog(true)} className="cursor-pointer">
              {t("claims.new_claim")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {claims.map((claim) => (
            <Card key={claim._id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-1">
                  <div className="font-medium">{claim.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {claim.claimNumber} &bull; {claim.date} &bull; {claim.categoryName}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{claim.amount.toLocaleString()}</span>
                  <Badge variant={getStatusVariant(claim.status)}>
                    {t(`claims.status_${claim.status}`)}
                  </Badge>
                  {claim.status === "draft" && (
                    <Button
                      size="sm"
                      className="cursor-pointer"
                      onClick={async () => {
                        try {
                          await submitClaim({ id: claim._id });
                          toast.success(t("claims.submitted_success"));
                        } catch {
                          toast.error(t("claims.submit_error"));
                        }
                      }}
                    >
                      <Send className="w-3 h-3 mr-1" />{t("claims.submit")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateClaimForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const categories = useQuery(api.vendors.listExpenseCategories, {});
  const createClaim = useMutation(api.claims.createClaim);
  const generateUploadUrl = useMutation(api.claims.generateUploadUrl);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (submitImmediately: boolean) => {
    if (!title || !amount || Number(amount) <= 0) {
      toast.error(t("claims.validation_error"));
      return;
    }

    setSaving(true);
    try {
      let receiptStorageId: Id<"_storage"> | undefined;

      // Upload receipt if provided
      if (receiptFile) {
        const uploadUrl = await generateUploadUrl({});
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": receiptFile.type },
          body: receiptFile,
        });
        const { storageId } = await result.json();
        receiptStorageId = storageId;
      }

      await createClaim({
        title,
        description: description || undefined,
        amount: Number(amount),
        categoryId: categoryId ? (categoryId as Id<"expenseCategories">) : undefined,
        date,
        notes: notes || undefined,
        receiptStorageId,
        submitImmediately,
      });

      toast.success(submitImmediately ? t("claims.submitted_success") : t("claims.created_draft"));
      onSuccess();
    } catch {
      toast.error(t("claims.save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("claims.claim_title")}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("claims.title_placeholder")} />
      </div>

      <div>
        <Label>{t("claims.description")}</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("claims.desc_placeholder")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("budget.amount")}</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <Label>{t("common.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>{t("claims.category")}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="cursor-pointer">
            <SelectValue placeholder={t("claims.select_category")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="cursor-pointer">{t("claims.no_category")}</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat._id} value={cat._id} className="cursor-pointer">{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>{t("claims.receipt")}</Label>
        <div className="border border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="receipt-upload"
          />
          <label htmlFor="receipt-upload" className="cursor-pointer flex flex-col items-center gap-2">
            <Upload className="w-6 h-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {receiptFile ? receiptFile.name : t("claims.upload_receipt")}
            </span>
          </label>
        </div>
      </div>

      <div>
        <Label>{t("common.notes")}</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("claims.notes_placeholder")} />
      </div>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => handleSubmit(false)}
          disabled={saving}
          className="flex-1 cursor-pointer"
        >
          {t("claims.save_draft")}
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={saving}
          className="flex-1 cursor-pointer"
        >
          <Send className="w-4 h-4 mr-2" />
          {saving ? t("common.saving") : t("claims.submit_claim")}
        </Button>
      </div>
    </div>
  );
}
