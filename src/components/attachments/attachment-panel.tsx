import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Paperclip,
  Upload,
  Trash2,
  Download,
  FileText,
  Image,
  File,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";

type RecordType =
  | "invoice"
  | "bill"
  | "expense"
  | "asset"
  | "product"
  | "employee"
  | "sale"
  | "purchase_order"
  | "warranty";

type AttachmentPanelProps = {
  recordType: RecordType;
  recordId: string;
  title?: string;
  compact?: boolean;
};

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (fileType.includes("pdf")) return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentPanel({
  recordType,
  recordId,
  title,
  compact = false,
}: AttachmentPanelProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const attachments = useQuery(api.attachments.listAttachments, {
    recordType,
    recordId,
  });
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const addAttachment = useMutation(api.attachments.addAttachment);
  const deleteAttachment = useMutation(api.attachments.deleteAttachment);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Max 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t("attachments.tooLarge"));
        return;
      }

      setUploading(true);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();

        await addAttachment({
          recordType,
          recordId,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          storageId,
          description: description || undefined,
        });
        setDescription("");
        setShowUpload(false);
        toast.success(t("attachments.uploaded"));
      } catch {
        toast.error(t("attachments.uploadFailed"));
      } finally {
        setUploading(false);
        // Reset input
        e.target.value = "";
      }
    },
    [generateUploadUrl, addAttachment, recordType, recordId, description, t]
  );

  const handleDelete = useCallback(
    async (attachmentId: string) => {
      try {
        await deleteAttachment({
          attachmentId: attachmentId as never,
        });
        toast.success(t("attachments.deleted"));
      } catch {
        toast.error(t("attachments.deleteFailed"));
      }
    },
    [deleteAttachment, t]
  );

  if (!attachments) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Paperclip className="h-4 w-4" />
            {title ?? t("attachments.title")} ({attachments.length})
          </div>
          <label className="cursor-pointer">
            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={uploading} asChild>
              <span>
                <Upload className="h-3 w-3 mr-1" />
                {uploading ? "..." : t("attachments.upload")}
              </span>
            </Button>
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map((att) => (
              <div key={att._id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                {getFileIcon(att.fileType)}
                <span className="flex-1 truncate">{att.fileName}</span>
                <span className="text-muted-foreground">{formatFileSize(att.fileSize)}</span>
                {att.url && (
                  <a href={att.url} target="_blank" rel="noreferrer" className="cursor-pointer">
                    <Download className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
                <button onClick={() => handleDelete(att._id)} className="cursor-pointer">
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            {title ?? t("attachments.title")} ({attachments.length})
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowUpload(!showUpload)}
            className="cursor-pointer"
          >
            {showUpload ? <X className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showUpload && (
          <div className="space-y-2 p-3 rounded-lg border border-dashed">
            <Input
              placeholder={t("attachments.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="cursor-pointer">
              <Button size="sm" disabled={uploading} className="w-full cursor-pointer" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? t("attachments.uploading") : t("attachments.selectFile")}
                </span>
              </Button>
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            <p className="text-xs text-muted-foreground">{t("attachments.maxSize")}</p>
          </div>
        )}

        {attachments.length === 0 && !showUpload && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("attachments.empty")}
          </p>
        )}

        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div
                key={att._id}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/30"
              >
                {getFileIcon(att.fileType)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{att.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(att.fileSize)} &middot; {att.uploaderName} &middot;{" "}
                    {formatDistanceToNow(new Date(att.uploadedAt), { addSuffix: true })}
                  </p>
                  {att.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{att.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {att.url && (
                    <a href={att.url} target="_blank" rel="noreferrer" className="cursor-pointer">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive cursor-pointer"
                    onClick={() => handleDelete(att._id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
