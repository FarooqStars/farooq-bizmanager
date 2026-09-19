// The first screen anyone sees. Two modes:
//   • First-time setup — shown only while the installation has no users.
//     Creates the owner account (and the company name) in one step.
//   • Sign in — email + password.
// Everything on this screen is translated (English / اردو / العربية).
import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "@/convex/_generated/api.js";
import { useAuth, authErrorCode } from "@/components/providers/auth.tsx";
import { changeLocale, SUPPORTED_LOCALES, SUPPORTED_LOCALES_ARRAY, type SupportedLocale } from "@/i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { cn } from "@/lib/utils.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorKey(err: unknown, setup: boolean): string {
  switch (authErrorCode(err)) {
    case "UNAUTHENTICATED":
      return "auth.errWrong";
    case "LOCKED":
      return "auth.errLocked";
    case "FORBIDDEN":
      return "auth.errDeactivated";
    case "CONFLICT":
      return setup ? "auth.errSetupDone" : "auth.errUnknown";
    case "NETWORK":
      return "auth.errNetwork";
    default:
      return "auth.errUnknown";
  }
}

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-1" aria-label={t("auth.language")}>
      {SUPPORTED_LOCALES_ARRAY.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => changeLocale(code as SupportedLocale)}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm transition-colors cursor-pointer",
            i18n.language === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {SUPPORTED_LOCALES[code].nativeName}
        </button>
      ))}
    </div>
  );
}

function SignInForm() {
  const { t } = useTranslation();
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError("auth.errEmail");
    if (!password) return setError("auth.errWrong");
    setBusy(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      setError(errorKey(err, false));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">{t("auth.signInTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.signInSubtitle")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" type="email" dir="ltr" autoComplete="email" autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <Input id="password" type="password" dir="ltr" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <Button type="submit" className="w-full h-11 text-base cursor-pointer" disabled={busy}>
        {busy ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
      <p className="text-xs text-muted-foreground text-center">{t("auth.forgot")}</p>
    </form>
  );
}

function SetupForm() {
  const { t } = useTranslation();
  const { setupOwner } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("auth.errName");
    if (!EMAIL_RE.test(email.trim())) return setError("auth.errEmail");
    if (password.length < 8) return setError("auth.errPasswordShort");
    if (password !== password2) return setError("auth.errPasswordsDontMatch");
    setBusy(true);
    try {
      await setupOwner({
        name: name.trim(),
        email: email.trim(),
        password,
        companyName: companyName.trim() || undefined,
      });
    } catch (err) {
      setError(errorKey(err, true));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold">{t("auth.setupTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.setupSubtitle")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">{t("auth.companyName")}</Label>
        <Input id="company" autoFocus value={companyName}
          onChange={(e) => setCompanyName(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">{t("auth.yourName")}</Label>
        <Input id="name" autoComplete="name" value={name}
          onChange={(e) => setName(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <Input id="email" type="email" dir="ltr" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} className="h-11" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input id="password" type="password" dir="ltr" autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password2">{t("auth.confirmPassword")}</Label>
          <Input id="password2" type="password" dir="ltr" autoComplete="new-password"
            value={password2} onChange={(e) => setPassword2(e.target.value)} className="h-11" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <Button type="submit" className="w-full h-11 text-base cursor-pointer" disabled={busy}>
        {busy ? t("auth.creating") : t("auth.createAndStart")}
      </Button>
    </form>
  );
}

function DemoBox({ email, password }: { email: string; password: string }) {
  const { t } = useTranslation();
  const { signInWithPassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(errorKey(err, false));
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 space-y-3 text-center">
      <p className="text-sm">{t("demo.intro")}</p>
      <Button type="button" onClick={go} disabled={busy} className="w-full h-11 text-base cursor-pointer">
        {busy ? t("auth.signingIn") : t("demo.try")}
      </Button>
      <p className="text-xs text-muted-foreground" dir="ltr">{email} · {password}</p>
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    </div>
  );
}

export default function SignInScreen() {
  const { t } = useTranslation();
  const status = useQuery(api.authStore.setupStatus);
  const demo = useQuery(api.demo.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/20 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <img src="/brand/icon-192.png" alt="Farooq BizManager"
            className="w-20 h-20 rounded-2xl mx-auto shadow-lg" />
          <h1 className="text-3xl font-bold tracking-tight">{t("app.name")}</h1>
          <p className="text-muted-foreground">{t("auth.tagline")}</p>
        </div>
        <LanguageSwitcher />
        <div className="bg-card border rounded-2xl shadow-sm p-6">
          {status === undefined || demo === undefined ? (
            <div className="flex justify-center py-10"><Spinner className="w-8 h-8" /></div>
          ) : demo.enabled && status.needsSetup ? (
            // Public demo that has not been built yet: never offer "first-time
            // setup" here, or a visitor could make themselves the owner.
            <p className="text-center text-sm text-muted-foreground py-6">{t("demo.notReady")}</p>
          ) : status.needsSetup ? (
            <SetupForm />
          ) : demo.enabled ? (
            <div className="space-y-6">
              <DemoBox email={demo.email} password={demo.password} />
              <SignInForm />
            </div>
          ) : (
            <SignInForm />
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">{t("auth.byline")}</p>
      </div>
    </div>
  );
}
