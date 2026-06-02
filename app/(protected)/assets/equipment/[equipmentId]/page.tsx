import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function EquipmentDetailPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const { equipmentId } = await params;

  return (
    <PageShell>
      <PageHeader eyebrow="Equipment Record" title={`Equipment Detail: ${equipmentId.toUpperCase()}`} description="Full equipment profile with inspection history, project allocation and attached documents." actions={<><ActionButton href="/assets/equipment" variant="secondary" icon={<ArrowLeft size={16} />}>Back</ActionButton><ActionButton href={`/assets/equipment/${equipmentId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton></>} />
      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Inspection Details</h2>
          <div className="mt-5">
            <DetailGrid items={[
              { label: "Serial", value: equipmentId.toUpperCase() },
              { label: "Type", value: "Lifting Gear" },
              { label: "Project", value: "Snowy 2.0" },
              { label: "Crew", value: "Crew 3" },
              { label: "Tag", value: "Green" },
              { label: "Last Inspection", value: "02 Mar 2026" },
              { label: "Next Due", value: "02 Jun 2026" },
              { label: "Status", value: <StatusBadge label="Due Soon" tone="amber" /> },
            ]} />
          </div>
        </div>
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Documents</h2>
          <p className="mt-4 text-sm leading-6 text-slate-700">Inspection certificate and photos attach to this item and can sync to SharePoint.</p>
        </div>
      </section>
    </PageShell>
  );
}
