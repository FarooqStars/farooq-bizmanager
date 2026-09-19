import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import { ErrorBoundary } from "./components/error-boundary.tsx";
import "./i18n.ts";
import AuthCallback from "./pages/auth/Callback.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AppLayout from "./pages/layout/AppLayout.tsx";
import Dashboard from "./pages/dashboard/page.tsx";
import UsersPage from "./pages/users/page.tsx";
import ProfilePage from "./pages/profile/page.tsx";
import ActivityPage from "./pages/activity/page.tsx";
import ProductsPage from "./pages/products/page.tsx";
import WarehousesPage from "./pages/warehouses/page.tsx";
import VendorsPage from "./pages/vendors/page.tsx";
import SalesPage from "./pages/sales/page.tsx";
import VehiclesPage from "./pages/vehicles/page.tsx";
import AssetsPage from "./pages/assets/page.tsx";
import AuditPage from "./pages/audit/page.tsx";
import ReportsPage from "./pages/reports/page.tsx";
import TrialBalancePage from "./pages/reports/trial-balance/page.tsx";
import BalanceSheetPage from "./pages/reports/balance-sheet/page.tsx";
import ProfitLossPage from "./pages/reports/profit-loss/page.tsx";
import CashFlowPage from "./pages/reports/cash-flow/page.tsx";
import GeneralLedgerPage from "./pages/reports/general-ledger/page.tsx";
import AgeingPage from "./pages/reports/ageing/page.tsx";
import POSPage from "./pages/pos/page.tsx";
import MonitoringPage from "./pages/monitoring/page.tsx";
import OrdersPage from "./pages/orders/page.tsx";
import PayrollPage from "./pages/payroll/page.tsx";
import InventoryTrackingPage from "./pages/inventory/page.tsx";
import DataPage from "./pages/data/page.tsx";
import AccountingPage from "./pages/accounting/page.tsx";
import BankingPage from "./pages/banking/page.tsx";
import InvoicingPage from "./pages/invoicing/page.tsx";
import PurchasingPage from "./pages/purchasing/page.tsx";
import AdvancedInventoryPage from "./pages/advanced-inventory/page.tsx";
import PricingPage from "./pages/pricing/page.tsx";
import CommunicationsPage from "./pages/communications/page.tsx";
import ProjectsPage from "./pages/projects/page.tsx";
import SecurityPage from "./pages/security/page.tsx";
import HelpPage from "./pages/help/page.tsx";
import TaxPage from "./pages/tax/page.tsx";
import BudgetPage from "./pages/budget/page.tsx";
import ClaimsPage from "./pages/claims/page.tsx";
import CRMPage from "./pages/crm/page.tsx";
import AlertsPage from "./pages/alerts/page.tsx";
import BranchesPage from "./pages/branches/page.tsx";
import WarrantiesPage from "./pages/warranties/page.tsx";
import LoyaltyPage from "./pages/loyalty/page.tsx";
import CustomerPortalPage from "./pages/portal/page.tsx";
import ShopPage from "./pages/shop/page.tsx";
import ProductDetailPage from "./pages/shop/product-detail.tsx";
import CartPage from "./pages/shop/cart.tsx";
import CheckoutPage from "./pages/shop/checkout.tsx";
import ScheduledReportsPage from "./pages/scheduled-reports/page.tsx";
import CompanyProfilePage from "./pages/company-profile/page.tsx";
import AdminPage from "./pages/admin/page.tsx";
import BatchOperationsPage from "./pages/batch-operations/page.tsx";
import RecurringTransactionsPage from "./pages/recurring-transactions/page.tsx";
import DepositsPage from "./pages/deposits/page.tsx";
import ReturnsPage from "./pages/returns/page.tsx";
import InventoryValuationPage from "./pages/inventory-valuation/page.tsx";
import LoansPage from "./pages/loans/page.tsx";
import ReportBuilderPage from "./pages/report-builder/page.tsx";
import ReportsHubPage from "./pages/reports-hub/page.tsx";
import DayBookPage from "./pages/reports/day-book/page.tsx";
import AuditTrailReportPage from "./pages/reports/audit-trail/page.tsx";
import CustomFieldsPage from "./pages/custom-fields/page.tsx";
import PrintDesignerPage from "./pages/print-designer/page.tsx";
import BillableExpensesPage from "./pages/billable-expenses/page.tsx";
import FulfillmentPage from "./pages/fulfillment/page.tsx";
import UnitsOfMeasurePage from "./pages/units-of-measure/page.tsx";
import { CartProvider } from "./pages/shop/_components/cart-context.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <ErrorBoundary>
        <BrowserRouter>
          <CartProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/pos" element={<POSPage />} />

              {/* Public Storefront */}
              <Route path="/shop" element={<ShopPage />} />
              <Route path="/shop/product/:id" element={<ProductDetailPage />} />
              <Route path="/shop/cart" element={<CartPage />} />
              <Route path="/shop/checkout" element={<CheckoutPage />} />

              {/* Customer Self-Service Portal */}
              <Route path="/portal" element={<CustomerPortalPage />} />

              {/* Admin Panel */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/warehouses" element={<WarehousesPage />} />
                <Route path="/vendors" element={<VendorsPage />} />
                <Route path="/sales" element={<SalesPage />} />
                <Route path="/vehicles" element={<VehiclesPage />} />
                <Route path="/assets" element={<AssetsPage />} />
                <Route path="/audit" element={<AuditPage />} />
                <Route path="/reports-hub" element={<ReportsHubPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/reports/trial-balance" element={<TrialBalancePage />} />
                <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
                <Route path="/reports/profit-loss" element={<ProfitLossPage />} />
                <Route path="/reports/cash-flow" element={<CashFlowPage />} />
                <Route path="/reports/general-ledger" element={<GeneralLedgerPage />} />
                <Route path="/reports/ageing" element={<AgeingPage />} />
                <Route path="/reports/day-book" element={<DayBookPage />} />
                <Route path="/reports/audit-trail" element={<AuditTrailReportPage />} />
                <Route path="/monitoring" element={<MonitoringPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/fulfillment" element={<FulfillmentPage />} />
                <Route path="/units-of-measure" element={<UnitsOfMeasurePage />} />
                <Route path="/payroll" element={<PayrollPage />} />
                <Route path="/inventory" element={<InventoryTrackingPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/accounting" element={<AccountingPage />} />
                <Route path="/banking" element={<BankingPage />} />
                <Route path="/invoicing" element={<InvoicingPage />} />
                <Route path="/purchasing" element={<PurchasingPage />} />
                <Route path="/advanced-inventory" element={<AdvancedInventoryPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/communications" element={<CommunicationsPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/tax" element={<TaxPage />} />
                <Route path="/budget" element={<BudgetPage />} />
                <Route path="/claims" element={<ClaimsPage />} />
                <Route path="/crm" element={<CRMPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/branches" element={<BranchesPage />} />
                <Route path="/warranties" element={<WarrantiesPage />} />
                <Route path="/loyalty" element={<LoyaltyPage />} />
                <Route path="/scheduled-reports" element={<ScheduledReportsPage />} />
                <Route path="/company-profile" element={<CompanyProfilePage />} />
                <Route path="/batch-operations" element={<BatchOperationsPage />} />
                <Route path="/recurring-transactions" element={<RecurringTransactionsPage />} />
                <Route path="/deposits" element={<DepositsPage />} />
                <Route path="/returns" element={<ReturnsPage />} />
                <Route path="/inventory-valuation" element={<InventoryValuationPage />} />
                <Route path="/loans" element={<LoansPage />} />
                <Route path="/report-builder" element={<ReportBuilderPage />} />
                <Route path="/custom-fields" element={<CustomFieldsPage />} />
                <Route path="/print-designer" element={<PrintDesignerPage />} />
                <Route path="/billable-expenses" element={<BillableExpensesPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/help" element={<HelpPage />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CartProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </DefaultProviders>
  );
}
