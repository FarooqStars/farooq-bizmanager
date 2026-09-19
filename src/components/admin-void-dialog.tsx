import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

const MIN_REASON_LENGTH = 10;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description: string;
  confirmLabel?: string;
};

/**
 * Reusable owner-only confirmation dialog for reverse-and-repost admin actions
 * (voiding or correcting posted financial documents). Requires a written reason
 * of at least 10 characters, which is stored in the audit trail.
 */
export default function AdminVoidDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmed = reason.trim();
  const isValid = trimmed.length >= MIN_REASON_LENGTH;

  const handleClose = () => {
    if (submitting) return;
    setReason("");
    onClose();
  };

  const handleConfirm = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      setReason("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
          <p className="text-destructive">
            Owner action — this will reverse the related ledger entries. The original
            record is kept and marked void for the audit trail.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="admin-void-reason">Reason (required)</Label>
          <Textarea
            id="admin-void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this correction is being made..."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {trimmed.length < MIN_REASON_LENGTH
              ? `At least ${MIN_REASON_LENGTH} characters required.`
              : "\u00A0"}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={submitting} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="cursor-pointer"
          >
            {submitting ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
