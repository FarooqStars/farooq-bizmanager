import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Building2, Upload, Save, Globe, Phone, Mail, FileText, Hash, Lock, ShieldAlert, MapPin, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { ConvexError } from "convex/values";
import { COUNTRY_LIST, getCountryConfig, COUNTRY_CONFIGS, getFiscalYearStartMonth, MONTH_NAMES, getFiscalYearLabel } from "@/lib/country-defaults.ts";

const CURRENCIES = [
  { value: "QAR", label: "QAR - Qatari Riyal" },
  { value: "PKR", label: "PKR - Pakistani Rupee" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "SAR", label: "SAR - Saudi Riyal" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "BHD", label: "BHD - Bahraini Dinar" },
  { value: "KWD", label: "KWD - Kuwaiti Dinar" },
  { value: "OMR", label: "OMR - Omani Rial" },
  { value: "EGP", label: "EGP - Egyptian Pound" },
  { value: "JOD", label: "JOD - Jordanian Dinar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
];

export default function CompanyProfilePage() {
  const { t } = useTranslation();
  const profile = useQuery(api.companyProfile.get);
  const saveProfile = useMutation(api.companyProfile.save);
  const generateUploadUrl = useMutation(api.companyProfile.generateUploadUrl);

  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameUr, setNameUr] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoStorageId, setLogoStorageId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [taxId, setTaxId] = useState("");
  const [defaultCountry, setDefaultCountry] = useState("");
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState<number>(1);
  const [defaultCurrency, setDefaultCurrency] = useState("QAR");
  const [invoiceFooterEn, setInvoiceFooterEn] = useState("");
  const [invoiceFooterAr, setInvoiceFooterAr] = useState("");
  const [invoiceFooterUr, setInvoiceFooterUr] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // When country changes, auto-set currency (but admin can override)
  const handleCountryChange = (code: string) => {
    setDefaultCountry(code);
    if (code && code in COUNTRY_CONFIGS) {
      const config = getCountryConfig(code);
      setDefaultCurrency(config.currency);
    }
    setFiscalYearStartMonth(getFiscalYearStartMonth(code));
  };

  // Populate form when data loads
  useEffect(() => {
    if (profile) {
      setNameEn(profile.nameEn ?? "");
      setNameAr(profile.nameAr ?? "");
      setNameUr(profile.nameUr ?? "");
      setLogoUrl(profile.logoUrl ?? "");
      setLogoStorageId(profile.logoStorageId ?? "");
      setAddress(profile.address ?? "");
      setPhone(profile.phone ?? "");
      setEmail(profile.email ?? "");
      setWebsite(profile.website ?? "");
      setCrNumber(profile.crNumber ?? "");
      setTaxId(profile.taxId ?? "");
      setDefaultCountry(profile.defaultCountry ?? "");
      setFiscalYearStartMonth(profile.fiscalYearStartMonth ?? getFiscalYearStartMonth(profile.defaultCountry));
      setDefaultCurrency(profile.defaultCurrency ?? "QAR");
      setInvoiceFooterEn(profile.invoiceFooterEn ?? "");
      setInvoiceFooterAr(profile.invoiceFooterAr ?? "");
      setInvoiceFooterUr(profile.invoiceFooterUr ?? "");
    }
  }, [profile]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("companyProfile.logoImageOnly"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("companyProfile.logoTooLarge"));
      return;
    }

    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await response.json();
      setLogoStorageId(storageId);

      // Get the URL for preview
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
      toast.success(t("companyProfile.logoUploaded"));
    } catch {
      toast.error(t("companyProfile.logoUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!nameEn.trim()) {
      toast.error(t("companyProfile.nameRequired"));
      return;
    }

    setSaving(true);
    try {
      await saveProfile({
        nameEn: nameEn.trim(),
        nameAr: nameAr.trim() || undefined,
        nameUr: nameUr.trim() || undefined,
        logoUrl: logoStorageId || undefined,
        logoStorageId: logoStorageId || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        crNumber: crNumber.trim() || undefined,
        taxId: taxId.trim() || undefined,
        defaultCountry: defaultCountry || undefined,
        fiscalYearStartMonth: fiscalYearStartMonth,
        defaultCurrency: defaultCurrency || undefined,
        invoiceFooterEn: invoiceFooterEn.trim() || undefined,
        invoiceFooterAr: invoiceFooterAr.trim() || undefined,
        invoiceFooterUr: invoiceFooterUr.trim() || undefined,
      });
      toast.success(t("companyProfile.saved"));
    } catch {
      toast.error(t("companyProfile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (profile === undefined) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" /> {t("companyProfile.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{t("companyProfile.subtitle")}</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
          <Save className="w-4 h-4 mr-1" />
          {saving ? t("common.saving") : t("companyProfile.saveBtn")}
        </Button>
      </div>

      {/* Company Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("companyProfile.identity")}</CardTitle>
          <CardDescription>{t("companyProfile.identityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>{t("companyProfile.nameEn")} *</Label>
              <Input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Acme Trading Co."
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("companyProfile.nameAr")}</Label>
              <Input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="شركة أكمي التجارية"
                className="mt-1"
                dir="rtl"
              />
            </div>
            <div>
              <Label>{t("companyProfile.nameUr")}</Label>
              <Input
                value={nameUr}
                onChange={(e) => setNameUr(e.target.value)}
                placeholder="ایکمی ٹریڈنگ کمپنی"
                className="mt-1"
                dir="rtl"
              />
            </div>
          </div>

          {/* Logo */}
          <div>
            <Label>{t("companyProfile.logo")}</Label>
            <div className="mt-2 flex items-center gap-4">
              {(logoUrl || logoStorageId) && (
                <LogoPreview storageId={logoStorageId} localUrl={logoUrl} />
              )}
              <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-accent transition-colors">
                <Upload className="w-4 h-4" />
                <span className="text-sm">{uploading ? t("companyProfile.uploading") : t("companyProfile.uploadLogo")}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t("companyProfile.logoHint")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("companyProfile.contact")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {t("companyProfile.address")}</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Building 123, Al Corniche St, Doha, Qatar"
              className="mt-1"
              rows={2}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {t("companyProfile.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 4444 5555" className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {t("companyProfile.email")}</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@company.com" className="mt-1" type="email" />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {t("companyProfile.website")}</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://www.company.com" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {/* System Defaults — Country & Currency */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            {t("companyProfile.systemDefaults", "System Defaults")}
          </CardTitle>
          <CardDescription>
            {t("companyProfile.systemDefaultsDesc", "Setting a default country automatically configures currency, tax labels, and ID field labels across the system. You can always override these per-transaction or per-employee.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {t("companyProfile.defaultCountryLabel", "Default Country")}
              </Label>
              <Select value={defaultCountry || "none"} onValueChange={(v) => handleCountryChange(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1 cursor-pointer"><SelectValue placeholder="Select country..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="cursor-pointer">-- No default --</SelectItem>
                  {COUNTRY_LIST.map((c) => (
                    <SelectItem key={c.code} value={c.code} className="cursor-pointer">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("companyProfile.defaultCountryHint", "This sets system-wide defaults but does not lock anything.")}
              </p>
            </div>
            <div>
              <Label>{t("companyProfile.defaultCurrency")}</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger className="mt-1 cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="cursor-pointer">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t("companyProfile.currencyOverrideHint", "Auto-set by country but you can override.")}
              </p>
            </div>
          </div>

          {/* Show active defaults info */}
          {defaultCountry && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm space-y-1">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    {t("companyProfile.activeDefaults", "Active system defaults for")} {getCountryConfig(defaultCountry).flag} {getCountryConfig(defaultCountry).name}:
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5 list-disc list-inside">
                    <li>{t("companyProfile.taxLabelInfo", "Tax label")}: <strong>{getCountryConfig(defaultCountry).taxLabel}</strong> ({getCountryConfig(defaultCountry).taxEnabled ? `${getCountryConfig(defaultCountry).taxRate}%` : t("companyProfile.notApplicable", "N/A")})</li>
                    <li>{t("companyProfile.crLabelInfo", "Registration label")}: <strong>{getCountryConfig(defaultCountry).crLabel}</strong></li>
                    <li>{t("companyProfile.taxIdLabelInfo", "Tax ID label")}: <strong>{getCountryConfig(defaultCountry).taxIdLabel}</strong></li>
                    <li>{t("companyProfile.idLabelsInfo", "Employee ID fields")}: <strong>{getCountryConfig(defaultCountry).idLabels.primary}</strong>, <strong>{getCountryConfig(defaultCountry).idLabels.secondary}</strong>{getCountryConfig(defaultCountry).idLabels.tertiary && <>, <strong>{getCountryConfig(defaultCountry).idLabels.tertiary}</strong></>}</li>
                    <li>{t("companyProfile.phoneCodeInfo", "Phone code")}: <strong>{getCountryConfig(defaultCountry).phoneCode}</strong></li>
                    <li>{t("companyProfile.fiscalYearInfo", "Fiscal year starts")}: <strong>{MONTH_NAMES[fiscalYearStartMonth - 1]}</strong> ({getFiscalYearLabel(new Date(), fiscalYearStartMonth)})</li>
                  </ul>
                  <p className="text-xs text-blue-600 dark:text-blue-400 italic mt-1">
                    {t("companyProfile.flexibleNote", "All values are flexible — admin can override anywhere in the system.")}
                  </p>
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                    <Label className="text-xs">{t("companyProfile.fiscalYearOverride", "Fiscal Year Start Month")}</Label>
                    <Select value={String(fiscalYearStartMonth)} onValueChange={(v) => setFiscalYearStartMonth(Number(v))}>
                      <SelectTrigger className="mt-1 cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((month, idx) => (
                          <SelectItem key={idx + 1} value={String(idx + 1)}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("companyProfile.fiscalYearHint", "Auto-set from country. Override if your business uses a different fiscal year.")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registration & Tax */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("companyProfile.registration")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> {defaultCountry ? getCountryConfig(defaultCountry).crLabel : t("companyProfile.crNumber")}</Label>
              <Input value={crNumber} onChange={(e) => setCrNumber(e.target.value)} placeholder="CR-12345678" className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {defaultCountry ? getCountryConfig(defaultCountry).taxIdLabel : t("companyProfile.taxId")}</Label>
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="300000000000003" className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Footer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("companyProfile.footerTerms")}</CardTitle>
          <CardDescription>{t("companyProfile.footerTermsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("companyProfile.footerEn")}</Label>
            <Textarea
              value={invoiceFooterEn}
              onChange={(e) => setInvoiceFooterEn(e.target.value)}
              placeholder="Payment is due within 30 days. Thank you for your business."
              className="mt-1"
              rows={3}
            />
          </div>
          <div>
            <Label>{t("companyProfile.footerAr")}</Label>
            <Textarea
              value={invoiceFooterAr}
              onChange={(e) => setInvoiceFooterAr(e.target.value)}
              placeholder="الدفع مستحق خلال 30 يوماً. شكراً لتعاملكم معنا."
              className="mt-1"
              rows={3}
              dir="rtl"
            />
          </div>
          <div>
            <Label>{t("companyProfile.footerUr")}</Label>
            <Textarea
              value={invoiceFooterUr}
              onChange={(e) => setInvoiceFooterUr(e.target.value)}
              placeholder="ادائیگی 30 دنوں میں واجب ہے۔ آپ کے کاروبار کا شکریہ۔"
              className="mt-1"
              rows={3}
              dir="rtl"
            />
          </div>
        </CardContent>
      </Card>

      {/* Closing Date */}
      <ClosingDateSection />

      {/* Document Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("companyProfile.preview")}</CardTitle>
          <CardDescription>{t("companyProfile.previewDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-6 bg-white dark:bg-background">
            <DocumentHeaderPreview
              nameEn={nameEn}
              nameAr={nameAr}
              nameUr={nameUr}
              logoStorageId={logoStorageId}
              localLogoUrl={logoUrl}
              address={address}
              phone={phone}
              emailAddr={email}
              website={website}
              crNumber={crNumber}
              taxId={taxId}
            />
            <Separator className="my-4" />
            <p className="text-center text-xs text-muted-foreground italic">{t("companyProfile.previewSample")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Closing Date Section ─────────────────────────────────────────────────────

function ClosingDateSection() {
  const { t } = useTranslation();
  const closingInfo = useQuery(api.closingDate.getClosingDate);
  const setClosingDate = useMutation(api.closingDate.setClosingDate);
  const [newDate, setNewDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (closingInfo?.closingDate) {
      setNewDate(closingInfo.closingDate.slice(0, 10));
    }
  }, [closingInfo]);

  const handleSet = async () => {
    if (!newDate) {
      toast.error(t("companyProfile.closingDateRequired", "Please select a closing date"));
      return;
    }
    setSaving(true);
    try {
      await setClosingDate({ closingDate: newDate });
      toast.success(t("companyProfile.closingDateSet", "Closing date has been set"));
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error(t("companyProfile.closingDateFailed", "Failed to set closing date"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await setClosingDate({ closingDate: null });
      setNewDate("");
      toast.success(t("companyProfile.closingDateCleared", "Closing date has been removed"));
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { code: string; message: string };
        toast.error(message);
      } else {
        toast.error(t("companyProfile.closingDateFailed", "Failed to update closing date"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600" />
          {t("companyProfile.closingDate", "Accounting Closing Date")}
        </CardTitle>
        <CardDescription>
          {t("companyProfile.closingDateDesc", "Once set, no one can add, edit, or delete any transaction (invoices, bills, sales, expenses, payments, journal entries) with a date on or before this date.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {closingInfo?.closingDate && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-sm text-amber-900 dark:text-amber-100">
                {t("companyProfile.currentClosingDate", "Current closing date")}: <span className="font-bold">{format(new Date(closingInfo.closingDate + "T00:00:00"), "MMM d, yyyy")}</span>
              </p>
              {closingInfo.closingDateSetAt && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  {t("companyProfile.closingDateSetOn", "Set on")}: {format(new Date(closingInfo.closingDateSetAt), "MMM d, yyyy h:mm a")}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 items-end">
          <div>
            <Label>{t("companyProfile.closingDateLabel", "Closing Date")}</Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("companyProfile.closingDateHint", "All transactions on or before this date will be locked")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSet} disabled={saving} className="cursor-pointer">
              <Lock className="w-4 h-4 mr-1" />
              {saving ? t("common.saving", "Saving...") : t("companyProfile.setClosingDate", "Set Closing Date")}
            </Button>
            {closingInfo?.closingDate && (
              <Button variant="ghost" onClick={handleClear} disabled={saving} className="cursor-pointer text-destructive hover:text-destructive">
                {t("companyProfile.clearClosingDate", "Remove")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Logo preview with Convex storage URL ─────────────────────────────────────

function LogoPreview({ storageId, localUrl }: { storageId: string; localUrl: string }) {
  const logoUrlFromStorage = useQuery(
    api.companyProfile.getLogoUrl,
    storageId ? { storageId } : "skip"
  );

  const displayUrl = localUrl.startsWith("blob:") ? localUrl : (logoUrlFromStorage ?? localUrl);

  if (!displayUrl) return null;

  return (
    <div className="w-16 h-16 rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
      <img src={displayUrl} alt="Logo" className="w-full h-full object-contain" />
    </div>
  );
}

// ── Document Header Preview ──────────────────────────────────────────────────

function DocumentHeaderPreview({
  nameEn, nameAr, nameUr, logoStorageId, localLogoUrl, address, phone, emailAddr, website, crNumber, taxId,
}: {
  nameEn: string; nameAr: string; nameUr: string; logoStorageId: string; localLogoUrl: string;
  address: string; phone: string; emailAddr: string; website: string; crNumber: string; taxId: string;
}) {
  const logoUrlFromStorage = useQuery(
    api.companyProfile.getLogoUrl,
    logoStorageId ? { storageId: logoStorageId } : "skip"
  );

  const displayUrl = localLogoUrl.startsWith("blob:") ? localLogoUrl : (logoUrlFromStorage ?? "");

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {displayUrl && (
          <img src={displayUrl} alt="Logo" className="w-12 h-12 object-contain rounded" />
        )}
        <div>
          <h3 className="font-bold text-lg">{nameEn || "Company Name"}</h3>
          {nameAr && <p className="text-sm text-muted-foreground" dir="rtl">{nameAr}</p>}
          {nameUr && <p className="text-sm text-muted-foreground" dir="rtl">{nameUr}</p>}
          {address && <p className="text-xs text-muted-foreground mt-1">{address}</p>}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground space-y-0.5">
        {phone && <p>{phone}</p>}
        {emailAddr && <p>{emailAddr}</p>}
        {website && <p>{website}</p>}
        {crNumber && <p>CR: {crNumber}</p>}
        {taxId && <p>Tax ID: {taxId}</p>}
      </div>
    </div>
  );
}

