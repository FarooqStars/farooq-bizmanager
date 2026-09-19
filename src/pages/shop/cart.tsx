import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  ShoppingBag, ArrowLeft, Trash2, Plus, Minus, ShoppingCart,
} from "lucide-react";
import { useCart } from "./_components/cart-context.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

export default function CartPage() {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, totalAmount, totalItems } = useCart();

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate("/shop")} className="cursor-pointer">
              <ArrowLeft className="w-4 h-4 mr-2" />Store
            </Button>
            <h1 className="text-lg font-bold">Cart</h1>
            <div className="w-20" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
              <EmptyTitle>Your cart is empty</EmptyTitle>
              <EmptyDescription>Browse the store and add some products</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={() => navigate("/shop")} className="cursor-pointer">
                Continue Shopping
              </Button>
            </EmptyContent>
          </Empty>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/shop")} className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />Store
          </Button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Cart
            <Badge variant="secondary">{totalItems}</Badge>
          </h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Cart Items */}
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.productId} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {/* Item image */}
                  <div className="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ShoppingBag className="w-6 h-6 opacity-30" />
                      </div>
                    )}
                  </div>

                  {/* Item details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                    <p className="text-primary font-bold mt-1">${item.unitPrice.toFixed(2)}</p>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 border rounded-lg">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 cursor-pointer"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 cursor-pointer"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">
                          ${(item.unitPrice * item.quantity).toFixed(2)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-7 w-7 p-0 cursor-pointer"
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Order Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span className="text-green-600">Free</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary">${totalAmount.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Checkout */}
        <Button
          size="lg"
          className={cn("w-full cursor-pointer")}
          onClick={() => navigate("/shop/checkout")}
        >
          Proceed to Checkout — ${totalAmount.toFixed(2)}
        </Button>
      </main>
    </div>
  );
}
