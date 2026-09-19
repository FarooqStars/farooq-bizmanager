import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, MoreHorizontal,
  Truck, Boxes, Users, UserCircle, Warehouse, X, LogOut,
  ActivityIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils.ts";
import { useAuth } from "@/hooks/use-auth.ts";
import NotificationBell from "@/components/notification-bell.tsx";
import GlobalSearch from "@/components/global-search.tsx";

const primaryTabs = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/products", label: "Products", icon: Package },
  { to: "/vendors", label: "Vendors", icon: Receipt },
];

const moreItems = [
  { to: "/warehouses", label: "Warehouses", icon: Warehouse },
  { to: "/vehicles", label: "Vehicles", icon: Truck },
  { to: "/assets", label: "Assets", icon: Boxes },
  { to: "/users", label: "Team", icon: Users, roles: ["owner", "manager"] as string[] },
  { to: "/activity", label: "Activity", icon: ActivityIcon, roles: ["owner", "manager"] as string[] },
  { to: "/profile", label: "My Profile", icon: UserCircle },
];

export default function BottomTabBar() {
  const [showMore, setShowMore] = useState(false);
  const { signout } = useAuth();
  const currentUser = useQuery(api.users.getCurrentUser);
  const role = currentUser?.role ?? "staff";

  const visibleMore = moreItems.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <>
      {/* Bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t flex items-stretch md:hidden safe-bottom">
        {primaryTabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* More button */}
        <button
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>More</span>
        </button>
      </nav>

      {/* More drawer */}
      {showMore && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMore(false)} />
          <div className="relative bg-card rounded-t-2xl border-t shadow-2xl safe-bottom">
            {/* Handle */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b">
              <div className="flex items-center gap-2">
                <img src="/brand/icon-64.png" alt="Farooq BizManager" className="w-7 h-7 rounded-lg" />
                <span className="font-semibold text-sm">Farooq BizManager</span>
              </div>
              <button onClick={() => setShowMore(false)} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* User info */}
            {currentUser && (
              <div className="px-4 py-3 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {currentUser.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{currentUser.name ?? "User"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{currentUser.role}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-4 py-3 border-b">
              <GlobalSearch onClose={() => setShowMore(false)} />
            </div>

            {/* Links grid */}
            <div className="px-4 py-3 grid grid-cols-3 gap-2">
              {visibleMore.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setShowMore(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </NavLink>
              ))}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-2 px-4 py-3 border-t">
              <div className="flex-1">
                <NotificationBell />
              </div>
              <button
                onClick={() => { signout(); setShowMore(false); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
