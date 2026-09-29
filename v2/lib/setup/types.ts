export type SetupStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type SetupStepStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped"
  | "blocked";

export type SetupFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "checkbox";

export type SetupFieldOption = {
  value: string;
  label: string;
};

export type SetupField = {
  key: string;
  label: string;
  type: SetupFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: SetupFieldOption[];
};

export type SetupFormSchema = {
  fields: SetupField[];
};

export type SetupStepDefinition = {
  stepKey: string;
  name: string;
  description: string | null;
  moduleKey: string | null;
  handlerKey: string;
  requiredByDefault: boolean;
  sortOrder: number;
  formSchema: SetupFormSchema;
  defaultValues: Record<string, unknown>;
};

export type OrganisationSetupStep = SetupStepDefinition & {
  status: SetupStepStatus;
  isRequired: boolean;
  values: Record<string, unknown>;
};

export type TenantSetupContext = {
  userId: string;
  organisation: {
    id: string;
    code: string;
    name: string;
    legalName: string | null;
    abn: string | null;
  };
  memberships: Array<{
    organisationId: string;
    organisationName: string;
    organisationCode: string;
  }>;
  status: SetupStatus;
  currentStepKey: string | null;
  steps: OrganisationSetupStep[];
  completedRequired: number;
  totalRequired: number;
};
