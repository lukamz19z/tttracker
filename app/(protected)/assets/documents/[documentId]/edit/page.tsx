import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  return (
    <PageShell>
      <PageHeader eyebrow="Edit Document" title={`Edit Document: ${documentId}`} description="Update attachment target, client visibility and SharePoint link." actions={<ActionButton href={`/assets/documents/${documentId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>} />
      <FormCard title="Document Attachment" description="Documents should live on the related asset/job/compliance record, not as a standalone navigation area.">
        <FormField label="Attached To" placeholder="MC001 Liebherr LTM1220" />
        <FormField label="Document Name" placeholder="CraneSafe Certificate" />
        <FormSelectField label="Client Visible" options={["No", "Yes"]} />
        <FormField label="SharePoint Link" placeholder="https://..." />
        <FormTextArea label="Notes" placeholder="Version, expiry, sync rules..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save document coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
