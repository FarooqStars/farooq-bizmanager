import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { GraduationCap, CheckCircle2, SearchX } from "lucide-react";
import { TUTORIAL_KEYS } from "./help-data.ts";
import type { TutorialKey } from "./help-data.ts";

export default function TutorialsTab({ search }: { search: string }) {
  const { t } = useTranslation("help");
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialKey | null>(null);

  const filtered = TUTORIAL_KEYS.filter((key) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const title = t(`tutorial.${key}.title`).toLowerCase();
    // Also search through steps
    let stepsText = "";
    for (let i = 1; i <= 5; i++) {
      stepsText += t(`tutorial.${key}.steps.${i}`).toLowerCase() + " ";
    }
    return title.includes(searchLower) || stepsText.includes(searchLower);
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
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((key) => (
          <Card
            key={key}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setSelectedTutorial(key)}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <h4 className="font-semibold text-sm">{t(`tutorial.${key}.title`)}</h4>
                  <Badge variant="secondary" className="text-xs">{t("help.steps", { count: 5 })}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tutorial Detail Dialog */}
      <Dialog open={!!selectedTutorial} onOpenChange={(o) => { if (!o) setSelectedTutorial(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {selectedTutorial && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  {t(`tutorial.${selectedTutorial}.title`)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-3">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{step}</span>
                    </div>
                    <div className="flex-1 pb-3 border-b last:border-0">
                      <p className="text-sm">
                        {t(`tutorial.${selectedTutorial}.steps.${step}`)}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Complete!</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
