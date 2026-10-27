import {NextRequest,NextResponse} from "next/server";
import {ppeAccess,ppeError,invalidPpe,uuidPattern,ppeBody} from "@/lib/people/ppe-server";
import {emptyPpeFilters,filterPpeLines,ppeLines,summarisePpe,type PpeRow,type PpeType,type PpeCrew,type PpeEvent} from "@/lib/people/ppe";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{
 const {service,canEdit,canSeeCrews}=await ppeAccess(request);
 const q=request.nextUrl.searchParams;
 const filters={...emptyPpeFilters,...Object.fromEntries(["search","crew","active","type","size","issued","employee"].map(key=>[key,q.get(key)??emptyPpeFilters[key as keyof typeof emptyPpeFilters]])),missing:q.get("missing")==="true",outstanding:q.get("outstanding")==="true"};
 if(!["active","inactive","all"].includes(filters.active)||!["all","issued","not-issued"].includes(filters.issued)||filters.search.length>300||filters.size.length>120)invalidPpe("Check the PPE filters.");
 if(!canSeeCrews && filters.crew!=="all")invalidPpe("Crew access is required to filter by crew.");
 // Page the register view so PostgREST's row cap cannot silently truncate counts.
 async function loadRows(){const rows:PpeRow[]=[];for(let start=0;;start+=1000){
  let query=service.from("v1_people_ppe_register").select("employee_id,full_name,payroll_id,crew_id,active,ppe_type_id,size_value,required_quantity,quantity_override,issued_quantity,last_issued_at").order("employee_id").order("ppe_type_id").range(start,start+999);
  if(filters.active==="active")query=query.or("active.is.null,active.eq.true");else if(filters.active==="inactive")query=query.eq("active",false);
  if(filters.employee){if(!uuidPattern.test(filters.employee))invalidPpe("Select a valid employee.");query=query.eq("employee_id",filters.employee);}
  if(filters.crew!=="all"){if(filters.crew==="unassigned")query=query.is("crew_id",null);else {if(!uuidPattern.test(filters.crew))invalidPpe("Select a valid crew.");query=query.eq("crew_id",filters.crew);}}
  if(filters.type!=="all"){if(!uuidPattern.test(filters.type))invalidPpe("Select a valid PPE item.");query=query.eq("ppe_type_id",filters.type);}
  const result=await query;if(result.error)throw new Error(result.error.message);rows.push(...(result.data as PpeRow[]));if((result.data?.length??0)<1000)return rows;
 }}
 const [rows,defs,crewResult]=await Promise.all([loadRows(),service.from("people_ppe_types").select("id,name,source_field,active,required,requires_size,size_options,quantity_required,issue_tracking,sort_order,updated_at").order("sort_order").order("name"),canSeeCrews?service.from("crews").select("id,crew_number,crew_name").order("crew_number") : Promise.resolve({data:[],error:null})]);
 if(defs.error||crewResult.error)throw new Error(defs.error?.message||crewResult.error?.message);
 const definitions=defs.data as PpeType[],crews=crewResult.data as PpeCrew[];
 const operationalRows=canSeeCrews?rows:rows.map(row=>({...row,crew_id:null}));
 const rawLines=ppeLines(operationalRows,definitions,crews);
 const lines=filterPpeLines(canSeeCrews?rawLines:rawLines.map(row=>({...row,crew_label:"Crew not available"})),filters);
 let history:PpeEvent[]|undefined;
 if(filters.employee){const result=await service.from("people_ppe_issue_events").select("id,employee_id,ppe_type_id,event_type,size_value,quantity,related_issue_id,issued_at,notes").eq("employee_id",filters.employee).order("issued_at",{ascending:false}).limit(500);if(result.error)throw new Error(result.error.message);history=result.data as PpeEvent[];}
 return NextResponse.json({definitions,crews,lines,summary:summarisePpe(lines,definitions),canEdit,canSeeCrews,history,generatedAt:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
}catch(error){return ppeError(error);}}

export async function PATCH(request:NextRequest){try{
 const {service,user}=await ppeAccess(request,true);
 const body=await ppeBody(request);
 if(!uuidPattern.test(String(body.employeeId))||!uuidPattern.test(String(body.typeId)))invalidPpe("Select an employee and PPE item.");
 if(body.quantity!==null && (!Number.isInteger(body.quantity)||body.quantity<0||body.quantity>1000))invalidPpe("Quantity must be between 0 and 1000, or blank for default.");
 if(typeof body.size!=="string"||body.size.length>120)invalidPpe("Size must be text of at most 120 characters.");
 const result=await service.rpc("v1_ppe_save_requirement",{p_employee:body.employeeId,p_type:body.typeId,p_size:body.size,p_quantity:body.quantity,p_actor:user.id});
 if(result.error){if(["22023","P0002"].includes(result.error.code))invalidPpe(result.error.message);throw new Error(result.error.message);}
 return NextResponse.json({success:true});
}catch(error){return ppeError(error);}}

export async function POST(request:NextRequest){try{
 const {service,user}=await ppeAccess(request,true);const body=await ppeBody(request);
 if(!uuidPattern.test(String(body.employeeId))||!uuidPattern.test(String(body.typeId))||!uuidPattern.test(String(body.mutationId)))invalidPpe("Select an employee and PPE item, and retry this issue.");
 if(!["issued","returned"].includes(body.event)||!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>1000)invalidPpe("Enter a valid issue/return quantity (1–1000).");
 if(body.event==="returned"&&!uuidPattern.test(String(body.relatedId)))invalidPpe("Select the original issue to return.");
 const date=new Date(body.date);if(!Number.isFinite(date.getTime())||date.getTime()>Date.now())invalidPpe("Issue date must be valid and not in the future.");
 if(typeof body.size!=="string"||body.size.length>120||typeof body.notes!=="string"||body.notes.length>4000)invalidPpe("Check the size and notes.");
 const result=await service.rpc("v1_ppe_record_event",{p_employee:body.employeeId,p_type:body.typeId,p_event:body.event,p_size:body.size,p_quantity:body.quantity,p_date:date.toISOString(),p_related:body.event==="returned"?body.relatedId:null,p_notes:body.notes,p_mutation:body.mutationId,p_actor:user.id});
 if(result.error){if(["22023","23514","P0002"].includes(result.error.code))invalidPpe(result.error.message);throw new Error(result.error.message);}
 return NextResponse.json({success:true});
}catch(error){return ppeError(error);}}
