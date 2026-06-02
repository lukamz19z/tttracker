import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditPrestartPage({ params }: { params: Promise<{ prestartId: string }> }) {
  const { prestartId } = await params;
  return (
    <PageShell>
      <PageHeader eyebrow="Edit Prestart" title={`Edit Prestart: ${prestartId}`} description="Correct submission details and control whether a Fleet Job is linked." actions={<ActionButton href={`/assets/prestarts/${prestartId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>} />
      <FormCard title="Prestart Details" description="This will become the supervisor correction workflow.">
        <FormSelectField label="Result" options={["Passed", "Issue Raised", "Do Not Use"]} />
        <FormField label="Linked Fleet Job" placeholder="FJ-1003" />
        <FormSelectField label="Client Visible" options={["No", "Yes - approved summary"]} />
        <FormSelectField label="SharePoint Sync" options={["No", "Photos only", "Full prestart"]} />
        <FormTextArea label="Issue Notes" placeholder="Correct or expand the prestart issue notes." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save prestart coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
