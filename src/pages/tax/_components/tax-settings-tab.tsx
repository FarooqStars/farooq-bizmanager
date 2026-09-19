import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { COUNTRY_CONFIGS, type CountryCode } from "@/lib/country-defaults.ts";

/**
 * Country tax configurations derived from country-defaults.ts.
 * Includes country-specific tax regulations and rules.
 */
const TAX_COUNTRIES: Array<{
  code: CountryCode;
  name: string;
  flag: string;
  defaultRate: number;
  label: string; // VAT, GST, etc.
  taxEnabled: boolean;
  taxIdLabel: string;
  pricingMode: "exclusive" | "inclusive";
  notice?: string; // Country-specific regulatory notice
  rules: string[]; // Key tax rules for the country
}> = [
  {
    code: "QA",
    name: "Qatar",
    flag: "🇶🇦",
    defaultRate: 0,
    label: "VAT",
    taxEnabled: false,
    taxIdLabel: COUNTRY_CONFIGS.QA.taxIdLabel,
    pricingMode: "exclusive",
    notice: "Qatar has not yet implemented VAT. Tax calculation is disabled.",
    rules: [
      "No VAT currently in effect",
      "Excise tax applies on tobacco (100%), energy drinks (100%), carbonated drinks (50%)",
      "Free zone companies may have special tax treatment",
    ],
  },
  {
    code: "AE",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    defaultRate: 5,
    label: "VAT",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.AE.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard VAT rate: 5%",
      "Zero-rated: exports, international transport, precious metals, healthcare, education",
      "Exempt: residential property, bare land, local public transport, life insurance",
      "VAT returns filed quarterly (monthly if turnover > AED 150M)",
      "Registration mandatory if taxable supplies exceed AED 375,000",
    ],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    defaultRate: 15,
    label: "VAT",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.SA.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard VAT rate: 15% (increased from 5% in July 2020)",
      "Zero-rated: exports, international transport, medicines and medical equipment",
      "Exempt: financial services, residential rent, local transport",
      "VAT returns filed monthly (quarterly if turnover < SAR 40M)",
      "Registration mandatory if taxable supplies exceed SAR 375,000",
      "E-invoicing (FATOORAH) mandatory for B2B and B2C",
    ],
  },
  {
    code: "PK",
    name: "Pakistan",
    flag: "🇵🇰",
    defaultRate: 18,
    label: "GST",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.PK.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard GST rate: 18% (federal), provinces have own rates",
      "Reduced rate: 5% on essential goods",
      "Zero-rated: exports, IT services, dairy products",
      "Exempt: unprocessed food, education, healthcare",
      "Monthly GST return filing required",
      "Withholding tax applies on services",
      "Further tax (3%) on unregistered persons",
    ],
  },
  {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    defaultRate: 18,
    label: "GST",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.IN.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "GST rate slabs: 0%, 5%, 12%, 18%, 28%",
      "Most goods/services at 18%",
      "Essential goods at 0% or 5%",
      "Luxury/sin goods at 28% + cess",
      "CGST + SGST for intra-state, IGST for inter-state",
      "Registration mandatory if turnover > INR 20 lakh (INR 10 lakh for NE states)",
      "Monthly GSTR-1 and GSTR-3B filing required",
      "E-invoicing mandatory for turnover > INR 5 crore",
    ],
  },
  {
    code: "BH",
    name: "Bahrain",
    flag: "🇧🇭",
    defaultRate: 10,
    label: "VAT",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.BH.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard VAT rate: 10% (increased from 5% in January 2022)",
      "Zero-rated: exports, international transport, new residential buildings",
      "Exempt: basic food items, financial services, residential rent",
      "Registration mandatory if taxable supplies exceed BHD 37,500",
      "VAT returns filed monthly",
    ],
  },
  {
    code: "KW",
    name: "Kuwait",
    flag: "🇰🇼",
    defaultRate: 0,
    label: "VAT",
    taxEnabled: false,
    taxIdLabel: COUNTRY_CONFIGS.KW.taxIdLabel,
    pricingMode: "exclusive",
    notice: "Kuwait has not yet implemented VAT. Tax calculation is disabled.",
    rules: [
      "No VAT currently in effect (implementation planned but postponed)",
      "No personal income tax",
      "Corporate income tax: 15% on foreign companies only",
      "Zakat obligation for Kuwaiti/GCC companies (1%)",
      "National Labour Support Tax (NLST): 2.5% on net profits",
    ],
  },
  {
    code: "OM",
    name: "Oman",
    flag: "🇴🇲",
    defaultRate: 5,
    label: "VAT",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.OM.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard VAT rate: 5% (effective April 2021)",
      "Zero-rated: exports, international transport, precious metals",
      "Exempt: financial services, education, healthcare, residential rent",
      "Registration mandatory if annual supplies exceed OMR 38,500",
      "VAT returns filed quarterly (monthly for large taxpayers)",
    ],
  },
  {
    code: "EG",
    name: "Egypt",
    flag: "🇪🇬",
    defaultRate: 14,
    label: "VAT",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.EG.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard VAT rate: 14%",
      "Reduced rate: 5% on machinery and equipment",
      "Zero-rated: exports, goods/services to free zones",
      "Exempt: basic food, healthcare, education, financial services",
      "E-invoicing mandatory for all taxpayers",
      "Monthly VAT return filing required",
      "Registration mandatory if annual turnover exceeds EGP 500,000",
    ],
  },
  {
    code: "JO",
    name: "Jordan",
    flag: "🇯🇴",
    defaultRate: 16,
    label: "GST",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.JO.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Standard GST rate: 16%",
      "Special rate: 4% on specific goods (feed, fertilizers)",
      "Zero-rated: exports, medicines, basic food items",
      "Exempt: financial/insurance services, residential rent",
      "Monthly GST return filing required",
      "Registration mandatory if turnover exceeds JOD 75,000",
    ],
  },
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    defaultRate: 0,
    label: "Sales Tax",
    taxEnabled: false,
    taxIdLabel: COUNTRY_CONFIGS.US.taxIdLabel,
    pricingMode: "exclusive",
    notice: "The US has no federal VAT/GST. Sales tax is managed at the state and local level.",
    rules: [
      "No federal VAT or GST — sales tax is state-level",
      "State sales tax rates range from 0% (OR, MT, NH, DE, AK) to 7.25% (CA)",
      "Combined state + local rates can reach up to ~10.25%",
      "Use tax applies on out-of-state purchases",
      "Nexus rules determine state filing obligations (economic nexus post-Wayfair)",
      "Marketplace facilitator laws require platforms to collect tax",
      "Federal income tax: progressive rates 10%-37%",
    ],
  },
  {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    defaultRate: 5,
    label: "GST/HST",
    taxEnabled: true,
    taxIdLabel: COUNTRY_CONFIGS.CA.taxIdLabel,
    pricingMode: "exclusive",
    rules: [
      "Federal GST: 5% (applies nationwide)",
      "HST (harmonized): 13-15% in participating provinces (ON, NB, NS, NL, PE)",
      "Provincial PST: 6-7% in BC, SK, MB (separate from GST)",
      "Quebec QST: 9.975% (administered separately)",
      "Zero-rated: basic groceries, prescription drugs, medical devices, exports",
      "Exempt: residential rent, healthcare, educational services, financial services",
      "Registration mandatory if taxable supplies exceed $30,000 in 4 consecutive quarters",
      "GST/HST returns filed quarterly or annually based on revenue",
    ],
  },
];

