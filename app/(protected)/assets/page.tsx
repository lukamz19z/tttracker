import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Plus,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import {
  ActionButton,
  DetailGrid,
  KpiCard,
  PageHeader,
  PageShell,
  StatusBadge,
} from "./components";

type Tone = "blue" | "amber" | "emerald" | "rose" | "slate" | "violet";

type ActionItem = {
  asset: string;
  detail: string;
  status: string;
  tone: Tone;
};

type ReminderItem = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

const fleetJobs: ActionItem[] = [
  {
    asset: "MC003 Grove GMK5220",
    detail: "CraneSafe due soon and hydraulic inspection note requires review.",
    status: "High",
    tone: "rose",
  },
  {
    asset: "HV002 Isuzu FZM",
    detail: "Insurance expired in register. Confirm renewal before allocation.",
    status: "Review",
    tone: "amber",
  },
  {
    asset: "LV002 Toyota Hilux",
    detail: "Rego due this month. Fleet manager action required.",
    status: "Due Soon",
    tone: "amber",
  },
];

const prestartFlags: ActionItem[] = [
  {
    asset: "LV004 Hilux",
    detail: "Morning prestart flagged tyre wear and damaged beacon.",
    status: "New",
    tone: "blue",
  },
  {
    asset: "TH003 Merlo",
    detail: "Operator reported intermittent warning light.",
    status: "Triage",
    tone: "violet",
  },
];

const complianceReminders: ReminderItem[] = [
  {
    label: "Rego",
    value: "3",
    detail: "vehicles or trailers due soon",
    tone: "amber",
  },
  {
    label: "Insurance",
    value: "2",
    detail: "records needing review",
    tone: "rose",
  },
  {
    label: "Service",
    value: "4",
    detail: "assets due or overdue",
    tone: "blue",
  },
  {
    label: "CraneSafe",
    value: "2",
    detail: "major plant reminders",
    tone: "violet",
  },
];

function ActionPanel({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: ActionItem[];
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {description}
          </p>
        </div>
        <StatusBadge label={String(items.length)} />
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={`${item.asset}-${item.status}`}
            className="border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.asset}</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {item.detail}
                </p>
              </div>
              <StatusBadge label={item.status} tone={item.tone} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AssetsDashboardPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Assets"
        title="Fleet Dashboard"
        description="Daily command centre for plant, vehicles, equipment, prestart flags, service reminders and Fleet Jobs raised for the fleet manager."
        actions={
          <>
            <ActionButton href="/assets/maintenance" icon={<Wrench size={16} />}>
              Fleet Jobs
            </ActionButton>
            <ActionButton
              href="/assets/prestarts"
              variant="secondary"
              icon={<ClipboardCheck size={16} />}
            >
              Prestarts
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Open Jobs" value="8" detail="awaiting action" tone="rose" />
        <KpiCard label="Out of Service" value="2" detail="assets unavailable" tone="amber" />
        <KpiCard label="Prestart Flags" value="2" detail="raised today" tone="violet" />
        <KpiCard label="Available" value="41" detail="plant and vehicles" tone="emerald" />
        <KpiCard label="Due Soon" value="9" detail="compliance reminders" tone="blue" />
        <KpiCard label="Failed Gear" value="0" detail="equipment register" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <ActionPanel
          title="Fleet Jobs Needing Attention"
          description="Open jobs, close-out items and asset issues still requiring fleet manager action."
          items={fleetJobs}
        />

        <ActionPanel
          title="Prestart Flags"
          description="Failed or questionable prestart items that may need a Fleet Job raised."
          items={prestartFlags}
        />
      </section>

      <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-slate-500" />
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            Information Flow
          </h2>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            {
              title: "Prestart Submitted",
              detail: "Operator records fit-for-work, checklist answers, comments and photos.",
            },
            {
              title: "Fleet Job Raised",
              detail: "Issues become trackable jobs for maintenance, defects or fleet manager review.",
            },
            {
              title: "Progress Updates",
              detail: "Regular job updates show what is happening without closing the job too early.",
            },
            {
              title: "Asset Updated",
              detail: "Completed service, modification or repair details are recorded against the asset.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="border border-slate-200 bg-slate-50 p-4"
            >
              <p className="font-bold text-slate-950">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-slate-500" />
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Compliance Reminders
            </h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {complianceReminders.map((item) => (
              <div
                key={item.label}
                className="border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-600">
                    {item.label}
                  </p>
                  <StatusBadge label="Watch" tone={item.tone} />
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {item.value}
                </p>
                <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-slate-500" />
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Quick Actions
            </h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ActionButton href="/assets/plant/new" variant="secondary" icon={<Plus size={16} />}>
              Add Plant
            </ActionButton>
            <ActionButton href="/assets/vehicles/new" variant="secondary" icon={<Plus size={16} />}>
              Add Vehicle
            </ActionButton>
            <ActionButton href="/assets/equipment/new" variant="secondary" icon={<Plus size={16} />}>
              Add Equipment
            </ActionButton>
            <ActionButton href="/assets/maintenance/new" variant="secondary" icon={<Plus size={16} />}>
              Log Fleet Job
            </ActionButton>
          </div>

          <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
            <DetailGrid
              items={[
                { label: "Plant", value: "Crane, telehandler, generator" },
                { label: "Vehicle", value: "LV, HV, trailer" },
                { label: "Equipment", value: "Lifting gear, tools" },
                { label: "Workflow", value: "Issue to close-out" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <Truck size={18} className="text-slate-500" />
          <h2 className="text-lg font-bold tracking-tight text-slate-950">
            Asset Register Overview
          </h2>
        </div>

        <div className="mt-4">
          <DetailGrid
            items={[
              { label: "Plant", value: "Major plant, hired plant and support plant" },
              { label: "Vehicles", value: "LVs, HVs and trailers" },
              { label: "Equipment", value: "Tools, lifting gear and site equipment" },
              { label: "Inactive Assets", value: "No longer hired, retired or superseded" },
            ]}
          />
        </div>
      </section>
    </PageShell>
  );
}