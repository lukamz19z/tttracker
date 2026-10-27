import {NextRequest,NextResponse} from "next/server";
import {ppeAccess,ppeError,invalidPpe,uuidPattern,ppeBody} from "@/lib/people/ppe-server";
export async function GET(request:NextRequest){try{
 const {service}=await ppeAccess(request,true);
 const result=await service.from("people_ppe_types").select("id,name,source_field,active,requires_size,size_options,sort_order,updated_at").order("sort_order").order("name");
 if(result.error)throw new Error(result.error.message);return NextResponse.json({definitions:result.data});
}catch(error){return ppeError(error);}}
export async function POST(request:NextRequest){try{
 const {service}=await ppeAccess(request,true);const body=await ppeBody(request);
 if(typeof body.name!=="string"||!body.name.trim()||body.name.length>120)invalidPpe("Enter a PPE item name (up to 120 characters).");
 if(!Array.isArray(body.size_options)||body.size_options.length>100||body.size_options.some((value:unknown)=>typeof value!=="string"||!value.trim()||value.length>120))invalidPpe("Enter up to 100 valid size options.");
 if(new Set(body.size_options.map((value:string)=>value.trim().toUpperCase())).size!==body.size_options.length)invalidPpe("Size options must be unique.");
 for(const key of ["active","requires_size"])if(typeof body[key]!=="boolean")invalidPpe("Check the PPE settings.");
 if(!Number.isInteger(body.sort_order))invalidPpe("Enter a valid sort order.");
 const data={name:body.name.trim(),active:body.active,requires_size:body.requires_size,size_options:body.size_options.map((value:string)=>value.trim()),sort_order:body.sort_order,updated_at:new Date().toISOString()};
 // Source mapping is immutable via this API: no accidental second shirt column.
 if(body.id){if(!uuidPattern.test(body.id)||typeof body.updated_at!=="string")invalidPpe("Reload the PPE definition before editing.");
  const result=await service.from("people_ppe_types").update(data).eq("id",body.id).eq("updated_at",body.updated_at).select("id").maybeSingle();
  if(result.error){if(result.error.code==="23505")invalidPpe("A PPE item with this name already exists.");throw new Error(result.error.message);}if(!result.data)return NextResponse.json({error:"This PPE item changed. Refresh before saving."},{status:409});
 }else {const result=await service.from("people_ppe_types").insert(data);if(result.error){if(result.error.code==="23505")invalidPpe("A PPE item with this name already exists.");throw new Error(result.error.message);}}
 return NextResponse.json({success:true});
}catch(error){return ppeError(error);}}
