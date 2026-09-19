/**
 * Print button components for documents.
 * Each button fetches full document details before printing.
 */
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { usePrintDocument } from "@/hooks/use-print-document.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

/** Print button for a single invoice */
export function PrintInvoiceButton({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const invoice = useQuery(api.invoicing.getInvoice, { id: invoiceId });
  const { printInvoice } = usePrintDocument();

  function handlePrint() {
    if (!invoice) return;
    printInvoice({
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      status: invoice.status,
      saleType: invoice.saleType,
      creditTerms: invoice.creditTerms,
      customerName: invoice.customerName ?? "Unknown",
      customerEmail: invoice.customerEmail ?? undefined,
      customerPhone: invoice.customerPhone ?? undefined,
      customerAddress: invoice.customerAddress ?? undefined,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      discount: invoice.discount,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      currency: invoice.currency,
      notes: invoice.notes,
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="cursor-pointer h-7 w-7 p-0"
      title="Print Invoice"
      onClick={handlePrint}
      disabled={!invoice}
    >
      <Printer className="h-3.5 w-3.5" />
    </Button>
  );
}

/** Print button for a single quotation */
export function PrintQuotationButton({ quotationId }: { quotationId: Id<"quotations"> }) {
  const quotation = useQuery(api.invoicing.getQuotation, { id: quotationId });
  const { printQuotation } = usePrintDocument();

  function handlePrint() {
    if (!quotation) return;
    printQuotation({
      quoteNumber: quotation.quoteNumber,
      date: quotation.date,
      validUntil: quotation.validUntil,
      status: quotation.status,
      customerName: quotation.customerName ?? "Unknown",
      customerEmail: quotation.customerEmail ?? undefined,
      customerPhone: quotation.customerPhone ?? undefined,
      customerAddress: quotation.customerAddress ?? undefined,
      items: quotation.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      discount: quotation.discount,
      totalAmount: quotation.totalAmount,
      currency: quotation.currency,
      notes: quotation.notes,
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="cursor-pointer h-7 w-7 p-0"
      title="Print Quotation"
      onClick={handlePrint}
      disabled={!quotation}
    >
      <Printer className="h-3.5 w-3.5" />
    </Button>
  );
}

/** Print button for a single purchase order */
export function PrintPurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: Id<"purchaseOrders"> }) {
  const po = useQuery(api.purchasing.getPurchaseOrder, { id: purchaseOrderId });
  const { printPurchaseOrder } = usePrintDocument();

  function handlePrint() {
    if (!po) return;
    printPurchaseOrder({
      poNumber: po.poNumber,
      date: po.date,
      expectedDelivery: po.expectedDelivery,
      status: po.status,
      vendorName: po.vendorName ?? "Unknown",
      vendorEmail: po.vendorEmail ?? undefined,
      vendorPhone: po.vendorPhone ?? undefined,
      vendorAddress: po.vendorAddress ?? undefined,
      items: po.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        receivedQuantity: item.receivedQuantity,
      })),
      subtotal: po.subtotal,
      taxRate: po.taxRate,
      taxAmount: po.taxAmount,
      discount: po.discount,
      shippingCost: po.shippingCost,
      totalAmount: po.totalAmount,
      paymentTerms: po.paymentTerms,
      notes: po.notes,
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="cursor-pointer h-7 w-7 p-0"
      title="Print Purchase Order"
      onClick={handlePrint}
      disabled={!po}
    >
      <Printer className="h-3.5 w-3.5" />
    </Button>
  );
}

/** Print button for a payment receipt */
export function PrintReceiptButton({ paymentId, currency }: { paymentId: Id<"payments">; currency?: string }) {
  const payment = useQuery(api.payments.getPayment, { id: paymentId });
  const { printReceipt } = usePrintDocument();

  function handlePrint() {
    if (!payment) return;
    printReceipt({
      paymentId: paymentId.slice(-8).toUpperCase(),
      date: payment.date,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      invoiceNumber: payment.invoiceNumber,
      customerName: payment.customerName,
      customerEmail: payment.customerEmail,
      customerPhone: payment.customerPhone,
      customerAddress: payment.customerAddress,
      currency,
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="cursor-pointer h-7 w-7 p-0"
      title="Print Receipt"
      onClick={handlePrint}
      disabled={!payment}
    >
      <Printer className="h-3.5 w-3.5" />
    </Button>
  );
}
