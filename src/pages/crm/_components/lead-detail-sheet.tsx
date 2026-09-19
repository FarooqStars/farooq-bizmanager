import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Phone, Mail, Building2, DollarSign, Calendar, UserPlus, Trash2, CheckCircle, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { ConvexError } from "convex/values";
import { STAGES, StageBadge } from "./stage-badge.tsx";
import { useCurrency } from "@/hooks/use-currency.ts";
import type { LeadStage } from "./stage-badge.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "task", "follow_up"] as const;

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
  meeting: <Calendar className="w-3.5 h-3.5" />,
  note: <MessageSquare className="w-3.5 h-3.5" />,
  task: <CheckCircle className="w-3.5 h-3.5" />,
  follow_up: <Clock className="w-3.5 h-3.5" />,
};

type LeadDetailSheetProps = {
  leadId: Id<"leads"> | null;
  onClose: () => void;
};

export default function LeadDetailSheet({ leadId, onClose }: LeadDetailSheetProps) {
  const { t } = useTranslation();
  const { fmt } = useCurrency();
  const lead = useQuery(api.crm.getLead, leadId ? { id: leadId } : "skip");
  const updateStage = useMutation(api.crm.updateLeadStage);
  const convertLead = useMutation(api.crm.convertLeadToCustomer);
  const deleteLead = useMutation(api.crm.deleteLead);
  const createActivity = useMutation(api.crm.createActivity);
  const completeActivity = useMutation(api.crm.completeActivity);

  const [actTitle, setActTitle] = useState("");
  const [actType, setActType] = useState<typeof ACTIVITY_TYPES[number]>("call");
  const [actDate, setActDate] = useState("");

  const handleStageChange = async (stage: LeadStage) => {
    if (!leadId) return;
    try {
      await updateStage({ id: leadId, stage });
      toast.success(t("crm.stageUpdated"));
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    }
  };

  const handleConvert = async () => {
    if (!leadId) return;
    try {
      await convertLead({ id: leadId });
      toast.success(t("crm.leadConverted"));
      onClose();
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!leadId) return;
    try {
      await deleteLead({ id: leadId });
      toast.success(t("crm.leadDeleted"));
      onClose();
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    }
  };

  const handleAddActivity = async () => {
    if (!leadId || !actTitle.trim()) return;
    try {
      await createActivity({
        leadId,
        type: actType,
        title: actTitle.trim(),
        date: actDate || new Date().toISOString(),
        dueDate: actDate || undefined,
      });
      toast.success(t("crm.activityAdded"));
      setActTitle(""); setActDate("");
    } catch (err) {
      const msg = err instanceof ConvexError ? (err.data as { message: string }).message : t("crm.error");
      toast.error(msg);
    }
  };

  return (
    <Sheet open={leadId !== null} onOpenChange={() => onClose()}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{lead?.name ?? t("crm.leadDetails")}</SheetTitle>
        </SheetHeader>

        {lead === undefined ? (
          <div className="space-y-4 p-4"><Skeleton className="h-6 w-full" /><Skeleton className="h-32 w-full" /></div>
        ) : (
          <div className="space-y-6 p-4">
            {/* Lead Info */}
            <div className="space-y-2">
              {lead.company && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.company}</span>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.dealValue != null && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold">{fmt(lead.dealValue)}</span>
                </div>
              )}
              {lead.assignedUserName && (
                <p className="text-xs text-muted-foreground">{t("crm.assignedTo")}: {lead.assignedUserName}</p>
              )}
            </div>

            {/* Stage Selector */}
            <div>
              <Label className="mb-2 block">{t("crm.stage")}</Label>
              <Select value={lead.stage} onValueChange={(v) => handleStageChange(v as LeadStage)}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s} className="cursor-pointer">{t(`crm.stages.${s}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={handleConvert} className="cursor-pointer" disabled={lead.stage === "won"}>
                <UserPlus className="w-4 h-4 mr-1" />{t("crm.convertToCustomer")}
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} className="cursor-pointer">
                <Trash2 className="w-4 h-4 mr-1" />{t("crm.delete")}
              </Button>
            </div>

            {/* Add Activity */}
            <div className="border rounded-lg p-3 space-y-3">
              <p className="font-medium text-sm">{t("crm.addActivity")}</p>
              <div className="flex gap-2">
                <Select value={actType} onValueChange={(v) => setActType(v as typeof actType)}>
                  <SelectTrigger className="w-28 cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((at) => (
                      <SelectItem key={at} value={at} className="cursor-pointer">{t(`crm.activityTypes.${at}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={actTitle} onChange={(e) => setActTitle(e.target.value)} placeholder={t("crm.activityTitle")} className="flex-1" />
              </div>
              <div className="flex gap-2">
                <Input type="datetime-local" value={actDate} onChange={(e) => setActDate(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={handleAddActivity} disabled={!actTitle.trim()} className="cursor-pointer">{t("crm.add")}</Button>
              </div>
            </div>

            {/* Activities List */}
            <div>
              <p className="font-medium text-sm mb-2">{t("crm.activities")} ({lead.activities.length})</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {lead.activities.map((act) => (
                  <div key={act._id} className={cn("flex items-center gap-2 rounded-md border p-2 text-sm", act.isCompleted && "opacity-50")}>
                    <div className="p-1.5 rounded bg-muted">{ACTIVITY_ICONS[act.type] ?? <Clock className="w-3.5 h-3.5" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("truncate", act.isCompleted && "line-through")}>{act.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(act.date).toLocaleDateString()}</p>
                    </div>
                    {!act.isCompleted && (
                      <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => completeActivity({ id: act._id })}>
                        <CheckCircle className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
