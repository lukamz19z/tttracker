import { AppShell } from "@/components/layout/app-shell";

export default async function DocketsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <AppShell title="Daily Dockets" projectId={projectId}>
      <div className="bg-white p-6 rounded-2xl shadow-sm">
        Daily docket module coming next.
      </div>
    </AppShell>
  );
}