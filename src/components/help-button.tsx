import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { HelpCircle, BookOpen, Lightbulb, ExternalLink } from "lucide-react";
import { ROUTE_TO_GUIDE, GUIDE_READ_TIMES } from "@/pages/help/_components/help-data.ts";
import type { GuideKey } from "@/pages/help/_components/help-data.ts";

export default function HelpButton() {
  const { t } = useTranslation("help");
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const currentGuideKey = ROUTE_TO_GUIDE[location.pathname] as GuideKey | undefined;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => {
          if (currentGuideKey) {
            setOpen(true);
          } else {
            navigate("/help");
          }
        }}
        title={t("help.open_help")}
      >
        <HelpCircle className="w-4 h-4" />
        <span className="hidden sm:inline text-xs">{t("help.open_help")}</span>
      </Button>

      {/* Context-sensitive help dialog */}
      {currentGuideKey && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                {t(`guide.${currentGuideKey}.title`)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground italic">
                {t(`guide.${currentGuideKey}.desc`)}
              </p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {t(`guide.${currentGuideKey}.content`)}
              </div>
              <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <CardContent className="py-3 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {t(`guide.${currentGuideKey}.tip`)}
                  </p>
                </CardContent>
              </Card>
              <Button
                className="w-full cursor-pointer"
                variant="secondary"
                onClick={() => { setOpen(false); navigate("/help"); }}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t("help.back_to_help")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
