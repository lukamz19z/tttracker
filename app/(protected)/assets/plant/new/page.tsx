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
        description="Create the plant record first. Attach documents if you have them, but do not block the asset setup if paperwork is still coming."
        actions={
          <ActionButton href="/assets/plant" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Plant
          </ActionButton>
        }
      />

      <FormCard
        title="Plant Details"
        description="Core plant fields only. History gets added against the asset after it exists."
      >
        <FormField label="Asset ID" placeholder="MC004, TH005, GEN001" />
        <FormField label="Rego" placeholder="Rego or No Rego" />
        <FormSelectField label="Category" options={["Crane", "Telehandler", "Generator", "EWP", "Other"]} />
        <FormField label="Make" placeholder="Liebherr, Merlo, Grove" />
        <FormField label="Model" placeholder="LTM1220, P40.17EE" />
        <FormSelectField label="Project Assignment" options={["Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / no project"]} />
        <FormSelectField label="Crew Allocation" options={["Unassigned", "Crew 1", "Crew 2", "Crew 3", "Workshop", "Yard"]} />
        <FormSelectField label="Hired" options={["No", "Yes"]} />
        <FormField label="Hire Company" placeholder="Only if hired" />
        <FormField label="Last Service" type="date" />
        <FormField label="Next Service" type="date" />
        <FormField label="CraneSafe Expiry" type="date" />
        <FormTextArea label="Notes" placeholder="Workshop notes, hire details, restrictions..." />
        <div className="sm:col-span-2 border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-bold text-slate-950">Optional starting documents</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Add these later from the plant view if you do not have them now. CraneSafe only applies to cranes.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FormField label="Service Record Link" placeholder="SharePoint link or reference" />
            <FormField label="Insurance Document Link" placeholder="SharePoint link or reference" />
            <FormField label="Rego Document Link" placeholder="SharePoint link or reference" />
            <FormField label="CraneSafe Certificate Link" placeholder="Crane only" />
            <FormField label="Risk Assessment Link" placeholder="SharePoint link or reference" />
            <FormField label="Hire Agreement Link" placeholder="If hired" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <DisabledSubmit label="Save plant coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
