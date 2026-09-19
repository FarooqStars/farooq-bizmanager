import type React from "react";
import { useNavigate } from "react-router-dom";
import { Authenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
  ShieldCheck, Shield, ListTree, Users, Calculator, CalendarRange,
  Building2, ScrollText, ArrowRight, CreditCard,
} from "lucide-react";
import GLAccountsTab from "./_components/gl-accounts-tab.tsx";
import CreditControlTab from "./_components/credit-control-tab.tsx";

// ─── Link cards for tabs that point to existing pages ──────────────

type LinkCardConfig = {
  title: string;
  description: string;
  to: string;
  buttonLabel: string;
  icon: React.ElementType;
};

function LinkCard({ config }: { config: LinkCardConfig }) {
  const navigate = useNavigate();
  const Icon = config.icon;
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription className="mt-1">{config.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button onClick={() => navigate(config.to)} className="cursor-pointer">
          {config.buttonLabel} <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}

const LINK_CARDS: Record<string, LinkCardConfig> = {
  users: {
    title: "Users & Team",
    description: "Manage team members, roles, and access permissions for your organization.",
    to: "/users",
    buttonLabel: "Go to Users",
    icon: Users,
  },
  tax: {
    title: "Tax Rates",
    description: "Configure tax rates and codes applied across invoices, sales, and purchases.",
    to: "/tax",
    buttonLabel: "Go to Tax Rates",
    icon: Calculator,
  },
  fiscal: {
    title: "Fiscal Year",
    description: "Manage your accounting periods, closing dates, and fiscal year settings.",
    to: "/accounting",
    buttonLabel: "Go to Accounting",
    icon: CalendarRange,
  },
  company: {
    title: "Company Profile",
    description: "Update your company identity, address, and branding for all documents.",
    to: "/company-profile",
    buttonLabel: "Go to Company Profile",
    icon: Building2,
  },
  audit: {
    title: "Audit Log",
    description: "Review the full history of changes and actions taken across the system.",
    to: "/audit",
    buttonLabel: "Go to Audit Log",
    icon: ScrollText,
  },
};

// ─── Access denied ─────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Shield /></EmptyMedia>
          <EmptyTitle>Access denied</EmptyTitle>
          <EmptyDescription>
            The Admin Control Panel is only available to account owners.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

// ─── Panel (authenticated + owner) ─────────────────────────────────

function AdminPanel() {
  const currentUser = useQuery(api.users.getCurrentUser);

  if (currentUser === undefined) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "owner") {
    return <AccessDenied />;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" /> Admin Control Panel
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage core system configuration for your business.
        </p>
      </div>

      <Tabs defaultValue="gl-accounts">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="gl-accounts" className="cursor-pointer">
            <ListTree className="w-4 h-4 mr-2" /> GL Accounts
          </TabsTrigger>
          <TabsTrigger value="users" className="cursor-pointer">
            <Users className="w-4 h-4 mr-2" /> Users
          </TabsTrigger>
          <TabsTrigger value="tax" className="cursor-pointer">
            <Calculator className="w-4 h-4 mr-2" /> Tax Rates
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="cursor-pointer">
            <CalendarRange className="w-4 h-4 mr-2" /> Fiscal Year
          </TabsTrigger>
          <TabsTrigger value="company" className="cursor-pointer">
            <Building2 className="w-4 h-4 mr-2" /> Company Profile
          </TabsTrigger>
          <TabsTrigger value="audit" className="cursor-pointer">
            <ScrollText className="w-4 h-4 mr-2" /> Audit Log
          </TabsTrigger>
          <TabsTrigger value="credit-control" className="cursor-pointer">
            <CreditCard className="w-4 h-4 mr-2" /> Credit Control
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gl-accounts" className="mt-4">
          <GLAccountsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <LinkCard config={LINK_CARDS.users} />
        </TabsContent>
        <TabsContent value="tax" className="mt-4">
          <LinkCard config={LINK_CARDS.tax} />
        </TabsContent>
        <TabsContent value="fiscal" className="mt-4">
          <LinkCard config={LINK_CARDS.fiscal} />
        </TabsContent>
        <TabsContent value="company" className="mt-4">
          <LinkCard config={LINK_CARDS.company} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <LinkCard config={LINK_CARDS.audit} />
        </TabsContent>
        <TabsContent value="credit-control" className="mt-4">
          <CreditControlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <>
      <AuthLoading>
        <div className="p-6 max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AuthLoading>
      <Authenticated>
        <AdminPanel />
      </Authenticated>
    </>
  );
}
