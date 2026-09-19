import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { cn } from "@/lib/utils.ts";
import {
  Bell, AlertTriangle, FileText, Clock, Wrench, Box,
  CheckCheck, Trash2, RefreshCw, X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";
import type { Doc } from "@/convex/_generated/dataModel.d.ts";

type Notification = Doc<"notifications">;

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  low_stock: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30" },
  overdue_bill: { icon: FileText, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" },
  bill_due_soon: { icon: Clock, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30" },
  vehicle_maintenance: { icon: Wrench, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
  asset_condition: { icon: Box, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
  general: { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" },
};

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useQuery(api.notifications.listNotifications);
  const unreadCount = useQuery(api.notifications.unreadCount);
  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const dismiss = useMutation(api.notifications.dismissNotification);
  const dismissAll = useMutation(api.notifications.dismissAll);
  const refreshAlerts = useMutation(api.notifications.refreshAlerts);
  const currentUser = useQuery(api.users.getCurrentUser);

  const canRefresh = currentUser?.role !== "staff";

  // Auto-refresh alerts when the bell is opened
  useEffect(() => {
    if (open && canRefresh) {
      refreshAlerts().catch(() => null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkRead = async (id: Doc<"notifications">["_id"]) => {
    await markAsRead({ notificationId: id }).catch(() => null);
  };

  const handleDismiss = async (id: Doc<"notifications">["_id"], e: React.MouseEvent) => {
    e.stopPropagation();
    await dismiss({ notificationId: id }).catch(() => null);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead().catch(() => toast.error("Failed"));
  };

  const handleDismissAll = async () => {
    await dismissAll().catch(() => toast.error("Failed"));
  };

  const handleRefresh = async () => {
    await refreshAlerts().catch(() => null);
    toast.success("Alerts refreshed");
  };

  const count = unreadCount ?? 0;

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute end-0 bottom-full mb-2 w-80 max-w-[calc(100vw-2rem)] bg-card border rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Notifications</span>
                {count > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{count}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canRefresh && (
                  <button onClick={handleRefresh} title="Refresh alerts" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
                {count > 0 && (
                  <button onClick={handleMarkAllRead} title="Mark all read" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                {(notifications?.length ?? 0) > 0 && (
                  <button onClick={handleDismissAll} title="Clear all" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications === undefined ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                  {canRefresh && (
                    <button onClick={handleRefresh} className="text-xs text-primary mt-1 hover:underline">
                      Check for alerts
                    </button>
                  )}
                </div>
              ) : (
                notifications.map((n: Notification) => {
                  const cfg = typeConfig[n.type] ?? typeConfig.general;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n._id}
                      onClick={() => !n.isRead && handleMarkRead(n._id)}
                      className={cn(
                        "flex gap-3 px-4 py-3 border-b last:border-0 cursor-pointer transition-colors",
                        n.isRead ? "opacity-60 hover:bg-muted/30" : "hover:bg-muted/50 bg-primary/5"
                      )}
                    >
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", cfg.bg, cfg.color)}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className={cn("text-sm font-medium leading-tight", !n.isRead && "text-foreground")}>{n.title}</p>
                          <button
                            onClick={(e) => handleDismiss(n._id, e)}
                            className="flex-shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n._creationTime)}</p>
                      </div>
                      {!n.isRead && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {(notifications?.length ?? 0) > 0 && (
              <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
                {notifications?.length} notification{notifications?.length !== 1 ? "s" : ""}
                {count > 0 && ` · ${count} unread`}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
