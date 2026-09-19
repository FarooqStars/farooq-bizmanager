import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ShoppingBag, ArrowLeft, Plus, Minus, RotateCcw, Move, Package,
} from "lucide-react";
import { useCart } from "./_components/cart-context.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useRef } from "react";

// ── 360 Viewer ───────────────────────────────────────────────────────────────

function ProductViewer360({
  images,
  productName,
}: {
  images: Array<{ storageId: string; url: string | null }>;
  productName: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastXRef = useRef(0);

  const validImages = images.filter((img) => img.url !== null);
  if (validImages.length === 0) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    lastXRef.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastXRef.current;
    const threshold = 30;
    if (Math.abs(dx) > threshold) {
      const steps = Math.floor(Math.abs(dx) / threshold);
      const direction = dx > 0 ? 1 : -1;
      setCurrentIndex((prev) => {
        let next = prev + direction * steps;
        while (next < 0) next += validImages.length;
        return next % validImages.length;
      });
      lastXRef.current = e.clientX;
    }
  };

  const handlePointerUp = () => setIsDragging(false);

  return (
    <div className="relative">
      <div
        className={cn(
          "relative w-full aspect-square bg-muted rounded-xl overflow-hidden select-none",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={validImages[currentIndex]?.url ?? ""}
          alt={`${productName} - view ${currentIndex + 1}`}
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
        <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
          <RotateCcw className="w-3 h-3" />360°
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 opacity-70">
          <Move className="w-3 h-3" />Drag to rotate
        </div>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {validImages.map((img, i) => (
          <button
            key={img.storageId}
            className={cn(
              "w-14 h-14 rounded-md overflow-hidden border-2 flex-shrink-0 cursor-pointer transition-colors",
              i === currentIndex ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
            )}
            onClick={() => setCurrentIndex(i)}
          >
            <img src={img.url!} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Product Detail Page ──────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = useQuery(
    api.storefront.getStorefrontProduct,
    id ? { productId: id as Id<"products"> } : "skip"
  );
  const { addItem, totalItems } = useCart();
  const [quantity, setQuantity] = useState(1);

  if (product === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <Skeleton className="h-8 w-48" />
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (product === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Package className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Product not found</h2>
          <Button onClick={() => navigate("/shop")} className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Store
          </Button>
        </div>
      </div>
    );
  }

  const validImages = product.imageUrls.filter((img) => img.url !== null);
  const hasMultipleImages = validImages.length >= 3;

  const handleAddToCart = () => {
    if (!product.inStock) return;
    for (let i = 0; i < quantity; i++) {
      addItem({
        productId: product._id as Id<"products">,
        name: product.name,
        unitPrice: product.unitPrice,
        imageUrl: validImages[0]?.url ?? null,
      });
    }
    toast.success(`${quantity}x ${product.name} added to cart`);
    setQuantity(1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/shop")} className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />Store
          </Button>
          <Button
            variant="secondary"
            className="relative cursor-pointer"
            onClick={() => navigate("/shop/cart")}
          >
            <ShoppingBag className="w-4 h-4 mr-2" />Cart
            {totalItems > 0 && (
              <Badge className="absolute -top-2 -right-2 w-5 h-5 rounded-full p-0 flex items-center justify-center text-xs">
                {totalItems}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Image section */}
          <div>
            {hasMultipleImages ? (
              <ProductViewer360 images={validImages} productName={product.name} />
            ) : validImages.length > 0 ? (
              <div className="w-full aspect-square bg-muted rounded-xl overflow-hidden">
                <img
                  src={validImages[0].url!}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center">
                <Package className="w-20 h-20 text-muted-foreground/30" />
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold">{product.name}</h1>
              {product.category && (
                <Badge variant="secondary" className="mt-2">{product.category.name}</Badge>
              )}
            </div>

            <p className="text-3xl font-bold text-primary">${product.unitPrice.toFixed(2)}</p>

            {product.description && (
              <p className="text-muted-foreground leading-relaxed">{product.description}</p>
            )}

            <div className="flex items-center gap-2">
              <span className={cn(
                "text-sm font-medium",
                product.inStock ? "text-green-600 dark:text-green-400" : "text-red-500"
              )}>
                {product.inStock ? `${product.totalStock} in stock` : "Out of stock"}
              </span>
              {product.sku && (
                <span className="text-xs text-muted-foreground">| SKU: {product.sku}</span>
              )}
            </div>

            {/* Quantity selector */}
            {product.inStock && (
              <div className="flex items-center gap-3 pt-2">
                <span className="text-sm font-medium">Quantity:</span>
                <div className="flex items-center gap-1 border rounded-lg">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-10 text-center font-medium">{quantity}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuantity((q) => Math.min(product.totalStock, q + 1))}
                    className="cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Add to cart */}
            <Button
              size="lg"
              className="w-full cursor-pointer"
              disabled={!product.inStock}
              onClick={handleAddToCart}
            >
              <ShoppingBag className="w-5 h-5 mr-2" />
              {product.inStock ? `Add to Cart — $${(product.unitPrice * quantity).toFixed(2)}` : "Out of Stock"}
            </Button>

            {product.unit && (
              <p className="text-xs text-muted-foreground">Sold per {product.unit}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
