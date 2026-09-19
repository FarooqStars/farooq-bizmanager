/**
 * Statement of Account tab - allows selecting customer/vendor and date range
 * to generate a full statement with opening balance, transactions, and closing balance.
 */
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Printer, Share2, Users, Building2, ArrowUpDown } from "lucide-react";
import { usePrintDocument } from "@/hooks/use-print-document.ts";
import { generateStatementHtml } from "@/lib/print-templates/statement-template.ts";
import { openPrintWindow } from "@/lib/print-utils.ts";
import ShareDocumentDialog from "@/components/share-document-dialog.tsx";
import { formatCurrency } from "@/lib/print-utils.ts";

export default function StatementsTab() {
  const { t, i18n } = useTranslation();
  const [entityTab, setEntityTab] = useState<"customer" | "vendor">("customer");

  return (
    <div className="space-y-4">
      <Tabs value={entityTab} onValueChange={(v) => setEntityTab(v as "customer" | "vendor")}>
        <TabsList>
          <TabsTrigger value="customer" className="cursor-pointer">
            <Users className="w-4 h-4 mr-2" />
            {t("statement.customer")}
          </TabsTrigger>
          <TabsTrigger value="vendor" className="cursor-pointer">
            <Building2 className="w-4 h-4 mr-2" />
            {t("statement.vendor")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="customer" className="mt-4">
          <CustomerStatementView lang={i18n.language} />
        </TabsContent>
        <TabsContent value="vendor" className="mt-4">
          <VendorStatementView lang={i18n.language} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CustomerStatementView({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const customers = useQuery(api.sales.listCustomers);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showStatement, setShowStatement] = useState(false);

  const statement = useQuery(
    api.statements.getCustomerStatement,
    showStatement && selectedCustomerId
      ? {
          customerId: selectedCustomerId as Id<"customers">,
          startDate,
          endDate,
        }
      : "skip"
  );

  const handleGenerate = () => {
    if (selectedCustomerId && startDate && endDate) {
      setShowStatement(true);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("statement.customerTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>{t("statement.selectCustomer")}</Label>
              <Select
                value={selectedCustomerId}
                onValueChange={(v) => {
                  setSelectedCustomerId(v);
                  setShowStatement(false);
                }}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder={t("statement.selectCustomer")} />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c._id} value={c._id} className="cursor-pointer">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("statement.startDate")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setShowStatement(false);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("statement.endDate")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setShowStatement(false);
                }}
              />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={!selectedCustomerId} className="cursor-pointer">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            {t("statement.generate")}
          </Button>
        </CardContent>
      </Card>

      {showStatement && !statement && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      )}

      {statement && (
        <StatementResult
          entityType="customer"
          data={statement}
          lang={lang}
        />
      )}
    </div>
  );
}

function VendorStatementView({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const vendors = useQuery(api.vendors.listVendors);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showStatement, setShowStatement] = useState(false);

  const statement = useQuery(
    api.statements.getVendorStatement,
    showStatement && selectedVendorId
      ? {
          vendorId: selectedVendorId as Id<"vendors">,
          startDate,
          endDate,
        }
      : "skip"
  );

  const handleGenerate = () => {
    if (selectedVendorId && startDate && endDate) {
      setShowStatement(true);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("statement.vendorTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>{t("statement.selectVendor")}</Label>
              <Select
                value={selectedVendorId}
                onValueChange={(v) => {
                  setSelectedVendorId(v);
                  setShowStatement(false);
                }}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder={t("statement.selectVendor")} />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.map((v) => (
                    <SelectItem key={v._id} value={v._id} className="cursor-pointer">
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("statement.startDate")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setShowStatement(false);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("statement.endDate")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setShowStatement(false);
                }}
              />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={!selectedVendorId} className="cursor-pointer">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            {t("statement.generate")}
          </Button>
        </CardContent>
      </Card>

      {showStatement && !statement && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      )}

      {statement && (
        <StatementResult
          entityType="vendor"
          data={statement}
          lang={lang}
        />
      )}
    </div>
  );
}

type StatementResultProps = {
  entityType: "customer" | "vendor";
  data: {
    customer?: { name: string; email?: string; phone?: string; address?: string };
    vendor?: { name: string; contactName?: string; email?: string; phone?: string; address?: string };
    startDate: string;
    endDate: string;
    openingBalance: number;
    transactions: {
      date: string;
      type: string;
      reference: string;
      description: string;
      debit: number;
      credit: number;
    }[];
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
  };
  lang: string;
};

function StatementResult({ entityType, data, lang }: StatementResultProps) {
  const { t } = useTranslation();
  const { isReady } = usePrintDocument();
  const profile = useQuery(api.companyProfile.get);
  const logoUrl = useQuery(
    api.companyProfile.getLogoUrl,
    profile?.logoStorageId ? { storageId: profile.logoStorageId as Id<"_storage"> } : "skip"
  );
  const [shareOpen, setShareOpen] = useState(false);

  const entity = entityType === "customer" ? data.customer : data.vendor;
  const entityName = entity?.name || "Unknown";
  const entityEmail = entity?.email || "";
  const entityPhone = entity?.phone || "";

  const handlePrint = () => {
    const html = generateStatementHtml(
      {
        entityType,
        entityName,
        entityEmail: entity?.email,
        entityPhone: entity?.phone,
        entityAddress: entity?.address,
        startDate: data.startDate,
        endDate: data.endDate,
        openingBalance: data.openingBalance,
        transactions: data.transactions,
        totalDebits: data.totalDebits,
        totalCredits: data.totalCredits,
        closingBalance: data.closingBalance,
      },
      profile,
      logoUrl,
      lang
    );
    openPrintWindow(html);
  };

  // Build running balance for display
  let runningBalance = data.openingBalance;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("statement.openingBalance")}</p>
            <p className="text-xl font-bold mt-1 break-words leading-tight">{formatCurrency(data.openingBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("statement.totalDebits")}</p>
            <p className="text-xl font-bold mt-1 text-red-600 break-words leading-tight">{formatCurrency(data.totalDebits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("statement.totalCredits")}</p>
            <p className="text-xl font-bold mt-1 text-green-600 break-words leading-tight">{formatCurrency(data.totalCredits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground font-semibold uppercase truncate">{t("statement.closingBalance")}</p>
            <p className={`text-xl font-bold mt-1 break-words leading-tight ${data.closingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(data.closingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={handlePrint} disabled={!isReady} className="cursor-pointer">
          <Printer className="w-4 h-4 mr-2" />
          {t("statement.print")}
        </Button>
        <Button variant="secondary" onClick={() => setShareOpen(true)} className="cursor-pointer">
          <Share2 className="w-4 h-4 mr-2" />
          {t("statement.share")}
        </Button>
      </div>

      {/* Transactions table */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2 font-semibold">{t("statement.date")}</th>
                <th className="py-2 px-2 font-semibold">{t("statement.type")}</th>
                <th className="py-2 px-2 font-semibold">{t("statement.reference")}</th>
                <th className="py-2 px-2 font-semibold">{t("statement.description")}</th>
                <th className="py-2 px-2 font-semibold text-right">{t("statement.debit")}</th>
                <th className="py-2 px-2 font-semibold text-right">{t("statement.credit")}</th>
                <th className="py-2 px-2 font-semibold text-right">{t("statement.balance")}</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance row */}
              <tr className="border-b bg-muted/30 font-semibold">
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2">{t("statement.openingBalance")}</td>
                <td className="py-2 px-2 text-right"></td>
                <td className="py-2 px-2 text-right"></td>
                <td className="py-2 px-2 text-right font-bold">{formatCurrency(data.openingBalance)}</td>
              </tr>
              {data.transactions.map((txn, idx) => {
                runningBalance += txn.debit - txn.credit;
                return (
                  <tr key={idx} className="border-b hover:bg-muted/20">
                    <td className="py-2 px-2 whitespace-nowrap">{new Date(txn.date).toLocaleDateString()}</td>
                    <td className="py-2 px-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getTypeBadgeClass(txn.type)}`}>
                        {txn.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-mono text-xs">{txn.reference}</td>
                    <td className="py-2 px-2">{txn.description}</td>
                    <td className="py-2 px-2 text-right text-red-600">{txn.debit > 0 ? formatCurrency(txn.debit) : "-"}</td>
                    <td className="py-2 px-2 text-right text-green-600">{txn.credit > 0 ? formatCurrency(txn.credit) : "-"}</td>
                    <td className="py-2 px-2 text-right font-semibold">{formatCurrency(runningBalance)}</td>
                  </tr>
                );
              })}
              {/* Closing balance row */}
              <tr className="bg-muted/50 font-bold border-t-2 border-foreground/20">
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2">{t("statement.closingBalance")}</td>
                <td className="py-2 px-2 text-right text-red-600">{formatCurrency(data.totalDebits)}</td>
                <td className="py-2 px-2 text-right text-green-600">{formatCurrency(data.totalCredits)}</td>
                <td className="py-2 px-2 text-right font-bold">{formatCurrency(data.closingBalance)}</td>
              </tr>
            </tbody>
          </table>
          {data.transactions.length === 0 && (
            <p className="text-center text-muted-foreground py-8">{t("statement.noTransactions")}</p>
          )}
        </CardContent>
      </Card>

      {/* Share dialog */}
      <ShareDocumentDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        documentType="invoice"
        documentId={entityType === "customer" ? "customer-statement" : "vendor-statement"}
        documentNumber={`SOA-${entityName}`}
        recipientName={entityName}
        recipientEmail={entityEmail}
        recipientPhone={entityPhone}
        amount={data.closingBalance}
        subject={`Statement of Account - ${entityName}`}
        bodyTemplate={`Dear ${entityName},\n\nPlease find your Statement of Account for the period ${data.startDate} to ${data.endDate}.\n\nOpening Balance: ${formatCurrency(data.openingBalance)}\nTotal Debits: ${formatCurrency(data.totalDebits)}\nTotal Credits: ${formatCurrency(data.totalCredits)}\nClosing Balance: ${formatCurrency(data.closingBalance)}\n\nPlease don't hesitate to contact us if you have any questions.\n\nBest regards`}
      />
    </div>
  );
}

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case "invoice": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "payment": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "credit_note": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "bill": return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300";
    case "purchase_order": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
}
