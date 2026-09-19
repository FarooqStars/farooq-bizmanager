// Start page: signed-in people go straight to the dashboard; everyone else
// sees the sign-in screen (or first-time setup on a brand-new installation).
import { useNavigate } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner.tsx";
import SignInScreen from "./auth/SignInScreen.tsx";

function RedirectToDashboard() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/dashboard", { replace: true }); }, [navigate]);
  return null;
}

export default function Index() {
  return (
    <>
      <Authenticated>
        <RedirectToDashboard />
      </Authenticated>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
    </>
  );
}
