import { Sidebar } from "@/components/layout/sidebar";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  return (
    <div className="flex">
      <Sidebar projectId={params.projectId} />

      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}