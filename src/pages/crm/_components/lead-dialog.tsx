import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { ConvexError } from "convex/values";
import { toast } from "sonner";

const SOURCES = ["website", "referral", "cold_call", "social_media", "trade_show", "email_campaign", "other"] as const;

type LeadDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function LeadDialog({ open, onClose }: LeadDialogProps) {
  const { t } = useTranslation();
  const createLead = useMutation(api.crm.createLead);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<typeof SOURCES[number]>("website");
  const [dealValue, setDealValue] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("crm.nameRequired"));
      return;
    }
    setLoading(true);
    try {
      await createLead({
        name: name.trim(),
        company: company.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        source,
        dealValue: dealValue ? Number(dealValue) : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(t("crm.leadCreated"));
      resetAndClose();
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setName(""); setCompany(""); setEmail(""); setPhone("");
    setSource("website"); setDealValue(""); setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("crm.newLead")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{t("crm.name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("crm.company")}</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc" />
            </div>
            <div>
              <Label>{t("crm.dealValue")}</Label>
              <Input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="10000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("crm.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@acme.com" />
            </div>
            <div>
              <Label>{t("crm.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0123" />
            </div>
          </div>
          <div>
            <Label>{t("crm.source")}</Label>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="cursor-pointer">{t(`crm.sources.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("crm.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("crm.notesPlaceholder")} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={resetAndClose} className="cursor-pointer">{t("crm.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading} className="cursor-pointer">{t("crm.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
