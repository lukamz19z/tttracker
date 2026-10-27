"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {PpeRegisterScreen} from "./ppe-register-screen";
import {useAccess} from "@/components/access/access-provider";
import {ppeRequest} from "./ppe-client";
import {emptyPpeFilters,ppeCsv,type PpeFilters,type PpeReport,type PpeLine} from "@/lib/people/ppe";


export function PpeRegister({employeeId="",refreshKey="",onChanged}:{employeeId?:string;refreshKey?:string;onChanged?:()=>void|Promise<void>}){
 const {can,loading:accessLoading}=useAccess();
 const allowed=can("tt.people")&&can("people.view_ppe")&&can("people.view_basic");
 const [filters,setFilters]=useState<PpeFilters>({...emptyPpeFilters,employee:employeeId,active:employeeId?"all":"active"});
 const [tab,setTab]=useState("Overview"),[report,setReport]=useState<PpeReport|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[limit,setLimit]=useState(100);
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
   setTab("People");setLimit(100);
  }}
  editor={edit?{
   line:edit,definition,canEdit:Boolean(report?.canEdit&&can("people.edit")),saving,
   size,setSize,error,save:()=>void saveSize(),close:()=>setEdit(null),
  }:null}
 />;
}