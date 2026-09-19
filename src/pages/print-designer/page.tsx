import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import TemplateList from "./_components/template-list.tsx";
import TemplateConfigForm from "./_components/template-config-form.tsx";
import LivePreview from "./_components/live-preview.tsx";
import { DEFAULT_CONFIG, DOCUMENT_TYPE_LABELS } from "./_components/types.ts";
import type { DocumentType, TemplateConfig } from "./_components/types.ts";

const DOC_TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[];

export default function PrintDesignerPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const allTemplates = useQuery(api.printTemplates.list);
  const companyProfile = useQuery(api.companyProfile.get);
  const saveMutation = useMutation(api.printTemplates.save);
  const setDefaultMutation = useMutation(api.printTemplates.setDefault);
  const deleteMutation = useMutation(api.printTemplates.deleteTemplate);

  const [activeType, setActiveType] = useState<DocumentType>("invoice");
  const [selectedId, setSelectedId] = useState<Id<"printTemplates"> | null>(null);
  const [templateName, setTemplateName] = useState("Untitled Template");
  const [isDefault, setIsDefault] = useState(false);
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  const isOwner = currentUser?.role === "owner";
  const isManager = currentUser?.role === "manager";
  const hasAccess = isOwner || isManager;

  // Filter templates by active type
  const filteredTemplates = useMemo(
    () => (allTemplates ?? []).filter((t) => t.documentType === activeType),
    [allTemplates, activeType]
  );

  // Load template into editor
  const handleSelect = (id: Id<"printTemplates">) => {
    const tmpl = allTemplates?.find((t) => t._id === id);
    if (!tmpl) return;
    setSelectedId(id);
    setTemplateName(tmpl.name);
    setIsDefault(tmpl.isDefault);
    setConfig(tmpl.config);
  };

  // New template
  const handleNew = () => {
    setSelectedId(null);
    setTemplateName("Untitled Template");
    setIsDefault(false);
    setConfig(DEFAULT_CONFIG);
  };

  // Save
  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error("Template name is required");
      return;
    }
    setSaving(true);
    try {
      const newId = await saveMutation({
        id: selectedId ?? undefined,
        name: templateName.trim(),
        documentType: activeType,
        isDefault,
        config,
      });
      if (!selectedId) setSelectedId(newId);
      toast.success("Template saved successfully");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string; code: string };
        toast.error(message);
      } else {
        toast.error("Failed to save template");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: Id<"printTemplates">) => {
    try {
      await setDefaultMutation({ id });
      toast.success("Default template updated");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string; code: string };
        toast.error(message);
      } else {
        toast.error("Failed to set default");
      }
    }
  };

  const handleDelete = async (id: Id<"printTemplates">) => {
    try {
      await deleteMutation({ id });
      if (selectedId === id) handleNew();
      toast.success("Template deleted");
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string; code: string };
        toast.error(message);
      } else {
        toast.error("Failed to delete template");
      }
    }
  };

  if (!currentUser) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
          You do not have permission to access the Print Designer. Contact your administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold">Print Form Designer</h1>
          <p className="text-xs text-muted-foreground">Customize print layouts for your documents</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Template"}
        </Button>
      </div>

      {/* Document Type Tabs */}
      <div className="px-6 py-3 border-b flex-shrink-0">
        <Tabs value={activeType} onValueChange={(v) => { setActiveType(v as DocumentType); handleNew(); }}>
          <TabsList>
            {DOC_TYPES.map((type) => (
              <TabsTrigger key={type} value={type} className="text-xs cursor-pointer">
                {DOCUMENT_TYPE_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Main Content: 3 columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Template list */}
        <div className="w-56 border-r p-3 overflow-y-auto flex-shrink-0">
          <TemplateList
            templates={filteredTemplates}
            selectedId={selectedId}
            onSelect={handleSelect}
            onNew={handleNew}
            onSetDefault={handleSetDefault}
            onDelete={handleDelete}
            isOwner={isOwner}
          />
        </div>

        {/* Center: Config form */}
        <div className="flex-1 overflow-y-auto p-4 max-w-md">
          <div className="space-y-4">
            {/* Template name + default toggle */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Template Name</label>
                <Input
                  className="h-9"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Standard Invoice"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(!!v)} />
                <span className="text-xs">Set as default for {DOCUMENT_TYPE_LABELS[activeType]}</span>
              </label>
            </div>

            <TemplateConfigForm config={config} onChange={setConfig} />
          </div>
        </div>

        {/* Right: Live preview */}
        <div className="flex-1 border-l overflow-auto">
          <LivePreview config={config} documentType={activeType} companyProfile={companyProfile} />
        </div>
      </div>
    </div>
  );
}
