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

export default function NewFleetJobPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Jobs"
        title="Log Fleet Job"
        description="Raise an issue for a vehicle, plant item or equipment record so the fleet manager can triage and assign it."
        actions={
          <ActionButton href="/assets/maintenance" variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Fleet Jobs
          </ActionButton>
        }
      />

      <FormCard title="Job Details" description="This is the job intake form for defects and maintenance issues.">
        <FormField label="Asset" placeholder="LV004 Toyota Hilux" />
        <FormSelectField label="Job Type" options={["Prestart Fault", "Mechanical", "Damage", "Breakdown", "Service", "Calibration", "Inspection Finding"]} />
        <FormSelectField label="Priority" options={["Low", "Medium", "High", "Critical"]} />
        <FormSelectField label="Safety Status" options={["Safe to Use", "Monitor", "Restricted Use", "Do Not Use"]} />
        <FormField label="Reported By" placeholder="Operator, supervisor, fleet manager" />
        <FormSelectField label="Status" options={["Raised", "Triage", "Assigned", "Waiting Parts"]} />
        <FormTextArea label="Issue Description" placeholder="What happened, where is it, what needs attention?" />
        <div className="sm:col-span-2">
          <DisabledSubmit label="Create job coming soon" />
        </div>
      </FormCard>
    </PageShell>
  );
}
