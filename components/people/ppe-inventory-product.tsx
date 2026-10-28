"use client";
import {useState} from "react";
import {InventoryDialog} from "./ppe-inventory-dialog";
import {ppeInput,ppePrimary} from "./ppe-register-views";
import {ppeRequest} from "./ppe-client";
import type {InventoryData,InventoryProduct} from "@/lib/people/ppe-inventory";
export function InventoryProductEditor({data,product,close,saved}:{data:InventoryData;product?:InventoryProduct;close:()=>void;saved:()=>void}){
 const current=data.sizes.filter(s=>s.product_id===product?.id&&s.active);
 const [form,setForm]=useState({name:product?.name||"",category:product?.category||"",code:product?.code||"",description:product?.description||"",notes:product?.notes||"",tracks_sizes:product?.tracks_sizes??true,ppe_type_id:product?.ppe_type_id||"",active:product?.active??true,sort_order:product?.sort_order||0});
 const [sizes,setSizes]=useState(current.length?current.map(s=>({label:s.label,minimum:s.minimum===null?"":String(s.minimum)})):[{label:"",minimum:""}]);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function save(){setBusy(true);setError("");try{
  await ppeRequest("/api/people/ppe/inventory",{method:"POST",body:JSON.stringify({...form,id:product?.id,updated_at:product?.updated_at,ppe_type_id:form.ppe_type_id||null,sizes:(form.tracks_sizes?sizes:[{label:"",minimum:sizes[0]?.minimum||""}]).map(s=>({...s,minimum:s.minimum===""?null:Number(s.minimum)}))})});saved();
 }catch(e){setError(e instanceof Error?e.message:"Could not save product.");}finally{setBusy(false);}}
 return <InventoryDialog title={product?"Edit Inventory Item":"New Inventory Item"} close={close} busy={busy}><form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-3">
 {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
 <div className="grid gap-3 sm:grid-cols-2">{(["name","category","code","description","notes"] as const).map(key=><label className="space-y-1 text-xs font-bold" key={key}>{({name:"Product Name",category:"Category",code:"Optional Code / SKU",description:"Description",notes:"Notes"})[key]}<input required={key==="name"} maxLength={key==="name"?120:2000} className={ppeInput} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
 <label className="space-y-1 text-xs font-bold">Optional PPE Size Mapping<select className={ppeInput} value={form.ppe_type_id} onChange={e=>setForm({...form,ppe_type_id:e.target.value})}><option value="">No employee size mapping</option>{data.definitions.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label className="space-y-1 text-xs font-bold">Sort Order<input type="number" step="1" className={ppeInput} value={form.sort_order} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}/></label>
 <div className="flex items-center gap-4 text-sm"><label><input type="checkbox" checked={form.tracks_sizes} onChange={e=>setForm({...form,tracks_sizes:e.target.checked})}/> Tracks Sizes</label><label><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Active</label></div></div>
 <p className="text-xs text-slate-500">Removed sizes are archived. Existing stock and history remain visible. Size tracking cannot change after movements exist.</p>
 <div className="space-y-2">{(form.tracks_sizes?sizes:[sizes[0]]).map((s,i)=><div key={i} className="flex gap-2"><label className="flex-1 text-xs">{form.tracks_sizes?"Size":"No size"}<input className={ppeInput} required={form.tracks_sizes} disabled={!form.tracks_sizes} value={form.tracks_sizes?s.label:"No size"} onChange={e=>setSizes(sizes.map((v,j)=>i===j?{...v,label:e.target.value}:v))}/></label><label className="w-32 text-xs">Low Stock Minimum<input className={ppeInput} type="number" min="0" step="1" value={s?.minimum||""} onChange={e=>setSizes(sizes.map((v,j)=>i===j?{...v,minimum:e.target.value}:v))}/></label>{form.tracks_sizes&&sizes.length>1&&<button type="button" className="text-xs font-bold text-rose-700" onClick={()=>setSizes(sizes.filter((_,j)=>i!==j))}>Remove</button>}</div>)}</div>
 {form.tracks_sizes&&<button type="button" className="text-sm font-bold text-blue-700" onClick={()=>setSizes([...sizes,{label:"",minimum:""}])}>+ Add Size</button>}
 <footer className="flex justify-end"><button className={ppePrimary} disabled={busy}>{busy?"Saving...":"Save Product"}</button></footer></form></InventoryDialog>;
}
