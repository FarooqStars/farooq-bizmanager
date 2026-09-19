import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Search, BookOpen, GraduationCap, HelpCircle, Keyboard } from "lucide-react";
import GuidesTab from "./_components/guides-tab.tsx";
import TutorialsTab from "./_components/tutorials-tab.tsx";
import FaqTab from "./_components/faq-tab.tsx";
import ShortcutsTab from "./_components/shortcuts-tab.tsx";

export default function HelpPage() {
  const { t } = useTranslation("help");
  const [search, setSearch] = useState("");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <HelpCircle className="w-7 h-7 text-primary" />
          {t("help.title")}
        </h1>
        <p className="text-muted-foreground">{t("help.subtitle")}</p>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("help.search_placeholder")}
          className="ps-10"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="guides">
        <TabsList>
          <TabsTrigger value="guides" className="cursor-pointer gap-1.5">
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">{t("help.tabs.guides")}</span>
          </TabsTrigger>
          <TabsTrigger value="tutorials" className="cursor-pointer gap-1.5">
            <GraduationCap className="w-4 h-4" />
            <span className="hidden sm:inline">{t("help.tabs.tutorials")}</span>
          </TabsTrigger>
          <TabsTrigger value="faq" className="cursor-pointer gap-1.5">
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline">{t("help.tabs.faq")}</span>
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="cursor-pointer gap-1.5">
            <Keyboard className="w-4 h-4" />
            <span className="hidden sm:inline">{t("help.tabs.shortcuts")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guides">
          <GuidesTab search={search} />
        </TabsContent>
        <TabsContent value="tutorials">
          <TutorialsTab search={search} />
        </TabsContent>
        <TabsContent value="faq">
          <FaqTab search={search} />
        </TabsContent>
        <TabsContent value="shortcuts">
          <ShortcutsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
