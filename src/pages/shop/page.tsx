import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { ShoppingBag, Search, Filter, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "./_components/cart-context.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function ShopPage() {
  const products = useQuery(api.storefront.listStorefrontProducts);
  const categories = useQuery(api.storefront.listStorefrontCategories);
  const { addItem, totalItems } = useCart();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filtered = products?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  }) ?? [];

  const handleAddToCart = (product: NonNullable<typeof products>[number]) => {
    if (!product.inStock) {
      toast.error("Out of stock");
      return;
    }
    addItem({
      productId: product._id as Id<"products">,
      name: product.name,
      unitPrice: product.unitPrice,
      imageUrl: product.imageUrl,
    });
    toast.success(`${product.name} added to cart`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/shop")}>
            <ShoppingBag className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Store</h1>
          </div>
          <Button
            variant="secondary"
            className="relative cursor-pointer"
            onClick={() => navigate("/shop/cart")}
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            Cart
            {totalItems > 0 && (
              <Badge className="absolute -top-2 -right-2 w-5 h-5 rounded-full p-0 flex items-center justify-center text-xs">
                {totalItems}
              </Badge>
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-10"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "secondary"}
              onClick={() => setSelectedCategory("all")}
              className="cursor-pointer flex-shrink-0"
            >
              <Filter className="w-3 h-3 mr-1" />All
            </Button>
            {categories?.map((cat) => (
              <Button
                key={cat._id}
                size="sm"
                variant={selectedCategory === cat._id ? "default" : "secondary"}
                onClick={() => setSelectedCategory(cat._id)}
                className="cursor-pointer flex-shrink-0"
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        {products === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Package /></EmptyMedia>
              <EmptyTitle>No products found</EmptyTitle>
              <EmptyDescription>
                {search ? "Try a different search term" : "Check back later for new products"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <Card
                key={product._id}
                className="group overflow-hidden cursor-pointer hover:shadow-lg transition-shadow pt-0"
              >
                {/* Product image */}
                <div
                  className="w-full h-48 bg-muted overflow-hidden"
                  onClick={() => navigate(`/shop/product/${product._id}`)}
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Package className="w-12 h-12 opacity-30" />
                    </div>
                  )}
                </div>

                <CardContent className="p-4 space-y-2">
                  <div onClick={() => navigate(`/shop/product/${product._id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
                      <p className="font-bold text-primary text-sm flex-shrink-0">${product.unitPrice.toFixed(2)}</p>
                    </div>
                    {product.category && (
                      <Badge variant="secondary" className="text-[10px] mt-1">{product.category.name}</Badge>
                    )}
                    {product.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className={cn(
                      "text-xs font-medium",
                      product.inStock ? "text-green-600 dark:text-green-400" : "text-red-500"
                    )}>
                      {product.inStock ? `${product.totalStock} in stock` : "Out of stock"}
                    </span>
                    <Button
                      size="sm"
                      disabled={!product.inStock}
                      onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}
                      className="cursor-pointer"
                    >
                      Add to Cart
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
