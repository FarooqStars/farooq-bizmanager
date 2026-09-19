/**
 * Reports Hub — central hub for all financial reports.
 *
 * Sections:
 *  1. Reconciliation Panel (live health check)
 *  2. Financial Statements (5 reports)
 *  3. Receivables (5 reports — reports 10–14)
 *  4. Payables (4 reports — reports 15–18)
 *  5. Daily Operations (Day Book)
 *  6. Report Tools / Quick Access
 */
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ReconciliationPanel } from "./_components/ReconciliationPanel.tsx";
import {
  BarChart3,
  CalendarCheck,
  Wand2,
  DollarSign,
  TrendingUp,
  PieChart,
  ArrowLeftRight,
  FileText,
  ChevronRight,
  Scale,
  ListChecks,
  Briefcase,
  Users,
  BookOpen,
  AlertCircle,
  ClipboardList,
  Receipt,
  ShoppingCart,
  Shield,
} from "lucide-react";

type ReportCard = {
  to: string;
  title: string;
  description: string;
  icon: React.ElementType;
};

const financialStatementReports: ReportCard[] = [
  {
    to: "/reports/trial-balance",
    title: "Trial Balance",
    description: "Debit and credit balances for every account as of a date. Confirms the ledger is in balance.",
    icon: ListChecks,
  },
  {
    to: "/reports/balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity as of a date. Includes computed retained earnings and equation check.",
    icon: Scale,
  },
  {
    to: "/reports/profit-loss",
    title: "Profit & Loss",
    description: "Revenue, COGS, gross profit, and net profit for a period. Comparative column and % of revenue.",
    icon: PieChart,
  },
  {
    to: "/reports/cash-flow",
    title: "Cash Flow Statement",
    description: "Indirect-method cash flow: operating, investing, and financing. Reconciles to cash account balances.",
    icon: ArrowLeftRight,
  },
  {
    to: "/reports/general-ledger",
    title: "General Ledger Detail",
    description: "Every posted line per account with running balance, opening/closing balance, and source document links.",
    icon: FileText,
  },
];

// Reports 10–14: Receivables
const receivablesReports: ReportCard[] = [
  {
    to: "/reports/ageing?tab=ar",
    title: "AR Ageing Summary",
    description: "Outstanding customer balances by age bucket (Current / 1-30 / 31-60 / 61-90 / 90+). Reconciles to AR control account.",
    icon: Users,
  },
  {
    to: "/reports?tab=receivables-payables&sub=ar-detail",
    title: "AR Ageing Detail",
    description: "Line-by-line AR detail per customer with invoice dates, due dates, and age buckets.",
    icon: FileText,
  },
  {
    to: "/reports?tab=receivables-payables&sub=customer-balance",
    title: "Customer Balance Summary",
    description: "Total outstanding balance per customer across all open invoices.",
    icon: Users,
  },
  {
    to: "/reports?tab=receivables-payables&sub=open-invoices",
    title: "Open Invoices",
    description: "All unpaid or partially paid invoices, sortable by customer, date, or amount.",
    icon: ClipboardList,
  },
  {
    to: "/reports?tab=receivables-payables&sub=overdue",
    title: "Collections / Overdue",
    description: "Invoices past their due date, grouped by overdue bucket, with total exposure.",
    icon: AlertCircle,
  },
  {
    to: "/reports?tab=receivables-payables&sub=sales-by-customer",
    title: "Sales by Customer",
    description: "Net revenue per customer for a period, with comparative column.",
    icon: TrendingUp,
  },
  {
    to: "/reports/ageing?tab=statement",
    title: "Customer Statement",
    description: "Per-customer statement with opening balance, transactions in date order, running balance, and ageing strip.",
    icon: FileText,
  },
];

// Reports 15–18: Payables
const payablesReports: ReportCard[] = [
  {
    to: "/reports/ageing?tab=ap",
    title: "AP Ageing Summary",
    description: "Outstanding vendor bills by age bucket, using remaining balance. Reconciles to AP control account.",
    icon: Briefcase,
  },
  {
    to: "/reports?tab=receivables-payables&sub=ap-detail",
    title: "AP Ageing Detail",
    description: "Line-by-line AP detail per vendor with bill dates, due dates, and age buckets.",
    icon: FileText,
  },
  {
    to: "/reports?tab=receivables-payables&sub=vendor-balance",
    title: "Vendor Balance Summary",
    description: "Total outstanding balance per vendor across all unpaid bills.",
    icon: Briefcase,
  },
  {
    to: "/reports?tab=receivables-payables&sub=unpaid-bills",
    title: "Unpaid Bills / Payment Due",
    description: "All unpaid or partially paid bills, sortable by vendor, due date, or amount.",
    icon: Receipt,
  },
  {
    to: "/reports?tab=receivables-payables&sub=purchases-by-vendor",
    title: "Purchases by Vendor",
    description: "Total AP credits per vendor for a period, covering bills and goods receipts.",
    icon: ShoppingCart,
  },
];

