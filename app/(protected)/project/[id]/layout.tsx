import { Sidebar } from "@/components/layout/sidebar";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <div className="flex">
      <Sidebar projectId={params.id} />

      <main className="flex-1 bg-slate-50 min-h-screen">
        {children}
      </main>
    </div>
  );
}