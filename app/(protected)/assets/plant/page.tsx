import { Plus, Wrench } from "lucide-react";
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

type PlantAsset = {
  id: string;
  assetId: string;
  name: string;
  make: string;
  type: string;
  site: string;
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
    site: "Lobs Hole",
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
    site: "Maragle",
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
    site: "Depot",
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
    site: "Maragle",
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
        description="Major plant register for cranes, telehandlers, generators and hired plant. Keep the visible fields focused on status, site allocation, service and key compliance dates."
        actions={
          <>
            <ActionButton href="/assets/maintenance" variant="secondary" icon={<Wrench size={16} />}>
              Raise Job
            </ActionButton>
            <ActionButton href="/assets/plant" icon={<Plus size={16} />}>
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
        description="Compact list for iPad and mobile first, with the fuller register available on desktop."
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
          { label: "Site", render: (asset) => asset.site },
          { label: "Rego", render: (asset) => asset.rego },
          { label: "Next Service", render: (asset) => asset.nextService },
          { label: "CraneSafe", render: (asset) => asset.craneSafe },
          { label: "Hired", render: (asset) => asset.hired },
          {
            label: "Status",
            render: (asset) => <StatusBadge label={asset.status} tone={asset.tone} />,
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
                { label: "Site", value: asset.site },
                { label: "Service", value: asset.nextService },
                { label: "CraneSafe", value: asset.craneSafe },
              ]}
            />
          </div>
        )}
      />
    </PageShell>
  );
}
