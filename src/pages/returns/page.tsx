import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { RotateCcw, PackageCheck, Ship } from "lucide-react";
import ReturnsTab from "./_components/returns-tab.tsx";
import LandedCostTab from "./_components/landed-cost-tab.tsx";

function ReturnsInner() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RotateCcw className="w-6 h-6" /> Returns & Landed Cost
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage customer returns, restocking, and allocate landed costs to purchase orders
        </p>
      </div>

      <Tabs defaultValue="returns">
        <TabsList>
          <TabsTrigger value="returns" className="cursor-pointer">
            <PackageCheck className="w-4 h-4 mr-1.5" /> Returns / RMA
          </TabsTrigger>
          <TabsTrigger value="landed-cost" className="cursor-pointer">
            <Ship className="w-4 h-4 mr-1.5" /> Landed Cost
          </TabsTrigger>
        </TabsList>

        <TabsContent value="returns" className="mt-4"><ReturnsTab /></TabsContent>
        <TabsContent value="landed-cost" className="mt-4"><LandedCostTab /></TabsContent>
      </Tabs>
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <>
      <Authenticated><ReturnsInner /></Authenticated>
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RotateCcw className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to access returns</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <AuthLoading><Skeleton className="h-96 w-full" /></AuthLoading>
    </>
  );
}
