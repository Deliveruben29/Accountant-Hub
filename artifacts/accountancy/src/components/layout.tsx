import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/20">
        <AppSidebar />
        <div className="flex flex-col flex-1 relative min-w-0">
          <header className="h-16 flex items-center justify-between px-4 lg:px-8 border-b border-border/40 bg-card/50 backdrop-blur-sm z-10 sticky top-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>
            <div className="flex items-center gap-4">
              {/* Optional user avatar or theme toggle could go here */}
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
