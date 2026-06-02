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

type Equipment = {
  id: string;
  serial: string;
  type: string;
  description: string;
  crew: string;
  tag: string;
  inspected: string;
  due: string;
  status: string;
  tone: "emerald" | "amber" | "rose" | "slate";
};

const equipment: Equipment[] = [
  {
    id: "17707931",
    serial: "17707931",
    type: "Round Sling",
    description: "Legend 1T purple 1.0m",
    crew: "Crew 3",
    tag: "Green",
    inspected: "02 Mar 2026",
    due: "02 Jun 2026",
    status: "Due Soon",
    tone: "amber",
  },
  {
    id: "104024-047",
    serial: "104024-047",
    type: "Harness",
    description: "Skylotec Ignite Neutron",
    crew: "Crew 1",
    tag: "Green",
    inspected: "26 Feb 2026",
    due: "26 Aug 2026",
    status: "Passed",
    tone: "emerald",
  },
  {
    id: "chain-001",
    serial: "CS-001",
    type: "Chain Sling",
    description: "Grade 100 2 leg chain sling",
    crew: "Crew 2",
    tag: "Green",
    inspected: "26 Feb 2026",
    due: "26 Aug 2026",
    status: "Passed",
    tone: "emerald",
  },
  {
    id: "tw-001",
    serial: "TW-001",
    type: "Torque Wrench",
    description: "Calibrated torque wrench 40-200Nm",
    crew: "Workshop",
    tag: "N/A",
    inspected: "10 Jan 2026",
    due: "10 Jul 2026",
    status: "Calibration",
    tone: "slate",
  },
];

export default function AssetsEquipmentPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Equipment"
        description="Lifting gear, fall arrest gear, torque wrenches, hoists and other equipment. Keep this page focused on inspection status, crew allocation and whether gear is safe to use."
        actions={
          <>
            <ActionButton href="/assets/maintenance" variant="secondary" icon={<Wrench size={16} />}>
              Raise Job
            </ActionButton>
            <ActionButton href="/assets/equipment" icon={<Plus size={16} />}>
              Add Equipment
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Gear" value="4" detail="sample equipment records" tone="blue" />
        <KpiCard label="Passed" value="2" detail="current inspections" tone="emerald" />
        <KpiCard label="Due Soon" value="1" detail="next 30 days" tone="amber" />
        <KpiCard label="Failed" value="0" detail="quarantine required" tone="rose" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search serial, type, description..." />
        <FilterSelect label="Equipment type" options={["All equipment", "Round Sling", "Chain Sling", "Harness", "Torque Wrench"]} />
        <FilterSelect label="Crew" options={["All crews", "Crew 1", "Crew 2", "Crew 3", "Workshop"]} />
        <FilterSelect label="Status" options={["All statuses", "Passed", "Due Soon", "Failed", "Calibration"]} />
      </FilterBar>

      <RegisterList
        title="Equipment Register"
        description="A lighter version of the lifting gear spreadsheet, tuned for quick checks on mobile and iPad."
        items={equipment}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Item",
            render: (item) => (
              <div>
                <p className="font-semibold text-slate-950">{item.serial}</p>
                <p className="mt-1 text-slate-600">{item.description}</p>
              </div>
            ),
          },
          { label: "Type", render: (item) => item.type },
          { label: "Crew", render: (item) => item.crew },
          { label: "Tag", render: (item) => item.tag },
          { label: "Inspected", render: (item) => item.inspected },
          { label: "Next Due", render: (item) => item.due },
          {
            label: "Status",
            render: (item) => <StatusBadge label={item.status} tone={item.tone} />,
          },
        ]}
        renderMobile={(item) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.serial}</p>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
              <StatusBadge label={item.status} tone={item.tone} />
            </div>
            <DetailGrid
              items={[
                { label: "Type", value: item.type },
                { label: "Crew", value: item.crew },
                { label: "Tag", value: item.tag },
                { label: "Due", value: item.due },
              ]}
            />
          </div>
        )}
      />
    </PageShell>
  );
}
