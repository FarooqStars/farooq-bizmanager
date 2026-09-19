/**
 * Generates printable HTML for a Payment Receipt / Voucher document.
 */
import { getPrintPageCss, formatCurrency, formatDate } from "@/lib/print-utils.ts";
import { numberToWords } from "@/lib/number-to-words.ts";

type PaymentReceiptData = {
  paymentId: string;
  date: string;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  invoiceNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
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

export function generatePaymentReceiptHtml(
  receipt: PaymentReceiptData,
  company: CompanyProfile | null | undefined,
  logoUrl: string | null | undefined,
  lang: string = "en"
): string {
  const dir = lang === "ar" || lang === "ur" ? "rtl" : "ltr";
  const css = getPrintPageCss(dir);
  const curr = receipt.currency || "QAR";
  const labels = getLabels(lang);

  const companyHeader = buildCompanyHeader(company, logoUrl);
  const amountWords = numberToWords(receipt.amount, lang);

  const methodLabel = formatMethod(receipt.method);

  const receivedFrom = `<div class="info-box">
    <div class="info-box-title">${labels.receivedFrom}</div>
    <p class="name">${escapeHtml(receipt.customerName || "Walk-in Customer")}</p>
    ${receipt.customerAddress ? `<p>${escapeHtml(receipt.customerAddress)}</p>` : ""}
    ${receipt.customerPhone ? `<p>${escapeHtml(receipt.customerPhone)}</p>` : ""}
    ${receipt.customerEmail ? `<p>${escapeHtml(receipt.customerEmail)}</p>` : ""}
  </div>`;

  const refLine = receipt.reference ? `<p><strong>${labels.reference}:</strong> ${escapeHtml(receipt.reference)}</p>` : "";
  const invoiceLine = receipt.invoiceNumber ? `<p><strong>${labels.forInvoice}:</strong> ${escapeHtml(receipt.invoiceNumber)}</p>` : "";

  const paymentInfo = `<div class="info-box">
    <div class="info-box-title">${labels.paymentDetails}</div>
    <p><strong>${labels.date}:</strong> ${formatDate(receipt.date)}</p>
    <p><strong>${labels.method}:</strong> ${methodLabel}</p>
    ${refLine}
    ${invoiceLine}
  </div>`;

  // Single amount display
  const amountSection = `
    <div style="margin:24px 0;text-align:center;padding:20px;border:2px solid #1a1a1a;border-radius:8px;">
      <div style="font-size:11px;text-transform:uppercase;color:#666;margin-bottom:6px;">${labels.amountReceived}</div>
      <div style="font-size:28px;font-weight:700;">${formatCurrency(receipt.amount, curr)}</div>
    </div>
    <div class="amount-words"><strong>${labels.amountInWords}:</strong> ${amountWords} ${curr}</div>
  `;

  const notes = receipt.notes ? `<div class="notes-section"><h3>${labels.notes}</h3><p>${escapeHtml(receipt.notes)}</p></div>` : "";
  const footer = buildFooter(company);

  const signature = `<div class="signature-area">
    <div class="signature-box"><div class="signature-line">${labels.receiverSignature}</div></div>
    <div class="signature-box"><div class="signature-line">${labels.payerSignature}</div></div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${labels.receipt} - ${receipt.paymentId}</title>
  <style>${css}</style>
</head>
<body>
  <div class="document-container">
    ${companyHeader}
    <div class="document-title">
      <h1>${labels.receipt}</h1>
      <div class="doc-number">${labels.receiptNo}: ${receipt.paymentId}</div>
    </div>
    <div class="info-grid">
      ${receivedFrom}
      ${paymentInfo}
    </div>
    ${amountSection}
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
      receipt: "إيصال دفع",
      receiptNo: "رقم الإيصال",
      receivedFrom: "استلم من",
      paymentDetails: "تفاصيل الدفع",
      date: "التاريخ",
      method: "طريقة الدفع",
      reference: "المرجع",
      forInvoice: "للفاتورة",
      amountReceived: "المبلغ المستلم",
      amountInWords: "المبلغ بالحروف",
      notes: "ملاحظات",
      print: "طباعة",
      close: "إغلاق",
      receiverSignature: "توقيع المستلم",
      payerSignature: "توقيع الدافع",
    };
  }
  if (lang === "ur") {
    return {
      receipt: "ادائیگی رسید",
      receiptNo: "رسید نمبر",
      receivedFrom: "وصول بنام",
      paymentDetails: "ادائیگی تفصیلات",
      date: "تاریخ",
      method: "ادائیگی کا طریقہ",
      reference: "حوالہ",
      forInvoice: "انوائس کے لیے",
      amountReceived: "وصول شدہ رقم",
      amountInWords: "رقم بالفاظ",
      notes: "نوٹس",
      print: "پرنٹ",
      close: "بند کریں",
      receiverSignature: "وصول کنندہ کے دستخط",
      payerSignature: "ادا کنندہ کے دستخط",
    };
  }
  return {
    receipt: "PAYMENT RECEIPT",
    receiptNo: "Receipt No",
    receivedFrom: "Received From",
    paymentDetails: "Payment Details",
    date: "Date",
    method: "Payment Method",
    reference: "Reference",
    forInvoice: "For Invoice",
    amountReceived: "Amount Received",
    amountInWords: "Amount in Words",
    notes: "Notes",
    print: "Print",
    close: "Close",
    receiverSignature: "Receiver Signature",
    payerSignature: "Payer Signature",
  };
}

function formatMethod(method: string): string {
  return method.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function buildFooter(company: CompanyProfile | null | undefined): string {
  if (!company) return "";
  const parts: string[] = [];
  if (company.invoiceFooterEn) parts.push(`<p>${escapeHtml(company.invoiceFooterEn)}</p>`);
  if (company.invoiceFooterAr) parts.push(`<p style="direction:rtl">${escapeHtml(company.invoiceFooterAr)}</p>`);
  if (parts.length === 0) return "";
  return `<div class="footer-terms">${parts.join("")}</div>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
