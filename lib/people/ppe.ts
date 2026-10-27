export type PpeType={id:string;name:string;source_field:string|null;active:boolean;requires_size:boolean;size_options:string[];sort_order:number;updated_at:string};
export type PpeCrew={id:string;crew_number:string|null;crew_name:string|null};
export type PpeRow={employee_id:string;full_name:string;payroll_id:string|null;crew_id:string|null;active:boolean|null;ppe_type_id:string;size_value:string|null};
export type PpeLine=PpeRow&{item_name:string;crew_label:string;missing:string[];status:string;size_label:string;details_complete:boolean};
export type PpeFilters={search:string;crew:string;active:string;type:string;size:string;details:string;employee:string};
export type PpeSummary={key:string;ppe_type_id:string;item_name:string;size:string;people:number};
export type PpeReport={definitions:PpeType[];crews:PpeCrew[];lines:PpeLine[];summary:PpeSummary[];generatedAt:string;canEdit:boolean;canSeeCrews:boolean;metrics:{active:number;complete:number;missing:number;types:number}};
export const emptyPpeFilters:PpeFilters={search:"",crew:"all",active:"active",type:"all",size:"",details:"all",employee:""};
export const sizeKey=(value:string|null)=>String(value??"").trim().toLocaleUpperCase();
export function ppeCrewLabel(crew?:PpeCrew){return crew?[crew.crew_number?`Crew ${crew.crew_number}`:"",crew.crew_name].filter(Boolean).join(" · ") || "Unassigned":"Unassigned";}
export function ppeLines(rows:PpeRow[],types:PpeType[],crews:PpeCrew[]):PpeLine[]{
 const definitions=new Map(types.map(row=>[row.id,row])),crewMap=new Map(crews.map(row=>[row.id,row]));
 const lines=[...new Map(rows.map(row=>[`${row.employee_id}:${row.ppe_type_id}`,row])).values()].flatMap(row=>{
  const type=definitions.get(row.ppe_type_id);if(!type?.active)return [];
  const size=String(row.size_value??"").trim();
  const missing:string[]=[];
  if(type.requires_size && !size)missing.push(`${type.name}: size not recorded`);
  return [{...row,size_value:size||null,item_name:type.name,crew_label:ppeCrewLabel(crewMap.get(row.crew_id || "")),missing,
   size_label:size || (type.requires_size?"Not recorded":"No size required"),
   status:missing.length?"Missing information":"Recorded"}];
 });
 const incomplete=new Set(lines.filter(row=>row.missing.length).map(row=>row.employee_id));
 return lines.map(row=>({...row,details_complete:!incomplete.has(row.employee_id)}));
}
export function filterPpeLines(lines:PpeLine[],filters:PpeFilters){
 const search=filters.search.trim().toLocaleLowerCase();
 return lines.filter(row=>(!filters.employee || row.employee_id===filters.employee) &&
 (filters.active==="all" || (filters.active==="active"?row.active!==false:row.active===false)) &&
 (filters.crew==="all" || (filters.crew==="unassigned"?!row.crew_id:row.crew_id===filters.crew)) &&
 (filters.type==="all" || row.ppe_type_id===filters.type) && (!filters.size || (filters.size==="__missing__"?!row.size_value:sizeKey(row.size_value)===sizeKey(filters.size))) &&
 (filters.details==="all" || (filters.details==="missing"?!row.details_complete:row.details_complete)) &&
 (!search || `${row.full_name} ${row.payroll_id??""} ${row.crew_label} ${row.item_name} ${row.size_value??""}`.toLocaleLowerCase().includes(search)));
}
export function summarisePpe(lines:PpeLine[],types:PpeType[]=[]):PpeSummary[]{
 const definitions=new Map(types.map(type=>[type.id,type]));
 const groups=new Map<string,PpeSummary>();
 for(const row of lines){const key=`${row.ppe_type_id}:${sizeKey(row.size_label)}`;const group=groups.get(key)||{key,ppe_type_id:row.ppe_type_id,item_name:row.item_name,size:row.size_label,people:0};
  group.people++;groups.set(key,group);
 }return [...groups.values()].sort((a,b)=>{
  const first=definitions.get(a.ppe_type_id),second=definitions.get(b.ppe_type_id);
  if(a.ppe_type_id!==b.ppe_type_id)return (first?.sort_order??0)-(second?.sort_order??0)||a.item_name.localeCompare(b.item_name);
  const position=(size:string)=>{const index=first?.size_options.findIndex(value=>sizeKey(value)===sizeKey(size))??-1;return index<0?Number.MAX_SAFE_INTEGER:index;};
  return position(a.size)-position(b.size)||a.size.localeCompare(b.size,undefined,{numeric:true});
 });
}
export function ppeCsv(lines:PpeLine[]){
 const safe=(value:unknown)=>{let text=String(value??"");if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return '\ufeff'+[["Employee","Employee Number","Crew","PPE Item","Size","Status"],...lines.map(row=>[row.full_name,row.payroll_id,row.crew_label,row.item_name,row.size_label,row.status])].map(row=>row.map(safe).join(",")).join("\r\n");
}
