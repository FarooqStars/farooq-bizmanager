import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export default function WeeklyTimesheetTab() {
  const employees = useQuery(api.payroll.listEmployees, {});
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const monday = getMonday(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday.toISOString().split("T")[0];
  }, [weekOffset]);

  const timesheet = useQuery(
    api.projects.weeklyTimesheet,
    selectedEmployee ? { employeeId: selectedEmployee as Id<"employees">, weekStart } : "skip"
  );

  const weekEndDate = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  }, [weekStart]);

  if (!employees) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-[220px] cursor-pointer">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.filter((e) => e.isActive).map((e) => (
                <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium min-w-[200px] text-center">
            {formatDateShort(weekStart)} - {formatDateShort(weekEndDate)}
          </div>
          <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" className="cursor-pointer" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
        </div>
      </div>

      {!selectedEmployee ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarDays /></EmptyMedia>
            <EmptyTitle>Select an employee</EmptyTitle>
            <EmptyDescription>Choose an employee above to view their weekly timesheet</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !timesheet ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : timesheet.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Clock /></EmptyMedia>
            <EmptyTitle>No time entries this week</EmptyTitle>
            <EmptyDescription>No hours have been logged for this employee during this period</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold">{timesheet.totalHours.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">Total Hours</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold text-green-600">{timesheet.billableTotal.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">Billable</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <div className="text-2xl font-bold text-orange-600">{timesheet.nonBillableTotal.toFixed(1)}h</div>
                <div className="text-xs text-muted-foreground">Non-Billable</div>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Weekly Timesheet Grid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left px-3 py-2 min-w-[150px]">Project</th>
                      {timesheet.dates.map((date) => (
                        <th key={date} className="text-center px-2 py-2 min-w-[60px]">
                          <div className="text-xs">{formatDayName(date)}</div>
                          <div className="text-xs text-muted-foreground">{date.slice(8)}</div>
                        </th>
                      ))}
                      <th className="text-center px-3 py-2 font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timesheet.rows.map((row) => (
                      <tr key={row.projectId} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.projectName}</div>
                          <div className="flex gap-1 mt-0.5">
                            {row.billableHours > 0 && (
                              <Badge className="text-[10px] px-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                {row.billableHours.toFixed(1)}h billable
                              </Badge>
                            )}
                            {row.nonBillableHours > 0 && (
                              <Badge className="text-[10px] px-1 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                                {row.nonBillableHours.toFixed(1)}h non-billable
                              </Badge>
                            )}
                          </div>
                        </td>
                        {timesheet.dates.map((date) => (
                          <td key={date} className="text-center px-2 py-2">
                            {row.dailyHours[date] ? (
                              <span className="font-medium">{row.dailyHours[date].toFixed(1)}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        ))}
                        <td className="text-center px-3 py-2 font-bold">{row.totalHours.toFixed(1)}</td>
                      </tr>
                    ))}
                    {/* Daily Totals Row */}
                    <tr className="border-t-2 border-primary/20 bg-muted/50 font-bold">
                      <td className="px-3 py-2">Daily Total</td>
                      {timesheet.dates.map((date) => (
                        <td key={date} className="text-center px-2 py-2">
                          {timesheet.dailyTotals[date] ? timesheet.dailyTotals[date].toFixed(1) : "-"}
                        </td>
                      ))}
                      <td className="text-center px-3 py-2 text-primary">{timesheet.totalHours.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Utilization */}
          {timesheet.totalHours > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Utilization Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.min((timesheet.billableTotal / timesheet.totalHours) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {((timesheet.billableTotal / timesheet.totalHours) * 100).toFixed(0)}% billable
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {timesheet.billableTotal.toFixed(1)}h billable out of {timesheet.totalHours.toFixed(1)}h total
                  (based on 40h standard work week: {((timesheet.totalHours / 40) * 100).toFixed(0)}% capacity)
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
