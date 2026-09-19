import { useRef, useEffect, useState, useCallback } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Download, Printer, Copy, QrCode, Barcode, ScanLine } from "lucide-react";
import { toast } from "sonner";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

type BarcodeFormat = "CODE128" | "EAN13" | "UPC" | "CODE39" | "ITF14";

const FORMAT_OPTIONS: Array<{ value: BarcodeFormat; label: string; description: string }> = [
  { value: "CODE128", label: "Code 128", description: "Alphanumeric, flexible length" },
  { value: "EAN13", label: "EAN-13", description: "13 digits, retail standard" },
  { value: "CODE39", label: "Code 39", description: "Alphanumeric, industrial" },
  { value: "UPC", label: "UPC-A", description: "12 digits, US retail" },
  { value: "ITF14", label: "ITF-14", description: "14 digits, shipping" },
];

// ── Barcode Canvas ───────────────────────────────────────────────────────────

function BarcodeCanvas({
  value,
  format,
  width = 2,
  height = 80,
}: {
  value: string;
  format: BarcodeFormat;
  width?: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format,
        width,
        height,
        displayValue: true,
        fontSize: 14,
        margin: 10,
        background: "#ffffff",
        lineColor: "#000000",
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid barcode value for this format");
    }
  }, [value, format, width, height]);

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different format or value</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-white rounded-lg p-4 border">
      <svg ref={svgRef} />
    </div>
  );
}

// ── QR Code Canvas ───────────────────────────────────────────────────────────

function QRCodeCanvas({
  value,
  size = 200,
}: {
  value: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message));
  }, [value, size]);

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center bg-white rounded-lg p-4 border">
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── Helper: get product URL ──────────────────────────────────────────────────

function getProductUrl(productId: string): string {
  const base = window.location.origin;
  return `${base}/shop/product/${productId}`;
}

// ── Single product barcode/QR modal ─────────────────────────────────────────

