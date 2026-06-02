import { ArrowLeft } from "lucide-react";
import { ActionButton, DisabledSubmit, FormCard, FormField, FormSelectField, FormTextArea, PageHeader, PageShell } from "../../../components";

export default async function EditVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;

  return (
    <PageShell>
      <PageHeader eyebrow="Edit Vehicle" title={`Edit Vehicle: ${vehicleId.toUpperCase()}`} description="Update vehicle allocation, compliance and onboard systems." actions={<ActionButton href={`/assets/vehicles/${vehicleId}`} variant="secondary" icon={<ArrowLeft size={16} />}>Back to View</ActionButton>} />
      <FormCard title="Vehicle Record" description="Extra operational fields live here rather than crowding the register.">
        <FormField label="Vehicle ID" placeholder={vehicleId.toUpperCase()} />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / remove project"]} />
        <FormSelectField label="eHub" options={["Yes", "No", "N/A"]} />
        <FormSelectField label="Dash Cam" options={["Yes", "No", "N/A"]} />
        <FormSelectField label="Alert Button" options={["Yes", "No", "N/A"]} />
        <FormSelectField label="Fuel Card" options={["Yes", "No", "N/A"]} />
        <FormTextArea label="Notes" placeholder="Client visibility, restrictions, internal fleet notes..." />
        <div className="sm:col-span-2"><DisabledSubmit label="Save changes coming soon" /></div>
      </FormCard>
    </PageShell>
  );
}
