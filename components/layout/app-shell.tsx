"use client";

import { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

type AppShellProps = {
  projectId?: string;
  towerId?: string;
  children: ReactNode;
};

export function AppShell({
  projectId,
  towerId,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar />

      <div className="flex">
        {projectId && (
          <Sidebar
            projectId={projectId}
            towerId={towerId}
          />
        )}

        <main className="flex-1 min-w-0 overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}