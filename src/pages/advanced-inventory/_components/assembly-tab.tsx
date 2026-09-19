import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { toast } from "sonner";
import { Plus, Package, Layers, AlertTriangle, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function AssemblyTab() {
  const assemblies = useQuery(api.assembly.listAssemblies, {});
  const products = useQuery(api.products.listProducts, { type: "product" });
  const [showCreate, setShowCreate] = useState(false);

  if (!assemblies || !products) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (assemblies.length === 0) {
    return (
      <div>
        <div className="flex justify-end mb-4">
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Create Assembly</Button>
            </DialogTrigger>
            <CreateAssemblyDialog products={products} onClose={() => setShowCreate(false)} />
          </Dialog>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Layers /></EmptyMedia>
            <EmptyTitle>No assemblies yet</EmptyTitle>
            <EmptyDescription>Create a Bill of Materials (BOM) to define how components combine into finished products</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Assembly</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer"><Plus className="w-4 h-4 mr-2" /> Create Assembly</Button>
          </DialogTrigger>
          <CreateAssemblyDialog products={products} onClose={() => setShowCreate(false)} />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assemblies.map((assembly) => (
          <AssemblyCard key={assembly._id} assembly={assembly} />
        ))}
      </div>
    </div>
  );
}

type AssemblyItem = {
  _id: Id<"assemblies">;
  name: string;
  sku?: string;
  description?: string;
  outputProductName: string;
  outputProductSku?: string;
  outputQuantity: number;
  laborCost?: number;
  overheadCost?: number;
  isActive: boolean;
  componentCount: number;
  components: Array<{
    _id: Id<"assemblyComponents">;
    productName: string;
    productSku?: string;
    quantityRequired: number;
    isOptional: boolean;
  }>;
};

function AssemblyCard({ assembly }: { assembly: AssemblyItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setExpanded(!expanded)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium truncate">{assembly.name}</CardTitle>
            {assembly.sku && <p className="text-xs text-muted-foreground">{assembly.sku}</p>}
          </div>
          <Badge variant={assembly.isActive ? "default" : "secondary"}>
            {assembly.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">Output: {assembly.outputProductName} x{assembly.outputQuantity}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="w-4 h-4" />
          <span>{assembly.componentCount} component{assembly.componentCount !== 1 ? "s" : ""}</span>
        </div>

        {expanded && assembly.components.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">Components</p>
            {assembly.components.map((comp) => (
              <div key={comp._id} className="flex items-center justify-between text-xs">
                <span className="truncate flex-1">
                  {comp.productName}
                  {comp.isOptional && <Badge variant="secondary" className="ml-1 text-[10px]">Optional</Badge>}
                </span>
                <span className="text-muted-foreground ml-2">x{comp.quantityRequired}</span>
              </div>
            ))}
          </div>
        )}

        {(assembly.laborCost || assembly.overheadCost) && (
          <div className="flex gap-3 text-xs text-muted-foreground pt-1">
            {assembly.laborCost ? <span>Labor: ${assembly.laborCost.toFixed(2)}</span> : null}
            {assembly.overheadCost ? <span>Overhead: ${assembly.overheadCost.toFixed(2)}</span> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ProductItem = {
  _id: Id<"products">;
  name: string;
  sku?: string;
  unitPrice: number;
};

function CreateAssemblyDialog({ products, onClose }: { products: ProductItem[]; onClose: () => void }) {
  const createAssembly = useMutation(api.assembly.createAssembly);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [laborCost, setLaborCost] = useState("");
  const [overheadCost, setOverheadCost] = useState("");
  const [components, setComponents] = useState<Array<{ productId: string; qty: string; optional: boolean }>>([]);

  const addComponent = () => {
    setComponents([...components, { productId: "", qty: "1", optional: false }]);
  };

  const removeComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, field: string, value: string | boolean) => {
    setComponents(components.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleSubmit = async () => {
    if (!name || !outputProductId || components.length === 0) {
      toast.error("Please fill name, output product, and at least one component");
      return;
    }

    try {
      await createAssembly({
        name,
        sku: sku || undefined,
        description: description || undefined,
        outputProductId: outputProductId as Id<"products">,
        outputQuantity: Number(outputQuantity),
        laborCost: laborCost ? Number(laborCost) : undefined,
        overheadCost: overheadCost ? Number(overheadCost) : undefined,
        components: components.map((c) => ({
          componentProductId: c.productId as Id<"products">,
          quantityRequired: Number(c.qty),
          isOptional: c.optional,
        })),
      });
      toast.success("Assembly created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create assembly");
    }
  };

  return (
    <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create Assembly / BOM</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laptop Bundle" />
          </div>
          <div className="space-y-1">
            <Label>SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Output Product</Label>
            <Select value={outputProductId} onValueChange={setOutputProductId}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Output Qty</Label>
            <Input type="number" min="1" value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Labor Cost</Label>
            <Input type="number" min="0" step="0.01" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label>Overhead Cost</Label>
            <Input type="number" min="0" step="0.01" value={overheadCost} onChange={(e) => setOverheadCost(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Components</Label>
            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={addComponent}>
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
          {components.length === 0 && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Add at least one component
            </p>
          )}
          {components.map((comp, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={comp.productId} onValueChange={(v) => updateComponent(idx, "productId", v)}>
                <SelectTrigger className="flex-1 cursor-pointer"><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>
                  {products.filter((p) => p._id !== outputProductId).map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="1"
                className="w-20"
                value={comp.qty}
                onChange={(e) => updateComponent(idx, "qty", e.target.value)}
                placeholder="Qty"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="cursor-pointer text-destructive shrink-0"
                onClick={() => removeComponent(idx)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button className="w-full cursor-pointer" onClick={handleSubmit}>Create Assembly</Button>
      </div>
    </DialogContent>
  );
}
