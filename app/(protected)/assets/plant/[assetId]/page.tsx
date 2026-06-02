import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function PlantDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Plant Record"
        title={`Plant Detail: ${assetId.toUpperCase()}`}
        description="View the complete plant record, including project allocation, compliance, documents and operational notes."
        actions={
          <>
            <ActionButton href="/assets/plant" variant="secondary" icon={<ArrowLeft size={16} />}>Back</ActionButton>
            <ActionButton href={`/assets/plant/${assetId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton>
          </>
        }
      />
      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Key Details</h2>
          <div className="mt-5">
            <DetailGrid
              items={[
                { label: "Asset ID", value: assetId.toUpperCase() },
                { label: "Project", value: "Snowy 2.0" },
                { label: "Site", value: "Lobs Hole" },
                { label: "Status", value: <StatusBadge label="Available" tone="emerald" /> },
                { label: "Next Service", value: "09 Sep 2026" },
                { label: "Rego", value: "SB16HG" },
                { label: "Insurance", value: "08 Sep 2026" },
                { label: "CraneSafe", value: "09 Mar 2027" },
              ]}
            />
          </div>
        </div>
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Attached Documents</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>CraneSafe certificate: Linked to SharePoint</p>
            <p>Insurance certificate: Linked to SharePoint</p>
            <p>Risk assessment: Client visible when approved</p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
