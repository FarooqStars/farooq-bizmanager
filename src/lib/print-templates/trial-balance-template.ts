/**
 * Generates printable HTML for a Trial Balance report.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";

type TrialBalanceRow = {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
};

type TrialBalanceData = {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  currency?: string;
};

type CompanyProfile = {
  nameEn: string;
  nameAr?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  crNumber?: string;
  taxId?: string;
  invoiceFooterEn?: string;
  invoiceFooterAr?: string;
};

export function generateTrialBalanceHtml(
  data: TrialBalanceData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = data.currency || "QAR";
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl, dir);
  const isBalanced = Math.abs(data.totalDebit - data.totalCredit) < 0.01;

  const tableRows = data.rows.length > 0
    ? data.rows
        .map(
          (row) => `<tr>
          <td class="code-cell">${escapeHtml(row.code)}</td>
          <td>${escapeHtml(row.name)}</td>
          <td class="type-cell">${escapeHtml(row.type)}</td>
          <td class="amount">${row.debit !== 0 ? formatCurrency(row.debit, curr) : "-"}</td>
          <td class="amount">${row.credit !== 0 ? formatCurrency(row.credit, curr) : "-"}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty-row">${labels.noAccounts}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.title}</title>
  <style>${css}
    .tb-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .tb-table th {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      text-align: ${dir === "rtl" ? "right" : "left"};
    }
    .tb-table th.amount {
      text-align: ${dir === "rtl" ? "left" : "right"};
    }
    .tb-table td {
      border: 1px solid #ddd;
      padding: 6px 10px;
      font-size: 12px;
      vertical-align: middle;
    }
    .tb-table td.code-cell {
      color: #888;
      font-family: monospace;
      font-size: 11px;
      width: 70px;
    }
    .tb-table td.type-cell {
      font-size: 11px;
      color: #666;
      text-transform: capitalize;
      width: 100px;
    }
    .tb-table td.amount {
      text-align: ${dir === "rtl" ? "left" : "right"};
      font-variant-numeric: tabular-nums;
      width: 140px;
    }
    .tb-table td.empty-row {
      text-align: center;
      color: #888;
      font-style: italic;
      padding: 16px;
    }
    .tb-table tr:nth-child(even) {
      background: #fafafa;
    }
    .tb-totals-row td {
      font-size: 13px;
      font-weight: 700;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
      padding: 10px;
      background: #f9fafb !important;
    }
    .tb-equation-check {
      margin-top: 16px;
      padding: 12px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tb-equation-check.balanced { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
    .tb-equation-check.unbalanced { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
    .tb-equation-check .icon { font-size: 16px; }
    .tb-summary {
      margin-top: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }
    .tb-summary-box {
      padding: 12px;
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      text-align: center;
    }
    .tb-summary-box .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; }
    .tb-summary-box .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.title}</h1>
      <div class="doc-number">${labels.asOf}: ${formatDate(data.asOfDate)}</div>
    </div>

    <!-- Trial Balance Table -->
    <table class="tb-table">
      <thead>
        <tr>
          <th>${labels.code}</th>
          <th>${labels.account}</th>
          <th>${labels.type}</th>
          <th class="amount">${labels.debit}</th>
          <th class="amount">${labels.credit}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
        <tr class="tb-totals-row">
          <td></td>
          <td>${labels.totals}</td>
          <td></td>
          <td class="amount">${formatCurrency(data.totalDebit, curr)}</td>
          <td class="amount">${formatCurrency(data.totalCredit, curr)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Balance check -->
    <div class="tb-equation-check ${isBalanced ? "balanced" : "unbalanced"}">
      <span class="icon">${isBalanced ? "✓" : "✗"}</span>
      <span>${isBalanced ? labels.balanced : labels.unbalanced}</span>
    </div>

    <!-- Summary -->
    <div class="tb-summary">
      <div class="tb-summary-box">
        <div class="label">${labels.totalAccounts}</div>
        <div class="value">${data.rows.length}</div>
      </div>
      <div class="tb-summary-box">
        <div class="label">${labels.totalDebitLabel}</div>
        <div class="value">${formatCurrency(data.totalDebit, curr)}</div>
      </div>
      <div class="tb-summary-box">
        <div class="label">${labels.totalCreditLabel}</div>
        <div class="value">${formatCurrency(data.totalCredit, curr)}</div>
      </div>
    </div>
  </div>
  <div class="no-print" style="text-align:center;margin:20px;">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#1a56db;color:white;border:none;border-radius:6px;margin-right:8px;">${labels.print}</button>
    <button onclick="window.close()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#6b7280;color:white;border:none;border-radius:6px;">${labels.close}</button>
  </div>
</body>
</html>`;
}

function getLabels(lang: string) {
  if (lang === "ar") {
    return {
      title: "ميزان المراجعة",
      asOf: "كما في",
      code: "الرمز",
      account: "الحساب",
      type: "النوع",
      debit: "مدين",
      credit: "دائن",
      totals: "الإجمالي",
      balanced: "ميزان المراجعة متوازن: إجمالي المدين = إجمالي الدائن",
      unbalanced: "تحذير: ميزان المراجعة غير متوازن",
      noAccounts: "لا توجد حسابات",
      totalAccounts: "عدد الحسابات",
      totalDebitLabel: "إجمالي المدين",
      totalCreditLabel: "إجمالي الدائن",
      print: "طباعة",
      close: "إغلاق",
    };
  }
  if (lang === "ur") {
    return {
      title: "ٹرائل بیلنس",
      asOf: "بتاریخ",
      code: "کوڈ",
      account: "اکاؤنٹ",
      type: "قسم",
      debit: "ڈیبٹ",
      credit: "کریڈٹ",
      totals: "کل",
      balanced: "ٹرائل بیلنس متوازن ہے: کل ڈیبٹ = کل کریڈٹ",
      unbalanced: "انتباہ: ٹرائل بیلنس غیر متوازن ہے",
      noAccounts: "کوئی اکاؤنٹ نہیں",
      totalAccounts: "کل اکاؤنٹس",
      totalDebitLabel: "کل ڈیبٹ",
      totalCreditLabel: "کل کریڈٹ",
      print: "پرنٹ",
      close: "بند کریں",
    };
  }
  return {
    title: "Trial Balance",
    asOf: "As of",
    code: "Code",
    account: "Account Name",
    type: "Type",
    debit: "Debit",
    credit: "Credit",
    totals: "Totals",
    balanced: "Trial balance is balanced: Total Debits = Total Credits",
    unbalanced: "Warning: Trial balance is not balanced",
    noAccounts: "No accounts with balances",
    totalAccounts: "Total Accounts",
    totalDebitLabel: "Total Debit",
    totalCreditLabel: "Total Credit",
    print: "Print",
    close: "Close",
  };
}

function buildCompanyHeader(
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  dir: string
): string {
  if (!company) {
    return `<div class="document-header"><div class="company-info"><div><h2 class="company-name">BizManager</h2></div></div></div>`;
  }
  const logo = logoUrl ? `<img src="${logoUrl}" class="company-logo" alt="Logo" />` : "";
  const contacts: string[] = [];
  if (company.phone) contacts.push(company.phone);
  if (company.email) contacts.push(company.email);
  if (company.website) contacts.push(company.website);
  if (company.crNumber) contacts.push(`CR: ${company.crNumber}`);
  if (company.taxId) contacts.push(`Tax ID: ${company.taxId}`);

  // Bilingual header: English left, Arabic right
  const nameSection = dir === "rtl"
    ? `<h2 class="company-name">${escapeHtml(company.nameAr || company.nameEn)}</h2>
       ${company.nameEn && company.nameAr ? `<p class="company-name-ar" style="direction:ltr;font-size:14px;color:#555;">${escapeHtml(company.nameEn)}</p>` : ""}`
    : `<h2 class="company-name">${escapeHtml(company.nameEn)}</h2>
       ${company.nameAr ? `<p class="company-name-ar">${escapeHtml(company.nameAr)}</p>` : ""}`;

  return `<div class="document-header">
    <div class="company-info">
      ${logo}
      <div>
        ${nameSection}
        ${company.address ? `<p class="company-address">${escapeHtml(company.address)}</p>` : ""}
      </div>
    </div>
    <div class="company-contacts">
      ${contacts.map((c) => `<div>${escapeHtml(c)}</div>`).join("")}
    </div>
  </div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
