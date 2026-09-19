import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { toast } from "sonner";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type EmployeePhotoProps = {
  employeeId: Id<"employees">;
  photoUrl: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  canEdit?: boolean;
};

export default function EmployeePhoto({ employeeId, photoUrl, name, size = "md", canEdit = false }: EmployeePhotoProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.payroll.generateUploadUrl);
  const setPhoto = useMutation(api.payroll.setEmployeePhoto);
  const removePhoto = useMutation(api.payroll.removeEmployeePhoto);

  const sizeClasses = {
    sm: "w-10 h-10 text-sm",
    md: "w-16 h-16 text-lg",
    lg: "w-24 h-24 text-2xl",
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await response.json();
      await setPhoto({ employeeId, storageId });
      toast.success("Photo updated");
    } catch {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await removePhoto({ employeeId });
      toast.success("Photo removed");
    } catch {
      toast.error("Failed to remove photo");
    }
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative group">
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center font-bold bg-primary/10 text-primary flex-shrink-0`}>
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
        )}
      </div>

      {canEdit && !uploading && (
        <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
          <div className="flex gap-1">
            <button
              onClick={() => inputRef.current?.click()}
              className="p-1 rounded-full bg-white/90 text-gray-700 hover:bg-white cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            {photoUrl && (
              <button
                onClick={handleRemove}
                className="p-1 rounded-full bg-white/90 text-red-600 hover:bg-white cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