export default function TaxSettingsTab() {
  const { t } = useTranslation();
  const settings = useQuery(api.tax.getSettings);
  const saveSettings = useMutation(api.tax.saveSettings);
  const seedRates = useMutation(api.tax.seedDefaultRates);

  const [isEnabled, setIsEnabled] = useState(false);
  const [country, setCountry] = useState("QA");
  const [taxLabel, setTaxLabel] = useState("VAT");
  const [defaultRate, setDefaultRate] = useState(0);
  const [pricingMode, setPricingMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [regNumber, setRegNumber] = useState("");
  const [fiscalYearStart, setFiscalYearStart] = useState("01-01");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.isEnabled);
      setCountry(settings.country);
      setTaxLabel(settings.taxLabel);
      setDefaultRate(settings.defaultTaxRate);
      setPricingMode(settings.pricingMode);
      setRegNumber(settings.taxRegistrationNumber ?? "");
      setFiscalYearStart(settings.fiscalYearStart ?? "01-01");
    }
  }, [settings]);

  if (settings === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const selectedCountry = TAX_COUNTRIES.find((c) => c.code === country);

  const handleCountryChange = (code: string) => {
    setCountry(code);
    const found = TAX_COUNTRIES.find((c) => c.code === code);
    if (found) {
      setTaxLabel(found.label);
      setDefaultRate(found.defaultRate);
      setPricingMode(found.pricingMode);
      // Countries without VAT: disable tax
      if (!found.taxEnabled) {
        setIsEnabled(false);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        isEnabled,
        country,
        taxLabel,
        defaultTaxRate: defaultRate,
        pricingMode,
        taxRegistrationNumber: regNumber || undefined,
        fiscalYearStart: fiscalYearStart || undefined,
      });
      await seedRates({ country });
      toast.success(t("tax.settings_saved"));
    } catch {
      toast.error(t("tax.settings_save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Country-specific regulatory notice */}
      {selectedCountry?.notice && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">
                {selectedCountry.flag} {selectedCountry.name} Tax Notice
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">{selectedCountry.notice}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Settings */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tax.general_settings")}</CardTitle>
          <CardDescription>{t("tax.general_settings_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-1">
              <Label className="text-base font-medium">{t("tax.enable_tax")}</Label>
              <p className="text-sm text-muted-foreground">{t("tax.enable_tax_desc")}</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          {/* Country */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tax.country")}</Label>
              <Select value={country} onValueChange={handleCountryChange}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code} className="cursor-pointer">
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("tax.tax_label")}</Label>
              <Input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="VAT, GST, Sales Tax" />
              <p className="text-xs text-muted-foreground">{t("tax.tax_label_hint")}</p>
            </div>
          </div>

          {/* Default Rate and Pricing Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tax.default_rate")}</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("tax.pricing_mode")}</Label>
              <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as "exclusive" | "inclusive")}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive" className="cursor-pointer">{t("tax.mode_exclusive")}</SelectItem>
                  <SelectItem value="inclusive" className="cursor-pointer">{t("tax.mode_inclusive")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {pricingMode === "exclusive" ? t("tax.mode_exclusive_hint") : t("tax.mode_inclusive_hint")}
              </p>
            </div>
          </div>

          {/* Registration Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{selectedCountry?.taxIdLabel ?? t("tax.reg_number")}</Label>
              <Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="e.g. 123456789" />
            </div>

            <div className="space-y-2">
              <Label>{t("tax.fiscal_year_start")}</Label>
              <Input value={fiscalYearStart} onChange={(e) => setFiscalYearStart(e.target.value)} placeholder="MM-DD (e.g. 01-01)" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Country Tax Rules */}
      {selectedCountry && selectedCountry.rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>{selectedCountry.flag}</span>
              <span>{selectedCountry.name} Tax Regulations</span>
            </CardTitle>
            <CardDescription>Key tax rules and regulations for your selected country</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {selectedCountry.rules.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{rule}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Status Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            {isEnabled ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Info className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {isEnabled ? t("tax.status_enabled", { label: taxLabel, rate: defaultRate }) : t("tax.status_disabled")}
              </p>
              <p className="text-sm text-muted-foreground">
                {isEnabled ? t("tax.status_enabled_desc") : t("tax.status_disabled_desc")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
          {saving ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
