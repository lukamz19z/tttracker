import { AppShell } from "@/components/layout/app-shell";

export default async function TowerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    projectId: string;
    towerId: string;
  }>;
}) {
  const { projectId, towerId } = await params;

  return (
    <AppShell
      projectId={projectId}
      towerId={towerId}
    >
      {children}
    </AppShell>
  );
}