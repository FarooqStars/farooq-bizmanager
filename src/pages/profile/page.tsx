import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  UserCircle, Save, Upload, Phone, Mail, MapPin, Briefcase, Building,
  AlertCircle, Pen, Globe, Languages, KeyRound,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const roleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  staff: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const TIMEZONES = [
  { value: "Asia/Qatar", label: "Qatar (GMT+3)" },
  { value: "Asia/Dubai", label: "UAE (GMT+4)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia (GMT+3)" },
  { value: "Asia/Karachi", label: "Pakistan (GMT+5)" },
  { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
  { value: "Asia/Bahrain", label: "Bahrain (GMT+3)" },
  { value: "Asia/Kuwait", label: "Kuwait (GMT+3)" },
  { value: "Asia/Muscat", label: "Oman (GMT+4)" },
  { value: "Africa/Cairo", label: "Egypt (GMT+2)" },
  { value: "Asia/Amman", label: "Jordan (GMT+3)" },
  { value: "Europe/London", label: "UK (GMT+0/+1)" },
  { value: "America/New_York", label: "US Eastern (GMT-5/-4)" },
  { value: "America/Los_Angeles", label: "US Pacific (GMT-8/-7)" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "ur", label: "اردو (Urdu)" },
];

export default function ProfilePage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateMyProfile = useMutation(api.users.updateMyProfile);
  const generateUploadUrl = useMutation(api.users.generateProfileUploadUrl);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [bio, setBio] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [signaturePreview, setSignaturePreview] = useState("");

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name ?? "");
      setPhone(currentUser.phone ?? "");
      setDepartment(currentUser.department ?? "");
      setJobTitle(currentUser.jobTitle ?? "");
      setBio(currentUser.bio ?? "");
      setAddress(currentUser.address ?? "");
      setEmergencyContactName(currentUser.emergencyContactName ?? "");
      setEmergencyContactPhone(currentUser.emergencyContactPhone ?? "");
      setTimezone(currentUser.timezone ?? "");
      setPreferredLanguage(currentUser.preferredLanguage ?? "");
    }
  }, [currentUser]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMyProfile({
        name: name || undefined,
        phone: phone || undefined,
        department: department || undefined,
        jobTitle: jobTitle || undefined,
        bio: bio || undefined,
        address: address || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
        timezone: timezone || undefined,
        preferredLanguage: preferredLanguage || undefined,
      });
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (
    file: File,
    type: "avatar" | "signature"
  ) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }

    const setUploading = type === "avatar" ? setUploadingAvatar : setUploadingSignature;
    setUploading(true);

    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await response.json();

      if (type === "avatar") {
        await updateMyProfile({ avatarStorageId: storageId });
        setAvatarPreview(URL.createObjectURL(file));
      } else {
        await updateMyProfile({ signatureStorageId: storageId });
        setSignaturePreview(URL.createObjectURL(file));
      }
      toast.success(`${type === "avatar" ? "Photo" : "Signature"} uploaded`);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (currentUser === undefined) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle className="w-6 h-6" /> My Profile
        </h1>
        <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
          <Save className="w-4 h-4 mr-1" />
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </div>

      {/* Avatar & Role Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative group">
              <AvatarDisplay
                storageId={currentUser?.avatarStorageId}
                preview={avatarPreview}
                name={currentUser?.name}
              />
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-full cursor-pointer transition-opacity">
                <Upload className="w-5 h-5 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "avatar");
                  }}
                />
              </label>
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <span className="text-white text-xs">Uploading...</span>
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold text-xl">{currentUser?.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{currentUser?.email ?? "—"}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs px-2 py-0.5 rounded font-semibold capitalize", roleColors[currentUser?.role ?? "staff"])}>
                  {currentUser?.role}
                </span>
                {currentUser?.jobTitle && (
                  <span className="text-xs text-muted-foreground">{currentUser.jobTitle}</span>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Hover over your photo to upload a new one (max 5MB)</p>
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>Your basic details and contact information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><UserCircle className="w-3.5 h-3.5" /> Full Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</Label>
              <Input value={currentUser?.email ?? ""} disabled className="mt-1 bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Managed by your sign-in account</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 5555 1234" className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, Country" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Pen className="w-3.5 h-3.5" /> Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Brief description about yourself..."
              className="mt-1"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Professional Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Professional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Job Title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="CEO, Manager, Accountant..." className="mt-1" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5" /> Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Operations, Finance..." className="mt-1" />
            </div>
          </div>

          {/* Signature Upload */}
          <Separator />
          <div>
            <Label className="flex items-center gap-1.5"><Pen className="w-3.5 h-3.5" /> Digital Signature</Label>
            <p className="text-xs text-muted-foreground mb-2">Used on official documents and approvals</p>
            <div className="flex items-center gap-4">
              <SignatureDisplay storageId={currentUser?.signatureStorageId} preview={signaturePreview} />
              <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-accent transition-colors">
                <Upload className="w-4 h-4" />
                <span className="text-sm">{uploadingSignature ? "Uploading..." : "Upload Signature"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingSignature}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f, "signature");
                  }}
                />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Emergency Contact
          </CardTitle>
          <CardDescription>Person to contact in case of emergency</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Contact Name</Label>
              <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Family member or friend" className="mt-1" />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="+974 5555 0000" className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
          <CardDescription>Your personal display and notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Time Zone</Label>
              <Select value={timezone || "none"} onValueChange={(v) => setTimezone(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1 cursor-pointer"><SelectValue placeholder="Select timezone..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="cursor-pointer">-- Not set --</SelectItem>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value} className="cursor-pointer">{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Languages className="w-3.5 h-3.5" /> Preferred Language</Label>
              <Select value={preferredLanguage || "none"} onValueChange={(v) => setPreferredLanguage(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1 cursor-pointer"><SelectValue placeholder="Select language..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="cursor-pointer">-- System default --</SelectItem>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value} className="cursor-pointer">{lang.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Notes (read-only) */}
      {currentUser?.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin Notes</CardTitle>
            <CardDescription>Notes set by the admin about your account</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{currentUser.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Sign-in password */}
      {currentUser && <ChangePasswordCard userId={currentUser._id} email={currentUser.email ?? ""} />}
    </div>
  );
}

// ─── Change Own Password ───────────────────────────────────────────
function ChangePasswordCard({ userId, email }: { userId: Id<"users">; email: string }) {
  const setUserPassword = useAction(api.authActions.setUserPassword);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (password.length < 8) {
      toast.error("The password must be at least 8 characters");
      return;
    }
    if (password !== password2) {
      toast.error("The two passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await setUserPassword({ userId, email, password });
      toast.success("Password changed. Please sign in again with the new password.");
      setTimeout(() => window.location.assign("/"), 1500);
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      toast.error(msg ?? "Could not change the password");
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Sign-in Password
        </CardTitle>
        <CardDescription>Change the password you use to sign in. You will be signed out on all devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" dir="ltr" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="space-y-2">
            <Label>Type it again</Label>
            <Input type="password" dir="ltr" autoComplete="new-password" value={password2}
              onChange={(e) => setPassword2(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !email} className="cursor-pointer">
            {saving ? "Saving..." : "Change Password"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Avatar Display Component ──────────────────────────────────────
function AvatarDisplay({ storageId, preview, name }: { storageId?: string; preview: string; name?: string }) {
  const url = useQuery(api.users.getFileUrl, storageId ? { storageId } : "skip");

  const displayUrl = preview || url;
  if (displayUrl) {
    return (
      <img
        src={displayUrl}
        alt="Profile"
        className="w-20 h-20 rounded-full object-cover border-2 border-border"
      />
    );
  }
  return (
    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold border-2 border-border">
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ─── Signature Display Component ──────────────────────────────────
function SignatureDisplay({ storageId, preview }: { storageId?: string; preview: string }) {
  const url = useQuery(api.users.getFileUrl, storageId ? { storageId } : "skip");
  const displayUrl = preview || url;

  if (displayUrl) {
    return (
      <img
        src={displayUrl}
        alt="Signature"
        className="h-12 max-w-40 object-contain border rounded p-1 bg-white dark:bg-background"
      />
    );
  }
  return (
    <div className="h-12 w-32 border rounded flex items-center justify-center text-xs text-muted-foreground bg-muted">
      No signature
    </div>
  );
}
