import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function RecordPaymentDialog({ id, onClose }: { id: Id<"statementCharges">; onClose: () => void }) {
  const { t } = useTranslation();
  const charge = useQuery(api.statementCharges.getById, { id });
  const recordPayment = useMutation(api.statementCharges.recordPayment);

  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const outstanding = charge ? charge.totalAmount - charge.amountPaid : 0;

  const handleSubmit = async () => {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      toast.error(t("statementCharges.invalid_amount"));
      return;
    }
    if (payAmount > outstanding + 0.01) {
      toast.error(t("statementCharges.exceeds_balance"));
      return;
    }

    setSaving(true);
    try {
      await recordPayment({ id, amount: payAmount });
      toast.success(t("statementCharges.payment_recorded"));
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("statementCharges.record_payment")}</DialogTitle>
        </DialogHeader>

        {charge && (
          <div className="space-y-4">
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">{t("statementCharges.charge_number")}:</span> {charge.chargeNumber}</p>
              <p><span className="text-muted-foreground">{t("statementCharges.customer")}:</span> {charge.customerName}</p>
              <p><span className="text-muted-foreground">{t("statementCharges.total")}:</span> ${charge.totalAmount.toFixed(2)}</p>
              <p><span className="text-muted-foreground">{t("statementCharges.outstanding")}:</span> <span className="font-bold text-red-600">${outstanding.toFixed(2)}</span></p>
            </div>

            <div className="space-y-2">
              <Label>{t("statementCharges.payment_amount")}</Label>
              <Input
                type="number"
                placeholder={outstanding.toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={0.01}
                max={outstanding}
                step="0.01"
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAmount(outstanding.toFixed(2))}
              className="cursor-pointer text-xs"
            >
              {t("statementCharges.pay_full")}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? t("common.saving") : t("statementCharges.record_payment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
