import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
} from "@/components/ui/empty.tsx";
import {
  Calendar, Clock, Mail, FileText, Plus, Trash2,
  Play, Pause, History, BarChart3, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";

const REPORT_TYPES = [
  { value: "financial", label: "Financial" },
  { value: "sales", label: "Sales" },
  { value: "expenses", label: "Expenses" },
  { value: "inventory", label: "Inventory" },
  { value: "cashflow", label: "Cash Flow" },
  { value: "aging", label: "AR/AP Aging" },
  { value: "payroll", label: "Payroll" },
  { value: "purchasing", label: "Purchasing" },
  { value: "profitloss", label: "Profit & Loss" },
] as const;

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export default function ScheduledReportsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("schedules");
  const [showCreate, setShowCreate] = useState(false);

  const reports = useQuery(api.scheduledReports.list);
  const stats = useQuery(api.scheduledReports.getStats);
  const history = useQuery(api.scheduledReports.getAllHistory, { limit: 50 });

  const loading = reports === undefined;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6" /> {t("scheduledReports.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("scheduledReports.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> {t("scheduledReports.create")}
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">{t("scheduledReports.stats.total")}</p>
              <p className="text-xl sm:text-2xl font-bold break-words leading-tight">{stats.totalSchedules}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">{t("scheduledReports.stats.active")}</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 break-words leading-tight">{stats.activeSchedules}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">{t("scheduledReports.stats.delivered")}</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 break-words leading-tight">{stats.successCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground truncate">{t("scheduledReports.stats.failed")}</p>
              <p className="text-xl sm:text-2xl font-bold text-red-500 break-words leading-tight">{stats.failCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5" /> {t("scheduledReports.tabs.schedules")}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs">
            <History className="w-3.5 h-3.5" /> {t("scheduledReports.tabs.history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !reports || reports.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Calendar /></EmptyMedia>
                <EmptyTitle>{t("scheduledReports.empty")}</EmptyTitle>
                <EmptyDescription>{t("scheduledReports.emptyDesc")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4 mr-1" /> {t("scheduledReports.create")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <ReportCard key={report._id} report={report} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTable history={history} />
        </TabsContent>
      </Tabs>

      {/* Create sheet */}
      <CreateReportSheet open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

// ── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ report }: { report: { _id: Id<"scheduledReports">; name: string; reportType: string; frequency: string; format: string; recipients: string[]; isActive: boolean; nextRunAt?: string; lastRunAt?: string } }) {
  const { t } = useTranslation();
  const toggleActive = useMutation(api.scheduledReports.toggleActive);
  const remove = useMutation(api.scheduledReports.remove);

  const handleToggle = async () => {
    try {
      await toggleActive({ id: report._id });
      toast.success(report.isActive ? t("scheduledReports.paused") : t("scheduledReports.activated"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleDelete = async () => {
    try {
      await remove({ id: report._id });
      toast.success(t("scheduledReports.deleted"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">{report.name}</h3>
              <Badge variant={report.isActive ? "default" : "secondary"} className="text-[10px]">
                {report.isActive ? t("scheduledReports.active") : t("scheduledReports.paused")}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                {REPORT_TYPES.find((r) => r.value === report.reportType)?.label ?? report.reportType}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {report.frequency}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {report.format.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {report.recipients.length} {t("scheduledReports.recipients")}
              </span>
            </div>
            {report.nextRunAt && report.isActive && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("scheduledReports.nextRun")}: {format(new Date(report.nextRunAt), "PPp")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={handleToggle} className="cursor-pointer">
              {report.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDelete} className="text-destructive hover:text-destructive cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── History Table ────────────────────────────────────────────────────────────

function HistoryTable({ history }: { history: Array<{ _id: string; reportName: string; status: string; reportType: string; format: string; recipientCount: number; generatedAt: string; error?: string }> | undefined }) {
  const { t } = useTranslation();

  if (history === undefined) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (history.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><History /></EmptyMedia>
          <EmptyTitle>{t("scheduledReports.noHistory")}</EmptyTitle>
          <EmptyDescription>{t("scheduledReports.noHistoryDesc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-2 font-medium">{t("scheduledReports.history.report")}</th>
            <th className="text-left px-4 py-2 font-medium">{t("scheduledReports.history.status")}</th>
            <th className="text-left px-4 py-2 font-medium hidden md:table-cell">{t("scheduledReports.history.type")}</th>
            <th className="text-left px-4 py-2 font-medium hidden md:table-cell">{t("scheduledReports.history.recipients")}</th>
            <th className="text-left px-4 py-2 font-medium">{t("scheduledReports.history.date")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {history.map((h) => (
            <tr key={h._id}>
              <td className="px-4 py-2 font-medium truncate max-w-[200px]">{h.reportName}</td>
              <td className="px-4 py-2">
                <span className="flex items-center gap-1">
                  {h.status === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                  {h.status === "failed" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  {h.status === "pending" && <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                  <span className="capitalize text-xs">{h.status}</span>
                </span>
              </td>
              <td className="px-4 py-2 capitalize hidden md:table-cell text-xs">{h.reportType}</td>
              <td className="px-4 py-2 hidden md:table-cell text-xs">{h.recipientCount}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(h.generatedAt), "PP p")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Create Sheet ─────────────────────────────────────────────────────────────

function CreateReportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useMutation(api.scheduledReports.create);

  const [name, setName] = useState("");
  const [reportType, setReportType] = useState<string>("financial");
  const [frequency, setFrequency] = useState<string>("weekly");
  const [formatType, setFormatType] = useState<string>("pdf");
  const [recipients, setRecipients] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(8);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !recipients.trim()) {
      toast.error(t("scheduledReports.validation"));
      return;
    }

    const recipientList = recipients.split(",").map((r) => r.trim()).filter(Boolean);
    if (recipientList.length === 0) {
      toast.error(t("scheduledReports.validation"));
      return;
    }

    setSaving(true);
    try {
      await create({
        name: name.trim(),
        reportType: reportType as "financial" | "sales" | "expenses" | "inventory" | "cashflow" | "aging" | "payroll" | "purchasing" | "profitloss",
        frequency: frequency as "daily" | "weekly" | "monthly",
        format: formatType as "pdf" | "csv",
        recipients: recipientList,
        dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : undefined,
        hour,
      });
      toast.success(t("scheduledReports.created"));
      onClose();
      setName("");
      setRecipients("");
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("scheduledReports.createTitle")}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label>{t("scheduledReports.fields.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("scheduledReports.placeholder.name")} className="mt-1" />
          </div>

          <div>
            <Label>{t("scheduledReports.fields.reportType")}</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("scheduledReports.fields.frequency")}</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {frequency === "weekly" && (
            <div>
              <Label>{t("scheduledReports.fields.dayOfWeek")}</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === "monthly" && (
            <div>
              <Label>{t("scheduledReports.fields.dayOfMonth")}</Label>
              <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>{t("scheduledReports.fields.hour")}</Label>
            <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>{`${String(i).padStart(2, "0")}:00 UTC`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("scheduledReports.fields.format")}</Label>
            <Select value={formatType} onValueChange={setFormatType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("scheduledReports.fields.recipients")}</Label>
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder={t("scheduledReports.placeholder.recipients")}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">{t("scheduledReports.recipientsHint")}</p>
          </div>

          <Button onClick={handleSubmit} disabled={saving} className="w-full mt-4 cursor-pointer">
            {saving ? t("common.saving") : t("scheduledReports.createBtn")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
