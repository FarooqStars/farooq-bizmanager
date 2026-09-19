import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Plus, Truck, Printer, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateDeliveryNoteHtml } from "@/lib/print-templates/delivery-note-template.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type DeliveryItem = {
  productId?: Id<"products">;
  description: string;
  quantity: number;
  unitPrice?: number;
};

export default function DeliveryNotesTab() {
  const { t, i18n } = useTranslation();
  const deliveryNotes = useQuery(api.deliveryNotes.listDeliveryNotes, {});
  const customers = useQuery(api.sales.listCustomers, {});
  const sales = useQuery(api.sales.listSales, {});
  const companyProfile = useQuery(api.companyProfile.get, {});
  const [showCreate, setShowCreate] = useState(false);
  const [viewNote, setViewNote] = useState<Id<"deliveryNotes"> | null>(null);

  if (!deliveryNotes || !customers) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("delivery.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("delivery.subtitle")}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />{t("delivery.create")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("delivery.create")}</DialogTitle>
            </DialogHeader>
            <CreateDeliveryNoteForm
              customers={customers}
              sales={sales ?? []}
              onSuccess={() => setShowCreate(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {deliveryNotes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Truck /></EmptyMedia>
            <EmptyTitle>{t("delivery.empty")}</EmptyTitle>
            <EmptyDescription>{t("delivery.emptyDesc")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />{t("delivery.create")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {deliveryNotes.map((note) => (
            <DeliveryNoteRow
              key={note._id}
              note={note}
              companyProfile={companyProfile}
              onView={() => setViewNote(note._id)}
              lang={i18n.language}
            />
          ))}
        </div>
      )}

      {viewNote && (
        <DeliveryNoteDetail
          noteId={viewNote}
          onClose={() => setViewNote(null)}
          companyProfile={companyProfile}
          lang={i18n.language}
        />
      )}
    </div>
  );
}

// ── Row Component ────────────────────────────────────────────────────────────

function DeliveryNoteRow({
  note,
  companyProfile,
  onView,
  lang,
}: {
  note: { _id: Id<"deliveryNotes">; noteNumber: string; date: string; status: string; customer: { name: string; email?: string; phone?: string; address?: string } | null; driverName?: string; vehiclePlate?: string };
  companyProfile: unknown;
  onView: () => void;
  lang: string;
}) {
  const { t } = useTranslation();

  const statusVariant = {
    draft: "secondary" as const,
    dispatched: "default" as const,
    delivered: "default" as const,
    cancelled: "destructive" as const,
  };

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onView}>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{note.noteNumber}</p>
            <p className="text-sm text-muted-foreground">
              {note.customer?.name ?? t("delivery.unknownCustomer")} &bull; {format(new Date(note.date), "dd MMM yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {note.driverName && (
            <span className="text-sm text-muted-foreground hidden md:block">
              {note.driverName} {note.vehiclePlate ? `(${note.vehiclePlate})` : ""}
            </span>
          )}
          <Badge variant={statusVariant[note.status as keyof typeof statusVariant] ?? "secondary"}>
            {t(`delivery.status_${note.status}`)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Detail Dialog ────────────────────────────────────────────────────────────

function DeliveryNoteDetail({
  noteId,
  onClose,
  companyProfile,
  lang,
}: {
  noteId: Id<"deliveryNotes">;
  onClose: () => void;
  companyProfile: unknown;
  lang: string;
}) {
  const { t } = useTranslation();
  const note = useQuery(api.deliveryNotes.getDeliveryNote, { noteId });
  const updateStatus = useMutation(api.deliveryNotes.updateDeliveryNoteStatus);

  const handleStatusChange = async (status: "draft" | "dispatched" | "delivered" | "cancelled") => {
    try {
      await updateStatus({ noteId, status });
      toast.success(t("delivery.statusUpdated"));
    } catch {
      toast.error(t("delivery.statusError"));
    }
  };

  const handlePrint = () => {
    if (!note) return;
    const cp = companyProfile as { nameEn: string; nameAr?: string; address?: string; phone?: string; email?: string; website?: string; crNumber?: string; taxId?: string; invoiceFooterEn?: string; invoiceFooterAr?: string; logoStorageId?: string } | null | undefined;
    const logoUrl = cp?.logoStorageId ? undefined : undefined; // Logo handled via storage URL if needed
    const html = generateDeliveryNoteHtml(
      {
        noteNumber: note.noteNumber,
        date: note.date,
        status: note.status,
        customerName: note.customer?.name ?? "Unknown",
        customerEmail: note.customer?.email,
        customerPhone: note.customer?.phone,
        customerAddress: note.customer?.address,
        deliveryAddress: note.deliveryAddress,
        driverName: note.driverName,
        driverPhone: note.driverPhone,
        vehiclePlate: note.vehiclePlate,
        vehicleDescription: note.vehicleDescription,
        receiverName: note.receiverName,
        items: note.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
        notes: note.notes,
        saleRef: note.saleInfo ? `Sale ${note.saleInfo.date}` : undefined,
        invoiceRef: note.invoiceInfo ? note.invoiceInfo.invoiceNumber : undefined,
      },
      cp ? { nameEn: cp.nameEn, nameAr: cp.nameAr, address: cp.address, phone: cp.phone, email: cp.email, website: cp.website, crNumber: cp.crNumber, taxId: cp.taxId, invoiceFooterEn: cp.invoiceFooterEn, invoiceFooterAr: cp.invoiceFooterAr } : null,
      null,
      lang
    );
    openPrintWindow(html);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            {note ? note.noteNumber : "..."}
          </DialogTitle>
        </DialogHeader>
        {!note ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status and actions */}
            <div className="flex items-center justify-between">
              <Badge variant={note.status === "delivered" ? "default" : note.status === "cancelled" ? "destructive" : "secondary"}>
                {t(`delivery.status_${note.status}`)}
              </Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="cursor-pointer" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-1" />{t("delivery.print")}
                </Button>
                {note.status === "draft" && (
                  <Button size="sm" className="cursor-pointer" onClick={() => handleStatusChange("dispatched")}>
                    {t("delivery.dispatch")}
                  </Button>
                )}
                {note.status === "dispatched" && (
                  <Button size="sm" className="cursor-pointer" onClick={() => handleStatusChange("delivered")}>
                    {t("delivery.markDelivered")}
                  </Button>
                )}
                {note.status !== "cancelled" && note.status !== "delivered" && (
                  <Button size="sm" variant="destructive" className="cursor-pointer" onClick={() => handleStatusChange("cancelled")}>
                    {t("delivery.cancel")}
                  </Button>
                )}
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("delivery.customerInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p className="font-medium">{note.customer?.name}</p>
                  {note.customer?.phone && <p>{note.customer.phone}</p>}
                  {note.customer?.email && <p>{note.customer.email}</p>}
                  {note.deliveryAddress && <p className="text-muted-foreground">{note.deliveryAddress}</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("delivery.transportInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {note.driverName && <p>{t("delivery.driverName")}: {note.driverName}</p>}
                  {note.driverPhone && <p>{t("delivery.driverPhone")}: {note.driverPhone}</p>}
                  {note.vehiclePlate && <p>{t("delivery.vehiclePlate")}: {note.vehiclePlate}</p>}
                  {note.vehicleDescription && <p>{t("delivery.vehicleDesc")}: {note.vehicleDescription}</p>}
                  {note.receiverName && <p className="font-medium mt-2">{t("delivery.receiver")}: {note.receiverName}</p>}
                </CardContent>
              </Card>
            </div>

            {/* Items */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("delivery.items")}</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 w-10">#</th>
                      <th className="text-left py-2">{t("delivery.description")}</th>
                      <th className="text-right py-2 w-20">{t("delivery.qty")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {note.items.map((item, idx) => (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-2">{idx + 1}</td>
                        <td className="py-2">{item.description}</td>
                        <td className="py-2 text-right">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Notes and references */}
            {(note.notes || note.saleInfo || note.invoiceInfo) && (
              <div className="text-sm text-muted-foreground space-y-1">
                {note.notes && <p>{note.notes}</p>}
                {note.saleInfo && <p>{t("delivery.linkedSale")}: {note.saleInfo.date}</p>}
                {note.invoiceInfo && <p>{t("delivery.linkedInvoice")}: {note.invoiceInfo.invoiceNumber}</p>}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create Form ──────────────────────────────────────────────────────────────

function CreateDeliveryNoteForm({
  customers,
  sales,
  onSuccess,
}: {
  customers: { _id: Id<"customers">; name: string; email?: string; phone?: string; address?: string }[];
  sales: { _id: Id<"sales">; date: string; customerId?: Id<"customers">; customer?: { name: string } | null }[];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const createNote = useMutation(api.deliveryNotes.createDeliveryNote);
  const invoices = useQuery(api.invoicing.listInvoices, {});

  const [customerId, setCustomerId] = useState<Id<"customers"> | "">("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleDescription, setVehicleDescription] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DeliveryItem[]>([{ description: "", quantity: 1 }]);
  const [sourceType, setSourceType] = useState<"manual" | "sale" | "invoice">("manual");
  const [selectedSaleId, setSelectedSaleId] = useState<Id<"sales"> | "">("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<Id<"invoices"> | "">("");
  const [submitting, setSubmitting] = useState(false);

  // Load items from sale
  const saleItems = useQuery(
    api.deliveryNotes.getItemsFromSale,
    selectedSaleId ? { saleId: selectedSaleId as Id<"sales"> } : "skip"
  );
  // Load items from invoice
  const invoiceItems = useQuery(
    api.deliveryNotes.getItemsFromInvoice,
    selectedInvoiceId ? { invoiceId: selectedInvoiceId as Id<"invoices"> } : "skip"
  );

  const handleSourceChange = (type: "manual" | "sale" | "invoice") => {
    setSourceType(type);
    setSelectedSaleId("");
    setSelectedInvoiceId("");
    if (type === "manual") {
      setItems([{ description: "", quantity: 1 }]);
    }
  };

  const handleSaleSelect = (saleId: string) => {
    setSelectedSaleId(saleId as Id<"sales">);
    // Auto-select customer from sale
    const sale = sales.find((s) => s._id === saleId);
    if (sale?.customerId) setCustomerId(sale.customerId);
  };

  const handleInvoiceSelect = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId as Id<"invoices">);
    // Auto-select customer from invoice
    const invoice = invoices?.find((inv) => inv._id === invoiceId);
    if (invoice?.customerId) setCustomerId(invoice.customerId);
  };

  // Sync loaded items
  const effectiveItems: DeliveryItem[] =
    sourceType === "sale" && saleItems
      ? saleItems.map((i) => ({ productId: i.productId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }))
      : sourceType === "invoice" && invoiceItems
        ? invoiceItems.map((i) => ({ productId: i.productId ?? undefined, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }))
        : items;

  const addItem = () => setItems([...items, { description: "", quantity: 1 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof DeliveryItem, value: string | number) => {
    const updated = [...items];
    if (field === "quantity") {
      updated[idx] = { ...updated[idx], quantity: Number(value) };
    } else if (field === "description") {
      updated[idx] = { ...updated[idx], description: value as string };
    }
    setItems(updated);
  };

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error(t("delivery.selectCustomer"));
      return;
    }
    const finalItems = effectiveItems.filter((i) => i.description.trim() !== "");
    if (finalItems.length === 0) {
      toast.error(t("delivery.addItems"));
      return;
    }
    setSubmitting(true);
    try {
      await createNote({
        date,
        customerId: customerId as Id<"customers">,
        saleId: selectedSaleId ? (selectedSaleId as Id<"sales">) : undefined,
        invoiceId: selectedInvoiceId ? (selectedInvoiceId as Id<"invoices">) : undefined,
        driverName: driverName || undefined,
        driverPhone: driverPhone || undefined,
        vehiclePlate: vehiclePlate || undefined,
        vehicleDescription: vehicleDescription || undefined,
        receiverName: receiverName || undefined,
        deliveryAddress: deliveryAddress || undefined,
        notes: notes || undefined,
        items: finalItems.map((i) => ({
          productId: i.productId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
      toast.success(t("delivery.created"));
      onSuccess();
    } catch {
      toast.error(t("delivery.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Source selection */}
      <div className="space-y-2">
        <Label>{t("delivery.source")}</Label>
        <Select value={sourceType} onValueChange={(v) => handleSourceChange(v as "manual" | "sale" | "invoice")}>
          <SelectTrigger className="cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual" className="cursor-pointer">{t("delivery.sourceManual")}</SelectItem>
            <SelectItem value="sale" className="cursor-pointer">{t("delivery.sourceSale")}</SelectItem>
            <SelectItem value="invoice" className="cursor-pointer">{t("delivery.sourceInvoice")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sale / Invoice picker */}
      {sourceType === "sale" && (
        <div className="space-y-2">
          <Label>{t("delivery.selectSale")}</Label>
          <Select value={selectedSaleId} onValueChange={handleSaleSelect}>
            <SelectTrigger className="cursor-pointer">
              <SelectValue placeholder={t("delivery.selectSale")} />
            </SelectTrigger>
            <SelectContent>
              {sales.filter((s) => s.customerId).map((s) => (
                <SelectItem key={s._id} value={s._id} className="cursor-pointer">
                  {s.customer?.name ?? "Sale"} — {format(new Date(s.date), "dd MMM yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {sourceType === "invoice" && (
        <div className="space-y-2">
          <Label>{t("delivery.selectInvoice")}</Label>
          <Select value={selectedInvoiceId} onValueChange={handleInvoiceSelect}>
            <SelectTrigger className="cursor-pointer">
              <SelectValue placeholder={t("delivery.selectInvoice")} />
            </SelectTrigger>
            <SelectContent>
              {invoices?.map((inv) => (
                <SelectItem key={inv._id} value={inv._id} className="cursor-pointer">
                  {inv.invoiceNumber} — {inv.customerName ?? "Customer"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Customer and date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("delivery.customer")}</Label>
          <Select value={customerId} onValueChange={(v) => setCustomerId(v as Id<"customers">)}>
            <SelectTrigger className="cursor-pointer">
              <SelectValue placeholder={t("delivery.selectCustomer")} />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c._id} value={c._id} className="cursor-pointer">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("delivery.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* Driver & Vehicle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("delivery.driverName")}</Label>
          <Input placeholder="John Smith" value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("delivery.driverPhone")}</Label>
          <Input placeholder="+974 5555 5555" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("delivery.vehiclePlate")}</Label>
          <Input placeholder="ABC-1234" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("delivery.vehicleDesc")}</Label>
          <Input placeholder="White Toyota Hilux" value={vehicleDescription} onChange={(e) => setVehicleDescription(e.target.value)} />
        </div>
      </div>

      {/* Receiver */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("delivery.receiver")}</Label>
          <Input placeholder="Receiver name" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("delivery.deliveryAddress")}</Label>
          <Input placeholder="Delivery location" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <Label>{t("delivery.items")}</Label>
        {sourceType === "manual" ? (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  placeholder={t("delivery.description")}
                  value={item.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  className="w-20"
                />
                {items.length > 1 && (
                  <Button size="icon" variant="ghost" className="cursor-pointer" onClick={() => removeItem(idx)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" className="cursor-pointer" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" />{t("delivery.addItem")}
            </Button>
          </div>
        ) : (
          <div className="border rounded-md p-3 space-y-1 text-sm">
            {effectiveItems.length === 0 ? (
              <p className="text-muted-foreground">{t("delivery.selectSourceFirst")}</p>
            ) : (
              effectiveItems.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.description}</span>
                  <span className="text-muted-foreground">x{item.quantity}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>{t("delivery.notes")}</Label>
        <Textarea placeholder={t("delivery.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <Button className="w-full cursor-pointer" onClick={handleSubmit} disabled={submitting}>
        {submitting ? t("delivery.creating") : t("delivery.create")}
      </Button>
    </div>
  );
}
