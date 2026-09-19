import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, List, Percent, Megaphone, Calendar, Users } from "lucide-react";
import PriceListsTab from "./_components/price-lists-tab.tsx";
import QuantityDiscountsTab from "./_components/quantity-discounts-tab.tsx";
import PromotionsTab from "./_components/promotions-tab.tsx";
import ScheduledChangesTab from "./_components/scheduled-changes-tab.tsx";
import CustomerPricingTab from "./_components/customer-pricing-tab.tsx";

export default function PricingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="w-6 h-6" />
          Advanced Pricing
        </h1>
        <p className="text-muted-foreground">Manage price lists, volume discounts, customer pricing, promotions, and scheduled price changes</p>
      </div>

      <Tabs defaultValue="price-lists" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="price-lists" className="cursor-pointer gap-1.5">
            <List className="w-4 h-4" /> Price Lists
          </TabsTrigger>
          <TabsTrigger value="quantity-discounts" className="cursor-pointer gap-1.5">
            <Percent className="w-4 h-4" /> Volume Discounts
          </TabsTrigger>
          <TabsTrigger value="customer-pricing" className="cursor-pointer gap-1.5">
            <Users className="w-4 h-4" /> Customer Pricing
          </TabsTrigger>
          <TabsTrigger value="promotions" className="cursor-pointer gap-1.5">
            <Megaphone className="w-4 h-4" /> Promotions
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="cursor-pointer gap-1.5">
            <Calendar className="w-4 h-4" /> Scheduled Changes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="price-lists">
          <PriceListsTab />
        </TabsContent>
        <TabsContent value="quantity-discounts">
          <QuantityDiscountsTab />
        </TabsContent>
        <TabsContent value="customer-pricing">
          <CustomerPricingTab />
        </TabsContent>
        <TabsContent value="promotions">
          <PromotionsTab />
        </TabsContent>
        <TabsContent value="scheduled">
          <ScheduledChangesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
