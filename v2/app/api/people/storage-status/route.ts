import {NextRequest,NextResponse} from "next/server";
import {requirePeopleContext,peopleError} from "@/lib/people/server";
import {createSupabaseAdmin} from "@/lib/supabase/admin";
export async function GET(request:NextRequest){
  try{
    const context=await requirePeopleContext(request.nextUrl.searchParams.get("organisation"));
    if(!context.permissions?.["people.configure"]&&!context.permissions?.["training.configure"])throw new Error("PEOPLE_PERMISSION_DENIED");
    const org=context.organisation.organisationId,admin=createSupabaseAdmin();
    const integration=await admin.from("v2_integrations").select("status").eq("organisation_id",org).eq("provider","sharepoint").maybeSingle();
    const profiles=await admin.from("v2_integration_access_profiles").select("id").eq("organisation_id",org).eq("classification","operational");
    const ids=(profiles.data??[]).map(p=>p.id);
    const destinations=ids.length?await admin.from("v2_document_destinations").select("id,name").eq("organisation_id",org).eq("context","training").eq("is_active",true).in("access_profile_id",ids).limit(100):{data:[]};
    return NextResponse.json({connected:integration.data?.status==="connected",destinations:destinations.data??[]},{headers:{"Cache-Control":"no-store"}});
  }catch(error){const safe=peopleError(error);return NextResponse.json({error:safe.error},{status:safe.status});}
}
