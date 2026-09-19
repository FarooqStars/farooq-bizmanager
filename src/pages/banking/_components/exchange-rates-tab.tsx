import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { ArrowLeftRight, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";

export default function ExchangeRatesTab() {
  const currencies = useQuery(api.banking.listCurrencies, { activeOnly: true });
  const rates = useQuery(api.banking.listExchangeRates, {});
  const baseCurrency = useQuery(api.banking.getBaseCurrency, {});
  const fetchLiveRates = useAction(api.banking.fetchLiveRates);
  const [showManual, setShowManual] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Converter state
  const [fromCurrency, setFromCurrency] = useState("");
  const [toCurrency, setToCurrency] = useState("");
  const [amount, setAmount] = useState("1");
  const conversion = useQuery(
    api.banking.convertAmount,
    fromCurrency && toCurrency
      ? { amount: parseFloat(amount) || 0, fromCurrency, toCurrency }
      : "skip"
  );

  if (!currencies || !rates) return <Skeleton className="h-40 w-full" />;

  const handleFetchLive = async () => {
    if (!baseCurrency) {
      toast.error("Set a base currency first");
      return;
    }
    setIsFetching(true);
    try {
      const result = await fetchLiveRates({ baseCurrency: baseCurrency.code });
      if (result.count > 0) {
        toast.success(`Updated ${result.count} exchange rates`);
      } else {
        toast.info("No matching rates found. Make sure your currencies are in the Frankfurter API (major currencies).");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch rates");
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Currency Converter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            Currency Converter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1.00"
              />
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c._id} value={c.code} className="cursor-pointer">
                      {c.symbol} {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c._id} value={c.code} className="cursor-pointer">
                      {c.symbol} {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              {conversion ? (
                conversion.convertedAmount !== null ? (
                  <div>
                    <p className="text-lg font-bold">{conversion.convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-muted-foreground">Rate: {conversion.rate}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rate available</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">Select currencies</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exchange Rates Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Current Exchange Rates</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleFetchLive}
                disabled={isFetching}
                className="cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                {isFetching ? "Fetching..." : "Fetch Live Rates"}
              </Button>
              <Button size="sm" onClick={() => setShowManual(true)} className="cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />Manual Rate
              </Button>
            </div>
          </div>
          {baseCurrency && (
            <p className="text-xs text-muted-foreground">
              Base currency: {baseCurrency.symbol} {baseCurrency.code} ({baseCurrency.name})
            </p>
          )}
        </CardHeader>
        <CardContent>
          {rates.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><ArrowLeftRight /></EmptyMedia>
                <EmptyTitle>No exchange rates</EmptyTitle>
                <EmptyDescription>Fetch live rates or add manually</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={handleFetchLive} disabled={isFetching}>
                  Fetch Live Rates
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-2">
              {rates.map((rate) => (
                <div key={rate._id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium">{rate.fromCurrency}</span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">{rate.toCurrency}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold">{rate.rate.toFixed(6)}</span>
                    <Badge variant="secondary" className="text-xs capitalize">{rate.source}</Badge>
                    <span className="text-xs text-muted-foreground">{rate.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showManual && <ManualRateDialog currencies={currencies} onClose={() => setShowManual(false)} />}
    </div>
  );
}

function ManualRateDialog({
  currencies,
  onClose,
}: {
  currencies: Array<{ _id: string; code: string; symbol: string; name: string }>;
  onClose: () => void;
}) {
  const setRate = useMutation(api.banking.setExchangeRate);
  const [fromCurrency, setFromCurrency] = useState("");
  const [toCurrency, setToCurrency] = useState("");
  const [rate, setRate_] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCurrency || !toCurrency || !rate) {
      toast.error("All fields required");
      return;
    }
    if (fromCurrency === toCurrency) {
      toast.error("Currencies must be different");
      return;
    }
    setSaving(true);
    try {
      await setRate({
        fromCurrency,
        toCurrency,
        rate: parseFloat(rate),
        date,
      });
      toast.success("Exchange rate saved");
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
          <DialogTitle>Set Exchange Rate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From Currency *</Label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c._id} value={c.code} className="cursor-pointer">
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Currency *</Label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c._id} value={c.code} className="cursor-pointer">
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Rate *</Label>
            <Input type="number" step="0.000001" value={rate} onChange={(e) => setRate_(e.target.value)} placeholder="3.64" />
            <p className="text-xs text-muted-foreground mt-1">1 {fromCurrency || "FROM"} = {rate || "?"} {toCurrency || "TO"}</p>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Rate"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
