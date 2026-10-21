"use client";
import { useEffect, useRef, useState } from "react";
import { PersonAvatar } from "./person-avatar";
import { responseData } from "./people-controls";
import type { PersonPhoto } from "@/lib/people/profile-photo";
export function PersonPhotoPanel({ organisation, personId, name, employeeNumber, position, onChanged }: { organisation:string; personId?:string; name:string; employeeNumber?:string; position?:string; onChanged?:()=>void }) {
 const fileInput = useRef<HTMLInputElement>(null);
 const [photo,setPhoto]=useState<PersonPhoto|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const query=`organisation=${encodeURIComponent(organisation)}${personId?`&person=${encodeURIComponent(personId)}`:""}`;
 useEffect(()=>{let active=true;fetch(`/api/people/profile-photo?${query}`,{cache:"no-store"}).then(responseData).then(data=>{if(active)setPhoto(parsePhoto(data));}).catch(e=>{if(active&&personId)setError(e instanceof Error?e.message:"Profile photo could not be loaded.");});return()=>{active=false;};},[query,personId]);
 async function change(action:string,file?:File){setBusy(true);setError("");try{const body=new FormData();body.set("organisation",organisation);if(personId)body.set("person",personId);body.set("action",action);if(file)body.set("file",file);await responseData(await fetch("/api/people/profile-photo",{method:"POST",body}));setPhoto(parsePhoto(await responseData(await fetch(`/api/people/profile-photo?${query}`,{cache:"no-store"}))));window.dispatchEvent(new CustomEvent("person-photo-changed"));onChanged?.();}catch(e){setError(e instanceof Error?e.message:"Photo could not be saved. The existing photo is retained.");}finally{setBusy(false);}}
 return <section aria-label="Profile Photo" style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:20}}>
 <PersonAvatar organisation={organisation} personId={photo?.person_id??personId} name={photo?.name??name} documentId={photo?.document_id} size={96} portrait />
 <div><strong>{photo?.name??name}</strong>{employeeNumber&&<div>Employee Number {employeeNumber}</div>}{position&&<div>{position}</div>}<small>Profile Photo</small>
 <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>{photo?.can_manage&&<><button type="button" className="tt-button-secondary" disabled={busy} onClick={()=>fileInput.current?.click()}>{busy?"Saving...":photo.document_id?"Change Photo":"Upload Photo"}</button><input ref={fileInput} aria-label="Upload Profile Photo" type="file" accept="image/jpeg,image/png" disabled={busy} hidden onChange={e=>{const file=e.target.files?.[0];if(file)void change("upload",file);e.target.value="";}}/>{photo.document_id&&<button type="button" className="tt-button-subtle" disabled={busy} onClick={()=>{if(window.confirm("Remove the current photo? The document will be retained in history."))void change("remove");}}>Remove Photo</button>}</>}
 {photo?.document_id&&<a className="tt-button-secondary" href={`/api/documents/${encodeURIComponent(photo.document_id)}?organisation=${encodeURIComponent(organisation)}&mode=preview`} target="_blank" rel="noreferrer">View Photo</a>}
 </div>{photo?.can_manage&&<small>JPG, JPEG or PNG - up to 10 MB</small>}{photo?.pending&&<p role="status">Onboarding photo publication is pending. The existing photo is retained. Publication retries automatically after five minutes. {photo.can_manage&&<button disabled={busy} type="button" className="tt-button-subtle" onClick={()=>void change("retry")}>Retry publication</button>}</p>}{error&&<p role="alert">{error}</p>}</div>
 </section>;
}

function parsePhoto(value:unknown):PersonPhoto|null {
 if(!value||typeof value!=="object")return null;
 const row=value as Record<string,unknown>;
 if(typeof row.person_id!=="string"||typeof row.name!=="string")return null;
 return {person_id:row.person_id,name:row.name,document_id:typeof row.document_id==="string"?row.document_id:null,version:typeof row.version==="string"?row.version:null,can_manage:row.can_manage===true,pending:row.pending===true};
}
