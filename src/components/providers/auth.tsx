// ─────────────────────────────────────────────────────────────────────────────
// Built-in sign-in for Farooq BizManager (email + password).
//
// Keeps the access token + refresh token in localStorage, refreshes the access
// token before it expires, and hands it to Convex through ConvexProviderWithAuth
// (see convex.tsx). The server side lives in convex/authActions.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api.js";
import { convexUrl } from "@/lib/convex-url.ts";

type Stored = { token: string; refreshToken: string };

const STORAGE_KEY = "fbm.auth";
const authHttp = new ConvexHttpClient(convexUrl);

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed.token && parsed.refreshToken ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — the session simply will not survive a reload
  }
}

function secondsLeft(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (payload.exp ?? 0) - Date.now() / 1000;
  } catch {
    return 0;
  }
}

/** Error code sent by the server ("UNAUTHENTICATED", "LOCKED", …) or "NETWORK". */
export function authErrorCode(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { code?: string } | undefined;
    return data?.code ?? "UNKNOWN";
  }
  return "NETWORK";
}

type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  setupOwner: (args: { name: string; email: string; password: string; companyName?: string }) => Promise<void>;
  /** Opens the sign-in screen. */
  signin: () => Promise<void>;
  signout: () => Promise<void>;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<Stored | null>(() => readStored());
  const storedRef = useRef(stored);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const save = useCallback((value: Stored | null) => {
    storedRef.current = value;
    writeStored(value);
    setStored(value);
  }, []);

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStored();
      storedRef.current = next;
      setStored(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      // Another tab may have refreshed already.
      const current = readStored() ?? storedRef.current;
      if (!current) return null;
      if (!forceRefreshToken && secondsLeft(current.token) > 60) return current.token;

      if (!refreshing.current) {
        refreshing.current = (async () => {
          try {
            const next = await authHttp.action(api.authActions.refresh, {
              refreshToken: current.refreshToken,
            });
            save(next);
            return next.token;
          } catch (err) {
            if (authErrorCode(err) === "NETWORK") return null; // offline: keep the session
            save(null); // expired or revoked
            return null;
          } finally {
            refreshing.current = null;
          }
        })();
      }
      return refreshing.current;
    },
    [save],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const tokens = await authHttp.action(api.authActions.signIn, { email, password });
      save(tokens);
    },
    [save],
  );

  const setupOwner = useCallback(
    async (args: { name: string; email: string; password: string; companyName?: string }) => {
      const tokens = await authHttp.action(api.authActions.setupOwner, args);
      save(tokens);
    },
    [save],
  );

  const signout = useCallback(async () => {
    const current = storedRef.current;
    save(null);
    if (current) {
      try {
        await authHttp.action(api.authActions.signOut, { refreshToken: current.refreshToken });
      } catch {
        // already signed out locally — nothing else to do
      }
    }
    window.location.assign("/");
  }, [save]);

  const signin = useCallback(async () => {
    window.location.assign("/");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: stored !== null,
      isLoading: false,
      error: null,
      signInWithPassword,
      setupOwner,
      signin,
      signout,
      fetchAccessToken,
    }),
    [stored, signInWithPassword, setupOwner, signin, signout, fetchAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Shape Convex's ConvexProviderWithAuth expects. */
export function useConvexAuthBridge() {
  const { isAuthenticated, isLoading, fetchAccessToken } = useAuth();
  return useMemo(
    () => ({ isAuthenticated, isLoading, fetchAccessToken }),
    [isAuthenticated, isLoading, fetchAccessToken],
  );
}
