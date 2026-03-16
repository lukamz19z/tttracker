import { AppShell } from "@/components/layout/app-shell";

export default async function DefectsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <AppShell title="Defects" projectId={projectId}>
      <div className="bg-white p-6 rounded-2xl shadow-sm">
        Defects module coming next.
      </div>
    </AppShell>
  );
}