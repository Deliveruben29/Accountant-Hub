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
          {/* TBF Brand Banner strip */}
          <div className="w-full flex-shrink-0 tbf-banner-glow">
            <img
              src={`${import.meta.env.BASE_URL}images/tbf-banner.png`}
              alt="Thebasefrequency"
              className="w-full object-cover"
              style={{ height: "52px", objectPosition: "center" }}
            />
          </div>

          {/* Top bar */}
          <header className="h-12 flex items-center justify-between px-4 lg:px-8 border-b border-border/40 bg-card/40 backdrop-blur-sm z-10 sticky top-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>
            <div className="flex items-center gap-4" />
          </header>

          <main className="flex-1 overflow-auto tbf-bg">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
