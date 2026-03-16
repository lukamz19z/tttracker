import { AppShell } from "@/components/layout/app-shell";

type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectDashboard({ params }: Props) {
  const { projectId } = await params;

  return (
    <AppShell title={`Dashboard — ${projectId}`} projectId={projectId}>
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Towers" value="120" />
        <StatCard title="Towers Complete" value="48" />
        <StatCard title="Open Defects" value="6" />
        <StatCard title="Daily Dockets" value="14" />
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm">
        Graphs area
      </div>
    </AppShell>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm">
      <p className="text-slate-500 text-sm">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}