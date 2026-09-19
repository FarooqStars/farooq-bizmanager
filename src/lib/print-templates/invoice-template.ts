/**
 * Generates printable HTML for an Invoice document.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";
import { numberToWords } from "@/lib/number-to-words.ts";

type InvoiceData = {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  status: string;
  saleType: string;
  creditTerms?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: { description: string; quantity: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  discount?: number;
  totalAmount: number;
  amountPaid: number;
  currency?: string;
  notes?: string;
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

export function generateInvoiceHtml(
  invoice: InvoiceData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = invoice.currency || "QAR";

  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl, dir);
  const customerInfo = buildCustomerInfo(invoice, labels, dir);
  const documentInfo = buildDocumentInfo(invoice, labels);
  const itemsTable = buildItemsTable(invoice.items, curr, labels, dir);
  const totals = buildTotals(invoice, curr, labels);
  const amountWords = numberToWords(invoice.totalAmount, lang);
  const notes = invoice.notes ? `<div class="notes-section"><h3>${labels.notes}</h3><p>${escapeHtml(invoice.notes)}</p></div>` : "";
  const footer = buildFooter(company, lang);
  const signature = buildSignature(labels);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.invoice} ${invoice.invoiceNumber}</title>
  <style>${css}</style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.invoice}</h1>
      <div class="doc-number">${invoice.invoiceNumber} &bull; <span class="status-badge status-${invoice.status}">${invoice.status.replace("_", " ")}</span></div>
    </div>
    <div class="info-grid">
      ${customerInfo}
      ${documentInfo}
    </div>
    ${itemsTable}
    ${totals}
    <div class="amount-words"><strong>${labels.amountInWords}:</strong> ${amountWords} ${curr}</div>
    ${notes}
    ${footer}
    ${signature}
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
      invoice: "فاتورة",
      billTo: "فاتورة إلى",
      details: "تفاصيل الفاتورة",
      date: "التاريخ",
      dueDate: "تاريخ الاستحقاق",
      saleType: "نوع البيع",
      creditTerms: "شروط الائتمان",
      num: "#",
      description: "الوصف",
      qty: "الكمية",
      unitPrice: "سعر الوحدة",
      amount: "المبلغ",
      subtotal: "المجموع الفرعي",
      tax: "الضريبة",
      discount: "الخصم",
      total: "الإجمالي",
      paid: "المدفوع",
      balance: "الرصيد المتبقي",
      amountInWords: "المبلغ بالحروف",
      notes: "ملاحظات",
      print: "طباعة",
      close: "إغلاق",
      authorizedSignature: "التوقيع المعتمد",
      customerSignature: "توقيع العميل",
    };
  }
  if (lang === "ur") {
    return {
      invoice: "انوائس",
      billTo: "بل وصول کنندہ",
      details: "انوائس تفصیلات",
      date: "تاریخ",
      dueDate: "آخری تاریخ",
      saleType: "فروخت کی قسم",
      creditTerms: "ادائیگی شرائط",
      num: "#",
      description: "تفصیل",
      qty: "مقدار",
      unitPrice: "یونٹ قیمت",
      amount: "رقم",
      subtotal: "ذیلی کل",
      tax: "ٹیکس",
      discount: "رعایت",
      total: "کل رقم",
      paid: "ادا شدہ",
      balance: "بقایا رقم",
      amountInWords: "رقم بالفاظ",
      notes: "نوٹس",
      print: "پرنٹ",
      close: "بند کریں",
      authorizedSignature: "مجاز دستخط",
      customerSignature: "گاہک کے دستخط",
    };
  }
  return {
    invoice: "INVOICE",
    billTo: "Bill To",
    details: "Invoice Details",
    date: "Date",
    dueDate: "Due Date",
    saleType: "Sale Type",
    creditTerms: "Credit Terms",
    num: "#",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit Price",
    amount: "Amount",
    subtotal: "Subtotal",
    tax: "Tax",
    discount: "Discount",
    total: "Total",
    paid: "Paid",
    balance: "Balance Due",
    amountInWords: "Amount in Words",
    notes: "Notes",
    print: "Print",
    close: "Close",
    authorizedSignature: "Authorized Signature",
    customerSignature: "Customer Signature",
  };
}

function buildCompanyHeader(company: CompanyProfile | null | undefined, logoUrl: string | null | undefined, dir: string): string {
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

function buildCustomerInfo(invoice: InvoiceData, labels: ReturnType<typeof getLabels>, _dir: string): string {
  return `<div class="info-box">
    <div class="info-box-title">${labels.billTo}</div>
    <p class="name">${escapeHtml(invoice.customerName)}</p>
    ${invoice.customerAddress ? `<p>${escapeHtml(invoice.customerAddress)}</p>` : ""}
    ${invoice.customerPhone ? `<p>${escapeHtml(invoice.customerPhone)}</p>` : ""}
    ${invoice.customerEmail ? `<p>${escapeHtml(invoice.customerEmail)}</p>` : ""}
  </div>`;
}

function buildDocumentInfo(invoice: InvoiceData, labels: ReturnType<typeof getLabels>): string {
  const terms = invoice.creditTerms ? `<p><strong>${labels.creditTerms}:</strong> ${invoice.creditTerms.replace("_", " ")}</p>` : "";
  return `<div class="info-box">
    <div class="info-box-title">${labels.details}</div>
    <p><strong>${labels.date}:</strong> ${formatDate(invoice.date)}</p>
    <p><strong>${labels.dueDate}:</strong> ${formatDate(invoice.dueDate)}</p>
    <p><strong>${labels.saleType}:</strong> ${invoice.saleType}</p>
    ${terms}
  </div>`;
}

function buildItemsTable(items: InvoiceData["items"], curr: string, labels: ReturnType<typeof getLabels>, _dir: string): string {
  const rows = items.map((item, idx) => `
    <tr>
      <td class="num">${idx + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td class="num">${item.quantity}</td>
      <td class="amount">${formatCurrency(item.unitPrice, curr)}</td>
      <td class="amount">${formatCurrency(item.subtotal, curr)}</td>
    </tr>
  `).join("");

  return `<table class="items-table">
    <thead>
      <tr>
        <th class="num">${labels.num}</th>
        <th>${labels.description}</th>
        <th class="num">${labels.qty}</th>
        <th class="amount">${labels.unitPrice}</th>
        <th class="amount">${labels.amount}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildTotals(invoice: InvoiceData, curr: string, labels: ReturnType<typeof getLabels>): string {
  const balance = invoice.totalAmount - invoice.amountPaid;
  let rows = `<tr><td>${labels.subtotal}</td><td>${formatCurrency(invoice.subtotal, curr)}</td></tr>`;
  if (invoice.discount) {
    rows += `<tr><td>${labels.discount}</td><td>-${formatCurrency(invoice.discount, curr)}</td></tr>`;
  }
  if (invoice.taxAmount) {
    rows += `<tr><td>${labels.tax} (${invoice.taxRate || 0}%)</td><td>${formatCurrency(invoice.taxAmount, curr)}</td></tr>`;
  }
  rows += `<tr class="total-row"><td>${labels.total}</td><td>${formatCurrency(invoice.totalAmount, curr)}</td></tr>`;
  if (invoice.amountPaid > 0) {
    rows += `<tr><td>${labels.paid}</td><td>${formatCurrency(invoice.amountPaid, curr)}</td></tr>`;
    rows += `<tr><td><strong>${labels.balance}</strong></td><td><strong>${formatCurrency(balance, curr)}</strong></td></tr>`;
  }

  return `<div class="totals-section"><table class="totals-table">${rows}</table></div>`;
}

function buildFooter(company: CompanyProfile | null | undefined, lang: string): string {
  if (!company) return "";
  const parts: string[] = [];
  if (company.invoiceFooterEn) parts.push(`<p>${escapeHtml(company.invoiceFooterEn)}</p>`);
  if (company.invoiceFooterAr) parts.push(`<p style="direction:rtl">${escapeHtml(company.invoiceFooterAr)}</p>`);
  if (parts.length === 0) return "";
  return `<div class="footer-terms">${parts.join("")}</div>`;
}

function buildSignature(labels: ReturnType<typeof getLabels>): string {
  return `<div class="signature-area">
    <div class="signature-box"><div class="signature-line">${labels.authorizedSignature}</div></div>
    <div class="signature-box"><div class="signature-line">${labels.customerSignature}</div></div>
  </div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
