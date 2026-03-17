import { Sidebar } from "../../../../components/layout/sidebar";

export default function ProjectLayout({ children, params }: any) {
  const projectId = params.projectId;

  return (
    <div className="flex">
      <Sidebar projectId={projectId} />

      <main className="flex-1 bg-slate-100 p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}