import "server-only";
import { createHash } from "node:crypto";
import type { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { DocumentContext } from "./resolver";
type Database=ReturnType<typeof createSupabaseAdmin>;
// Defaults refer to capabilities, not roles, and never grant those capabilities to users.
const defaults:Partial<Record<DocumentContext,[string,string]>>={profile_photos:["people.profile_photo.view","people.profile_photo.manage"],training:["training.view","training.edit"],people:["people.view","people.edit"],onboarding:["people.view","people.edit"],projects:["projects.view","projects.edit"]};
export async function documentSetupAccess(db:Database,org:string,context:DocumentContext,requested?:string) {
  if(requested){const result=await db.from("v2_integration_access_profiles").select("id,classification").eq("organisation_id",org).eq("id",requested).single();if(result.error||!result.data||result.data.classification==="confidential")throw new Error("INTEGRATION_DOCUMENT_ACCESS_INVALID");return result.data.id as string;}
  const capabilities=defaults[context];if(!capabilities)throw new Error("INTEGRATION_DOCUMENT_ACCESS_REQUIRED");
  const [read,manage]=capabilities;
  const catalogue=await db.from("v2_permissions").select("permission_code").in("permission_code",capabilities);
  if(catalogue.error||catalogue.data?.length!==2)throw new Error("INTEGRATION_DOCUMENT_ACCESS_REQUIRED");
  const existing=await db.from("v2_integration_access_profiles").select("id").eq("organisation_id",org).eq("classification","operational").eq("read_capability",read).eq("manage_capability",manage).limit(1).maybeSingle();
  if(existing.error)throw new Error("INTEGRATION_DOCUMENT_ACCESS_INVALID");if(existing.data)return existing.data.id as string;
  // Stable organisation/capability identity makes concurrent first saves idempotent.
  const hex=createHash("sha256").update(`document-access:${org}:${read}:${manage}`).digest("hex");
  const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  const created=await db.from("v2_integration_access_profiles").upsert({id,organisation_id:org,name:`${context.charAt(0).toUpperCase()+context.slice(1)} Documents`,read_capability:read,manage_capability:manage,classification:"operational",native_mode:"inherit"},{onConflict:"id",ignoreDuplicates:true});
  if(created.error)throw new Error("INTEGRATION_DOCUMENT_ACCESS_INVALID");
  const verified=await db.from("v2_integration_access_profiles").select("id").eq("organisation_id",org).eq("id",id).eq("read_capability",read).eq("manage_capability",manage).eq("classification","operational").single();
  if(verified.error||!verified.data)throw new Error("INTEGRATION_DOCUMENT_ACCESS_INVALID");return verified.data.id as string;
}
