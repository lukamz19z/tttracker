import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  Plus,
  ShieldCheck,
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

type ActionItem = {
  asset: string;
  detail: string;
  status: string;
  tone: "blue" | "amber" | "emerald" | "rose" | "slate" | "violet";
};

const urgentJobs: ActionItem[] = [
  {
    asset: "MC003 Grove GMK5220",
    detail: "CraneSafe due soon and hydraulic inspection note to review.",
    status: "High",
    tone: "rose" as const,
  },
  {
    asset: "HV002 Isuzu FZM",
    detail: "Insurance expired in register. Confirm renewal before allocation.",
    status: "Review",
    tone: "amber" as const,
  },
  {
    asset: "LV002 Toyota Hilux",
    detail: "Rego due this month. Fleet manager action required.",
    status: "Due Soon",
    tone: "amber" as const,
  },
];

const prestartFlags: ActionItem[] = [
  {
    asset: "LV004 Hilux",
    detail: "Morning prestart flagged tyre wear and damaged beacon.",
    status: "New",
    tone: "blue" as const,
  },
  {
    asset: "TH003 Merlo",
    detail: "Operator reported intermittent warning light.",
    status: "Triage",
    tone: "violet" as const,
  },
];

const reminders = [
  { label: "Rego", value: "3", detail: "vehicles or trailers due soon" },
  { label: "Insurance", value: "2", detail: "records needing review" },
  { label: "Service", value: "4", detail: "assets due or overdue" },
  { label: "CraneSafe", value: "2", detail: "major plant reminders" },
];

function ActionPanel({
  title,
  items,
}: {
  title: string;
  items: ActionItem[];
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">
          {title}
        </h2>
        <StatusBadge label={String(items.length)} />
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.asset} className="border border-slate-200 bg-slate-50 p-4">
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
        <ActionPanel title="Fleet Jobs Needing Attention" items={urgentJobs} />
        <ActionPanel title="Prestart Flags" items={prestartFlags} />
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
              title: "Field Entry",
              detail: "Operators submit prestarts, issues and photos from site.",
            },
            {
              title: "Fleet Manager",
              detail: "Fleet Jobs, service reminders and asset status stay visible.",
            },
            {
              title: "Client View",
              detail: "Approved records can feed a client-facing page without exposing internal notes.",
            },
            {
              title: "SharePoint",
              detail: "Certificates, manuals and reports can be linked or synced to document folders.",
            },
          ].map((item) => (
            <div key={item.title} className="border border-slate-200 bg-slate-50 p-4">
              <p className="font-bold text-slate-950">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
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
            {reminders.map((item) => (
              <div key={item.label} className="border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{item.value}</p>
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
    </PageShell>
  );
}
