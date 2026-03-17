import { Sidebar } from "../../../../components/layout/sidebar";

export default function ProjectLayout({
  children,
  params,
}: any) {
  const projectId = params.projectId;

  return (
    <div className="flex min-h-screen">

      {/* SIDEBAR */}
      <Sidebar projectId={projectId} />

      {/* MAIN CONTENT */}
      <main className="flex-1 p-6 bg-slate-100">
        {children}
      </main>

    </div>
  );
}