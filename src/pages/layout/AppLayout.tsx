import { Outlet, NavLink, useNavigate } from "react-router-dom";
import React from "react";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useAuth } from "@/hooks/use-auth.ts";
import GlobalSearch from "@/components/global-search.tsx";
import NotificationBell from "@/components/notification-bell.tsx";
import BottomTabBar from "@/components/bottom-tab-bar.tsx";
import PageTransition from "@/components/page-transition.tsx";
import LocaleSwitcher from "@/components/locale-switcher.tsx";
import HelpButton from "@/components/help-button.tsx";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  ActivityIcon,
  UserCircle,
  Package,
  ShoppingCart,
  Truck,
  Receipt,
  LogOut,
  X,
  Building2,
  Warehouse,
  Boxes,
  Menu,
  Monitor,
  ClipboardList,
  DollarSign,
  ArrowLeftRight,
  Database,
  BookOpen,
  Landmark,
  FileText,
  ShoppingBag,
  Layers,
  MessageSquare,
  Briefcase,
  Shield,
  HelpCircle,
  Calculator,
  Target,
  ClipboardCheck,
  UserPlus,
  Bell,
  Star,
  BarChart3,
  ListChecks,
  RotateCcw,
  Settings2,
  Repeat,
  PiggyBank,
  Ruler,
  ChevronDown,
  Store,
  ShieldCheck,
} from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils.ts";
import { Badge } from "@/components/ui/badge.tsx";

// ─── Nav item type ────────────────────────────────────────────

type NavItem = {
  to: string;
  labelKey: string;
  icon: React.ElementType;
  roles?: string[];
};

type NavGroup = {
  /** i18n key for the group label, e.g. "nav.group.customersAndSales" */
  labelKey: string;
  /** Stable localStorage key for open/closed state */
  storageKey: string;
  items: NavItem[];
};

// ─── Group definitions ────────────────────────────────────────

