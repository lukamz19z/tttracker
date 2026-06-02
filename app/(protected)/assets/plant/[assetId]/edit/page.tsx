import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditPlantPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Edit Plant"
        title={`Edit Plant: ${assetId.toUpperCase()}`}
        description="Update asset details, assign it to a project, or remove the project allocation."
        actions={<ActionButton href={`/assets/plant/${assetId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>}
      />
      <FormCard title="Plant Record" description="Project assignment is explicit so assets can move between jobs cleanly.">
        <FormField label="Asset ID" placeholder={assetId.toUpperCase()} />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / remove project"]} />
        <FormSelectField label="Site Allocation" options={["Lobs Hole", "Maragle", "Depot", "Workshop"]} />
        <FormSelectField label="Status" options={["Available", "In Use", "In Workshop", "Out of Service"]} />
        <FormField label="Next Service" type="date" />
        <FormField label="CraneSafe Expiry" type="date" />
        <FormTextArea label="Internal Notes" placeholder="Fleet manager notes, job restrictions, client visibility notes..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save changes coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
