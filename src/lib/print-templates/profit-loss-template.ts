/**
 * Generates printable HTML for a Profit & Loss (Income Statement) report.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";

type AccountLine = {
  code: string;
  name: string;
  amount: number;
  previousAmount: number;
  change: number;
  changePercent: number | null;
};

type AccountGroup = {
  groupName: string;
  accounts: AccountLine[];
  total: number;
  previousTotal: number;
};

type ProfitLossData = {
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  revenue: AccountGroup;
  costOfGoodsSold: AccountGroup;
  grossProfit: number;
  previousGrossProfit: number;
  operatingExpenses: AccountGroup;
  netProfit: number;
  previousNetProfit: number;
  grossProfitMargin: number | null;
  netProfitMargin: number | null;
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

export function generateProfitLossHtml(
  data: ProfitLossData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = data.currency || "QAR";
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl);
  const revenueSection = buildGroupSection(data.revenue, curr, labels, "revenue");
  const cogsSection = buildGroupSection(data.costOfGoodsSold, curr, labels, "cogs");
  const opExpSection = buildGroupSection(data.operatingExpenses, curr, labels, "expense");

  const grossChange = data.grossProfit - data.previousGrossProfit;
  const netChange = data.netProfit - data.previousNetProfit;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.title}</title>
  <style>${css}
    .pl-section { margin: 16px 0; }
    .pl-section-header {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1a1a1a;
      padding: 8px 10px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      letter-spacing: 0.5px;
    }
    .pl-row {
      display: grid;
      grid-template-columns: 60px 1fr 120px 120px 100px;
      border-bottom: 1px solid #eee;
      padding: 6px 10px;
      font-size: 12px;
      align-items: center;
    }
    .pl-row.header {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      color: #888;
      background: #fafafa;
      border-bottom: 1px solid #ddd;
    }
    .pl-row .code { color: #888; font-family: monospace; font-size: 11px; }
    .pl-row .amount { text-align: ${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
    .pl-row .change { text-align: ${dir === "rtl" ? "left" : "right"}; font-size: 11px; }
    .pl-row .change.positive { color: #16a34a; }
    .pl-row .change.negative { color: #dc2626; }
    .pl-subtotal {
      display: grid;
      grid-template-columns: 60px 1fr 120px 120px 100px;
      padding: 8px 10px;
      font-size: 13px;
      font-weight: 700;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
      margin-bottom: 16px;
    }
    .pl-subtotal .amount { text-align: ${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
    .pl-subtotal .change { text-align: ${dir === "rtl" ? "left" : "right"}; font-size: 11px; }
    .pl-subtotal .change.positive { color: #16a34a; }
    .pl-subtotal .change.negative { color: #dc2626; }
    .pl-grand-total {
      display: grid;
      grid-template-columns: 60px 1fr 120px 120px 100px;
      padding: 12px 10px;
      font-size: 15px;
      font-weight: 700;
      background: #f0f9ff;
      border: 2px solid #1a56db;
      border-radius: 4px;
      margin-top: 16px;
    }
    .pl-grand-total .amount { text-align: ${dir === "rtl" ? "left" : "right"}; font-variant-numeric: tabular-nums; }
    .pl-grand-total .change { text-align: ${dir === "rtl" ? "left" : "right"}; font-size: 12px; }
    .pl-grand-total .change.positive { color: #16a34a; }
    .pl-grand-total .change.negative { color: #dc2626; }
    .margin-note {
      margin-top: 16px;
      padding: 12px;
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 12px;
    }
    .margin-note .label { color: #888; font-size: 11px; text-transform: uppercase; font-weight: 600; }
    .margin-note .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.title}</h1>
      <div class="doc-number">${labels.period}: ${formatDate(data.period.start)} - ${formatDate(data.period.end)}</div>
    </div>

    <!-- Column headers -->
    <div class="pl-row header">
      <div>${labels.code}</div>
      <div>${labels.account}</div>
      <div class="amount">${labels.currentPeriod}</div>
      <div class="amount">${labels.previousPeriod}</div>
      <div class="change">${labels.change}</div>
    </div>

    <!-- Revenue -->
    ${revenueSection}
    <div class="pl-subtotal">
      <div></div>
      <div>${labels.totalRevenue}</div>
      <div class="amount">${formatCurrency(data.revenue.total, curr)}</div>
      <div class="amount">${formatCurrency(data.revenue.previousTotal, curr)}</div>
      <div class="change ${data.revenue.total - data.revenue.previousTotal >= 0 ? "positive" : "negative"}">${formatChange(data.revenue.total - data.revenue.previousTotal, curr)}</div>
    </div>

    <!-- COGS -->
    ${cogsSection}
    <div class="pl-subtotal">
      <div></div>
      <div>${labels.totalCogs}</div>
      <div class="amount">${formatCurrency(data.costOfGoodsSold.total, curr)}</div>
      <div class="amount">${formatCurrency(data.costOfGoodsSold.previousTotal, curr)}</div>
      <div class="change ${data.costOfGoodsSold.total - data.costOfGoodsSold.previousTotal <= 0 ? "positive" : "negative"}">${formatChange(data.costOfGoodsSold.total - data.costOfGoodsSold.previousTotal, curr)}</div>
    </div>

    <!-- Gross Profit -->
    <div class="pl-subtotal" style="background:#f0fdf4;border-color:#16a34a;">
      <div></div>
      <div>${labels.grossProfit}</div>
      <div class="amount">${formatCurrency(data.grossProfit, curr)}</div>
      <div class="amount">${formatCurrency(data.previousGrossProfit, curr)}</div>
      <div class="change ${grossChange >= 0 ? "positive" : "negative"}">${formatChange(grossChange, curr)}</div>
    </div>

    <!-- Operating Expenses -->
    ${opExpSection}
    <div class="pl-subtotal">
      <div></div>
      <div>${labels.totalOpExp}</div>
      <div class="amount">${formatCurrency(data.operatingExpenses.total, curr)}</div>
      <div class="amount">${formatCurrency(data.operatingExpenses.previousTotal, curr)}</div>
      <div class="change ${data.operatingExpenses.total - data.operatingExpenses.previousTotal <= 0 ? "positive" : "negative"}">${formatChange(data.operatingExpenses.total - data.operatingExpenses.previousTotal, curr)}</div>
    </div>

    <!-- Net Profit -->
    <div class="pl-grand-total">
      <div></div>
      <div>${labels.netProfit}</div>
      <div class="amount">${formatCurrency(data.netProfit, curr)}</div>
      <div class="amount">${formatCurrency(data.previousNetProfit, curr)}</div>
      <div class="change ${netChange >= 0 ? "positive" : "negative"}">${formatChange(netChange, curr)}</div>
    </div>

    <!-- Margins -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
      <div class="margin-note">
        <div class="label">${labels.grossMargin}</div>
        <div class="value">${data.grossProfitMargin !== null ? data.grossProfitMargin.toFixed(1) + "%" : "N/A"}</div>
      </div>
      <div class="margin-note">
        <div class="label">${labels.netMargin}</div>
        <div class="value">${data.netProfitMargin !== null ? data.netProfitMargin.toFixed(1) + "%" : "N/A"}</div>
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
      title: "بيان الأرباح والخسائر",
      period: "الفترة",
      code: "الرمز",
      account: "الحساب",
      currentPeriod: "الفترة الحالية",
      previousPeriod: "الفترة السابقة",
      change: "التغيير",
      revenue: "الإيرادات",
      totalRevenue: "إجمالي الإيرادات",
      cogs: "تكلفة البضائع المباعة",
      totalCogs: "إجمالي تكلفة البضائع",
      grossProfit: "إجمالي الربح",
      operatingExpenses: "المصروفات التشغيلية",
      totalOpExp: "إجمالي المصروفات التشغيلية",
      netProfit: "صافي الربح",
      grossMargin: "هامش الربح الإجمالي",
      netMargin: "هامش صافي الربح",
      print: "طباعة",
      close: "إغلاق",
    };
  }
  if (lang === "ur") {
    return {
      title: "نفع و نقصان بیان",
      period: "مدت",
      code: "کوڈ",
      account: "اکاؤنٹ",
      currentPeriod: "موجودہ مدت",
      previousPeriod: "گزشتہ مدت",
      change: "تبدیلی",
      revenue: "آمدنی",
      totalRevenue: "کل آمدنی",
      cogs: "فروخت شدہ سامان کی لاگت",
      totalCogs: "کل لاگت",
      grossProfit: "مجموعی منافع",
      operatingExpenses: "آپریٹنگ اخراجات",
      totalOpExp: "کل آپریٹنگ اخراجات",
      netProfit: "خالص منافع",
      grossMargin: "مجموعی منافع مارجن",
      netMargin: "خالص منافع مارجن",
      print: "پرنٹ",
      close: "بند کریں",
    };
  }
  return {
    title: "Profit & Loss Statement",
    period: "Period",
    code: "Code",
    account: "Account",
    currentPeriod: "Current Period",
    previousPeriod: "Previous Period",
    change: "Change",
    revenue: "Revenue",
    totalRevenue: "Total Revenue",
    cogs: "Cost of Goods Sold",
    totalCogs: "Total COGS",
    grossProfit: "Gross Profit",
    operatingExpenses: "Operating Expenses",
    totalOpExp: "Total Operating Expenses",
    netProfit: "Net Profit / (Loss)",
    grossMargin: "Gross Profit Margin",
    netMargin: "Net Profit Margin",
    print: "Print",
    close: "Close",
  };
}

function buildCompanyHeader(company: CompanyProfile | null | undefined, logoUrl: string | null | undefined): string {
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

  return `<div class="document-header">
    <div class="company-info">
      ${logo}
      <div>
        <h2 class="company-name">${escapeHtml(company.nameEn)}</h2>
        ${company.nameAr ? `<p class="company-name-ar">${escapeHtml(company.nameAr)}</p>` : ""}
        ${company.address ? `<p class="company-address">${escapeHtml(company.address)}</p>` : ""}
      </div>
    </div>
    <div class="company-contacts">
      ${contacts.map((c) => `<div>${escapeHtml(c)}</div>`).join("")}
    </div>
  </div>`;
}

function buildGroupSection(group: AccountGroup, curr: string, labels: ReturnType<typeof getLabels>, type: string): string {
  const sectionLabel = type === "revenue" ? labels.revenue : type === "cogs" ? labels.cogs : labels.operatingExpenses;

  if (group.accounts.length === 0) {
    return `<div class="pl-section">
      <div class="pl-section-header">${sectionLabel}</div>
      <div class="pl-row" style="color:#888;font-style:italic;"><div></div><div>No accounts with activity</div><div></div><div></div><div></div></div>
    </div>`;
  }

  const rows = group.accounts.map((acc) => {
    const changeClass = acc.change >= 0
      ? (type === "revenue" ? "positive" : "negative")
      : (type === "revenue" ? "negative" : "positive");
    return `<div class="pl-row">
      <div class="code">${escapeHtml(acc.code)}</div>
      <div>${escapeHtml(acc.name)}</div>
      <div class="amount">${formatCurrency(acc.amount, curr)}</div>
      <div class="amount">${formatCurrency(acc.previousAmount, curr)}</div>
      <div class="change ${changeClass}">${acc.changePercent !== null ? (acc.changePercent >= 0 ? "+" : "") + acc.changePercent.toFixed(1) + "%" : "-"}</div>
    </div>`;
  }).join("");

  return `<div class="pl-section">
    <div class="pl-section-header">${sectionLabel}</div>
    ${rows}
  </div>`;
}

function formatChange(amount: number, curr: string): string {
  const prefix = amount >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(amount, curr)}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
