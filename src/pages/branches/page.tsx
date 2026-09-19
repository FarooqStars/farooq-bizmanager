import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useTranslation } from "react-i18next";
import { Building2, ArrowRightLeft, BarChart3, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { cn } from "@/lib/utils.ts";
import BranchesTab from "./_components/branches-tab.tsx";
import TransfersTab from "./_components/transfers-tab.tsx";
import ReportTab from "./_components/report-tab.tsx";

type Tab = "branches" | "transfers" | "report";

function BranchesContent() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("branches");

  const tabs = [
    { id: "branches" as const, label: t("branches.tabs.branches"), icon: Building2 },
    { id: "transfers" as const, label: t("branches.tabs.transfers"), icon: ArrowRightLeft },
    { id: "report" as const, label: t("branches.tabs.report"), icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all cursor-pointer",
              activeTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "branches" && <BranchesTab />}
      {activeTab === "transfers" && <TransfersTab />}
      {activeTab === "report" && <ReportTab />}
    </div>
  );
}

export default function BranchesPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold">{t("branches.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("branches.subtitle")}</p>
      </header>

      <AuthLoading>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </AuthLoading>
      <Unauthenticated>
        <div className="flex flex-col items-center gap-4 py-12">
          <AlertTriangle className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground">{t("branches.signInRequired")}</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <Authenticated>
        <BranchesContent />
      </Authenticated>
    </div>
  );
}
