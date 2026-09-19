import { query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Customer portal queries - authenticated by customer email lookup
// No admin auth required - customers access their own data via email

export const lookupCustomer = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const customers = await ctx.db.query("customers").collect();
    const customer = customers.find(
      (c) => c.email?.toLowerCase() === args.email.toLowerCase()
    );
    if (!customer) {
      return null;
    }
    return {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      tier: customer.tier,
    };
  },
});

export const getCustomerInvoices = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    }

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    return invoices
      .filter((inv) => inv.status !== "draft" && inv.status !== "void")
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((inv) => ({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: inv.dueDate,
        status: inv.status,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        currency: inv.currency,
      }));
  },
});

export const getCustomerInvoiceDetail = query({
  args: { invoiceId: v.id("invoices"), customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.customerId !== args.customerId) {
      throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    }

    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
      .collect();

    return {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      status: invoice.status,
      saleType: invoice.saleType,
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      discount: invoice.discount,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      amountWrittenOff: invoice.amountWrittenOff,
      currency: invoice.currency,
      notes: invoice.notes,
      items: items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      payments: payments.map((p) => ({
        date: p.date,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
      })),
    };
  },
});

export const getCustomerOrders = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db.query("orders").order("desc").collect();
    const customerOrders = orders.filter(
      (o) => o.customerEmail.toLowerCase() === args.email.toLowerCase()
    );

    return customerOrders.map((order) => ({
      _id: order._id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      status: order.status,
      totalAmount: order.totalAmount,
    }));
  },
});

export const getCustomerOrderDetail = query({
  args: { orderId: v.id("orders"), email: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order || order.customerEmail.toLowerCase() !== args.email.toLowerCase()) {
      throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    }

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const itemsWithImages = [];
    for (const item of items) {
      let imageUrl: string | null = null;
      if (item.imageStorageId) {
        imageUrl = await ctx.storage.getUrl(item.imageStorageId);
      }
      itemsWithImages.push({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        imageUrl,
      });
    }

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      status: order.status,
      totalAmount: order.totalAmount,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      notes: order.notes,
      items: itemsWithImages,
    };
  },
});

export const getCustomerPaymentHistory = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    // Get all invoices for this customer
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    // Get payments for each invoice
    const allPayments = [];
    for (const inv of invoices) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_invoice", (q) => q.eq("invoiceId", inv._id))
        .collect();
      for (const p of payments) {
        allPayments.push({
          _id: p._id,
          date: p.date,
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          invoiceNumber: inv.invoiceNumber,
          invoiceId: inv._id,
        });
      }
    }

    return allPayments.sort((a, b) => b.date.localeCompare(a.date));
  },
});
