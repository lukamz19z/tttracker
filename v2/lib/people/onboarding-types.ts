export type Classification = "operational" | "private" | "confidential";
export const onboardingTypes = [
  "text",
  "long_text",
  "email",
  "phone",
  "date",
  "number",
  "boolean",
  "single_select",
  "multi_select",
  "address",
  "document_upload",
  "training_request",
  "acknowledgement",
  "bank_account",
  "tax_identifier",
  "superannuation",
  "payroll_reference",
] as const;
export type OnboardingField = {
  key: string;
  label: string;
  type: (typeof onboardingTypes)[number];
  classification: Classification;
  domain?: string;
  required?: boolean;
  help?: string;
  options?: string[];
  training_type_id?: string;
  mapping?: string;
  condition?: { field: string; equals: unknown };
};
export type OnboardingSection = { name: string; fields: OnboardingField[] };
export type OnboardingDefinition = { sections: OnboardingSection[] };
export function minimumClassification(type: string): Classification {
  if (
    [
      "bank_account",
      "tax_identifier",
      "superannuation",
      "payroll_reference",
    ].includes(type)
  )
    return "confidential";
  return ["phone", "address"].includes(type) ? "private" : "operational";
}
export function fieldApplies(
  field: OnboardingField,
  answers: Record<string, unknown>,
) {
  return (
    !field.condition ||
    JSON.stringify(answers[field.condition.field]) ===
      JSON.stringify(field.condition.equals)
  );
}
