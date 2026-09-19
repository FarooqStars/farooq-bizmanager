import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { BookOpen, Clock, Lightbulb, ChevronRight, SearchX } from "lucide-react";
import { GUIDE_KEYS, GUIDE_CATEGORIES, GUIDE_READ_TIMES } from "./help-data.ts";
import type { GuideKey } from "./help-data.ts";

export default function GuidesTab({ search }: { search: string }) {
  const { t } = useTranslation("help");
  const [selectedGuide, setSelectedGuide] = useState<GuideKey | null>(null);

  const filteredGuides = GUIDE_KEYS.filter((key) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const title = t(`guide.${key}.title`).toLowerCase();
    const desc = t(`guide.${key}.desc`).toLowerCase();
    const content = t(`guide.${key}.content`).toLowerCase();
    return title.includes(searchLower) || desc.includes(searchLower) || content.includes(searchLower);
  });

  if (filteredGuides.length === 0) {
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
    <div className="space-y-6 mt-4">
      {/* Category sections */}
      {Object.entries(GUIDE_CATEGORIES).map(([categoryKey, guideKeys]) => {
        const visibleGuides = guideKeys.filter((gk) => filteredGuides.includes(gk));
        if (visibleGuides.length === 0) return null;

        return (
          <div key={categoryKey} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t(categoryKey)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleGuides.map((key) => (
                <Card
                  key={key}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setSelectedGuide(key)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <h4 className="font-semibold text-sm">{t(`guide.${key}.title`)}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {t(`guide.${key}.desc`)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="w-3 h-3 mr-0.5" />
                          {t("help.estimated_time", { minutes: GUIDE_READ_TIMES[key] })}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {/* Guide Detail Dialog */}
      <Dialog open={!!selectedGuide} onOpenChange={(o) => { if (!o) setSelectedGuide(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedGuide && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  {t(`guide.${selectedGuide}.title`)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm text-muted-foreground italic">
                  {t(`guide.${selectedGuide}.desc`)}
                </p>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {t(`guide.${selectedGuide}.content`)}
                </div>
                <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <CardContent className="py-3 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      {t(`guide.${selectedGuide}.tip`)}
                    </p>
                  </CardContent>
                </Card>
                <FeedbackSection />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeedbackSection() {
  const { t } = useTranslation("help");
  const [feedback, setFeedback] = useState<"yes" | "no" | null>(null);

  if (feedback) {
    return (
      <p className="text-sm text-muted-foreground text-center py-2">
        {t("help.thanks_feedback")}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 pt-2 border-t">
      <span className="text-sm text-muted-foreground">{t("help.was_helpful")}</span>
      <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setFeedback("yes")}>
        {t("help.yes")}
      </Button>
      <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setFeedback("no")}>
        {t("help.no")}
      </Button>
    </div>
  );
}
