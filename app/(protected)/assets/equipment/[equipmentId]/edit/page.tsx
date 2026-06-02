import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditEquipmentPage({ params }: { params: Promise<{ equipmentId: string }> }) {
  const { equipmentId } = await params;

  return (
    <PageShell>
      <PageHeader eyebrow="Edit Equipment" title={`Edit Equipment: ${equipmentId.toUpperCase()}`} description="Update inspection data, crew/project allocation and equipment notes." actions={<ActionButton href={`/assets/equipment/${equipmentId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>} />
      <FormCard title="Equipment Record" description="Assign or remove project allocation as gear moves between crews.">
        <FormField label="Serial ID" placeholder={equipmentId.toUpperCase()} />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / remove project"]} />
        <FormSelectField label="Crew / Location" options={["Crew 1", "Crew 2", "Crew 3", "Workshop", "Depot"]} />
        <FormSelectField label="Status" options={["Passed", "Due Soon", "Failed", "Quarantined", "Missing"]} />
        <FormField label="Next Inspection Due" type="date" />
        <FormTextArea label="Notes" placeholder="Capacity, length, calibration range, inspection notes..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save changes coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
