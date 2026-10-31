export const DETAIL_TYPES = ["text", "number", "select", "multi-select", "toggle", "quantity", "unit", "change-direction"] as const;
export type DetailField = {
  key: string;
  label: string;
  type: typeof DETAIL_TYPES[number];
  required?: boolean;
  options?: string[];
  unit?: string;
};
export type DetailValues = Record<string, string | number | boolean | string[]>;
export type DetailSchema = {
  fields: DetailField[];
  material?: {
    label: string;
    quantityField: string;
    dimensions: { field: string; prefix?: string; suffix?: string }[];
    // Keep removal/addition/replacement requirements separate. Never guess from prose.
    actionField?: string;
  };
};
export function populatedDetailEntries(schema:DetailSchema|undefined|null,values:DetailValues|undefined|null) {
  if(!schema?.fields?.length || !values)return [];
  return schema.fields.flatMap(field=>{const value=values[field.key];if(value===undefined||value===""||Array.isArray(value)&&!value.length)return [];const text=Array.isArray(value)?value.join(", "):typeof value==="boolean"?(value?"Yes":"No"):String(value);return [{key:field.key,label:field.label,value:field.unit?`${text} ${field.unit}`:text}];});
}
export const EMPTY_DETAIL_SCHEMA: DetailSchema = { fields: [] };

export function validateDetailSchema(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Detail configuration must be an object.";
  const schema = input as DetailSchema;
  if (!Array.isArray(schema.fields) || schema.fields.length > 40) return "Configure up to 40 detail fields.";
  const keys = new Set<string>();
  for (const field of schema.fields) {
    if (!field || !/^[a-z][a-z0-9_]{0,63}$/.test(field.key) || keys.has(field.key)) return "Each field needs a unique stable key (lowercase letters, numbers, underscores).";
    keys.add(field.key);
    if (typeof field.label !== "string" || !field.label.trim() || field.label.length > 100 || !DETAIL_TYPES.includes(field.type)) return "Each field needs a label and supported type.";
    if (field.required !== undefined && typeof field.required !== "boolean") return "Required must be a toggle.";
    if (field.unit !== undefined && (typeof field.unit !== "string" || field.unit.length > 40)) return "Unit must be a short label.";
    if (["select", "multi-select", "change-direction"].includes(field.type) && (!Array.isArray(field.options) || !field.options.length)) return `${field.label}: add selectable options.`;
    if (field.options !== undefined && (!Array.isArray(field.options) || field.options.length > 100 || field.options.some(value => typeof value !== "string" || !value.trim() || value.length > 100) || new Set(field.options).size !== field.options.length)) return `${field.label}: options must be unique, nonblank labels.`;
  }
  if (schema.material) {
    const rule = schema.material;
    if (typeof rule.label !== "string" || !rule.label.trim() || rule.label.length > 100) return "Material summary needs a label.";
    if (!schema.fields.some(field => field.key === rule.quantityField && ["quantity", "number"].includes(field.type))) return "Material quantity must reference a numeric field.";
    if (!Array.isArray(rule.dimensions) || !rule.dimensions.length || rule.dimensions.length > 8 || rule.dimensions.some(part => !keys.has(part.field) || (part.prefix !== undefined && (typeof part.prefix !== "string" || part.prefix.length > 40)) || (part.suffix !== undefined && (typeof part.suffix !== "string" || part.suffix.length > 40)))) return "Material dimensions must reference configured fields.";
    if (rule.actionField && !keys.has(rule.actionField)) return "Material action must reference a configured field.";
  }
  return null;
}

