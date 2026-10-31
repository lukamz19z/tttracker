"use client";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { mapPunchlistRows, punchlistFields, matchPunchlistPhotos, punchlistSourceKey, suggestPunchlistMapping, type PunchlistRow } from "@/lib/quality/punchlist";
import { uploadBrowserEvidence, resolveEvidenceCapture, emptyCaptureDetails } from "@/lib/quality/browser-evidence";
import EvidenceCaptureFields from "./EvidenceCaptureFields";
import { excelCalendarDate } from "@/lib/quality/punchlist-import-values";

type Item = {id:string;revision_id:string;tower_id:string;external_reference:string;source_payload?:PunchlistRow};
type Preview = {rows:PunchlistRow[];errors:string[];candidates:{row:PunchlistRow;existing:Item|null}[];absent:Item[];revisions:{id:string;tower_id:string;revision_number:string;source_type:string;status:string}[];towers:{id:string;name:string}[];issueTypes:{id:string;name:string;detail_schema?:import("@/lib/quality/operational-details").DetailSchema|null}[]};
type Target = {revisionId:string;confirmAdditional:boolean};
const labels:Record<string,string>={tower:"Tower",externalReference:"External Defect Number",member:"Member",segment:"Segment",leg:"Leg",drawing:"Drawing",defectType:"Defect Type",description:"Description",inspector:"Inspector",inspectorComment:"Inspector Comment",sourceDate:"Source Date (DD/MM/YYYY)",assignedFlag:"Assigned Flag",photos:"Photo filenames (separate with ;)"};
export default function PunchlistImport({projectId,timeZone,apiFetch,onClose,onSaved}:{projectId:string;timeZone?:string|null;apiFetch:(url:string,init?:RequestInit)=>Promise<Response>;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [raw,setRaw]=useState<Record<string,unknown>[]>([]),[mapping,setMapping]=useState<Record<string,string>>({}),[filename,setFilename]=useState("");
  const [sourceKey,setSourceKey]=useState(""),[sourceRevision,setSourceRevision]=useState(""),[photos,setPhotos]=useState<File[]>([]);
  const [preview,setPreview]=useState<Preview|null>(null),[targets,setTargets]=useState<Record<string,Target>>({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[batchId]=useState(()=>crypto.randomUUID()),[committed,setCommitted]=useState(false);
  const [results,setResults]=useState<{item:Item;disposition:string}[]|null>(null),[uploaded,setUploaded]=useState<string[]>([]);
  const [sheetWarning,setSheetWarning]=useState("");
  const [step,setStep]=useState<1|2|3>(1),[importFinished,setImportFinished]=useState(false),[punchlistName,setPunchlistName]=useState("");
  const sourceKeyOverride=sourceKey.trim();
  const automaticSourceKey=punchlistSourceKey(projectId,punchlistName||filename.replace(/\.[^.]+$/,""));
  const effectiveSourceKey=sourceKeyOverride||automaticSourceKey;
  const fileInput=useRef<HTMLInputElement>(null),photosInput=useRef<HTMLInputElement>(null),folderInput=useRef<HTMLInputElement>(null);
  const columns=Object.keys(raw[0] || {});
  const rows=useMemo(()=>preview?.rows || mapPunchlistRows(raw,mapping,preview?.issueTypes),[preview,raw,mapping]);
  const [assignments,setAssignments]=useState<Record<number,string>>({});
  const [capture,setCapture]=useState(emptyCaptureDetails);
  const [towerResolutions,setTowerResolutions]=useState<Record<string,string>>({});
  const review=useMemo(()=>matchPunchlistPhotos(rows,photos,assignments),[rows,photos,assignments]);
  const matching=(row:PunchlistRow)=>review.matches.filter(match=>match.rowKey===row.rowKey).map(match=>photos[match.index]);
  const unresolved=review.matches.filter(match=>match.state==="unmatched" || match.state==="ambiguous");
  function selectPhotos(selected:File[]) {setPhotos(current=>[...current,...selected]);}
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
        data=XLSX.utils.sheet_to_json<Record<string,unknown>>(book.Sheets[book.SheetNames[0]],{defval:"",raw:true});
        const date1904=Boolean(book.Workbook?.WBProps?.date1904);
        const sheet=book.Sheets[book.SheetNames[0]];
        const range=XLSX.utils.decode_range(sheet["!ref"] || "A1");
        for(let column=range.s.c;column<=range.e.c;column++) {
          const header=String(sheet[XLSX.utils.encode_cell({r:range.s.r,c:column})]?.v || "");
          if(!Object.hasOwn(data[0],header) || !/^(source\s*date|date\s*raised|inspection\s*date)$/i.test(header.trim()))continue;
          for(let index=0;index<data.length;index++) {
            const cell=sheet[XLSX.utils.encode_cell({r:range.s.r+1+index,c:column})];
            if(cell?.t==="n" && typeof cell.v==="number")data[index][header]=excelCalendarDate(cell.v,date1904) || cell.v;
            else if(cell?.t==="d" && cell.v instanceof Date)data[index][header]=`${String(cell.v.getUTCDate()).padStart(2,"0")}/${String(cell.v.getUTCMonth()+1).padStart(2,"0")}/${cell.v.getUTCFullYear()}`;
          }
        }
        const keys=(book as XLSX.WorkBook & {keys?:string[]}).keys || [];
        setSheetWarning(keys.some(key=>key.startsWith("xl/media/"))?"This workbook contains embedded images. Export and attach those images separately, then map their filenames before confirming. Embedded images are not imported automatically.":"");
      }
      if(!data.length || data.length>500)throw new Error("Choose a source containing 1–500 defect rows.");
      setRaw(data);setFilename(file.name);setPunchlistName(file.name.replace(/\.[^.]+$/,""));setSourceKey("");setMapping(suggestPunchlistMapping(Object.keys(data[0])));setAssignments({});setTowerResolutions({});setStep(1);
    } catch(error){setMessage(error instanceof Error?error.message:"Source could not be read.");}finally{setBusy(false);}
  }
  async function validate(resolutions=towerResolutions):Promise<boolean> {
    setBusy(true);setMessage("");
    try {const request=(nextRows:PunchlistRow[])=>json<Preview>("/api/quality/punchlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,sourceKey:effectiveSourceKey,rows:nextRows,towerResolutions:resolutions})});let value=await request(mapPunchlistRows(raw,mapping,preview?.issueTypes));if(!preview?.issueTypes?.length && value.issueTypes?.length){const auto=suggestPunchlistMapping(columns,value.issueTypes);const merged={...auto,...mapping};setMapping(merged);value=await request(mapPunchlistRows(raw,merged,value.issueTypes));}setPreview(value);
      setTargets(Object.fromEntries([...new Set(value.rows.map(row=>row.towerId).filter(Boolean))].map(id=>[id,{revisionId:value.revisions.find(rev=>rev.tower_id===id && rev.source_type==="punchlist" && ["Draft","Open","In Progress"].includes(rev.status))?.id || "",confirmAdditional:false}])));return true;
    }catch(error){setMessage(error instanceof Error?error.message:"Preview failed.");return false;}finally{setBusy(false);}
  }
  async function save() {
    if(!preview)return;
    setBusy(true);setMessage("");
    try {
      resolveEvidenceCapture(capture,new Uint8Array(),timeZone);
      for(const match of review.matches.filter(match=>match.state==="matched")) {
        const file=photos[match.index];
        if(file.size>25*1024*1024 || !/\.(jpe?g|png)$/i.test(file.name))throw new Error(`${file.name}: choose a JPEG/PNG up to 25 MB, or exclude this file in photo review.`);
      }
      let saved=results;
      if(!saved){const value=await json<{results:{item:Item;disposition:string}[]}>("/api/quality/punchlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,sourceKey:effectiveSourceKey,sourceRevision,filename,rows:preview.rows,towerResolutions,targets,confirm:true,batchId})});saved=value.results;setResults(saved);setCommitted(true);}
      for(const result of saved) {
        // Changed rows require explicit reconciliation; do not attach new source evidence silently.
        if(result.disposition.startsWith("Existing item changed"))continue;
        const row=preview.rows.find(row=>row.towerId===result.item.tower_id && row.externalReference.toUpperCase()===result.item.external_reference.toUpperCase());if(!row)continue;
        for(const file of matching(row)) {
          const key=`${result.item.id}:${photos.indexOf(file)}`;if(uploaded.includes(key))continue;
          setMessage(`Uploading Before evidence: ${file.name}. Keep this window open; failed transfers can be retried.`);
          await uploadBrowserEvidence(apiFetch,file,{projectId,towerId:result.item.tower_id,revisionId:result.item.revision_id,revisionItemId:result.item.id,fileRole:"before_photo"},capture,timeZone,"import-photo");
          setUploaded(previous=>[...previous,key]);
        }
      }
      await onSaved();setImportFinished(true);setMessage("");
    }catch(error){setMessage(error instanceof Error?error.message:"Import failed. Retry with the same source.");}finally{setBusy(false);}
  }
  const conflicts=Object.entries(targets).some(([id,target])=>!target.revisionId && preview?.revisions.some(rev=>rev.tower_id===id) && !target.confirmAdditional);
  const missingRequired=["tower","externalReference","defectType","description"].filter(key=>!mapping[key]);
  const hasExisting=Boolean(preview?.candidates.some(candidate=>candidate.existing)||preview?.absent.length);
  const matchedCount=review.matches.filter(match=>match.state==="matched").length;
  const dateErrors=preview?.errors.filter(error=>/date/i.test(error))||[];
  const towerIssues=[...new Set(preview?.rows.filter(row=>!row.towerId).map(row=>row.tower)||[])];
  const blockers=(preview?.errors||[]).filter(error=>!/^Row \d+: tower (unmatched|ambiguous)/i.test(error));
  const ready=Boolean(preview&&!blockers.length&&!towerIssues.length&&!unresolved.length&&!conflicts&&!sheetWarning);
  if(importFinished&&results?.length){const first=results[0].item;const towerName=preview?.towers.find(tower=>tower.id===first.tower_id)?.name;return <div className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/70 p-4"><section className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div><h2 className="text-xl font-black">Punchlist imported</h2><p className="text-sm text-slate-600">{results.filter(result=>result.disposition==="created").length} findings created<br/>{uploaded.length} Before photos attached<br/>{towerName?`Tower ${towerName}`:"Punchlist ready"}</p><div className="flex justify-center gap-2"><a className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white" href={`/project/${projectId}/tower/${first.tower_id}/revisions`}>Open Punchlist</a><button className="rounded-xl border px-4 py-2 font-bold" onClick={onClose}>Close</button></div></section></div>;}
  return <div className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/70 p-3 sm:p-5"><section className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6">
    <header className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">Import Punchlist</h2><nav aria-label="Import steps" className="mt-2 flex items-center gap-2 text-xs font-bold">{(["Upload","Photos","Review"] as const).map((label,index)=><span key={label} className={`rounded-full px-2.5 py-1 ${step===index+1?"bg-slate-900 text-white":step>index+1?"bg-emerald-100 text-emerald-800":"bg-slate-100 text-slate-500"}`}>{index+1} {label}</span>)}</nav></div><button disabled={busy} onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">Close</button></header>
    {step===1?<div className="space-y-4">
      <h3 className="font-bold">Upload Punchlist</h3>
      <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const file=event.dataTransfer.files[0];if(file)void read(file);}} className="flex min-h-44 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-blue-400"><span className="text-lg font-black text-slate-900">{busy?"Reading Punchlist…":"Choose CSV or XLSX"}</span><span className="mt-1 text-sm text-slate-500">Drop your file here or browse</span></button><input ref={fileInput} hidden type="file" accept=".csv,.xlsx" onChange={event=>{const file=event.target.files?.[0];if(file)void read(file);event.currentTarget.value="";}}/>
      {filename?<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><b>{filename}</b><div>{raw.length} findings detected</div>{missingRequired.length?<div className="mt-1 text-amber-800">A few columns need matching before continuing.</div>:<div>✓ Required columns matched</div>}<label className="mt-2 block text-xs font-semibold">Punchlist name (optional)<input className="input mt-1" value={punchlistName} onChange={event=>setPunchlistName(event.target.value)}/></label></div>:null}
      {missingRequired.length&&columns.length?<div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">{missingRequired.map(key=><label key={key} className="block text-sm">We couldn&apos;t identify the {labels[key]} column.<select className="input mt-1" value={mapping[key]||""} onChange={event=>setMapping({...mapping,[key]:event.target.value})}><option value="">Select column</option>{columns.map(column=><option key={column}>{column}</option>)}</select></label>)}</div>:null}
      <a className="text-sm font-semibold text-blue-700 underline" download="punchlist-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("Tower,Tower No,External Defect Number,Defect Type,Description,Member,Segment,Leg,Drawing,Inspector,Source Date\nT92,92,TG-32,Missing member,Replace missing member,77H,Peak,A,D-001,John Smith,30/10/2026\n")}`}>Download example</a>
      <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><div className="mt-3 space-y-3"><label className="block text-xs">Source/client key<input className="input mt-1" value={sourceKey} onChange={event=>setSourceKey(event.target.value)} placeholder={`Auto: ${automaticSourceKey}`}/></label><label className="block text-xs">Source revision/reference<input className="input mt-1" value={sourceRevision} onChange={event=>setSourceRevision(event.target.value)}/></label><div className="grid gap-2 sm:grid-cols-2">{punchlistFields.map(key=><label className="text-xs" key={key}>{labels[key]}<select className="input mt-1" value={mapping[key]||""} onChange={event=>setMapping({...mapping,[key]:event.target.value})}><option value="">Not mapped</option>{columns.map(column=><option key={column}>{column}</option>)}</select></label>)}{(preview?.issueTypes||[]).flatMap(issue=>(issue.detail_schema?.fields||[]).map(field=><label className="text-xs" key={`${issue.id}:${field.key}`}>{issue.name} · {field.label}<select className="input mt-1" value={mapping[`operational:${issue.id}:${field.key}`]||""} onChange={event=>setMapping({...mapping,[`operational:${issue.id}:${field.key}`]:event.target.value})}><option value="">Not mapped</option>{columns.map(column=><option key={column}>{column}</option>)}</select></label>))}</div></div></details>
      <div className="flex justify-end"><button disabled={!raw.length||Boolean(missingRequired.length)||busy} className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-40" onClick={async()=>{if(await validate())setStep(2);}}>Continue</button></div>
    </div>:null}
    {step===2?<div className="space-y-4"><div><h3 className="font-bold">Add Punchlist Photos</h3><p className="mt-1 text-sm text-slate-600">Select supplied defect photos together. TTTracker matches them automatically.</p></div><div onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();selectPhotos(Array.from(event.dataTransfer.files).filter(file=>/\.(jpe?g|png)$/i.test(file.name)));}} className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center"><div className="font-bold">Add Photos</div><div className="mt-3 flex flex-wrap justify-center gap-2"><button type="button" className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white" onClick={()=>photosInput.current?.click()}>Select Photos</button><button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold" onClick={()=>folderInput.current?.click()}>Choose Folder</button></div><input ref={photosInput} hidden type="file" multiple accept="image/jpeg,image/png" onChange={event=>{selectPhotos(Array.from(event.target.files||[]));event.currentTarget.value="";}}/><input ref={folderInput} hidden type="file" multiple {...{webkitdirectory:"",directory:""}} onChange={event=>{const selected=Array.from(event.target.files||[]);const images=selected.filter(file=>/\.(jpe?g|png)$/i.test(file.name));selectPhotos(images);if(selected.length!==images.length)setMessage(`${selected.length-images.length} unsupported files skipped.`);event.currentTarget.value="";}}/><p className="mt-2 text-xs text-slate-500">Photos are matched automatically using the Punchlist reference in the filename.</p></div>
      <div className="flex flex-wrap gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold"><span>{photos.length} photos selected</span><span className="text-emerald-700">{matchedCount} matched automatically</span><span className={unresolved.length?"text-amber-800":"text-emerald-700"}>{unresolved.length} need attention</span></div>
      {unresolved.length?<details open className="rounded-xl border border-amber-200 p-3"><summary className="cursor-pointer font-bold">Review {unresolved.length} photos</summary><datalist id="punchlist-photo-targets">{rows.map(row=><option key={row.rowKey} value={row.rowKey}>{row.externalReference} / {row.tower}</option>)}</datalist><div className="mt-2 max-h-56 space-y-2 overflow-auto">{unresolved.map(match=><div key={match.index} className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-40 flex-1">{photos[match.index].webkitRelativePath||photos[match.index].name} · {match.state}</span><input className="input max-w-36" list="punchlist-photo-targets" aria-label={`Assign ${photos[match.index].name}`} placeholder="Finding row" value={assignments[match.index]||""} onChange={event=>setAssignments({...assignments,[match.index]:event.target.value})}/><button className="text-slate-600 underline" onClick={()=>setAssignments({...assignments,[match.index]:"skip"})}>Exclude</button></div>)}</div></details>:null}
      {review.matches.some(match=>match.state==="matched")?<details><summary className="cursor-pointer text-xs font-semibold text-slate-600">Advanced · reassign matched photos</summary><div className="max-h-48 overflow-auto">{review.matches.filter(match=>match.state==="matched").map(match=><label key={match.index} className="flex items-center gap-2 py-1 text-xs">{photos[match.index].name}<select className="input max-w-64" value={assignments[match.index]??match.rowKey??""} onChange={event=>setAssignments({...assignments,[match.index]:event.target.value})}>{rows.map(row=><option key={row.rowKey} value={row.rowKey}>{row.externalReference} · {row.tower}</option>)}</select></label>)}</div></details>:null}
      <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Photo details (optional)</summary><div className="mt-3"><EvidenceCaptureFields value={capture} onChange={setCapture} timeZone={timeZone}/></div></details>
      <details><summary className="cursor-pointer text-xs font-semibold text-slate-600">How photo matching works</summary><p className="mt-1 text-xs text-slate-500">TG-000124_01.jpg and TG-000124_02.jpg both match reference TG-000124. You can assign exceptions manually.</p></details>
      {sheetWarning?<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{sheetWarning}</p>:null}{message?<p role="status" className="text-sm text-amber-800">{message}</p>:null}
      <div className="flex justify-between"><button className="rounded-xl border px-4 py-2 font-semibold" onClick={()=>setStep(1)}>Back</button><button className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white" onClick={()=>setStep(3)}>{unresolved.length?`Review ${unresolved.length}`:"Continue to Review"}</button></div>
    </div>:null}
    {step===3&&preview?<div className="space-y-4"><h3 className="font-bold">Review import</h3>{hasExisting?<details open className="rounded-xl border border-amber-200 bg-amber-50 p-3"><summary className="cursor-pointer font-bold">Existing Punchlist detected</summary><p className="mt-2 text-sm">Use the same Punchlist source to reconcile this file. Changed source rows are retained for review.</p><label className="mt-2 block text-xs">Source revision/reference<input className="input mt-1" value={sourceRevision} onChange={event=>setSourceRevision(event.target.value)} placeholder="Optional"/></label><button className="mt-2 text-sm font-bold underline" onClick={()=>{const next=`${effectiveSourceKey}:new:${Date.now()}`.slice(0,200);setSourceKey(next);setTargets(Object.fromEntries([...new Set(preview.rows.map(row=>row.towerId).filter(Boolean))].map(id=>[id,{revisionId:"",confirmAdditional:true}])));void validate();}}>Create a separate Punchlist instead</button></details>:null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[{label:"Findings",value:rows.length},{label:"Photos matched",value:matchedCount},{label:"Tower issues",value:towerIssues.length},{label:"Date issues",value:dateErrors.length},{label:"Photos need attention",value:unresolved.length}].map(item=><div key={item.label} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{item.label}</div><div className="font-black">{item.value}</div></div>)}</div>
      {!towerIssues.length?<p className="text-sm text-emerald-800">✓ All towers matched</p>:<div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><b>{towerIssues.length} tower values need matching</b>{towerIssues.map(imported=><label key={imported} className="block text-sm">Imported {imported}<select className="input mt-1" value={towerResolutions[imported]||""} onChange={event=>{const next={...towerResolutions,[imported]:event.target.value};setTowerResolutions(next);void validate(next);}}><option value="">Select TTTracker tower</option>{preview.towers.map(tower=><option key={tower.id} value={tower.id}>{tower.name}</option>)}</select></label>)}</div>}
      {dateErrors.length?<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>{dateErrors.length} date issue{dateErrors.length===1?"":"s"}</b>{dateErrors.map((error,index)=><p key={index}>{error}</p>)}</div>:<p className="text-sm text-emerald-800">✓ Dates valid</p>}
      {blockers.filter(error=>!dateErrors.includes(error)).length?<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{blockers.filter(error=>!dateErrors.includes(error)).map((error,index)=><p key={index}>{error}</p>)}</div>:null}
      {unresolved.length?<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{unresolved.length} photos need attention. Go back to Photos to assign or exclude them.</p>:null}
      {review.duplicateReferences.length?<p className="text-sm text-amber-800">Duplicate references: {review.duplicateReferences.join(", ")}</p>:null}
      {ready?<p className="rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800">✓ Ready to import</p>:null}
      <details><summary className="cursor-pointer text-sm font-semibold">Preview findings ({preview.candidates.length})</summary><div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Tower</th><th>Reference</th><th>Defect</th><th>Member</th><th>Photos</th></tr></thead><tbody>{preview.candidates.map(({row})=><tr key={row.rowKey} className="border-t"><td>{row.tower} {row.towerId?`→ ${preview.towers.find(tower=>tower.id===row.towerId)?.name} ✓`:""}</td><td>{row.externalReference}</td><td>{row.defectType}</td><td>{row.member||"-"}</td><td>{matching(row).length}</td></tr>)}</tbody></table></div></details>
      {preview.absent.length?<p className="text-xs text-amber-800">{preview.absent.length} previous source findings are absent and will be retained.</p>:null}
      {Object.keys(targets).some(id=>preview.revisions.some(revision=>revision.tower_id===id))?<details><summary className="cursor-pointer text-sm font-semibold">Advanced · RECT destination</summary>{Object.entries(targets).map(([id,target])=><div key={id} className="mt-2 rounded-lg border p-2 text-sm"><b>{preview.towers.find(tower=>tower.id===id)?.name}</b>{preview.revisions.filter(revision=>revision.tower_id===id).map(revision=><p key={revision.id} className="text-xs">Existing {revision.revision_number} · {revision.status}</p>)}<select className="input mt-1" value={target.revisionId} onChange={event=>setTargets({...targets,[id]:{revisionId:event.target.value,confirmAdditional:false}})}><option value="">Create new Punchlist</option>{preview.revisions.filter(revision=>revision.tower_id===id&&["Draft","Open","In Progress"].includes(revision.status)).map(revision=><option key={revision.id} value={revision.id}>Append to {revision.revision_number}</option>)}</select>{!target.revisionId&&preview.revisions.some(revision=>revision.tower_id===id)?<label className="block text-xs"><input type="checkbox" checked={target.confirmAdditional} onChange={event=>setTargets({...targets,[id]:{...target,confirmAdditional:event.target.checked}})}/> Create another RECT</label>:null}</div>)}</details>:null}
      <div className="flex justify-between"><button className="rounded-xl border px-4 py-2 font-semibold" onClick={()=>setStep(2)}>Back</button><button disabled={!ready||busy} className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-40" onClick={()=>void save()}>{busy?"Importing…":committed?"Retry photo upload":"Import Punchlist"}</button></div>
    </div>:null}
    {message&&step!==2?<p role="status" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{message}</p>:null}
  </section></div>;
}
