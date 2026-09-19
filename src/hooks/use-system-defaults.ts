import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { getCountryConfig, type CountryConfig } from "@/lib/country-defaults.ts";

/**
 * Returns the system default country configuration from Company Profile.
 * Other modules use this to pre-fill country-related defaults.
 * Returns null while loading, and falls back to Qatar if no country is set.
 */
export function useSystemDefaults(): {
  isLoading: boolean;
  defaultCountry: string;
  countryConfig: CountryConfig;
  defaultCurrency: string;
} {
  const profile = useQuery(api.companyProfile.get);

  if (profile === undefined) {
    return {
      isLoading: true,
      defaultCountry: "QA",
      countryConfig: getCountryConfig("QA"),
      defaultCurrency: "QAR",
    };
  }

  const defaultCountry = profile?.defaultCountry ?? "QA";
  const countryConfig = getCountryConfig(defaultCountry);
  const defaultCurrency = profile?.defaultCurrency ?? countryConfig.currency;

  return {
    isLoading: false,
    defaultCountry,
    countryConfig,
    defaultCurrency,
  };
}
