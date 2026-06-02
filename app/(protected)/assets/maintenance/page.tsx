import { AlertTriangle, Clock, Plus, UserRound, Wrench } from "lucide-react";
import {
  ActionButton,
  FilterBar,
  FilterInput,
  FilterSelect,
  KpiCard,
  PageHeader,
  PageShell,
  StatusBadge,
} from "../components";
import { ModeToggle, RecordActions } from "../record-actions";

type Tone = "blue" | "amber" | "rose" | "emerald" | "violet" | "slate";

type FleetJob = {
  id: string;
  asset: string;
  type: string;
  issue: string;
  reportedBy: string;
  priority: string;
  status: "Raised" | "Triage" | "Assigned" | "Waiting Parts";
  safety: string;
  due: string;
  tone: Tone;
};

const jobs: FleetJob[] = [
  {
    id: "FJ-1004",
    asset: "MC003 Grove GMK5220",
    type: "Inspection Finding",
    issue: "CraneSafe reminder and hydraulic inspection note require review.",
    reportedBy: "Fleet Manager",
    priority: "High",
    status: "Raised",
    safety: "Restricted Use",
    due: "Today",
    tone: "rose",
  },
  {
    id: "FJ-1003",
    asset: "LV004 Toyota Hilux",
    type: "Prestart Fault",
    issue: "Tyre wear and damaged beacon reported during morning prestart.",
    reportedBy: "Operator",
    priority: "Medium",
    status: "Triage",
    safety: "Monitor",
    due: "Today",
    tone: "amber",
  },
  {
    id: "FJ-1002",
    asset: "TH003 Merlo P40.17EE",
    type: "Mechanical",
    issue: "Intermittent warning light. Needs workshop review.",
    reportedBy: "Supervisor",
    priority: "Medium",
    status: "Assigned",
    safety: "Safe to Use",
    due: "Tomorrow",
    tone: "blue",
  },
  {
    id: "FJ-1001",
    asset: "TW-001 Torque Wrench",
    type: "Calibration",
    issue: "Calibration date to be confirmed before next use.",
    reportedBy: "Workshop",
    priority: "Low",
    status: "Waiting Parts",
    safety: "Do Not Use",
    due: "This week",
    tone: "violet",
  },
];

const columns: Array<{ status: FleetJob["status"]; label: string; tone: Tone }> = [
  { status: "Raised", label: "Raised", tone: "rose" },
  { status: "Triage", label: "Triage", tone: "amber" },
  { status: "Assigned", label: "Assigned", tone: "blue" },
  { status: "Waiting Parts", label: "Waiting Parts", tone: "violet" },
];

function JobCard({ job }: { job: FleetJob }) {
  return (
    <article className="border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {job.id}
          </p>
          <h3 className="mt-1 text-base font-bold text-slate-950">{job.asset}</h3>
        </div>
        <StatusBadge label={job.priority} tone={job.tone} />
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-700">{job.issue}</p>

      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          <Wrench size={15} />
          <span>{job.type}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <AlertTriangle size={15} />
          <span>{job.safety}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <UserRound size={15} />
          <span>{job.reportedBy}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Clock size={15} />
          <span>{job.due}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <RecordActions recordType="fleet job" recordLabel={`${job.id} ${job.asset}`} />
      </div>
    </article>
  );
}

export default function FleetJobsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Maintenance Workflow"
        title="Fleet Jobs"
        description="Workflow board for defects, prestart faults, breakdowns, damage, servicing and equipment issues. This page is built for triage, assignment and close-out."
        actions={
          <>
            <ActionButton href="/assets/maintenance/new" icon={<Plus size={16} />}>
              Log Job
            </ActionButton>
            <ModeToggle label="Board mode" />
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Raised" value="1" detail="new jobs to review" tone="rose" />
        <KpiCard label="Triage" value="1" detail="fleet manager decision" tone="amber" />
        <KpiCard label="Assigned" value="1" detail="with workshop" tone="blue" />
        <KpiCard label="Waiting" value="1" detail="parts or information" tone="violet" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search job, asset, issue..." />
        <FilterSelect
          label="Job type"
          options={["All job types", "Prestart Fault", "Mechanical", "Calibration", "Inspection Finding"]}
        />
        <FilterSelect label="Priority" options={["All priorities", "High", "Medium", "Low"]} />
        <FilterSelect label="Safety" options={["All safety states", "Safe to Use", "Monitor", "Restricted Use", "Do Not Use"]} />
      </FilterBar>

      <section className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => {
          const columnJobs = jobs.filter((job) => job.status === column.status);

          return (
            <div key={column.status} className="border border-slate-200 bg-slate-100 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                    {column.label}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {columnJobs.length} job{columnJobs.length === 1 ? "" : "s"}
                  </p>
                </div>
                <StatusBadge label={String(columnJobs.length)} tone={column.tone} />
              </div>

              <div className="space-y-3">
                {columnJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </PageShell>
  );
}
