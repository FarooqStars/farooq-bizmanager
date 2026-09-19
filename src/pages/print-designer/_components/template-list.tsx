import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Plus, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type Template = {
  _id: Id<"printTemplates">;
  name: string;
  isDefault: boolean;
};

type Props = {
  templates: Template[];
  selectedId: Id<"printTemplates"> | null;
  onSelect: (id: Id<"printTemplates">) => void;
  onNew: () => void;
  onSetDefault: (id: Id<"printTemplates">) => void;
  onDelete: (id: Id<"printTemplates">) => void;
  isOwner: boolean;
};

export default function TemplateList({
  templates,
  selectedId,
  onSelect,
  onNew,
  onSetDefault,
  onDelete,
  isOwner,
}: Props) {
  return (
    <div className="space-y-2">
      <Button size="sm" className="w-full cursor-pointer" onClick={onNew}>
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        New Template
      </Button>

      {templates.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No templates yet. Create one to get started.
        </p>
      )}

      <div className="space-y-1">
        {templates.map((tmpl) => (
          <div
            key={tmpl._id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors group",
              selectedId === tmpl._id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-muted"
            )}
            onClick={() => onSelect(tmpl._id)}
          >
            <span className="flex-1 truncate text-xs font-medium">{tmpl.name}</span>
            {tmpl.isDefault && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Default</Badge>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5">
              {!tmpl.isDefault && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSetDefault(tmpl._id); }}
                  className="p-1 rounded hover:bg-primary/10 cursor-pointer"
                  title="Set as default"
                >
                  <Star className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
              {isOwner && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(tmpl._id); }}
                  className="p-1 rounded hover:bg-destructive/10 cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
