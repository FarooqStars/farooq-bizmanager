/**
 * Generates printable HTML for a Cash Flow Statement.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";

type CashFlowItem = {
  label: string;
  amount: number;
};

type CashFlowSection = {
  items: CashFlowItem[];
  total: number;
};

type CashFlowData = {
  period: { start: string; end: string };
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
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

export function generateCashFlowHtml(
  data: CashFlowData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = data.currency || "QAR";
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl, dir);
  const operatingSection = buildCashFlowSection(data.operating, labels.operating, labels.totalOperating, curr, dir);
  const investingSection = buildCashFlowSection(data.investing, labels.investing, labels.totalInvesting, curr, dir);
  const financingSection = buildCashFlowSection(data.financing, labels.financing, labels.totalFinancing, curr, dir);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.title}</title>
  <style>${css}
    .cf-section { margin: 16px 0; }
    .cf-section-header {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1a1a1a;
      padding: 8px 10px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      letter-spacing: 0.5px;
    }
    .cf-row {
      display: grid;
      grid-template-columns: 1fr 150px;
      border-bottom: 1px solid #eee;
      padding: 6px 10px;
      font-size: 12px;
      align-items: center;
    }
    .cf-row .amount {
      text-align: ${dir === "rtl" ? "left" : "right"};
      font-variant-numeric: tabular-nums;
    }
    .cf-row .amount.positive { color: #16a34a; }
    .cf-row .amount.negative { color: #dc2626; }
    .cf-subtotal {
      display: grid;
      grid-template-columns: 1fr 150px;
      padding: 8px 10px;
      font-size: 13px;
      font-weight: 700;
      border-top: 2px solid #333;
      border-bottom: 2px solid #333;
      margin-bottom: 16px;
    }
    .cf-subtotal .amount {
      text-align: ${dir === "rtl" ? "left" : "right"};
      font-variant-numeric: tabular-nums;
    }
    .cf-subtotal .amount.positive { color: #16a34a; }
    .cf-subtotal .amount.negative { color: #dc2626; }
    .cf-grand-total {
      display: grid;
      grid-template-columns: 1fr 150px;
      padding: 12px 10px;
      font-size: 15px;
      font-weight: 700;
      background: #f0f9ff;
      border: 2px solid #1a56db;
      border-radius: 4px;
      margin-top: 16px;
    }
    .cf-grand-total .amount {
      text-align: ${dir === "rtl" ? "left" : "right"};
      font-variant-numeric: tabular-nums;
    }
    .cf-balances {
      margin-top: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }
    .cf-balance-box {
      padding: 12px;
      background: #fafafa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      text-align: center;
    }
    .cf-balance-box .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; }
    .cf-balance-box .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .cf-balance-box .value.positive { color: #16a34a; }
    .cf-balance-box .value.negative { color: #dc2626; }
    .cf-empty { color: #888; font-style: italic; padding: 8px 10px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.title}</h1>
      <div class="doc-number">${labels.period}: ${formatDate(data.period.start)} - ${formatDate(data.period.end)}</div>
    </div>

    <!-- Operating Activities -->
    ${operatingSection}

    <!-- Investing Activities -->
    ${investingSection}

    <!-- Financing Activities -->
    ${financingSection}

    <!-- Net Cash Flow -->
    <div class="cf-grand-total">
      <div>${labels.netCashFlow}</div>
      <div class="amount">${formatCurrency(data.netCashFlow, curr)}</div>
    </div>

    <!-- Cash Balances -->
    <div class="cf-balances">
      <div class="cf-balance-box">
        <div class="label">${labels.openingBalance}</div>
        <div class="value">${formatCurrency(data.openingBalance, curr)}</div>
      </div>
      <div class="cf-balance-box">
        <div class="label">${labels.netChange}</div>
        <div class="value ${data.netCashFlow >= 0 ? "positive" : "negative"}">${formatSignedCurrency(data.netCashFlow, curr)}</div>
      </div>
      <div class="cf-balance-box">
        <div class="label">${labels.closingBalance}</div>
        <div class="value">${formatCurrency(data.closingBalance, curr)}</div>
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
      title: "بيان التدفقات النقدية",
      period: "الفترة",
      operating: "الأنشطة التشغيلية",
      totalOperating: "صافي النقد من الأنشطة التشغيلية",
      investing: "الأنشطة الاستثمارية",
      totalInvesting: "صافي النقد من الأنشطة الاستثمارية",
      financing: "الأنشطة التمويلية",
      totalFinancing: "صافي النقد من الأنشطة التمويلية",
      netCashFlow: "صافي التدفق النقدي",
      openingBalance: "الرصيد الافتتاحي",
      netChange: "صافي التغيير",
      closingBalance: "الرصيد الختامي",
      noItems: "لا توجد بنود",
      print: "طباعة",
      close: "إغلاق",
    };
  }
  if (lang === "ur") {
    return {
      title: "کیش فلو اسٹیٹمنٹ",
      period: "مدت",
      operating: "آپریٹنگ سرگرمیاں",
      totalOperating: "آپریٹنگ سرگرمیوں سے خالص نقد",
      investing: "سرمایہ کاری سرگرمیاں",
      totalInvesting: "سرمایہ کاری سرگرمیوں سے خالص نقد",
      financing: "فنانسنگ سرگرمیاں",
      totalFinancing: "فنانسنگ سرگرمیوں سے خالص نقد",
      netCashFlow: "خالص کیش فلو",
      openingBalance: "ابتدائی بیلنس",
      netChange: "خالص تبدیلی",
      closingBalance: "اختتامی بیلنس",
      noItems: "کوئی آئٹم نہیں",
      print: "پرنٹ",
      close: "بند کریں",
    };
  }
  return {
    title: "Cash Flow Statement",
    period: "Period",
    operating: "Operating Activities",
    totalOperating: "Net Cash from Operating Activities",
    investing: "Investing Activities",
    totalInvesting: "Net Cash from Investing Activities",
    financing: "Financing Activities",
    totalFinancing: "Net Cash from Financing Activities",
    netCashFlow: "Net Cash Flow",
    openingBalance: "Opening Balance",
    netChange: "Net Change",
    closingBalance: "Closing Balance",
    noItems: "No items",
    print: "Print",
    close: "Close",
  };
}

function buildCashFlowSection(
  section: CashFlowSection,
  headerLabel: string,
  totalLabel: string,
  curr: string,
  dir: string
): string {
  const rows = section.items.length > 0
    ? section.items
        .map(
          (item) => `<div class="cf-row">
          <div>${escapeHtml(item.label)}</div>
          <div class="amount ${item.amount >= 0 ? "positive" : "negative"}">${formatSignedCurrency(item.amount, curr)}</div>
        </div>`
        )
        .join("")
    : `<div class="cf-empty">${dir === "rtl" ? "لا توجد بنود" : "No items"}</div>`;

  return `<div class="cf-section">
    <div class="cf-section-header">${headerLabel}</div>
    ${rows}
  </div>
  <div class="cf-subtotal">
    <div>${totalLabel}</div>
    <div class="amount ${section.total >= 0 ? "positive" : "negative"}">${formatSignedCurrency(section.total, curr)}</div>
  </div>`;
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

function formatSignedCurrency(amount: number, curr: string): string {
  const prefix = amount >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(amount, curr)}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
