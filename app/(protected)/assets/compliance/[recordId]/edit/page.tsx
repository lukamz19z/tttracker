import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditComplianceRecordPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  return (
    <PageShell>
      <PageHeader eyebrow="Edit Compliance" title={`Edit Compliance: ${recordId}`} description="Update expiry, ownership, client visibility and SharePoint link." actions={<ActionButton href={`/assets/compliance/${recordId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>} />
      <FormCard title="Compliance Record" description="Keep public/client-safe information separate from internal notes.">
        <FormSelectField label="Type" options={["Rego", "Insurance", "Service", "CraneSafe", "Risk Assessment"]} />
        <FormField label="Due Date" type="date" />
        <FormSelectField label="Status" options={["Current", "Due Soon", "Overdue", "Review"]} />
        <FormSelectField label="Client Visible" options={["No", "Yes - status only", "Yes - document"]} />
        <FormField label="SharePoint Link" placeholder="https://..." />
        <FormTextArea label="Internal Notes" placeholder="Renewal notes, follow-up, document instructions..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save record coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
