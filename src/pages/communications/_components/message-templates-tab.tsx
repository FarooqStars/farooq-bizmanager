import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Plus, FileText, Trash2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const TEMPLATE_TYPES = [
  { value: "invoice_reminder", label: "Invoice Reminder" },
  { value: "quotation_followup", label: "Quotation Follow-up" },
  { value: "payment_receipt", label: "Payment Receipt" },
  { value: "delivery_note", label: "Delivery Note" },
  { value: "general", label: "General" },
];

const TYPE_COLORS: Record<string, string> = {
  invoice_reminder: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  quotation_followup: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  payment_receipt: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  delivery_note: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function MessageTemplatesTab() {
  const templates = useQuery(api.communications.listMessageTemplates);
  const createTemplate = useMutation(api.communications.createMessageTemplate);
  const deleteTemplate = useMutation(api.communications.deleteMessageTemplate);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("general");

  if (!templates) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const handleCreate = async () => {
    if (!name || !subject || !body) {
      toast.error("All fields are required");
      return;
    }
    try {
      await createTemplate({
        name,
        subject,
        body,
        type: type as "invoice_reminder" | "quotation_followup" | "payment_receipt" | "delivery_note" | "general",
      });
      toast.success("Template created");
      setShowCreate(false);
      setName(""); setSubject(""); setBody(""); setType("general");
    } catch {
      toast.error("Failed to create template");
    }
  };

  const handleDelete = async (id: Id<"messageTemplates">) => {
    try {
      await deleteTemplate({ templateId: id });
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="cursor-pointer" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Create Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>No message templates</EmptyTitle>
            <EmptyDescription>Create reusable templates for common messages like reminders, receipts, and follow-ups</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>Create Template</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t._id}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge className={TYPE_COLORS[t.type]}>{TEMPLATE_TYPES.find((tt) => tt.value === t.type)?.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Subject: {t.subject}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                </div>
                <Button size="sm" variant="ghost" className="cursor-pointer text-destructive" onClick={() => handleDelete(t._id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Message Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Template Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overdue Reminder" />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Subject Line</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Payment Reminder - Invoice {{number}}" />
            </div>
            <div className="space-y-1">
              <Label>Message Body</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Dear {{name}},&#10;&#10;This is a reminder that..." />
              <p className="text-xs text-muted-foreground">Use placeholders like {"{{name}}"}, {"{{number}}"}, {"{{amount}}"}, {"{{date}}"}</p>
            </div>
            <Button className="w-full cursor-pointer" onClick={handleCreate}>Create Template</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
