import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ImagePlus, Trash2, RotateCcw, ZoomIn, ZoomOut, X, Move,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";

// ── Image Upload Button ──────────────────────────────────────────────────────

function ImageUploadButton({ productId }: { productId: Id<"products"> }) {
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const addImage = useMutation(api.products.addProductImage);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 10MB limit`);
          continue;
        }

        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();
        await addImage({ productId, storageId });
      }
      toast.success(`${files.length} image${files.length > 1 ? "s" : ""} uploaded`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="cursor-pointer"
      >
        <ImagePlus className="w-4 h-4 mr-1" />
        {uploading ? "Uploading..." : "Add Photos"}
      </Button>
    </>
  );
}

// ── 360 Viewer ───────────────────────────────────────────────────────────────

function Viewer360({
  images,
  productName,
}: {
  images: Array<{ storageId: string; url: string | null }>;
  productName: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
    const threshold = 30; // pixels to advance one frame
    if (Math.abs(dx) > threshold) {
      const steps = Math.floor(Math.abs(dx) / threshold);
      const direction = dx > 0 ? 1 : -1;
      setCurrentIndex((prev) => {
        let next = prev + direction * steps;
        // Wrap around
        while (next < 0) next += validImages.length;
        return next % validImages.length;
      });
      lastXRef.current = e.clientX;
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          "relative w-full aspect-square bg-muted rounded-lg overflow-hidden select-none",
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

        {/* 360 badge */}
        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
          <RotateCcw className="w-3 h-3" />
          360°
        </div>

        {/* Drag hint */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 opacity-70">
          <Move className="w-3 h-3" />
          Drag to rotate
        </div>
      </div>

      {/* Frame indicator */}
      <div className="flex justify-center mt-2">
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {validImages.length} frames
        </span>
      </div>
    </div>
  );
}

// ── Lightbox (Zoom View) ────────────────────────────────────────────────────

function ImageLightbox({
  url,
  productName,
  onClose,
}: {
  url: string;
  productName: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 4));
  const handleZoomOut = () => { setZoom((z) => Math.max(z - 0.5, 1)); setPosition({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setDragging(true);
    lastPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - lastPos.current.x, y: e.clientY - lastPos.current.y });
  };
  const handleMouseUp = () => setDragging(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
        <div className="relative w-full h-[80vh] flex items-center justify-center overflow-hidden">
          <div
            className={cn("cursor-move")}
            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={url}
              alt={productName}
              className="max-w-full max-h-[80vh] object-contain select-none"
              draggable={false}
            />
          </div>

          {/* Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/70 rounded-full px-3 py-1.5">
            <button className="text-white hover:text-primary p-1 cursor-pointer" onClick={handleZoomOut}>
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-white text-sm flex items-center px-2">{Math.round(zoom * 100)}%</span>
            <button className="text-white hover:text-primary p-1 cursor-pointer" onClick={handleZoomIn}>
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          <button
            className="absolute top-3 right-3 text-white hover:text-primary p-2 bg-black/50 rounded-full cursor-pointer"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Product Image Gallery ────────────────────────────────────────────────────

export function ProductImageGallery({
  productId,
  productName,
  canManage,
}: {
  productId: Id<"products">;
  productName: string;
  canManage: boolean;
}) {
  const images = useQuery(api.products.getProductImages, { productId });
  const removeImage = useMutation(api.products.removeProductImage);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const validImages = images?.filter((img) => img.url !== null) ?? [];
  const hasMultiple = validImages.length >= 3;

  const handleDelete = useCallback(async (storageId: string) => {
    setDeletingId(storageId);
    try {
      await removeImage({ productId, storageId: storageId as Id<"_storage"> });
      toast.success("Image removed");
    } catch {
      toast.error("Failed to remove image");
    } finally {
      setDeletingId(null);
    }
  }, [productId, removeImage]);

  if (images === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="w-full aspect-square rounded-lg" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-16 h-16 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 360 Viewer (if 3+ images) */}
      {hasMultiple && (
        <Viewer360 images={validImages} productName={productName} />
      )}

      {/* Single image display if only 1-2 images */}
      {!hasMultiple && validImages.length > 0 && (
        <div
          className="w-full aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer"
          onClick={() => setSelectedUrl(validImages[0].url)}
        >
          <img
            src={validImages[0].url!}
            alt={productName}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* Thumbnail strip */}
      {validImages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {validImages.map((img) => (
            <div key={img.storageId} className="relative group flex-shrink-0">
              <button
                className="w-16 h-16 rounded-md overflow-hidden border hover:border-primary transition-colors cursor-pointer"
                onClick={() => setSelectedUrl(img.url)}
              >
                <img
                  src={img.url!}
                  alt={productName}
                  className="w-full h-full object-cover"
                />
              </button>
              {canManage && (
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => handleDelete(img.storageId)}
                  disabled={deletingId === img.storageId}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {canManage && <ImageUploadButton productId={productId} />}

      {/* Empty state */}
      {validImages.length === 0 && !canManage && (
        <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center">
          <p className="text-sm text-muted-foreground">No product images</p>
        </div>
      )}

      {/* Lightbox */}
      {selectedUrl && (
        <ImageLightbox
          url={selectedUrl}
          productName={productName}
          onClose={() => setSelectedUrl(null)}
        />
      )}
    </div>
  );
}

// ── Product Detail Dialog (with images) ──────────────────────────────────────

export function ProductDetailDialog({
  productId,
  productName,
  canManage,
  onClose,
}: {
  productId: Id<"products">;
  productName: string;
  canManage: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="w-4 h-4" />
            {productName} — Photos
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <ProductImageGallery
            productId={productId}
            productName={productName}
            canManage={canManage}
          />
          {canManage && (
            <p className="text-xs text-muted-foreground mt-3">
              Upload 3 or more images to enable the 360° rotation viewer. Drag left/right to rotate.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
