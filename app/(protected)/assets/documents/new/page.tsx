import { ArrowLeft } from "lucide-react";
import {
  ActionButton,
  DisabledSubmit,
  FormCard,
  FormField,
  FormSelectField,
  FormTextArea,
  PageHeader,
  PageShell,
} from "../../components";

export default function NewAssetDocumentPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Document Control"
        title="Upload Document"
        description="Record a certificate, manual, service record or SharePoint-linked asset document."
        actions={
          <ActionButton href="/assets/documents" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Documents
          </ActionButton>
        }
      />

      <FormCard title="Document Details" description="File upload wiring can be added later; this captures the intended workflow.">
        <FormField label="Asset" placeholder="LV004 Toyota Hilux" />
        <FormField label="Document Name" placeholder="Insurance certificate" />
        <FormSelectField label="Category" options={["Certificate", "Insurance", "Safety", "Manual", "Service Record", "Other"]} />
        <FormField label="Document Date" type="date" />
        <FormSelectField label="Owner" options={["Fleet", "Admin", "Safety", "Workshop"]} />
        <FormField label="Link / Folder" placeholder="SharePoint link" />
        <FormTextArea label="Notes" placeholder="Expiry notes, version, document location..." />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Upload coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
