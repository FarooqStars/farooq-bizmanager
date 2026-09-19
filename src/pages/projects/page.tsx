import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Briefcase, Clock, CheckSquare, TrendingUp, CalendarDays, HardHat, FileBarChart, FileText } from "lucide-react";
import ProjectsTab from "./_components/projects-tab.tsx";
import TimeTrackingTab from "./_components/time-tracking-tab.tsx";
import TimesheetApprovalTab from "./_components/timesheet-approval-tab.tsx";
import ProfitabilityTab from "./_components/profitability-tab.tsx";
import WeeklyTimesheetTab from "./_components/weekly-timesheet-tab.tsx";
import ContractorsTab from "./_components/contractors-tab.tsx";
import JobCostReportTab from "./_components/job-cost-report-tab.tsx";
import JobInvoicesProjectTab from "./_components/job-invoices-project-tab.tsx";

export default function ProjectsPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Briefcase className="w-6 h-6" />
          Jobs & Projects
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage jobs, contractors, track time, allocate costs, and measure profitability
        </p>
      </div>

      <Tabs defaultValue="projects">
        <TabsList className="flex-wrap">
          <TabsTrigger value="projects" className="cursor-pointer">
            <Briefcase className="w-4 h-4 mr-2" /> Jobs
          </TabsTrigger>
          <TabsTrigger value="contractors" className="cursor-pointer">
            <HardHat className="w-4 h-4 mr-2" /> Contractors
          </TabsTrigger>
          <TabsTrigger value="invoices" className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="time" className="cursor-pointer">
            <Clock className="w-4 h-4 mr-2" /> Time Tracking
          </TabsTrigger>
          <TabsTrigger value="timesheet" className="cursor-pointer">
            <CalendarDays className="w-4 h-4 mr-2" /> Timesheet
          </TabsTrigger>
          <TabsTrigger value="approval" className="cursor-pointer">
            <CheckSquare className="w-4 h-4 mr-2" /> Approvals
          </TabsTrigger>
          <TabsTrigger value="profitability" className="cursor-pointer">
            <TrendingUp className="w-4 h-4 mr-2" /> Profitability
          </TabsTrigger>
          <TabsTrigger value="costReport" className="cursor-pointer">
            <FileBarChart className="w-4 h-4 mr-2" /> Cost Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-4">
          <ProjectsTab />
        </TabsContent>
        <TabsContent value="contractors" className="mt-4">
          <ContractorsTab />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <JobInvoicesProjectTab />
        </TabsContent>
        <TabsContent value="time" className="mt-4">
          <TimeTrackingTab />
        </TabsContent>
        <TabsContent value="timesheet" className="mt-4">
          <WeeklyTimesheetTab />
        </TabsContent>
        <TabsContent value="approval" className="mt-4">
          <TimesheetApprovalTab />
        </TabsContent>
        <TabsContent value="profitability" className="mt-4">
          <ProfitabilityTab />
        </TabsContent>
        <TabsContent value="costReport" className="mt-4">
          <JobCostReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
