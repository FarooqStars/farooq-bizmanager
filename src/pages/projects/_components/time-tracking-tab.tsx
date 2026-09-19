import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useCurrency } from "@/hooks/use-currency.ts";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Clock, Play, Square, Plus, Send, DollarSign } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function TimeTrackingTab() {
  const { fmt } = useCurrency();
  const projects = useQuery(api.projects.listProjects, {});
  const employees = useQuery(api.payroll.listEmployees, {});
  const timeEntries = useQuery(api.projects.listTimeEntries, {});
  const createTimeEntry = useMutation(api.projects.createTimeEntry);
  const stopTimer = useMutation(api.projects.stopTimer);
  const submitTimeEntries = useMutation(api.projects.submitTimeEntries);

  const [showCreate, setShowCreate] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [activeEntryId, setActiveEntryId] = useState<Id<"timeEntries"> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [form, setForm] = useState({
    projectId: "", employeeId: "", date: new Date().toISOString().split("T")[0],
    startTime: "", endTime: "", hours: "", hourlyRate: "", description: "", billable: true,
  });

  // Timer effect
  useEffect(() => {
    if (timerRunning && timerStart) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000));
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning, timerStart]);

  // Check for running timers
  useEffect(() => {
    if (timeEntries) {
      const running = timeEntries.find((e) => e.isRunning);
      if (running) {
        setActiveEntryId(running._id);
        setTimerRunning(true);
        // Estimate start time from startTime
        const [h, m] = running.startTime.split(":").map(Number);
        const start = new Date();
        start.setHours(h, m, 0, 0);
        setTimerStart(start);
      }
    }
  }, [timeEntries]);

  if (!projects || !employees || !timeEntries) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleStartTimer = async () => {
    if (!form.projectId || !form.employeeId || !form.hourlyRate) {
      toast.error("Select project, employee, and hourly rate");
      return;
    }
    const now = new Date();
    const startTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    try {
      const id = await createTimeEntry({
        projectId: form.projectId as Id<"projects">,
        employeeId: form.employeeId as Id<"employees">,
        date: new Date().toISOString().split("T")[0],
        startTime,
        hours: 0,
        hourlyRate: parseFloat(form.hourlyRate),
        description: form.description || undefined,
        billable: form.billable,
        isRunning: true,
      });
      setActiveEntryId(id);
      setTimerRunning(true);
      setTimerStart(now);
      setElapsed(0);
      toast.success("Timer started");
    } catch {
      toast.error("Failed to start timer");
    }
  };

  const handleStopTimer = async () => {
    if (!activeEntryId) return;
    const now = new Date();
    const endTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const hours = parseFloat((elapsed / 3600).toFixed(2));

    try {
      await stopTimer({ entryId: activeEntryId, endTime, hours });
      setTimerRunning(false);
      setActiveEntryId(null);
      setElapsed(0);
      toast.success(`Timer stopped: ${hours} hours logged`);
    } catch {
      toast.error("Failed to stop timer");
    }
  };

  const handleManualEntry = async () => {
    if (!form.projectId || !form.employeeId || !form.date || !form.hours || !form.hourlyRate) {
      toast.error("All fields are required for manual entry");
      return;
    }
    try {
      await createTimeEntry({
        projectId: form.projectId as Id<"projects">,
        employeeId: form.employeeId as Id<"employees">,
        date: form.date,
        startTime: form.startTime || "09:00",
        endTime: form.endTime || undefined,
        hours: parseFloat(form.hours),
        hourlyRate: parseFloat(form.hourlyRate),
        description: form.description || undefined,
        billable: form.billable,
      });
      toast.success("Time entry created");
      setShowCreate(false);
      setForm({ ...form, startTime: "", endTime: "", hours: "", description: "", billable: true });
    } catch {
      toast.error("Failed to create time entry");
    }
  };

  const handleSubmitDrafts = async () => {
    const drafts = timeEntries.filter((e) => e.status === "draft" && !e.isRunning);
    if (drafts.length === 0) {
      toast.error("No draft entries to submit");
      return;
    }
    try {
      await submitTimeEntries({ entryIds: drafts.map((e) => e._id) });
      toast.success(`${drafts.length} entries submitted for approval`);
    } catch {
      toast.error("Failed to submit entries");
    }
  };

  const draftEntries = timeEntries.filter((e) => e.status === "draft" && !e.isRunning);
  const recentEntries = timeEntries.filter((e) => !e.isRunning).slice(0, 20);

  return (
    <div className="space-y-6">
      {/* Timer Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" /> Live Timer
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Project" /></SelectTrigger>
                  <SelectContent>
                    {projects.filter((p) => p.status === "active").map((p) => (
                      <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter((e) => e.isActive).map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Rate/hr"
                  type="number"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                />
                <Input
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Switch
                  checked={form.billable}
                  onCheckedChange={(v) => setForm({ ...form, billable: v })}
                  className="cursor-pointer"
                />
                <Label className="text-xs flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {form.billable ? "Billable" : "Non-billable"}
                </Label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-mono font-bold tabular-nums min-w-[130px] text-center">
                {formatElapsed(elapsed)}
              </div>
              {timerRunning ? (
                <Button onClick={handleStopTimer} variant="destructive" size="lg" className="cursor-pointer">
                  <Square className="w-5 h-5 mr-1" /> Stop
                </Button>
              ) : (
                <Button onClick={handleStartTimer} size="lg" className="cursor-pointer">
                  <Play className="w-5 h-5 mr-1" /> Start
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {draftEntries.length > 0 && (
            <Button variant="secondary" className="cursor-pointer" onClick={handleSubmitDrafts}>
              <Send className="w-4 h-4 mr-1" /> Submit {draftEntries.length} Drafts
            </Button>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-1" /> Manual Entry
        </Button>
      </div>

      {/* Recent Entries */}
      {recentEntries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Clock /></EmptyMedia>
            <EmptyTitle>No time entries</EmptyTitle>
            <EmptyDescription>Start the timer or add a manual entry to begin tracking time</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">Recent Time Entries</h3>
          <div className="space-y-2">
            {recentEntries.map((e) => (
              <Card key={e._id}>
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.projectName}</span>
                      {e.taskName && <span className="text-xs text-muted-foreground">/ {e.taskName}</span>}
                      <Badge className={
                        e.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                        e.status === "submitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                        e.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      }>{e.status}</Badge>
                      <Badge className={
                        e.billable
                          ? "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400"
                          : "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
                      }>
                        {e.billable ? "Billable" : "Non-billable"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.employeeName} &middot; {e.date} &middot; {e.startTime}{e.endTime ? ` - ${e.endTime}` : ""}
                      {e.description && ` &middot; ${e.description}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{e.hours.toFixed(1)}h</div>
                    <div className="text-xs text-muted-foreground">{fmt(e.totalCost)}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Manual Entry Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Manual Time Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Project *</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Employee *</Label>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                  <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter((e) => e.isActive).map((e) => <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Start Time</Label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>End Time</Label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Hours *</Label>
                <Input type="number" step="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="8" />
              </div>
              <div className="space-y-1">
                <Label>Hourly Rate *</Label>
                <Input type="number" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Work done..." />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.billable}
                onCheckedChange={(v) => setForm({ ...form, billable: v })}
                className="cursor-pointer"
              />
              <Label className="text-sm flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                {form.billable ? "Billable" : "Non-billable"}
              </Label>
            </div>
            <Button className="w-full cursor-pointer" onClick={handleManualEntry}>Add Time Entry</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
