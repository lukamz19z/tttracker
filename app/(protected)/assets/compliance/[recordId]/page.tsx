import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function ComplianceDetailPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  return (
    <PageShell>
      <PageHeader eyebrow="Compliance Record" title={`Compliance: ${recordId}`} description="View expiry, owner, project, document link and client visibility." actions={<><ActionButton href="/assets/compliance" variant="secondary" icon={<ArrowLeft size={16} />}>Back</ActionButton><ActionButton href={`/assets/compliance/${recordId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton></>} />
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <DetailGrid items={[
          { label: "Asset", value: "LV002 Toyota Hilux" },
          { label: "Type", value: "Rego" },
          { label: "Due", value: "21 Jun 2026" },
          { label: "Status", value: <StatusBadge label="Due Soon" tone="amber" /> },
          { label: "Owner", value: "Fleet" },
          { label: "Project", value: "Unassigned" },
          { label: "Client Visible", value: "Yes - status only" },
          { label: "SharePoint", value: "Document linked" },
        ]} />
      </section>
    </PageShell>
  );
}
