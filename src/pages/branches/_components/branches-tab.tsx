import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Mail,
  Star,
  Users,
  Warehouse,
  Package,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import BranchDialog from "./branch-dialog.tsx";

export default function BranchesTab() {
  const { t } = useTranslation();
  const branches = useQuery(api.branches.listBranches, { includeInactive: true });
  const deleteBranch = useMutation(api.branches.deleteBranch);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Id<"branches"> | null>(null);

  if (branches === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full" />
        ))}
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
            <EmptyTitle>{t("branches.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("branches.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 size-4" /> {t("branches.addBranch")}
            </Button>
          </EmptyContent>
        </Empty>
        <BranchDialog open={dialogOpen} onOpenChange={setDialogOpen} branchId={null} />
      </>
    );
  }

  const handleDelete = async (branchId: Id<"branches">) => {
    try {
      await deleteBranch({ branchId });
      toast.success(t("branches.deleted"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("branches.deleteFailed");
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("branches.total", { count: branches.length })}
        </p>
        <Button size="sm" className="cursor-pointer" onClick={() => { setEditingBranch(null); setDialogOpen(true); }}>
          <Plus className="mr-1 size-4" /> {t("branches.addBranch")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <BranchCard
            key={branch._id}
            branch={branch}
            onEdit={() => { setEditingBranch(branch._id); setDialogOpen(true); }}
            onDelete={() => handleDelete(branch._id)}
          />
        ))}
      </div>

      <BranchDialog open={dialogOpen} onOpenChange={setDialogOpen} branchId={editingBranch} />
    </div>
  );
}

function BranchCard({
  branch,
  onEdit,
  onDelete,
}: {
  branch: {
    _id: Id<"branches">;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
    city?: string;
    country?: string;
    isHeadquarters: boolean;
    isActive: boolean;
  };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const stats = useQuery(api.branches.getBranchStats, { branchId: branch._id });

  return (
    <Card className={!branch.isActive ? "opacity-60" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">{branch.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{branch.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {branch.isHeadquarters && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Star className="size-3" /> {t("branches.hq")}
              </Badge>
            )}
            {!branch.isActive && (
              <Badge variant="destructive" className="text-xs">{t("branches.inactive")}</Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 cursor-pointer p-0">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
                  <Pencil className="mr-2 size-3.5" /> {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer text-destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 size-3.5" /> {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(branch.address || branch.city) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{[branch.address, branch.city, branch.country].filter(Boolean).join(", ")}</span>
          </div>
        )}
        {branch.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            <span>{branch.phone}</span>
          </div>
        )}
        {branch.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="size-3 shrink-0" />
            <span className="truncate">{branch.email}</span>
          </div>
        )}
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div className="text-center">
            <Warehouse className="mx-auto size-3.5 text-muted-foreground" />
            <p className="mt-0.5 text-xs font-medium">{stats?.warehouseCount ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">{t("branches.warehouses")}</p>
          </div>
          <div className="text-center">
            <Users className="mx-auto size-3.5 text-muted-foreground" />
            <p className="mt-0.5 text-xs font-medium">{stats?.employeeCount ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">{t("branches.employees")}</p>
          </div>
          <div className="text-center">
            <Package className="mx-auto size-3.5 text-muted-foreground" />
            <p className="mt-0.5 text-xs font-medium">{stats?.totalInventoryItems ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">{t("branches.items")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
