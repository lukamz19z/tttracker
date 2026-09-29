export type ProjectIdentifierConfig = {
  label: string;
  mode: "manual" | "automatic" | "optional";
  required: boolean;
  requireUnique: boolean;
  prefix: string | null;
  separator: string;
  padding: number;
  nextNumber: number;
  validationRegex: string | null;
  helpText: string | null;
};

export type DynamicFieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType:
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "select"
    | "checkbox";
  required: boolean;
  sortOrder: number;
  options: Array<{
    value: string;
    label: string;
  }>;
  placeholder: string | null;
  helpText: string | null;
};
