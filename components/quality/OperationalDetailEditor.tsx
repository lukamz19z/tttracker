"use client";
import type { DetailField, DetailSchema, DetailValues } from "@/lib/quality/operational-details";

export function OperationalDetailEditor({schema,values,onChange}:{schema?:DetailSchema|null;values:DetailValues;onChange:(values:DetailValues)=>void}) {
  if (!schema?.fields.length) return null;
  const set=(key:string,value:DetailValues[string])=>onChange({...values,[key]:value});
  const control=(field:DetailField)=>{
    const value=values[field.key];
    const label=<span>{field.label}{field.unit?` (${field.unit})`:""}{field.required?" *":""}</span>;
    if(field.type==="toggle")return <label key={field.key} className="flex items-center gap-2 text-xs font-semibold">{label}<input type="checkbox" checked={value===true} onChange={event=>set(field.key,event.target.checked)}/></label>;
    if(field.type==="select"||field.type==="change-direction")return <label key={field.key} className="grid gap-1 text-xs font-semibold">{label}<select className="input px-2 py-2" value={typeof value==="string"?value:""} onChange={event=>set(field.key,event.target.value)}><option value="">Choose</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</select></label>;
    if(field.type==="multi-select")return <fieldset key={field.key} className="text-xs font-semibold"><legend>{label}</legend><div className="flex flex-wrap gap-1">{(field.options||[]).map(option=>{const selected=Array.isArray(value)&&value.includes(option);return <button type="button" key={option} onClick={()=>{const current=Array.isArray(value)?value:[];set(field.key,selected?current.filter(item=>item!==option):[...current,option]);}} className={`rounded-full border px-2 py-1 ${selected?"bg-slate-900 text-white":"bg-white"}`}>{option}</button>;})}</div></fieldset>;
    return <label key={field.key} className="grid gap-1 text-xs font-semibold">{label}<input className="input min-w-0 px-2 py-2" inputMode={["number","quantity"].includes(field.type)?"decimal":"text"} value={value===undefined?"":String(value)} onChange={event=>{const raw=event.target.value;set(field.key,["number","quantity"].includes(field.type)&&/^\d+(\.\d+)?$/.test(raw)?Number(raw):raw);}}/></label>;
  };
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 text-xs font-bold text-slate-600">Operational details <span className="font-normal">(optional unless marked *)</span></div><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{schema.fields.map(control)}</div></section>;
}
