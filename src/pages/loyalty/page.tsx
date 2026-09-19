import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import {
  Star,
  Users,
  TrendingUp,
  Gift,
  Settings,
  Award,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type LoyaltyTier = {
  name: string;
  minimumPoints: number;
  multiplier: number;
  color: string;
};

export default function LoyaltyPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");

  const stats = useQuery(api.loyalty.getLoyaltyStats, {});
  const settings = useQuery(api.loyalty.getSettings, {});
  const initializeSettings = useMutation(api.loyalty.initializeSettings);

  // Auto-initialize settings if not set
  if (settings === null) {
    initializeSettings().catch(() => {});
  }

  if (stats === undefined || settings === undefined) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("loyalty.title")}</h1>
          <p className="text-muted-foreground">{t("loyalty.subtitle")}</p>
        </div>
        <Badge variant={stats?.isActive ? "default" : "secondary"} className="text-sm">
          {stats?.isActive ? t("loyalty.active") : t("loyalty.inactive")}
        </Badge>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs truncate">{t("loyalty.stats.members")}</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold break-words leading-tight">{stats?.totalMembers ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Star className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs truncate">{t("loyalty.stats.inCirculation")}</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-yellow-600 break-words leading-tight">
              {(stats?.totalPointsInCirculation ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs truncate">{t("loyalty.stats.totalEarned")}</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600 break-words leading-tight">
              {(stats?.totalEarned ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Gift className="h-4 w-4 flex-shrink-0" />
              <span className="text-xs truncate">{t("loyalty.stats.totalRedeemed")}</span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-600 break-words leading-tight">
              {(stats?.totalRedeemed ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution */}
      {stats && stats.tierBreakdown && Object.keys(stats.tierBreakdown).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("loyalty.tierDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(stats.tierBreakdown).map(([tier, count]) => (
                <div key={tier} className="flex items-center gap-2">
                  <Award className="h-4 w-4" style={{ color: settings?.tiers.find((t) => t.name === tier)?.color }} />
                  <span className="text-sm font-medium">{tier}</span>
                  <Badge variant="secondary">{count as number}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="cursor-pointer">{t("loyalty.tabs.members")}</TabsTrigger>
          <TabsTrigger value="settings" className="cursor-pointer">{t("loyalty.tabs.settings")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <MembersTab />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Members Tab ─────────────────────────────────────────────────

function MembersTab() {
  const { t } = useTranslation();
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Id<"customers"> | null>(null);

  const accounts = useQuery(api.loyalty.listAccounts, {
    tierFilter: tierFilter !== "all" ? tierFilter : undefined,
  });
  const settings = useQuery(api.loyalty.getSettings, {});

  if (!accounts) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-40 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="cursor-pointer">{t("loyalty.filter.allTiers")}</SelectItem>
            {(settings?.tiers ?? []).map((tier) => (
              <SelectItem key={tier.name} value={tier.name} className="cursor-pointer">
                {tier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {accounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Star /></EmptyMedia>
            <EmptyTitle>{t("loyalty.noMembers")}</EmptyTitle>
            <EmptyDescription>{t("loyalty.noMembersDesc")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("loyalty.fields.customer")}</TableHead>
                <TableHead>{t("loyalty.fields.tier")}</TableHead>
                <TableHead className="text-right">{t("loyalty.fields.balance")}</TableHead>
                <TableHead className="text-right">{t("loyalty.fields.totalEarned")}</TableHead>
                <TableHead className="text-right">{t("loyalty.fields.totalRedeemed")}</TableHead>
                <TableHead>{t("loyalty.fields.lastActivity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((acc) => {
                const tierColor = settings?.tiers.find((t) => t.name === acc.currentTier)?.color ?? "#888";
                return (
                  <TableRow
                    key={acc._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedCustomer(acc.customerId)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{acc.customerName}</div>
                        {acc.customerEmail && (
                          <div className="text-xs text-muted-foreground">{acc.customerEmail}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: tierColor, color: "#fff" }}>
                        {acc.currentTier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {acc.currentBalance.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {acc.totalPointsEarned.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      {acc.totalPointsRedeemed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {acc.lastActivityDate
                        ? format(new Date(acc.lastActivityDate), "MMM d, yyyy")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Customer Detail Sheet */}
      {selectedCustomer && (
        <CustomerLoyaltySheet
          customerId={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
  );
}

// ─── Customer Loyalty Sheet ──────────────────────────────────────

function CustomerLoyaltySheet({
  customerId,
  onClose,
}: {
  customerId: Id<"customers">;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const account = useQuery(api.loyalty.getAccount, { customerId });
  const transactions = useQuery(api.loyalty.getTransactions, { customerId });
  const settings = useQuery(api.loyalty.getSettings, {});
  const [showAdjust, setShowAdjust] = useState(false);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            {t("loyalty.customerDetail")}
          </SheetTitle>
        </SheetHeader>

        {!account ? (
          <div className="py-8 text-center text-muted-foreground">
            {t("loyalty.noAccount")}
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Balance Card */}
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-yellow-600">
                  {account.currentBalance.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">{t("loyalty.pointsBalance")}</div>
                <Badge
                  className="mt-2"
                  style={{
                    backgroundColor: settings?.tiers.find((t) => t.name === account.currentTier)?.color ?? "#888",
                    color: "#fff",
                  }}
                >
                  {account.currentTier}
                </Badge>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAdjust(true)}
                className="cursor-pointer flex-1"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t("loyalty.adjustPoints")}
              </Button>
            </div>

            {/* Transactions */}
            <div>
              <h3 className="font-medium mb-3">{t("loyalty.transactionHistory")}</h3>
              {!transactions || transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("loyalty.noTransactions")}
                </p>
              ) : (
                <div className="space-y-2">
                  {transactions.map((txn) => (
                    <div key={txn._id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                      {txn.type === "earn" && <Plus className="h-4 w-4 text-green-500" />}
                      {txn.type === "redeem" && <Minus className="h-4 w-4 text-blue-500" />}
                      {txn.type === "expire" && <Minus className="h-4 w-4 text-red-500" />}
                      {txn.type === "adjust" && <Settings className="h-4 w-4 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{txn.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(txn._creationTime), "MMM d, yyyy HH:mm")}
                        </p>
                      </div>
                      <span className={`font-mono font-medium text-sm ${
                        txn.type === "earn" || (txn.type === "adjust" && txn.points > 0)
                          ? "text-green-600"
                          : "text-red-600"
                      }`}>
                        {txn.type === "earn" || (txn.type === "adjust" && txn.points > 0) ? "+" : "-"}
                        {Math.abs(txn.points).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Adjust Points Dialog */}
        {showAdjust && (
          <AdjustPointsDialog
            open={showAdjust}
            onOpenChange={setShowAdjust}
            customerId={customerId}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Adjust Points Dialog ────────────────────────────────────────

function AdjustPointsDialog({
  open,
  onOpenChange,
  customerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: Id<"customers">;
}) {
  const { t } = useTranslation();
  const adjustPoints = useMutation(api.loyalty.adjustPoints);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    const ptsNum = parseInt(points);
    if (!ptsNum || !reason.trim()) {
      toast.error(t("loyalty.validation.adjustRequired"));
      return;
    }

    try {
      await adjustPoints({ customerId, points: ptsNum, reason: reason.trim() });
      toast.success(t("loyalty.pointsAdjusted"));
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("loyalty.adjustFailed");
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("loyalty.adjustPoints")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("loyalty.fields.points")}</Label>
            <Input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder={t("loyalty.placeholder.points")}
            />
            <p className="text-xs text-muted-foreground">{t("loyalty.adjustHint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("loyalty.fields.reason")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("loyalty.placeholder.reason")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} className="cursor-pointer">
            {t("loyalty.confirmAdjust")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────

function SettingsTab() {
  const { t } = useTranslation();
  const settings = useQuery(api.loyalty.getSettings, {});
  const saveSettings = useMutation(api.loyalty.saveSettings);

  const [form, setForm] = useState<{
    pointsPerCurrencyUnit: number;
    redemptionRate: number;
    minimumRedeemPoints: number;
    pointsExpiryDays: number;
    isActive: boolean;
    tiers: LoyaltyTier[];
  } | null>(null);

  // Initialize form when settings load
  if (settings && !form) {
    setForm({
      pointsPerCurrencyUnit: settings.pointsPerCurrencyUnit,
      redemptionRate: settings.redemptionRate,
      minimumRedeemPoints: settings.minimumRedeemPoints,
      pointsExpiryDays: settings.pointsExpiryDays,
      isActive: settings.isActive,
      tiers: [...settings.tiers],
    });
  }

  if (!form) {
    return <Skeleton className="h-64" />;
  }

  const handleSave = async () => {
    try {
      await saveSettings(form);
      toast.success(t("loyalty.settingsSaved"));
    } catch {
      toast.error(t("loyalty.settingsSaveFailed"));
    }
  };

  const updateTier = (index: number, field: keyof LoyaltyTier, value: string | number) => {
    const newTiers = [...form.tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setForm({ ...form, tiers: newTiers });
  };

  return (
    <div className="space-y-6">
      {/* Program Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t("loyalty.settings.programSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("loyalty.settings.isActive")}</Label>
              <p className="text-xs text-muted-foreground">{t("loyalty.settings.isActiveDesc")}</p>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
              className="cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("loyalty.settings.pointsPerUnit")}</Label>
              <Input
                type="number"
                value={form.pointsPerCurrencyUnit}
                onChange={(e) => setForm({ ...form, pointsPerCurrencyUnit: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">{t("loyalty.settings.pointsPerUnitDesc")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("loyalty.settings.redemptionRate")}</Label>
              <Input
                type="number"
                step="0.001"
                value={form.redemptionRate}
                onChange={(e) => setForm({ ...form, redemptionRate: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">{t("loyalty.settings.redemptionRateDesc")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("loyalty.settings.minRedeem")}</Label>
              <Input
                type="number"
                value={form.minimumRedeemPoints}
                onChange={(e) => setForm({ ...form, minimumRedeemPoints: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("loyalty.settings.expiryDays")}</Label>
              <Input
                type="number"
                value={form.pointsExpiryDays}
                onChange={(e) => setForm({ ...form, pointsExpiryDays: parseInt(e.target.value) || 365 })}
              />
              <p className="text-xs text-muted-foreground">{t("loyalty.settings.expiryDaysDesc")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tier Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            {t("loyalty.settings.tiers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {form.tiers.map((tier, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-3 items-end p-3 rounded-lg border">
                <div className="space-y-1">
                  <Label className="text-xs">{t("loyalty.settings.tierName")}</Label>
                  <Input
                    value={tier.name}
                    onChange={(e) => updateTier(idx, "name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("loyalty.settings.minPoints")}</Label>
                  <Input
                    type="number"
                    value={tier.minimumPoints}
                    onChange={(e) => updateTier(idx, "minimumPoints", parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("loyalty.settings.multiplier")}</Label>
                  <Input
                    type="number"
                    step="0.25"
                    value={tier.multiplier}
                    onChange={(e) => updateTier(idx, "multiplier", parseFloat(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("loyalty.settings.color")}</Label>
                  <Input
                    type="color"
                    value={tier.color}
                    onChange={(e) => updateTier(idx, "color", e.target.value)}
                    className="h-9 p-1 cursor-pointer"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className="cursor-pointer">
          {t("loyalty.settings.save")}
        </Button>
      </div>
    </div>
  );
}
