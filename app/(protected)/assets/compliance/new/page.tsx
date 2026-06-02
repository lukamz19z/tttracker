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

export default function NewComplianceRecordPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Compliance"
        title="Add Compliance Record"
        description="Add an expiry-driven record for rego, insurance, CraneSafe, risk assessments or servicing."
        actions={
          <ActionButton href="/assets/compliance" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Compliance
          </ActionButton>
        }
      />

      <FormCard title="Compliance Details" description="These records feed the dashboard reminders.">
        <FormField label="Asset" placeholder="MC001 Liebherr LTM1220" />
        <FormSelectField label="Record Type" options={["Rego", "Insurance", "Service", "CraneSafe", "Risk Assessment", "Inspection"]} />
        <FormField label="Due Date" type="date" />
        <FormSelectField label="Owner" options={["Fleet", "Admin", "Safety", "Workshop"]} />
        <FormSelectField label="Status" options={["Current", "Due Soon", "Overdue", "Review"]} />
        <FormField label="Reference" placeholder="Policy number, certificate ID, inspection ref" />
        <FormTextArea label="Notes" placeholder="Renewal notes, upload location, follow-up needed..." />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Save record coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
