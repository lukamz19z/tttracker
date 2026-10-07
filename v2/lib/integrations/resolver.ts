import { sanitizePathPart } from "@/lib/people/document-rules";
export const contextTokens = {
  people: ["person_id","employee_number","person_display_name","first_name","last_name","employment_type"],
  training: ["person_id","employee_number","person_display_name","first_name","last_name","employment_type","training_category","training_type","training_option","issue_date","expiry_date"],
  onboarding: ["person_id","person_display_name","employee_number"],
  projects: ["project_id","project_number","project_code","project_name","client_name"],
  assets: ["asset_id","asset_number","asset_type","registration"],
  prestarts: ["project_id","project_code","asset_id","asset_number"],
  general: [],
} as const;
export type DocumentContext = keyof typeof contextTokens;
export type Destination = { id: string;organisation_id: string;context: DocumentContext;root_path: string;folder_template: string;filename_template: string;conflict_policy: "version"|"sequence"|"replace";is_active: boolean;access_profile_id: string;site_id: string };
export function renderPath(template: string, context: DocumentContext, values: Record<string,string>, filename = false) {
  if (!contextTokens[context] || template.includes("..") || template.startsWith("/") || template.includes("\\") || (filename && template.includes("/"))) throw new Error("INTEGRATION_PATH_INVALID");
  const allowed: readonly string[] = [...contextTokens[context],"year","month","document_category","document_type"];
  return template.split("/").filter(Boolean).map(part => sanitizePathPart(part.replace(/\{([^{}]+)\}/g,(_,key: string) => {
    if (!allowed.includes(key)) throw new Error("INTEGRATION_TOKEN_INVALID");
    if (!values[key]) throw new Error("INTEGRATION_TOKEN_VALUE_MISSING");
    const value = /^(issue_date|expiry_date)$/.test(key) ? values[key].split("-").reverse().join("-") : values[key];
    return sanitizePathPart(value);
  }))).join("/");
}
export function resolveDestination(destination: Destination,organisationId: string,context: DocumentContext,values: Record<string,string>, classification: string) {
  if (destination.organisation_id !== organisationId || !destination.is_active || destination.context !== context) throw new Error("INTEGRATION_SCOPE_INVALID");
  if (classification === "confidential") throw new Error("INTEGRATION_CONFIDENTIAL_UNAVAILABLE");
  return { ...destination,folderSegments: [renderPath(destination.root_path,context,values),renderPath(destination.folder_template,context,values)].join("/").split("/").filter(Boolean),filename: renderPath(destination.filename_template,context,values,true),provider: "sharepoint" as const };
}
