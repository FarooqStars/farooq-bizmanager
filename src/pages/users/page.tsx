import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Users, ShieldCheck } from "lucide-react";
import TeamMembersTab from "./_components/team-members-tab.tsx";
import AccessRulesTab from "./_components/access-rules-tab.tsx";

export default function UsersPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6" /> Team Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your team members, profiles, and access permissions
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="cursor-pointer">
            <Users className="w-4 h-4 mr-2" /> Team Members
          </TabsTrigger>
          <TabsTrigger value="access" className="cursor-pointer">
            <ShieldCheck className="w-4 h-4 mr-2" /> Access Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <TeamMembersTab />
        </TabsContent>
        <TabsContent value="access" className="mt-4">
          <AccessRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
