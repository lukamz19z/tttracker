import { ArrowLeft, Pencil, Plus, RotateCw } from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../../components";

type HistoryItem = {
  title: string;
  detail: string;
  date: string;
  status: string;
  tone: "emerald" | "amber" | "rose" | "slate" | "blue";
};

const serviceHistory: HistoryItem[] = [
  {
    title: "6-month service",
    detail: "Filters, fluids and general inspection completed.",
    date: "09 Mar 2026",
    status: "Complete",
    tone: "emerald",
  },
  {
    title: "Next service",
    detail: "Planned workshop service.",
    date: "09 Sep 2026",
    status: "Scheduled",
    tone: "blue",
  },
];

const insuranceHistory: HistoryItem[] = [
  {
    title: "Plant insurance renewal",
    detail: "Policy certificate linked to SharePoint.",
    date: "08 Sep 2026",
    status: "Current",
    tone: "emerald",
  },
];

const regoHistory: HistoryItem[] = [
  {
    title: "Registration",
    detail: "SB16HG registration certificate attached.",
    date: "09 Mar 2027",
    status: "Current",
    tone: "emerald",
  },
];

const inspectionHistory: HistoryItem[] = [
  {
    title: "CraneSafe",
    detail: "Certificate attached. Applies only to crane category.",
    date: "09 Mar 2027",
    status: "Current",
    tone: "emerald",
  },
  {
    title: "Risk assessment",
    detail: "Review before client-visible release.",
    date: "Required",
    status: "Review",
    tone: "slate",
  },
];

const documents = [
  "Service record - SharePoint linked",
  "Insurance certificate - SharePoint linked",
  "Rego certificate - SharePoint linked",
  "CraneSafe certificate - SharePoint linked",
  "Risk assessment - internal review",
];

function HistoryPanel({
  title,
  items,
}: {
  title: string;
  items: HistoryItem[];
}) {
  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <StatusBadge label={`${items.length} records`} />
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <article key={`${item.title}-${item.date}`} className="border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {item.date}
                </p>
              </div>
              <StatusBadge label={item.status} tone={item.tone} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

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
        description="Full traceability for this plant item: allocation, service history, rego, insurance, CraneSafe, documents and future Fleet Jobs."
        actions={
          <>
            <ActionButton href="/assets/plant" variant="secondary" icon={<ArrowLeft size={16} />}>
              Back
            </ActionButton>
            <ActionButton href={`/assets/plant/${assetId}/update`} variant="secondary" icon={<RotateCw size={16} />}>
              Update Asset
            </ActionButton>
            <ActionButton href={`/assets/plant/${assetId}/edit`} icon={<Pencil size={16} />}>
              Edit Core Details
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Current Details</h2>
          <div className="mt-5">
            <DetailGrid
              items={[
                { label: "Asset ID", value: assetId.toUpperCase() },
                { label: "Category", value: "Crane" },
                { label: "Project", value: "Snowy 2.0" },
                { label: "Crew", value: "Crew 1" },
                { label: "Rego", value: "SB16HG" },
                { label: "Hired", value: "No" },
                { label: "Last Service", value: "09 Mar 2026" },
                { label: "CraneSafe", value: <StatusBadge label="Current" tone="emerald" /> },
              ]}
            />
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-950">Attached Documents</h2>
            <ActionButton href={`/assets/plant/${assetId}/update`} variant="secondary" icon={<Plus size={16} />}>
              Add
            </ActionButton>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            {documents.map((document) => (
              <div key={document} className="border border-slate-200 bg-slate-50 p-3">
                {document}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <HistoryPanel title="Service History" items={serviceHistory} />
        <HistoryPanel title="Insurance History" items={insuranceHistory} />
        <HistoryPanel title="Rego History" items={regoHistory} />
        <HistoryPanel title="CraneSafe / Inspection History" items={inspectionHistory} />
      </section>
    </PageShell>
  );
}
