import type {
  SetupField,
  SetupFormSchema,
} from "@/lib/setup/types";

export function validateSetupValues(
  schema: SetupFormSchema,
  values: Record<string, unknown>,
) {
  const errors: Record<string, string> = {};

  for (const field of schema.fields ?? []) {
    if (!field.required) continue;

    const value = values[field.key];

    if (field.type === "checkbox") {
      continue;
    }

    if (
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ) {
      errors[field.key] = `${field.label} is required.`;
    }
  }

  return errors;
}

export function normaliseFieldValue(
  field: SetupField,
  value: unknown,
) {
  if (field.type === "checkbox") {
    return Boolean(value);
  }

  if (field.type === "number") {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue)
      ? numberValue
      : null;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}
