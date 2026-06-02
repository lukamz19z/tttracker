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

export default function NewVehiclePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Add Asset"
        title="Add Vehicle"
        description="Add light vehicles, heavy vehicles and trailers with the fleet fields needed for allocation and compliance reminders."
        actions={
          <ActionButton href="/assets/vehicles" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Vehicles
          </ActionButton>
        }
      />

      <FormCard title="Vehicle Details" description="Keep this short enough to enter on an iPad.">
        <FormField label="Assigned Vehicle ID" placeholder="LV010, HV005, TR018" />
        <FormField label="Rego" placeholder="S123ABC" />
        <FormSelectField label="Category" options={["Light Vehicle", "Heavy Vehicle", "Trailer"]} />
        <FormField label="Make / Type" placeholder="Toyota Hilux, Isuzu FZM" />
        <FormField label="VIN" placeholder="VIN number" />
        <FormSelectField label="Site Allocation" options={["Depot", "Lobs Hole", "Maragle", "Tumbarumba"]} />
        <FormField label="Rego Expiry" type="date" />
        <FormField label="Insurance Expiry" type="date" />
        <FormTextArea label="Notes" placeholder="Fuel card, dash cam, eHub, restrictions..." />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Save vehicle coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
