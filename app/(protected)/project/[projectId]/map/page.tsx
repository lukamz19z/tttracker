import { AppShell } from "@/components/layout/app-shell";

export default async function MapPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <AppShell title="Map" projectId={projectId}>
      <div className="bg-white p-6 rounded-2xl shadow-sm">
        Map module coming next.
      </div>
    </AppShell>
  );
}