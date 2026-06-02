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

export default function NewEquipmentPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Add Asset"
        title="Add Equipment"
        description="Register lifting gear, calibrated tools, torque wrenches, hoists, fall arrest gear and crew equipment."
        actions={
          <ActionButton href="/assets/equipment" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Equipment
          </ActionButton>
        }
      />

      <FormCard title="Equipment Details" description="Inspection dates and crew allocation matter most here.">
        <FormField label="Serial ID" placeholder="17707931, TW-001" />
        <FormSelectField label="Equipment Type" options={["Round Sling", "Chain Sling", "Harness", "Lever Hoist", "Torque Wrench", "Other"]} />
        <FormField label="Description" placeholder="Legend 1T purple 1.0m" />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / no project"]} />
        <FormSelectField label="Crew / Location" options={["Crew 1", "Crew 2", "Crew 3", "Workshop", "Depot"]} />
        <FormSelectField label="Tag Colour" options={["Green", "Blue", "Yellow", "Red", "N/A"]} />
        <FormSelectField label="Status" options={["Passed", "Due Soon", "Failed", "Quarantined", "Missing"]} />
        <FormField label="Inspected On" type="date" />
        <FormField label="Next Inspection Due" type="date" />
        <FormTextArea label="Notes" placeholder="Capacity, length, calibration range, inspection comments..." />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Save equipment coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
