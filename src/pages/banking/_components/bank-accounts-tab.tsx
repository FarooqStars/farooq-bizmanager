import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import {
  Building, CreditCard, Banknote, PiggyBank, Wallet, Landmark,
  TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils.ts";

// Map subType to icon
function getAccountIcon(subType?: string) {
  switch (subType?.toLowerCase()) {
    case "checking": return Banknote;
    case "savings": return PiggyBank;
    case "credit card":
    case "corporate card": return CreditCard;
    case "cash": return Wallet;
    case "petty cash": return Wallet;
    case "money market": return TrendingUp;
    default: return Landmark;
  }
}

export default function BankAccountsTab() {
  const { fmt } = useCurrency();
  const navigate = useNavigate();

  // Query REAL accounts from the unified Chart of Accounts (type: bank)
  const bankAccounts = useQuery(api.accounting.listAccounts, { type: "bank", activeOnly: true });
  // Also show credit card accounts as they function like bank accounts
  const creditCardAccounts = useQuery(api.accounting.listAccounts, { type: "credit_card", activeOnly: true });

  if (!bankAccounts || !creditCardAccounts) return <Skeleton className="h-40 w-full" />;

  const allAccounts = [...bankAccounts, ...creditCardAccounts];
  const totalBalance = allAccounts.reduce((sum, a) => sum + a.balance, 0);
  const bankTotal = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
  const ccTotal = creditCardAccounts.reduce((sum, a) => sum + a.balance, 0);

  if (allAccounts.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Building /></EmptyMedia>
          <EmptyTitle>No bank accounts in Chart of Accounts</EmptyTitle>
          <EmptyDescription>
            Your bank accounts are managed in the Chart of Accounts (General Ledger). 
            Go to General Ledger and add accounts with type "Bank" or "Credit Card".
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" onClick={() => navigate("/accounting")} className="cursor-pointer">
            <ArrowRight className="w-4 h-4 mr-2" />Go to Chart of Accounts
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Bank Balances</p>
            <p className="text-2xl font-bold">{fmt(bankTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{bankAccounts.length} bank accounts</p>
          </CardContent>
        </Card>
        {creditCardAccounts.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Credit Card Balances</p>
              <p className="text-2xl font-bold text-red-600">{fmt(ccTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">{creditCardAccounts.length} credit cards</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Net Position</p>
            <p className={cn("text-2xl font-bold", totalBalance >= 0 ? "text-green-600" : "text-red-600")}>
              {fmt(totalBalance)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">All accounts combined</p>
          </CardContent>
        </Card>
      </div>

      {/* Bank Accounts */}
      {bankAccounts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-4 h-4" />
              Bank Accounts
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These accounts are from your Chart of Accounts (General Ledger). 
              To add or edit accounts, go to General Ledger &gt; Chart of Accounts.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {bankAccounts.map((account) => {
                const Icon = getAccountIcon(account.subType ?? undefined);
                return (
                  <div key={account._id} className="p-4 border rounded-lg space-y-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{account.name}</p>
                          <p className="text-xs text-muted-foreground">Code: {account.code}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {account.subType ?? "Bank"}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className={cn("text-lg font-bold", account.balance >= 0 ? "" : "text-red-600")}>
                          {fmt(account.balance)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {account.balance > 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-500" />
                        ) : account.balance < 0 ? (
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Card Accounts */}
      {creditCardAccounts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Credit Card Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {creditCardAccounts.map((account) => (
                <div key={account._id} className="p-4 border rounded-lg space-y-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{account.name}</p>
                        <p className="text-xs text-muted-foreground">Code: {account.code}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {account.subType ?? "Credit Card"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Balance Owed</p>
                    <p className="text-lg font-bold text-red-600">{fmt(account.balance)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link to Chart of Accounts */}
      <Card className="border-dashed">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Manage All Accounts</p>
            <p className="text-xs text-muted-foreground">Add, edit, delete, or reorganize accounts in Chart of Accounts</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate("/accounting")} className="cursor-pointer">
            <ArrowRight className="w-4 h-4 mr-2" />Chart of Accounts
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
