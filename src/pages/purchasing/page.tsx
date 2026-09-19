import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { ShoppingBag, FileText, TicketMinus, BarChart3 } from "lucide-react";
import PurchaseOrdersTab from "./_components/purchase-orders-tab.tsx";
import VendorCreditsTab from "./_components/vendor-credits-tab.tsx";
import APSummaryTab from "./_components/ap-summary-tab.tsx";

function PurchasingInner() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-6 h-6" /> Accounts Payable & Purchasing
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage purchase orders, vendor bills, credits, and AP workflows
        </p>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders" className="cursor-pointer">
            <FileText className="w-4 h-4 mr-1.5" /> Purchase Orders
          </TabsTrigger>
          <TabsTrigger value="credits" className="cursor-pointer">
            <TicketMinus className="w-4 h-4 mr-1.5" /> Vendor Credits
          </TabsTrigger>
          <TabsTrigger value="summary" className="cursor-pointer">
            <BarChart3 className="w-4 h-4 mr-1.5" /> AP Summary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders"><PurchaseOrdersTab /></TabsContent>
        <TabsContent value="credits"><VendorCreditsTab /></TabsContent>
        <TabsContent value="summary"><APSummaryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

export default function PurchasingPage() {
  return (
    <>
      <Authenticated><PurchasingInner /></Authenticated>
      <Unauthenticated>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <ShoppingBag className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to access purchasing</p>
          <SignInButton />
        </div>
      </Unauthenticated>
      <AuthLoading><Skeleton className="h-96 w-full" /></AuthLoading>
    </>
  );
}
