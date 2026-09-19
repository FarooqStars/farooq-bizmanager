import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Shield, Users, ScrollText, Activity } from "lucide-react";
import RolesTab from "./_components/roles-tab.tsx";
import AccessLogTab from "./_components/access-log-tab.tsx";
import SecurityDashboardTab from "./_components/security-dashboard-tab.tsx";

export default function SecurityPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Security & Roles
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage roles, permissions, and monitor system access
        </p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="cursor-pointer">
            <Activity className="w-4 h-4 mr-2" /> Security Overview
          </TabsTrigger>
          <TabsTrigger value="roles" className="cursor-pointer">
            <Users className="w-4 h-4 mr-2" /> Roles & Permissions
          </TabsTrigger>
          <TabsTrigger value="access" className="cursor-pointer">
            <ScrollText className="w-4 h-4 mr-2" /> Access Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <SecurityDashboardTab />
        </TabsContent>
        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
        <TabsContent value="access" className="mt-4">
          <AccessLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
