import { Plus, RotateCw, Wrench } from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  FilterBar,
  FilterInput,
  FilterSelect,
  KpiCard,
  PageHeader,
  PageShell,
  RegisterList,
  StatusBadge,
} from "../components";
import { RecordActions } from "../record-actions";

type PlantAsset = {
  id: string;
  assetId: string;
  name: string;
  make: string;
  type: string;
  crew: string;
  project: string;
  status: string;
  nextService: string;
  craneSafe: string;
  rego: string;
  hired: string;
  tone: "emerald" | "amber" | "rose" | "blue";
};

const plantAssets: PlantAsset[] = [
  {
    id: "mc001",
    assetId: "MC001",
    name: "Liebherr LTM1220",
    make: "Liebherr",
    type: "Mobile Crane",
    crew: "Crew 1",
    project: "Snowy 2.0",
    status: "Available",
    nextService: "09 Sep 2026",
    craneSafe: "09 Mar 2027",
    rego: "SB16HG",
    hired: "No",
    tone: "emerald",
  },
  {
    id: "mc003",
    assetId: "MC003",
    name: "Grove GMK5220",
    make: "Grove",
    type: "Mobile Crane",
    crew: "Lifting Crew",
    project: "Maragle",
    status: "Due Soon",
    nextService: "05 Nov 2025",
    craneSafe: "20 Jun 2026",
    rego: "No Rego",
    hired: "Yes",
    tone: "amber",
  },
  {
    id: "th003",
    assetId: "TH003",
    name: "Merlo P40.17EE",
    make: "Merlo",
    type: "Telehandler",
    crew: "Workshop",
    project: "Unassigned",
    status: "In Use",
    nextService: "05 Mar 2026",
    craneSafe: "N/A",
    rego: "No Rego",
    hired: "No",
    tone: "blue",
  },
  {
    id: "th004",
    assetId: "TH004",
    name: "Merlo P40.17PLUS",
    make: "Merlo",
    type: "Telehandler",
    crew: "Crew 2",
    project: "Maragle",
    status: "Review",
    nextService: "06 Jul 2026",
    craneSafe: "N/A",
    rego: "No Rego",
    hired: "Yes",
    tone: "rose",
  },
];

export default function PlantPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Plant"
        description="Major plant register for cranes, telehandlers, generators and hired plant. The register shows current allocation and key expiry dates; each asset view holds full history."
        actions={
          <>
            <ActionButton href="/assets/maintenance/new" variant="secondary" icon={<Wrench size={16} />}>
              Raise Job
            </ActionButton>
            <ActionButton href="/assets/plant/new" icon={<Plus size={16} />}>
              Add Plant
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Plant" value="4" detail="sample register rows" tone="blue" />
        <KpiCard label="Available" value="2" detail="ready for allocation" tone="emerald" />
        <KpiCard label="Due Soon" value="1" detail="service or compliance" tone="amber" />
        <KpiCard label="Review" value="1" detail="fleet manager check" tone="rose" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search asset, rego, make, serial..." />
        <FilterSelect label="Plant type" options={["All plant types", "Mobile Crane", "Telehandler", "Generator"]} />
        <FilterSelect label="Site" options={["All sites", "Lobs Hole", "Maragle", "Depot"]} />
        <FilterSelect label="Status" options={["All statuses", "Available", "In Use", "Due Soon", "Review"]} />
      </FilterBar>

      <RegisterList
        title="Plant Register"
        description="Use Update Asset to add a new service, rego, insurance, CraneSafe or document event to an existing plant record."
        items={plantAssets}
        getKey={(asset) => asset.id}
        columns={[
          {
            label: "Asset",
            render: (asset) => (
              <div>
                <p className="font-semibold text-slate-950">{asset.assetId}</p>
                <p className="mt-1 text-slate-600">{asset.name}</p>
              </div>
            ),
          },
          { label: "Type", render: (asset) => asset.type },
          { label: "Make", render: (asset) => asset.make },
          {
            label: "Allocation",
            render: (asset) => (
              <div>
                <p className="font-semibold text-slate-950">{asset.crew}</p>
                <p className="mt-1 text-slate-600">{asset.project}</p>
              </div>
            ),
          },
          { label: "Rego", render: (asset) => asset.rego },
          { label: "Next Service", render: (asset) => asset.nextService },
          { label: "CraneSafe", render: (asset) => asset.craneSafe },
          { label: "Hired", render: (asset) => asset.hired },
          {
            label: "Update",
            render: (asset) => (
              <ActionButton
                href={`/assets/plant/${asset.id}/update`}
                variant="secondary"
                icon={<RotateCw size={14} />}
              >
                Update Asset
              </ActionButton>
            ),
          },
          {
            label: "Status",
            render: (asset) => <StatusBadge label={asset.status} tone={asset.tone} />,
          },
          {
            label: "Actions",
            render: (asset) => (
              <RecordActions
                recordType="plant"
                recordLabel={`${asset.assetId} ${asset.name}`}
                viewHref={`/assets/plant/${asset.id}`}
                editHref={`/assets/plant/${asset.id}/edit`}
              />
            ),
          },
        ]}
        renderMobile={(asset) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{asset.assetId}</p>
                <p className="mt-1 text-sm text-slate-600">{asset.name}</p>
              </div>
              <StatusBadge label={asset.status} tone={asset.tone} />
            </div>
            <DetailGrid
              items={[
                { label: "Type", value: asset.type },
                { label: "Crew", value: asset.crew },
                { label: "Project", value: asset.project },
                { label: "Service", value: asset.nextService },
                { label: "CraneSafe", value: asset.craneSafe },
              ]}
            />
            <RecordActions
              recordType="plant"
              recordLabel={`${asset.assetId} ${asset.name}`}
              viewHref={`/assets/plant/${asset.id}`}
              editHref={`/assets/plant/${asset.id}/edit`}
            />
            <ActionButton
              href={`/assets/plant/${asset.id}/update`}
              variant="secondary"
              icon={<RotateCw size={14} />}
            >
              Update Asset
            </ActionButton>
          </div>
        )}
      />
    </PageShell>
  );
}
