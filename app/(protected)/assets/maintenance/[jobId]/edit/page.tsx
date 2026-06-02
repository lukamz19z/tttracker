import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditFleetJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  return (
    <PageShell>
      <PageHeader eyebrow="Edit Fleet Job" title={`Edit Job: ${jobId}`} description="Update status, assignment, safety state and close-out notes." actions={<ActionButton href={`/assets/maintenance/${jobId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>} />
      <FormCard title="Job Workflow" description="Fleet manager and workshop fields.">
        <FormSelectField label="Status" options={["Raised", "Triage", "Assigned", "Waiting Parts", "Closed"]} />
        <FormSelectField label="Assigned To" options={["Fleet Manager", "Workshop", "Mechanic", "Supervisor"]} />
        <FormSelectField label="Client Visible" options={["No", "Yes - summary only"]} />
        <FormSelectField label="SharePoint Sync" options={["Not ready", "Sync photos", "Sync close-out report"]} />
        <FormField label="Close-out Date" type="date" />
        <FormTextArea label="Notes" placeholder="Work completed, parts required, client-safe summary..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save job coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
