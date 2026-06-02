import { ShieldCheck } from "lucide-react";
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
import { RecordActions } from "../record-actions";

type ComplianceTone = "emerald" | "amber" | "rose" | "slate";

type ComplianceRecord = {
  id: string;
  asset: string;
  type: string;
  detail: string;
  due: string;
  owner: string;
  project: string;
  status: string;
  tone: ComplianceTone;
};

const regoRecords: ComplianceRecord[] = [
  {
    id: "rego-lv002",
    asset: "LV002 Toyota Hilux",
    type: "Rego",
    detail: "S334CMP",
    due: "21 Jun 2026",
    owner: "Fleet",
    project: "Unassigned",
    status: "Due Soon",
    tone: "amber",
  },
  {
    id: "rego-tr005",
    asset: "TR005 Semi Trailer",
    type: "Rego",
    detail: "YO02DN",
    due: "11 Jun 2026",
    owner: "Fleet",
    project: "Depot",
    status: "Due Soon",
    tone: "amber",
  },
];

const insuranceRecords: ComplianceRecord[] = [
  {
    id: "insurance-hv002",
    asset: "HV002 Isuzu FZM",
    type: "Insurance",
    detail: "Policy renewal required",
    due: "01 Jan 2025",
    owner: "Admin",
    project: "Tumbarumba",
    status: "Overdue",
    tone: "rose",
  },
  {
    id: "insurance-mc001",
    asset: "MC001 Liebherr LTM1220",
    type: "Insurance",
    detail: "Plant policy",
    due: "08 Sep 2026",
    owner: "Admin",
    project: "Snowy 2.0",
    status: "Current",
    tone: "emerald",
  },
];

const serviceRecords: ComplianceRecord[] = [
  {
    id: "service-mc003",
    asset: "MC003 Grove GMK5220",
    type: "Service",
    detail: "Major service due",
    due: "05 Nov 2025",
    owner: "Workshop",
    project: "Maragle",
    status: "Overdue",
    tone: "rose",
  },
  {
    id: "service-lv004",
    asset: "LV004 Toyota Hilux",
    type: "Service",
    detail: "6-month service",
    due: "19 Feb 2026",
    owner: "Workshop",
    project: "Snowy 2.0",
    status: "Review",
    tone: "slate",
  },
];

const inspectionRecords: ComplianceRecord[] = [
  {
    id: "cranesafe-mc001",
    asset: "MC001 Liebherr LTM1220",
    type: "CraneSafe",
    detail: "Certificate attached to asset",
    due: "09 Mar 2027",
    owner: "Fleet",
    project: "Snowy 2.0",
    status: "Current",
    tone: "emerald",
  },
  {
    id: "risk-th003",
    asset: "TH003 Merlo P40.17EE",
    type: "Risk Assessment",
    detail: "Document required before allocation",
    due: "Required",
    owner: "Safety",
    project: "Unassigned",
    status: "Review",
    tone: "slate",
  },
];

const sections = [
  { title: "Rego", description: "Vehicle, trailer and road-registered plant reminders.", records: regoRecords },
  { title: "Insurance", description: "Insurance renewals and policy checks.", records: insuranceRecords },
  { title: "Servicing", description: "Service dates and workshop review items.", records: serviceRecords },
  { title: "Inspections & Risk", description: "CraneSafe, risk assessments and inspection records.", records: inspectionRecords },
];

function ComplianceSection({
  title,
  description,
  records,
}: {
  title: string;
  description: string;
  records: ComplianceRecord[];
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-950">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <StatusBadge label={`${records.length} records`} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {records.map((record) => (
          <article key={record.id} className="border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">{record.asset}</p>
                <p className="mt-1 text-sm text-slate-600">{record.detail}</p>
              </div>
              <StatusBadge label={record.status} tone={record.tone} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Due</p>
                <p className="mt-1 font-semibold text-slate-900">{record.due}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Owner</p>
                <p className="mt-1 font-semibold text-slate-900">{record.owner}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Project</p>
                <p className="mt-1 font-semibold text-slate-900">{record.project}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type</p>
                <p className="mt-1 font-semibold text-slate-900">{record.type}</p>
              </div>
            </div>

            <div className="mt-4">
              <RecordActions
                recordType="compliance record"
                recordLabel={`${record.asset} ${record.type}`}
                viewHref={`/assets/compliance/${record.id}`}
                editHref={`/assets/compliance/${record.id}/edit`}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function AssetsCompliancePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Compliance"
        title="Compliance"
        description="Split compliance register for rego, insurance, servicing, CraneSafe and risk records. Keep reminders clear instead of mixing every expiry in one table."
        actions={
          <ActionButton href="/assets/compliance/new" icon={<ShieldCheck size={16} />}>
            Add Record
          </ActionButton>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Rego Due" value="2" detail="road assets to review" tone="amber" />
        <KpiCard label="Insurance" value="1" detail="overdue renewal" tone="rose" />
        <KpiCard label="Servicing" value="2" detail="workshop reminders" tone="blue" />
        <KpiCard label="Inspections" value="2" detail="CraneSafe and risk" tone="emerald" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search asset, project, record type..." />
        <FilterSelect label="Compliance type" options={["All types", "Rego", "Insurance", "Servicing", "CraneSafe", "Risk Assessment"]} />
        <FilterSelect label="Project" options={["All projects", "Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned"]} />
        <FilterSelect label="Status" options={["All statuses", "Current", "Due Soon", "Overdue", "Review"]} />
      </FilterBar>

      <div className="grid gap-5">
        {sections.map((section) => (
          <ComplianceSection key={section.title} {...section} />
        ))}
      </div>
    </PageShell>
  );
}
