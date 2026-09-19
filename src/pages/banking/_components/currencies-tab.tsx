import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Plus, Star, Trash2, Coins, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

export default function CurrenciesTab() {
  const currencies = useQuery(api.banking.listCurrencies, {});
  const seedCurrencies = useMutation(api.banking.seedDefaultCurrencies);
  const deleteCurrency = useMutation(api.banking.deleteCurrency);
  const updateCurrency = useMutation(api.banking.updateCurrency);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!currencies) return <Skeleton className="h-40 w-full" />;

  const handleSeed = async () => {
    try {
      const count = await seedCurrencies({});
      toast.success(`Loaded ${count} default currencies`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleSetBase = async (id: string) => {
    try {
      await updateCurrency({ id: id as Parameters<typeof updateCurrency>[0]["id"], isBase: true });
      toast.success("Base currency updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCurrency({ id: id as Parameters<typeof deleteCurrency>[0]["id"] });
      toast.success("Currency deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await updateCurrency({ id: id as Parameters<typeof updateCurrency>[0]["id"], isActive: !isActive });
      toast.success(isActive ? "Currency deactivated" : "Currency activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="w-4 h-4" />
              Currencies
            </CardTitle>
            <div className="flex gap-2">
              {currencies.length === 0 && (
                <Button size="sm" variant="secondary" onClick={handleSeed} className="cursor-pointer">
                  Load Defaults
                </Button>
              )}
              <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />Add Currency
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {currencies.length} currencies configured. The base currency is used for all reports.
          </p>
        </CardHeader>
        <CardContent>
          {currencies.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Coins /></EmptyMedia>
                <EmptyTitle>No currencies configured</EmptyTitle>
                <EmptyDescription>Load default currencies or add your own</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={handleSeed}>Load Defaults</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-2">
              {currencies.map((currency) => (
                <div
                  key={currency._id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 flex-wrap"
                >
                  <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-lg shrink-0">
                    {currency.symbol}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{currency.code}</span>
                      <span className="text-muted-foreground text-sm">{currency.name}</span>
                      {currency.isBase && (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                          <Star className="w-3 h-3 mr-1" />Base
                        </Badge>
                      )}
                      {!currency.isActive && (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{currency.decimalPlaces} decimal places</p>
                  </div>
                  <div className="flex gap-1">
                    {!currency.isBase && currency.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer text-xs"
                        onClick={() => handleSetBase(currency._id)}
                        title="Set as base currency"
                      >
                        <Star className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cursor-pointer text-xs"
                      onClick={() => handleToggleActive(currency._id, currency.isActive)}
                    >
                      {currency.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    {!currency.isBase && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer text-destructive"
                        onClick={() => handleDelete(currency._id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && <CreateCurrencyDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateCurrencyDialog({ onClose }: { onClose: () => void }) {
  const createCurrency = useMutation(api.banking.createCurrency);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimalPlaces, setDecimalPlaces] = useState("2");
  const [isBase, setIsBase] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !symbol) {
      toast.error("Code, name, and symbol are required");
      return;
    }
    setSaving(true);
    try {
      await createCurrency({
        code: code.toUpperCase(),
        name,
        symbol,
        decimalPlaces: parseInt(decimalPlaces) || 2,
        isBase,
      });
      toast.success(`Currency ${code.toUpperCase()} created`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Currency</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Code *</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="USD" maxLength={3} />
            </div>
            <div>
              <Label>Symbol *</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" />
            </div>
          </div>
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="US Dollar" />
          </div>
          <div>
            <Label>Decimal Places</Label>
            <Input type="number" value={decimalPlaces} onChange={(e) => setDecimalPlaces(e.target.value)} min="0" max="4" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isBase"
              checked={isBase}
              onChange={(e) => setIsBase(e.target.checked)}
              className="cursor-pointer"
            />
            <Label htmlFor="isBase" className="cursor-pointer text-sm">Set as base currency</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
