/**
 * Generates printable HTML for a Balance Sheet (Statement of Financial Position).
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";

type AccountLine = {
  code: string;
  name: string;
  balance: number;
};

type BalanceSheetData = {
  asOfDate: string;
  assets: AccountLine[];
  liabilities: AccountLine[];
  equity: AccountLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
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

export function generateBalanceSheetHtml(
  data: BalanceSheetData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = data.currency || "QAR";
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl, dir);
  const assetsRows = buildAccountRows(data.assets, curr);
  const liabilitiesRows = buildAccountRows(data.liabilities, curr);
  const equityRows = buildAccountRows(data.equity, curr);

  const isBalanced = Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.title}</title>
  <style>${css}
    .bs-section { margin: 16px 0; }
    .bs-section-header {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1a1a1a;
      padding: 8px 10px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      letter-spacing: 0.5px;
    }
    .bs-row {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      border-bottom: 1px solid #eee;
      padding: 6px 10px;
      font-size: 12px;
      align-items: center;
    }
    .bs-row.header {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      color: #888;
      background: #fafafa;
      border-bottom: 1px solid #ddd;
    }
    .bs-row .code { color: #888; font-family: monospace; font-size: 11px; }
    .bs-row .amount { text-align: ${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
    .bs-subtotal {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      padding: 8px 10px;
      font-size: 13px;
      font-weight: 700;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
      margin-bottom: 16px;
    }
    .bs-subtotal .amount { text-align: ${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
    .bs-grand-total {
      display: grid;
      grid-template-columns: 70px 1fr 140px;
      padding: 12px 10px;
      font-size: 15px;
      font-weight: 700;
      background: #f0f9ff;
      border: 2px solid #1a56db;
      border-radius: 4px;
      margin-top: 16px;
    }
    .bs-grand-total .amount { text-align: ${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
    .bs-equation-check {
      margin-top: 16px;
      padding: 12px;
      border-radius: 4px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bs-equation-check.balanced { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
    .bs-equation-check.unbalanced { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
    .bs-equation-check .icon { font-size: 16px; }
    .bs-empty { color: #888; font-style: italic; padding: 8px 10px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.title}</h1>
      <div class="doc-number">${labels.asOf}: ${formatDate(data.asOfDate)}</div>
    </div>

    <!-- Column headers -->
    <div class="bs-row header">
      <div>${labels.code}</div>
      <div>${labels.account}</div>
      <div class="amount">${labels.balance}</div>
    </div>

    <!-- Assets -->
    <div class="bs-section">
      <div class="bs-section-header">${labels.assets}</div>
      ${assetsRows || `<div class="bs-empty">${labels.noAccounts}</div>`}
    </div>
    <div class="bs-subtotal">
      <div></div>
      <div>${labels.totalAssets}</div>
      <div class="amount">${formatCurrency(data.totalAssets, curr)}</div>
    </div>

    <!-- Liabilities -->
    <div class="bs-section">
      <div class="bs-section-header">${labels.liabilities}</div>
      ${liabilitiesRows || `<div class="bs-empty">${labels.noAccounts}</div>`}
    </div>
    <div class="bs-subtotal">
      <div></div>
      <div>${labels.totalLiabilities}</div>
      <div class="amount">${formatCurrency(data.totalLiabilities, curr)}</div>
    </div>

    <!-- Equity -->
    <div class="bs-section">
      <div class="bs-section-header">${labels.equity}</div>
      ${equityRows || `<div class="bs-empty">${labels.noAccounts}</div>`}
    </div>
    <div class="bs-subtotal">
      <div></div>
      <div>${labels.totalEquity}</div>
      <div class="amount">${formatCurrency(data.totalEquity, curr)}</div>
    </div>

    <!-- Total Liabilities & Equity -->
    <div class="bs-grand-total">
      <div></div>
      <div>${labels.totalLiabilitiesAndEquity}</div>
      <div class="amount">${formatCurrency(data.totalLiabilitiesAndEquity, curr)}</div>
    </div>

    <!-- Equation check -->
    <div class="bs-equation-check ${isBalanced ? "balanced" : "unbalanced"}">
      <span class="icon">${isBalanced ? "✓" : "✗"}</span>
      <span>${isBalanced ? labels.balanced : labels.unbalanced}</span>
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
      title: "قائمة المركز المالي",
      asOf: "كما في",
      code: "الرمز",
      account: "الحساب",
      balance: "الرصيد",
      assets: "الأصول",
      totalAssets: "إجمالي الأصول",
      liabilities: "الالتزامات",
      totalLiabilities: "إجمالي الالتزامات",
      equity: "حقوق الملكية",
      totalEquity: "إجمالي حقوق الملكية",
      totalLiabilitiesAndEquity: "إجمالي الالتزامات وحقوق الملكية",
      balanced: "المعادلة المحاسبية متوازنة: الأصول = الالتزامات + حقوق الملكية",
      unbalanced: "تحذير: المعادلة المحاسبية غير متوازنة",
      noAccounts: "لا توجد حسابات",
      print: "طباعة",
      close: "إغلاق",
    };
  }
  if (lang === "ur") {
    return {
      title: "بیلنس شیٹ",
      asOf: "بتاریخ",
      code: "کوڈ",
      account: "اکاؤنٹ",
      balance: "بیلنس",
      assets: "اثاثے",
      totalAssets: "کل اثاثے",
      liabilities: "واجبات",
      totalLiabilities: "کل واجبات",
      equity: "ایکویٹی",
      totalEquity: "کل ایکویٹی",
      totalLiabilitiesAndEquity: "کل واجبات اور ایکویٹی",
      balanced: "اکاؤنٹنگ مساوات متوازن ہے: اثاثے = واجبات + ایکویٹی",
      unbalanced: "انتباہ: اکاؤنٹنگ مساوات غیر متوازن ہے",
      noAccounts: "کوئی اکاؤنٹ نہیں",
      print: "پرنٹ",
      close: "بند کریں",
    };
  }
  return {
    title: "Balance Sheet",
    asOf: "As of",
    code: "Code",
    account: "Account",
    balance: "Balance",
    assets: "Assets",
    totalAssets: "Total Assets",
    liabilities: "Liabilities",
    totalLiabilities: "Total Liabilities",
    equity: "Equity",
    totalEquity: "Total Equity",
    totalLiabilitiesAndEquity: "Total Liabilities & Equity",
    balanced: "Accounting equation balanced: Assets = Liabilities + Equity",
    unbalanced: "Warning: Accounting equation is not balanced",
    noAccounts: "No accounts",
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

function buildAccountRows(accounts: AccountLine[], curr: string): string {
  if (accounts.length === 0) return "";

  return accounts
    .map(
      (acc) => `<div class="bs-row">
      <div class="code">${escapeHtml(acc.code)}</div>
      <div>${escapeHtml(acc.name)}</div>
      <div class="amount">${formatCurrency(acc.balance, curr)}</div>
    </div>`
    )
    .join("");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
