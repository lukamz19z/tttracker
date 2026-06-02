import { FileUp } from "lucide-react";
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
import { RecordActions } from "../record-actions";

type AssetDocument = {
  id: string;
  asset: string;
  document: string;
  category: string;
  updated: string;
  owner: string;
  status: string;
  clientVisible: string;
  sharePoint: string;
  tone: "emerald" | "amber" | "slate";
};

const documents: AssetDocument[] = [
  {
    id: "doc-001",
    asset: "MC001 Liebherr LTM1220",
    document: "CraneSafe Certificate",
    category: "Certificate",
    updated: "09 Mar 2026",
    owner: "Fleet",
    status: "Current",
    clientVisible: "Yes",
    sharePoint: "Linked",
    tone: "emerald",
  },
  {
    id: "doc-002",
    asset: "TH003 Merlo P40.17EE",
    document: "Plant Risk Assessment",
    category: "Safety",
    updated: "Missing",
    owner: "Safety",
    status: "Required",
    clientVisible: "No",
    sharePoint: "Missing",
    tone: "amber",
  },
  {
    id: "doc-003",
    asset: "LV004 Toyota Hilux",
    document: "Insurance Certificate",
    category: "Insurance",
    updated: "30 Sep 2025",
    owner: "Admin",
    status: "Current",
    clientVisible: "No",
    sharePoint: "Linked",
    tone: "emerald",
  },
];

export default function AssetsDocumentsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Document Control"
        title="Documents"
        description="A simple document register for certificates, risk assessments, manuals, service records and SharePoint-linked asset folders."
        actions={
          <>
            <ActionButton href="/assets/documents/new" icon={<FileUp size={16} />}>
              Upload
            </ActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Documents" value="3" detail="sample records" tone="blue" />
        <KpiCard label="Current" value="2" detail="available and in date" tone="emerald" />
        <KpiCard label="Required" value="1" detail="missing or incomplete" tone="amber" />
        <KpiCard label="Folders" value="0" detail="SharePoint links later" />
      </section>

      <FilterBar>
        <FilterInput placeholder="Search asset, document, owner..." />
        <FilterSelect label="Category" options={["All categories", "Certificate", "Safety", "Insurance", "Manual"]} />
        <FilterSelect label="Owner" options={["All owners", "Fleet", "Safety", "Admin"]} />
        <FilterSelect label="Status" options={["All statuses", "Current", "Required", "Archived"]} />
      </FilterBar>

      <RegisterList
        title="Document Register"
        description="Keep the important asset paperwork visible without turning the page into a file dump."
        items={documents}
        getKey={(item) => item.id}
        columns={[
          {
            label: "Document",
            render: (item) => (
              <div>
                <p className="font-semibold text-slate-950">{item.document}</p>
                <p className="mt-1 text-slate-600">{item.asset}</p>
              </div>
            ),
          },
          { label: "Category", render: (item) => item.category },
          { label: "Updated", render: (item) => item.updated },
          { label: "Owner", render: (item) => item.owner },
          { label: "Client", render: (item) => item.clientVisible },
          { label: "SharePoint", render: (item) => item.sharePoint },
          {
            label: "Status",
            render: (item) => <StatusBadge label={item.status} tone={item.tone} />,
          },
          {
            label: "Actions",
            render: (item) => (
              <RecordActions
                recordType="document"
                recordLabel={`${item.asset} ${item.document}`}
                viewHref={`/assets/documents/${item.id}`}
                editHref={`/assets/documents/${item.id}/edit`}
              />
            ),
          },
        ]}
        renderMobile={(item) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.document}</p>
                <p className="mt-1 text-sm text-slate-600">{item.asset}</p>
              </div>
              <StatusBadge label={item.status} tone={item.tone} />
            </div>
            <DetailGrid
              items={[
                { label: "Category", value: item.category },
                { label: "Updated", value: item.updated },
                { label: "Owner", value: item.owner },
                { label: "Client", value: item.clientVisible },
                { label: "SharePoint", value: item.sharePoint },
              ]}
            />
            <RecordActions
              recordType="document"
              recordLabel={`${item.asset} ${item.document}`}
              viewHref={`/assets/documents/${item.id}`}
              editHref={`/assets/documents/${item.id}/edit`}
            />
          </div>
        )}
      />
    </PageShell>
  );
}