export function validateDetailValues(schema: DetailSchema, input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Operational details must be an object.";
  const values = input as DetailValues;
  // Retain old keys if configuration changes; they are never used for summaries.
  if (Object.keys(values).length > 100 || JSON.stringify(values).length > 20000) return "Operational details are too large.";
  for (const value of Object.values(values)) {
    if (!(typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) && value.every(entry => typeof entry === "string")))) return "Invalid operational detail value.";
  }
  for (const field of schema.fields) {
    const value = values[field.key];
    const blank = value === undefined || value === "" || (Array.isArray(value) && !value.length);
    if (blank) { if (field.required) return `${field.label} is required.`; continue; }
    if (["number", "quantity"].includes(field.type) && (typeof value !== "number" || !Number.isFinite(value) || (field.type === "quantity" && value < 0))) return `${field.label} must be a valid ${field.type === "quantity" ? "non-negative quantity" : "number"}.`;
    if (field.type === "toggle" && typeof value !== "boolean") return `${field.label} must be on or off.`;
    if (["text", "unit"].includes(field.type) && typeof value !== "string") return `${field.label} must be text.`;
    if (["select", "change-direction"].includes(field.type) && (typeof value !== "string" || !field.options?.includes(value))) return `${field.label}: choose a configured option.`;
    if (field.type === "multi-select" && (!Array.isArray(value) || value.some(entry => !field.options?.includes(entry)))) return `${field.label}: choose configured options.`;
  }
  return null;
}

export type MaterialFinding = { issue_type_id?: string | null; operational_details?: DetailValues | null };
export function materialRequirements(items: MaterialFinding[], types: { id: string; detail_schema?: DetailSchema | null }[]) {
  const schemas = new Map(types.map(type => [type.id, type.detail_schema]));
  const totals = new Map<string, { label: string; quantity: number; action: string; findings: number }>();
  let incomplete = 0;
  for (const item of items) {
    const schema = schemas.get(item.issue_type_id || "");
    if (!schema?.material) continue;
    const values = item.operational_details || {};
    const rule = schema.material;
    const quantity = values[rule.quantityField];
    const dimensions = rule.dimensions.map(part => values[part.field]);
    if (validateDetailValues(schema, values) || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0 || dimensions.some(value => value === undefined || value === "" || Array.isArray(value) || typeof value === "boolean") || (rule.actionField && !values[rule.actionField])) { incomplete++; continue; }
    if (quantity === 0) continue;
    const label = `${rule.dimensions.map((part, index) => `${part.prefix || ""}${dimensions[index]}${part.suffix || ""}`).join(" × ")} ${rule.label}`;
    const action = rule.actionField ? String(values[rule.actionField]) : "";
    const key = JSON.stringify([label, action]);
    const previous = totals.get(key);
    totals.set(key, { label, action, quantity: (previous?.quantity || 0) + quantity, findings: (previous?.findings || 0) + 1 });
  }
  return { rows: [...totals.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) || a.action.localeCompare(b.action)), incomplete };
}

// Editable starter configurations, explicitly chosen by a project administrator.
// Runtime behaviour never depends on the issue type's name.
export const DETAIL_TEMPLATES: { name: string; schema: DetailSchema }[] = [
  { name: "Wrong Bolt example", schema: { fields: [
    { key: "existing_diameter", label: "Existing Diameter", type: "number", unit: "mm" },
    { key: "existing_length", label: "Existing Length", type: "number", unit: "mm" },
    { key: "required_diameter", label: "Required Diameter", type: "number", unit: "mm" },
    { key: "required_length", label: "Required Length", type: "number", unit: "mm" },
    { key: "change", label: "Change", type: "change-direction", options: ["Increase", "Decrease", "Replace same size"] },
    { key: "quantity", label: "Quantity", type: "quantity" },
    { key: "connection", label: "Member / Connection", type: "text" },
  ], material: { label: "bolts", quantityField: "quantity", dimensions: [{ field: "required_diameter", prefix: "M" }, { field: "required_length" }] } } },
  { name: "Packers example", schema: { fields: [
    { key: "existing_thickness", label: "Existing Thickness", type: "number", unit: "mm" },
    { key: "existing_quantity", label: "Existing Quantity", type: "quantity" },
    { key: "required_thickness", label: "Required Thickness", type: "number", unit: "mm" },
    { key: "required_quantity", label: "Required Quantity", type: "quantity" },
    { key: "action", label: "Action", type: "select", options: ["Add", "Remove", "Replace", "Increase Thickness", "Decrease Thickness"] },
  ], material: { label: "packers", quantityField: "required_quantity", dimensions: [{ field: "required_thickness", suffix: " mm" }], actionField: "action" } } },
];
