import { ArrowLeft, Pencil } from "lucide-react";
import { ActionButton, DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Vehicle Record"
        title={`Vehicle Detail: ${vehicleId.toUpperCase()}`}
        description="Full vehicle profile with extra details kept out of the main register."
        actions={<><ActionButton href="/assets/vehicles" variant="secondary" icon={<ArrowLeft size={16} />}>Back</ActionButton><ActionButton href={`/assets/vehicles/${vehicleId}/edit`} icon={<Pencil size={16} />}>Edit</ActionButton></>}
      />
      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Fleet Details</h2>
          <div className="mt-5">
            <DetailGrid items={[
              { label: "Vehicle ID", value: vehicleId.toUpperCase() },
              { label: "Project", value: "Snowy 2.0" },
              { label: "Rego", value: "S384CTL" },
              { label: "Status", value: <StatusBadge label="In Use" tone="emerald" /> },
              { label: "eHub", value: "Yes" },
              { label: "Dash Cam", value: "Yes" },
              { label: "Alert Button", value: "Yes" },
              { label: "Fuel Card", value: "Yes" },
            ]} />
          </div>
        </div>
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Documents & Client Data</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>Registration: SharePoint linked</p>
            <p>Insurance: Internal only</p>
            <p>Client view: show availability and compliance status only</p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
