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
} from "../../../components";

export default async function UpdatePlantAssetPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Update Asset"
        title={`Update Plant: ${assetId.toUpperCase()}`}
        description="Add a traceable event to this plant item without editing the original asset record. This is for new service, rego, insurance, CraneSafe, hire, project or document updates."
        actions={
          <ActionButton
            href={`/assets/plant/${assetId}`}
            variant="secondary"
            icon={<ArrowLeft size={16} />}
          >
            Back to View
          </ActionButton>
        }
      />

      <FormCard
        title="Plant Update"
        description="Choose the update type, then add dates, notes and optional document links."
      >
        <FormSelectField
          label="Update Type"
          options={[
            "Service",
            "Rego",
            "Insurance",
            "CraneSafe / Inspection",
            "Risk Assessment",
            "Project Assignment",
            "Crew Allocation",
            "Hire Details",
            "Document Only",
          ]}
        />
        <FormField label="Update Date" type="date" />
        <FormField label="Expiry / Next Due Date" type="date" />
        <FormSelectField
          label="Project Assignment"
          options={["No change", "Snowy 2.0", "Maragle", "Tumbarumba", "Unassigned / remove project"]}
        />
        <FormSelectField
          label="Crew Allocation"
          options={["No change", "Crew 1", "Crew 2", "Crew 3", "Workshop", "Yard", "Unassigned"]}
        />
        <FormField label="Supplier / Hire Company" placeholder="Only if relevant" />
        <FormField label="Document Link" placeholder="SharePoint link or reference" />
        <FormSelectField label="Client Visible" options={["No", "Yes - status only", "Yes - document"]} />
        <FormTextArea
          label="Update Notes"
          placeholder="Service notes, rego renewal notes, insurance policy details, inspection outcome, project movement..."
        />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Save update coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
