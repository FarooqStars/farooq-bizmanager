export type DocumentType = "invoice" | "delivery_note" | "quotation" | "purchase_order" | "receipt";

export type TemplateConfig = {
  logoPosition: "left" | "center" | "right" | "hidden";
  headerLayout: "standard" | "compact" | "full_width";
  showCompanyNameAr: boolean;
  showCompanyNameUr: boolean;
  primaryColor: string;
  fontSize: "small" | "medium" | "large";
  showBorders: boolean;
  showItemNumber: boolean;
  showItemDescription: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showTotal: boolean;
  showPaymentTerms: boolean;
  showBankDetails: boolean;
  showSignatureLine: boolean;
  showQrCode: boolean;
  headerText?: string;
  footerText?: string;
  termsText?: string;
  pageSize: "a4" | "letter" | "a5";
  orientation: "portrait" | "landscape";

  // Logo Source
  logoSource?: "company_profile" | "custom" | "none";
  customLogoStorageId?: string;
  logoSize?: "small" | "medium" | "large";

  // Typography
  fontFamily?: "system" | "serif" | "mono" | "arabic";
  secondaryColor?: string;
  headerFontSize?: "same" | "larger" | "extra_large";

  // Layout & Spacing
  tableHeaderStyle?: "filled" | "underline" | "plain";
  margins?: "narrow" | "normal" | "wide";
  itemRowHeight?: "compact" | "normal" | "spacious";

  // Additional Sections
  showWatermark?: boolean;
  watermarkText?: string;
  showNotesSection?: boolean;
  notesLabel?: string;
  showStampArea?: boolean;
  showCustomerTaxId?: boolean;
  showDeliveryAddress?: boolean;
  footerAlignment?: "left" | "center" | "right";

  // Document Number Format
  showDocPrefix?: boolean;
  docPrefix?: string;
};

export const DEFAULT_CONFIG: TemplateConfig = {
  logoPosition: "left",
  headerLayout: "standard",
  showCompanyNameAr: false,
  showCompanyNameUr: false,
  primaryColor: "#1a56db",
  fontSize: "medium",
  showBorders: true,
  showItemNumber: true,
  showItemDescription: true,
  showQuantity: true,
  showUnitPrice: true,
  showDiscount: false,
  showTax: true,
  showTotal: true,
  showPaymentTerms: true,
  showBankDetails: false,
  showSignatureLine: true,
  showQrCode: false,
  pageSize: "a4",
  orientation: "portrait",

  // Logo Source
  logoSource: "company_profile",
  customLogoStorageId: undefined,
  logoSize: "medium",

  // Typography
  fontFamily: "system",
  secondaryColor: "#64748b",
  headerFontSize: "larger",

  // Layout & Spacing
  tableHeaderStyle: "filled",
  margins: "normal",
  itemRowHeight: "normal",

  // Additional Sections
  showWatermark: false,
  watermarkText: "",
  showNotesSection: false,
  notesLabel: "Notes",
  showStampArea: false,
  showCustomerTaxId: false,
  showDeliveryAddress: false,
  footerAlignment: "left",

  // Document Number Format
  showDocPrefix: false,
  docPrefix: "",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: "Invoice",
  delivery_note: "Delivery Note",
  quotation: "Quotation",
  purchase_order: "Purchase Order",
  receipt: "Receipt",
};
