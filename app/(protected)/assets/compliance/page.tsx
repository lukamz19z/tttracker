import { ShieldCheck } from "lucide-react";
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
import { ModeToggle, RecordActions } from "../record-actions";

type ComplianceItem = {
  id: string;
  asset: string;
  item: string;
  due: string;
  owner: string;
  status: string;
  tone: "emerald" | "amber" | "rose" | "slate";
};

const items: ComplianceItem[] = [
  {
    id: "rego-lv002",
    asset: "LV002 Toyota Hilux",
    item: "Rego",
    due: "21 Jun 2026",
    owner: "Fleet",
    status: "Due Soon",
    tone: "amber",
  },
  {
    id: "insurance-hv002",
    asset: "HV002 Isuzu FZM",
    item: "Insurance",
    due: "01 Jan 2025",
    owner: "Admin",
    status: "Overdue",
    tone: "rose",
  },
  {
    id: "cranesafe-mc001",
    asset: "MC001 Liebherr LTM1220",
    item: "CraneSafe",
    due: "09 Mar 2027",
    owner: "Fleet",
    status: "Current",
    tone: "emerald",
  },
  {
    id: "risk-th003",
    asset: "TH003 Merlo P40.17EE",
    item: "Risk Assessment",
    due: "Required",
    owner: "Safety",
    status: "Review",
    tone: "slate",
  },
];

export default function AssetsCompliancePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Compliance"
        title="Compliance"
        description="Single review page for rego, insurance, service, CraneSafe, risk assessments and other asset documents that expire or need review."
        actions={
          <>
            <ActionButton href="/assets/compliance/new" icon={<ShieldCheck size={16} />}>
              Add Record
            </ActionButton>
            <ModeToggle label="Review mode" />
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current" value="1" detail="records in date" tone="emerald" />
        <KpiCard label="Due Soon" value="1" detail="within 30 days" tone="amber" />
        <KpiCard label="Overdue" value="1" detail="urgent review" tone="rose" />
        <KpiCard label="Needs Review" value="1" detail="missing or incomplete" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search asset or document type..." />
        <FilterSelect label="Type" options={["All types", "Rego", "Insurance", "CraneSafe", "Risk Assessment"]} />
        <FilterSelect label="Owner" options={["All owners", "Fleet", "Admin", "Safety"]} />
        <FilterSelect label="Status" options={["All statuses", "Current", "Due Soon", "Overdue", "Review"]} />
      </FilterBar>

      <RegisterList
        title="Compliance Register"
        description="The dashboard pulls from these records so expiry reminders stay visible."
        items={items}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Asset",
            render: (item) => <span className="font-semibold text-slate-950">{item.asset}</span>,
          },
          { label: "Item", render: (item) => item.item },
          { label: "Due", render: (item) => item.due },
          { label: "Owner", render: (item) => item.owner },
          {
            label: "Status",
            render: (item) => <StatusBadge label={item.status} tone={item.tone} />,
          },
          {
            label: "Actions",
            render: (item) => (
              <RecordActions recordType="compliance record" recordLabel={`${item.asset} ${item.item}`} />
            ),
          },
        ]}
        renderMobile={(item) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.asset}</p>
                <p className="mt-1 text-sm text-slate-600">{item.item}</p>
              </div>
              <StatusBadge label={item.status} tone={item.tone} />
            </div>
            <DetailGrid
              items={[
                { label: "Due", value: item.due },
                { label: "Owner", value: item.owner },
              ]}
            />
            <RecordActions recordType="compliance record" recordLabel={`${item.asset} ${item.item}`} />
          </div>
        )}
      />
    </PageShell>
  );
}
