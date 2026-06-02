import { ClipboardCheck, Plus } from "lucide-react";
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

type Prestart = {
  id: string;
  date: string;
  asset: string;
  operator: string;
  site: string;
  reading: string;
  result: string;
  issue: string;
  job: string;
  tone: "emerald" | "amber" | "rose" | "blue";
};

const prestarts: Prestart[] = [
  {
    id: "PS-2026-001",
    date: "02 Jun 2026",
    asset: "LV004 Toyota Hilux",
    operator: "Operator",
    site: "Lobs Hole",
    reading: "84,210 km",
    result: "Issue Raised",
    issue: "Tyre wear and damaged beacon",
    job: "FJ-1003",
    tone: "amber",
  },
  {
    id: "PS-2026-002",
    date: "02 Jun 2026",
    asset: "TH003 Merlo P40.17EE",
    operator: "Operator",
    site: "Depot",
    reading: "1,420 hrs",
    result: "Issue Raised",
    issue: "Intermittent warning light",
    job: "FJ-1002",
    tone: "amber",
  },
  {
    id: "PS-2026-003",
    date: "02 Jun 2026",
    asset: "HV003 Western Star",
    operator: "Driver",
    site: "Maragle",
    reading: "124,900 km",
    result: "Passed",
    issue: "No issues reported",
    job: "-",
    tone: "emerald",
  },
];

export default function AssetsPrestartsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Daily Checks"
        title="Prestarts"
        description="Morning prestart register for plant and vehicles. Clean submissions become history; flagged submissions can create Fleet Jobs for the fleet manager."
        actions={
          <>
            <ActionButton href="/assets/prestarts" variant="secondary" icon={<ClipboardCheck size={16} />}>
              Today
            </ActionButton>
            <ActionButton href="/assets/prestarts" icon={<Plus size={16} />}>
              New Prestart
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Submitted Today" value="3" detail="plant and vehicle checks" tone="blue" />
        <KpiCard label="Passed" value="1" detail="no issues reported" tone="emerald" />
        <KpiCard label="Flags" value="2" detail="converted or ready for jobs" tone="amber" />
        <KpiCard label="Missed" value="0" detail="expected checks missing" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search asset, operator, site..." />
        <FilterSelect label="Result" options={["All results", "Passed", "Issue Raised", "Missed"]} />
        <FilterSelect label="Site" options={["All sites", "Depot", "Lobs Hole", "Maragle"]} />
        <FilterSelect label="Asset type" options={["All asset types", "Vehicle", "Plant"]} />
      </FilterBar>

      <RegisterList
        title="Prestart Register"
        description="Fast review list for supervisors and fleet manager follow-up."
        items={prestarts}
        getKey={(item) => item.id}
        columns={[
          { label: "Date", render: (item) => item.date },
          {
            label: "Asset",
            render: (item) => (
              <div>
                <p className="font-semibold text-slate-950">{item.asset}</p>
                <p className="mt-1 text-slate-600">{item.reading}</p>
              </div>
            ),
          },
          { label: "Operator", render: (item) => item.operator },
          { label: "Site", render: (item) => item.site },
          { label: "Issue", render: (item) => item.issue },
          { label: "Fleet Job", render: (item) => item.job },
          {
            label: "Result",
            render: (item) => <StatusBadge label={item.result} tone={item.tone} />,
          },
        ]}
        renderMobile={(item) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.asset}</p>
                <p className="mt-1 text-sm text-slate-600">{item.date}</p>
              </div>
              <StatusBadge label={item.result} tone={item.tone} />
            </div>
            <DetailGrid
              items={[
                { label: "Operator", value: item.operator },
                { label: "Site", value: item.site },
                { label: "Reading", value: item.reading },
                { label: "Job", value: item.job },
              ]}
            />
            <p className="text-sm leading-6 text-slate-700">{item.issue}</p>
          </div>
        )}
      />
    </PageShell>
  );
}
