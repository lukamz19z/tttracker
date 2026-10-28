"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {PpeInventory} from "./ppe-inventory";
import {PpeRegisterScreen} from "./ppe-register-screen";
import {useAccess} from "@/components/access/access-provider";
import {ppeRequest} from "./ppe-client";
import {emptyPpeFilters,ppeCsv,type PpeFilters,type PpeReport,type PpeLine} from "@/lib/people/ppe";


type SizingScope={type:string;size:string};
type RegisterProps={employeeId?:string;refreshKey?:string;onChanged?:()=>void|Promise<void>};
export function PpeRegister(props:RegisterProps){
 const {can}=useAccess();const [tab,setTab]=useState("Overview"),[scope,setScope]=useState<SizingScope|null>(null);
 const inventory=can("tt.people")&&can("people.view_basic")&&can("people.view_ppe")&&can("people.ppe_inventory.view");
 return <div className="space-y-3"><div className="ppe-no-print rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><h2 className="text-xl font-black">PPE Register</h2><p className="mt-1 text-xs text-slate-500">Employee sizing and requirements · physical stock and issues</p><nav aria-label="PPE Register views" className="mt-3 flex flex-wrap gap-1">{["Overview","People & Sizes",...(inventory?["Inventory","Issue History"]:[])].map(value=><button type="button" aria-current={tab===value?"page":undefined} key={value} onClick={()=>{setScope(null);setTab(value);}} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab===value?"bg-slate-900 text-white":"bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{props.employeeId&&value==="Issue History"?"Issued Items":value}</button>)}</nav></div>
 {(tab==="Overview"||tab==="People & Sizes")&&<PpeSizingRegister key={tab} {...props} view={tab==="Overview"?"Overview":"People"} initialScope={scope} onDrill={value=>{setScope(value);setTab("People & Sizes");}}/>}
 {inventory&&(tab==="Overview"||tab==="Inventory"||tab==="Issue History")&&<PpeInventory key={tab} view={tab} employeeId={props.employeeId}/>}
 </div>;
}
function PpeSizingRegister({employeeId="",refreshKey="",onChanged,view="Overview",initialScope,onDrill}:RegisterProps&{view?:string;initialScope?:SizingScope|null;onDrill?:(scope:SizingScope)=>void}){
 const {can,loading:accessLoading}=useAccess();
 const allowed=can("tt.people")&&can("people.view_ppe")&&can("people.view_basic");
 const [filters,setFilters]=useState<PpeFilters>({...emptyPpeFilters,employee:employeeId,active:employeeId?"all":"active",...initialScope});
 const [tab,setTab]=useState(view),[report,setReport]=useState<PpeReport|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[limit,setLimit]=useState(100);
 const [edit,setEdit]=useState<PpeLine|null>(null),[size,setSize]=useState(""),[saving,setSaving]=useState(false);
 const params=useMemo(()=>new URLSearchParams(Object.entries(filters).map(([key,value])=>[key,String(value)])),[filters]);
 const load=useCallback(async(signal?:AbortSignal)=>{
  if(!allowed)return;setBusy(true);
  try{const data=await ppeRequest<PpeReport>(`/api/people/ppe?${params}`,{signal});if(!signal?.aborted){setReport(data);setError("");}}
  catch(reason){if(!signal?.aborted)setError(reason instanceof Error?reason.message:"Could not load PPE.");}
  finally{if(!signal?.aborted)setBusy(false);}
 },[allowed,params]);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),200);return()=>{clearTimeout(timer);controller.abort();};},[load,refreshKey]);
 useEffect(()=>{const refresh=()=>void load();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[load]);
 const change=(key:keyof PpeFilters,value:string|boolean)=>{setFilters(current=>({...current,[key]:value}));setLimit(100);};
 const visible=useMemo(()=>report?.lines||[],[report]);
 const people=useMemo(()=>{const map=new Map<string,PpeLine[]>();for(const row of visible)map.set(row.employee_id,[...(map.get(row.employee_id)||[]),row]);return [...map.values()].sort((a,b)=>a[0].full_name.localeCompare(b[0].full_name));},[visible]);
 const exportRows=()=>{const url=URL.createObjectURL(new Blob([ppeCsv(visible)],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="ppe-sizing-register.csv";link.click();URL.revokeObjectURL(url);};
 function open(row:PpeLine){setError("");setEdit(row);setSize(row.size_value||"");}
 async function saveSize(){if(!edit)return;setSaving(true);try{await ppeRequest("/api/people/ppe",{method:"PATCH",body:JSON.stringify({employeeId:edit.employee_id,typeId:edit.ppe_type_id,size})});setEdit(null);await load();await onChanged?.();}catch(reason){setError(reason instanceof Error?reason.message:"Could not save PPE.");}finally{setSaving(false);}}
 const filterDescription=Object.entries(filters).filter(([,value])=>value&&value!=="all").map(([key,value])=>{
  const label=key==="crew"?(value==="unassigned"?"Unassigned":report?.crews.find(row=>row.id===value)?.crew_name||"Selected crew"):key==="type"?report?.definitions.find(row=>row.id===value)?.name||"Selected item":key==="employee"?report?.lines.find(row=>row.employee_id===value)?.full_name||"Selected employee":value==="__missing__"?"Not recorded":String(value);
  return `${key}: ${label}`;
 }).join(" · ");
 const definition=report?.definitions.find(row=>row.id===edit?.ppe_type_id);
 return <PpeRegisterScreen
  report={report} allowed={allowed} accessLoading={accessLoading} busy={busy} error={error}
  filters={filters} change={change}
  reset={()=>{setFilters({...emptyPpeFilters,employee:employeeId,active:employeeId?"all":"active"});setLimit(100);}}
  tab={tab} setTab={value=>{setTab(value);setLimit(100);}}
  visible={visible} people={people} limit={limit} more={()=>setLimit(value=>value+100)}
  refresh={()=>void load()} exportRows={exportRows} filterDescription={filterDescription}
  onItem={row=>void open(row)}
  onSize={row=>{
   setFilters(current=>({...current,type:row.ppe_type_id,size:row.size==="Not recorded"?"__missing__":row.size==="No size required"?"":row.size}));
   onDrill?.({type:row.ppe_type_id,size:row.size==="Not recorded"?"__missing__":row.size==="No size required"?"":row.size});
   setTab("People");setLimit(100);
  }}
  editor={edit?{
   line:edit,definition,canEdit:Boolean(report?.canEdit&&can("people.edit")),saving,
   size,setSize,error,save:()=>void saveSize(),close:()=>setEdit(null),
  }:null}
 />;
}