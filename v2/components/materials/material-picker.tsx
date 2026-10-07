"use client";
import { useEffect, useRef, useState } from "react";
import { MaterialsSearch } from "./workflow-controls";
import type { MaterialBundle, MaterialItem } from "@/lib/materials/types";
import styles from "./materials-ui.module.css";

type Selection=MaterialItem|MaterialBundle;
export function MaterialPicker({projectId,organisationId,towerId,onSelect}:{projectId:string;organisationId:string;towerId:string;onSelect:(material:Selection)=>void}) {
 const requestRef=useRef<AbortController|null>(null);
 const [nextOffsets,setNextOffsets]=useState<Record<string,number|null>>({});
 const [query,setQuery]=useState("");const [rows,setRows]=useState<Selection[]>([]);const [page,setPage]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 useEffect(()=>{
  if(!query.trim()){setRows([]);setBusy(false);setError("");setNextOffsets({});return;}
  const controller=new AbortController();requestRef.current=controller;const timer=setTimeout(async()=>{
   setBusy(true);setError("");
   try {
    const results=await Promise.all(["members","bundles","fasteners"].map(async mode=>{
     const params=new URLSearchParams({organisation:organisationId,mode,q:query,towerId});
     const response=await fetch(`/api/projects/${projectId}/materials/search?${params}`,{signal:controller.signal});
     const payload: {items?:MaterialItem[];bundles?:MaterialBundle[];error?:string;nextOffset?:number|null}=await response.json();
     if(!response.ok)throw new Error(payload.error??"Material search failed.");
     return {mode,rows:[...(payload.items??[]),...(payload.bundles??[])],nextOffset:payload.nextOffset??null};
    }));
    if(!controller.signal.aborted){setRows(results.flatMap(result=>result.rows));setNextOffsets(Object.fromEntries(results.map(result=>[result.mode,result.nextOffset])));setPage(0);}
   } catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Material search failed.");}
   finally {if(!controller.signal.aborted)setBusy(false);}
  },250);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[projectId,organisationId,towerId,query]);
 async function loadMore(){
  const controller=requestRef.current;if(!controller||controller.signal.aborted)return;
  setBusy(true);setError("");
  try {
   const pages=await Promise.all(Object.entries(nextOffsets).filter(([,offset])=>offset!==null).map(async([mode,offset])=>{
    const params=new URLSearchParams({organisation:organisationId,mode,q:query,towerId,offset:String(offset)});
    const response=await fetch(`/api/projects/${projectId}/materials/search?${params}`,{signal:controller.signal});
    const payload:{items?:MaterialItem[];bundles?:MaterialBundle[];nextOffset?:number|null;error?:string}=await response.json();
    if(!response.ok)throw new Error(payload.error??"Material search failed.");
    return {mode,rows:[...(payload.items??[]),...(payload.bundles??[])],nextOffset:payload.nextOffset??null};
   }));
   if(!controller.signal.aborted){setRows(previous=>[...previous,...pages.flatMap(result=>result.rows)]);setNextOffsets(previous=>({...previous,...Object.fromEntries(pages.map(result=>[result.mode,result.nextOffset]))}));}
  }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Material search failed.");}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <div><div className="tt-label">Material</div><MaterialsSearch value={query} onChange={event=>setQuery(event.target.value)} onClear={()=>setQuery("")} placeholder="Search member, bundle, bolt or packer..." />{error?<p role="alert">{error}</p>:null}{busy?<small>Searching...</small>:null}
 {rows.length?<div className={styles.choices}>{rows.slice(page*10,page*10+10).map(row=>{const item="material_kind" in row;return <button type="button" className={styles.choice} key={row.id} onClick={()=>{onSelect(row);setQuery("");setRows([]);}}><small>{item?row.material_kind.toUpperCase():"BUNDLE"}</small> <strong>{item?row.item_reference:row.bundle_reference}</strong><div>{item?`Bundle ${row.bundle_reference??"unassigned"} / Drawing ${row.drawing_reference??"not supplied"} / ${row.profile??[row.diameter,row.length,row.packer_mark].filter(Boolean).join(" / ")}`:[row.package_context,row.segment].filter(Boolean).join(" / ")}</div></button>;})}{rows.length>10?<div style={{display:"flex",gap:8,padding:8}}><button type="button" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><span>{page*10+1}-{Math.min(page*10+10,rows.length)} of {rows.length} loaded</span><button type="button" disabled={(page+1)*10>=rows.length} onClick={()=>setPage(page+1)}>Next</button></div>:null}{Object.values(nextOffsets).some(offset=>offset!==null)?<button type="button" className={styles.choice} disabled={busy} onClick={()=>void loadMore()}>Load more results</button>:null}</div>:query&&!busy&&!error?<small>No matching material. Refine the search.</small>:null}</div>;
}
