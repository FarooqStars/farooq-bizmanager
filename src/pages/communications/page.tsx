import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { MessageSquare, History, FileText, Bell } from "lucide-react";
import PaymentRemindersTab from "./_components/payment-reminders-tab.tsx";
import CommunicationLogTab from "./_components/communication-log-tab.tsx";
import MessageTemplatesTab from "./_components/message-templates-tab.tsx";

export default function CommunicationsPage() {
  const [tab, setTab] = useState("reminders");

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6" /> Communication Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Send reminders, share documents, and manage message templates
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="reminders" className="flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Payment Reminders
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Communication Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reminders" className="mt-4"><PaymentRemindersTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><MessageTemplatesTab /></TabsContent>
        <TabsContent value="log" className="mt-4"><CommunicationLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
