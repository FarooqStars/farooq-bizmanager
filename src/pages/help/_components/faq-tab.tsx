import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { ChevronDown, ChevronUp, SearchX } from "lucide-react";
import { FAQ_KEYS } from "./help-data.ts";
import type { FaqKey } from "./help-data.ts";

export default function FaqTab({ search }: { search: string }) {
  const { t } = useTranslation("help");
  const [expanded, setExpanded] = useState<FaqKey | null>(null);

  const filtered = FAQ_KEYS.filter((key) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const question = t(`faq.${key}`).toLowerCase();
    const answer = t(`faq.${key}_answer`).toLowerCase();
    return question.includes(searchLower) || answer.includes(searchLower);
  });

  if (filtered.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
          <EmptyTitle>{t("help.no_results")}</EmptyTitle>
          <EmptyDescription>{t("help.try_different")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-1 mt-4">
      {filtered.map((key) => {
        const isExpanded = expanded === key;
        return (
          <div key={key} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(isExpanded ? null : key)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <span className="text-sm font-medium">{t(`faq.${key}`)}</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pt-0">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(`faq.${key}_answer`)}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
