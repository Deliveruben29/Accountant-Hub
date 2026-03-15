import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@workspace/replit-auth-web";
import { LayoutDashboard, ReceiptText, UploadCloud, Landmark, User, Shield } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  const navItems = [
    { titleKey: "nav.dashboard", url: "/", icon: LayoutDashboard },
    { titleKey: "nav.transactions", url: "/transactions", icon: ReceiptText },
    { titleKey: "nav.accounts", url: "/accounts", icon: Landmark },
    { titleKey: "nav.upload", url: "/upload", icon: UploadCloud },
  ];

  const accountItems = [
    { titleKey: "nav.profile", url: "/profile", icon: User },
    ...(user?.role === "admin" ? [{ titleKey: "nav.admin", url: "/admin", icon: Shield }] : []),
  ];

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarHeader className="h-16 px-6 flex items-center justify-start border-b border-border/50">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="Accountancy Logo"
            className="w-8 h-8 object-contain rounded"
          />
          <h1 className="font-display font-bold text-xl text-sidebar-foreground tracking-tight">
            Accountancy
          </h1>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.titleKey}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="hover-elevate active-elevate-2 transition-all duration-200"
                    >
                      <Link href={item.url} className="flex items-center gap-3 py-2.5">
                        <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`font-medium ${isActive ? "text-sidebar-foreground" : "text-muted-foreground"}`}>
                          {t(item.titleKey)}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.titleKey}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="hover-elevate active-elevate-2 transition-all duration-200"
                    >
                      <Link href={item.url} className="flex items-center gap-3 py-2.5">
                        <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`font-medium ${isActive ? "text-sidebar-foreground" : "text-muted-foreground"}`}>
                          {t(item.titleKey)}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-3 border-t border-border/50">
        {user && (
          <Link href="/profile" className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User"}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
          </Link>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