const navGroups: NavGroup[] = [
  {
    labelKey: "nav.group.customersAndSales",
    storageKey: "sg-customers",
    items: [
      { to: "/invoicing", labelKey: "nav.invoicing", icon: FileText, roles: ["owner", "manager"] },
      { to: "/sales", labelKey: "nav.sales", icon: ShoppingCart },
      { to: "/pos", labelKey: "nav.pos", icon: Store },
      { to: "/orders", labelKey: "nav.orders", icon: ClipboardList, roles: ["owner", "manager"] },
      { to: "/recurring-transactions", labelKey: "nav.recurringTransactions", icon: Repeat, roles: ["owner", "manager"] },
      { to: "/deposits", labelKey: "nav.deposits", icon: PiggyBank, roles: ["owner", "manager"] },
      { to: "/returns", labelKey: "nav.returns", icon: RotateCcw, roles: ["owner", "manager"] },
      { to: "/crm", labelKey: "nav.crm", icon: UserPlus, roles: ["owner", "manager"] },
      { to: "/loyalty", labelKey: "nav.loyalty", icon: Star, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.vendorsAndPurchases",
    storageKey: "sg-vendors",
    items: [
      { to: "/vendors", labelKey: "nav.vendors", icon: Receipt },
      { to: "/purchasing", labelKey: "nav.purchasing", icon: ShoppingBag, roles: ["owner", "manager"] },
      { to: "/claims", labelKey: "nav.claims", icon: ClipboardCheck },
      { to: "/billable-expenses", labelKey: "nav.billableExpenses", icon: Receipt, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.inventory",
    storageKey: "sg-inventory",
    items: [
      { to: "/products", labelKey: "nav.products", icon: Package },
      { to: "/warehouses", labelKey: "nav.warehouses", icon: Warehouse },
      { to: "/inventory", labelKey: "nav.inventory", icon: ArrowLeftRight },
      { to: "/inventory-valuation", labelKey: "nav.inventoryValuation", icon: Calculator, roles: ["owner", "manager"] },
      { to: "/advanced-inventory", labelKey: "nav.advancedInventory", icon: Layers, roles: ["owner", "manager"] },
      { to: "/units-of-measure", labelKey: "nav.unitsOfMeasure", icon: Ruler, roles: ["owner", "manager"] },
      { to: "/pricing", labelKey: "nav.pricing", icon: DollarSign, roles: ["owner", "manager"] },
      { to: "/fulfillment", labelKey: "nav.fulfillment", icon: Package, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.banking",
    storageKey: "sg-banking",
    items: [
      { to: "/banking", labelKey: "nav.banking", icon: Landmark, roles: ["owner", "manager"] },
      { to: "/batch-operations", labelKey: "nav.batchOperations", icon: ListChecks, roles: ["owner", "manager"] },
      { to: "/loans", labelKey: "nav.loans", icon: Landmark, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.accounting",
    storageKey: "sg-accounting",
    items: [
      { to: "/accounting", labelKey: "nav.accounting", icon: BookOpen, roles: ["owner", "manager"] },
      { to: "/tax", labelKey: "nav.tax", icon: Calculator, roles: ["owner", "manager"] },
      { to: "/budget", labelKey: "nav.budget", icon: Target, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.payroll",
    storageKey: "sg-payroll",
    items: [
      { to: "/payroll", labelKey: "nav.payroll", icon: DollarSign, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.reports",
    storageKey: "sg-reports",
    items: [
      { to: "/reports-hub", labelKey: "nav.reportsCenter", icon: BarChart3, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.company",
    storageKey: "sg-company",
    items: [
      { to: "/company-profile", labelKey: "nav.companyProfile", icon: Building2, roles: ["owner"] },
      { to: "/admin", labelKey: "nav.adminPanel", icon: ShieldCheck, roles: ["owner"] },
      { to: "/users", labelKey: "nav.team", icon: Users, roles: ["owner", "manager"] },
      { to: "/security", labelKey: "nav.security", icon: Shield, roles: ["owner"] },
      { to: "/branches", labelKey: "nav.branches", icon: Building2, roles: ["owner", "manager"] },
      { to: "/custom-fields", labelKey: "nav.customFields", icon: Settings2, roles: ["owner", "manager"] },
      { to: "/print-designer", labelKey: "nav.printDesigner", icon: FileText, roles: ["owner", "manager"] },
      { to: "/communications", labelKey: "nav.communications", icon: MessageSquare, roles: ["owner", "manager"] },
      { to: "/alerts", labelKey: "nav.alerts", icon: Bell, roles: ["owner", "manager"] },
      { to: "/activity", labelKey: "nav.activity", icon: ActivityIcon, roles: ["owner", "manager"] },
      { to: "/data", labelKey: "nav.data", icon: Database, roles: ["owner", "manager"] },
      { to: "/monitoring", labelKey: "nav.monitoring", icon: Monitor, roles: ["owner", "manager"] },
    ],
  },
  {
    labelKey: "nav.group.more",
    storageKey: "sg-more",
    items: [
      { to: "/projects", labelKey: "nav.projects", icon: Briefcase, roles: ["owner", "manager"] },
      { to: "/assets", labelKey: "nav.assets", icon: Boxes },
      { to: "/vehicles", labelKey: "nav.vehicles", icon: Truck },
      { to: "/warranties", labelKey: "nav.warranties", icon: Shield, roles: ["owner", "manager"] },
    ],
  },
];

/** Items always shown at the bottom outside any group. */
const bottomNavItems: NavItem[] = [
  { to: "/help", labelKey: "nav.help", icon: HelpCircle },
  { to: "/profile", labelKey: "nav.profile", icon: UserCircle },
];

// ─── localStorage helpers ─────────────────────────────────────

const LS_KEY = "bm-sidebar-groups";

function readGroupState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeGroupState(state: Record<string, boolean>) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

// ─── Role colours ─────────────────────────────────────────────

const roleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  staff: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

// ─── NavGroupSection component ────────────────────────────────

function NavGroupSection({
  group,
  userRole,
  onClose,
}: {
  group: NavGroup;
  userRole: string;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const visibleItems = group.items.filter(
    (item) => !item.roles || item.roles.includes(userRole),
  );

  // Initialise from localStorage; default to open.
  const [open, setOpen] = useState<boolean>(() => {
    const saved = readGroupState();
    return saved[group.storageKey] !== false; // undefined → open
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      const state = readGroupState();
      state[group.storageKey] = next;
      writeGroupState(state);
      return next;
    });
  }, [group.storageKey]);

  if (visibleItems.length === 0) return null;

  return (
    <div>
      {/* Group header */}
      <button
        onClick={toggle}
        className="flex items-center w-full px-3 py-1.5 gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors cursor-pointer rounded-md hover:bg-sidebar-accent/50 mt-1"
      >
        <ChevronDown
          className={cn(
            "w-3 h-3 flex-shrink-0 transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
        <span>{t(group.labelKey)}</span>
      </button>

      {/* Group items */}
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {visibleItems.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0 transition-transform duration-150",
                      isActive && "scale-110",
                    )}
                  />
                  {t(labelKey)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SidebarContent ───────────────────────────────────────────

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { signout } = useAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const userRole = currentUser?.role ?? "staff";
  const { t } = useTranslation();

  const visibleBottom = bottomNavItems.filter(
    (item) => !item.roles || item.roles.includes(userRole),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <img src="/brand/icon-64.png" alt="Farooq BizManager" className="w-8 h-8 rounded-lg shadow-sm" />
        <div>
          <p className="font-bold text-sidebar-foreground text-sm tracking-tight">{t("app.name")}</p>
          <p className="text-xs text-sidebar-foreground/40">{t("app.subtitle")}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* User info */}
      {currentUser && (
        <div className="px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-sidebar-accent">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm flex-shrink-0 shadow-sm">
              {currentUser.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground truncate">
                {currentUser.name ?? "User"}
              </p>
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-md font-medium capitalize",
                  roleColors[currentUser.role],
                )}
              >
                {currentUser.role}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {/* Search */}
        <div className="mb-3 px-1">
          <GlobalSearch onClose={onClose} />
        </div>

        {/* Dashboard — top-level, no group */}
        <NavLink
          to="/dashboard"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent",
            )
          }
        >
          {({ isActive }) => (
            <>
              <LayoutDashboard
                className={cn("w-4 h-4 flex-shrink-0 transition-transform duration-150", isActive && "scale-110")}
              />
              {t("nav.dashboard")}
            </>
          )}
        </NavLink>

        {/* Collapsible groups */}
        <div className="mt-1 space-y-0.5">
          {navGroups.map((group) => (
            <NavGroupSection
              key={group.storageKey}
              group={group}
              userRole={userRole}
              onClose={onClose}
            />
          ))}
        </div>

        {/* Bottom items (Help, Profile) */}
        <div className="mt-2 pt-2 border-t border-sidebar-border/50 space-y-0.5">
          {visibleBottom.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "w-4 h-4 flex-shrink-0 transition-transform duration-150",
                      isActive && "scale-110",
                    )}
                  />
                  {t(labelKey)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-1 px-1">
          <LocaleSwitcher compact />
          <HelpButton />
          <NotificationBell />
        </div>
        <button
          onClick={() => signout()}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t("nav.signout")}
        </button>
      </div>
    </div>
  );
}

// ─── AppLayout ────────────────────────────────────────────────

function AppLayoutInner() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer sidebar (full menu) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 h-full bg-sidebar flex flex-col shadow-2xl">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card/95 backdrop-blur-md sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <img src="/brand/icon-64.png" alt="Farooq BizManager" className="w-6 h-6 rounded-md" />
            <span className="font-bold text-sm tracking-tight">{t("app.name")}</span>
          </div>
          <div className="flex items-center gap-1">
            <GlobalSearch />
            <NotificationBell />
          </div>
        </div>

        {/* Page content with transitions, with bottom padding for tab bar on mobile */}
        <div className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <BottomTabBar />
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  void navigate; // suppress unused warning
  const { t } = useTranslation();

  return (
    <>
      <Authenticated>
        <AppLayoutInner />
      </Authenticated>
      <Unauthenticated>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-6 max-w-sm px-4">
            <img src="/brand/icon-192.png" alt="Farooq BizManager" className="w-16 h-16 rounded-2xl mx-auto shadow-lg" />
            <div>
              <h1 className="text-2xl font-bold">{t("app.name")}</h1>
              <p className="text-muted-foreground mt-2">Sign in to access your business dashboard</p>
            </div>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      </AuthLoading>
    </>
  );
}
