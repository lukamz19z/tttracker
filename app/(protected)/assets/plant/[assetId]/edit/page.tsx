import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditPlantPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Edit Plant"
        title={`Edit Plant: ${assetId.toUpperCase()}`}
        description="Edit core plant details. Use Update Asset for service, rego, insurance, CraneSafe and document history."
        actions={<ActionButton href={`/assets/plant/${assetId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>}
      />
      <FormCard title="Plant Record" description="Project and crew assignment are explicit so assets can move between jobs cleanly.">
        <FormField label="Asset ID" placeholder={assetId.toUpperCase()} />
        <FormSelectField label="Category" options={["Crane", "Telehandler", "Generator", "EWP", "Other"]} />
        <FormField label="Rego" placeholder="Rego or No Rego" />
        <FormField label="Make" placeholder="Make" />
        <FormField label="Model" placeholder="Model" />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / remove project"]} />
        <FormSelectField label="Crew Allocation" options={["Crew 1", "Crew 2", "Crew 3", "Workshop", "Yard", "Unassigned"]} />
        <FormSelectField label="Hired" options={["No", "Yes"]} />
        <FormField label="Hire Company" placeholder="Only if hired" />
        <FormTextArea label="Internal Notes" placeholder="Fleet manager notes, job restrictions, client visibility notes..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save changes coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
