import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Keyboard } from "lucide-react";

export default function ShortcutsTab() {
  const { t } = useTranslation("help");

  const shortcuts = [
    {
      section: t("shortcuts.general"),
      items: [
        { label: t("shortcuts.search"), key: t("shortcuts.search_key") },
        { label: t("shortcuts.esc"), key: t("shortcuts.esc_key") },
      ],
    },
    {
      section: t("shortcuts.pos"),
      items: [
        { label: t("shortcuts.pos_search"), key: t("shortcuts.pos_search_key") },
      ],
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Keyboard className="w-4 h-4" />
        <span className="text-sm">{t("shortcuts.title")}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shortcuts.map((group) => (
          <Card key={group.section}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{group.section}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.items.map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
