import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, BookOpen, ChevronDown, ChevronRight,
  FolderOpen, Landmark, CreditCard, Wallet, TrendingUp, TrendingDown,
  DollarSign, Building2, PiggyBank, ToggleLeft, ToggleRight, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { cn } from "@/lib/utils.ts";
import AccountFormDialog from "./account-form-dialog.tsx";
import AccountRegisterDialog from "./account-register-dialog.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

// ─── Category Configuration ─────────────────────────────────────
type CategoryConfig = {
  id: string;
  label: string;
  icon: React.ReactNode;
  types: string[];
  color: string;
  bgColor: string;
};

const CATEGORIES: CategoryConfig[] = [
  {
    id: "assets",
    label: "Assets",
    icon: <Landmark className="w-4 h-4" />,
    types: ["bank", "accounts_receivable", "other_current_asset", "fixed_asset", "other_asset", "asset"],
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    id: "liabilities",
    label: "Liabilities",
    icon: <CreditCard className="w-4 h-4" />,
    types: ["accounts_payable", "credit_card", "other_current_liability", "long_term_liability", "loan", "liability"],
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/20",
  },
  {
    id: "equity",
    label: "Equity",
    icon: <Building2 className="w-4 h-4" />,
    types: ["equity"],
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
  },
  {
    id: "income",
    label: "Income",
    icon: <TrendingUp className="w-4 h-4" />,
    types: ["income", "other_income", "revenue"],
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
  },
  {
    id: "cogs",
    label: "Cost of Goods Sold",
    icon: <DollarSign className="w-4 h-4" />,
    types: ["cost_of_goods_sold"],
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
  },
  {
    id: "expenses",
    label: "Expenses",
    icon: <TrendingDown className="w-4 h-4" />,
    types: ["expense", "other_expense"],
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
  },
];

// Human-readable type label
const TYPE_LABELS: Record<string, string> = {
  bank: "Bank",
  accounts_receivable: "Accounts Receivable",
  other_current_asset: "Other Current Asset",
  fixed_asset: "Fixed Asset",
  other_asset: "Other Asset",
  asset: "Asset",
  accounts_payable: "Accounts Payable",
  credit_card: "Credit Card",
  other_current_liability: "Other Current Liability",
  long_term_liability: "Long Term Liability",
  loan: "Loan",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  other_income: "Other Income",
  revenue: "Revenue",
  cost_of_goods_sold: "Cost of Goods Sold",
  expense: "Expense",
  other_expense: "Other Expense",
};

// ─── Tree Node type ─────────────────────────────────────────────
type AccountNode = Doc<"accounts"> & {
  children: AccountNode[];
  level: number;
};

