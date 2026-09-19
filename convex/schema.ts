import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatar: v.optional(v.string()),
    avatarStorageId: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("staff")),
    department: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    bio: v.optional(v.string()),
    address: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    signatureStorageId: v.optional(v.string()),
    timezone: v.optional(v.string()),
    preferredLanguage: v.optional(v.string()),
    notes: v.optional(v.string()),
    lastLoginAt: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_role", ["role"]),

  accessRules: defineTable({
    role: v.union(v.literal("manager"), v.literal("staff")),
    module: v.string(),
    canView: v.boolean(),
    canCreate: v.boolean(),
    canEdit: v.boolean(),
    canDelete: v.boolean(),
    updatedBy: v.id("users"),
  })
    .index("by_role", ["role"])
    .index("by_role_and_module", ["role", "module"]),

  activityLog: defineTable({
    userId: v.id("users"),
    action: v.string(),
    details: v.optional(v.string()),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    // M1.1: audit trail fields
    beforeValue: v.optional(v.string()),   // JSON.stringify of doc before mutation
    afterValue: v.optional(v.string()),    // JSON.stringify of doc after mutation
    reason: v.optional(v.string()),        // required for voids/deletes/reopens
    mutationName: v.optional(v.string()),  // e.g. "invoicing:voidInvoice"
  })
    .index("by_user", ["userId"])
    .index("by_resource_type", ["resourceType"]),

  vendors: defineTable({
    name: v.string(),
    companyName: v.optional(v.string()),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    fax: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    taxId: v.optional(v.string()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    creditLimit: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    openingBalance: v.optional(v.number()),
    openingBalanceDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    linkedCustomerId: v.optional(v.id("customers")),
  }),

  expenseCategories: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
  }),

  bills: defineTable({
    vendorId: v.id("vendors"),
    title: v.string(),
    amount: v.number(),
    amountPaid: v.optional(v.number()),
    // Date the bill was issued — the accounting date it posts on. Optional only
    // because bills created before this field existed do not have it; for those,
    // billPostingDate() in lib/payablesPosting.ts falls back to dueDate.
    billDate: v.optional(v.string()),
    // True for the bill that carries a vendor's opening balance (lib/openingBalances.ts).
    isOpeningBalance: v.optional(v.boolean()),
    dueDate: v.string(),
    status: v.union(v.literal("unpaid"), v.literal("paid"), v.literal("overdue"), v.literal("partially_paid"), v.literal("void")),
    notes: v.optional(v.string()),
    paidAt: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"]),

  billPayments: defineTable({
    billId: v.id("bills"),
    vendorId: v.id("vendors"),
    amount: v.number(),
    paymentDate: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("check"),
      v.literal("credit_card"),
      v.literal("vendor_credit"),
      v.literal("advance_settlement"),
      v.literal("other")
    ),
    referenceNumber: v.optional(v.string()),
    // Which account the payment came from
    bankAccountId: v.optional(v.id("bankAccounts")),
    // If payment uses vendor credit
    vendorCreditId: v.optional(v.id("vendorCredits")),
    // If payment uses advance settlement
    advancePaymentId: v.optional(v.id("advancePayments")),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_bill", ["billId"])
    .index("by_vendor", ["vendorId"])
    .index("by_date", ["paymentDate"]),

  billPaymentAllocations: defineTable({
    billId: v.id("bills"),
    journalEntryId: v.id("journalEntries"),
    amount: v.number(),
  })
    .index("by_bill", ["billId"])
    .index("by_entry", ["journalEntryId"]),

  goodsReceipts: defineTable({
    vendorId: v.id("vendors"),
    date: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.union(v.literal("without_bill"), v.literal("with_bill")),
    billId: v.optional(v.id("bills")),
    totalCost: v.number(),
    status: v.union(v.literal("received"), v.literal("cancelled")),
    receivedBy: v.id("users"),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"])
    .index("by_date", ["date"]),

  goodsReceiptItems: defineTable({
    receiptId: v.id("goodsReceipts"),
    productId: v.id("products"),
    productName: v.string(),
    quantity: v.number(),
    unitCost: v.number(),
    warehouseId: v.id("warehouses"),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_product", ["productId"]),

  expenses: defineTable({
    title: v.string(),
    amount: v.number(),
    categoryId: v.optional(v.id("expenseCategories")),
    vendorId: v.optional(v.id("vendors")),
    date: v.string(),
    notes: v.optional(v.string()),
    recordedBy: v.id("users"),
    journalEntryId: v.optional(v.id("journalEntries")),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_category", ["categoryId"]),

  // ─── Billable Expenses ─────────────────────────────────────
  billableExpenses: defineTable({
    description: v.string(),
    amount: v.number(),
    date: v.string(),
    customerId: v.id("customers"),
    projectId: v.optional(v.id("projects")),
    categoryId: v.optional(v.id("expenseCategories")),
    vendorId: v.optional(v.id("vendors")),
    receiptStorageId: v.optional(v.id("_storage")),
    markup: v.number(), // Markup percentage (0 = at cost)
    billedAmount: v.number(), // amount * (1 + markup/100)
    status: v.union(
      v.literal("unbilled"),
      v.literal("billed"),
      v.literal("paid")
    ),
    invoiceId: v.optional(v.id("invoices")),
    notes: v.optional(v.string()),
    recordedBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_invoice", ["invoiceId"]),

  warehouses: defineTable({
    name: v.string(),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    branchId: v.optional(v.id("branches")),
  }).index("by_branch", ["branchId"]),

  categories: defineTable({
    name: v.string(),
    type: v.union(v.literal("product"), v.literal("service"), v.literal("both")),
    color: v.optional(v.string()),
  }),

  products: defineTable({
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    type: v.union(v.literal("product"), v.literal("service")),
    unitPrice: v.number(),
    costPrice: v.optional(v.number()),
    valuationMethod: v.optional(v.union(
      v.literal("fifo"),
      v.literal("lifo"),
      v.literal("weighted_average")
    )),
    classId: v.optional(v.id("inventoryClasses")),
    unit: v.optional(v.string()),
    unitGroupId: v.optional(v.id("unitGroups")),
    purchaseUnit: v.optional(v.string()),
    sellingUnit: v.optional(v.string()),
    lowStockThreshold: v.optional(v.number()),
    reorderPoint: v.optional(v.number()),
    preferredVendorId: v.optional(v.id("vendors")),
    incomeAccountId: v.optional(v.id("accounts")),
    expenseAccountId: v.optional(v.id("accounts")),
    assetAccountId: v.optional(v.id("accounts")),
    openingStock: v.optional(v.number()),
    openingStockValue: v.optional(v.number()),
    openingStockDate: v.optional(v.string()),
    openingStockWarehouseId: v.optional(v.id("warehouses")),
    isActive: v.boolean(),
    images: v.optional(v.array(v.id("_storage"))),
  })
    .index("by_category", ["categoryId"])
    .index("by_type", ["type"])
    .index("by_class", ["classId"]),

  inventory: defineTable({
    productId: v.id("products"),
    warehouseId: v.id("warehouses"),
    quantity: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_warehouse", ["warehouseId"])
    .index("by_product_and_warehouse", ["productId", "warehouseId"]),

  customers: defineTable({
    name: v.string(),
    companyName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    mobile: v.optional(v.string()),
    fax: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    taxId: v.optional(v.string()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    // creditLimit: null/undefined = no credit limit (no restriction — same invariant as
    // closingDate.ts: absence of a restriction is not a restriction).
    creditLimit: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    openingBalance: v.optional(v.number()),
    openingBalanceDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    tier: v.optional(v.union(
      v.literal("retail"),
      v.literal("wholesale"),
      v.literal("vip"),
      v.literal("distributor")
    )),
    isActive: v.optional(v.boolean()),
    linkedVendorId: v.optional(v.id("vendors")),
    // Credit control status. null/undefined = active (no restriction).
    creditStatus: v.optional(v.union(
      v.literal("active"),
      v.literal("watch"),
      v.literal("hold"),
      v.literal("blacklisted"),
    )),
    creditStatusReason: v.optional(v.string()),
    creditStatusChangedAt: v.optional(v.string()),   // ISO date string
    // Per-customer threshold overrides. null/undefined = inherit company default
    // from creditControlSettings. DIFFERENT meaning from creditLimit=null above.
    // Units: DAYS (months are displayed in UI only, stored as days).
    doubtfulOverrideDays: v.optional(v.number()),
    blacklistOverrideDays: v.optional(v.number()),
    writeOffOverrideDays: v.optional(v.number()),
  }),

  sales: defineTable({
    customerId: v.optional(v.id("customers")),
    customerName: v.optional(v.string()),
    date: v.string(),
    status: v.union(v.literal("completed"), v.literal("refunded"), v.literal("pending")),
    notes: v.optional(v.string()),
    totalAmount: v.number(),
    recordedBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  saleItems: defineTable({
    saleId: v.id("sales"),
    productId: v.id("products"),
    productName: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
  }).index("by_sale", ["saleId"]),

  vehicles: defineTable({
    make: v.string(),
    model: v.string(),
    year: v.number(),
    plate: v.string(),
    vin: v.optional(v.string()),
    color: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("in_maintenance"), v.literal("retired")),
    notes: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    purchasePrice: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
  }).index("by_status", ["status"]),

  maintenanceLogs: defineTable({
    vehicleId: v.id("vehicles"),
    date: v.string(),
    description: v.string(),
    cost: v.optional(v.number()),
    mileageAtService: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    notes: v.optional(v.string()),
    recordedBy: v.id("users"),
  }).index("by_vehicle", ["vehicleId"]),

  fuelLogs: defineTable({
    vehicleId: v.id("vehicles"),
    date: v.string(),
    liters: v.number(),
    costPerLiter: v.number(),
    totalCost: v.number(),
    mileage: v.optional(v.number()),
    notes: v.optional(v.string()),
    recordedBy: v.id("users"),
  }).index("by_vehicle", ["vehicleId"]),

  assetCategories: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    accountCode: v.optional(v.string()),
  }),

  assets: defineTable({
    name: v.string(),
    categoryId: v.optional(v.id("assetCategories")),
    accountCode: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    currentValue: v.optional(v.number()),
    condition: v.union(
      v.literal("excellent"),
      v.literal("good"),
      v.literal("fair"),
      v.literal("poor")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("under_repair"),
      v.literal("disposed")
    ),
    assignedTo: v.optional(v.id("users")),
    warehouseId: v.optional(v.id("warehouses")),
    notes: v.optional(v.string()),
    // Depreciation fields
    depreciationMethod: v.optional(v.union(
      v.literal("straight_line"),
      v.literal("declining_balance"),
      v.literal("none")
    )),
    usefulLifeYears: v.optional(v.number()),
    salvageValue: v.optional(v.number()),
    depreciationRate: v.optional(v.number()),
    depreciationStartDate: v.optional(v.string()),
  })
    .index("by_category", ["categoryId"])
    .index("by_status", ["status"]),

  assetLogs: defineTable({
    assetId: v.id("assets"),
    date: v.string(),
    type: v.union(v.literal("maintenance"), v.literal("note"), v.literal("repair")),
    description: v.string(),
    cost: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    recordedBy: v.id("users"),
  }).index("by_asset", ["assetId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("low_stock"),
      v.literal("overdue_bill"),
      v.literal("bill_due_soon"),
      v.literal("vehicle_maintenance"),
      v.literal("asset_condition"),
      v.literal("general")
    ),
    title: v.string(),
    message: v.string(),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    isRead: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_read", ["userId", "isRead"]),

  orders: defineTable({
    orderNumber: v.string(),
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("processing"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    totalAmount: v.number(),
    notes: v.optional(v.string()),
    orderDate: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_order_number", ["orderNumber"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    productId: v.id("products"),
    productName: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
    imageStorageId: v.optional(v.id("_storage")),
  }).index("by_order", ["orderId"]),

  // Payroll
  employees: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    position: v.optional(v.string()),
    employeeId: v.string(),
    hireDate: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    branchId: v.optional(v.id("branches")),
    userId: v.optional(v.id("users")),
    baseSalary: v.number(),
    housingAllowance: v.optional(v.number()),
    transportAllowance: v.optional(v.number()),
    otherAllowances: v.optional(v.number()),
    currency: v.string(),
    payFrequency: v.union(
      v.literal("monthly"),
      v.literal("biweekly"),
      v.literal("weekly")
    ),
    bankName: v.optional(v.string()),
    bankAccount: v.optional(v.string()),
    routingNumber: v.optional(v.string()),
    taxId: v.optional(v.string()),
    nationality: v.optional(v.string()),
    country: v.optional(v.union(
      v.literal("QA"),
      v.literal("AE"),
      v.literal("SA"),
      v.literal("PK"),
      v.literal("IN"),
      v.literal("BH"),
      v.literal("KW"),
      v.literal("OM"),
      v.literal("EG"),
      v.literal("JO"),
      v.literal("US"),
      v.literal("CA")
    )),
    passportNumber: v.optional(v.string()),
    qidNumber: v.optional(v.string()), // Primary ID (QID/Emirates ID/Iqama/CNIC/Aadhaar)
    secondaryId: v.optional(v.string()), // Secondary ID (Health Card/Labour Card/GOSI/EOBI/PAN)
    tertiaryId: v.optional(v.string()), // Tertiary ID (UAN for India)
    // Leave balances (days)
    annualLeaveBalance: v.optional(v.number()),
    sickLeaveBalance: v.optional(v.number()),
    unpaidLeaveTaken: v.optional(v.number()),
    // Social insurance
    socialInsuranceEnabled: v.optional(v.boolean()),
    socialInsuranceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_department", ["department"])
    .index("by_employee_id", ["employeeId"]),

  payrollRuns: defineTable({
    title: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    payDate: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("paid"),
      v.literal("voided")
    ),
    totalAmount: v.number(),
    employeeCount: v.number(),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    /** Ledger account ID (chart of accounts) used for the payment entry.
     *  Required when transitioning to "paid". Set at payment time, not at run creation. */
    paymentAccountId: v.optional(v.id("accounts")),
  }).index("by_status", ["status"]),

  payslips: defineTable({
    payrollRunId: v.id("payrollRuns"),
    employeeId: v.id("employees"),
    baseSalary: v.number(),
    housingAllowance: v.optional(v.number()),
    transportAllowance: v.optional(v.number()),
    otherAllowances: v.optional(v.number()),
    overtimeHours: v.optional(v.number()),
    overtimeRate: v.optional(v.number()),
    overtimeAmount: v.optional(v.number()),
    allowances: v.number(),
    deductions: v.number(),
    netPay: v.number(),
    allowanceDetails: v.optional(v.string()),
    deductionDetails: v.optional(v.string()),
    // Social insurance fields
    socialInsuranceEmployee: v.optional(v.number()),
    socialInsuranceEmployer: v.optional(v.number()),
    socialInsuranceDetails: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_payroll_run", ["payrollRunId"])
    .index("by_employee", ["employeeId"]),

  /**
   * One row per periodic gratuity accrual run.
   * Used as the sourceId for GRATUITY_ACCRUAL_SOURCE journal entries so
   * individual accrual runs can be reversed via reverseEntriesForSource.
   */
  gratuityAccrualRuns: defineTable({
    asOfDate: v.string(),
    status: v.union(v.literal("posted"), v.literal("voided")),
    employeeCount: v.number(),
    totalAccrued: v.number(),
    createdBy: v.id("users"),
  }).index("by_status", ["status"]),

  leaveRecords: defineTable({
    employeeId: v.id("employees"),
    type: v.union(
      v.literal("annual"),
      v.literal("sick"),
      v.literal("unpaid"),
      v.literal("emergency")
    ),
    startDate: v.string(),
    endDate: v.string(),
    days: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reason: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"]),

  // ─── Employee Benefits ──────────────────────────────────────
  employeeBenefits: defineTable({
    employeeId: v.id("employees"),
    type: v.union(
      v.literal("medical_insurance"),
      v.literal("life_insurance"),
      v.literal("dental"),
      v.literal("vision"),
      v.literal("housing_benefit"),
      v.literal("education"),
      v.literal("travel"),
      v.literal("other")
    ),
    provider: v.optional(v.string()),
    policyNumber: v.optional(v.string()),
    coverageAmount: v.optional(v.number()),
    monthlyPremium: v.optional(v.number()),
    companyContribution: v.optional(v.number()), // percentage
    employeeContribution: v.optional(v.number()), // percentage
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("cancelled")),
    notes: v.optional(v.string()),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"]),

  // ─── Payroll Tax Declarations ───────────────────────────────
  payrollTaxDeclarations: defineTable({
    title: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    totalGrossPay: v.number(),
    totalTaxable: v.number(),
    totalTaxWithheld: v.number(),
    totalSocialSecurity: v.number(),
    employeeCount: v.number(),
    status: v.union(v.literal("draft"), v.literal("filed"), v.literal("amended")),
    filedDate: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_status", ["status"]),

  // ─── Cheque Vouchers ────────────────────────────────────────
  chequeVouchers: defineTable({
    voucherNumber: v.string(),
    payrollRunId: v.optional(v.id("payrollRuns")),
    employeeId: v.optional(v.id("employees")),
    payeeName: v.string(),
    amount: v.number(),
    amountInWords: v.string(),
    bankName: v.string(),
    chequeNumber: v.optional(v.string()),
    date: v.string(),
    memo: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("printed"), v.literal("cleared"), v.literal("void")),
    createdBy: v.id("users"),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"])
    .index("by_payroll_run", ["payrollRunId"]),

  stockMovements: defineTable({
    productId: v.id("products"),
    warehouseId: v.id("warehouses"),
    type: v.union(v.literal("in"), v.literal("out")),
    quantity: v.number(),
    costPerUnit: v.optional(v.number()),
    reason: v.union(
      v.literal("purchase"),
      v.literal("sale"),
      v.literal("return"),
      v.literal("transfer"),
      v.literal("adjustment"),
      v.literal("damage"),
      v.literal("other")
    ),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    classId: v.optional(v.id("inventoryClasses")),
    recordedBy: v.id("users"),
    timestamp: v.string(),
  })
    .index("by_product", ["productId"])
    .index("by_warehouse", ["warehouseId"])
    .index("by_type", ["type"])
    .index("by_class", ["classId"]),

  // ─── Advanced Inventory & Assembly ──────────────────────────

  warehouseBins: defineTable({
    warehouseId: v.id("warehouses"),
    zone: v.optional(v.string()),
    row: v.optional(v.string()),
    shelf: v.optional(v.string()),
    bin: v.string(),
    label: v.string(),
    isActive: v.boolean(),
  })
    .index("by_warehouse", ["warehouseId"]),

  lotNumbers: defineTable({
    productId: v.id("products"),
    lotNumber: v.string(),
    serialNumber: v.optional(v.string()),
    warehouseId: v.id("warehouses"),
    binId: v.optional(v.id("warehouseBins")),
    quantity: v.number(),
    costPerUnit: v.optional(v.number()),
    manufacturedDate: v.optional(v.string()),
    expiryDate: v.optional(v.string()),
    receivedDate: v.string(),
    status: v.union(v.literal("available"), v.literal("reserved"), v.literal("expired"), v.literal("consumed")),
    notes: v.optional(v.string()),
  })
    .index("by_product", ["productId"])
    .index("by_lot", ["lotNumber"])
    .index("by_warehouse", ["warehouseId"])
    .index("by_status", ["status"]),

  assemblies: defineTable({
    name: v.string(),
    sku: v.optional(v.string()),
    description: v.optional(v.string()),
    outputProductId: v.id("products"),
    outputQuantity: v.number(),
    laborCost: v.optional(v.number()),
    overheadCost: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_output_product", ["outputProductId"]),

  assemblyComponents: defineTable({
    assemblyId: v.id("assemblies"),
    componentProductId: v.id("products"),
    quantityRequired: v.number(),
    isOptional: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_assembly", ["assemblyId"])
    .index("by_component", ["componentProductId"]),

  assemblyOrders: defineTable({
    assemblyId: v.id("assemblies"),
    orderNumber: v.string(),
    quantity: v.number(),
    warehouseId: v.id("warehouses"),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_assembly", ["assemblyId"])
    .index("by_status", ["status"]),

  cycleCounts: defineTable({
    warehouseId: v.id("warehouses"),
    countNumber: v.string(),
    status: v.union(v.literal("planned"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled")),
    scheduledDate: v.string(),
    completedDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_warehouse", ["warehouseId"])
    .index("by_status", ["status"]),

  cycleCountItems: defineTable({
    cycleCountId: v.id("cycleCounts"),
    productId: v.id("products"),
    expectedQuantity: v.number(),
    countedQuantity: v.optional(v.number()),
    variance: v.optional(v.number()),
    countedBy: v.optional(v.id("users")),
    countedAt: v.optional(v.string()),
  })
    .index("by_cycle_count", ["cycleCountId"])
    .index("by_product", ["productId"]),

  // ─── Advanced Pricing ─────────────────────────────────────────

  priceLists: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    tier: v.optional(v.union(
      v.literal("retail"),
      v.literal("wholesale"),
      v.literal("vip"),
      v.literal("distributor")
    )),
    currency: v.optional(v.string()),
    isDefault: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_tier", ["tier"])
    .index("by_active", ["isActive"]),

  priceListItems: defineTable({
    priceListId: v.id("priceLists"),
    productId: v.id("products"),
    unitPrice: v.number(),
    minQuantity: v.optional(v.number()),
  })
    .index("by_price_list", ["priceListId"])
    .index("by_product", ["productId"]),

  quantityDiscounts: defineTable({
    name: v.string(),
    productId: v.optional(v.id("products")),
    categoryId: v.optional(v.id("categories")),
    minQuantity: v.number(),
    maxQuantity: v.optional(v.number()),
    discountType: v.union(v.literal("percentage"), v.literal("fixed")),
    discountValue: v.number(),
    isActive: v.boolean(),
  })
    .index("by_product", ["productId"])
    .index("by_category", ["categoryId"])
    .index("by_active", ["isActive"]),

  promotions: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    discountType: v.union(v.literal("percentage"), v.literal("fixed"), v.literal("buy_x_get_y")),
    discountValue: v.number(),
    buyQuantity: v.optional(v.number()),
    getQuantity: v.optional(v.number()),
    productId: v.optional(v.id("products")),
    categoryId: v.optional(v.id("categories")),
    tier: v.optional(v.union(
      v.literal("retail"),
      v.literal("wholesale"),
      v.literal("vip"),
      v.literal("distributor")
    )),
    startDate: v.string(),
    endDate: v.string(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("by_product", ["productId"])
    .index("by_active", ["isActive"]),

  scheduledPriceChanges: defineTable({
    productId: v.id("products"),
    newPrice: v.number(),
    effectiveDate: v.string(),
    reason: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("applied"), v.literal("cancelled")),
    createdBy: v.id("users"),
  })
    .index("by_product", ["productId"])
    .index("by_status", ["status"]),

  // ─── Chart of Accounts & General Ledger ───────────────────
  accounts: defineTable({
    code: v.string(),
    name: v.string(),
    type: v.union(
      // Balance Sheet - Asset types
      v.literal("bank"),
      v.literal("accounts_receivable"),
      v.literal("other_current_asset"),
      v.literal("fixed_asset"),
      v.literal("other_asset"),
      v.literal("asset"), // legacy
      // Balance Sheet - Liability types
      v.literal("accounts_payable"),
      v.literal("credit_card"),
      v.literal("other_current_liability"),
      v.literal("long_term_liability"),
      v.literal("loan"),
      v.literal("liability"), // legacy
      // Balance Sheet - Equity
      v.literal("equity"),
      // Income & Expense
      v.literal("income"),
      v.literal("other_income"),
      v.literal("cost_of_goods_sold"),
      v.literal("expense"),
      v.literal("other_expense"),
      v.literal("revenue") // legacy (same as income)
    ),
    subType: v.optional(v.string()),
    parentId: v.optional(v.id("accounts")),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    balance: v.number(),
    normalSide: v.union(v.literal("debit"), v.literal("credit")),
    // When set, this account has been merged into another. All new transactions
    // should route to replacedBy instead of this account.
    replacedBy: v.optional(v.id("accounts")),
  })
    .index("by_code", ["code"])
    .index("by_type", ["type"])
    .index("by_parent", ["parentId"])
    .index("by_replaced_by", ["replacedBy"]),

  journalEntries: defineTable({
    entryNumber: v.string(),
    date: v.string(),
    description: v.string(),
    reference: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("posted"),
      v.literal("void")
    ),
    totalDebit: v.number(),
    totalCredit: v.number(),
    createdBy: v.id("users"),
    postedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Source document that generated this entry (for automatic reversals).
    // IMPORTANT: sourceType is ALWAYS one of the exported *_SOURCE constants —
    // never a hand-typed literal. See: INVOICE_SALE_SOURCE (invoicing.ts),
    // SALE_SOURCE (sales.ts), BILL_SOURCE / GOODS_RECEIPT_SOURCE (lib/payablesPosting.ts),
    // OPENING_BALANCES_SOURCE (reconcileOpeningBalances.ts).
    // The bug that caused "invoice" to be used instead of "invoice_sale" originated
    // from the old comment here — do not introduce new string literals.
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_date", ["date"])
    .index("by_entry_number", ["entryNumber"])
    .index("by_source", ["sourceType", "sourceId"]),

  journalLines: defineTable({
    journalEntryId: v.id("journalEntries"),
    accountId: v.id("accounts"),
    debit: v.number(),
    credit: v.number(),
    description: v.optional(v.string()),
    // Denormalized from the parent journalEntry for indexed period queries.
    // Optional so pre-backfill rows stay valid. Never overwrite if already set.
    date: v.optional(v.string()),
    status: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    customerId: v.optional(v.id("customers")),
    billedAt: v.optional(v.string()),
  })
    .index("by_journal_entry", ["journalEntryId"])
    .index("by_account", ["accountId"])
    .index("by_status_and_date", ["status", "date"])
    .index("by_account_and_date", ["accountId", "date"]),

  fiscalPeriods: defineTable({
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("locked")
    ),
    closedAt: v.optional(v.string()),
    closedBy: v.optional(v.id("users")),
    // Set when a locked (externally reported) period is reopened.
    // Stays true until the period is locked again.
    // Visible as a red flag in the Reconciliation Panel.
    reopenedSinceReport: v.optional(v.boolean()),
  })
    .index("by_status", ["status"])
    .index("by_start_date", ["startDate"]),

  // ─── Multi-Currency ────────────────────────────────────────
  currencies: defineTable({
    code: v.string(),
    name: v.string(),
    symbol: v.string(),
    decimalPlaces: v.number(),
    isBase: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_is_base", ["isBase"]),

  exchangeRates: defineTable({
    fromCurrency: v.string(),
    toCurrency: v.string(),
    rate: v.number(),
    date: v.string(),
    source: v.union(v.literal("manual"), v.literal("api")),
  })
    .index("by_pair_and_date", ["fromCurrency", "toCurrency", "date"])
    .index("by_date", ["date"]),

  // ─── Bank Accounts & Reconciliation ────────────────────────
  bankAccounts: defineTable({
    name: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
    currency: v.string(),
    accountType: v.union(
      v.literal("checking"),
      v.literal("savings"),
      v.literal("credit_card"),
      v.literal("cash")
    ),
    ledgerAccountId: v.optional(v.id("accounts")),
    currentBalance: v.number(),
    isActive: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index("by_currency", ["currency"]),

  bankTransactions: defineTable({
    bankAccountId: v.optional(v.id("bankAccounts")),
    accountId: v.optional(v.id("accounts")),
    date: v.string(),
    description: v.string(),
    amount: v.number(),
    type: v.union(v.literal("debit"), v.literal("credit")),
    reference: v.optional(v.string()),
    category: v.optional(v.string()),
    isReconciled: v.boolean(),
    matchedJournalEntryId: v.optional(v.id("journalEntries")),
    importBatchId: v.optional(v.string()),
  })
    .index("by_bank_account", ["bankAccountId"])
    .index("by_account", ["accountId"])
    .index("by_reconciled", ["isReconciled"])
    .index("by_bank_account_and_date", ["bankAccountId", "date"])
    .index("by_account_and_date", ["accountId", "date"]),

  reconciliationSessions: defineTable({
    bankAccountId: v.optional(v.id("bankAccounts")),
    accountId: v.optional(v.id("accounts")),
    statementDate: v.string(),
    statementBalance: v.number(),
    bookBalance: v.number(),
    clearedBalance: v.number(),
    difference: v.number(),
    transactionCount: v.number(),
    status: v.union(v.literal("completed"), v.literal("in_progress")),
    completedAt: v.optional(v.string()),
    completedBy: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  })
    .index("by_bank_account", ["bankAccountId"])
    .index("by_account", ["accountId"])
    .index("by_status", ["status"]),

  // ─── Batch Deposits ─────────────────────────────────────────
  batchDeposits: defineTable({
    depositNumber: v.string(),
    bankAccountId: v.optional(v.id("bankAccounts")),
    accountId: v.optional(v.id("accounts")),
    date: v.string(),
    paymentIds: v.array(v.id("payments")),
    totalAmount: v.number(),
    paymentCount: v.number(),
    memo: v.optional(v.string()),
    status: v.union(v.literal("completed"), v.literal("void")),
    createdBy: v.id("users"),
  })
    .index("by_bank_account", ["bankAccountId"])
    .index("by_date", ["date"]),

  // ─── Invoicing, Quotations & Credit Sales ─────────────────
  invoices: defineTable({
    invoiceNumber: v.string(),
    customerId: v.id("customers"),
    date: v.string(),
    dueDate: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("paid"),
      v.literal("partially_paid"),
      v.literal("overdue"),
      v.literal("void"),
      // A credit invoice where the remaining balance (totalAmount - amountPaid - amountWrittenOff)
      // was extinguished by a bad-debt write-off, not by cash receipt.
      // Distinct from "paid" — written_off means the money never arrived.
      // Collection reports, customer history, and management accounts must not
      // treat written_off as a successful collection.
      // NOTE: "overdue" → "written_off" transition: writeOffBadDebt handles this.
      // A future task should compute "overdue" dynamically from dueDate rather than
      // storing it — stored "overdue" can stale. For now, writeOffBadDebt resets
      // overdue→written_off as a side-effect. See comment in that mutation.
      v.literal("written_off")
    ),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90")
    )),
    subtotal: v.number(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    discount: v.optional(v.number()),
    totalAmount: v.number(),
    amountPaid: v.number(),
    // Running total of bad-debt write-offs applied to this invoice.
    // Outstanding balance = totalAmount - amountPaid - (amountWrittenOff ?? 0).
    // This is the arithmetic definition used by getOutstandingBalance and the
    // credit gate. Do not define "outstanding" by status — that cannot handle
    // partial write-offs correctly.
    amountWrittenOff: v.optional(v.number()),
    // Non-write-off review decisions. No GL effect. Used by the Bad Debt Review screen
    // to suppress already-reviewed invoices until the deferral expires.
    //   deferred       = owner said "give more time" (deferredUntil required)
    //   in_litigation  = in dispute / legal (auto-deferred 30 days)
    //   payment_promised = customer has promised payment (auto-deferred 30 days)
    writeOffReviewStatus: v.optional(v.union(
      v.literal("deferred"),
      v.literal("in_litigation"),
      v.literal("payment_promised")
    )),
    writeOffReviewDeferredUntil: v.optional(v.string()), // ISO date string
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    fromQuotationId: v.optional(v.id("quotations")),
    projectId: v.optional(v.id("projects")),
    // True for the invoice that carries a customer's opening balance
    // (lib/openingBalances.ts). It posts to Opening Balance Equity, never revenue.
    isOpeningBalance: v.optional(v.boolean()),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"])
    .index("by_project", ["projectId"]),

  invoiceItems: defineTable({
    invoiceId: v.id("invoices"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
  }).index("by_invoice", ["invoiceId"]),

  quotations: defineTable({
    quoteNumber: v.string(),
    customerId: v.id("customers"),
    date: v.string(),
    validUntil: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    subtotal: v.number(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    discount: v.optional(v.number()),
    totalAmount: v.number(),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  quotationItems: defineTable({
    quotationId: v.id("quotations"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
  }).index("by_quotation", ["quotationId"]),

  salesOrders: defineTable({
    orderNumber: v.string(),
    customerId: v.id("customers"),
    date: v.string(),
    expectedDelivery: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("confirmed"),
      v.literal("partially_fulfilled"),
      v.literal("fulfilled"),
      v.literal("invoiced"),
      v.literal("cancelled")
    ),
    subtotal: v.number(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    discount: v.optional(v.number()),
    totalAmount: v.number(),
    invoicedAmount: v.number(),
    fulfilledPercentage: v.number(),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    fromQuotationId: v.optional(v.id("quotations")),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  salesOrderItems: defineTable({
    salesOrderId: v.id("salesOrders"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    fulfilledQty: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
  }).index("by_sales_order", ["salesOrderId"]),

  payments: defineTable({
    invoiceId: v.optional(v.id("invoices")),
    saleId: v.optional(v.id("sales")),
    date: v.string(),
    amount: v.number(),
    method: v.union(
      v.literal("cash"),
      v.literal("credit_card"),
      v.literal("debit_card"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("paypal"),
      v.literal("mobile_pay"),
      v.literal("store_credit"),
      v.literal("advance_settlement"),
      v.literal("other")
    ),
    reference: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    // Which account the payment goes into
    bankAccountId: v.optional(v.id("bankAccounts")),
    // Real Chart-of-Accounts cash/bank account the money moved into (unified accounts)
    accountId: v.optional(v.id("accounts")),
    // If payment uses customer advance settlement
    advancePaymentId: v.optional(v.id("advancePayments")),
    notes: v.optional(v.string()),
    recordedBy: v.id("users"),
  })
    .index("by_invoice", ["invoiceId"])
    .index("by_sale", ["saleId"])
    .index("by_method", ["method"]),

  paymentMethods: defineTable({
    name: v.string(),
    code: v.union(
      v.literal("cash"),
      v.literal("credit_card"),
      v.literal("debit_card"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("paypal"),
      v.literal("mobile_pay"),
      v.literal("store_credit"),
      v.literal("other")
    ),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    requiresReference: v.boolean(),
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    settings: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  paymentPlans: defineTable({
    invoiceId: v.id("invoices"),
    customerId: v.id("customers"),
    totalAmount: v.number(),
    installments: v.number(),
    frequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly")
    ),
    startDate: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("defaulted"),
      v.literal("cancelled")
    ),
    paidInstallments: v.number(),
    nextDueDate: v.string(),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_invoice", ["invoiceId"])
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  creditMemos: defineTable({
    memoNumber: v.string(),
    customerId: v.id("customers"),
    invoiceId: v.optional(v.id("invoices")),
    date: v.string(),
    amount: v.number(),
    reason: v.string(),
    status: v.union(v.literal("active"), v.literal("applied"), v.literal("void")),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"]),

  // ─── Returns / RMA ─────────────────────────────────────────
  returns: defineTable({
    returnNumber: v.string(),
    customerId: v.id("customers"),
    invoiceId: v.optional(v.id("invoices")),
    date: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("received"),
      v.literal("restocked"),
      v.literal("refunded"),
      v.literal("rejected")
    ),
    reason: v.string(),
    notes: v.optional(v.string()),
    totalAmount: v.number(),
    refundAmount: v.number(),
    restockingFee: v.number(),
    creditMemoId: v.optional(v.id("creditMemos")),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_invoice", ["invoiceId"]),

  returnItems: defineTable({
    returnId: v.id("returns"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
    restocked: v.boolean(),
    warehouseId: v.optional(v.id("warehouses")),
    condition: v.union(
      v.literal("new"),
      v.literal("like_new"),
      v.literal("damaged"),
      v.literal("defective")
    ),
  }).index("by_return", ["returnId"]),

  // ─── Landed Cost ───────────────────────────────────────────
  landedCosts: defineTable({
    lcNumber: v.string(),
    purchaseOrderId: v.id("purchaseOrders"),
    date: v.string(),
    shippingCost: v.number(),
    customsDuty: v.number(),
    insuranceCost: v.number(),
    handlingCost: v.number(),
    otherCosts: v.number(),
    totalLandedCost: v.number(),
    allocationMethod: v.union(
      v.literal("by_value"),
      v.literal("by_quantity"),
      v.literal("by_weight"),
      v.literal("equal")
    ),
    notes: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("applied")),
    createdBy: v.id("users"),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_status", ["status"]),

  landedCostAllocations: defineTable({
    landedCostId: v.id("landedCosts"),
    purchaseOrderItemId: v.id("purchaseOrderItems"),
    productId: v.optional(v.id("products")),
    allocatedAmount: v.number(),
    originalCost: v.number(),
    newUnitCost: v.number(),
  }).index("by_landed_cost", ["landedCostId"]),

  // ─── Purchase Orders & AP ─────────────────────────────────
  purchaseOrders: defineTable({
    poNumber: v.string(),
    vendorId: v.id("vendors"),
    date: v.string(),
    expectedDelivery: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("partially_received"),
      v.literal("received"),
      v.literal("cancelled")
    ),
    subtotal: v.number(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    discount: v.optional(v.number()),
    totalAmount: v.number(),
    shippingCost: v.optional(v.number()),
    paymentTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90"),
      v.literal("due_on_receipt"),
      v.literal("prepaid")
    )),
    notes: v.optional(v.string()),
    linkedBillId: v.optional(v.id("bills")),
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.string()),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"]),

  purchaseOrderItems: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    receivedQuantity: v.number(),
    unitPrice: v.number(),
    subtotal: v.number(),
  }).index("by_purchase_order", ["purchaseOrderId"]),

  vendorCredits: defineTable({
    creditNumber: v.string(),
    vendorId: v.id("vendors"),
    date: v.string(),
    amount: v.number(),
    reason: v.string(),
    status: v.union(v.literal("active"), v.literal("applied"), v.literal("void")),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    createdBy: v.id("users"),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"]),

  advancePayments: defineTable({
    // "vendor" = we pay vendor in advance; "customer" = customer pays us in advance
    direction: v.union(v.literal("vendor"), v.literal("customer")),
    vendorId: v.optional(v.id("vendors")),
    customerId: v.optional(v.id("customers")),
    date: v.string(),
    amount: v.number(),
    settledAmount: v.number(), // How much has been settled against bills/invoices
    method: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("credit_card"),
      v.literal("mobile_pay"),
      v.literal("other")
    ),
    bankAccountId: v.optional(v.id("bankAccounts")), // Legacy - deprecated
    accountId: v.optional(v.id("accounts")), // Which account the money came from/to
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("partially_settled"), v.literal("settled"), v.literal("refunded")),
    createdBy: v.id("users"),
  })
    .index("by_vendor", ["vendorId"])
    .index("by_customer", ["customerId"])
    .index("by_direction", ["direction"])
    .index("by_status", ["status"]),

  advanceSettlements: defineTable({
    advanceId: v.id("advancePayments"),
    // Link to bill (vendor) or invoice (customer)
    billId: v.optional(v.id("bills")),
    invoiceId: v.optional(v.id("invoices")),
    goodsReceiptId: v.optional(v.id("goodsReceipts")),
    amount: v.number(),
    date: v.string(),
    notes: v.optional(v.string()),
    settledBy: v.id("users"),
  })
    .index("by_advance", ["advanceId"])
    .index("by_bill", ["billId"])
    .index("by_invoice", ["invoiceId"]),

  // ── Communication & Document Sharing ─────────────────────────────────────
  messageTemplates: defineTable({
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    type: v.union(
      v.literal("invoice_reminder"),
      v.literal("quotation_followup"),
      v.literal("payment_receipt"),
      v.literal("delivery_note"),
      v.literal("general")
    ),
    createdBy: v.id("users"),
  }),

  communicationLog: defineTable({
    channel: v.union(v.literal("email"), v.literal("whatsapp"), v.literal("link")),
    documentType: v.union(
      v.literal("invoice"),
      v.literal("quotation"),
      v.literal("purchase_order"),
      v.literal("payment_reminder"),
      v.literal("delivery_note")
    ),
    documentId: v.string(),
    documentNumber: v.string(),
    recipientName: v.string(),
    recipientContact: v.string(),
    subject: v.optional(v.string()),
    message: v.optional(v.string()),
    sentAt: v.string(),
    sentBy: v.id("users"),
  })
    .index("by_document", ["documentType", "documentId"])
    .index("by_sent_at", ["sentAt"]),

  // ─── Job Costing & Projects ────────────────────────────────
  projects: defineTable({
    name: v.string(),
    code: v.string(),
    customerId: v.optional(v.id("customers")),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("planning"),
      v.literal("active"),
      v.literal("on_hold"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    estimatedBudget: v.number(),
    actualCost: v.number(),
    laborCost: v.number(),
    materialCost: v.number(),
    revenue: v.optional(v.number()),
    billableHours: v.optional(v.number()),
    nonBillableHours: v.optional(v.number()),
    managerId: v.optional(v.id("employees")),
    createdBy: v.id("users"),
  })
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_code", ["code"]),

  projectTasks: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    estimatedHours: v.optional(v.number()),
    actualHours: v.number(),
    estimatedCost: v.optional(v.number()),
    actualCost: v.number(),
    assignedTo: v.optional(v.id("employees")),
  })
    .index("by_project", ["projectId"])
    .index("by_assigned", ["assignedTo"]),

  timeEntries: defineTable({
    projectId: v.id("projects"),
    taskId: v.optional(v.id("projectTasks")),
    employeeId: v.id("employees"),
    date: v.string(),
    startTime: v.string(),
    endTime: v.optional(v.string()),
    hours: v.number(),
    hourlyRate: v.number(),
    totalCost: v.number(),
    description: v.optional(v.string()),
    billable: v.boolean(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.string()),
    isRunning: v.boolean(),
  })
    .index("by_project", ["projectId"])
    .index("by_employee", ["employeeId"])
    .index("by_date", ["date"])
    .index("by_status", ["status"])
    .index("by_employee_and_date", ["employeeId", "date"]),

  projectMaterials: defineTable({
    projectId: v.id("projects"),
    taskId: v.optional(v.id("projectTasks")),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    unitCost: v.number(),
    totalCost: v.number(),
    date: v.string(),
    addedBy: v.id("users"),
  })
    .index("by_project", ["projectId"]),

  // ─── Job Contractors ─────────────────────────────────────
  jobContractors: defineTable({
    projectId: v.id("projects"),
    vendorId: v.id("vendors"),
    role: v.string(),
    contractAmount: v.number(),
    amountPaid: v.number(),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("terminated")
    ),
    notes: v.optional(v.string()),
    addedBy: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_vendor", ["vendorId"])
    .index("by_status", ["status"]),

  // ─── Tax Management ───────────────────────────────────────
  taxSettings: defineTable({
    isEnabled: v.boolean(),
    country: v.string(),
    taxLabel: v.string(),
    defaultTaxRate: v.number(),
    pricingMode: v.union(v.literal("exclusive"), v.literal("inclusive")),
    taxRegistrationNumber: v.optional(v.string()),
    fiscalYearStart: v.optional(v.string()),
    updatedBy: v.id("users"),
  }),

  taxRates: defineTable({
    name: v.string(),
    rate: v.number(),
    category: v.union(
      v.literal("standard"),
      v.literal("reduced"),
      v.literal("zero"),
      v.literal("exempt")
    ),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    isActive: v.boolean(),
    country: v.optional(v.string()),
    appliesTo: v.optional(v.union(
      v.literal("goods"),
      v.literal("services"),
      v.literal("both")
    )),
  })
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  taxTransactions: defineTable({
    date: v.string(),
    type: v.union(v.literal("collected"), v.literal("paid")),
    taxRateId: v.id("taxRates"),
    taxAmount: v.number(),
    netAmount: v.number(),
    grossAmount: v.number(),
    referenceType: v.union(
      v.literal("invoice"),
      v.literal("sale"),
      v.literal("purchase_order"),
      v.literal("bill"),
      v.literal("expense")
    ),
    referenceId: v.string(),
    referenceNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    period: v.string(),
    recordedBy: v.id("users"),
  })
    .index("by_type", ["type"])
    .index("by_period", ["period"])
    .index("by_reference", ["referenceType", "referenceId"])
    .index("by_tax_rate", ["taxRateId"]),

  // ─── Budget Planning & Cash Flow ─────────────────────────────
  budgets: defineTable({
    name: v.string(),
    type: v.union(v.literal("monthly"), v.literal("quarterly"), v.literal("yearly")),
    period: v.string(),
    accountId: v.optional(v.id("accounts")),
    department: v.optional(v.string()),
    amount: v.number(),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_period", ["period"])
    .index("by_account", ["accountId"])
    .index("by_department", ["department"]),

  budgetTemplates: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    items: v.array(v.object({
      accountId: v.optional(v.id("accounts")),
      department: v.optional(v.string()),
      amount: v.number(),
      label: v.string(),
    })),
    createdBy: v.id("users"),
  }),

  // ─── Custom Roles & Permissions ────────────────────────────
  customRoles: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    isSystem: v.boolean(),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_name", ["name"]),

  recurringInvoices: defineTable({
    name: v.string(),
    customerId: v.id("customers"),
    frequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    items: v.array(v.object({
      productId: v.optional(v.id("products")),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
    })),
    saleType: v.union(v.literal("cash"), v.literal("credit")),
    creditTerms: v.optional(v.union(
      v.literal("net_15"),
      v.literal("net_30"),
      v.literal("net_60"),
      v.literal("net_90")
    )),
    taxRate: v.optional(v.number()),
    discount: v.optional(v.number()),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    nextGenerationDate: v.string(),
    lastGeneratedDate: v.optional(v.string()),
    totalGenerated: v.number(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled"), v.literal("completed")),
    createdBy: v.id("users"),
    // Set by the scheduled invoice generator when assertCustomerCanBeInvoiced throws.
    // "blocked" = last run skipped due to credit control; owner must resolve.
    lastRunStatus: v.optional(v.union(v.literal("ok"), v.literal("blocked"))),
    lastRunBlockedReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_next_date", ["nextGenerationDate"])
    .index("by_customer", ["customerId"]),

  recurringBills: defineTable({
    name: v.string(),
    vendorId: v.id("vendors"),
    frequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    amount: v.number(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    nextGenerationDate: v.string(),
    lastGeneratedDate: v.optional(v.string()),
    totalGenerated: v.number(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("cancelled"), v.literal("completed")),
    createdBy: v.id("users"),
  })
    .index("by_status", ["status"])
    .index("by_next_date", ["nextGenerationDate"])
    .index("by_vendor", ["vendorId"]),

  expenseClaims: defineTable({
    claimNumber: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    submittedBy: v.id("users"),
    employeeId: v.optional(v.id("employees")),
    categoryId: v.optional(v.id("expenseCategories")),
    amount: v.number(),
    currency: v.optional(v.string()),
    receiptStorageId: v.optional(v.id("_storage")),
    date: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("pending_finance"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("reimbursed")
    ),
    currentApprover: v.optional(v.id("users")),
    approvalLevel: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_submitted_by", ["submittedBy"])
    .index("by_status", ["status"])
    .index("by_current_approver", ["currentApprover"]),

  claimApprovals: defineTable({
    claimId: v.id("expenseClaims"),
    approverId: v.id("users"),
    level: v.number(),
    action: v.union(v.literal("approved"), v.literal("rejected")),
    comments: v.optional(v.string()),
    actionDate: v.string(),
  }).index("by_claim", ["claimId"]),

  // ─── CRM & Lead Management ─────────────────────────────────
  leads: defineTable({
    name: v.string(),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.union(
      v.literal("website"),
      v.literal("referral"),
      v.literal("cold_call"),
      v.literal("social_media"),
      v.literal("trade_show"),
      v.literal("email_campaign"),
      v.literal("other")
    ),
    stage: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("proposal"),
      v.literal("negotiation"),
      v.literal("won"),
      v.literal("lost")
    ),
    dealValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    expectedCloseDate: v.optional(v.string()),
    assignedTo: v.optional(v.id("users")),
    convertedCustomerId: v.optional(v.id("customers")),
    lostReason: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    createdBy: v.id("users"),
  })
    .index("by_stage", ["stage"])
    .index("by_assigned", ["assignedTo"])
    .index("by_source", ["source"]),

  leadActivities: defineTable({
    leadId: v.id("leads"),
    type: v.union(
      v.literal("call"),
      v.literal("email"),
      v.literal("meeting"),
      v.literal("note"),
      v.literal("task"),
      v.literal("follow_up")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    date: v.string(),
    dueDate: v.optional(v.string()),
    isCompleted: v.boolean(),
    completedAt: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_lead", ["leadId"])
    .index("by_due_date", ["dueDate"])
    .index("by_completed", ["isCompleted"]),

  accessLog: defineTable({
    userId: v.id("users"),
    action: v.string(),
    module: v.string(),
    resourceId: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    timestamp: v.string(),
    success: v.boolean(),
    details: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_module", ["module"]),

  // ─── Multi-Branch Support ────────────────────────────────────
  branches: defineTable({
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    isHeadquarters: v.boolean(),
    isActive: v.boolean(),
    taxRegistrationNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  branchTransfers: defineTable({
    transferNumber: v.string(),
    fromBranchId: v.id("branches"),
    toBranchId: v.id("branches"),
    fromWarehouseId: v.id("warehouses"),
    toWarehouseId: v.id("warehouses"),
    status: v.union(
      v.literal("draft"),
      v.literal("in_transit"),
      v.literal("received"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    shippedAt: v.optional(v.string()),
    receivedAt: v.optional(v.string()),
    createdBy: v.id("users"),
    receivedBy: v.optional(v.id("users")),
  })
    .index("by_from_branch", ["fromBranchId"])
    .index("by_to_branch", ["toBranchId"])
    .index("by_status", ["status"]),

  branchTransferItems: defineTable({
    transferId: v.id("branchTransfers"),
    productId: v.id("products"),
    quantity: v.number(),
    receivedQuantity: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_transfer", ["transferId"]),

  // ─── Automated Email Alerts ────────────────────────────────
  alertSettings: defineTable({
    type: v.union(
      v.literal("overdue_invoice"),
      v.literal("low_stock"),
      v.literal("payment_received"),
      v.literal("po_approval"),
      v.literal("expense_claim_update"),
      v.literal("lead_follow_up")
    ),
    isEnabled: v.boolean(),
    senderEmail: v.optional(v.string()),
    // For overdue invoices: days before/after due to trigger
    triggerDays: v.optional(v.array(v.number())),
    // For low stock: threshold override (otherwise product-level)
    thresholdOverride: v.optional(v.number()),
    updatedBy: v.id("users"),
  })
    .index("by_type", ["type"]),

  alertLog: defineTable({
    alertType: v.string(),
    recipientEmail: v.string(),
    subject: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
    sentAt: v.string(),
  })
    .index("by_type", ["alertType"])
    .index("by_sent_at", ["sentAt"]),

  // ─── Document Attachments ─────────────────────────────────────
  attachments: defineTable({
    recordType: v.union(
      v.literal("invoice"),
      v.literal("bill"),
      v.literal("expense"),
      v.literal("asset"),
      v.literal("product"),
      v.literal("employee"),
      v.literal("sale"),
      v.literal("purchase_order"),
      v.literal("warranty")
    ),
    recordId: v.string(),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storageId: v.id("_storage"),
    description: v.optional(v.string()),
    uploadedBy: v.id("users"),
    uploadedAt: v.string(),
  })
    .index("by_record", ["recordType", "recordId"])
    .index("by_uploaded_by", ["uploadedBy"]),

  // ─── Warranty Tracking ────────────────────────────────────────
  warranties: defineTable({
    itemType: v.union(
      v.literal("product"),
      v.literal("asset")
    ),
    itemId: v.string(),
    itemName: v.string(),
    warrantyNumber: v.optional(v.string()),
    provider: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    terms: v.optional(v.string()),
    coverageType: v.union(
      v.literal("full"),
      v.literal("limited"),
      v.literal("extended")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("claimed"),
      v.literal("void")
    ),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_item", ["itemType", "itemId"])
    .index("by_status", ["status"])
    .index("by_end_date", ["endDate"]),

  warrantyServiceHistory: defineTable({
    warrantyId: v.id("warranties"),
    serviceDate: v.string(),
    type: v.union(
      v.literal("repair"),
      v.literal("replacement"),
      v.literal("inspection"),
      v.literal("claim")
    ),
    description: v.string(),
    cost: v.optional(v.number()),
    coveredByWarranty: v.boolean(),
    serviceProvider: v.optional(v.string()),
    resolution: v.optional(v.string()),
    recordedBy: v.id("users"),
  }).index("by_warranty", ["warrantyId"]),

  // ─── Customer Loyalty Program ─────────────────────────────────
  loyaltySettings: defineTable({
    pointsPerCurrencyUnit: v.number(),
    redemptionRate: v.number(),
    minimumRedeemPoints: v.number(),
    pointsExpiryDays: v.number(),
    isActive: v.boolean(),
    tiers: v.array(v.object({
      name: v.string(),
      minimumPoints: v.number(),
      multiplier: v.number(),
      color: v.string(),
    })),
    updatedBy: v.id("users"),
  }),

  loyaltyAccounts: defineTable({
    customerId: v.id("customers"),
    totalPointsEarned: v.number(),
    totalPointsRedeemed: v.number(),
    currentBalance: v.number(),
    currentTier: v.string(),
    lastActivityDate: v.optional(v.string()),
  }).index("by_customer", ["customerId"])
    .index("by_tier", ["currentTier"]),

  loyaltyTransactions: defineTable({
    customerId: v.id("customers"),
    type: v.union(
      v.literal("earn"),
      v.literal("redeem"),
      v.literal("expire"),
      v.literal("adjust")
    ),
    points: v.number(),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    recordedBy: v.optional(v.id("users")),
  })
    .index("by_customer", ["customerId"])
    .index("by_type", ["type"])
    .index("by_expires_at", ["expiresAt"]),

  // Company Profile
  companyProfile: defineTable({
    nameEn: v.string(),
    nameAr: v.optional(v.string()),
    nameUr: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    crNumber: v.optional(v.string()),
    taxId: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
    // System default country — cascades defaults system-wide but is not locked
    defaultCountry: v.optional(v.string()),
    // Fiscal year start month (1=January, 7=July, etc.) — auto-set from country but overridable
    fiscalYearStartMonth: v.optional(v.number()),
    invoiceFooterEn: v.optional(v.string()),
    invoiceFooterAr: v.optional(v.string()),
    invoiceFooterUr: v.optional(v.string()),
    // Global closing date: no transaction can be added/edited on or before this date
    closingDate: v.optional(v.string()),
    closingDateSetBy: v.optional(v.id("users")),
    closingDateSetAt: v.optional(v.string()),
    // Global inventory valuation method default
    inventoryValuationMethod: v.optional(v.union(
      v.literal("fifo"),
      v.literal("lifo"),
      v.literal("weighted_average")
    )),
    updatedBy: v.id("users"),
  }),

  // Finance Charges Settings
  financeChargeSettings: defineTable({
    chargeMethod: v.union(v.literal("percentage"), v.literal("flat")),
    // Percentage per period (e.g. 1.5 = 1.5% per month)
    percentageRate: v.optional(v.number()),
    // Flat fee amount
    flatFee: v.optional(v.number()),
    // Period for rate application
    period: v.union(v.literal("monthly"), v.literal("daily")),
    // Grace period in days after due date before charges apply
    gracePeriodDays: v.number(),
    // Minimum overdue amount to trigger finance charges
    minimumBalance: v.number(),
    // Whether finance charges compound (charge on previous charges)
    compounding: v.boolean(),
    // Currency
    currency: v.string(),
    // Whether auto-assessment is enabled
    autoAssess: v.boolean(),
    updatedBy: v.id("users"),
  }),

  // Finance Charges — individual charges assessed on overdue invoices
  financeCharges: defineTable({
    // Reference to the overdue invoice
    invoiceId: v.id("invoices"),
    customerId: v.id("customers"),
    // The charge details
    chargeDate: v.string(),
    daysOverdue: v.number(),
    overdueAmount: v.number(),
    chargeMethod: v.union(v.literal("percentage"), v.literal("flat")),
    rate: v.optional(v.number()),
    flatFee: v.optional(v.number()),
    chargeAmount: v.number(),
    currency: v.string(),
    // Status
    status: v.union(v.literal("assessed"), v.literal("paid"), v.literal("waived"), v.literal("void")),
    // Optional note
    notes: v.optional(v.string()),
    assessedBy: v.id("users"),
  })
    .index("by_invoice", ["invoiceId"])
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_date", ["chargeDate"]),

  // Custom Dashboard
  dashboardLayouts: defineTable({
    userId: v.id("users"),
    widgets: v.array(v.object({
      id: v.string(),
      type: v.string(),
      title: v.string(),
      x: v.number(),
      y: v.number(),
      w: v.number(),
      h: v.number(),
      config: v.optional(v.object({
        metric: v.optional(v.string()),
        period: v.optional(v.string()),
        chartType: v.optional(v.string()),
        limit: v.optional(v.number()),
      })),
    })),
  }).index("by_user", ["userId"]),

  // Scheduled Reports
  scheduledReports: defineTable({
    name: v.string(),
    reportType: v.union(
      v.literal("financial"),
      v.literal("sales"),
      v.literal("expenses"),
      v.literal("inventory"),
      v.literal("cashflow"),
      v.literal("aging"),
      v.literal("payroll"),
      v.literal("purchasing"),
      v.literal("profitloss")
    ),
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly")
    ),
    format: v.union(v.literal("pdf"), v.literal("csv")),
    recipients: v.array(v.string()),
    isActive: v.boolean(),
    lastRunAt: v.optional(v.string()),
    nextRunAt: v.optional(v.string()),
    createdBy: v.id("users"),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    hour: v.optional(v.number()),
  }).index("by_active", ["isActive"])
    .index("by_creator", ["createdBy"]),

  reportHistory: defineTable({
    scheduledReportId: v.id("scheduledReports"),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("pending")
    ),
    reportType: v.string(),
    format: v.string(),
    recipientCount: v.number(),
    error: v.optional(v.string()),
    generatedAt: v.string(),
  }).index("by_report", ["scheduledReportId"]),

  deliveryNotes: defineTable({
    noteNumber: v.string(),
    date: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("dispatched"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    customerId: v.id("customers"),
    saleId: v.optional(v.id("sales")),
    invoiceId: v.optional(v.id("invoices")),
    driverName: v.optional(v.string()),
    driverPhone: v.optional(v.string()),
    vehiclePlate: v.optional(v.string()),
    vehicleDescription: v.optional(v.string()),
    receiverName: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_sale", ["saleId"])
    .index("by_invoice", ["invoiceId"]),

  deliveryNoteItems: defineTable({
    deliveryNoteId: v.id("deliveryNotes"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    quantity: v.number(),
    unitPrice: v.optional(v.number()),
  }).index("by_delivery_note", ["deliveryNoteId"]),

  // ─── Pick/Pack/Ship Fulfillment ──────────────────────────────
  fulfillmentOrders: defineTable({
    fulfillmentNumber: v.string(),
    salesOrderId: v.id("salesOrders"),
    status: v.union(
      v.literal("pending"),
      v.literal("picking"),
      v.literal("picked"),
      v.literal("packing"),
      v.literal("packed"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("cancelled")
    ),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high"), v.literal("urgent")),
    warehouseId: v.optional(v.id("warehouses")),
    assignedTo: v.optional(v.id("users")),
    pickedAt: v.optional(v.string()),
    pickedBy: v.optional(v.id("users")),
    packedAt: v.optional(v.string()),
    packedBy: v.optional(v.id("users")),
    shippedAt: v.optional(v.string()),
    shippedBy: v.optional(v.id("users")),
    deliveredAt: v.optional(v.string()),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    shippingMethod: v.optional(v.string()),
    estimatedDelivery: v.optional(v.string()),
    weight: v.optional(v.number()),
    dimensions: v.optional(v.string()),
    packageCount: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_sales_order", ["salesOrderId"])
    .index("by_status", ["status"])
    .index("by_assigned", ["assignedTo"])
    .index("by_warehouse", ["warehouseId"]),

  fulfillmentItems: defineTable({
    fulfillmentOrderId: v.id("fulfillmentOrders"),
    salesOrderItemId: v.id("salesOrderItems"),
    productId: v.optional(v.id("products")),
    description: v.string(),
    orderedQty: v.number(),
    pickedQty: v.number(),
    packedQty: v.number(),
    shippedQty: v.number(),
    binLocation: v.optional(v.string()),
    lotNumber: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
  }).index("by_fulfillment", ["fulfillmentOrderId"]),

  // ─── Units of Measure ───────────────────────────────────────────
  unitGroups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    baseUnit: v.string(),
    isActive: v.boolean(),
  }),

  unitConversions: defineTable({
    unitGroupId: v.id("unitGroups"),
    fromUnit: v.string(),
    toUnit: v.string(),
    conversionFactor: v.number(),
  }).index("by_group", ["unitGroupId"]),

  // ─── Customer-Specific Pricing ─────────────────────────────
  customerPrices: defineTable({
    customerId: v.id("customers"),
    productId: v.id("products"),
    price: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_product", ["productId"])
    .index("by_customer_and_product", ["customerId", "productId"]),

  // ─── Inventory Classes / Departments ──────────────────────────
  inventoryClasses: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("inventoryClasses")),
    isActive: v.boolean(),
  })
    .index("by_parent", ["parentId"])
    .index("by_active", ["isActive"]),

  // ─── Loans & Amortization ────────────────────────────────────
  loans: defineTable({
    loanNumber: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("receivable"),  // Money owed TO us (customer loan)
      v.literal("payable")     // Money WE owe (bank loan, vendor credit)
    ),
    // Linked entity
    customerId: v.optional(v.id("customers")),
    vendorId: v.optional(v.id("vendors")),
    lenderName: v.optional(v.string()), // For bank/external loans
    bankAccountId: v.optional(v.id("accounts")), // Bank account for GL posting
    // Loan terms
    principalAmount: v.number(),
    interestRate: v.number(), // Annual percentage
    interestType: v.union(v.literal("simple"), v.literal("compound")),
    termMonths: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    paymentFrequency: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    monthlyPayment: v.number(), // Calculated EMI
    // Balances
    totalInterest: v.number(),
    totalPayable: v.number(),
    principalPaid: v.number(),
    interestPaid: v.number(),
    outstandingBalance: v.number(),
    // Status
    status: v.union(
      v.literal("active"),
      v.literal("paid_off"),
      v.literal("defaulted"),
      v.literal("cancelled")
    ),
    nextPaymentDate: v.string(),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_vendor", ["vendorId"]),

  loanPayments: defineTable({
    loanId: v.id("loans"),
    paymentNumber: v.number(),
    date: v.string(),
    amount: v.number(),
    principalPortion: v.number(),
    interestPortion: v.number(),
    balanceAfter: v.number(),
    method: v.optional(v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("other")
    )),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("scheduled"), v.literal("paid"), v.literal("overdue"), v.literal("waived")),
    recordedBy: v.optional(v.id("users")),
  })
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"])
    .index("by_date", ["date"]),

  // ─── Employee Salary Advances ────────────────────────────────────
  salaryAdvances: defineTable({
    advanceNumber: v.string(),
    employeeId: v.id("employees"),
    amount: v.number(),
    date: v.string(), // Date issued
    reason: v.optional(v.string()),
    bankAccountId: v.optional(v.id("accounts")), // Bank account funds came from
    // Repayment
    repaymentMonths: v.number(), // Number of months to deduct
    monthlyDeduction: v.number(), // Amount to deduct each payroll run
    amountRepaid: v.number(), // Cumulative amount deducted
    outstandingBalance: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("fully_repaid"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_employee", ["employeeId"])
    .index("by_status", ["status"]),

  customFields: defineTable({
    entityType: v.union(
      v.literal("customer"),
      v.literal("vendor"),
      v.literal("product"),
      v.literal("invoice"),
      v.literal("bill"),
      v.literal("employee")
    ),
    fieldName: v.string(),
    fieldLabel: v.string(),
    fieldType: v.union(
      v.literal("text"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("select"),
      v.literal("textarea")
    ),
    options: v.optional(v.array(v.string())),
    isRequired: v.boolean(),
    isActive: v.boolean(),
    sortOrder: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_entity_type", ["entityType"])
    .index("by_entity_and_active", ["entityType", "isActive"]),

  customFieldValues: defineTable({
    fieldId: v.id("customFields"),
    entityType: v.string(),
    entityId: v.string(),
    value: v.string(),
  })
    .index("by_field", ["fieldId"])
    .index("by_entity", ["entityType", "entityId"]),

  savedReports: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    dataSource: v.union(
      v.literal("sales"),
      v.literal("peritem"),
      v.literal("purchases"),
      v.literal("inventory"),
      v.literal("customers"),
      v.literal("vendors"),
      v.literal("expenses"),
      v.literal("invoices"),
      v.literal("employees"),
      v.literal("journal")
    ),
    columns: v.array(v.string()),
    filters: v.array(v.object({
      field: v.string(),
      operator: v.union(
        v.literal("equals"),
        v.literal("not_equals"),
        v.literal("contains"),
        v.literal("greater_than"),
        v.literal("less_than"),
        v.literal("between"),
        v.literal("is_empty"),
        v.literal("is_not_empty")
      ),
      value: v.string(),
      value2: v.optional(v.string()),
    })),
    groupBy: v.optional(v.string()),
    sortBy: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    isPublic: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("by_creator", ["createdBy"])
    .index("by_data_source", ["dataSource"]),

  // Print Templates
  printTemplates: defineTable({
    name: v.string(),
    documentType: v.union(
      v.literal("invoice"),
      v.literal("delivery_note"),
      v.literal("quotation"),
      v.literal("purchase_order"),
      v.literal("receipt")
    ),
    isDefault: v.boolean(),
    config: v.object({
      logoPosition: v.union(v.literal("left"), v.literal("center"), v.literal("right"), v.literal("hidden")),
      headerLayout: v.union(v.literal("standard"), v.literal("compact"), v.literal("full_width")),
      showCompanyNameAr: v.boolean(),
      showCompanyNameUr: v.boolean(),
      primaryColor: v.string(),
      fontSize: v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
      showBorders: v.boolean(),
      showItemNumber: v.boolean(),
      showItemDescription: v.boolean(),
      showQuantity: v.boolean(),
      showUnitPrice: v.boolean(),
      showDiscount: v.boolean(),
      showTax: v.boolean(),
      showTotal: v.boolean(),
      showPaymentTerms: v.boolean(),
      showBankDetails: v.boolean(),
      showSignatureLine: v.boolean(),
      showQrCode: v.boolean(),
      headerText: v.optional(v.string()),
      footerText: v.optional(v.string()),
      termsText: v.optional(v.string()),
      pageSize: v.union(v.literal("a4"), v.literal("letter"), v.literal("a5")),
      orientation: v.union(v.literal("portrait"), v.literal("landscape")),

      // Logo Source
      logoSource: v.optional(v.union(v.literal("company_profile"), v.literal("custom"), v.literal("none"))),
      customLogoStorageId: v.optional(v.string()),
      logoSize: v.optional(v.union(v.literal("small"), v.literal("medium"), v.literal("large"))),

      // Typography
      fontFamily: v.optional(v.union(v.literal("system"), v.literal("serif"), v.literal("mono"), v.literal("arabic"))),
      secondaryColor: v.optional(v.string()),
      headerFontSize: v.optional(v.union(v.literal("same"), v.literal("larger"), v.literal("extra_large"))),

      // Layout & Spacing
      tableHeaderStyle: v.optional(v.union(v.literal("filled"), v.literal("underline"), v.literal("plain"))),
      margins: v.optional(v.union(v.literal("narrow"), v.literal("normal"), v.literal("wide"))),
      itemRowHeight: v.optional(v.union(v.literal("compact"), v.literal("normal"), v.literal("spacious"))),

      // Additional Sections
      showWatermark: v.optional(v.boolean()),
      watermarkText: v.optional(v.string()),
      showNotesSection: v.optional(v.boolean()),
      notesLabel: v.optional(v.string()),
      showStampArea: v.optional(v.boolean()),
      showCustomerTaxId: v.optional(v.boolean()),
      showDeliveryAddress: v.optional(v.boolean()),
      footerAlignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),

      // Document Number Format
      showDocPrefix: v.optional(v.boolean()),
      docPrefix: v.optional(v.string()),
    }),
    createdBy: v.id("users"),
  })
    .index("by_type", ["documentType"])
    .index("by_default", ["documentType", "isDefault"]),

  // ─── Customer Deposits & Retainers ─────────────────────────
  customerDeposits: defineTable({
    depositNumber: v.string(),
    customerId: v.id("customers"),
    date: v.string(),
    amount: v.number(),
    appliedAmount: v.number(), // how much has been applied to invoices
    balance: v.number(), // amount - appliedAmount
    type: v.union(v.literal("deposit"), v.literal("retainer")),
    status: v.union(
      v.literal("active"),
      v.literal("fully_applied"),
      v.literal("refunded"),
      v.literal("void")
    ),
    paymentMethod: v.optional(v.union(
      v.literal("cash"),
      v.literal("check"),
      v.literal("bank_transfer"),
      v.literal("credit_card"),
      v.literal("other")
    )),
    referenceNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_date", ["date"]),

  depositApplications: defineTable({
    depositId: v.id("customerDeposits"),
    invoiceId: v.id("invoices"),
    amount: v.number(),
    date: v.string(),
    notes: v.optional(v.string()),
    appliedBy: v.id("users"),
  })
    .index("by_deposit", ["depositId"])
    .index("by_invoice", ["invoiceId"]),

  // ─── Recurring (Memorized) Transactions ────────────────────
  recurringTransactions: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("invoice"),
      v.literal("bill"),
      v.literal("expense"),
      v.literal("journal_entry")
    ),
    // Schedule
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly")
    ),
    startDate: v.string(),
    endDate: v.optional(v.string()), // null = forever
    nextRunDate: v.string(),
    lastRunDate: v.optional(v.string()),
    runCount: v.number(), // how many times it has run
    maxRuns: v.optional(v.number()), // null = unlimited
    isActive: v.boolean(),
    // Template data stored as JSON-like structure
    templateData: v.object({
      // For invoices
      customerId: v.optional(v.string()),
      customerName: v.optional(v.string()),
      // For bills
      vendorId: v.optional(v.string()),
      vendorName: v.optional(v.string()),
      // Common
      amount: v.number(),
      description: v.optional(v.string()),
      items: v.optional(v.array(v.object({
        description: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }))),
      // For journal entries
      debitAccountId: v.optional(v.string()),
      creditAccountId: v.optional(v.string()),
      // For expenses
      category: v.optional(v.string()),
    }),
    createdBy: v.id("users"),
  })
    .index("by_next_run", ["nextRunDate"])
    .index("by_type", ["type"])
    .index("by_active", ["isActive"]),

  // Statement Charges - direct charges to customer accounts without formal invoices
  statementCharges: defineTable({
    chargeNumber: v.string(),
    customerId: v.id("customers"),
    date: v.string(),
    dueDate: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("partially_paid"),
      v.literal("void")
    ),
    items: v.array(v.object({
      description: v.string(),
      quantity: v.number(),
      rate: v.number(),
      amount: v.number(),
    })),
    subtotal: v.number(),
    taxRate: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
    totalAmount: v.number(),
    amountPaid: v.number(),
    memo: v.optional(v.string()),
    currency: v.optional(v.string()),
    createdBy: v.id("users"),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_due_date", ["dueDate"]),

  // ─── Credit Control ─────────────────────────────────────────────────────────

  /**
   * Audit trail for every change to a customer's credit limit.
   * Written by updateCustomerCreditLimit (owner-only). Direct patches to
   * customers.creditLimit must go through that mutation — never bypass it.
   */
  creditLimitHistory: defineTable({
    customerId: v.id("customers"),
    changedBy: v.id("users"),
    changedAt: v.string(),            // ISO datetime UTC
    fromLimit: v.optional(v.number()), // null on first recorded change
    toLimit: v.number(),
    reason: v.string(),
  }).index("by_customer", ["customerId"]),

  /**
   * Bad-debt write-offs. Each row records one write-off event against an invoice.
   * An invoice may have multiple rows (e.g. first a partial write-off, later a
   * recovery that leaves a residual, then a second write-off).
   *
   * Accounting rule: Dr Bad Debt Expense / Cr Accounts Receivable.
   * This is NOT a credit note (which reduces sales). It is an expense (money lost).
   * Never merge with the credit-memo code path.
   *
   * VAT note: taxAmount is stored now but NOT posted to the ledger. The business
   * has paid VAT on money it never received; the formal reclaim entry belongs to
   * the VAT posting module (not yet built). When that module exists it must read
   * badDebtWriteOffs.taxAmount to construct the reclaim entry.
   * Comment: "VAT on this write-off is stored in taxAmount. Post Dr VAT Payable /
   * Cr [reclaim account] per period when VAT reclaim module is built."
   */
  badDebtWriteOffs: defineTable({
    invoiceId: v.id("invoices"),
    customerId: v.id("customers"),
    // Net amount written off, excluding VAT. The GL entry is for this amount.
    amount: v.number(),
    // VAT portion — stored now, not yet posted. See VAT note above.
    taxAmount: v.optional(v.number()),
    writtenOffBy: v.id("users"),
    writtenOffAt: v.string(),           // ISO datetime UTC
    reason: v.string(),
    // Set after GL entry is posted. Allows reversal if needed.
    glEntryId: v.optional(v.id("journalEntries")),
    // Recovery fields — set by recoverBadDebt
    recoveredAt: v.optional(v.string()),    // ISO datetime UTC
    recoveredBy: v.optional(v.id("users")),
    recoveryReason: v.optional(v.string()),
    recoveryGlEntryId: v.optional(v.id("journalEntries")),
  })
    .index("by_invoice", ["invoiceId"])
    .index("by_customer", ["customerId"])
    .index("by_written_off_at", ["writtenOffAt"]),

  /**
   * Company-wide credit control thresholds. Single row — read with .take(1).
   * If no row exists the gate falls back to CREDIT_CONTROL_DEFAULTS and
   * allows the sale (absence of a restriction is not a restriction).
   * Units: DAYS throughout. The UI presents months; the stored value is days.
   *   null = no threshold (no restriction for that stage).
   */
  creditControlSettings: defineTable({
    // Days overdue before invoice appears on watch list
    doubtfulDays: v.optional(v.number()),
    // Days overdue before customer credit is automatically blocked
    blacklistDays: v.optional(v.number()),
    // Days overdue before invoice is proposed for write-off
    writeOffDays: v.optional(v.number()),
  }),
  // ─── Built-in sign-in (Farooq BizManager) ───────────────────
  // Email + password accounts, refresh-token sessions and the signing key.
  // These three tables are private to the server: no public query returns them,
  // and they are deliberately NOT in the backup export list.
  authAccounts: defineTable({
    email: v.string(), // always stored lower-case
    passwordHash: v.string(),
    userId: v.id("users"),
    failedAttempts: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_user", ["userId"]),
  authSessions: defineTable({
    userId: v.id("users"),
    refreshTokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_refresh", ["refreshTokenHash"])
    .index("by_user", ["userId"]),
  authKeys: defineTable({
    kid: v.string(),
    privateKeyPem: v.string(),
    publicJwk: v.string(),
  }),
});
