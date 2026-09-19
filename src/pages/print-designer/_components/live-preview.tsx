import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";
import type { TemplateConfig, DocumentType } from "./types.ts";
import { DOCUMENT_TYPE_LABELS } from "./types.ts";
import { cn } from "@/lib/utils.ts";

type Props = {
  config: TemplateConfig;
  documentType: DocumentType;
  companyProfile?: Doc<"companyProfile"> | null;
};

const DUMMY_ITEMS = [
  { num: 1, desc: "Widget Pro X100", qty: 5, price: 120.0, discount: 10, tax: 15 },
  { num: 2, desc: "Cable Assembly Kit", qty: 2, price: 45.5, discount: 0, tax: 15 },
  { num: 3, desc: "Mounting Bracket Set", qty: 10, price: 8.75, discount: 5, tax: 15 },
];

const FONT_FAMILY_MAP: Record<NonNullable<TemplateConfig["fontFamily"]>, string> = {
  system: "system-ui, -apple-system, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', ui-monospace, monospace",
  arabic: "'Noto Naskh Arabic', 'Amiri', 'Segoe UI', serif",
};

export default function LivePreview({ config, documentType, companyProfile }: Props) {
  const customLogoUrl = useQuery(
    api.printTemplates.getLogoUrl,
    config.logoSource === "custom" && config.customLogoStorageId
      ? { storageId: config.customLogoStorageId }
      : "skip"
  );

  const fontClass = config.fontSize === "small" ? "text-[7px]" : config.fontSize === "large" ? "text-[10px]" : "text-[8px]";
  const borderClass = config.showBorders ? "border border-gray-300" : "";
  const cellBorder = config.showBorders ? "border border-gray-200" : "border-b border-gray-100";

  const fontFamily = FONT_FAMILY_MAP[config.fontFamily ?? "system"];
  const secondaryColor = config.secondaryColor ?? "#64748b";

  // Margins
  const marginClass = config.margins === "narrow" ? "px-2" : config.margins === "wide" ? "px-6" : "px-4";

  // Row height
  const rowPad = config.itemRowHeight === "compact" ? "py-0.5" : config.itemRowHeight === "spacious" ? "py-2" : "py-1";

  // Header font size (company name)
  const headerNameClass =
    config.headerFontSize === "extra_large" ? "text-[14px]" : config.headerFontSize === "same" ? "text-[10px]" : "text-[12px]";

  // Logo size
  const logoDim =
    config.logoSize === "small" ? "w-6 h-6" : config.logoSize === "large" ? "w-12 h-12" : "w-8 h-8";

  // Resolve logo visibility & source
  const logoSource = config.logoSource ?? "company_profile";
  const showLogo = logoSource !== "none" && config.logoPosition !== "hidden";
  const profileLogo = companyProfile?.logoUrl;
  const resolvedLogoUrl = logoSource === "custom" ? customLogoUrl : logoSource === "company_profile" ? profileLogo : undefined;

  const footerAlignClass =
    config.footerAlignment === "center" ? "text-center" : config.footerAlignment === "right" ? "text-right" : "text-left";

  const docNumber = `${config.showDocPrefix && config.docPrefix ? config.docPrefix : ""}2024-001`;

  const visibleCols = [
    config.showItemNumber && "num",
    config.showItemDescription && "desc",
    config.showQuantity && "qty",
    config.showUnitPrice && "price",
    config.showDiscount && "discount",
    config.showTax && "tax",
    config.showTotal && "total",
  ].filter(Boolean);

  const colHeaders: Record<string, string> = {
    num: "#",
    desc: "Description",
    qty: "Qty",
    price: "Unit Price",
    discount: "Disc %",
    tax: "Tax %",
    total: "Total",
  };

  const getTotal = (item: (typeof DUMMY_ITEMS)[0]) => {
    const subtotal = item.qty * item.price;
    const afterDiscount = subtotal * (1 - item.discount / 100);
    return afterDiscount * (1 + item.tax / 100);
  };

  const grandTotal = DUMMY_ITEMS.reduce((sum, item) => sum + getTotal(item), 0);

  // Table header styling
  const headerStyle = config.tableHeaderStyle ?? "filled";
  const theadRowStyle: React.CSSProperties =
    headerStyle === "filled"
      ? { backgroundColor: `${secondaryColor}20` }
      : headerStyle === "underline"
        ? { borderBottom: `2px solid ${secondaryColor}` }
        : {};
  const thColor = headerStyle === "filled" ? config.primaryColor : secondaryColor;

  const companyName = companyProfile?.nameEn ?? "Acme Corporation";

  return (
    <div className="bg-muted/30 rounded-lg p-4 flex items-start justify-center overflow-auto h-full">
      <div
        className={cn(
          "bg-white shadow-lg rounded border border-gray-200 overflow-hidden flex flex-col relative",
          config.orientation === "landscape" ? "w-[380px] min-h-[268px]" : "w-[280px] min-h-[396px]"
        )}
        style={{ fontFamily }}
      >
        {/* Watermark */}
        {config.showWatermark && config.watermarkText && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span
              className="font-bold uppercase tracking-widest select-none"
              style={{
                color: config.primaryColor,
                opacity: 0.08,
                fontSize: "48px",
                transform: "rotate(-35deg)",
                whiteSpace: "nowrap",
              }}
            >
              {config.watermarkText}
            </span>
          </div>
        )}

        {/* Header */}
        <div
          className={cn(
            marginClass,
            "py-3",
            config.headerLayout === "full_width" && "text-white",
            config.headerLayout === "compact" && "py-2"
          )}
          style={{
            backgroundColor: config.headerLayout === "full_width" ? config.primaryColor : undefined,
            borderBottom: config.headerLayout !== "full_width" ? `2px solid ${config.primaryColor}` : undefined,
          }}
        >
          <div className={cn(
            "flex items-center gap-2",
            config.logoPosition === "center" && "justify-center flex-col",
            config.logoPosition === "right" && "flex-row-reverse"
          )}>
            {showLogo && (
              resolvedLogoUrl ? (
                <img
                  src={resolvedLogoUrl}
                  alt="Company logo"
                  className={cn(logoDim, "rounded object-contain flex-shrink-0 bg-white")}
                />
              ) : (
                <div
                  className={cn(logoDim, "rounded flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0")}
                  style={{ backgroundColor: config.headerLayout === "full_width" ? "rgba(255,255,255,0.2)" : config.primaryColor }}
                >
                  LOGO
                </div>
              )
            )}
            <div className={cn(config.logoPosition === "center" && "text-center")}>
              <p className={cn(headerNameClass, "font-bold")} style={{ color: config.headerLayout === "full_width" ? "white" : config.primaryColor }}>
                {companyName}
              </p>
              {config.showCompanyNameAr && (
                <p className="text-[8px] opacity-70" dir="rtl">{companyProfile?.nameAr ?? "شركة أكمي"}</p>
              )}
              {config.showCompanyNameUr && (
                <p className="text-[8px] opacity-70" dir="rtl">{companyProfile?.nameUr ?? "ایکمی کارپوریشن"}</p>
              )}
            </div>
          </div>
          {config.headerText && (
            <p className="text-[7px] mt-1 opacity-70">{config.headerText}</p>
          )}
        </div>

        {/* Document title */}
        <div className={cn(marginClass, "pt-2 pb-1")}>
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: config.primaryColor }}>
            {DOCUMENT_TYPE_LABELS[documentType]}
          </p>
          <div className={cn("flex justify-between mt-1", fontClass)}>
            <div className="space-y-0.5 text-gray-600">
              <p>{docNumber}</p>
              <p>Date: 15 Jan 2024</p>
            </div>
            <div className="text-right space-y-0.5 text-gray-600">
              <p className="font-medium text-gray-900">Bill To:</p>
              <p>ABC Trading LLC</p>
              {config.showCustomerTaxId && <p>VAT: 300123456700003</p>}
            </div>
          </div>

          {/* Delivery Address */}
          {config.showDeliveryAddress && (
            <div className={cn("mt-1 pt-1 border-t border-gray-100", fontClass)}>
              <p className="font-medium text-gray-900">Ship To:</p>
              <p className="text-gray-600">Warehouse 7, Industrial Area, Riyadh</p>
            </div>
          )}
        </div>

        {/* Table */}
        <div className={cn(marginClass, "mt-2 flex-1", fontClass)}>
          <table className={cn("w-full", borderClass)}>
            <thead>
              <tr style={theadRowStyle}>
                {visibleCols.map((col) => (
                  <th
                    key={col as string}
                    className={cn("px-1.5", rowPad, "text-left font-semibold", headerStyle === "filled" && cellBorder)}
                    style={{ color: thColor }}
                  >
                    {colHeaders[col as string]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DUMMY_ITEMS.map((item) => (
                <tr key={item.num} className="hover:bg-gray-50/50">
                  {config.showItemNumber && <td className={cn("px-1.5", rowPad, cellBorder)}>{item.num}</td>}
                  {config.showItemDescription && <td className={cn("px-1.5", rowPad, cellBorder)}>{item.desc}</td>}
                  {config.showQuantity && <td className={cn("px-1.5", rowPad, cellBorder)}>{item.qty}</td>}
                  {config.showUnitPrice && <td className={cn("px-1.5", rowPad, cellBorder)}>{item.price.toFixed(2)}</td>}
                  {config.showDiscount && <td className={cn("px-1.5", rowPad, cellBorder)}>{item.discount}%</td>}
                  {config.showTax && <td className={cn("px-1.5", rowPad, cellBorder)}>{item.tax}%</td>}
                  {config.showTotal && <td className={cn("px-1.5", rowPad, "font-medium", cellBorder)}>{getTotal(item).toFixed(2)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mt-2">
            <div className={cn("space-y-0.5 text-right", fontClass)}>
              <p style={{ color: secondaryColor }}>Subtotal: {(grandTotal / 1.15).toFixed(2)}</p>
              <p style={{ color: secondaryColor }}>Tax: {(grandTotal - grandTotal / 1.15).toFixed(2)}</p>
              <p className="font-bold text-[9px]" style={{ color: config.primaryColor }}>
                Total: {grandTotal.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Notes section */}
          {config.showNotesSection && (
            <div className={cn("mt-2 pt-1 border-t border-gray-100", fontClass)}>
              <p className="font-medium text-gray-900">{config.notesLabel || "Notes"}:</p>
              <p className="text-gray-500">Thank you for your business.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn(marginClass, "pb-3 mt-auto pt-2", fontClass, footerAlignClass)}>
          {config.showPaymentTerms && (
            <p className="text-gray-500">Payment Terms: Net 30</p>
          )}
          {config.showBankDetails && (
            <p className="text-gray-500">Bank: First National | Acc: 1234-5678-9012</p>
          )}
          {config.termsText && (
            <p className="text-gray-400 mt-1 italic">{config.termsText}</p>
          )}
          {(config.showSignatureLine || config.showQrCode || config.showStampArea) && (
            <div className="flex justify-between items-end mt-3 pt-2 border-t border-gray-100 text-left">
              {config.showSignatureLine && (
                <div className="space-y-0.5">
                  <div className="w-20 border-b border-gray-400" />
                  <p className="text-gray-400 text-[6px]">Authorized Signature</p>
                </div>
              )}
              {config.showStampArea && (
                <div className="w-14 h-14 border border-dashed border-gray-400 rounded flex items-center justify-center">
                  <span className="text-[5px] text-gray-400 text-center">Company<br />Stamp</span>
                </div>
              )}
              {config.showQrCode && (
                <div className="w-10 h-10 border border-gray-300 rounded flex items-center justify-center">
                  <span className="text-[5px] text-gray-400">QR</span>
                </div>
              )}
            </div>
          )}
          {config.footerText && (
            <p className="text-gray-400 mt-2 text-[6px]">{config.footerText}</p>
          )}
        </div>
      </div>
    </div>
  );
}
