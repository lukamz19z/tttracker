import { Sidebar } from "@/components/layout/sidebar";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex">

      <Sidebar projectId={projectId} />

      <main className="flex-1 p-6">
        {children}
      </main>

    </div>
  );
}