export function BarcodeModal({
  product,
  onClose,
}: {
  product: Doc<"products">;
  onClose: () => void;
}) {
  const defaultValue = product.sku || `PRD-${product._id.slice(-8).toUpperCase()}`;
  const [barcodeValue, setBarcodeValue] = useState(defaultValue);
  const [format, setFormat] = useState<BarcodeFormat>("CODE128");
  const [labelCount, setLabelCount] = useState("1");
  const [codeTab, setCodeTab] = useState<"barcode" | "qr">("barcode");
  const printRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const productUrl = getProductUrl(product._id);

  const handleDownloadBarcode = () => {
    const svg = printRef.current?.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const link = document.createElement("a");
      link.download = `barcode-${product.name.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Barcode downloaded!");
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  const handleDownloadQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `qr-${product.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("QR code downloaded!");
  };

  const handlePrint = () => {
    const count = Math.max(1, Math.min(50, parseInt(labelCount) || 1));
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow pop-ups to print"); return; }

    if (codeTab === "barcode") {
      const svg = printRef.current?.querySelector("svg");
      if (!svg) return;
      const svgData = new XMLSerializer().serializeToString(svg);
      const labels = Array.from({ length: count })
        .map(() => `<div style="display:inline-block;margin:8px;padding:8px;border:1px dashed #ccc;">${svgData}<p style="text-align:center;font-size:11px;margin:4px 0 0;">${product.name}</p></div>`)
        .join("");

      printWindow.document.write(`
        <html><head><title>Barcode Labels - ${product.name}</title></head>
        <body style="font-family:sans-serif;padding:16px;">
          <div style="display:flex;flex-wrap:wrap;">${labels}</div>
          <script>window.onload=()=>{window.print();window.close();}</script>
        </body></html>
      `);
    } else {
      const labels = Array.from({ length: count })
        .map((_, i) => `<div style="display:inline-block;margin:8px;padding:12px;border:1px dashed #ccc;text-align:center;"><canvas id="qr-${i}"></canvas><p style="font-size:11px;margin:4px 0 0;font-weight:600;">${product.name}</p><p style="font-size:9px;color:#666;">Scan for details</p></div>`)
        .join("");

      const qrScripts = Array.from({ length: count })
        .map((_, i) => `QRCode.toCanvas(document.getElementById("qr-${i}"), "${productUrl}", { width: 150, margin: 1 });`)
        .join("\n");

      printWindow.document.write(`
        <html><head><title>QR Labels - ${product.name}</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
        </head>
        <body style="font-family:sans-serif;padding:16px;">
          <div style="display:flex;flex-wrap:wrap;">${labels}</div>
          <script>window.onload=()=>{ ${qrScripts} setTimeout(()=>{window.print();window.close();},500); };</script>
        </body></html>
      `);
    }
    printWindow.document.close();
  };

  const handleCopy = async () => {
    const value = codeTab === "barcode" ? barcodeValue : productUrl;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(codeTab === "barcode" ? "Barcode value copied!" : "Product URL copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-4 h-4" /> Codes — {product.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Tabs value={codeTab} onValueChange={(v) => setCodeTab(v as "barcode" | "qr")}>
            <TabsList className="w-full">
              <TabsTrigger value="barcode" className="flex-1 flex items-center gap-2">
                <Barcode className="w-4 h-4" />Barcode
              </TabsTrigger>
              <TabsTrigger value="qr" className="flex-1 flex items-center gap-2">
                <QrCode className="w-4 h-4" />QR Code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="barcode" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Barcode Value</Label>
                  <div className="flex gap-1">
                    <Input
                      value={barcodeValue}
                      onChange={(e) => setBarcodeValue(e.target.value)}
                      placeholder="Enter value"
                    />
                    <Button size="sm" variant="secondary" onClick={handleCopy} className="cursor-pointer">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as BarcodeFormat)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {FORMAT_OPTIONS.find((f) => f.value === format)?.description}
              </p>
              <div ref={printRef}>
                <BarcodeCanvas value={barcodeValue} format={format} />
              </div>
            </TabsContent>

            <TabsContent value="qr" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>QR Code links to product page</Label>
                <div className="flex gap-1">
                  <Input value={productUrl} readOnly className="text-xs font-mono" />
                  <Button size="sm" variant="secondary" onClick={handleCopy} className="cursor-pointer">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Customers scan this QR code to view the product in your storefront
                </p>
              </div>
              <div ref={qrRef}>
                <QRCodeCanvas value={productUrl} size={200} />
              </div>
            </TabsContent>
          </Tabs>

          {/* Print options */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Labels to print</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={labelCount}
                onChange={(e) => setLabelCount(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={codeTab === "barcode" ? handleDownloadBarcode : handleDownloadQR} className="cursor-pointer">
            <Download className="w-4 h-4 mr-1" /> Download PNG
          </Button>
          <Button onClick={handlePrint} className="cursor-pointer">
            <Printer className="w-4 h-4 mr-1" /> Print Labels
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Batch barcode/QR modal ──────────────────────────────────────────────────

export function BatchBarcodeModal({
  products,
  onClose,
}: {
  products: Array<Doc<"products">>;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<BarcodeFormat>("CODE128");
  const [codeType, setCodeType] = useState<"barcode" | "qr">("barcode");

  const handlePrintAll = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow pop-ups to print"); return; }

    if (codeType === "barcode") {
      const labels = products.map((product) => {
        const val = product.sku || `PRD-${product._id.slice(-8).toUpperCase()}`;
        return `
          <div style="display:inline-block;margin:8px;padding:12px;border:1px dashed #ccc;text-align:center;">
            <svg id="barcode-${product._id}"></svg>
            <p style="font-size:11px;margin:4px 0 0;font-weight:600;">${product.name}</p>
            <p style="font-size:10px;color:#666;">${val}</p>
          </div>
        `;
      }).join("");

      const barcodeScripts = products.map((product) => {
        const val = product.sku || `PRD-${product._id.slice(-8).toUpperCase()}`;
        return `JsBarcode("#barcode-${product._id}", "${val}", { format: "${format}", width: 1.5, height: 60, displayValue: false, margin: 5 });`;
      }).join("\n");

      printWindow.document.write(`
        <html><head><title>Batch Barcodes</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>
        </head>
        <body style="font-family:sans-serif;padding:16px;">
          <h3 style="margin-bottom:16px;">Batch Barcodes (${products.length} products)</h3>
          <div style="display:flex;flex-wrap:wrap;">${labels}</div>
          <script>
            window.onload = () => {
              try { ${barcodeScripts} } catch(e) { console.error(e); }
              setTimeout(() => { window.print(); window.close(); }, 500);
            };
          </script>
        </body></html>
      `);
    } else {
      const labels = products.map((product) => `
        <div style="display:inline-block;margin:8px;padding:12px;border:1px dashed #ccc;text-align:center;">
          <canvas id="qr-${product._id}"></canvas>
          <p style="font-size:11px;margin:4px 0 0;font-weight:600;">${product.name}</p>
          <p style="font-size:9px;color:#666;">Scan for details</p>
        </div>
      `).join("");

      const qrScripts = products.map((product) => {
        const url = getProductUrl(product._id);
        return `QRCode.toCanvas(document.getElementById("qr-${product._id}"), "${url}", { width: 150, margin: 1 });`;
      }).join("\n");

      printWindow.document.write(`
        <html><head><title>Batch QR Codes</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
        </head>
        <body style="font-family:sans-serif;padding:16px;">
          <h3 style="margin-bottom:16px;">Batch QR Codes (${products.length} products)</h3>
          <div style="display:flex;flex-wrap:wrap;">${labels}</div>
          <script>
            window.onload = () => {
              try { ${qrScripts} } catch(e) { console.error(e); }
              setTimeout(() => { window.print(); window.close(); }, 500);
            };
          </script>
        </body></html>
      `);
    }
    printWindow.document.close();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" /> Batch Print Labels
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Generate and print labels for <strong>{products.length} products</strong>.
          </p>

          <div className="space-y-2">
            <Label>Code Type</Label>
            <Select value={codeType} onValueChange={(v) => setCodeType(v as "barcode" | "qr")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="barcode">Barcode</SelectItem>
                <SelectItem value="qr">QR Code (links to product page)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {codeType === "barcode" && (
            <div className="space-y-2">
              <Label>Barcode Format</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as BarcodeFormat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} — {opt.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-lg bg-muted p-3 space-y-1 max-h-40 overflow-y-auto">
            {products.map((p) => (
              <div key={p._id} className="flex justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="text-muted-foreground font-mono text-xs flex-shrink-0 ml-2">
                  {codeType === "barcode"
                    ? (p.sku || `PRD-${p._id.slice(-8).toUpperCase()}`)
                    : "QR"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrintAll} className="cursor-pointer">
            <Printer className="w-4 h-4 mr-1" /> Print All ({products.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Scan-to-Search Modal ────────────────────────────────────────────────────

export function ScannerModal({
  onResult,
  onClose,
}: {
  onResult: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const animationRef = useRef<number>(0);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
        setError(null);
        scanFrame();
      }
    } catch {
      setError("Camera access denied. Use manual entry below.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setScanning(false);
  }, []);

  const scanFrame = () => {
    // BarcodeDetector API check
    if (!("BarcodeDetector" in window)) {
      setError("Barcode scanning not supported in this browser. Use manual entry below.");
      return;
    }

    const detector = new (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({
      formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"],
    });

    const loop = async () => {
      if (!videoRef.current || !streamRef.current) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue;
          stopCamera();
          onResult(value);
          return;
        }
      } catch {
        // Detection error, continue scanning
      }
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualValue.trim()) {
      stopCamera();
      onResult(manualValue.trim());
    }
  };

  return (
    <Dialog open onOpenChange={() => { stopCamera(); onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-4 h-4" /> Scan Barcode / QR Code
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Camera viewport */}
          <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-primary rounded-lg opacity-60 animate-pulse" />
              </div>
            )}
            {!scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white text-sm">Starting camera...</p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
            </div>
          )}

          {/* Manual entry */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <Label className="text-xs">Or enter code manually</Label>
            <div className="flex gap-2">
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="SKU, barcode, or product URL..."
              />
              <Button type="submit" size="sm" disabled={!manualValue.trim()} className="cursor-pointer">
                Search
              </Button>
            </div>
          </form>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { stopCamera(); onClose(); }}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
