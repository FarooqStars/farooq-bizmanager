import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { format } from "date-fns";
import {
  Download, Package, Users, ShoppingCart, Receipt, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { downloadCSV } from "./csv-utils.ts";

type ExportTarget = "products" | "customers" | "sales" | "expenses" | "vendors";

const EXPORT_CONFIG: Record<ExportTarget, { label: string; icon: React.ElementType; description: string }> = {
  products: { label: "Products & Services", icon: Package, description: "All products and services with pricing" },
  customers: { label: "Customers", icon: Users, description: "Customer directory with contact info" },
  sales: { label: "Sales", icon: ShoppingCart, description: "All sales transactions" },
  expenses: { label: "Expenses", icon: Receipt, description: "All recorded expenses" },
  vendors: { label: "Vendors", icon: Receipt, description: "Vendor directory" },
};

function ExportButton({ target }: { target: ExportTarget }) {
  const [exporting, setExporting] = useState(false);
  const config = EXPORT_CONFIG[target];

  // Use queries to fetch data
  const products = useQuery(api.products.listProducts, target === "products" ? {} : "skip");
  const customers = useQuery(api.sales.listCustomers, target === "customers" ? {} : "skip");
  const sales = useQuery(api.sales.listSales, target === "sales" ? {} : "skip");
  const expenses = useQuery(api.vendors.listExpenses, target === "expenses" ? {} : "skip");
  const vendors = useQuery(api.vendors.listVendors, target === "vendors" ? {} : "skip");

  const handleExport = () => {
    setExporting(true);
    try {
      let data: Record<string, unknown>[] = [];
      let filename = "";

      switch (target) {
        case "products":
          if (!products) return;
          data = products.map((p) => ({
            Name: p.name,
            SKU: p.sku ?? "",
            Type: p.type,
            "Unit Price": p.unitPrice,
            Unit: p.unit ?? "",
            Category: p.category?.name ?? "",
            "Low Stock Threshold": p.lowStockThreshold ?? "",
            Description: p.description ?? "",
            Active: p.isActive ? "Yes" : "No",
          }));
          filename = `products-${format(new Date(), "yyyy-MM-dd")}.csv`;
          break;

        case "customers":
          if (!customers) return;
          data = customers.map((c) => ({
            Name: c.name,
            Email: c.email ?? "",
            Phone: c.phone ?? "",
            Address: c.address ?? "",
            Notes: c.notes ?? "",
          }));
          filename = `customers-${format(new Date(), "yyyy-MM-dd")}.csv`;
          break;

        case "sales":
          if (!sales) return;
          data = sales.map((s) => ({
            Date: s.date,
            Customer: s.customer?.name ?? s.customerName ?? "Walk-in",
            Amount: s.totalAmount,
            Status: s.status,
            Notes: s.notes ?? "",
          }));
          filename = `sales-${format(new Date(), "yyyy-MM-dd")}.csv`;
          break;

        case "expenses":
          if (!expenses) return;
          data = expenses.map((e) => ({
            Title: e.title,
            Amount: e.amount,
            Date: e.date,
            Category: e.category?.name ?? "",
            Vendor: e.vendor?.name ?? "",
            Notes: e.notes ?? "",
          }));
          filename = `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`;
          break;

        case "vendors":
          if (!vendors) return;
          data = vendors.map((v) => ({
            Name: v.name,
            "Contact Name": v.contactName ?? "",
            Email: v.email ?? "",
            Phone: v.phone ?? "",
            Address: v.address ?? "",
            Active: v.isActive ? "Yes" : "No",
            Notes: v.notes ?? "",
          }));
          filename = `vendors-${format(new Date(), "yyyy-MM-dd")}.csv`;
          break;
      }

      if (data.length === 0) {
        setExporting(false);
        return;
      }

      downloadCSV(data, filename);
    } finally {
      setExporting(false);
    }
  };

  const Icon = config.icon;
  const isLoading = (
    (target === "products" && products === undefined) ||
    (target === "customers" && customers === undefined) ||
    (target === "sales" && sales === undefined) ||
    (target === "expenses" && expenses === undefined) ||
    (target === "vendors" && vendors === undefined)
  );

  const count = (
    target === "products" ? products?.length :
    target === "customers" ? customers?.length :
    target === "sales" ? sales?.length :
    target === "expenses" ? expenses?.length :
    target === "vendors" ? vendors?.length : 0
  ) ?? 0;

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>
      <Badge variant="secondary" className="text-xs">{count} records</Badge>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleExport}
        disabled={isLoading || exporting || count === 0}
        className="cursor-pointer"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <><Download className="w-3.5 h-3.5 mr-1.5" />Export</>
        )}
      </Button>
    </div>
  );
}

export default function ExportPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(Object.keys(EXPORT_CONFIG) as ExportTarget[]).map((target) => (
          <ExportButton key={target} target={target} />
        ))}
      </CardContent>
    </Card>
  );
}
