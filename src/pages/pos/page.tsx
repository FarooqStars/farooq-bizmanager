import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  Receipt, X, CheckCircle, User, Keyboard,
  ArrowLeft, Banknote, CreditCard, Landmark,
  Wallet, Smartphone, SplitSquareVertical,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { useNavigate } from "react-router-dom";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useCompanyProfile, getDocumentHeaderHtml, getDocumentFooterHtml } from "@/lib/document-header.ts";

type CartItem = {
  productId: Id<"products">;
  name: string;
  unitPrice: number;
  quantity: number;
  unit: string;
};

type PaymentMethodCode = "cash" | "credit_card" | "debit_card" | "bank_transfer" | "cheque" | "paypal" | "mobile_pay" | "store_credit" | "other";

type SplitEntry = {
  method: PaymentMethodCode;
  amount: number;
  reference: string;
  cardLast4: string;
};

const POS_METHODS: { code: PaymentMethodCode; label: string; icon: React.ReactNode }[] = [
  { code: "cash", label: "Cash", icon: <Banknote className="w-5 h-5" /> },
  { code: "credit_card", label: "Credit Card", icon: <CreditCard className="w-5 h-5" /> },
  { code: "debit_card", label: "Debit Card", icon: <CreditCard className="w-5 h-5" /> },
  { code: "bank_transfer", label: "Bank Transfer", icon: <Landmark className="w-5 h-5" /> },
  { code: "paypal", label: "PayPal", icon: <Wallet className="w-5 h-5" /> },
  { code: "mobile_pay", label: "Mobile Pay", icon: <Smartphone className="w-5 h-5" /> },
];

// ── Receipt Modal ────────────────────────────────────────────────────────────

