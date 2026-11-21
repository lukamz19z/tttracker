type ConfigurationRevisionLike = {
  revision?: unknown;
  status?: unknown;
  data?: unknown;
  counterweight_t?: unknown;
  outrigger_state?: unknown;
  boom_configuration?: unknown;
  boom_length_m?: unknown;
  fly_jib?: unknown;
  wind_restriction?: unknown;
  source_document?: unknown;
  counterweight_cg_x_m?: unknown;
  counterweight_cg_y_m?: unknown;
  boom_mass_kg?: unknown;
  boom_cg_x_m?: unknown;
  boom_cg_y_m?: unknown;
  fly_jib_mass_kg?: unknown;
  fly_jib_cg_x_m?: unknown;
  fly_jib_cg_y_m?: unknown;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Detects an exact retry of the same configuration draft payload. */
export function sameConfigurationDraftRevision(left: ConfigurationRevisionLike, right: ConfigurationRevisionLike): boolean {
  if (String(left.status).toLowerCase() !== "draft" || String(right.status).toLowerCase() !== "draft") return false;
  const fields: Array<keyof ConfigurationRevisionLike> = [
    "revision", "data", "counterweight_t", "outrigger_state", "boom_configuration", "boom_length_m", "fly_jib", "wind_restriction", "source_document",
    "counterweight_cg_x_m", "counterweight_cg_y_m", "boom_mass_kg", "boom_cg_x_m", "boom_cg_y_m", "fly_jib_mass_kg", "fly_jib_cg_x_m", "fly_jib_cg_y_m",
  ];
  return fields.every((field) => right[field] === undefined || stable(left[field]) === stable(right[field]));
}
