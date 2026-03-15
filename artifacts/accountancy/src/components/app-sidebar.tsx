import { Link, useLocation } from "wouter";
import { LayoutDashboard, ReceiptText, UploadCloud, Landmark } from "lucide-react";
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
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Transactions", url: "/transactions", icon: ReceiptText },
  { title: "Accounts", url: "/accounts", icon: Landmark },
  { title: "Upload Statement", url: "/upload", icon: UploadCloud },
];

export function AppSidebar() {
  const [location] = useLocation();

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
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      className="hover-elevate active-elevate-2 transition-all duration-200"
                    >
                      <Link href={item.url} className="flex items-center gap-3 py-2.5">
                        <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`font-medium ${isActive ? "text-sidebar-foreground" : "text-muted-foreground"}`}>
                          {item.title}
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
    </Sidebar>
  );
}
