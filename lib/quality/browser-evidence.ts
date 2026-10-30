import { imageCaptureTime } from "./photo-capture";
import { projectLocalCaptureTime } from "./date-time";
import { sourceDateToDb } from "./punchlist-import-values";

export type CaptureDetails = { capturedBy: string; capturedDate: string; capturedTime: string };
export const emptyCaptureDetails: CaptureDetails = {capturedBy:"",capturedDate:"",capturedTime:""};
export function resolveEvidenceCapture(details: CaptureDetails, bytes: Uint8Array, timeZone?: unknown) {
  const capturedDate=sourceDateToDb(details.capturedDate);
  if(capturedDate===null)throw new Error("Captured date must be DD/MM/YYYY.");
  if(details.capturedBy.includes("@")) throw new Error("Enter the photographer's name, not an email address.");
  if(details.capturedTime && !details.capturedDate) throw new Error("Enter a capture date with the capture time, or leave both unknown.");
  const capturedAt = capturedDate && details.capturedTime
    ? projectLocalCaptureTime(`${capturedDate} ${details.capturedTime}`, timeZone)
    : details.capturedDate ? null : imageCaptureTime(bytes,timeZone);
  if(details.capturedDate && details.capturedTime && !capturedAt) throw new Error("The captured date/time is invalid.");
  return {capturedAt, capturedDate:capturedDate || "", capturedBy:details.capturedBy.trim()};
}
/** Shared browser transport; finalisation bakes the canonical watermark on the server. */
export async function uploadBrowserEvidence(apiFetch:(url:string,init?:RequestInit)=>Promise<Response>, file:File,
  target:{projectId:string;towerId:string;revisionId:string;revisionItemId:string;fileRole:"before_photo"|"after_photo"},
  details:CaptureDetails=emptyCaptureDetails,timeZone?:unknown,mutationPrefix="browser-photo") {
  if(file.size>25*1024*1024)throw new Error(`${file.name}: photos must be 25 MB or smaller.`);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const capture=resolveEvidenceCapture(details,bytes,timeZone);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
  async function json(url:string,body:unknown) {
    const response=await apiFetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const value=await response.json();if(!response.ok)throw new Error(value.error || `${file.name}: evidence request failed (${response.status}).`);return value;
  }
  const session=await json("/api/quality/files/upload-session",{...target,...capture,clientMutationId:`${mutationPrefix}:${hash}`,name:file.name,mimeType:file.type || (/\.png$/i.test(file.name)?"image/png":"image/jpeg"),size:file.size,evidencePhase:target.fileRole==="before_photo"?"BEFORE":"AFTER"});
  if(session.file)return;
  if(!session.uploadUrl || !session.ticket)throw new Error("Evidence upload session is incomplete.");
  for(let offset=0;offset<file.size;offset+=1638400){
    const end=Math.min(offset+1638400,file.size);
    const response=await fetch(session.uploadUrl,{method:"PUT",headers:{"Content-Range":`bytes ${offset}-${end-1}/${file.size}`},body:file.slice(offset,end)});
    if(!response.ok)throw new Error(`${file.name}: upload failed (${response.status}). Retry to resume.`);
  }
  await json("/api/quality/files/upload",{ticket:session.ticket});
}
