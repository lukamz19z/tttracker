import type { DocumentContext } from "./resolver";
export const documentAreas: {name:string;contexts:DocumentContext[]}[] = [
  {name:"People",contexts:["people","profile_photos","training","onboarding"]},
  {name:"Projects",contexts:["projects","daily_dockets"]},
  {name:"Assets",contexts:["assets","asset_prestarts"]},
  {name:"Operations",contexts:["prestarts","site_prestarts"]},
  {name:"Quality & Safety",contexts:["quality","safety"]},
  {name:"Commercial",contexts:["commercial","tendering"]},
  {name:"General",contexts:["general"]},
];
export const documentNames:Record<DocumentContext,string>={profile_photos:"Profile Photos",people:"Employment Documents",training:"Training Documents",onboarding:"Onboarding Documents",projects:"Project Documents",assets:"Asset Documents",prestarts:"Prestarts",asset_prestarts:"Asset Prestarts",site_prestarts:"Site Prestarts",daily_dockets:"Daily Dockets",quality:"Quality Documents",safety:"Safety Documents",commercial:"Commercial Documents",tendering:"Tendering Documents",general:"General Documents"};
export function availableDocumentContexts(modules:ReadonlySet<string>,configured:readonly DocumentContext[]) {
  const contextModules:Partial<Record<DocumentContext,string>>={profile_photos:"people",people:"people",training:"people",onboarding:"people",projects:"projects",daily_dockets:"daily_dockets",assets:"assets",asset_prestarts:"assets",prestarts:"prestarts",site_prestarts:"people",quality:"quality",safety:"safety",commercial:"commercial"};
  return documentAreas.flatMap(a=>a.contexts).filter(c=>configured.includes(c)||c==="general"||!!contextModules[c]&&modules.has(contextModules[c]??""));
}
export function suggestedDocumentTemplate(context:DocumentContext) {
  const person="{employee_number} - {person_display_name}";
  return {folder_template:context==="profile_photos"?person+"/Profile Photos":context==="training"?person+"/Training/{training_type}":context==="onboarding"?"Onboarding/{onboarding_instance_id}":context==="people"?person+"/Employment":context==="assets"?"{asset_identifier}/Documents":["projects","daily_dockets","quality","safety","commercial"].includes(context)?"{project_number} - {project_name}"+(context==="projects"?"":"/"+documentNames[context]):"{year}/{month}",filename_template:context==="profile_photos"?"{employee_number} - {person_display_name} - {document_type}":context==="training"?"{employee_number}_{training_type}_{issue_date}":"{document_type}_{year}_{month}"};
}
export function sharePointCustomerError(code?:string) {
  const configurationErrors:Record<string,string>={INTEGRATION_DOCUMENT_DESTINATION_REQUIRED:"Select a Document Destination.",INTEGRATION_DOCUMENT_DESTINATION_INVALID:"The selected destination is unavailable or does not belong to your organisation. Choose another destination.",INTEGRATION_DOCUMENT_ACCESS_REQUIRED:"Choose Document Access settings under Advanced Settings. Standard permissions are not available for this document type.",INTEGRATION_DOCUMENT_ACCESS_INVALID:"The selected Document Access settings are unavailable or invalid.",INTEGRATION_DOCUMENT_RULE_CONFLICT:"Another document setup has the same identity or conflicting default settings. Edit the existing setup or use Advanced Settings.",INTEGRATION_DOCUMENT_PRIORITY_INVALID:"Enter a whole number for priority under Advanced Settings.",INTEGRATION_DOCUMENT_SAVE_FAILED:"The document setup could not be saved. Check the selected destination and access settings, then retry.",INTEGRATION_ACCESS_DENIED:"You do not have permission to manage SharePoint document setup.",INTEGRATION_NOT_ENTITLED:"SharePoint integration is not available for this organisation.",INTEGRATION_NAME_REQUIRED:"Enter a name and a filename template.",INTEGRATION_TRIGGER_UNAVAILABLE:"Choose when folders should be created."};
  if(code&&configurationErrors[code])return configurationErrors[code];
  if(code==="INTEGRATION_SETUP_WRONG_TENANT")return "This site approval used another Microsoft organisation. Sign in with your organisation's Microsoft administrator.";
  if(code==="INTEGRATION_SITE_MEMBER_ACCESS_REQUIRED")return "The Microsoft administrator does not have access to this SharePoint site.";
  if(code==="INTEGRATION_MICROSOFT_ADMIN_REQUIRED")return "A Microsoft administrator needs to approve access.";
  if(code==="INTEGRATION_RESOURCE_NOT_FOUND")return "The SharePoint site could not be found. Check its address.";
  if(code==="INTEGRATION_RATE_LIMITED"||code==="INTEGRATION_PROVIDER_UNAVAILABLE")return "Microsoft is temporarily unavailable. Try again shortly.";
  if(code==="INTEGRATION_SCOPE_INVALID")return "This SharePoint site or destination does not belong to your organisation.";
  if(code&&/CONSENT|APPROVAL|SCOPE|APP_NOT_INSTALLED/.test(code))return "Microsoft administrator approval is required. Ask your Microsoft administrator to approve TTTracker, then retry.";
  if(code&&/SETUP|TOKEN|SESSION/.test(code))return "Microsoft sign-in could not be verified. Restart approval from your current TTTracker session.";
  if(code&&/NOT_FOUND|UNAVAILABLE/.test(code))return "The site or document library could not be found or is temporarily unavailable.";
  return "The Microsoft connection needs attention. Check Advanced Details or contact TTTracker support.";
}
