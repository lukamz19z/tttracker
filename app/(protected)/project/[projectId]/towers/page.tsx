import { AppShell } from "@/components/layout/app-shell";

export default async function TowersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <AppShell title="Towers" projectId={projectId}>
      <div className="bg-white p-6 rounded-2xl shadow-sm">
        Towers module coming next.
      </div>
    </AppShell>
  );
}