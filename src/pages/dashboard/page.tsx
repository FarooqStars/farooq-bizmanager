import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  DollarSign, TrendingUp, Package, AlertTriangle, ShoppingCart,
  Users, FileText, Truck, Activity, LayoutDashboard, Plus,
  GripVertical, X, RotateCcw, Settings2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet.tsx";

// ── Types ────────────────────────────────────────────────────────────────────

type WidgetConfig = {
  metric?: string;
  period?: string;
  chartType?: string;
  limit?: number;
};

type Widget = {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: WidgetConfig;
};

// ── Default layout ───────────────────────────────────────────────────────────

const DEFAULT_WIDGETS: Widget[] = [
  { id: "w1", type: "kpi_revenue_today", title: "Today's Revenue", x: 0, y: 0, w: 1, h: 1 },
  { id: "w2", type: "kpi_revenue_month", title: "This Month", x: 1, y: 0, w: 1, h: 1 },
  { id: "w3", type: "kpi_expenses_month", title: "Monthly Expenses", x: 2, y: 0, w: 1, h: 1 },
  { id: "w4", type: "kpi_inventory_value", title: "Inventory Value", x: 3, y: 0, w: 1, h: 1 },
  { id: "w9", type: "kpi_receivable", title: "Accounts Receivable", x: 0, y: 1, w: 1, h: 1 },
  { id: "w10", type: "kpi_unpaid_bills", title: "Accounts Payable", x: 1, y: 1, w: 1, h: 1 },
  { id: "w3a", type: "kpi_total_sales", title: "Total Sales", x: 2, y: 1, w: 1, h: 1 },
  { id: "w4a", type: "kpi_low_stock", title: "Low Stock", x: 3, y: 1, w: 1, h: 1 },
  { id: "w5", type: "chart_revenue", title: "Revenue Trend", x: 0, y: 2, w: 2, h: 2, config: { period: "30", chartType: "area" } },
  { id: "w6", type: "chart_expenses", title: "Expenses by Category", x: 2, y: 2, w: 2, h: 2, config: { chartType: "pie" } },
  { id: "w7", type: "list_top_products", title: "Top Products", x: 0, y: 4, w: 2, h: 2, config: { limit: 5 } },
  { id: "w8", type: "list_recent_activity", title: "Recent Activity", x: 2, y: 4, w: 2, h: 2, config: { limit: 5 } },
];

// ── Widget catalog ───────────────────────────────────────────────────────────

const WIDGET_CATALOG = [
  { type: "kpi_revenue_today", label: "Today's Revenue", icon: DollarSign, category: "KPI" },
  { type: "kpi_revenue_month", label: "Monthly Revenue", icon: TrendingUp, category: "KPI" },
  { type: "kpi_revenue_year", label: "Yearly Revenue", icon: TrendingUp, category: "KPI" },
  { type: "kpi_total_sales", label: "Total Sales", icon: ShoppingCart, category: "KPI" },
  { type: "kpi_inventory_value", label: "Inventory Value", icon: Package, category: "KPI" },
  { type: "kpi_low_stock", label: "Low Stock Items", icon: AlertTriangle, category: "KPI" },
  { type: "kpi_unpaid_bills", label: "Unpaid Bills (Payable)", icon: FileText, category: "KPI" },
  { type: "kpi_receivable", label: "Accounts Receivable", icon: TrendingUp, category: "KPI" },
  { type: "kpi_expenses_month", label: "Monthly Expenses", icon: DollarSign, category: "KPI" },
  { type: "kpi_active_users", label: "Active Users", icon: Users, category: "KPI" },
  { type: "kpi_vehicle_costs", label: "Vehicle & Asset Costs", icon: Truck, category: "KPI" },
  { type: "chart_revenue", label: "Revenue Chart", icon: TrendingUp, category: "Chart" },
  { type: "chart_expenses", label: "Expenses Pie Chart", icon: FileText, category: "Chart" },
  { type: "list_top_products", label: "Top Products", icon: Package, category: "List" },
  { type: "list_recent_activity", label: "Recent Activity", icon: Activity, category: "List" },
  { type: "list_low_stock", label: "Low Stock Alerts", icon: AlertTriangle, category: "List" },
];

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

// ── Helper ───────────────────────────────────────────────────────────────────

// ── Sortable widget wrapper ──────────────────────────────────────────────────

