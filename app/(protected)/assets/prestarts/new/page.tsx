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

export default function NewPrestartPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Daily Checks"
        title="New Prestart"
        description="A future operator-facing prestart form. Flagged answers can create a Fleet Job automatically."
        actions={
          <ActionButton href="/assets/prestarts" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Prestarts
          </ActionButton>
        }
      />

      <FormCard title="Prestart Submission" description="Designed for quick morning entry from phone or iPad.">
        <FormField label="Asset" placeholder="LV004 Toyota Hilux" />
        <FormField label="Operator" placeholder="Operator name" />
        <FormSelectField label="Site" options={["Depot", "Lobs Hole", "Maragle", "Tumbarumba"]} />
        <FormField label="Odometer / Hours" placeholder="84,210 km or 1,420 hrs" />
        <FormSelectField label="Overall Result" options={["Passed", "Issue Raised", "Do Not Use"]} />
        <FormSelectField label="Create Fleet Job" options={["No", "Yes"]} />
        <FormTextArea label="Issue Notes" placeholder="Describe any fault, warning light, damage or safety concern." />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Submit prestart coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
