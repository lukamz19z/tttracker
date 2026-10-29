"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { mapPunchlistRows, samePunchlistSource, punchlistFields, punchlistPhotoNames, type PunchlistRow } from "@/lib/quality/punchlist";
import { imageCaptureTime } from "@/lib/quality/photo-capture";

type Item = {id:string;revision_id:string;tower_id:string;external_reference:string;source_payload?:PunchlistRow};
type Preview = {rows:PunchlistRow[];errors:string[];candidates:{row:PunchlistRow;existing:Item|null}[];absent:Item[];revisions:{id:string;tower_id:string;revision_number:string;source_type:string;status:string}[];towers:{id:string;name:string}[]};
type Target = {revisionId:string;confirmAdditional:boolean};
const labels:Record<string,string>={tower:"Tower",externalReference:"External Defect Number",member:"Member",segment:"Segment",leg:"Leg",drawing:"Drawing",defectType:"Defect Type",description:"Description",inspectorComment:"Inspector Comment",sourceDate:"Source Date (YYYY-MM-DD)",assignedFlag:"Assigned Flag",photos:"Photo filenames (separate with ;)"};
export default function PunchlistImport({projectId,timeZone,apiFetch,onClose,onSaved}:{projectId:string;timeZone?:string|null;apiFetch:(url:string,init?:RequestInit)=>Promise<Response>;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [raw,setRaw]=useState<Record<string,unknown>[]>([]),[mapping,setMapping]=useState<Record<string,string>>({}),[filename,setFilename]=useState("");
  const [sourceKey,setSourceKey]=useState(""),[sourceRevision,setSourceRevision]=useState(""),[photos,setPhotos]=useState<File[]>([]);
  const [preview,setPreview]=useState<Preview|null>(null),[targets,setTargets]=useState<Record<string,Target>>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[batchId]=useState(()=>crypto.randomUUID()),[committed,setCommitted]=useState(false);
  const [results,setResults]=useState<{item:Item;disposition:string}[]|null>(null),[uploaded,setUploaded]=useState<string[]>([]);
  const [sheetWarning,setSheetWarning]=useState("");
  const columns=Object.keys(raw[0] || {});
  const rows=preview?.rows || mapPunchlistRows(raw,mapping);
  const matching=(row:PunchlistRow)=>photos.filter(file=>punchlistPhotoNames(row.photos).some(name=>name.toLowerCase()===file.name.toLowerCase()));
  const unmatched=photos.filter(file=>!rows.some(row=>matching(row).includes(file)));
  const duplicatePhotos=photos.filter((file,index)=>photos.findIndex(other=>other.name.toLowerCase()===file.name.toLowerCase())!==index);
  const missing=rows.flatMap(row=>punchlistPhotoNames(row.photos).filter(name=>!photos.some(file=>file.name.toLowerCase()===name.toLowerCase())).map(name=>`Row ${row.rowKey}: Photo could not be matched — ${name}`));
  async function json<T>(url:string,init:RequestInit):Promise<T>{const response=await apiFetch(url,init);const body=await response.json();if(!response.ok)throw new Error(body.error || `Quality request failed (${response.status}).`);return body;}
  async function read(file:File) {
    setBusy(true);setMessage("");setPreview(null);
    try {
      if(file.size>20*1024*1024)throw new Error("Import spreadsheets up to 20 MB. Split larger sources into batches of 500 rows.");
      let data:Record<string,unknown>[];
      if(/\.csv$/i.test(file.name)) { const parsed=Papa.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:"greedy"});if(parsed.errors.length)throw new Error(parsed.errors.map(e=>e.message).join("; "));data=parsed.data;setSheetWarning(""); }
      else {
        const book=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false,bookFiles:true});
        if(book.SheetNames.length!==1)throw new Error("Select one worksheet by saving it as a separate XLSX or CSV; sheets will not be silently skipped.");
        data=XLSX.utils.sheet_to_json<Record<string,unknown>>(book.Sheets[book.SheetNames[0]],{defval:"",raw:false});
        const keys=(book as XLSX.WorkBook & {keys?:string[]}).keys || [];
        setSheetWarning(keys.some(key=>key.startsWith("xl/media/"))?"This workbook contains embedded images. Export and attach those images separately, then map their filenames before confirming. Embedded images are not imported automatically.":"");
      }
      if(!data.length || data.length>500)throw new Error("Choose a source containing 1–500 defect rows.");
      setRaw(data);setFilename(file.name);setMapping(Object.fromEntries(punchlistFields.map(key=>[key,Object.keys(data[0]).find(column=>column.toLowerCase().replace(/[^a-z]/g,"")===key.toLowerCase()) || ""])));
    } catch(error){setMessage(error instanceof Error?error.message:"Source could not be read.");}finally{setBusy(false);}
  }
  async function validate() {
    setBusy(true);setMessage("");
    try {const value=await json<Preview>("/api/quality/punchlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,sourceKey,rows:mapPunchlistRows(raw,mapping)})});setPreview(value);
      setTargets(Object.fromEntries([...new Set(value.rows.map(row=>row.towerId).filter(Boolean))].map(id=>[id,{revisionId:value.revisions.find(rev=>rev.tower_id===id && rev.source_type==="punchlist" && ["Draft","Open","In Progress"].includes(rev.status))?.id || "",confirmAdditional:false}])));
    }catch(error){setMessage(error instanceof Error?error.message:"Preview failed.");}finally{setBusy(false);}
  }
  async function save() {
    if(!preview)return;
    setBusy(true);setMessage("");
    try {
      let saved=results;
      if(!saved){const value=await json<{results:{item:Item;disposition:string}[]}>("/api/quality/punchlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,sourceKey,sourceRevision,filename,rows:preview.rows,targets,confirm:true,batchId})});saved=value.results;setResults(saved);setCommitted(true);}
      for(const result of saved) {
        // Changed rows require explicit reconciliation; do not attach new source evidence silently.
        if(result.disposition.startsWith("Existing item changed"))continue;
        const row=preview.rows.find(row=>row.towerId===result.item.tower_id && row.externalReference.toUpperCase()===result.item.external_reference.toUpperCase());if(!row)continue;
        for(const file of matching(row)) {
          const key=`${result.item.id}:${file.name}`;if(uploaded.includes(key))continue;
          setMessage(`Uploading Before evidence: ${file.name}. Keep this window open; failed transfers can be retried.`);
          const bytes=new Uint8Array(await file.arrayBuffer());
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
          const session=await json<{file?:{id:string};uploadUrl?:string;ticket?:string}>("/api/quality/files/upload-session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,towerId:result.item.tower_id,revisionId:result.item.revision_id,revisionItemId:result.item.id,fileRole:"before_photo",clientMutationId:`import-photo:${hash}`,name:file.name,mimeType:file.type || (/\.png$/i.test(file.name)?"image/png":"image/jpeg"),size:file.size,capturedAt:imageCaptureTime(bytes,timeZone),evidencePhase:"BEFORE"})});
          if(!session.file){if(!session.uploadUrl || !session.ticket)throw new Error("Evidence upload session is incomplete.");
            for(let offset=0;offset<file.size;offset+=1638400){const end=Math.min(offset+1638400,file.size);const response=await fetch(session.uploadUrl,{method:"PUT",headers:{"Content-Range":`bytes ${offset}-${end-1}/${file.size}`},body:file.slice(offset,end)});if(!response.ok)throw new Error(`Photo upload failed (${response.status}). Retry this import to resume.`);}
            await json("/api/quality/files/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket:session.ticket})});
          }
          setUploaded(previous=>[...previous,key]);
        }
      }
      await onSaved();setMessage("Import saved. Existing changed and missing source items were retained for reconciliation. Review the results below before closing.");
    }catch(error){setMessage(error instanceof Error?error.message:"Import failed. Retry with the same source.");}finally{setBusy(false);}
  }
  const conflicts=Object.entries(targets).some(([id,target])=>!target.revisionId && preview?.revisions.some(rev=>rev.tower_id===id) && !target.confirmAdditional);
  return <div className="fixed inset-0 z-80 bg-slate-950/70 p-4 flex items-center justify-center"><section className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
    <div className="flex justify-between"><div><h2 className="text-lg font-black">Import Punchlist</h2><p className="text-sm text-slate-500">Client references remain separate from canonical RECT / FLI numbers.</p></div><button disabled={busy} onClick={onClose}>Close</button></div>
    <fieldset disabled={busy || committed} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3"><label>Source / client key *<input className="input" value={sourceKey} onChange={e=>{setSourceKey(e.target.value);setPreview(null);}} placeholder="Reuse this key for later revisions"/></label><label>Source revision / reference<input className="input" value={sourceRevision} onChange={e=>setSourceRevision(e.target.value)}/></label><label>CSV or XLSX *<input type="file" accept=".csv,.xlsx" onChange={e=>{if(e.target.files?.[0])void read(e.target.files[0]);}}/></label></div>
      <p className="text-xs text-slate-500">Required: Tower, External Defect Number, Defect Type, Description. Use YYYY-MM-DD dates. Reference multiple photo filenames with semicolons. Source keys must stay the same on re-import.</p>
      <a className="text-blue-700 text-sm underline" download="punchlist-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("Tower,External Defect Number,Defect Type,Description,Member,Segment,Leg,Drawing,Inspector Comment,Source Date,Assigned Flag,Photos\n136,TG-32,Missing member,Replace missing member,77H,Earthwire Peak,A,D-001,Inspector note,2026-10-28,Crew 2,photo-32a.jpg;photo-32b.jpg\n")}`}>Download example CSV</a>
      {columns.length>0?<div className="grid grid-cols-2 md:grid-cols-4 gap-2">{punchlistFields.map(key=><label className="text-xs" key={key}>{labels[key]}<select className="input" value={mapping[key] || ""} onChange={e=>{setMapping({...mapping,[key]:e.target.value});setPreview(null);}}><option value="">Not mapped</option>{columns.map(column=><option key={column}>{column}</option>)}</select></label>)}</div>:null}
      <label className="block text-sm">Supplied Before photos (JPEG / PNG, multiple allowed)<input className="block" type="file" multiple accept="image/jpeg,image/png" onChange={e=>setPhotos(Array.from(e.target.files || []))}/></label>
      {sheetWarning?<p className="rounded-xl bg-amber-50 p-3 text-amber-900">{sheetWarning}</p>:null}
      <button className="rounded-xl bg-slate-950 text-white px-4 py-2" disabled={!raw.length || !sourceKey.trim()} onClick={()=>void validate()}>Preview import</button>
    </fieldset>
    {preview?<div className="space-y-3"><p className="font-bold">{new Set(preview.rows.map(row=>row.towerId).filter(Boolean)).size} towers · {rows.length} defects · {photos.length-unmatched.length} images matched · {missing.length+unmatched.length} images not matched</p>
      {[...preview.errors,...duplicatePhotos.map(file=>`Ambiguous duplicate photo filename: ${file.name}`),...missing,...unmatched.map(file=>`Photo could not be matched — ${file.name}`)].map((error,i)=><p key={i} className="text-sm text-red-700">{error}</p>)}
      {Object.entries(targets).map(([id,target])=><div key={id} className="rounded-xl bg-amber-50 p-3"><b>{preview.towers.find(t=>t.id===id)?.name}</b>{preview.revisions.filter(rev=>rev.tower_id===id).map(rev=><p key={rev.id} className="text-sm">Existing {rev.revision_number} · {rev.status} <a className="underline" href={`/project/${projectId}/tower/${id}/revisions`} target="_blank" rel="noreferrer">Open {rev.revision_number}</a></p>)}<select disabled={committed || busy} className="input" value={target.revisionId} onChange={e=>setTargets({...targets,[id]:{revisionId:e.target.value,confirmAdditional:false}})}><option value="">Create new Punchlist</option>{preview.revisions.filter(rev=>rev.tower_id===id && ["Draft","Open","In Progress"].includes(rev.status)).map(rev=><option key={rev.id} value={rev.id}>Append to existing {rev.revision_number}</option>)}</select>{!target.revisionId && preview.revisions.some(rev=>rev.tower_id===id)?<label><input type="checkbox" disabled={committed || busy} checked={target.confirmAdditional} onChange={e=>setTargets({...targets,[id]:{...target,confirmAdditional:e.target.checked}})}/> Create another anyway — I have reviewed existing RECTs</label>:null}</div>)}
      <div className="max-h-64 overflow-auto"><table className="w-full text-xs"><thead><tr><th>Tower</th><th>External reference</th><th>Defect</th><th>Before photos</th><th>Reconciliation</th></tr></thead><tbody>{preview.candidates.map(({row,existing})=><tr key={row.rowKey} className="border-t"><td>{row.tower}</td><td>{row.externalReference}</td><td>{row.defectType}: {row.description}</td><td>{matching(row).length}</td><td>{existing?(samePunchlistSource(existing.source_payload,row)?"Existing — retained":"Existing item changed — review required"):"New FLI"}</td></tr>)}</tbody></table></div>
      {preview.absent.length>0?<p className="text-amber-800">{preview.absent.length} existing source items are absent from this file. They will be retained; review them in the existing RECTs.</p>:null}
      <button className="rounded-xl bg-slate-950 text-white px-4 py-2 disabled:opacity-50" disabled={busy || duplicatePhotos.length>0 || preview.errors.length>0 || missing.length>0 || unmatched.length>0 || conflicts || (Boolean(sheetWarning) && !photos.length)} onClick={()=>void save()}>{busy?"Saving…":committed?"Retry / verify remaining photos":"Confirm import"}</button>
    </div>:null}
    {message?<p role="status" className="rounded-xl bg-slate-100 p-3 text-sm whitespace-pre-wrap">{message}</p>:null}
    {results?.map(result=><p key={result.item.id} className="text-sm">{result.item.external_reference}: {result.disposition} · <a className="underline" target="_blank" rel="noreferrer" href={`/project/${projectId}/tower/${result.item.tower_id}/revisions`}>Open RECT / reconcile</a></p>)}
  </section></div>;
}
