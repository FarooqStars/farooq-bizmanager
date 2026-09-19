import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Users, UserCog, Shield, Mail, Phone, Building, Briefcase, Circle,
  UserPlus, Trash2, AlertTriangle, KeyRound, Copy, Info, Fingerprint, BadgePlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import { useNavigate } from "react-router-dom";
import type { Doc, Id } from "@/convex/_generated/dataModel.d.ts";

const roleColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  staff: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

type Role = "owner" | "manager" | "staff";

// Generate a short display Secure ID from the full _id
function getSecureId(id: string): string {
  // Take last 8 chars of the Convex document ID for a readable secure ID
  return `SEC-${id.slice(-8).toUpperCase()}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Secure ID copied to clipboard");
}

// ─── Login Instructions Card ─────────────────────────────────────

function LoginInstructionsCard() {
  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <CardContent className="pt-6">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-300">How Team Login Works</p>
              <p className="text-muted-foreground mt-1">
                Every team member signs in on the start page with their own email and password. Here is how to manage access:
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="font-medium flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" /> Setting Up New Users
                </p>
                <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 text-xs">
                  <li>Click <strong>Add Team Member</strong></li>
                  <li>Enter their <strong>email</strong> and a starting <strong>password</strong></li>
                  <li>Give them the email and password in person or by a private message</li>
                  <li>They sign in on the start page and can change the password in their profile</li>
                </ol>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" /> Password Resets & Control
                </p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5 text-xs">
                  <li>Use the <strong>key button</strong> next to a member to set a new password</li>
                  <li>Deactivate users here to block login instantly</li>
                  <li>Change roles to control module access</li>
                  <li>Each user has a unique <strong>Secure ID</strong> for tracking</li>
                  <li>Remove users permanently with the delete button</li>
                </ul>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-blue-100/50 dark:bg-blue-900/30">
              <Fingerprint className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-muted-foreground">
                <strong>Secure ID</strong> is shown on each profile below. Use it for internal tracking, audit trails, and support requests.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Add User Dialog ─────────────────────────────────────────────

function AddUserDialog({ onClose }: { onClose: () => void }) {
  const createUser = useMutation(api.users.createManualUser);
  const createEmployee = useMutation(api.payroll.createEmployee);
  const currentUser = useQuery(api.users.getCurrentUser);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const setUserPassword = useAction(api.authActions.setUserPassword);

  // Post-creation payroll prompt state
  const [showPayrollPrompt, setShowPayrollPrompt] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<Id<"users"> | null>(null);
  const [createdUserName, setCreatedUserName] = useState("");
  const [createdUserEmail, setCreatedUserEmail] = useState("");
  const [createdUserPhone, setCreatedUserPhone] = useState("");
  const [createdUserDept, setCreatedUserDept] = useState("");
  const [createdUserTitle, setCreatedUserTitle] = useState("");
  const [addingToPayroll, setAddingToPayroll] = useState(false);

  const isOwner = currentUser?.role === "owner";

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (password && !email.trim()) {
      toast.error("An email is needed so they can sign in with this password");
      return;
    }
    if (password && password.length < 8) {
      toast.error("The password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const userId = await createUser({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        department: department.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (password) {
        try {
          await setUserPassword({ userId, email: email.trim(), password });
          toast.success(`${name} added to the team and can sign in now`);
        } catch (err) {
          const msg = (err as { data?: { message?: string } })?.data?.message;
          toast.error(`${name} was added, but the sign-in could not be saved${msg ? `: ${msg}` : ""}. Use the key button to try again.`);
        }
      } else {
        toast.success(`${name} added to the team`);
      }
      // Store the created user data and show payroll prompt
      setCreatedUserId(userId);
      setCreatedUserName(name.trim());
      setCreatedUserEmail(email.trim());
      setCreatedUserPhone(phone.trim());
      setCreatedUserDept(department.trim());
      setCreatedUserTitle(jobTitle.trim());
      setShowPayrollPrompt(true);
    } catch {
      toast.error("Failed to add user");
    } finally {
      setSaving(false);
    }
  };

  const handleAddToPayroll = async () => {
    if (!createdUserId) return;
    setAddingToPayroll(true);
    try {
      const empId = `EMP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      await createEmployee({
        name: createdUserName,
        email: createdUserEmail || undefined,
        phone: createdUserPhone || undefined,
        department: createdUserDept || undefined,
        position: createdUserTitle || undefined,
        employeeId: empId,
        hireDate: new Date().toISOString().slice(0, 10),
        baseSalary: 0,
        currency: "QAR",
        payFrequency: "monthly",
        userId: createdUserId,
      });
      toast.success(`${createdUserName} added to Payroll & HR`);
      onClose();
      navigate("/payroll");
    } catch {
      toast.error("Failed to add to payroll. You can add them manually from Payroll & HR.");
      onClose();
    } finally {
      setAddingToPayroll(false);
    }
  };

  const handleSkipPayroll = () => {
    onClose();
  };

  // Show payroll prompt after successful user creation
  if (showPayrollPrompt) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-green-600" /> Add to Payroll & HR?
            </DialogTitle>
            <DialogDescription>
              <strong>{createdUserName}</strong> has been added to the team. Would you also like to add them as an employee in Payroll & HR for salary management?
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 text-sm text-muted-foreground">
            <p>If you add them to Payroll, their basic info (name, email, phone, department, job title) will be pre-filled. You can update salary and other details later.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={handleSkipPayroll} disabled={addingToPayroll} className="cursor-pointer">
              Skip for now
            </Button>
            <Button onClick={handleAddToPayroll} disabled={addingToPayroll} className="cursor-pointer">
              {addingToPayroll ? "Adding..." : "Yes, Add to Payroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> Add Team Member
          </DialogTitle>
          <DialogDescription>
            Add a new member to your team. Give an email and a starting password so they can sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" type="email" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 5555 5555" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "manager" | "staff")}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="manager">Manager</SelectItem>}
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Sales, IT, Finance..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Job Title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Accountant, Cashier..." />
          </div>

          <div className="space-y-2">
            <Label>Starting password</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" dir="ltr" autoComplete="new-password" placeholder="At least 8 characters" />
            <p className="text-xs text-muted-foreground">Leave empty to add them without sign-in. You can set it later with the key button.</p>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !name.trim()} className="cursor-pointer">
            {saving ? "Adding..." : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Set Sign-in Password Dialog ─────────────────────────────────

function SetPasswordDialog({ user, onClose }: { user: Doc<"users">; onClose: () => void }) {
  const setUserPassword = useAction(api.authActions.setUserPassword);
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (password.length < 8) {
      toast.error("The password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await setUserPassword({ userId: user._id, email: email.trim(), password });
      toast.success(`${user.name ?? "The member"} can now sign in with the new password`);
      onClose();
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      toast.error(msg ?? "Could not save the password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Sign-in for {user.name ?? "team member"}
          </DialogTitle>
          <DialogDescription>
            Set the email and a new password. Any device where they are signed in will be signed out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" dir="ltr" autoComplete="new-password" placeholder="At least 8 characters" autoFocus />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Remove User Confirmation Dialog ─────────────────────────────

function RemoveUserDialog({
  user,
  onClose,
}: {
  user: Doc<"users">;
  onClose: () => void;
}) {
  const deleteUser = useMutation(api.users.deleteUser);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteUser({ userId: user._id });
      toast.success(`${user.name ?? "User"} removed from the team`);
      onClose();
    } catch {
      toast.error("Failed to remove user");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Remove Team Member
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The user will lose all access.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted mb-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold">
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-medium">{user.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground font-mono">{getSecureId(user._id)}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently remove <strong>{user.name}</strong> from
            the team? They will lose all access to the system.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="cursor-pointer">
            {deleting ? "Removing..." : "Remove User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────

function EditUserDialog({
  user,
  onClose,
}: {
  user: Doc<"users">;
  onClose: () => void;
}) {
  const updateUser = useMutation(api.users.updateUser);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [role, setRole] = useState<Role>(user.role);
  const [department, setDepartment] = useState(user.department ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [notes, setNotes] = useState(user.notes ?? "");
  const [isActive, setIsActive] = useState(user.isActive);
  const [saving, setSaving] = useState(false);

  const isOwner = currentUser?.role === "owner";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({
        userId: user._id,
        role: isOwner ? role : undefined,
        department: department || undefined,
        jobTitle: jobTitle || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
        isActive,
      });
      toast.success("User updated");
      onClose();
    } catch {
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1">
              <p className="font-medium">{user.name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{user.email ?? "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase">Secure ID</p>
              <p className="text-xs font-mono font-semibold text-primary">{getSecureId(user._id)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isOwner && (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={isActive ? "active" : "inactive"} onValueChange={(v) => setIsActive(v === "active")}>
                <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Sales, IT, Finance..." />
            </div>
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Accountant, Manager..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 5555 5555" />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this team member..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Existing User to Payroll Dialog ─────────────────────────

const POSITION_OPTIONS = [
  "CEO", "COO", "CFO", "CTO", "Director", "General Manager",
  "Manager", "Assistant Manager", "Supervisor", "Team Lead",
  "Accountant", "Cashier", "Sales Associate", "Marketing Specialist",
  "IT Support", "Developer", "Designer", "HR Officer",
  "Admin Assistant", "Receptionist", "Driver", "Security",
  "Warehouse Worker", "Machine Operator", "Technician",
  "Consultant", "Analyst", "Coordinator", "Intern", "Other",
];

function AddToPayrollDialog({
  user,
  onClose,
}: {
  user: Doc<"users">;
  onClose: () => void;
}) {
  const createEmployee = useMutation(api.payroll.createEmployee);
  const navigate = useNavigate();
  const [position, setPosition] = useState(user.jobTitle ?? "");
  const [customPosition, setCustomPosition] = useState("");
  const [department, setDepartment] = useState(user.department ?? "");
  const [baseSalary, setBaseSalary] = useState("0");
  const [saving, setSaving] = useState(false);

  const finalPosition = position === "Other" ? customPosition : position;

  const handleAdd = async () => {
    if (!finalPosition.trim()) {
      toast.error("Please select or enter a position");
      return;
    }
    setSaving(true);
    try {
      const empId = `EMP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      await createEmployee({
        name: user.name ?? "Unknown",
        email: user.email || undefined,
        phone: user.phone || undefined,
        department: department || undefined,
        position: finalPosition.trim(),
        employeeId: empId,
        hireDate: new Date().toISOString().slice(0, 10),
        baseSalary: parseFloat(baseSalary) || 0,
        currency: "QAR",
        payFrequency: "monthly",
        userId: user._id,
      });
      toast.success(`${user.name} added to Payroll & HR as ${finalPosition}`);
      onClose();
      navigate("/payroll");
    } catch {
      toast.error("Failed to add to payroll");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgePlus className="w-5 h-5 text-green-600" /> Add to Payroll & HR
          </DialogTitle>
          <DialogDescription>
            Add <strong>{user.name}</strong> as an employee in Payroll & HR for salary and attendance management.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Member info preview */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email ?? "No email"} | {user.role}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Position / Job Title *</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Select position..." /></SelectTrigger>
              <SelectContent>
                {POSITION_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {position === "Other" && (
              <Input
                value={customPosition}
                onChange={(e) => setCustomPosition(e.target.value)}
                placeholder="Enter custom position..."
                className="mt-2"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Department</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Sales, IT, Finance..." />
            </div>
            <div className="space-y-2">
              <Label>Base Salary</Label>
              <Input value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} type="number" placeholder="0" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            You can update salary details, allowances, bank info, and other HR data from the Payroll & HR page after adding.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={onClose} disabled={saving} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleAdd} disabled={saving || !finalPosition.trim()} className="cursor-pointer">
            {saving ? "Adding..." : "Add to Payroll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────

export default function TeamMembersTab() {
  const users = useQuery(api.users.listUsers);
  const currentUser = useQuery(api.users.getCurrentUser);
  const linkedUserIds = useQuery(api.payroll.getLinkedUserIds);
  const [editingUser, setEditingUser] = useState<Doc<"users"> | null>(null);
  const [removingUser, setRemovingUser] = useState<Doc<"users"> | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [payrollUser, setPayrollUser] = useState<Doc<"users"> | null>(null);
  const [passwordUser, setPasswordUser] = useState<Doc<"users"> | null>(null);

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  const isOwner = currentUser?.role === "owner";

  const byRole = (role: Role) => users?.filter((u) => u.role === role) ?? [];

  // Check if user is already in payroll
  const isInPayroll = (userId: string) => linkedUserIds?.includes(userId) ?? false;

  return (
    <div className="space-y-6">
      {/* Header with Add button */}
      {canManage && (
        <div className="flex justify-end">
          <Button className="cursor-pointer" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="w-4 h-4 mr-2" /> Add Team Member
          </Button>
        </div>
      )}

      {/* Login Instructions */}
      {canManage && <LoginInstructionsCard />}

      {/* Role legend */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-6 text-sm">
            {[
              { role: "owner", desc: "Full access to all features and settings", icon: Shield },
              { role: "manager", desc: "Manage team, view reports, limited admin", icon: UserCog },
              { role: "staff", desc: "Day-to-day operations (POS, sales, inventory)", icon: Users },
            ].map(({ role, desc, icon: Icon }) => (
              <div key={role} className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className={cn("px-2 py-0.5 rounded text-xs font-semibold capitalize", roleColors[role])}>{role}</span>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {users && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-3 text-center">
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-xs text-muted-foreground">Total Members</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <div className="text-2xl font-bold text-green-600">{users.filter((u) => u.isActive).length}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{byRole("owner").length}</div>
              <div className="text-xs text-muted-foreground">Owners</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{byRole("manager").length + byRole("staff").length}</div>
              <div className="text-xs text-muted-foreground">Team</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users grouped by role */}
      {(["owner", "manager", "staff"] as const).map((role) => {
        const group = byRole(role);
        return (
          <Card key={role}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold capitalize flex items-center gap-2">
                <span className={cn("px-2 py-0.5 rounded text-xs", roleColors[role])}>{role}</span>
                <span className="text-muted-foreground font-normal">{group.length} member{group.length !== 1 ? "s" : ""}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {users === undefined ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : group.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No {role}s yet</p>
              ) : (
                <div className="divide-y">
                  {group.map((user) => (
                    <div key={user._id} className="flex items-center gap-4 py-3">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold flex-shrink-0">
                        {user.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{user.name ?? "—"}</p>
                          {user.jobTitle && (
                            <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">
                              {user.jobTitle}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          {user.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {user.email}
                            </span>
                          )}
                          {user.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {user.phone}
                            </span>
                          )}
                          {user.department && (
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3" /> {user.department}
                            </span>
                          )}
                          {user.jobTitle && (
                            <span className="flex items-center gap-1 sm:hidden">
                              <Briefcase className="w-3 h-3" /> {user.jobTitle}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Secure ID */}
                      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Secure ID</p>
                          <button
                            onClick={() => copyToClipboard(getSecureId(user._id))}
                            className="flex items-center gap-1 text-xs font-mono font-semibold text-primary hover:text-primary/80 cursor-pointer transition-colors"
                            title="Click to copy"
                          >
                            <Fingerprint className="w-3 h-3" />
                            {getSecureId(user._id)}
                            <Copy className="w-2.5 h-2.5 opacity-50" />
                          </button>
                        </div>
                      </div>
                      {/* Status */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Circle className={cn("w-2 h-2 fill-current", user.isActive ? "text-green-500" : "text-gray-400")} />
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {/* Actions */}
                      {canManage && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!isInPayroll(user._id) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer text-green-600 hover:text-green-700"
                              onClick={() => setPayrollUser(user)}
                              title="Add to Payroll & HR"
                            >
                              <BadgePlus className="w-4 h-4" />
                            </Button>
                          )}
                          {isInPayroll(user._id) && (
                            <Badge variant="secondary" className="text-[10px] mr-1">In Payroll</Badge>
                          )}
                          {user._id !== currentUser?._id &&
                            (isOwner ? user.role !== "owner" : user.role === "staff") && (
                            <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setPasswordUser(user)} title="Set sign-in password">
                              <KeyRound className="w-4 h-4" />
                            </Button>
                          )}
                          {user._id !== currentUser?._id && (
                            <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setEditingUser(user)}>
                              <UserCog className="w-4 h-4" />
                            </Button>
                          )}
                          {isOwner && user._id !== currentUser?._id && user.role !== "owner" && (
                            <Button size="sm" variant="ghost" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => setRemovingUser(user)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Dialogs */}
      {showAddDialog && <AddUserDialog onClose={() => setShowAddDialog(false)} />}
      {editingUser && <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} />}
      {removingUser && <RemoveUserDialog user={removingUser} onClose={() => setRemovingUser(null)} />}
      {payrollUser && <AddToPayrollDialog user={payrollUser} onClose={() => setPayrollUser(null)} />}
      {passwordUser && <SetPasswordDialog user={passwordUser} onClose={() => setPasswordUser(null)} />}
    </div>
  );
}
