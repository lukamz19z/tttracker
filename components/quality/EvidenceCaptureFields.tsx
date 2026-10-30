"use client";
import type { CaptureDetails } from "@/lib/quality/browser-evidence";
export default function EvidenceCaptureFields({value,onChange,timeZone}:{value:CaptureDetails;onChange:(value:CaptureDetails)=>void;timeZone?:string|null}) {
  return <div className="space-y-2"><div className="grid gap-3 sm:grid-cols-3">
    <label className="text-xs font-semibold">Captured By<input className="input" value={value.capturedBy} onChange={e=>onChange({...value,capturedBy:e.target.value})} placeholder="Photographer's full name (if known)"/></label>
    <label className="text-xs font-semibold">Captured Date (DD/MM/YYYY)<input className="input" type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={value.capturedDate} onChange={e=>onChange({...value,capturedDate:e.target.value})}/></label>
    <label className="text-xs font-semibold">Captured Time<input className="input" type="time" value={value.capturedTime} onChange={e=>onChange({...value,capturedTime:e.target.value})}/></label>
  </div><p className="text-xs text-slate-500">Optional details apply to this selection. Leave date/time blank to use EXIF capture metadata when available; otherwise capture time stays unknown. Date alone is retained without inventing a time. Times use {timeZone || "the project timezone"}. The signed-in uploader is recorded separately.</p></div>;
}
