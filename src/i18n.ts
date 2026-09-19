import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LOCALES = {
  en: { code: "en", name: "English", nativeName: "English", dir: "ltr" as const },
  ar: { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" as const },
  ur: { code: "ur", name: "Urdu", nativeName: "اردو", dir: "rtl" as const },
} as const;

export const DEFAULT_LOCALE: keyof typeof SUPPORTED_LOCALES = "en";

export const SUPPORTED_LOCALES_ARRAY = Object.keys(SUPPORTED_LOCALES) as Array<
  keyof typeof SUPPORTED_LOCALES
>;
export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;

export function isSupportedLocale(locale: string | undefined): locale is SupportedLocale {
  return !!locale && SUPPORTED_LOCALES_ARRAY.includes(locale as SupportedLocale);
}

// Saved locale from localStorage
export const SAVED_LOCALE =
  typeof window !== "undefined"
    ? (() => {
        try {
          const stored = localStorage.getItem("locale");
          return stored && isSupportedLocale(stored) ? stored : null;
        } catch {
          return null;
        }
      })()
    : null;

export const SAVED_OR_DEFAULT_LOCALE: SupportedLocale = SAVED_LOCALE ?? DEFAULT_LOCALE;

// Change locale and update document attributes
export async function changeLocale(lng: SupportedLocale) {
  try {
    await i18n.changeLanguage(lng);
    const localeMetadata = SUPPORTED_LOCALES[lng];
    document.documentElement.lang = lng;
    document.documentElement.dir = localeMetadata.dir;
    try {
      localStorage.setItem("locale", lng);
    } catch {
      // localStorage might be disabled
    }
  } catch (error) {
    console.error("Failed to change locale:", error);
  }
}

// Eagerly import all translation files
const translationModules = import.meta.glob<{ default: Record<string, string> }>(
  "./locales/*/*.json",
  { eager: true },
);

// Build resources object
const resources: Record<string, Record<string, Record<string, string>>> = {};

for (const [path, module] of Object.entries(translationModules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (match) {
    const [, lng, ns] = match;
    if (!resources[lng]) {
      resources[lng] = {};
    }
    resources[lng][ns] = module.default;
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: SAVED_OR_DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES_ARRAY,
  defaultNS: "common",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// Set initial dir
const initialLocale = SUPPORTED_LOCALES[SAVED_OR_DEFAULT_LOCALE];
if (typeof document !== "undefined") {
  document.documentElement.dir = initialLocale.dir;
  document.documentElement.lang = SAVED_OR_DEFAULT_LOCALE;
}

export default i18n;
