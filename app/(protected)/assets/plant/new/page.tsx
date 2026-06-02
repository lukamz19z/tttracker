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

export default function NewPlantPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Add Asset"
        title="Add Plant"
        description="Capture the core details first. Service, compliance documents and Fleet Jobs can build from this record later."
        actions={
          <ActionButton href="/assets/plant" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Plant
          </ActionButton>
        }
      />

      <FormCard
        title="Plant Details"
        description="For cranes, telehandlers, generators and hired plant."
      >
        <FormField label="Asset ID" placeholder="MC004, TH005, GEN001" />
        <FormField label="Rego" placeholder="Rego or No Rego" />
        <FormField label="Make" placeholder="Liebherr, Merlo, Grove" />
        <FormField label="Model / Type" placeholder="LTM1220, P40.17EE" />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / no project"]} />
        <FormSelectField label="Site Allocation" options={["Depot", "Lobs Hole", "Maragle", "Yass"]} />
        <FormSelectField label="Status" options={["Available", "In Use", "In Workshop", "Out of Service", "Hired"]} />
        <FormField label="Last Service" type="date" />
        <FormField label="CraneSafe Expiry" type="date" />
        <FormTextArea label="Notes" placeholder="Workshop notes, hire details, restrictions..." />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Save plant coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
