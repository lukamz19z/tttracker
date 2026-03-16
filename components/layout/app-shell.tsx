import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  title,
  projectId,
}: {
  children: React.ReactNode;
  title: string;
  projectId?: string;
}) {
  return (
    <div className="flex bg-slate-100 min-h-screen">
      <Sidebar projectId={projectId} />

      <div className="flex-1">
        <Topbar title={title} />

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}