function buildTree(accounts: Doc<"accounts">[]): AccountNode[] {
  const map = new Map<string, AccountNode>();
  const roots: AccountNode[] = [];

  // Initialize all accounts as nodes
  for (const acc of accounts) {
    map.set(acc._id, { ...acc, children: [], level: 0 });
  }

  // Build parent-child relationships
  for (const acc of accounts) {
    const node = map.get(acc._id)!;
    if (acc.parentId && map.has(acc.parentId)) {
      const parent = map.get(acc.parentId)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Set deeper levels recursively
  function setLevels(nodes: AccountNode[], level: number) {
    for (const n of nodes) {
      n.level = level;
      setLevels(n.children, level + 1);
    }
  }
  setLevels(roots, 0);

  return roots;
}

// ─── Main Component ─────────────────────────────────────────────
export default function ChartOfAccountsTab() {
  const { fmt } = useCurrency();
  const accounts = useQuery(api.accounting.listAccounts, {});
  const deleteAccount = useMutation(api.accounting.deleteAccount);
  const updateAccount = useMutation(api.accounting.updateAccount);
  const seedAccounts = useMutation(api.accounting.seedDefaultAccounts);
  const ensureMissingAccounts = useMutation(api.accounting.ensureMissingAccounts);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [formAccount, setFormAccount] = useState<Doc<"accounts"> | null | "new">(null);
  const [formParentId, setFormParentId] = useState<string | undefined>();
  const [formType, setFormType] = useState<string | undefined>();
  const [seeding, setSeeding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["all"]));
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [registerAccountId, setRegisterAccountId] = useState<Id<"accounts"> | null>(null);

  const syncBalances = useMutation(api.accounting.syncAccountBalances);
  const backfillPurchases = useMutation(api.accounting.backfillPurchaseEntries);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [showBackfillConfirm, setShowBackfillConfirm] = useState(false);

  // Auto-ensure all system accounts exist when there are already some accounts seeded
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      ensureMissingAccounts({}).catch(() => {/* silent - non-critical */});
    }
  }, [accounts?.length]);

  // Manual sync only - no auto-sync to avoid reactive re-render cascading across pages

  // ─── Computed Data ────────────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    let filtered = accounts;

    // Filter by active/inactive
    if (!showInactive) {
      filtered = filtered.filter((a) => a.isActive);
    }

    // Filter by category
    if (activeCategory !== "all") {
      const cat = CATEGORIES.find((c) => c.id === activeCategory);
      if (cat) {
        filtered = filtered.filter((a) => cat.types.includes(a.type));
      }
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          (a.subType ?? "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [accounts, activeCategory, search, showInactive]);

  // Build tree from filtered accounts
  const tree = useMemo(() => buildTree(filteredAccounts), [filteredAccounts]);

  // Category summary counts
  const categoryCounts = useMemo(() => {
    if (!accounts) return {};
    const counts: Record<string, { count: number; total: number }> = {};
    for (const cat of CATEGORIES) {
      const catAccounts = accounts.filter((a) => cat.types.includes(a.type) && a.isActive);
      counts[cat.id] = {
        count: catAccounts.length,
        total: catAccounts.reduce((sum, a) => sum + a.balance, 0),
      };
    }
    return counts;
  }, [accounts]);

  // Group tree by account type for display
  const groupedTree = useMemo(() => {
    const groups: Record<string, AccountNode[]> = {};
    for (const node of tree) {
      if (!groups[node.type]) groups[node.type] = [];
      groups[node.type].push(node);
    }
    return groups;
  }, [tree]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleSeed = async () => {
    setSeeding(true);
    try {
      const count = await seedAccounts({});
      toast.success(`Created ${count} default accounts`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to seed accounts");
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleActive = async (acc: Doc<"accounts">) => {
    try {
      await updateAccount({ id: acc._id, isActive: !acc.isActive });
      toast.success(acc.isActive ? "Account deactivated" : "Account activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleAddSubAccount = (parentId: string, type: string) => {
    setFormParentId(parentId);
    setFormType(type);
    setFormAccount("new");
  };

  const handleAddInCategory = (categoryId: string) => {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    if (cat) {
      setFormType(cat.types[0]);
      setFormParentId(undefined);
      setFormAccount("new");
    }
  };

  const handleSyncBalances = async () => {
    setSyncing(true);
    try {
      const result = await syncBalances({});
      toast.success(result.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setSyncing(false);
    }
  };

  const handleBackfillPurchases = async () => {
    setShowBackfillConfirm(false);
    setBackfilling(true);
    try {
      const result = await backfillPurchases({});
      const total = result.postedAssets + result.postedVehicles;
      if (total === 0) {
        toast.info("All asset & vehicle purchases are already in the GL — nothing new to post.");
      } else {
        toast.success(
          `Backfill complete: ${result.postedAssets} asset(s) and ${result.postedVehicles} vehicle(s) posted to GL. Click "Sync All Balances" to refresh balances.`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  const toggleGroup = (type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleAccountExpand = (id: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Loading ──────────────────────────────────────────────────
  if (!accounts) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {CATEGORIES.map((cat) => {
          const info = categoryCounts[cat.id];
          return (
            <Card
              key={cat.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                activeCategory === cat.id && "ring-2 ring-primary"
              )}
              onClick={() => setActiveCategory(activeCategory === cat.id ? "all" : cat.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("p-1.5 rounded flex-shrink-0", cat.bgColor, cat.color)}>{cat.icon}</div>
                  <span className="text-xs font-medium truncate">{cat.label}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <span className="text-lg font-bold flex-shrink-0">{info?.count ?? 0}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate text-right">{fmt(info?.total ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts by name, code, or sub-type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
          className="cursor-pointer gap-1.5"
        >
          {showInactive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showInactive ? "Hide Inactive" : "Show Inactive"}
        </Button>
        {accounts.length === 0 && (
          <Button variant="secondary" size="sm" onClick={handleSeed} disabled={seeding} className="cursor-pointer">
            {seeding ? "Creating..." : "Load Default COA"}
          </Button>
        )}
        <Button onClick={() => { setFormParentId(undefined); setFormType(undefined); setFormAccount("new"); }} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />Add Account
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSyncBalances} disabled={syncing} className="cursor-pointer">
          {syncing ? "Syncing..." : "Sync All Balances"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowBackfillConfirm(true)} disabled={backfilling || syncing} className="cursor-pointer">
          {backfilling ? "Backfilling..." : "Backfill Asset & Vehicle Purchases"}
        </Button>
      </div>

      {/* Backfill confirmation dialog */}
      <Dialog open={showBackfillConfirm} onOpenChange={setShowBackfillConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Backfill Asset & Vehicle Purchases?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>
              This will post a GL journal entry (<strong>Debit Fixed Assets / Credit Accounts Payable</strong>) for every
              asset and vehicle that has a purchase price but no entry in the GL yet.
            </p>
            <p>Already-posted items are safely skipped — safe to run more than once.</p>
            <p>After this completes, click <strong>"Sync All Balances"</strong> to see updated account balances.</p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowBackfillConfirm(false)}>Cancel</Button>
            <Button onClick={handleBackfillPurchases}>Yes, Backfill Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Filter Badge */}
      {activeCategory !== "all" && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            Showing: {CATEGORIES.find((c) => c.id === activeCategory)?.label}
            <button onClick={() => setActiveCategory("all")} className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer">&times;</button>
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => handleAddInCategory(activeCategory)} className="cursor-pointer text-xs gap-1">
            <Plus className="w-3 h-3" />Add {CATEGORIES.find((c) => c.id === activeCategory)?.label} Account
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap border-b pb-2">
        <span>Total: {accounts.length} accounts</span>
        <span>Active: {accounts.filter((a) => a.isActive).length}</span>
        <span>Inactive: {accounts.filter((a) => !a.isActive).length}</span>
        <span>Showing: {filteredAccounts.length}</span>
      </div>

      {/* Account Tree */}
      {filteredAccounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpen /></EmptyMedia>
            <EmptyTitle>No accounts found</EmptyTitle>
            <EmptyDescription>
              {accounts.length === 0
                ? "Load the default Chart of Accounts or create your first account"
                : "Try a different search or filter"}
            </EmptyDescription>
          </EmptyHeader>
          {accounts.length === 0 && (
            <EmptyContent>
              <Button size="sm" onClick={handleSeed} disabled={seeding} className="cursor-pointer">Load Default COA</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <div className="min-w-[760px]">
          {/* Table header */}
          <div className="grid grid-cols-[40px_1fr_120px_100px_120px_80px] md:grid-cols-[50px_1fr_150px_120px_140px_100px] gap-2 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground border-b">
            <span></span>
            <span>Account Name</span>
            <span>Type</span>
            <span>Detail Type</span>
            <span className="text-right">Balance</span>
            <span className="text-center">Actions</span>
          </div>

          {/* Grouped accounts */}
          <div className="divide-y">
            {Object.entries(groupedTree).map(([type, nodes]) => {
              const isExpanded = expandedGroups.has(type) || expandedGroups.has("all");
              const groupTotal = nodes.reduce((sum, n) => sum + n.balance + sumChildren(n), 0);
              const cat = CATEGORIES.find((c) => c.types.includes(type));

              return (
                <div key={type}>
                  {/* Group header */}
                  <div
                    className={cn(
                      "grid grid-cols-[40px_1fr_120px_100px_120px_80px] md:grid-cols-[50px_1fr_150px_120px_140px_100px] gap-2 px-4 py-2 items-center cursor-pointer hover:bg-muted/30 transition-colors",
                      cat?.bgColor
                    )}
                    onClick={() => toggleGroup(type)}
                  >
                    <span className="flex items-center justify-center">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className={cn("font-semibold text-sm flex items-center gap-2", cat?.color)}>
                      {cat?.icon}
                      {TYPE_LABELS[type] ?? type}
                      <Badge variant="secondary" className="text-xs font-normal">{nodes.length}</Badge>
                    </span>
                    <span></span>
                    <span></span>
                    <span className="text-right font-mono text-sm font-bold">{fmt(groupTotal)}</span>
                    <span className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleAddSubAccount("", type); }}
                        title={`Add ${TYPE_LABELS[type]} account`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </span>
                  </div>

                  {/* Account rows */}
                  {isExpanded && (
                    <div>
                      {nodes.map((node) => (
                        <AccountRow
                          key={node._id}
                          node={node}
                          fmt={fmt}
                          onEdit={(acc) => { setFormParentId(undefined); setFormType(undefined); setFormAccount(acc); }}
                          onDelete={deleteAccount}
                          onToggleActive={handleToggleActive}
                          onAddChild={handleAddSubAccount}
                          onOpenRegister={(id) => setRegisterAccountId(id)}
                          expandedAccounts={expandedAccounts}
                          toggleExpand={toggleAccountExpand}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Form Dialog */}
      {formAccount !== null && (
        <AccountFormDialog
          account={formAccount === "new" ? null : formAccount}
          defaultParentId={formParentId}
          defaultType={formType}
          onClose={() => { setFormAccount(null); setFormParentId(undefined); setFormType(undefined); }}
        />
      )}

      {/* Register Dialog */}
      {registerAccountId && (
        <AccountRegisterDialog
          accountId={registerAccountId}
          onClose={() => setRegisterAccountId(null)}
        />
      )}
    </div>
  );
}

// ─── Account Row Component ──────────────────────────────────────
type AccountRowProps = {
  node: AccountNode;
  fmt: (n: number) => string;
  onEdit: (acc: Doc<"accounts">) => void;
  onDelete: (args: { id: Id<"accounts"> }) => Promise<unknown>;
  onToggleActive: (acc: Doc<"accounts">) => void;
  onAddChild: (parentId: string, type: string) => void;
  onOpenRegister: (id: Id<"accounts">) => void;
  expandedAccounts: Set<string>;
  toggleExpand: (id: string) => void;
};

function AccountRow({ node, fmt, onEdit, onDelete, onToggleActive, onAddChild, onOpenRegister, expandedAccounts, toggleExpand }: AccountRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedAccounts.has(node._id);

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[40px_1fr_120px_100px_120px_80px] md:grid-cols-[50px_1fr_150px_120px_140px_100px] gap-2 px-4 py-2 items-center hover:bg-muted/20 transition-colors text-sm cursor-pointer",
          !node.isActive && "opacity-50"
        )}
        onDoubleClick={() => onOpenRegister(node._id)}
        title="Double-click to open register"
      >
        {/* Expand toggle */}
        <span
          className="flex items-center justify-center"
          style={{ paddingLeft: `${node.level * 12}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(node._id)} className="cursor-pointer p-0.5 rounded hover:bg-muted">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5" />
          )}
        </span>

        {/* Name */}
        <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${node.level * 16}px` }}>
          <span className="font-mono text-xs text-muted-foreground shrink-0 w-10">{node.code}</span>
          <span className="font-medium truncate">{node.name}</span>
          {!node.isActive && <Badge variant="secondary" className="text-[10px] px-1">Inactive</Badge>}
          {hasChildren && <Badge variant="secondary" className="text-[10px] px-1">{node.children.length} sub</Badge>}
        </div>

        {/* Type */}
        <span className="text-xs text-muted-foreground truncate">{TYPE_LABELS[node.type] ?? node.type}</span>

        {/* Sub type */}
        <span className="text-xs text-muted-foreground truncate">{node.subType ?? "—"}</span>

        {/* Balance */}
        <span className="text-right font-mono text-sm font-semibold">
          {node.balance !== 0 ? fmt(node.balance) : "—"}
        </span>

        {/* Actions */}
        <div className="flex items-center justify-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => onAddChild(node._id, node.type)} className="cursor-pointer h-7 w-7" title="Add sub-account">
            <Plus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEdit(node)} className="cursor-pointer h-7 w-7" title="Edit">
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onToggleActive(node)}
            className="cursor-pointer h-7 w-7"
            title={node.isActive ? "Deactivate" : "Activate"}
          >
            {node.isActive ? <ToggleRight className="w-3 h-3 text-green-600" /> : <ToggleLeft className="w-3 h-3 text-muted-foreground" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive cursor-pointer h-7 w-7" title="Delete">
                <Trash2 className="w-3 h-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{node.code} — {node.name}</strong>. Accounts with transactions cannot be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="cursor-pointer"
                  onClick={async () => {
                    try {
                      await onDelete({ id: node._id });
                      toast.success("Account deleted");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to delete");
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <AccountRow
              key={child._id}
              node={child}
              fmt={fmt}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              onAddChild={onAddChild}
              onOpenRegister={onOpenRegister}
              expandedAccounts={expandedAccounts}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Sum all children balances recursively
function sumChildren(node: AccountNode): number {
  let sum = 0;
  for (const child of node.children) {
    sum += child.balance + sumChildren(child);
  }
  return sum;
}
