import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return (
    <PageShell>
      <PageHeader eyebrow="Attached Document" title={`Document: ${documentId}`} description="Documents are attached to individual assets, jobs or compliance records and can sync to SharePoint." actions={<><ActionButton href="/assets" variant="secondary" icon={<ArrowLeft size={16} />}>Back to Assets</ActionButton><ActionButton href={`/assets/documents/${documentId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton></>} />
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <DetailGrid items={[
          { label: "Asset", value: "MC001 Liebherr LTM1220" },
          { label: "Document", value: "CraneSafe Certificate" },
          { label: "Client Visible", value: "Yes" },
          { label: "SharePoint", value: <StatusBadge label="Linked" tone="emerald" /> },
          { label: "Owner", value: "Fleet" },
          { label: "Category", value: "Certificate" },
          { label: "Updated", value: "09 Mar 2026" },
          { label: "Status", value: "Current" },
        ]} />
      </section>
    </PageShell>
  );
}
