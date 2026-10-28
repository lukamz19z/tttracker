import {NextRequest,NextResponse} from "next/server";
import {inventoryAccess,inventoryError} from "@/lib/people/ppe-inventory-server";
import {invalidPpe} from "@/lib/people/ppe-server";
import {ppeCrewLabel,type PpeCrew,type PpeType} from "@/lib/people/ppe";
export async function GET(request:NextRequest){try{
 const {service,canSeeCrews}=await inventoryAccess(request,"issue");
 const search=(request.nextUrl.searchParams.get("q")||"").replace(/[^\p{L}\p{N} '-]/gu," ").trim().slice(0,120);
 const offset=Number(request.nextUrl.searchParams.get("offset")||0);if(!Number.isInteger(offset)||offset<0)invalidPpe("Invalid employee page.");
 let query=service.from("employees").select("id,full_name,payroll_id,crew_id,shirt_size,jacket_size,glove_size,pants_size").or("active.is.null,active.eq.true").order("full_name").order("id").range(offset,offset+49);
 if(search)query=query.or(`full_name.ilike.%${search}%,payroll_id.ilike.%${search}%`);
 const people=await query;if(people.error)throw new Error(`PPE employee search failed: ${people.error.message}`);
 const ids=people.data.map(p=>p.id);
 async function loadRequirements(){const rows:{employee_id:string;ppe_type_id:string;size_value:string|null}[]=[];if(!ids.length)return rows;for(let offset=0;;offset+=1000){const result=await service.from("people_ppe_requirements").select("employee_id,ppe_type_id,size_value").in("employee_id",ids).order("employee_id").order("ppe_type_id").range(offset,offset+999);if(result.error)throw new Error(`PPE sizing suggestions query failed: ${result.error.message}`);rows.push(...result.data);if(result.data.length<1000)return rows;}}
 const [definitions,requirements,crews]=await Promise.all([
  service.from("people_ppe_types").select("id,source_field"),loadRequirements(),
  canSeeCrews?service.from("crews").select("id,crew_number,crew_name"):Promise.resolve({data:[],error:null})
 ]);
 if(definitions.error||crews.error)throw new Error(`PPE sizing suggestion query failed: ${definitions.error?.message||crews.error?.message}`);
 return NextResponse.json({people:people.data.map(p=>({...{id:p.id,full_name:p.full_name,payroll_id:p.payroll_id},crew_label:canSeeCrews?ppeCrewLabel((crews.data as PpeCrew[]).find(c=>c.id===p.crew_id)):"Crew not available",sizes:Object.fromEntries((definitions.data as PpeType[]).map(t=>[t.id,t.source_field?p[t.source_field as "shirt_size"|"jacket_size"|"glove_size"|"pants_size"]:requirements.find(r=>r.employee_id===p.id&&r.ppe_type_id===t.id)?.size_value||null]))})),more:people.data.length===50},{headers:{"Cache-Control":"private, no-store"}});
}catch(error){return inventoryError(error);}}
