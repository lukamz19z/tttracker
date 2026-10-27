export type PpeType={id:string;name:string;source_field:string|null;active:boolean;required:boolean;requires_size:boolean;size_options:string[];quantity_required:number;issue_tracking:boolean;sort_order:number;updated_at:string};
export type PpeCrew={id:string;crew_number:string|null;crew_name:string|null};
export type PpeRow={employee_id:string;full_name:string;payroll_id:string|null;crew_id:string|null;active:boolean|null;ppe_type_id:string;size_value:string|null;required_quantity:number;quantity_override:number|null;issued_quantity:number;last_issued_at:string|null};
export type PpeLine=PpeRow&{item_name:string;crew_label:string;outstanding_quantity:number|null;missing:string[];status:string;size_label:string};
export type PpeFilters={search:string;crew:string;active:string;type:string;size:string;missing:boolean;outstanding:boolean;issued:string;employee:string};
export type PpeSummary={key:string;ppe_type_id:string;item_name:string;size:string;people:number;required:number;issued:number;outstanding:number|null};
export type PpeEvent={id:string;employee_id:string;ppe_type_id:string;event_type:"issued"|"returned";size_value:string|null;quantity:number;related_issue_id:string|null;issued_at:string;notes:string|null};
export type PpeReport={definitions:PpeType[];crews:PpeCrew[];lines:PpeLine[];summary:PpeSummary[];generatedAt:string;canEdit:boolean;canSeeCrews:boolean;history?:PpeEvent[]};
export const emptyPpeFilters:PpeFilters={search:"",crew:"all",active:"active",type:"all",size:"",missing:false,outstanding:false,issued:"all",employee:""};
export const sizeKey=(value:string|null)=>String(value??"").trim().toLocaleUpperCase();
export function ppeCrewLabel(crew?:PpeCrew){return crew?[crew.crew_number?`Crew ${crew.crew_number}`:"",crew.crew_name].filter(Boolean).join(" · ") || "Unassigned":"Unassigned";}
export function ppeLines(rows:PpeRow[],types:PpeType[],crews:PpeCrew[]):PpeLine[]{
 const definitions=new Map(types.map(row=>[row.id,row])),crewMap=new Map(crews.map(row=>[row.id,row]));
 return [...new Map(rows.map(row=>[`${row.employee_id}:${row.ppe_type_id}`,row])).values()].flatMap(row=>{
  const type=definitions.get(row.ppe_type_id);if(!type?.active)return [];
  const size=String(row.size_value??"").trim();
  const missing:string[]=[];
  if(row.required_quantity>0 && type.requires_size && !size)missing.push(`${type.name}: size not recorded`);
  if(row.required_quantity>0 && type.requires_size && size && type.size_options.length && !type.size_options.some(option=>sizeKey(option)===sizeKey(size)))missing.push(`${type.name}: size is outside configured options`);
  const outstanding=type.issue_tracking?Math.max(0,row.required_quantity-row.issued_quantity):null;
  if(outstanding)missing.push(`${type.name}: ${outstanding} outstanding${row.issued_quantity?"":" (no matching issue recorded)"}`);
  return [{...row,item_name:type.name,crew_label:ppeCrewLabel(crewMap.get(row.crew_id || "")),outstanding_quantity:outstanding,missing,
   size_label:type.requires_size?(size || "Not recorded"):"No size required",
   status:outstanding?"Outstanding":!type.issue_tracking?"Issue tracking off":row.issued_quantity?"Issued":row.required_quantity?"Required":"Optional"}];
 });
}
export function filterPpeLines(lines:PpeLine[],filters:PpeFilters){
 const search=filters.search.trim().toLocaleLowerCase();
 return lines.filter(row=>(!filters.employee || row.employee_id===filters.employee) &&
 (filters.active==="all" || (filters.active==="active"?row.active!==false:row.active===false)) &&
 (filters.crew==="all" || (filters.crew==="unassigned"?!row.crew_id:row.crew_id===filters.crew)) &&
 (filters.type==="all" || row.ppe_type_id===filters.type) && (!filters.size || (filters.size==="__missing__"?!row.size_value:sizeKey(row.size_value)===sizeKey(filters.size))) &&
 (!filters.missing || row.missing.length>0) && (!filters.outstanding || (row.outstanding_quantity??0)>0) &&
 (filters.issued==="all" || (filters.issued==="issued"?row.issued_quantity>0:row.issued_quantity===0)) &&
 (!search || `${row.full_name} ${row.payroll_id??""} ${row.crew_label}`.toLocaleLowerCase().includes(search)));
}
export function summarisePpe(lines:PpeLine[],types:PpeType[]=[]):PpeSummary[]{
 const definitions=new Map(types.map(type=>[type.id,type]));
 const groups=new Map<string,PpeSummary>();
 for(const row of lines){const key=`${row.ppe_type_id}:${sizeKey(row.size_label)}`;const group=groups.get(key)||{key,ppe_type_id:row.ppe_type_id,item_name:row.item_name,size:row.size_label,people:0,required:0,issued:0,outstanding:row.outstanding_quantity===null?null:0};
  group.people++;group.required+=row.required_quantity;group.issued+=row.issued_quantity;
  if(group.outstanding!==null)group.outstanding+=row.outstanding_quantity??0;groups.set(key,group);
 }return [...groups.values()].sort((a,b)=>{
  const first=definitions.get(a.ppe_type_id),second=definitions.get(b.ppe_type_id);
  if(a.ppe_type_id!==b.ppe_type_id)return (first?.sort_order??0)-(second?.sort_order??0)||a.item_name.localeCompare(b.item_name);
  const position=(size:string)=>{const index=first?.size_options.findIndex(value=>sizeKey(value)===sizeKey(size))??-1;return index<0?Number.MAX_SAFE_INTEGER:index;};
  return position(a.size)-position(b.size)||a.size.localeCompare(b.size,undefined,{numeric:true});
 });
}
export function ppeCsv(lines:PpeLine[]){
 const safe=(value:unknown)=>{let text=String(value??"");if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return '\ufeff'+[["Employee","Employee Number","Crew","Employment Status","PPE Item","Size","Required Qty","Issued Qty","Outstanding Qty","Status","Missing"],...lines.map(row=>[row.full_name,row.payroll_id,row.crew_label,row.active===false?"Inactive":"Active",row.item_name,row.size_label,row.required_quantity,row.issued_quantity,row.outstanding_quantity??"Not tracked",row.status,row.missing.join("; ")])].map(row=>row.map(safe).join(",")).join("\r\n");
}
