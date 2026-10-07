export const folderTokens = [
  "person_id",
  "person_display_name",
  "first_name",
  "last_name",
  "employee_number",
  "relationship_type",
  "document_category",
  "training_type",
  "training_option",
  "category",
  "document_type",
  "year",
  "project_code",
  "issue_date",
  "expiry_date",
] as const;
export type DocumentRule = {
  id: string;
  parent_id?: string | null;
  relationship_type_id?: string | null;
  training_category_id?: string | null;
  provider: "internal" | "sharepoint";
  folder_template: string;
  filename_template: string;
  category: string;
  is_active: boolean;
  date_format?: string;
  collision_policy?: string;
  library_reference?: string | null;
};
export function sanitizePathPart(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*#%\x00-\x1f]/g, "-")
      .replace(/\.{2,}/g, "-")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || "unnamed"
  );
}
export function resolveTokens(
  template: string,
  values: Record<string, string>,
  folders = false,
) {
  if (
    template.includes("..") ||
    template.startsWith("/") ||
    template.includes("\\")
  )
    throw new Error("PEOPLE_INVALID_PATH");
  const parts = template.split("/");
  if (!folders && parts.length !== 1) throw new Error("PEOPLE_INVALID_PATH");
  return parts
    .map((part) =>
      sanitizePathPart(
        part.replace(/\{([^{}]+)\}/g, (_, token: string) => {
          if (!(folderTokens as readonly string[]).includes(token))
            throw new Error("PEOPLE_INVALID_PATH_TOKEN");
          return sanitizePathPart(values[token] ?? "unassigned");
        }),
      ),
    )
    .join("/");
}
export function resolveDocumentRule(
  rules: DocumentRule[],
  category: string,
  relationship: string | null,
  values: Record<string, string>,
  revisionId: string,
  trainingCategory: string | null = null,
) {
  const matches = rules.filter(
    (r) =>
      r.is_active &&
      r.category === category &&
      (!r.training_category_id ||
        r.training_category_id === trainingCategory) &&
      (!r.relationship_type_id || r.relationship_type_id === relationship),
  );
  const specificity = (rule: DocumentRule) =>
    (rule.relationship_type_id ? 1 : 0) + (rule.training_category_id ? 1 : 0);
  const rank = Math.max(-1, ...matches.map(specificity));
  const selected = matches.filter((rule) => specificity(rule) === rank);
  if (selected.length > 1) throw new Error("PEOPLE_DOCUMENT_RULE_AMBIGUOUS");
  const rule = selected[0];
  if (!rule)
    return {
      provider: "internal" as const,
      folder: revisionId,
      filename: revisionId,
    };
  const chain: DocumentRule[] = [];
  const seen = new Set<string>();
  let node: DocumentRule | undefined = rule;
  while (node) {
    if (seen.has(node.id)) throw new Error("PEOPLE_INVALID_PATH");
    seen.add(node.id);
    chain.unshift(node);
    if (node.parent_id) {
      const parent = rules.find((r) => r.id === node!.parent_id);
      if (!parent) throw new Error("PEOPLE_INVALID_PATH");
      node = parent;
    } else node = undefined;
  }
  const datedValues = { ...values };
  if (rule.date_format === "DD-MM-YYYY")
    for (const key of ["issue_date", "expiry_date"])
      if (/^\d{4}-\d{2}-\d{2}$/.test(datedValues[key] ?? ""))
        datedValues[key] = datedValues[key].split("-").reverse().join("-");
  return {
    provider: rule.provider,
    folder: chain
      .map((r) => resolveTokens(r.folder_template, datedValues, true))
      .join("/"),
    filename: `${resolveTokens(rule.filename_template, datedValues)}_${revisionId}`,
    ruleId: rule.id,
  };
}