function ReceiptModal({
  items,
  total,
  customerName,
  paymentMethod,
  onClose,
  onNewSale,
}: {
  items: CartItem[];
  total: number;
  customerName: string;
  paymentMethod: string;
  onClose: () => void;
  onNewSale: () => void;
}) {
  const { fmt } = useCurrency();
  const companyProfile = useCompanyProfile();
  const logoUrl = useQuery(
    api.companyProfile.getLogoUrl,
    companyProfile?.logoStorageId ? { storageId: companyProfile.logoStorageId } : "skip"
  );

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow pop-ups"); return; }

    const rows = items.map((item) => `
      <tr>
        <td style="padding:4px 8px;">${item.name}</td>
        <td style="padding:4px 8px;text-align:center;">${item.quantity}</td>
        <td style="padding:4px 8px;text-align:right;">${fmt(item.unitPrice)}</td>
        <td style="padding:4px 8px;text-align:right;">${fmt(item.quantity * item.unitPrice)}</td>
      </tr>
    `).join("");

    const headerHtml = getDocumentHeaderHtml(companyProfile, logoUrl);
    const footerHtml = getDocumentFooterHtml(companyProfile);

    printWindow.document.write(`
      <html>
        <head><title>Receipt</title></head>
        <body style="font-family:monospace;max-width:300px;margin:0 auto;padding:20px;">
          ${headerHtml}
          <div style="text-align:center;margin-bottom:8px;">
            <p style="margin:4px 0;font-size:12px;font-weight:bold;">Receipt</p>
            <p style="margin:4px 0;font-size:11px;">${new Date().toLocaleString()}</p>
          </div>
          ${customerName ? `<p style="font-size:12px;">Customer: ${customerName}</p>` : ""}
          ${paymentMethod ? `<p style="font-size:12px;">Payment: ${paymentMethod}</p>` : ""}
          <hr style="border-style:dashed;" />
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid #000;">
                <th style="text-align:left;padding:4px 8px;">Item</th>
                <th style="text-align:center;padding:4px 8px;">Qty</th>
                <th style="text-align:right;padding:4px 8px;">Price</th>
                <th style="text-align:right;padding:4px 8px;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <hr style="border-style:dashed;" />
          <div style="text-align:right;font-size:16px;font-weight:bold;margin:8px 0;">
            Total: ${fmt(total)}
          </div>
          <hr style="border-style:dashed;" />
          ${footerHtml || '<p style="text-align:center;font-size:11px;margin-top:16px;">Thank you for your purchase!</p>'}
          <script>window.onload=()=>{window.print();window.close();}</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-5 h-5" /> Sale Completed!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-green-700 dark:text-green-400">{fmt(total)}</p>
            <p className="text-sm text-muted-foreground mt-1">{items.length} item(s)</p>
            {customerName && <p className="text-sm mt-1">Customer: {customerName}</p>}
            {paymentMethod && <p className="text-sm mt-1">Paid via: {paymentMethod}</p>}
          </div>

          <div className="rounded-lg border overflow-hidden max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2">{item.name}</td>
                    <td className="p-2 text-center">{item.quantity}x</td>
                    <td className="p-2 text-right font-medium">{fmt(item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="secondary" onClick={handlePrint}>
            <Receipt className="w-4 h-4 mr-1" /> Print Receipt
          </Button>
          <Button onClick={onNewSale}>
            <Plus className="w-4 h-4 mr-1" /> New Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment Method Selection Modal ──────────────────────────────────────────

function PaymentModal({
  total,
  accounts,
  accountId,
  onAccountChange,
  onConfirm,
  onClose,
}: {
  total: number;
  accounts: { _id: Id<"accounts">; name: string; subType?: string; type: string; balance?: number }[];
  accountId: string;
  onAccountChange: (v: string) => void;
  onConfirm: (payments: SplitEntry[]) => void;
  onClose: () => void;
}) {
  const { fmt } = useCurrency();
  const [mode, setMode] = useState<"single" | "split">("single");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodCode>("cash");
  const [reference, setReference] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [splits, setSplits] = useState<SplitEntry[]>([
    { method: "cash", amount: total, reference: "", cardLast4: "" },
  ]);

  const needsReference = selectedMethod === "credit_card" || selectedMethod === "debit_card" || selectedMethod === "bank_transfer" || selectedMethod === "paypal";
  const needsCard = selectedMethod === "credit_card" || selectedMethod === "debit_card";

  const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
  const splitRemaining = Math.round((total - splitTotal) * 100) / 100;

  const handleSingleConfirm = () => {
    if (!accountId) { toast.error("Select an account to deposit into"); return; }
    onConfirm([{ method: selectedMethod, amount: total, reference, cardLast4 }]);
  };

  const handleSplitConfirm = () => {
    if (!accountId) { toast.error("Select an account to deposit into"); return; }
    if (Math.abs(splitRemaining) > 0.01) {
      toast.error("Split amounts must equal the total");
      return;
    }
    onConfirm(splits.filter((s) => s.amount > 0));
  };

  const addSplit = () => {
    setSplits([...splits, { method: "cash", amount: Math.max(0, splitRemaining), reference: "", cardLast4: "" }]);
  };

  const removeSplit = (idx: number) => {
    setSplits(splits.filter((_, i) => i !== idx));
  };

  const updateSplit = (idx: number, field: keyof SplitEntry, value: string | number) => {
    setSplits(splits.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Payment — {fmt(total)}
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2 border-b pb-3">
          <Button
            size="sm"
            variant={mode === "single" ? "default" : "secondary"}
            className="cursor-pointer flex-1"
            onClick={() => setMode("single")}
          >
            Single Payment
          </Button>
          <Button
            size="sm"
            variant={mode === "split" ? "default" : "secondary"}
            className="cursor-pointer flex-1"
            onClick={() => setMode("split")}
          >
            <SplitSquareVertical className="w-4 h-4 mr-1" /> Split Payment
          </Button>
        </div>

        {/* Deposit account */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-sm">
            <Landmark className="w-4 h-4" /> Deposit Into Account
          </Label>
          {accounts.length > 0 ? (
            <Select value={accountId} onValueChange={onAccountChange}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Choose cash / bank account..." /></SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id} className="cursor-pointer">
                    {acc.name} ({acc.subType ?? acc.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">No cash or bank accounts. Add one in the General Ledger first.</p>
          )}
        </div>

        {mode === "single" ? (
          <div className="space-y-4 py-2">
            {/* Method grid */}
            <div className="grid grid-cols-3 gap-2">
              {POS_METHODS.map((m) => (
                <button
                  key={m.code}
                  onClick={() => setSelectedMethod(m.code)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all cursor-pointer",
                    selectedMethod === m.code
                      ? "border-primary bg-primary/10 ring-2 ring-primary"
                      : "hover:border-primary/50"
                  )}
                >
                  {m.icon}
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Reference field */}
            {needsReference && (
              <div>
                <Label className="text-xs">Reference / Transaction ID</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TXN-12345" className="mt-1" />
              </div>
            )}

            {/* Card last 4 */}
            {needsCard && (
              <div>
                <Label className="text-xs">Card Last 4 Digits</Label>
                <Input value={cardLast4} onChange={(e) => setCardLast4(e.target.value.slice(0, 4))} placeholder="1234" maxLength={4} className="mt-1" />
              </div>
            )}

            <DialogFooter>
              <Button variant="secondary" className="cursor-pointer" onClick={onClose}>Cancel</Button>
              <Button className="cursor-pointer" onClick={handleSingleConfirm}>
                Confirm {fmt(total)}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {splits.map((split, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg">
                <Select
                  value={split.method}
                  onValueChange={(v) => updateSplit(idx, "method", v)}
                >
                  <SelectTrigger className="w-32 h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POS_METHODS.map((m) => (
                      <SelectItem key={m.code} value={m.code} className="cursor-pointer text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={split.amount || ""}
                  onChange={(e) => updateSplit(idx, "amount", parseFloat(e.target.value) || 0)}
                  className="w-24 h-8 text-sm"
                  placeholder="Amount"
                />
                {splits.length > 1 && (
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 cursor-pointer text-destructive" onClick={() => removeSplit(idx)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between text-sm">
              <Button size="sm" variant="secondary" className="cursor-pointer" onClick={addSplit}>
                <Plus className="w-3 h-3 mr-1" /> Add Split
              </Button>
              <span className={cn("font-medium", Math.abs(splitRemaining) > 0.01 ? "text-destructive" : "text-green-600")}>
                {splitRemaining > 0.01 ? `Remaining: ${fmt(splitRemaining)}` : splitRemaining < -0.01 ? `Over: ${fmt(Math.abs(splitRemaining))}` : "Balanced"}
              </span>
            </div>

            <DialogFooter>
              <Button variant="secondary" className="cursor-pointer" onClick={onClose}>Cancel</Button>
              <Button className="cursor-pointer" onClick={handleSplitConfirm} disabled={Math.abs(splitRemaining) > 0.01}>
                Confirm Split Payment
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main POS Page ────────────────────────────────────────────────────────────

function POSPageInner() {
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const products = useQuery(api.products.listProducts, {});
  const customers = useQuery(api.sales.listCustomers);
  const ledgerAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  const createSale = useMutation(api.sales.createSale);
  const recordSplitPayment = useMutation(api.payments.recordSplitPayment);
  const earnLoyaltyPoints = useMutation(api.loyalty.earnPoints);
  const categories = useQuery(api.products.listCategories);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customerId, setCustomerId] = useState("none");
  const [walkInName, setWalkInName] = useState("");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSaleItems, setLastSaleItems] = useState<CartItem[]>([]);
  const [lastSaleTotal, setLastSaleTotal] = useState(0);
  const [lastPaymentMethod, setLastPaymentMethod] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Resolve prices based on selected customer
  const activeProductIds = (products ?? []).filter((p) => p.isActive).map((p) => p._id);
  const resolvedPrices = useQuery(
    api.pricing.resolvePricesBulk,
    activeProductIds.length > 0
      ? { productIds: activeProductIds, customerId: customerId !== "none" ? customerId as Id<"customers"> : undefined }
      : "skip"
  );

  // Helper: get the effective price for a product
  const getEffectivePrice = useCallback((product: { _id: Id<"products">; unitPrice: number }) => {
    if (resolvedPrices && resolvedPrices[product._id]) {
      return resolvedPrices[product._id].resolvedPrice;
    }
    return product.unitPrice;
  }, [resolvedPrices]);

  // Active products for the POS grid
  const activeProducts = (products ?? []).filter((p) => p.isActive);
  const filteredProducts = activeProducts.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = categoryFilter === "all" || p.categoryId === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Add to cart
  const addToCart = useCallback((product: (typeof activeProducts)[number]) => {
    const effectivePrice = getEffectivePrice(product);
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product._id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product._id
            ? { ...item, quantity: item.quantity + 1, unitPrice: effectivePrice }
            : item
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          unitPrice: effectivePrice,
          quantity: 1,
          unit: product.unit ?? "unit",
        },
      ];
    });
  }, [getEffectivePrice]);

  // Update cart prices when customer changes (resolved prices change)
  useEffect(() => {
    if (!resolvedPrices || !products) return;
    setCart((prev) =>
      prev.map((item) => {
        const product = products.find((p) => p._id === item.productId);
        if (!product) return item;
        const effectivePrice = getEffectivePrice(product);
        return { ...item, unitPrice: effectivePrice };
      })
    );
  }, [resolvedPrices, products, getEffectivePrice]);

  // Update quantity
  const updateQuantity = (productId: Id<"products">, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // Remove from cart
  const removeFromCart = (productId: Id<"products">) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    setCustomerId("none");
    setWalkInName("");
  };

  // Process sale — opens payment method modal
  const handleCheckout = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    // Default to the first available cash/bank account if none chosen yet.
    if (!depositAccountId && ledgerAccounts && ledgerAccounts.length > 0) {
      setDepositAccountId(ledgerAccounts[0]._id);
    }
    setShowPaymentModal(true);
  };

  // Called after payment method is selected
  const processPayment = async (payments: SplitEntry[]) => {
    setShowPaymentModal(false);
    setProcessing(true);
    try {
      const items = cart.map((item) => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
      const saleId = await createSale({
        customerId: customerId !== "none" ? customerId as Id<"customers"> : undefined,
        customerName: customerId === "none" && walkInName.trim() ? walkInName.trim() : undefined,
        date: new Date().toISOString().split("T")[0],
        accountId: depositAccountId as Id<"accounts">,
        items,
      });

      // Record payment(s) against the sale
      await recordSplitPayment({
        saleId: saleId as Id<"sales">,
        date: new Date().toISOString().split("T")[0],
        splits: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference || undefined,
          cardLast4: p.cardLast4 || undefined,
        })),
      });

      // Award loyalty points if customer is selected
      if (customerId !== "none") {
        try {
          const loyaltyResult = await earnLoyaltyPoints({
            customerId: customerId as Id<"customers">,
            saleAmount: cartTotal,
            saleId: saleId as string,
          });
          if (loyaltyResult) {
            toast.success(`+${loyaltyResult.earnedPoints} loyalty points earned!`);
          }
        } catch {
          // Non-critical: don't fail the sale if loyalty fails
        }
      }

      setLastSaleItems([...cart]);
      setLastSaleTotal(cartTotal);
      setLastPaymentMethod(payments.length === 1
        ? POS_METHODS.find((m) => m.code === payments[0].method)?.label ?? payments[0].method
        : "Split Payment"
      );
      setShowReceipt(true);
      clearCart();
      toast.success("Sale completed!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to process sale";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F2 focus search
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      // F9 checkout
      if (e.key === "F9") { e.preventDefault(); handleCheckout(); }
      // Escape clear search
      if (e.key === "Escape") { setSearch(""); searchRef.current?.blur(); }
      // F4 clear cart
      if (e.key === "F4") { e.preventDefault(); clearCart(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background overflow-hidden">
      {/* Left - Product Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <h1 className="font-bold text-lg">POS Terminal</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowShortcuts(true)}>
              <Keyboard className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products (F2)..."
              className="ps-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-auto p-4">
          {products === undefined ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">No products found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((product) => {
                const inCart = cart.find((i) => i.productId === product._id);
                return (
                  <button
                    key={product._id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "relative p-4 rounded-xl border bg-card text-left transition-all hover:shadow-md hover:border-primary/50 active:scale-95",
                      inCart && "ring-2 ring-primary border-primary"
                    )}
                  >
                    {inCart && (
                      <Badge className="absolute top-2 right-2 text-xs px-1.5">
                        {inCart.quantity}
                      </Badge>
                    )}
                    <p className="font-semibold text-sm truncate">{product.name}</p>
                    {product.sku && (
                      <p className="text-xs text-muted-foreground mt-0.5">{product.sku}</p>
                    )}
                    {(() => {
                      const effectivePrice = getEffectivePrice(product);
                      const hasDiscount = effectivePrice < product.unitPrice;
                      return (
                        <div className="mt-2">
                          {hasDiscount ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-primary font-bold">{fmt(effectivePrice)}</span>
                              <span className="text-xs text-muted-foreground line-through">{fmt(product.unitPrice)}</span>
                            </div>
                          ) : (
                            <p className="text-primary font-bold">{fmt(effectivePrice)}</p>
                          )}
                        </div>
                      );
                    })()}
                    {product.unit && (
                      <p className="text-xs text-muted-foreground">per {product.unit}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right - Cart */}
      <div className="w-full lg:w-80 xl:w-96 border-l bg-card flex flex-col overflow-hidden">
        {/* Cart header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Cart</span>
            {cartCount > 0 && (
              <Badge variant="secondary" className="text-xs">{cartCount}</Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearCart}>
              Clear (F4)
            </Button>
          )}
        </div>

        {/* Customer select */}
        <div className="px-4 py-3 border-b space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="w-3 h-3" /> Customer
          </div>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Walk-in" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Walk-in Customer</SelectItem>
              {customers?.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customerId === "none" && (
            <Input
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="Customer name (optional)"
              className="h-8 text-sm"
            />
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShoppingCart className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs">Click products to add them</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <Card key={item.productId} className="shadow-none">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} / {item.unit}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-muted-foreground hover:text-destructive p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-accent"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, 1)}
                          className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-accent"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="font-semibold text-sm">{fmt(item.quantity * item.unitPrice)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Cart footer - total and checkout */}
        <div className="border-t px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Subtotal ({cartCount} items)</span>
            <span className="text-xl font-bold text-primary">{fmt(cartTotal)}</span>
          </div>
          <Button
            className="w-full h-12 text-lg font-semibold"
            onClick={handleCheckout}
            disabled={cart.length === 0 || processing}
          >
            {processing ? "Processing..." : `Checkout ${fmt(cartTotal)}`}
            {!processing && <span className="ml-2 text-xs opacity-70">(F9)</span>}
          </Button>
        </div>
      </div>

      {/* Payment method selection modal */}
      {showPaymentModal && (
        <PaymentModal
          total={cartTotal}
          accounts={ledgerAccounts ?? []}
          accountId={depositAccountId}
          onAccountChange={setDepositAccountId}
          onConfirm={processPayment}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {/* Receipt modal */}
      {showReceipt && (
        <ReceiptModal
          items={lastSaleItems}
          total={lastSaleTotal}
          customerName={customerId !== "none"
            ? (customers?.find((c) => c._id === customerId)?.name ?? walkInName)
            : walkInName
          }
          paymentMethod={lastPaymentMethod}
          onClose={() => setShowReceipt(false)}
          onNewSale={() => { setShowReceipt(false); searchRef.current?.focus(); }}
        />
      )}

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <Dialog open onOpenChange={() => setShowShortcuts(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Keyboard className="w-4 h-4" /> Keyboard Shortcuts
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {[
                { key: "F2", action: "Focus search" },
                { key: "F4", action: "Clear cart" },
                { key: "F9", action: "Checkout" },
                { key: "Escape", action: "Clear search" },
              ].map(({ key, action }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{action}</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono font-bold">{key}</kbd>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowShortcuts(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function POSPage() {
  return (
    <>
      <Authenticated>
        <POSPageInner />
      </Authenticated>
      <Unauthenticated>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <ShoppingCart className="w-12 h-12 mx-auto text-primary" />
            <h1 className="text-xl font-bold">POS Terminal</h1>
            <p className="text-muted-foreground">Sign in to access the POS system</p>
            <SignInButton />
          </div>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      </AuthLoading>
    </>
  );
}
