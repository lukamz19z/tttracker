import { NextResponse } from "next/server";
import { qualityApiError,requireQualityUser } from "@/lib/quality/server";
import { eligibleMaterialUsers } from "@/lib/materials/eligible-users";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const clean=(value:unknown)=>String(value??"").trim();
export async function GET(request:Request){try{const projectId=clean(new URL(request.url).searchParams.get("projectId"));if(!projectId)return NextResponse.json({error:"Project is required."},{status:400});const {service,user}=await requireQualityUser(request);const {data:membership,error:membershipError}=await service.from("project_access").select("user_id").eq("project_id",projectId).eq("user_id",user.id).maybeSingle();if(membershipError)throw new Error(membershipError.message);if(!membership)return NextResponse.json({error:"You do not have access to this project."},{status:403});return NextResponse.json(await eligibleMaterialUsers(service,projectId));}catch(error){const result=qualityApiError(error);return NextResponse.json({error:result.message},{status:result.status});}}
