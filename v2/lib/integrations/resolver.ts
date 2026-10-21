import { sanitizePathPart } from "@/lib/people/document-rules";
export const contextTokens = {
  profile_photos: ["person_id","employee_number","person_display_name","first_name","last_name","upload_date"],
  people: ["person_id","employee_number","person_display_name","first_name","last_name","employment_type"],
  training: ["person_id","employee_number","person_display_name","first_name","last_name","employment_type","training_category","training_type","training_option","document_side","issue_date","expiry_date"],
  onboarding: ["person_id","person_display_name","employee_number","onboarding_instance_id","recipient_name"],
  projects: ["project_id","project_number","project_code","project_name","client_name"],
  assets: ["asset_id","asset_number","asset_type","asset_identifier","registration"],
  prestarts: ["project_id","project_code","asset_id","asset_number"],
  daily_dockets: ["project_id","project_number","project_code","project_name"],
  quality: ["project_id","project_number","project_code","project_name"],
  safety: ["project_id","project_number","project_code","project_name"],
  commercial: ["project_id","project_number","project_code","project_name","client_name"],
  site_prestarts: ["project_id","project_code"],
  asset_prestarts: ["asset_id","asset_number","asset_identifier"],
  tendering: [], // Future/generic routing only: no invented tender records/tokens.
  general: [],
} as const;
export type DocumentContext = keyof typeof contextTokens;
export type Destination = { id: string;organisation_id: string;context: DocumentContext;root_path: string;folder_template: string;filename_template: string;conflict_policy: "version"|"sequence"|"replace";is_active: boolean;access_profile_id: string;site_id: string };
export function renderPath(template: string, context: DocumentContext, values: Record<string,string>, filename = false) {
  if (!contextTokens[context] || template.includes("..") || template.startsWith("/") || template.includes("\\") || (filename && template.includes("/"))) throw new Error("INTEGRATION_PATH_INVALID");
  const allowed: readonly string[] = [...contextTokens[context],"year","month","document_category","document_type"];
  return template.split("/").filter(Boolean).map(part => sanitizePathPart(part.replace(/\{([^{}]+)\}/g,(_,key: string) => {
    if (!allowed.includes(key)) throw new Error("INTEGRATION_TOKEN_INVALID");
    if (!values[key]) {
      // Keep the token in a bounded diagnostic code so adapters can explain
      // the missing business field without exposing the raw template/token.
      const diagnostic = key === "employee_number" ? "INTEGRATION_EMPLOYEE_NUMBER_MISSING"
        : key === "training_type" ? "INTEGRATION_TRAINING_TYPE_MISSING"
        : key === "person_display_name" ? "INTEGRATION_PERSON_NAME_MISSING"
        : "INTEGRATION_TOKEN_VALUE_MISSING";
      throw new Error(diagnostic);
    }
    const value = /^(issue_date|expiry_date)$/.test(key) ? values[key].split("-").reverse().join("-") : values[key];
    return sanitizePathPart(value);
  }))).join("/");
}
/** Ensure a physical front/back Training document has a distinct, readable
 * filename even when a legacy inherited template omitted the side token.
 * Single-document evidence is untouched because its side is "Single". */
export function ensureTrainingDocumentSideFilename(filename: string, template: string, values: Record<string,string>) {
 const side = values.document_side;
 if (!/^(front|back)$/i.test(side ?? "") || /\{document_side\}/i.test(template)) return filename;
 const extension = filename.match(/(\.[a-z0-9]{1,8})$/i)?.[1] ?? "";
 const base = extension ? filename.slice(0, -extension.length) : filename;
 return `${base} - ${side.toLowerCase() === "front" ? "Front" : "Back"}${extension}`;
}
export function resolveDestination(destination: Destination,organisationId: string,context: DocumentContext,values: Record<string,string>, classification: string) {
  if (destination.organisation_id !== organisationId || !destination.is_active || destination.context !== context) throw new Error("INTEGRATION_SCOPE_INVALID");
  if (classification === "confidential") throw new Error("INTEGRATION_CONFIDENTIAL_UNAVAILABLE");
  const resolvedFilename = renderPath(destination.filename_template,context,values,true);
  return { ...destination,folderSegments: [renderPath(destination.root_path,context,values),renderPath(destination.folder_template,context,values)].join("/").split("/").filter(Boolean),filename: context === "training" ? ensureTrainingDocumentSideFilename(resolvedFilename, destination.filename_template, values) : resolvedFilename,provider: "sharepoint" as const };
}

export const contextLabels: Record<DocumentContext,string> = {profile_photos:"Profile Photos / ID Photos",people:"People",training:"Training",onboarding:"Onboarding",projects:"Projects",assets:"Assets",prestarts:"Prestarts",asset_prestarts:"Asset Prestarts",site_prestarts:"Site Prestarts",daily_dockets:"Daily Dockets",quality:"Quality",safety:"Safety",commercial:"Commercial",tendering:"Tendering (future/generic)",general:"General Documents"};
export type SharePointLocation = {id:string;organisation_id:string;site_id:string;name:string;drive_id:string;drive_name:string;root_path:string;is_active:boolean;root_item_id?:string|null};
export type RoutingRule = Destination & {location_id?:string|null;creation_policy?:string;rename_policy?:"keep"|"rename";child_folders?:string[];relationship_type_id?:string|null;priority?:number};
/** Filename inheritance for Training. The selected destination rule supplies
 * the organisation default; nullable catalogue values are true overrides. */
export function resolveTrainingFilenameTemplate(ticket?: string | null, category?: string | null, organisationDefault?: string | null) {
 return [ticket,category,organisationDefault].find(value=>typeof value==="string"&&value.trim())?.trim()??"{training_type}_{year}";
}
export function resolveLocationDestination(rule:RoutingRule,location:SharePointLocation,org:string,context:DocumentContext,values:Record<string,string>,classification:string){
 if(location.organisation_id!==org||!location.is_active||rule.location_id!==location.id||rule.site_id!==location.site_id)throw new Error("INTEGRATION_SCOPE_INVALID");
 const resolved=resolveDestination(rule,org,context,values,classification);
 return {...resolved,locationId:location.id,driveId:location.drive_id,folderSegments:[...renderPath(location.root_path,context,values).split("/").filter(Boolean),...resolved.folderSegments]};
}
export function selectRoutingRule(rules:RoutingRule[],org:string,context:DocumentContext,relationship:string|null){
 const matches=rules.filter(r=>r.organisation_id===org&&r.is_active&&r.context===context&&(!r.relationship_type_id||r.relationship_type_id===relationship)).sort((a,b)=>(b.priority??0)-(a.priority??0)||Number(!!b.relationship_type_id)-Number(!!a.relationship_type_id));
 if(matches.length>1&&(matches[0].priority??0)===(matches[1].priority??0)&&!!matches[0].relationship_type_id===!!matches[1].relationship_type_id)throw new Error("INTEGRATION_ROUTING_AMBIGUOUS");
 return matches[0]??null;
}
