import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bell, Mail, Package, DollarSign, ClipboardCheck, UserPlus, AlertTriangle, Check, X, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";

const ALERT_TYPES = [
  { type: "overdue_invoice", icon: Bell, configType: "triggerDays" as const },
  { type: "low_stock", icon: Package, configType: "threshold" as const },
  { type: "payment_received", icon: DollarSign, configType: null },
  { type: "po_approval", icon: ClipboardCheck, configType: null },
  { type: "expense_claim_update", icon: Mail, configType: null },
  { type: "lead_follow_up", icon: UserPlus, configType: null },
] as const;

type AlertType = (typeof ALERT_TYPES)[number]["type"];

function AlertSettingsContent() {
  const { t } = useTranslation();
  const settings = useQuery(api.alerts.getAlertSettings, {});
  const alertLog = useQuery(api.alerts.getAlertLog, { limit: 20 });
  const upsertSetting = useMutation(api.alerts.upsertAlertSetting);
  const seedDefaults = useMutation(api.alerts.seedDefaultAlertSettings);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (settings && settings.length === 0 && !seeded) {
      setSeeded(true);
      seedDefaults({});
    }
  }, [settings, seeded, seedDefaults]);

  if (settings === undefined || alertLog === undefined) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const getSettingForType = (type: AlertType) =>
    settings.find((s) => s.type === type);

  const handleToggle = async (type: AlertType, isEnabled: boolean) => {
    try {
      await upsertSetting({ type, isEnabled });
      toast.success(t("alerts.settingUpdated"));
    } catch {
      toast.error(t("alerts.updateFailed"));
    }
  };

  const handleFieldUpdate = async (
    type: AlertType,
    field: "senderEmail" | "triggerDays" | "thresholdOverride",
    value: string | number,
  ) => {
    const setting = getSettingForType(type);
    const currentDays = setting?.triggerDays ?? [];
    try {
      await upsertSetting({
        type,
        isEnabled: setting?.isEnabled ?? false,
        ...(field === "senderEmail" && { senderEmail: value as string }),
        ...(field === "triggerDays" && {
          triggerDays: currentDays.includes(value as number)
            ? currentDays.filter((d) => d !== value)
            : [...currentDays, value as number],
        }),
        ...(field === "thresholdOverride" && { thresholdOverride: value as number }),
      });
      toast.success(t("alerts.settingUpdated"));
    } catch {
      toast.error(t("alerts.updateFailed"));
    }
  };

  return (
    <div className="space-y-8">
      {/* Info callout */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
        <Info className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          {t("alerts.verifyEmailNote")}
        </p>
      </div>

      {/* Alert type cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ALERT_TYPES.map(({ type, icon: Icon, configType }) => {
          const setting = getSettingForType(type);
          const isEnabled = setting?.isEnabled ?? false;

          return (
            <Card key={type}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{t(`alerts.types.${type}.name`)}</CardTitle>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(type, checked)}
                  />
                </div>
                <CardDescription className="text-xs">
                  {t(`alerts.types.${type}.description`)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("alerts.senderEmail")}</Label>
                  <Input
                    placeholder="alerts@company.com"
                    defaultValue={setting?.senderEmail ?? ""}
                    onBlur={(e) => handleFieldUpdate(type, "senderEmail", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                {configType === "triggerDays" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("alerts.triggerDays")}</Label>
                    <div className="flex gap-1">
                      {[1, 7, 30].map((day) => (
                        <Button
                          key={day}
                          size="sm"
                          variant={setting?.triggerDays?.includes(day) ? "default" : "secondary"}
                          className="h-7 cursor-pointer px-2 text-xs"
                          onClick={() => handleFieldUpdate(type, "triggerDays", day)}
                        >
                          {t("alerts.daysAfterDue", { count: day })}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {configType === "threshold" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("alerts.threshold")}</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="10"
                      defaultValue={setting?.thresholdOverride ?? ""}
                      onBlur={(e) =>
                        handleFieldUpdate(type, "thresholdOverride", Number(e.target.value))
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Alert History */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("alerts.history.title")}</h2>
        {alertLog.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Bell /></EmptyMedia>
              <EmptyTitle>{t("alerts.history.empty")}</EmptyTitle>
              <EmptyDescription>{t("alerts.history.emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("alerts.history.type")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("alerts.history.recipient")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("alerts.history.subject")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("alerts.history.status")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("alerts.history.sentAt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {alertLog.map((log) => (
                  <tr key={log._id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">
                      {t(`alerts.types.${log.alertType}.name`)}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2">{log.recipientEmail}</td>
                    <td className="max-w-[200px] truncate px-3 py-2">{log.subject}</td>
                    <td className="px-3 py-2">
                      {log.status === "sent" ? (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" /> {t("alerts.history.sent")}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <X className="size-3" /> {t("alerts.history.failed")}
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AlertsPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">{t("alerts.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("alerts.subtitle")}</p>
      </header>

      <AuthLoading>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex flex-col items-center gap-4 py-12">
          <AlertTriangle className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t("alerts.signInRequired")}</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <AlertSettingsContent />
      </Authenticated>
    </div>
  );
}