const dailyOpsReports: ReportCard[] = [
  {
    to: "/reports/day-book",
    title: "Day Book",
    description: "All posted transactions for a day or range, grouped by type. Summary strip: Cash In, Cash Out, Net Cash, Documents.",
    icon: BookOpen,
  },
  {
    to: "/reports/audit-trail",
    title: "Audit Trail",
    description: "Complete record of all financial changes with before/after snapshots, user attribution, and drill-down details.",
    icon: Shield,
  },
];

type QuickLink = { to: string; label: string; icon: React.ElementType };

const quickLinks: QuickLink[] = [
  { to: "/reports/trial-balance",                                          label: "Trial Balance",           icon: ListChecks },
  { to: "/reports/balance-sheet",                                          label: "Balance Sheet",           icon: Scale },
  { to: "/reports/profit-loss",                                            label: "P&L",                     icon: PieChart },
  { to: "/reports/cash-flow",                                              label: "Cash Flow",               icon: ArrowLeftRight },
  { to: "/reports/general-ledger",                                         label: "General Ledger",          icon: FileText },
  { to: "/reports/ageing?tab=ar",                                          label: "AR Ageing",               icon: Users },
  { to: "/reports/ageing?tab=ap",                                          label: "AP Ageing",               icon: Briefcase },
  { to: "/reports/ageing?tab=statement",                                   label: "Customer Statement",      icon: FileText },
  { to: "/reports?tab=receivables-payables&sub=open-invoices",             label: "Open Invoices",           icon: ClipboardList },
  { to: "/reports?tab=receivables-payables&sub=overdue",                   label: "Overdue",                 icon: AlertCircle },
  { to: "/reports?tab=receivables-payables&sub=sales-by-customer",         label: "Sales by Customer",       icon: TrendingUp },
  { to: "/reports?tab=receivables-payables&sub=unpaid-bills",              label: "Unpaid Bills",            icon: Receipt },
  { to: "/reports?tab=receivables-payables&sub=purchases-by-vendor",       label: "Purchases by Vendor",     icon: ShoppingCart },
  { to: "/reports/day-book",                                               label: "Day Book",                icon: BookOpen },
  { to: "/reports/audit-trail",                                            label: "Audit Trail",             icon: Shield },
];

type SectionCard = {
  to: string;
  title: string;
  description: string;
  icon: React.ElementType;
  cta: string;
};

const reportTools: SectionCard[] = [
  {
    to: "/report-builder",
    title: "Report Builder",
    description: "Create custom reports with flexible filters and visualizations.",
    icon: Wand2,
    cta: "Build a report",
  },
  {
    to: "/scheduled-reports",
    title: "Scheduled Reports",
    description: "Set up automatic report generation and delivery.",
    icon: CalendarCheck,
    cta: "Manage schedules",
  },
];

function ReportCardLink({ to, title, description, icon: Icon }: ReportCard) {
  return (
    <Link
      to={to}
      className="group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
    >
      <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/40 group-hover:-translate-y-0.5">
        <CardHeader className="pb-2">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-1">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-3">
            Open
            <ChevronRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ReportsHubPage() {
  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your central hub for financial reporting, ledger reconciliation, and daily operations.
          </p>
        </div>
      </div>

      {/* Reconciliation Panel */}
      <ReconciliationPanel />

      {/* Financial Statements */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Financial Statements</h2>
          <p className="text-muted-foreground text-sm">Core accounting reports — all figures from posted journal lines only.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {financialStatementReports.map((r) => <ReportCardLink key={r.to} {...r} />)}
        </div>
      </div>

      {/* Receivables */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Receivables</h2>
          <p className="text-muted-foreground text-sm">AR ageing, open invoices, collections, and sales analysis by customer.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {receivablesReports.map((r) => <ReportCardLink key={r.to} {...r} />)}
        </div>
      </div>

      {/* Payables */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Payables</h2>
          <p className="text-muted-foreground text-sm">AP ageing, unpaid bills, and purchase analysis by vendor.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {payablesReports.map((r) => <ReportCardLink key={r.to} {...r} />)}
        </div>
      </div>

      {/* Daily Operations */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Daily Operations</h2>
          <p className="text-muted-foreground text-sm">Day-by-day transaction register — the book a business owner reads at end of day.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dailyOpsReports.map((r) => <ReportCardLink key={r.to} {...r} />)}
        </div>
      </div>

      {/* Report Tools */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Report Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportTools.map(({ to, title, description, icon: Icon, cta }) => (
            <Link
              key={to}
              to={to}
              className="group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/40 group-hover:-translate-y-0.5">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {cta}
                    <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Access */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Quick Access</h2>
          <p className="text-muted-foreground text-sm">Jump straight to your most common reports.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(({ to, label, icon: Icon }) => (
            <Button
              key={to}
              asChild
              variant="secondary"
              size="sm"
              className="cursor-pointer"
            >
              <Link to={to}>
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