function SortableWidget({ widget, children, isEditing, onRemove }: {
  widget: Widget;
  children: React.ReactNode;
  isEditing: boolean;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(
      "relative",
      widget.w === 2 ? "lg:col-span-2" : "",
      widget.h === 2 ? "lg:row-span-2" : "",
    )}>
      {isEditing && (
        <div className="absolute top-1 right-1 z-10 flex gap-1">
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded bg-muted hover:bg-accent cursor-grab"
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onRemove(widget.id)}
            className="p-1 rounded bg-destructive/10 hover:bg-destructive/20 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-destructive" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

// ── KPI Widget ───────────────────────────────────────────────────────────────

function KpiWidget({ widget, data }: { widget: Widget; data: Record<string, unknown> }) {
  const { fmt, symbol } = useCurrency();
  const { type } = widget;
  let value = "-";
  let sub: string | undefined;
  let Icon = DollarSign;
  let color = "text-primary";

  const kpis = data.kpis as { todayRev: number; monthRev: number; yearRev: number; totalSales: number; monthChange?: number | null; monthExpenses?: number } | undefined;
  const inventory = data.inventory as { totalValue: number; totalProducts: number; lowStockCount: number } | undefined;
  const bills = data.bills as { unpaidAmount: number; unpaidCount: number; overdueCount: number } | undefined;
  const opCosts = data.opCosts as { vehicleFuel: number; vehicleMaintenance: number; assetMaintenance: number } | undefined;
  const activeUsers = data.activeUsers as number | undefined;
  const receivable = data.receivable as { totalOutstanding: number; overdueCount: number } | undefined;

  if (type === "kpi_revenue_today" && kpis) {
    value = fmt(kpis.todayRev); Icon = DollarSign; color = "text-green-600";
  } else if (type === "kpi_revenue_month" && kpis) {
    value = fmt(kpis.monthRev); Icon = TrendingUp; color = "text-blue-600";
    if (kpis.monthChange != null) sub = `${kpis.monthChange >= 0 ? "+" : ""}${kpis.monthChange.toFixed(1)}%`;
  } else if (type === "kpi_revenue_year" && kpis) {
    value = fmt(kpis.yearRev); Icon = TrendingUp; color = "text-purple-600";
  } else if (type === "kpi_total_sales" && kpis) {
    value = String(kpis.totalSales); Icon = ShoppingCart; color = "text-primary"; sub = "all time";
  } else if (type === "kpi_inventory_value" && inventory) {
    value = fmt(inventory.totalValue); Icon = Package; color = "text-blue-600"; sub = `${inventory.totalProducts} products`;
  } else if (type === "kpi_low_stock" && inventory) {
    value = String(inventory.lowStockCount); Icon = AlertTriangle; color = "text-yellow-600"; sub = "need restocking";
  } else if (type === "kpi_unpaid_bills" && bills) {
    value = fmt(bills.unpaidAmount); Icon = FileText; color = "text-orange-500"; sub = `${bills.unpaidCount} bills`;
  } else if (type === "kpi_active_users" && activeUsers !== undefined) {
    value = String(activeUsers); Icon = Users; color = "text-green-600"; sub = "active team";
  } else if (type === "kpi_vehicle_costs" && opCosts) {
    value = fmt(opCosts.vehicleFuel + opCosts.vehicleMaintenance + opCosts.assetMaintenance);
    Icon = Truck; color = "text-purple-600"; sub = "fleet + assets";
  } else if (type === "kpi_receivable" && receivable) {
    value = fmt(receivable.totalOutstanding); Icon = TrendingUp; color = "text-blue-600";
    sub = receivable.overdueCount > 0 ? `${receivable.overdueCount} overdue` : "outstanding invoices";
  } else if (type === "kpi_expenses_month" && kpis) {
    value = fmt(kpis.monthExpenses ?? 0); Icon = DollarSign; color = "text-red-500"; sub = "this month";
  }

  // Amounts arrive as "QAR 23,770.00". The currency code is shown small in
  // front so the number itself never breaks across two lines on narrow cards.
  const money = /^([A-Z]{3})\s+(.+)$/.exec(value);

  return (
    <Card className="h-full">
      <CardContent className="pt-5 px-4 sm:px-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{widget.title}</p>
            <p className="text-base sm:text-xl 2xl:text-2xl font-bold mt-0.5 leading-tight whitespace-nowrap tabular-nums">
              <span dir="ltr">
                {money ? (
                  <>
                    <span className="text-[0.65em] font-semibold text-muted-foreground mr-1">{money[1]}</span>
                    {money[2]}
                  </>
                ) : (
                  value
                )}
              </span>
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate"><bdi>{sub}</bdi></p>}
          </div>
          <div className={cn("p-2 rounded-lg bg-muted flex-shrink-0 hidden sm:block", color)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart Widget ─────────────────────────────────────────────────────────────

function ChartWidget({ widget, data }: { widget: Widget; data: Record<string, unknown> }) {
  const { fmt } = useCurrency();
  const { type } = widget;

  if (type === "chart_revenue") {
    const cashFlowData = data.cashFlowData as { monthly: Array<{ month: string; inflow: number; outflow: number; net: number }> } | undefined;
    const chartData = (cashFlowData?.monthly ?? []).map((d) => ({ name: d.month.slice(5), inflow: d.inflow, net: d.net }));

    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{widget.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revGradCustom" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => fmt(v)} className="fill-muted-foreground" width={50} />
                <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                <Area type="monotone" dataKey="inflow" name="Cash In" stroke="#3b82f6" strokeWidth={2} fill="url(#revGradCustom)" />
                <Area type="monotone" dataKey="net" name="Net" stroke="#10b981" strokeWidth={1.5} fill="none" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    );
  }

  if (type === "chart_expenses") {
    const expensesData = data.expensesData as Array<{ name: string; amount: number }> | undefined;

    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{widget.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {!expensesData || expensesData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No expenses</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={140}>
                <PieChart>
                  <Pie data={expensesData} dataKey="amount" cx="50%" cy="50%" outerRadius={55} strokeWidth={2}>
                    {expensesData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 min-w-0">
                {expensesData.slice(0, 5).map((e, i) => (
                  <div key={e.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="truncate flex-1">{e.name}</span>
                    <span className="font-semibold flex-shrink-0">{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return <Card className="h-full"><CardContent className="pt-5 text-sm text-muted-foreground">Unknown chart</CardContent></Card>;
}

// ── List Widget ──────────────────────────────────────────────────────────────

function ListWidget({ widget, data }: { widget: Widget; data: Record<string, unknown> }) {
  const { fmt } = useCurrency();
  const { type } = widget;
  const limit = widget.config?.limit ?? 5;

  if (type === "list_top_products") {
    const topProducts = (data.topProducts as Array<{ name: string; quantity: number }> | undefined) ?? [];
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" />{widget.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sales data</p>
          ) : (
            <div className="space-y-1.5">
              {topProducts.slice(0, limit).map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className="font-semibold flex-shrink-0 ml-2 text-primary">{p.quantity} units</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (type === "list_recent_activity") {
    const activityLog = (data.activityLog as Array<{ _id: string; _creationTime: number; action: string; details?: string; user?: { name?: string } }> | undefined) ?? [];
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />{widget.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity</p>
          ) : (
            <div className="space-y-2">
              {activityLog.slice(0, limit).map((log) => (
                <div key={log._id} className="flex items-start gap-2 text-xs">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold">{log.user?.name?.[0]?.toUpperCase() ?? "?"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{log.user?.name ?? "Unknown"}</span>
                    <span className="text-muted-foreground"> — {log.action}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (type === "list_low_stock") {
    const inventory = data.inventory as { lowStockItems: Array<{ name: string; quantity: number; threshold: number }> } | undefined;
    const items = inventory?.lowStockItems ?? [];
    return (
      <Card className="h-full border-yellow-200 dark:border-yellow-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="w-4 h-4" />{widget.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">All stocked</p>
          ) : (
            <div className="space-y-1.5">
              {items.slice(0, limit).map((item) => (
                <div key={item.name} className="flex items-center justify-between bg-yellow-50 dark:bg-yellow-900/20 rounded px-2 py-1.5 text-xs">
                  <span className="font-medium truncate">{item.name}</span>
                  <span className="text-yellow-700 dark:text-yellow-400 font-semibold flex-shrink-0 ml-2">
                    {item.quantity}/{item.threshold}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return <Card className="h-full"><CardContent className="pt-5 text-sm text-muted-foreground">Unknown widget</CardContent></Card>;
}

// ── Widget Renderer ──────────────────────────────────────────────────────────

function WidgetRenderer({ widget, data }: { widget: Widget; data: Record<string, unknown> }) {
  if (widget.type.startsWith("kpi_")) return <KpiWidget widget={widget} data={data} />;
  if (widget.type.startsWith("chart_")) return <ChartWidget widget={widget} data={data} />;
  if (widget.type.startsWith("list_")) return <ListWidget widget={widget} data={data} />;
  return <Card className="h-full"><CardContent className="pt-5 text-sm text-muted-foreground">Unknown widget type</CardContent></Card>;
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CustomDashboard() {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);

  // Data queries
  const layout = useQuery(api.dashboard.getLayout);
  const kpis = useQuery(api.reports.revenueKpis);
  // Ledger-based monthly cash flow replaces the old sales-table revenue trend.
  const cashFlowData = useQuery(api.advancedReports.cashFlow, { months: 6 });
  const expensesData = useQuery(api.reports.expensesByCategory);
  const topProducts = useQuery(api.reports.topProducts, { limit: 5 });
  const inventory = useQuery(api.reports.inventorySummary);
  const bills = useQuery(api.reports.billsSummary);
  const opCosts = useQuery(api.reports.operationalCosts);
  const users = useQuery(api.users.listUsers);
  const activityLog = useQuery(api.users.getActivityLog, { limit: 6 });
  const receivable = useQuery(api.reports.receivableSummary);

  const saveLayout = useMutation(api.dashboard.saveLayout);
  const resetLayoutMut = useMutation(api.dashboard.resetLayout);

  const activeUsers = users?.filter((u) => u.isActive).length ?? 0;

  // Current widgets (custom or default)
  const widgets = useMemo(() => {
    if (layout === undefined) return null; // loading
    if (layout === null) return DEFAULT_WIDGETS;
    return layout.widgets as Widget[];
  }, [layout]);

  const [localWidgets, setLocalWidgets] = useState<Widget[] | null>(null);

  // Sync local state with server
  const displayWidgets = useMemo(() => {
    if (isEditing && localWidgets) return localWidgets;
    return widgets ?? DEFAULT_WIDGETS;
  }, [isEditing, localWidgets, widgets]);

  // Data bundle for widgets
  const data: Record<string, unknown> = {
    kpis, cashFlowData, expensesData, topProducts, inventory, bills, opCosts, activeUsers, activityLog, receivable,
  };

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalWidgets((prev) => {
      const items = prev ?? widgets ?? DEFAULT_WIDGETS;
      const oldIndex = items.findIndex((w) => w.id === active.id);
      const newIndex = items.findIndex((w) => w.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }, [widgets]);

  const handleRemove = useCallback((id: string) => {
    setLocalWidgets((prev) => {
      const items = prev ?? widgets ?? DEFAULT_WIDGETS;
      return items.filter((w) => w.id !== id);
    });
  }, [widgets]);

  const handleAddWidget = useCallback((type: string, label: string) => {
    setLocalWidgets((prev) => {
      const items = prev ?? widgets ?? DEFAULT_WIDGETS;
      const newWidget: Widget = {
        id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        title: label,
        x: 0,
        y: items.length,
        w: type.startsWith("kpi_") ? 1 : 2,
        h: type.startsWith("kpi_") ? 1 : 2,
        config: type === "chart_revenue" ? { period: "30", chartType: "area" } :
                type === "list_top_products" ? { limit: 5 } :
                type === "list_recent_activity" ? { limit: 5 } :
                type === "list_low_stock" ? { limit: 5 } : undefined,
      };
      return [...items, newWidget];
    });
    setShowCatalog(false);
  }, [widgets]);

  const handleSave = useCallback(async () => {
    const widgetsToSave = localWidgets ?? widgets ?? DEFAULT_WIDGETS;
    try {
      await saveLayout({ widgets: widgetsToSave });
      toast.success(t("customDashboard.saved"));
      setIsEditing(false);
      setLocalWidgets(null);
    } catch {
      toast.error(t("customDashboard.saveFailed"));
    }
  }, [localWidgets, widgets, saveLayout, t]);

  const handleReset = useCallback(async () => {
    try {
      await resetLayoutMut();
      toast.success(t("customDashboard.reset"));
      setIsEditing(false);
      setLocalWidgets(null);
    } catch {
      toast.error(t("customDashboard.resetFailed"));
    }
  }, [resetLayoutMut, t]);

  const startEditing = useCallback(() => {
    setLocalWidgets(widgets ?? DEFAULT_WIDGETS);
    setIsEditing(true);
  }, [widgets]);

  if (widgets === null) {
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6" /> {t("customDashboard.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("customDashboard.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setIsEditing(false); setLocalWidgets(null); }}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCatalog(true)}>
                <Plus className="w-4 h-4 mr-1" /> {t("customDashboard.addWidget")}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-1" /> {t("customDashboard.resetDefault")}
              </Button>
              <Button size="sm" onClick={handleSave}>
                {t("customDashboard.saveLayout")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={startEditing}>
              <Settings2 className="w-4 h-4 mr-1" /> {t("customDashboard.customize")}
            </Button>
          )}
        </div>
      </div>

      {/* Widget grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={displayWidgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-auto">
            {displayWidgets.map((widget) => (
              <SortableWidget key={widget.id} widget={widget} isEditing={isEditing} onRemove={handleRemove}>
                <WidgetRenderer widget={widget} data={data} />
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Widget catalog sheet */}
      <Sheet open={showCatalog} onOpenChange={setShowCatalog}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("customDashboard.widgetCatalog")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {["KPI", "Chart", "List"].map((category) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">{category}</h3>
                <div className="space-y-1">
                  {WIDGET_CATALOG.filter((w) => w.category === category).map((item) => {
                    const alreadyAdded = displayWidgets.some((w) => w.type === item.type);
                    return (
                      <button
                        key={item.type}
                        onClick={() => handleAddWidget(item.type, item.label)}
                        disabled={alreadyAdded}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer",
                          alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-accent"
                        )}
                      >
                        <item.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span>{item.label}</span>
                        {alreadyAdded && <span className="ml-auto text-xs text-muted-foreground">{t("customDashboard.added")}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
