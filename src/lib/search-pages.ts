import type { ElementType } from "react";
import {
  LayoutDashboard, Users, ActivityIcon, UserCircle, Package, ShoppingCart,
  Truck, Receipt, Building2, Warehouse, Boxes, Monitor, ClipboardList,
  DollarSign, ArrowLeftRight, Database, BookOpen, Landmark, FileText,
  ShoppingBag, Layers, MessageSquare, Briefcase, Shield, HelpCircle,
  Calculator, Target, ClipboardCheck, UserPlus, Bell, Star, BarChart3,
  ListChecks, RotateCcw, Settings2, Repeat, PiggyBank, Ruler,
} from "lucide-react";

export type SearchPage = {
  to: string;
  /** Translation key for the sidebar label — kept identical to AppLayout nav. */
  labelKey: string;
  /** Fallback English label if translation is missing. Matches the sidebar. */
  label: string;
  icon: ElementType;
  /** Extra words that should match this page (synonyms, related terms, old names). */
  keywords: string[];
  /** Roles allowed to see this page. Undefined = everyone. */
  roles?: string[];
};

// Labels and labelKeys mirror the sidebar nav in AppLayout exactly, so searching
// the name you actually see in the sidebar always works. Keywords add synonyms.
export const SEARCH_PAGES: SearchPage[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: ["home", "overview", "summary", "stats"] },
  { to: "/sales", labelKey: "nav.sales", label: "Customers & Sales", icon: ShoppingCart, keywords: ["revenue", "orders", "sell", "invoice", "pos", "receipt", "customers"] },
  { to: "/products", labelKey: "nav.products", label: "Products & Services", icon: Package, keywords: ["catalog", "items", "inventory", "sku", "service", "goods"] },
  { to: "/warehouses", labelKey: "nav.warehouses", label: "Warehouses", icon: Warehouse, keywords: ["storage", "location", "locations", "bins", "stock"] },
  { to: "/inventory", labelKey: "nav.inventory", label: "Stock Tracking", icon: ArrowLeftRight, keywords: ["stock", "inventory", "movements", "adjustments"] },
  { to: "/vendors", labelKey: "nav.vendors", label: "Vendors & Bills", icon: Receipt, keywords: ["suppliers", "bills", "expenses", "payables", "purchase"] },
  { to: "/accounting", labelKey: "nav.accounting", label: "General Ledger", icon: BookOpen, keywords: ["ledger", "accounting", "journal", "chart of accounts", "books", "gl"], roles: ["owner", "manager"] },
  { to: "/banking", labelKey: "nav.banking", label: "Multi-Currency & Banking", icon: Landmark, keywords: ["bank", "banking", "currency", "fx", "reconcile", "transactions", "cash"], roles: ["owner", "manager"] },
  { to: "/invoicing", labelKey: "nav.invoicing", label: "Invoicing & Sales", icon: FileText, keywords: ["invoices", "invoicing", "billing", "estimates", "quotes"], roles: ["owner", "manager"] },
  { to: "/batch-operations", labelKey: "nav.batchOperations", label: "Batch Operations", icon: ListChecks, keywords: ["bulk", "batch", "deposits"], roles: ["owner", "manager"] },
  { to: "/recurring-transactions", labelKey: "nav.recurringTransactions", label: "Recurring Transactions", icon: Repeat, keywords: ["recurring", "subscriptions", "scheduled"], roles: ["owner", "manager"] },
  { to: "/deposits", labelKey: "nav.deposits", label: "Deposits & Retainers", icon: PiggyBank, keywords: ["deposit", "retainers", "bank deposit", "cash"], roles: ["owner", "manager"] },
  { to: "/returns", labelKey: "nav.returns", label: "Returns & Landed Cost", icon: RotateCcw, keywords: ["refund", "return", "rma", "credit note", "landed cost"], roles: ["owner", "manager"] },
  { to: "/tax", labelKey: "nav.tax", label: "Tax Management", icon: Calculator, keywords: ["vat", "tax", "gst", "filing"], roles: ["owner", "manager"] },
  { to: "/budget", labelKey: "nav.budget", label: "Budget & Cash Flow", icon: Target, keywords: ["budget", "cash flow", "forecast", "plan"], roles: ["owner", "manager"] },
  { to: "/claims", labelKey: "nav.claims", label: "Expense Claims", icon: ClipboardCheck, keywords: ["claims", "reimbursement", "warranty claim"] },
  { to: "/billable-expenses", labelKey: "nav.billableExpenses", label: "Billable Expenses", icon: Receipt, keywords: ["billable", "reimbursable", "markup"], roles: ["owner", "manager"] },
  { to: "/crm", labelKey: "nav.crm", label: "CRM & Leads", icon: UserPlus, keywords: ["leads", "contacts", "pipeline", "customers", "deals"], roles: ["owner", "manager"] },
  { to: "/alerts", labelKey: "nav.alerts", label: "Email Alerts", icon: Bell, keywords: ["notifications", "alerts", "reminders", "email"], roles: ["owner", "manager"] },
  { to: "/branches", labelKey: "nav.branches", label: "Branches", icon: Building2, keywords: ["locations", "stores", "offices"], roles: ["owner", "manager"] },
  { to: "/warranties", labelKey: "nav.warranties", label: "Warranties", icon: Shield, keywords: ["warranty", "guarantee", "coverage"], roles: ["owner", "manager"] },
  { to: "/loyalty", labelKey: "nav.loyalty", label: "Loyalty Program", icon: Star, keywords: ["rewards", "points", "loyalty program"], roles: ["owner", "manager"] },
  { to: "/reports-hub", labelKey: "nav.reportsCenter", label: "Reports & Analytics", icon: BarChart3, keywords: ["reports", "analytics", "insights", "statements"], roles: ["owner", "manager"] },
  { to: "/custom-fields", labelKey: "nav.customFields", label: "Custom Fields", icon: Settings2, keywords: ["custom fields", "settings"], roles: ["owner", "manager"] },
  { to: "/print-designer", labelKey: "nav.printDesigner", label: "Print Designer", icon: FileText, keywords: ["templates", "print", "layout", "invoice design"], roles: ["owner", "manager"] },
  { to: "/purchasing", labelKey: "nav.purchasing", label: "Purchasing & AP", icon: ShoppingBag, keywords: ["purchase orders", "po", "procurement", "accounts payable", "ap"], roles: ["owner", "manager"] },
  { to: "/advanced-inventory", labelKey: "nav.advancedInventory", label: "Assembly & BOM", icon: Layers, keywords: ["lots", "serial", "assembly", "bom", "bill of materials", "bins", "advanced inventory"], roles: ["owner", "manager"] },
  { to: "/units-of-measure", labelKey: "nav.unitsOfMeasure", label: "Units of Measure", icon: Ruler, keywords: ["uom", "units", "measure"], roles: ["owner", "manager"] },
  { to: "/inventory-valuation", labelKey: "nav.inventoryValuation", label: "Inventory Valuation", icon: Calculator, keywords: ["valuation", "fifo", "lifo", "cost"], roles: ["owner", "manager"] },
  { to: "/loans", labelKey: "nav.loans", label: "Loans & Financing", icon: Landmark, keywords: ["loan", "financing", "debt"], roles: ["owner", "manager"] },
  { to: "/pricing", labelKey: "nav.pricing", label: "Pricing & Discounts", icon: DollarSign, keywords: ["price", "price list", "discounts", "promotions"], roles: ["owner", "manager"] },
  { to: "/communications", labelKey: "nav.communications", label: "Communications", icon: MessageSquare, keywords: ["messages", "email", "sms", "notifications"], roles: ["owner", "manager"] },
  { to: "/projects", labelKey: "nav.projects", label: "Jobs & Projects", icon: Briefcase, keywords: ["projects", "jobs", "tasks"], roles: ["owner", "manager"] },
  { to: "/vehicles", labelKey: "nav.vehicles", label: "Vehicles", icon: Truck, keywords: ["fleet", "cars", "trucks", "fuel", "maintenance", "vehicle management"] },
  { to: "/assets", labelKey: "nav.assets", label: "Assets", icon: Boxes, keywords: ["assets", "equipment", "tools", "depreciation", "asset management"] },
  { to: "/orders", labelKey: "nav.orders", label: "Orders", icon: ClipboardList, keywords: ["orders", "online orders", "shop orders"], roles: ["owner", "manager"] },
  { to: "/fulfillment", labelKey: "nav.fulfillment", label: "Pick/Pack/Ship", icon: Package, keywords: ["shipping", "delivery", "fulfillment", "packing", "pick", "pack", "ship"], roles: ["owner", "manager"] },
  { to: "/payroll", labelKey: "nav.payroll", label: "Payroll & HR", icon: DollarSign, keywords: ["salary", "wages", "employees", "payslips", "pay", "hr", "human resources"], roles: ["owner", "manager"] },
  { to: "/monitoring", labelKey: "nav.monitoring", label: "Monitoring", icon: Monitor, keywords: ["monitoring", "system", "health"], roles: ["owner", "manager"] },
  { to: "/data", labelKey: "nav.data", label: "Data Import/Export", icon: Database, keywords: ["import", "export", "backup", "data"], roles: ["owner", "manager"] },
  { to: "/security", labelKey: "nav.security", label: "Security & Roles", icon: Shield, keywords: ["security", "roles", "audit", "permissions", "access"], roles: ["owner"] },
  { to: "/company-profile", labelKey: "nav.companyProfile", label: "Company Profile", icon: Building2, keywords: ["company", "business", "profile", "settings"], roles: ["owner"] },
  { to: "/users", labelKey: "nav.team", label: "Team", icon: Users, keywords: ["team", "staff", "users", "members", "access", "team management"], roles: ["owner", "manager"] },
  { to: "/activity", labelKey: "nav.activity", label: "Activity Log", icon: ActivityIcon, keywords: ["activity", "log", "history", "audit"], roles: ["owner", "manager"] },
  { to: "/help", labelKey: "nav.help", label: "Help Center", icon: HelpCircle, keywords: ["help", "support", "faq", "docs", "help center"] },
  { to: "/profile", labelKey: "nav.profile", label: "My Profile", icon: UserCircle, keywords: ["profile", "account", "me", "settings"] },
];
