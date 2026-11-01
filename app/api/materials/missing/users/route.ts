import { NextResponse } from "next/server";
import { assertQualityProjectAccess, qualityApiError,requireQualityUser } from "@/lib/quality/server";
import { configuredMaterialUsers } from "@/lib/materials/configured-users";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const clean=(value:unknown)=>String(value??"").trim();
export async function GET(request:Request){try{const projectId=clean(new URL(request.url).searchParams.get("projectId"));if(!projectId)return NextResponse.json({error:"Project is required."},{status:400});const {service,user,role}=await requireQualityUser(request);await assertQualityProjectAccess({service,userId:user.id,role,projectId});return NextResponse.json({materialUsers:await configuredMaterialUsers(service,projectId)});}catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}}
