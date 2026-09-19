/**
 * Reports 6, 7, 8 — AR/AP Ageing Summary + Customer Statement.
 * Accessed as a sub-route tab from the Reports hub.
 */
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Users, Building2, FileText } from "lucide-react";
import ARAgeing from "./_components/ARAgeing.tsx";
import APAgeing from "./_components/APAgeing.tsx";
import CustomerStatement from "./_components/CustomerStatement.tsx";

export default function AgeingPage() {
  const [tab, setTab] = useState<"ar" | "ap" | "statement">("ar");

  return (
    <div className="flex flex-col min-h-full">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col">
        <div className="border-b px-4 pt-3 pb-0 print:hidden">
          <TabsList className="h-auto gap-1">
            <TabsTrigger value="ar" className="gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" /> AR Ageing
            </TabsTrigger>
            <TabsTrigger value="ap" className="gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5" /> AP Ageing
            </TabsTrigger>
            <TabsTrigger value="statement" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" /> Customer Statement
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ar" className="flex-1 m-0">
          <ARAgeing />
        </TabsContent>
        <TabsContent value="ap" className="flex-1 m-0">
          <APAgeing />
        </TabsContent>
        <TabsContent value="statement" className="flex-1 m-0">
          <CustomerStatement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
