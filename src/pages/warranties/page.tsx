import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Shield,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Wrench,
  Trash2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import AttachmentPanel from "@/components/attachments/attachment-panel.tsx";

type WarrantyStatus = "active" | "expired" | "claimed" | "void";
type CoverageType = "full" | "limited" | "extended";
type ServiceType = "repair" | "replacement" | "inspection" | "claim";
type ItemType = "product" | "asset";

function StatusBadge({ status }: { status: WarrantyStatus }) {
  const { t } = useTranslation();
  const config = {
    active: { variant: "default" as const, icon: CheckCircle, label: t("warranty.status.active") },
    expired: { variant: "secondary" as const, icon: XCircle, label: t("warranty.status.expired") },
    claimed: { variant: "secondary" as const, icon: Wrench, label: t("warranty.status.claimed") },
    void: { variant: "destructive" as const, icon: XCircle, label: t("warranty.status.void") },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <Badge variant={c.variant} className="gap-1">
      <Icon className="h-3 w-3" /> {c.label}
    </Badge>
  );
}

export default function WarrantiesPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("warranties");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<Id<"warranties"> | null>(null);

  const stats = useQuery(api.warranties.getWarrantyStats, {});
  const warranties = useQuery(api.warranties.listWarranties, {
    statusFilter: statusFilter !== "all" ? statusFilter as WarrantyStatus : undefined,
    itemTypeFilter: itemTypeFilter !== "all" ? itemTypeFilter as ItemType : undefined,
  });
  const expiringWarranties = useQuery(api.warranties.getExpiringWarranties, { daysAhead: 30 });

  if (!stats || !warranties) {
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
          <h1 className="text-2xl font-bold">{t("warranty.title")}</h1>
          <p className="text-muted-foreground">{t("warranty.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          {t("warranty.addWarranty")}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xl sm:text-2xl font-bold break-words leading-tight">{stats.total}</div>
            <div className="text-sm text-muted-foreground truncate">{t("warranty.stats.total")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xl sm:text-2xl font-bold text-green-600 break-words leading-tight">{stats.active}</div>
            <div className="text-sm text-muted-foreground truncate">{t("warranty.stats.active")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xl sm:text-2xl font-bold text-yellow-600 break-words leading-tight">{stats.expiringSoon}</div>
            <div className="text-sm text-muted-foreground truncate">{t("warranty.stats.expiringSoon")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xl sm:text-2xl font-bold text-muted-foreground break-words leading-tight">{stats.expired}</div>
            <div className="text-sm text-muted-foreground truncate">{t("warranty.stats.expired")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xl sm:text-2xl font-bold text-blue-600 break-words leading-tight">{stats.claimed}</div>
            <div className="text-sm text-muted-foreground truncate">{t("warranty.stats.claimed")}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="warranties" className="cursor-pointer">{t("warranty.tabs.all")}</TabsTrigger>
          <TabsTrigger value="expiring" className="cursor-pointer">{t("warranty.tabs.expiring")}</TabsTrigger>
        </TabsList>

        <TabsContent value="warranties" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">{t("warranty.filter.allStatuses")}</SelectItem>
                <SelectItem value="active" className="cursor-pointer">{t("warranty.status.active")}</SelectItem>
                <SelectItem value="expired" className="cursor-pointer">{t("warranty.status.expired")}</SelectItem>
                <SelectItem value="claimed" className="cursor-pointer">{t("warranty.status.claimed")}</SelectItem>
                <SelectItem value="void" className="cursor-pointer">{t("warranty.status.void")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={itemTypeFilter} onValueChange={setItemTypeFilter}>
              <SelectTrigger className="w-40 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">{t("warranty.filter.allTypes")}</SelectItem>
                <SelectItem value="product" className="cursor-pointer">{t("warranty.itemType.product")}</SelectItem>
                <SelectItem value="asset" className="cursor-pointer">{t("warranty.itemType.asset")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {warranties.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Shield /></EmptyMedia>
                <EmptyTitle>{t("warranty.empty")}</EmptyTitle>
                <EmptyDescription>{t("warranty.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm" onClick={() => setShowCreate(true)} className="cursor-pointer">
                  {t("warranty.addWarranty")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("warranty.fields.item")}</TableHead>
                    <TableHead>{t("warranty.fields.provider")}</TableHead>
                    <TableHead>{t("warranty.fields.coverage")}</TableHead>
                    <TableHead>{t("warranty.fields.startDate")}</TableHead>
                    <TableHead>{t("warranty.fields.endDate")}</TableHead>
                    <TableHead>{t("warranty.fields.remaining")}</TableHead>
                    <TableHead>{t("warranty.fields.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warranties.map((w) => {
                    const daysLeft = differenceInDays(new Date(w.endDate), new Date());
                    return (
                      <TableRow
                        key={w._id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedWarranty(w._id)}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{w.itemName}</div>
                            <div className="text-xs text-muted-foreground">
                              {t(`warranty.itemType.${w.itemType}`)}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{w.provider}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {t(`warranty.coverage.${w.coverageType}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(w.startDate), "MMM d, yyyy")}</TableCell>
                        <TableCell>{format(new Date(w.endDate), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          {w.status === "active" ? (
                            <span className={daysLeft <= 30 ? "text-yellow-600 font-medium" : ""}>
                              {daysLeft} {t("warranty.days")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell><StatusBadge status={w.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="expiring" className="space-y-4">
          {!expiringWarranties || expiringWarranties.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="font-medium">{t("warranty.noExpiring")}</p>
                <p className="text-sm text-muted-foreground">{t("warranty.noExpiringDesc")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {expiringWarranties.map((w) => {
                const daysLeft = differenceInDays(new Date(w.endDate), new Date());
                return (
                  <Card key={w._id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedWarranty(w._id)}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <AlertTriangle className={`h-8 w-8 ${daysLeft <= 7 ? "text-red-500" : "text-yellow-500"}`} />
                      <div className="flex-1">
                        <div className="font-medium">{w.itemName}</div>
                        <div className="text-sm text-muted-foreground">
                          {w.provider} &middot; {t(`warranty.coverage.${w.coverageType}`)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${daysLeft <= 7 ? "text-red-600" : "text-yellow-600"}`}>
                          {daysLeft} {t("warranty.days")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("warranty.expiresOn")} {format(new Date(w.endDate), "MMM d, yyyy")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <CreateWarrantyDialog open={showCreate} onOpenChange={setShowCreate} />

      {/* Detail Sheet */}
      {selectedWarranty && (
        <WarrantyDetailSheet
          warrantyId={selectedWarranty}
          onClose={() => setSelectedWarranty(null)}
        />
      )}
    </div>
  );
}

// ─── Create Warranty Dialog ──────────────────────────────────────

function CreateWarrantyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const createWarranty = useMutation(api.warranties.createWarranty);

  const [form, setForm] = useState({
    itemType: "product" as ItemType,
    itemId: "",
    itemName: "",
    warrantyNumber: "",
    provider: "",
    startDate: "",
    endDate: "",
    terms: "",
    coverageType: "full" as CoverageType,
    contactPhone: "",
    contactEmail: "",
    notes: "",
  });

  const handleSubmit = async () => {
    if (!form.itemName || !form.provider || !form.startDate || !form.endDate) {
      toast.error(t("warranty.validation.required"));
      return;
    }

    try {
      await createWarranty({
        itemType: form.itemType,
        itemId: form.itemId || form.itemName.toLowerCase().replace(/\s+/g, "-"),
        itemName: form.itemName,
        warrantyNumber: form.warrantyNumber || undefined,
        provider: form.provider,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        terms: form.terms || undefined,
        coverageType: form.coverageType,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        notes: form.notes || undefined,
      });
      toast.success(t("warranty.created"));
      onOpenChange(false);
      setForm({
        itemType: "product",
        itemId: "",
        itemName: "",
        warrantyNumber: "",
        provider: "",
        startDate: "",
        endDate: "",
        terms: "",
        coverageType: "full",
        contactPhone: "",
        contactEmail: "",
        notes: "",
      });
    } catch {
      toast.error(t("warranty.createFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("warranty.addWarranty")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("warranty.fields.itemType")}</Label>
              <Select value={form.itemType} onValueChange={(v) => setForm({ ...form, itemType: v as ItemType })}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product" className="cursor-pointer">{t("warranty.itemType.product")}</SelectItem>
                  <SelectItem value="asset" className="cursor-pointer">{t("warranty.itemType.asset")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("warranty.fields.coverageType")}</Label>
              <Select value={form.coverageType} onValueChange={(v) => setForm({ ...form, coverageType: v as CoverageType })}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full" className="cursor-pointer">{t("warranty.coverage.full")}</SelectItem>
                  <SelectItem value="limited" className="cursor-pointer">{t("warranty.coverage.limited")}</SelectItem>
                  <SelectItem value="extended" className="cursor-pointer">{t("warranty.coverage.extended")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("warranty.fields.itemName")} *</Label>
            <Input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder={t("warranty.placeholder.itemName")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("warranty.fields.warrantyNumber")}</Label>
              <Input value={form.warrantyNumber} onChange={(e) => setForm({ ...form, warrantyNumber: e.target.value })} placeholder="WRN-001" />
            </div>
            <div className="space-y-2">
              <Label>{t("warranty.fields.provider")} *</Label>
              <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder={t("warranty.placeholder.provider")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("warranty.fields.startDate")} *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("warranty.fields.endDate")} *</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("warranty.fields.contactPhone")}</Label>
              <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+974 1234 5678" />
            </div>
            <div className="space-y-2">
              <Label>{t("warranty.fields.contactEmail")}</Label>
              <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="support@vendor.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("warranty.fields.terms")}</Label>
            <Textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder={t("warranty.placeholder.terms")} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>{t("warranty.fields.notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} className="cursor-pointer">{t("warranty.addWarranty")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Warranty Detail Sheet ───────────────────────────────────────

function WarrantyDetailSheet({
  warrantyId,
  onClose,
}: {
  warrantyId: Id<"warranties">;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const warranty = useQuery(api.warranties.getWarranty, { warrantyId });
  const serviceHistory = useQuery(api.warranties.listServiceHistory, { warrantyId });
  const deleteWarranty = useMutation(api.warranties.deleteWarranty);
  const [showAddService, setShowAddService] = useState(false);

  if (!warranty) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <Skeleton className="h-64" />
        </SheetContent>
      </Sheet>
    );
  }

  const daysLeft = differenceInDays(new Date(warranty.endDate), new Date());

  const handleDelete = async () => {
    try {
      await deleteWarranty({ warrantyId });
      toast.success(t("warranty.deleted"));
      onClose();
    } catch {
      toast.error(t("warranty.deleteFailed"));
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {warranty.itemName}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Status & Overview */}
          <div className="flex items-center gap-3">
            <StatusBadge status={warranty.status} />
            {warranty.status === "active" && (
              <span className={`text-sm font-medium ${daysLeft <= 30 ? "text-yellow-600" : "text-green-600"}`}>
                {daysLeft} {t("warranty.daysRemaining")}
              </span>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">{t("warranty.fields.provider")}</span>
              <p className="font-medium">{warranty.provider}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("warranty.fields.coverage")}</span>
              <p className="font-medium">{t(`warranty.coverage.${warranty.coverageType}`)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("warranty.fields.startDate")}</span>
              <p className="font-medium">{format(new Date(warranty.startDate), "MMM d, yyyy")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">{t("warranty.fields.endDate")}</span>
              <p className="font-medium">{format(new Date(warranty.endDate), "MMM d, yyyy")}</p>
            </div>
            {warranty.warrantyNumber && (
              <div>
                <span className="text-muted-foreground">{t("warranty.fields.warrantyNumber")}</span>
                <p className="font-medium">{warranty.warrantyNumber}</p>
              </div>
            )}
            {warranty.contactPhone && (
              <div>
                <span className="text-muted-foreground">{t("warranty.fields.contactPhone")}</span>
                <p className="font-medium">{warranty.contactPhone}</p>
              </div>
            )}
            {warranty.contactEmail && (
              <div className="col-span-2">
                <span className="text-muted-foreground">{t("warranty.fields.contactEmail")}</span>
                <p className="font-medium">{warranty.contactEmail}</p>
              </div>
            )}
          </div>

          {warranty.terms && (
            <div>
              <span className="text-sm text-muted-foreground">{t("warranty.fields.terms")}</span>
              <p className="text-sm mt-1 p-3 bg-muted/50 rounded-lg whitespace-pre-wrap">{warranty.terms}</p>
            </div>
          )}

          {/* Service History */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t("warranty.serviceHistory")}
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAddService(true)}
                  className="cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!serviceHistory || serviceHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  {t("warranty.noServiceHistory")}
                </p>
              ) : (
                <div className="space-y-3">
                  {serviceHistory.map((svc) => (
                    <div key={svc._id} className="p-3 rounded-lg border text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary">{t(`warranty.serviceType.${svc.type}`)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(svc.serviceDate), "MMM d, yyyy")}
                        </span>
                      </div>
                      <p className="mt-2">{svc.description}</p>
                      {svc.serviceProvider && (
                        <p className="text-muted-foreground mt-1">{svc.serviceProvider}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {svc.cost !== undefined && (
                          <span className="text-xs">
                            {t("warranty.service.cost")}: {svc.cost.toLocaleString()}
                          </span>
                        )}
                        <Badge variant={svc.coveredByWarranty ? "default" : "secondary"} className="text-xs">
                          {svc.coveredByWarranty ? t("warranty.service.covered") : t("warranty.service.notCovered")}
                        </Badge>
                      </div>
                      {svc.resolution && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("warranty.service.resolution")}: {svc.resolution}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <AttachmentPanel
            recordType="warranty"
            recordId={warrantyId}
            title={t("attachments.title")}
          />

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="destructive" size="sm" onClick={handleDelete} className="cursor-pointer">
              <Trash2 className="h-4 w-4 mr-1" />
              {t("warranty.delete")}
            </Button>
          </div>
        </div>

        {/* Add Service Record Dialog */}
        <AddServiceDialog
          open={showAddService}
          onOpenChange={setShowAddService}
          warrantyId={warrantyId}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Add Service Record Dialog ───────────────────────────────────

function AddServiceDialog({
  open,
  onOpenChange,
  warrantyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warrantyId: Id<"warranties">;
}) {
  const { t } = useTranslation();
  const addService = useMutation(api.warranties.addServiceRecord);

  const [form, setForm] = useState({
    serviceDate: new Date().toISOString().split("T")[0],
    type: "repair" as ServiceType,
    description: "",
    cost: "",
    coveredByWarranty: true,
    serviceProvider: "",
    resolution: "",
  });

  const handleSubmit = async () => {
    if (!form.description) {
      toast.error(t("warranty.validation.descriptionRequired"));
      return;
    }

    try {
      await addService({
        warrantyId,
        serviceDate: new Date(form.serviceDate).toISOString(),
        type: form.type,
        description: form.description,
        cost: form.cost ? parseFloat(form.cost) : undefined,
        coveredByWarranty: form.coveredByWarranty,
        serviceProvider: form.serviceProvider || undefined,
        resolution: form.resolution || undefined,
      });
      toast.success(t("warranty.serviceAdded"));
      onOpenChange(false);
      setForm({
        serviceDate: new Date().toISOString().split("T")[0],
        type: "repair",
        description: "",
        cost: "",
        coveredByWarranty: true,
        serviceProvider: "",
        resolution: "",
      });
    } catch {
      toast.error(t("warranty.serviceAddFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("warranty.addServiceRecord")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("warranty.service.date")}</Label>
              <Input type="date" value={form.serviceDate} onChange={(e) => setForm({ ...form, serviceDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("warranty.service.type")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ServiceType })}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair" className="cursor-pointer">{t("warranty.serviceType.repair")}</SelectItem>
                  <SelectItem value="replacement" className="cursor-pointer">{t("warranty.serviceType.replacement")}</SelectItem>
                  <SelectItem value="inspection" className="cursor-pointer">{t("warranty.serviceType.inspection")}</SelectItem>
                  <SelectItem value="claim" className="cursor-pointer">{t("warranty.serviceType.claim")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("warranty.service.description")} *</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("warranty.service.cost")}</Label>
              <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>{t("warranty.service.serviceProvider")}</Label>
              <Input value={form.serviceProvider} onChange={(e) => setForm({ ...form, serviceProvider: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="covered"
              checked={form.coveredByWarranty}
              onChange={(e) => setForm({ ...form, coveredByWarranty: e.target.checked })}
              className="cursor-pointer"
            />
            <Label htmlFor="covered" className="cursor-pointer">{t("warranty.service.coveredByWarranty")}</Label>
          </div>
          <div className="space-y-2">
            <Label>{t("warranty.service.resolution")}</Label>
            <Input value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="cursor-pointer">{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} className="cursor-pointer">{t("warranty.addServiceRecord")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
