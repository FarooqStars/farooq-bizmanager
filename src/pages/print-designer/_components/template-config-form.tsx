import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import type { TemplateConfig } from "./types.ts";

type Props = {
  config: TemplateConfig;
  onChange: (config: TemplateConfig) => void;
};

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border cursor-pointer"
        />
        <Input className="h-8 text-xs flex-1" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export default function TemplateConfigForm({ config, onChange }: Props) {
  const generateUploadUrl = useMutation(api.printTemplates.generateUploadUrl);
  const customLogoUrl = useQuery(
    api.printTemplates.getLogoUrl,
    config.customLogoStorageId ? { storageId: config.customLogoStorageId } : "skip"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const update = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: string };
      update("customLogoStorageId", storageId);
      toast.success("Logo uploaded");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Logo & Branding */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Logo & Branding</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Logo Source</Label>
            <Select
              value={config.logoSource ?? "company_profile"}
              onValueChange={(v) => update("logoSource", v as NonNullable<TemplateConfig["logoSource"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company_profile">Company Profile</SelectItem>
                <SelectItem value="custom">Custom Upload</SelectItem>
                <SelectItem value="none">No Logo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Logo Size</Label>
            <Select
              value={config.logoSize ?? "medium"}
              onValueChange={(v) => update("logoSize", v as NonNullable<TemplateConfig["logoSize"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {config.logoSource === "custom" && (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded border bg-muted/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                {customLogoUrl ? (
                  <img src={customLogoUrl} alt="Logo preview" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="cursor-pointer"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Spinner className="w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {config.customLogoStorageId ? "Replace Logo" : "Upload Logo"}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Logo Position</Label>
            <Select value={config.logoPosition} onValueChange={(v) => update("logoPosition", v as TemplateConfig["logoPosition"])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Header Layout</Label>
            <Select value={config.headerLayout} onValueChange={(v) => update("headerLayout", v as TemplateConfig["headerLayout"])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="full_width">Full Width</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showCompanyNameAr} onCheckedChange={(v) => update("showCompanyNameAr", !!v)} />
            <span className="text-xs">Show Arabic Name</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showCompanyNameUr} onCheckedChange={(v) => update("showCompanyNameUr", !!v)} />
            <span className="text-xs">Show Urdu Name</span>
          </label>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Header Text</Label>
          <Input
            className="h-8 text-xs"
            value={config.headerText ?? ""}
            onChange={(e) => update("headerText", e.target.value || undefined)}
            placeholder="Optional header text..."
          />
        </div>
      </section>

      {/* Typography */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Typography</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Font Family</Label>
            <Select
              value={config.fontFamily ?? "system"}
              onValueChange={(v) => update("fontFamily", v as NonNullable<TemplateConfig["fontFamily"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System (Sans)</SelectItem>
                <SelectItem value="serif">Serif</SelectItem>
                <SelectItem value="mono">Monospace</SelectItem>
                <SelectItem value="arabic">Arabic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Header Font Size</Label>
            <Select
              value={config.headerFontSize ?? "larger"}
              onValueChange={(v) => update("headerFontSize", v as NonNullable<TemplateConfig["headerFontSize"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="same">Same</SelectItem>
                <SelectItem value="larger">Larger</SelectItem>
                <SelectItem value="extra_large">Extra Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ColorPicker label="Primary Color" value={config.primaryColor} onChange={(v) => update("primaryColor", v)} />
          <ColorPicker
            label="Secondary Color"
            value={config.secondaryColor ?? "#64748b"}
            onChange={(v) => update("secondaryColor", v)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Body Font Size</Label>
          <Select value={config.fontSize} onValueChange={(v) => update("fontSize", v as TemplateConfig["fontSize"])}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Layout & Spacing */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Layout & Spacing</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Table Header Style</Label>
            <Select
              value={config.tableHeaderStyle ?? "filled"}
              onValueChange={(v) => update("tableHeaderStyle", v as NonNullable<TemplateConfig["tableHeaderStyle"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="filled">Filled</SelectItem>
                <SelectItem value="underline">Underline</SelectItem>
                <SelectItem value="plain">Plain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Page Margins</Label>
            <Select
              value={config.margins ?? "normal"}
              onValueChange={(v) => update("margins", v as NonNullable<TemplateConfig["margins"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Row Height</Label>
            <Select
              value={config.itemRowHeight ?? "normal"}
              onValueChange={(v) => update("itemRowHeight", v as NonNullable<TemplateConfig["itemRowHeight"]>)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="spacious">Spacious</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Page Size</Label>
            <Select value={config.pageSize} onValueChange={(v) => update("pageSize", v as TemplateConfig["pageSize"])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="a5">A5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Orientation</Label>
            <Select value={config.orientation} onValueChange={(v) => update("orientation", v as TemplateConfig["orientation"])}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={config.showBorders} onCheckedChange={(v) => update("showBorders", !!v)} />
          <span className="text-xs">Show Table Borders</span>
        </label>
      </section>

      {/* Column Visibility */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Column Visibility</h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["showItemNumber", "Item #"],
            ["showItemDescription", "Description"],
            ["showQuantity", "Quantity"],
            ["showUnitPrice", "Unit Price"],
            ["showDiscount", "Discount"],
            ["showTax", "Tax"],
            ["showTotal", "Total"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={config[key]} onCheckedChange={(v) => update(key, !!v)} />
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Document Numbering */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Document Numbering</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={config.showDocPrefix ?? false} onCheckedChange={(v) => update("showDocPrefix", !!v)} />
          <span className="text-xs">Show Document Number Prefix</span>
        </label>
        {config.showDocPrefix && (
          <div className="space-y-1.5">
            <Label className="text-xs">Prefix</Label>
            <Input
              className="h-8 text-xs"
              value={config.docPrefix ?? ""}
              onChange={(e) => update("docPrefix", e.target.value || undefined)}
              placeholder="e.g. INV-, QT-, PO-"
            />
          </div>
        )}
      </section>

      {/* Additional Sections */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Additional Sections</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showCustomerTaxId ?? false} onCheckedChange={(v) => update("showCustomerTaxId", !!v)} />
            <span className="text-xs">Customer Tax ID</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showDeliveryAddress ?? false} onCheckedChange={(v) => update("showDeliveryAddress", !!v)} />
            <span className="text-xs">Delivery Address</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showStampArea ?? false} onCheckedChange={(v) => update("showStampArea", !!v)} />
            <span className="text-xs">Company Stamp</span>
          </label>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showWatermark ?? false} onCheckedChange={(v) => update("showWatermark", !!v)} />
            <span className="text-xs">Show Watermark</span>
          </label>
          {config.showWatermark && (
            <Input
              className="h-8 text-xs"
              value={config.watermarkText ?? ""}
              onChange={(e) => update("watermarkText", e.target.value || undefined)}
              placeholder="e.g. PAID, DRAFT, COPY"
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={config.showNotesSection ?? false} onCheckedChange={(v) => update("showNotesSection", !!v)} />
            <span className="text-xs">Show Notes / Memo Section</span>
          </label>
          {config.showNotesSection && (
            <Input
              className="h-8 text-xs"
              value={config.notesLabel ?? ""}
              onChange={(e) => update("notesLabel", e.target.value || undefined)}
              placeholder="Notes label (default: Notes)"
            />
          )}
        </div>
      </section>

      {/* Footer Settings */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b pb-2">Footer Settings</h3>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["showPaymentTerms", "Payment Terms"],
            ["showBankDetails", "Bank Details"],
            ["showSignatureLine", "Signature Line"],
            ["showQrCode", "QR Code"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={config[key]} onCheckedChange={(v) => update(key, !!v)} />
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Footer Alignment</Label>
          <Select
            value={config.footerAlignment ?? "left"}
            onValueChange={(v) => update("footerAlignment", v as NonNullable<TemplateConfig["footerAlignment"]>)}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Footer Text</Label>
          <Input
            className="h-8 text-xs"
            value={config.footerText ?? ""}
            onChange={(e) => update("footerText", e.target.value || undefined)}
            placeholder="Optional footer text..."
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Terms & Conditions</Label>
          <Textarea
            className="text-xs min-h-[60px]"
            value={config.termsText ?? ""}
            onChange={(e) => update("termsText", e.target.value || undefined)}
            placeholder="Optional terms text..."
          />
        </div>
      </section>
    </div>
  );
}
