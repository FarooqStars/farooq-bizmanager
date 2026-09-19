// Thin notice shown on every screen when the backend runs in public demo mode
// (DEMO_MODE=true on the Convex deployment). Shows nothing otherwise.
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@/convex/_generated/api.js";

export default function DemoBanner() {
  const status = useQuery(api.demo.status);
  const { t } = useTranslation();
  if (!status?.enabled) return null;
  return (
    <div className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 text-xs sm:text-sm text-center px-3 py-1.5 border-b border-amber-200 dark:border-amber-800">
      {t("demo.banner")}
    </div>
  );
}
