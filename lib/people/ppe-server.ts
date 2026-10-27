import { NextRequest,NextResponse } from "next/server";
import {getRequestUser,createServiceClient,userHasAccess} from "@/lib/access/server";
export async function ppeAccess(request:NextRequest,edit=false){
 const user=await getRequestUser(request),service=createServiceClient();
 const checks=await Promise.all(["tt.people","people.view_basic","people.view_ppe","people.edit","people.view_crews"].map(code=>userHasAccess(service,user.id,code)));
 if(!checks[0]||!checks[1]||!checks[2]||(edit&&!checks[3]))throw new Error("PPE_FORBIDDEN");
 return {user,service,canEdit:checks[3],canSeeCrews:checks[4]};
}
export function ppeError(error:unknown){
 const message=error instanceof Error?error.message:"PPE operation failed.";
 const status=message==="PPE_FORBIDDEN"?403:/authentication token|must be logged in/.test(message)?401:message.startsWith("PPE_INVALID:")?400:500;
 if(status===500)console.error("People PPE operation failed",error);
 return NextResponse.json({error:status===403?"You do not have permission to access or change PPE records.":status===500?"PPE data could not be loaded or saved. Check the PPE migration and retry.":message.replace("PPE_INVALID:","")},{status});
}
export function invalidPpe(message:string):never{throw new Error("PPE_INVALID:"+message);}
export async function ppeBody(request:NextRequest){
 const body=await request.json().catch(()=>invalidPpe("Request must contain valid JSON."));
 if(!body||typeof body!=="object"||Array.isArray(body))invalidPpe("Request must contain PPE fields.");
 return body;
}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
