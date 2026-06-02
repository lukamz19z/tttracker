import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function PrestartDetailPage({ params }: { params: Promise<{ prestartId: string }> }) {
  const { prestartId } = await params;
  return (
    <PageShell>
      <PageHeader eyebrow="Prestart" title={`Prestart: ${prestartId}`} description="View the submitted daily check and any linked Fleet Job." actions={<><ActionButton href="/assets/prestarts" variant="secondary" icon={<ArrowLeft size={16} />}>Back</ActionButton><ActionButton href={`/assets/prestarts/${prestartId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton></>} />
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <DetailGrid items={[
          { label: "Asset", value: "LV004 Toyota Hilux" },
          { label: "Operator", value: "Operator" },
          { label: "Result", value: <StatusBadge label="Issue Raised" tone="amber" /> },
          { label: "Fleet Job", value: "FJ-1003" },
          { label: "Odometer", value: "84,210 km" },
          { label: "Project", value: "Snowy 2.0" },
          { label: "Client Visible", value: "No" },
          { label: "SharePoint", value: "Photos pending" },
        ]} />
      </section>
    </PageShell>
  );
}
