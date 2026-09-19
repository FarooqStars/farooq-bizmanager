import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import {
  Building2,
  FileText,
  Package,
  CreditCard,
  LogOut,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import LocaleSwitcher from "@/components/locale-switcher.tsx";
import InvoicesView from "./_components/invoices-view.tsx";
import OrdersView from "./_components/orders-view.tsx";
import PaymentsView from "./_components/payments-view.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Tab = "invoices" | "orders" | "payments";

export default function CustomerPortalPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("invoices");

  const customer = useQuery(
    api.customerPortal.lookupCustomer,
    submittedEmail ? { email: submittedEmail } : "skip"
  );

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmittedEmail(email.trim());
    }
  };

  const handleLogout = () => {
    setSubmittedEmail("");
    setEmail("");
  };

  // Not logged in - show login form
  if (!submittedEmail || customer === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
        <div className="absolute right-4 top-4">
          <LocaleSwitcher compact />
        </div>
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-primary shadow-lg">
              <Building2 className="size-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">{t("portal.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("portal.subtitle")}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("portal.login.title")}</CardTitle>
              <CardDescription>{t("portal.login.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t("portal.login.email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full cursor-pointer">
                  {t("portal.login.submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Email submitted but no customer found
  if (customer === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
        <div className="absolute right-4 top-4">
          <LocaleSwitcher compact />
        </div>
        <div className="w-full max-w-md space-y-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <Mail className="mx-auto mb-3 size-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{t("portal.notFound.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("portal.notFound.description")}</p>
              <Button
                variant="secondary"
                className="mt-4 cursor-pointer"
                onClick={handleLogout}
              >
                {t("portal.notFound.tryAgain")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Logged in - show portal
  const tabs = [
    { id: "invoices" as const, label: t("portal.tabs.invoices"), icon: FileText },
    { id: "orders" as const, label: t("portal.tabs.orders"), icon: Package },
    { id: "payments" as const, label: t("portal.tabs.payments"), icon: CreditCard },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <Building2 className="size-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("portal.header.title")}</p>
              <p className="text-xs text-muted-foreground">{customer.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitcher compact />
            <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5 text-xs" onClick={handleLogout}>
              <LogOut className="size-3.5" />
              {t("portal.header.logout")}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl p-4 md:p-8">
        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border bg-muted/30 p-1">
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
        {activeTab === "invoices" && (
          <InvoicesView customerId={customer._id as Id<"customers">} />
        )}
        {activeTab === "orders" && (
          <OrdersView email={submittedEmail} />
        )}
        {activeTab === "payments" && (
          <PaymentsView customerId={customer._id as Id<"customers">} />
        )}
      </main>
    </div>
  );
}
