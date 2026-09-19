import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { convexUrl } from "@/lib/convex-url.ts";
import { useConvexAuthBridge } from "./auth.tsx";

const convex = new ConvexReactClient(convexUrl);

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useConvexAuthBridge}>
      {children}
    </ConvexProviderWithAuth>
  );
}
