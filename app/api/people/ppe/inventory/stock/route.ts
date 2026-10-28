import {NextRequest,NextResponse} from "next/server";
import {inventoryAccess,inventoryError} from "@/lib/people/ppe-inventory-server";
import {ppeBody,invalidPpe,uuidPattern} from "@/lib/people/ppe-server";
export async function POST(request:NextRequest){try{
 const body=await ppeBody(request);
 if(!["receipt","issue","adjustment","reversal"].includes(body.kind))invalidPpe("Choose a stock operation.");
 const {service,user}=await inventoryAccess(request,body.kind==="receipt"?"receive":body.kind==="issue"?"issue":"adjust");
 if(!uuidPattern.test(String(body.mutation_id)))invalidPpe("A stock request ID is required.");
 if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>500)invalidPpe("Submit 1 to 500 stock lines.");
 for(const line of body.lines){
  if(!line||!uuidPattern.test(String(line.size_id))||!Number.isInteger(line.quantity)||!line.quantity||Math.abs(line.quantity)>1000000)invalidPpe("Choose a size and valid whole quantity for every line.");
  if(body.kind==="issue"&&(!uuidPattern.test(String(line.employee_id))||line.quantity<1))invalidPpe("Choose a person and positive quantity for every issue.");
  if(body.kind==="receipt"&&line.quantity<1)invalidPpe("Receipt quantities must be positive.");
  if(body.kind==="reversal"&&!uuidPattern.test(String(line.reversal_of)))invalidPpe("Choose an original issue to reverse.");
  if(body.kind!=="issue"&&line.employee_id)invalidPpe("Employee links are only accepted for issues.");
 }
 for(const key of ["notes","reference","supplier"])if(body[key]!=null&&(typeof body[key]!=="string"||body[key].length>2000))invalidPpe(`Check ${key}.`);
 if(["adjustment","reversal"].includes(body.kind)&&!body.notes?.trim())invalidPpe("A reason is required.");
 if(body.occurred_at&&(!Number.isFinite(Date.parse(body.occurred_at))||Date.parse(body.occurred_at)>Date.now()))invalidPpe("Choose a valid date that is not in the future.");
 const actor=await service.from("employees").select("full_name").eq("user_id",user.id).limit(1).maybeSingle();
 if(actor.error)throw new Error(`PPE issuing user query failed: ${actor.error.message}`);
 const metadataName=user.user_metadata?.full_name||user.user_metadata?.name;
 const label=actor.data?.full_name||(typeof metadataName==="string"&&metadataName.trim()?metadataName.trim():`TTTracker user ${user.id}`);
 const {data,error}=await service.rpc("v1_ppe_inventory_post",{p_request:body,p_actor:user.id,p_actor_label:label});
 if(error)invalidPpe(error.message);if(!data)throw new Error("PPE stock operation succeeded without returning a batch ID.");
 return NextResponse.json({batch_id:data});
}catch(error){return inventoryError(error);}}
