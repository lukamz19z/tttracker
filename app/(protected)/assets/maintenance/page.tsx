import { Plus } from "lucide-react";
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

type FleetJob = {
  id: string;
  asset: string;
  type: string;
  issue: string;
  reportedBy: string;
  priority: string;
  status: string;
  safety: string;
  tone: "blue" | "amber" | "rose" | "emerald" | "violet";
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
    tone: "violet",
  },
];

export default function FleetJobsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Maintenance Workflow"
        title="Fleet Jobs"
        description="Job board for defects, prestart faults, breakdowns, damage, servicing and equipment issues. This is where issues move from raised to assigned, repaired and closed."
        actions={
          <ActionButton href="/assets/maintenance" icon={<Plus size={16} />}>
            Log Job
          </ActionButton>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Raised" value="1" detail="new jobs to review" tone="rose" />
        <KpiCard label="Triage" value="1" detail="fleet manager decision" tone="amber" />
        <KpiCard label="Assigned" value="1" detail="with mechanic/workshop" tone="blue" />
        <KpiCard label="Waiting" value="1" detail="parts or information" tone="violet" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search job, asset, issue..." />
        <FilterSelect label="Job type" options={["All job types", "Prestart Fault", "Mechanical", "Calibration", "Inspection Finding"]} />
        <FilterSelect label="Priority" options={["All priorities", "High", "Medium", "Low"]} />
        <FilterSelect label="Status" options={["All statuses", "Raised", "Triage", "Assigned", "Waiting Parts", "Closed"]} />
      </FilterBar>

      <RegisterList
        title="Job Board"
        description="A simple workflow for fleet manager triage and workshop follow-up."
        items={jobs}
        getKey={(job) => job.id}
        columns={[
          {
            label: "Job",
            render: (job) => (
              <div>
                <p className="font-semibold text-slate-950">{job.id}</p>
                <p className="mt-1 text-slate-600">{job.asset}</p>
              </div>
            ),
          },
          { label: "Type", render: (job) => job.type },
          { label: "Issue", render: (job) => job.issue, className: "max-w-md" },
          { label: "Reported By", render: (job) => job.reportedBy },
          { label: "Priority", render: (job) => job.priority },
          { label: "Safety", render: (job) => job.safety },
          {
            label: "Status",
            render: (job) => <StatusBadge label={job.status} tone={job.tone} />,
          },
        ]}
        renderMobile={(job) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{job.id}</p>
                <p className="mt-1 text-sm text-slate-600">{job.asset}</p>
              </div>
              <StatusBadge label={job.status} tone={job.tone} />
            </div>
            <p className="text-sm leading-6 text-slate-700">{job.issue}</p>
            <DetailGrid
              items={[
                { label: "Type", value: job.type },
                { label: "Priority", value: job.priority },
                { label: "Safety", value: job.safety },
                { label: "Reported", value: job.reportedBy },
              ]}
            />
          </div>
        )}
      />
    </PageShell>
  );
}
