import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Plus } from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  FilterBar,
  FilterInput,
  FilterSelect,
  KpiCard,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../components";
import { RecordActions } from "../record-actions";

type Prestart = {
  id: string;
  time: string;
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
    time: "6:42 AM",
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
    time: "6:55 AM",
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
    time: "7:08 AM",
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

const expectedChecks = [
  { asset: "LV004 Toyota Hilux", state: "Submitted", tone: "emerald" as const },
  { asset: "TH003 Merlo P40.17EE", state: "Flagged", tone: "amber" as const },
  { asset: "HV003 Western Star", state: "Submitted", tone: "emerald" as const },
  { asset: "MC001 Liebherr LTM1220", state: "Waiting", tone: "slate" as const },
];

function SubmissionCard({ item }: { item: Prestart }) {
  const Icon = item.result === "Passed" ? CheckCircle2 : AlertTriangle;

  return (
    <article className="border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center border border-slate-200 bg-slate-50">
            <Icon size={18} className={item.result === "Passed" ? "text-emerald-600" : "text-amber-600"} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-950">{item.asset}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {item.operator} submitted at {item.time}
            </p>
          </div>
        </div>
        <StatusBadge label={item.result} tone={item.tone} />
      </div>

      <div className="mt-4">
        <DetailGrid
          items={[
            { label: "Site", value: item.site },
            { label: "Reading", value: item.reading },
            { label: "Fleet Job", value: item.job },
            { label: "ID", value: item.id },
          ]}
        />
      </div>

      <p className="mt-4 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-700">
        {item.issue}
      </p>

      <div className="mt-4">
        <RecordActions
          recordType="prestart"
          recordLabel={`${item.id} ${item.asset}`}
          viewHref={`/assets/prestarts/${item.id}`}
          editHref={`/assets/prestarts/${item.id}/edit`}
        />
      </div>
    </article>
  );
}

export default function AssetsPrestartsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Daily Checks"
        title="Prestarts"
        description="Morning submission screen for plant and vehicles. Supervisors can see what has come in, what is still missing, and which checks created Fleet Jobs."
        actions={
          <>
            <ActionButton href="/assets/prestarts" variant="secondary" icon={<ClipboardCheck size={16} />}>
              Today
            </ActionButton>
            <ActionButton href="/assets/prestarts/new" icon={<Plus size={16} />}>
              New Prestart
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Expected" value="4" detail="scheduled checks" tone="blue" />
        <KpiCard label="Submitted" value="3" detail="received this morning" tone="emerald" />
        <KpiCard label="Flags" value="2" detail="issues raised" tone="amber" />
        <KpiCard label="Waiting" value="1" detail="not submitted yet" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-slate-500" />
            <h2 className="text-lg font-bold text-slate-950">Today&apos;s Run Sheet</h2>
          </div>
          <div className="mt-4 space-y-3">
            {expectedChecks.map((check) => (
              <div
                key={check.asset}
                className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 p-3"
              >
                <span className="text-sm font-semibold text-slate-800">{check.asset}</span>
                <StatusBadge label={check.state} tone={check.tone} />
              </div>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-lg font-bold text-slate-950">Flagged Checks</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {prestarts
              .filter((item) => item.result !== "Passed")
              .map((item) => (
                <div key={item.id} className="border border-amber-200 bg-amber-50 p-4">
                  <p className="font-bold text-slate-950">{item.asset}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.issue}</p>
                  <div className="mt-3">
                    <StatusBadge label={item.job} tone="amber" />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      <FilterBar>
        <FilterInput placeholder="Search asset, operator, site..." />
        <FilterSelect label="Result" options={["All results", "Passed", "Issue Raised", "Missed"]} />
        <FilterSelect label="Site" options={["All sites", "Depot", "Lobs Hole", "Maragle"]} />
        <FilterSelect label="Asset type" options={["All asset types", "Vehicle", "Plant"]} />
      </FilterBar>

      <section className="grid gap-4 xl:grid-cols-3">
        {prestarts.map((item) => (
          <SubmissionCard key={item.id} item={item} />
        ))}
      </section>
    </PageShell>
  );
}
