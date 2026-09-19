/**
 * Statement of Account queries for customers and vendors.
 * Generates opening balance, transaction list, running balance, and closing balance.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const getCustomerStatement = query({
  args: {
    customerId: v.id("customers"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    }

    // Get all invoices for this customer
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    // Get all payments related to customer invoices
    const customerInvoiceIds = new Set(allInvoices.map((inv) => inv._id));
    const allPayments = await ctx.db.query("payments").collect();
    const customerPayments = allPayments.filter(
      (p) => p.invoiceId && customerInvoiceIds.has(p.invoiceId)
    );

    // Get all credit memos for this customer
    const allCreditMemos = await ctx.db
      .query("creditMemos")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    // Calculate opening balance (sum of all transactions before startDate)
    let openingBalance = 0;

    for (const inv of allInvoices) {
      if (inv.date < args.startDate && inv.status !== "void" && inv.status !== "draft") {
        openingBalance += inv.totalAmount;
      }
    }
    for (const pmt of customerPayments) {
      if (pmt.date < args.startDate) {
        openingBalance -= pmt.amount;
      }
    }
    for (const cm of allCreditMemos) {
      if (cm.date < args.startDate && cm.status !== "void") {
        openingBalance -= cm.amount;
      }
    }

    // Build transactions within date range
    type Transaction = {
      date: string;
      type: "invoice" | "payment" | "credit_note";
      reference: string;
      description: string;
      debit: number;
      credit: number;
    };

    const transactions: Transaction[] = [];

    for (const inv of allInvoices) {
      if (inv.date >= args.startDate && inv.date <= args.endDate && inv.status !== "void" && inv.status !== "draft") {
        transactions.push({
          date: inv.date,
          type: "invoice",
          reference: inv.invoiceNumber,
          description: `Invoice ${inv.invoiceNumber}`,
          debit: inv.totalAmount,
          credit: 0,
        });
      }
    }

    for (const pmt of customerPayments) {
      if (pmt.date >= args.startDate && pmt.date <= args.endDate) {
        // Find the related invoice number
        const relatedInvoice = pmt.invoiceId ? allInvoices.find((i) => i._id === pmt.invoiceId) : null;
        const ref = pmt.reference || (relatedInvoice ? `PMT-${relatedInvoice.invoiceNumber}` : "Payment");
        transactions.push({
          date: pmt.date,
          type: "payment",
          reference: ref,
          description: `Payment received${relatedInvoice ? ` for ${relatedInvoice.invoiceNumber}` : ""}`,
          debit: 0,
          credit: pmt.amount,
        });
      }
    }

    for (const cm of allCreditMemos) {
      if (cm.date >= args.startDate && cm.date <= args.endDate && cm.status !== "void") {
        transactions.push({
          date: cm.date,
          type: "credit_note",
          reference: cm.memoNumber,
          description: `Credit Note: ${cm.reason}`,
          debit: 0,
          credit: cm.amount,
        });
      }
    }

    // Sort by date ascending
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate closing balance
    const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0);
    const closingBalance = openingBalance + totalDebits - totalCredits;

    return {
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
      startDate: args.startDate,
      endDate: args.endDate,
      openingBalance,
      transactions,
      totalDebits,
      totalCredits,
      closingBalance,
    };
  },
});

export const getVendorStatement = query({
  args: {
    vendorId: v.id("vendors"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      throw new ConvexError({ message: "Vendor not found", code: "NOT_FOUND" });
    }

    // Get all purchase orders for this vendor
    const allPOs = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    // Get all bills for this vendor
    const allBills = await ctx.db
      .query("bills")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    // Get all vendor credits
    const allCredits = await ctx.db
      .query("vendorCredits")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();

    // Calculate opening balance (amounts owed to vendor before startDate)
    let openingBalance = 0;

    // Bills represent what we owe; if paid before start date, net zero
    for (const bill of allBills) {
      const billDate = bill.dueDate; // Use due date for statement timing
      if (billDate < args.startDate) {
        if (bill.status === "unpaid" || bill.status === "overdue") {
          openingBalance += bill.amount;
        }
        // paid bills don't contribute to balance
      }
    }

    // POs that were received (received = liability created)
    for (const po of allPOs) {
      if (po.date < args.startDate && (po.status === "received" || po.status === "partially_received") && !po.linkedBillId) {
        openingBalance += po.totalAmount;
      }
    }

    for (const credit of allCredits) {
      if (credit.date < args.startDate && credit.status !== "void") {
        openingBalance -= credit.amount;
      }
    }

    // Build transactions within date range
    type Transaction = {
      date: string;
      type: "bill" | "payment" | "credit_note" | "purchase_order";
      reference: string;
      description: string;
      debit: number;
      credit: number;
    };

    const transactions: Transaction[] = [];

    // Bills in range (debit = what we owe)
    for (const bill of allBills) {
      if (bill.dueDate >= args.startDate && bill.dueDate <= args.endDate) {
        if (bill.status === "unpaid" || bill.status === "overdue") {
          transactions.push({
            date: bill.dueDate,
            type: "bill",
            reference: bill.title,
            description: `Bill: ${bill.title}`,
            debit: bill.amount,
            credit: 0,
          });
        } else if (bill.status === "paid") {
          // Bill was created and paid in period
          transactions.push({
            date: bill.dueDate,
            type: "bill",
            reference: bill.title,
            description: `Bill: ${bill.title}`,
            debit: bill.amount,
            credit: 0,
          });
          if (bill.paidAt && bill.paidAt >= args.startDate && bill.paidAt <= args.endDate) {
            transactions.push({
              date: bill.paidAt,
              type: "payment",
              reference: `PMT-${bill.title}`,
              description: `Payment for bill: ${bill.title}`,
              debit: 0,
              credit: bill.amount,
            });
          }
        }
      }
    }

    // Vendor credits in range
    for (const credit of allCredits) {
      if (credit.date >= args.startDate && credit.date <= args.endDate && credit.status !== "void") {
        transactions.push({
          date: credit.date,
          type: "credit_note",
          reference: credit.creditNumber,
          description: `Vendor Credit: ${credit.reason}`,
          debit: 0,
          credit: credit.amount,
        });
      }
    }

    // Sort by date ascending
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate closing balance
    const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0);
    const closingBalance = openingBalance + totalDebits - totalCredits;

    return {
      vendor: {
        name: vendor.name,
        contactName: vendor.contactName,
        email: vendor.email,
        phone: vendor.phone,
        address: vendor.address,
      },
      startDate: args.startDate,
      endDate: args.endDate,
      openingBalance,
      transactions,
      totalDebits,
      totalCredits,
      closingBalance,
    };
  },
});
