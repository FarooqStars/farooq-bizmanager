/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounting from "../accounting.js";
import type * as advancePayments from "../advancePayments.js";
import type * as advancedInventory from "../advancedInventory.js";
import type * as advancedReports from "../advancedReports.js";
import type * as alerts from "../alerts.js";
import type * as assembly from "../assembly.js";
import type * as assets from "../assets.js";
import type * as attachments from "../attachments.js";
import type * as audit from "../audit.js";
import type * as authActions from "../authActions.js";
import type * as authStore from "../authStore.js";
import type * as backup from "../backup.js";
import type * as banking from "../banking.js";
import type * as bankingOperations from "../bankingOperations.js";
import type * as batch from "../batch.js";
import type * as billPayments from "../billPayments.js";
import type * as billableExpenses from "../billableExpenses.js";
import type * as branches from "../branches.js";
import type * as budgets from "../budgets.js";
import type * as claims from "../claims.js";
import type * as closingDate from "../closingDate.js";
import type * as communications from "../communications.js";
import type * as companyProfile from "../companyProfile.js";
import type * as creditControlSettings from "../creditControlSettings.js";
import type * as crm from "../crm.js";
import type * as crons from "../crons.js";
import type * as customFields from "../customFields.js";
import type * as customerDeposits from "../customerDeposits.js";
import type * as customerPortal from "../customerPortal.js";
import type * as dashboard from "../dashboard.js";
import type * as deliveryNotes from "../deliveryNotes.js";
import type * as depreciation from "../depreciation.js";
import type * as emails from "../emails.js";
import type * as entityLinks from "../entityLinks.js";
import type * as financeCharges from "../financeCharges.js";
import type * as fulfillment from "../fulfillment.js";
import type * as goodsReceipts from "../goodsReceipts.js";
import type * as http from "../http.js";
import type * as inventoryValuation from "../inventoryValuation.js";
import type * as invoicing from "../invoicing.js";
import type * as jobCosting from "../jobCosting.js";
import type * as journalEntries from "../journalEntries.js";
import type * as landedCost from "../landedCost.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authShared from "../lib/authShared.js";
import type * as lib_creditControl from "../lib/creditControl.js";
import type * as lib_depreciationCalc from "../lib/depreciationCalc.js";
import type * as lib_docNumber from "../lib/docNumber.js";
import type * as lib_inventoryPosting from "../lib/inventoryPosting.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_ledgerReports from "../lib/ledgerReports.js";
import type * as lib_mailer from "../lib/mailer.js";
import type * as lib_openingBalances from "../lib/openingBalances.js";
import type * as lib_payablesPosting from "../lib/payablesPosting.js";
import type * as lib_payrollPosting from "../lib/payrollPosting.js";
import type * as lib_reportQueries from "../lib/reportQueries.js";
import type * as lib_salesPosting from "../lib/salesPosting.js";
import type * as lib_sourceTypes from "../lib/sourceTypes.js";
import type * as loans from "../loans.js";
import type * as loyalty from "../loyalty.js";
import type * as migrations_backfillJournalLines from "../migrations/backfillJournalLines.js";
import type * as monitoring from "../monitoring.js";
import type * as notifications from "../notifications.js";
import type * as payments from "../payments.js";
import type * as payroll from "../payroll.js";
import type * as payrollEnhancements from "../payrollEnhancements.js";
import type * as pricing from "../pricing.js";
import type * as printTemplates from "../printTemplates.js";
import type * as products from "../products.js";
import type * as profitAndLoss from "../profitAndLoss.js";
import type * as projects from "../projects.js";
import type * as purchasing from "../purchasing.js";
import type * as reconcileOpeningBalances from "../reconcileOpeningBalances.js";
import type * as recurring from "../recurring.js";
import type * as recurringTransactions from "../recurringTransactions.js";
import type * as reportBuilder from "../reportBuilder.js";
import type * as reports from "../reports.js";
import type * as reports_ageing from "../reports/ageing.js";
import type * as reports_dayBook from "../reports/dayBook.js";
import type * as reports_financialStatements from "../reports/financialStatements.js";
import type * as reports_generalLedger from "../reports/generalLedger.js";
import type * as reports_perItem from "../reports/perItem.js";
import type * as reports_receivablesPayables from "../reports/receivablesPayables.js";
import type * as reports_reconciliation from "../reports/reconciliation.js";
import type * as returns from "../returns.js";
import type * as salaryAdvances from "../salaryAdvances.js";
import type * as sales from "../sales.js";
import type * as salesOrders from "../salesOrders.js";
import type * as scheduledReports from "../scheduledReports.js";
import type * as search from "../search.js";
import type * as security from "../security.js";
import type * as statementCharges from "../statementCharges.js";
import type * as statements from "../statements.js";
import type * as stockMovements from "../stockMovements.js";
import type * as storefront from "../storefront.js";
import type * as tax from "../tax.js";
import type * as unitMeasures from "../unitMeasures.js";
import type * as users from "../users.js";
import type * as vehicles from "../vehicles.js";
import type * as vendors from "../vendors.js";
import type * as warehouseBins from "../warehouseBins.js";
import type * as warranties from "../warranties.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  advancePayments: typeof advancePayments;
  advancedInventory: typeof advancedInventory;
  advancedReports: typeof advancedReports;
  alerts: typeof alerts;
  assembly: typeof assembly;
  assets: typeof assets;
  attachments: typeof attachments;
  audit: typeof audit;
  authActions: typeof authActions;
  authStore: typeof authStore;
  backup: typeof backup;
  banking: typeof banking;
  bankingOperations: typeof bankingOperations;
  batch: typeof batch;
  billPayments: typeof billPayments;
  billableExpenses: typeof billableExpenses;
  branches: typeof branches;
  budgets: typeof budgets;
  claims: typeof claims;
  closingDate: typeof closingDate;
  communications: typeof communications;
  companyProfile: typeof companyProfile;
  creditControlSettings: typeof creditControlSettings;
  crm: typeof crm;
  crons: typeof crons;
  customFields: typeof customFields;
  customerDeposits: typeof customerDeposits;
  customerPortal: typeof customerPortal;
  dashboard: typeof dashboard;
  deliveryNotes: typeof deliveryNotes;
  depreciation: typeof depreciation;
  emails: typeof emails;
  entityLinks: typeof entityLinks;
  financeCharges: typeof financeCharges;
  fulfillment: typeof fulfillment;
  goodsReceipts: typeof goodsReceipts;
  http: typeof http;
  inventoryValuation: typeof inventoryValuation;
  invoicing: typeof invoicing;
  jobCosting: typeof jobCosting;
  journalEntries: typeof journalEntries;
  landedCost: typeof landedCost;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/authShared": typeof lib_authShared;
  "lib/creditControl": typeof lib_creditControl;
  "lib/depreciationCalc": typeof lib_depreciationCalc;
  "lib/docNumber": typeof lib_docNumber;
  "lib/inventoryPosting": typeof lib_inventoryPosting;
  "lib/ledger": typeof lib_ledger;
  "lib/ledgerReports": typeof lib_ledgerReports;
  "lib/mailer": typeof lib_mailer;
  "lib/openingBalances": typeof lib_openingBalances;
  "lib/payablesPosting": typeof lib_payablesPosting;
  "lib/payrollPosting": typeof lib_payrollPosting;
  "lib/reportQueries": typeof lib_reportQueries;
  "lib/salesPosting": typeof lib_salesPosting;
  "lib/sourceTypes": typeof lib_sourceTypes;
  loans: typeof loans;
  loyalty: typeof loyalty;
  "migrations/backfillJournalLines": typeof migrations_backfillJournalLines;
  monitoring: typeof monitoring;
  notifications: typeof notifications;
  payments: typeof payments;
  payroll: typeof payroll;
  payrollEnhancements: typeof payrollEnhancements;
  pricing: typeof pricing;
  printTemplates: typeof printTemplates;
  products: typeof products;
  profitAndLoss: typeof profitAndLoss;
  projects: typeof projects;
  purchasing: typeof purchasing;
  reconcileOpeningBalances: typeof reconcileOpeningBalances;
  recurring: typeof recurring;
  recurringTransactions: typeof recurringTransactions;
  reportBuilder: typeof reportBuilder;
  reports: typeof reports;
  "reports/ageing": typeof reports_ageing;
  "reports/dayBook": typeof reports_dayBook;
  "reports/financialStatements": typeof reports_financialStatements;
  "reports/generalLedger": typeof reports_generalLedger;
  "reports/perItem": typeof reports_perItem;
  "reports/receivablesPayables": typeof reports_receivablesPayables;
  "reports/reconciliation": typeof reports_reconciliation;
  returns: typeof returns;
  salaryAdvances: typeof salaryAdvances;
  sales: typeof sales;
  salesOrders: typeof salesOrders;
  scheduledReports: typeof scheduledReports;
  search: typeof search;
  security: typeof security;
  statementCharges: typeof statementCharges;
  statements: typeof statements;
  stockMovements: typeof stockMovements;
  storefront: typeof storefront;
  tax: typeof tax;
  unitMeasures: typeof unitMeasures;
  users: typeof users;
  vehicles: typeof vehicles;
  vendors: typeof vendors;
  warehouseBins: typeof warehouseBins;
  warranties: typeof warranties;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
