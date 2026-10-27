"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {PpeRegisterScreen} from "./ppe-register-screen";
import {useAccess} from "@/components/access/access-provider";
import {ppeRequest} from "./ppe-client";
import {emptyPpeFilters,ppeCsv,type PpeFilters,type PpeReport,type PpeLine,type PpeEvent} from "@/lib/people/ppe";


export function PpeRegister({employeeId="",refreshKey="",onChanged}:{employeeId?:string;refreshKey?:string;onChanged?:()=>void|Promise<void>}){
 const {can,loading:accessLoading}=useAccess();
 const allowed=can("tt.people")&&can("people.view_ppe")&&can("people.view_basic");
 const [filters,setFilters]=useState<PpeFilters>({...emptyPpeFilters,employee:employeeId,active:employeeId?"all":"active"});
 const [tab,setTab]=useState("Overview"),[report,setReport]=useState<PpeReport|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[limit,setLimit]=useState(100);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [historyError,setHistoryError]=useState("");
 const [issuedSize,setIssuedSize]=useState("");
 const historySequence=useRef(0);
 const [edit,setEdit]=useState<PpeLine|null>(null),[size,setSize]=useState(""),[quantity,setQuantity]=useState(""),[issueQty,setIssueQty]=useState("1"),[notes,setNotes]=useState(""),[date,setDate]=useState(""),[mutation,setMutation]=useState(""),[saving,setSaving]=useState(false),[history,setHistory]=useState<PpeEvent[]>([]);
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
 const visible=useMemo(()=>report?.lines.filter(row=>tab!=="Outstanding"||(row.outstanding_quantity??0)>0)||[],[report,tab]);
 const people=useMemo(()=>{const map=new Map<string,PpeLine[]>();for(const row of visible)map.set(row.employee_id,[...(map.get(row.employee_id)||[]),row]);return [...map.values()];},[visible]);
 const exportRows=(outstanding=false)=>{const rows=outstanding?visible.filter(row=>(row.outstanding_quantity??0)>0):visible;const url=URL.createObjectURL(new Blob([ppeCsv(rows)],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=outstanding?"outstanding-ppe.csv":"ppe-register.csv";link.click();URL.revokeObjectURL(url);};
 async function open(row:PpeLine){setError("");setHistoryError("");setHistory([]);setHistoryBusy(true);const request=++historySequence.current;setEdit(row);setIssuedSize(row.size_value||"");setSize(row.size_value||"");setQuantity(row.quantity_override==null?"":String(row.quantity_override));setIssueQty(String(Math.max(1,row.outstanding_quantity??1)));setNotes("");setMutation(crypto.randomUUID());setDate([new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,"0"),String(new Date().getDate()).padStart(2,"0")].join("-"));
  try{const data=await ppeRequest<PpeReport>(`/api/people/ppe?employee=${row.employee_id}&active=all`);if(request===historySequence.current)setHistory(data.history||[]);}catch(reason){if(request===historySequence.current){setHistory([]);setHistoryError(reason instanceof Error?reason.message:"Issue history unavailable.");}}finally{if(request===historySequence.current)setHistoryBusy(false);}}
 async function saveRequirement(){if(!edit)return;setSaving(true);try{await ppeRequest("/api/people/ppe",{method:"PATCH",body:JSON.stringify({employeeId:edit.employee_id,typeId:edit.ppe_type_id,size,quantity:quantity===""?null:Number(quantity)})});setEdit(null);await load();await onChanged?.();}catch(reason){setError(reason instanceof Error?reason.message:"Could not save PPE.");}finally{setSaving(false);}}
 async function recordIssue(original?:PpeEvent,remaining?:number){if(!edit)return;setSaving(true);try{
  // Date-only input represents the operator's local calendar date, not UTC midnight.
  const when=new Date(`${date}T00:00:00`);if(!Number.isFinite(when.getTime()))throw new Error("Select an issue date.");
  await ppeRequest("/api/people/ppe",{method:"POST",body:JSON.stringify({employeeId:edit.employee_id,typeId:edit.ppe_type_id,event:original?"returned":"issued",size:original?.size_value||issuedSize,quantity:original?remaining:Number(issueQty),date:when.toISOString(),notes,mutationId:mutation,relatedId:original?.id})});
  setEdit(null);await load();await onChanged?.();
 }catch(reason){setError(reason instanceof Error?reason.message:"Could not record issue.");}finally{setSaving(false);}}
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
   if(tab!=="Outstanding")setTab("People");setLimit(100);
  }}
  editor={edit?{
   line:edit,definition,canEdit:Boolean(report?.canEdit&&can("people.edit")),saving,
   size,issuedSize,quantity,issueQty,date,notes,setSize,setIssuedSize,setQuantity,setIssueQty,setDate,setNotes,
   history,historyBusy,historyError,error,save:()=>void saveRequirement(),
   record:(original,remaining)=>void recordIssue(original,remaining),close:()=>setEdit(null),
  }:null}
 />;
}