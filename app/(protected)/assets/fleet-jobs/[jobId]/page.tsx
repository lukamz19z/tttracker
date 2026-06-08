import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function FleetJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  return (
    <PageShell>
      <PageHeader eyebrow="Fleet Job" title={`Fleet Job: ${jobId}`} description="View job details, triage notes, assignment and close-out information." actions={<><ActionButton href="/assets/maintenance" variant="secondary" icon={<ArrowLeft size={16} />}>Back</ActionButton><ActionButton href={`/assets/maintenance/${jobId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton></>} />
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <DetailGrid items={[
          { label: "Asset", value: "LV004 Toyota Hilux" },
          { label: "Status", value: <StatusBadge label="Triage" tone="amber" /> },
          { label: "Priority", value: "Medium" },
          { label: "Safety", value: "Monitor" },
          { label: "Assigned", value: "Fleet Manager" },
          { label: "Project", value: "Snowy 2.0" },
          { label: "Client Visible", value: "No" },
          { label: "SharePoint", value: "Photos pending" },
        ]} />
      </section>
    </PageShell>
  );
}
