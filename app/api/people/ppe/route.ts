import {NextRequest,NextResponse} from "next/server";
import {ppeAccess,ppeError,invalidPpe,uuidPattern,ppeBody} from "@/lib/people/ppe-server";
import {emptyPpeFilters,filterPpeLines,ppeLines,summarisePpe,sizeKey,type PpeRow,type PpeType,type PpeCrew} from "@/lib/people/ppe";
export const dynamic="force-dynamic";
const typeColumns="id,name,source_field,active,requires_size,size_options,sort_order,updated_at";
const sizeFields=["shirt_size","jacket_size","glove_size","pants_size"];
export async function GET(request:NextRequest){try{
 const {service,canEdit,canSeeCrews}=await ppeAccess(request);
 const q=request.nextUrl.searchParams;
 const filters={...emptyPpeFilters,...Object.fromEntries(Object.keys(emptyPpeFilters).map(key=>[key,q.get(key)??emptyPpeFilters[key as keyof typeof emptyPpeFilters]]))};
 if(!["active","inactive","all"].includes(filters.active)||!["all","complete","missing"].includes(filters.details)||filters.search.length>300||filters.size.length>120)invalidPpe("Check the PPE filters.");
 for(const key of ["employee","type","crew"] as const){const value=filters[key];if(value&&value!=="all"&&value!=="unassigned"&&!uuidPattern.test(value))invalidPpe("Select valid PPE filters.");}
 if(!canSeeCrews&&filters.crew!=="all")invalidPpe("Crew access is required to filter by crew.");
 type Employee={id:string;full_name:string;payroll_id:string|null;crew_id:string|null;active:boolean|null;shirt_size:string|null;jacket_size:string|null;glove_size:string|null;pants_size:string|null};
 async function loadEmployees(){const rows:Employee[]=[];for(let start=0;;start+=1000){
  let query=service.from("employees").select("id,full_name,payroll_id,crew_id,active,shirt_size,jacket_size,glove_size,pants_size").order("id").range(start,start+999);
  if(filters.active==="active")query=query.or("active.is.null,active.eq.true");else if(filters.active==="inactive")query=query.eq("active",false);
  if(filters.employee)query=query.eq("id",filters.employee);
  if(filters.crew!=="all")query=filters.crew==="unassigned"?query.is("crew_id",null):query.eq("crew_id",filters.crew);
  const result=await query;if(result.error)throw new Error(result.error.message);rows.push(...result.data);if(result.data.length<1000)return rows;
 }}
 async function loadSizes(){const rows:{employee_id:string;ppe_type_id:string;size_value:string|null}[]=[];for(let start=0;;start+=1000){
  let query=service.from("people_ppe_requirements").select("employee_id,ppe_type_id,size_value").order("employee_id").order("ppe_type_id").range(start,start+999);
  if(filters.employee)query=query.eq("employee_id",filters.employee);
  const result=await query;if(result.error)throw new Error(result.error.message);rows.push(...result.data);if(result.data.length<1000)return rows;
 }}
 const [employees,sizes,defs,crewResult]=await Promise.all([loadEmployees(),loadSizes(),service.from("people_ppe_types").select(typeColumns).order("sort_order").order("name"),canSeeCrews?service.from("crews").select("id,crew_number,crew_name").order("crew_number"):Promise.resolve({data:[],error:null})]);
 if(defs.error||crewResult.error)throw new Error(defs.error?.message||crewResult.error?.message);
 const definitions=defs.data as PpeType[],crews=crewResult.data as PpeCrew[];
 const values=new Map(sizes.map(row=>[`${row.employee_id}:${row.ppe_type_id}`,row.size_value]));
 const rows:PpeRow[]=employees.flatMap(person=>definitions.filter(type=>type.active).map(type=>({employee_id:person.id,full_name:person.full_name,payroll_id:person.payroll_id,crew_id:canSeeCrews?person.crew_id:null,active:person.active,ppe_type_id:type.id,size_value:type.source_field?person[type.source_field as keyof Pick<Employee,"shirt_size"|"jacket_size"|"glove_size"|"pants_size">]:values.get(`${person.id}:${type.id}`)??null})));
 const raw=ppeLines(rows,definitions,crews);
 const lines=filterPpeLines(canSeeCrews?raw:raw.map(row=>({...row,crew_label:"Crew not available"})),filters);
 const matched=new Set(lines.map(row=>row.employee_id));
 const incomplete=new Set(raw.filter(row=>row.missing.length).map(row=>row.employee_id));
 const scoped=employees.filter(row=>matched.has(row.id)||(!definitions.some(type=>type.active)&&!filters.search&&filters.type==="all"&&!filters.size&&filters.details!=="missing"));
 const metrics={active:scoped.filter(row=>row.active!==false).length,complete:scoped.filter(row=>!incomplete.has(row.id)).length,missing:scoped.filter(row=>incomplete.has(row.id)).length,types:definitions.filter(type=>type.active).length};
 return NextResponse.json({definitions,crews,lines,metrics,summary:summarisePpe(lines,definitions),canEdit,canSeeCrews,generatedAt:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
}catch(error){return ppeError(error);}}

export async function PATCH(request:NextRequest){try{
 const {service,user}=await ppeAccess(request,true);const body=await ppeBody(request);
 if(!uuidPattern.test(String(body.employeeId))||!uuidPattern.test(String(body.typeId)))invalidPpe("Select an employee and PPE item.");
 if(typeof body.size!=="string"||body.size.length>120)invalidPpe("Size must be text of at most 120 characters.");
 const definition=await service.from("people_ppe_types").select(typeColumns).eq("id",body.typeId).maybeSingle();
 if(definition.error)throw new Error(definition.error.message);if(!definition.data?.active)invalidPpe("This PPE item is no longer active. Refresh the register.");
 const type=definition.data as PpeType;
 if(type.source_field&&!sizeFields.includes(type.source_field))throw new Error("Invalid PPE source mapping.");
 const person=await service.from("employees").select("id,shirt_size,jacket_size,glove_size,pants_size").eq("id",body.employeeId).maybeSingle();
 if(person.error)throw new Error(person.error.message);if(!person.data)invalidPpe("Employee not found.");
 const requirement=await service.from("people_ppe_requirements").select("size_value").eq("employee_id",body.employeeId).eq("ppe_type_id",body.typeId).maybeSingle();
 if(requirement.error)throw new Error(requirement.error.message);
 const current=type.source_field?person.data[type.source_field as "shirt_size"|"jacket_size"|"glove_size"|"pants_size"]:requirement.data?.size_value;
 const size=body.size.trim()||null;
 if(size&&type.requires_size&&type.size_options.length&&!type.size_options.some(option=>sizeKey(option)===sizeKey(size))&&size!==current)invalidPpe("Choose a configured size.");
 // Change only canonical sizing. Historical quantities and issue events stay untouched.
 if(type.source_field){const result=await service.from("employees").update({[type.source_field]:size}).eq("id",body.employeeId);if(result.error)throw new Error(result.error.message);}
 else {
  const data={size_value:size,updated_by:user.id,updated_at:new Date().toISOString()};
  const update=()=>service.from("people_ppe_requirements").update(data).eq("employee_id",body.employeeId).eq("ppe_type_id",body.typeId).select("employee_id");
  const result=await update();if(result.error)throw new Error(result.error.message);
  if(!result.data.length){const insert=await service.from("people_ppe_requirements").insert({...data,employee_id:body.employeeId,ppe_type_id:body.typeId});if(insert.error){if(insert.error.code!=="23505")throw new Error(insert.error.message);const retry=await update();if(retry.error)throw new Error(retry.error.message);}}
 }
 return NextResponse.json({success:true});
}catch(error){return ppeError(error);}}

// Old clients cannot accidentally write issue history through the sizing register.
export async function POST(request:NextRequest){try{await ppeAccess(request,true);return NextResponse.json({error:"This register supports employee sizing only."},{status:409});}catch(error){return ppeError(error);}}
