"use client";
import { useId, useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import styles from "./materials-ui.module.css";
import { formatLocalDateTime, parseLocalDateTime } from "@/lib/materials/ui-workflows";

export function MaterialsSearch({ onClear, style, ...props }: InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void }) {
  return <div className={styles.search} style={style}><Search size={17} aria-hidden="true" /><input aria-label={props["aria-label"]??props.placeholder} {...props} />{onClear && props.value ? <button type="button" className={styles.clear} aria-label="Clear search" onClick={onClear}><X size={16} /></button> : null}</div>;
}

export type Choice = { id: string; label: string };
export function ChoicePicker({ label, value, options, onChange, placeholder="Search..." }: { label:string;value:string;options:readonly Choice[];onChange:(id:string)=>void;placeholder?:string }) {
  const id=useId(); const selected=options.find(option=>option.id===value);
  const [query,setQuery]=useState(""); const [open,setOpen]=useState(false);
  const matches=options.filter(option=>option.label.toLowerCase().includes(query.toLowerCase())).slice(0,30);
  return <div><label htmlFor={id} className="tt-label">{label}</label><MaterialsSearch id={id} value={open?query:selected?.label??""} placeholder={placeholder} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} autoComplete="off" onClear={()=>{setQuery("");onChange("");setOpen(true);}} onChange={event=>{setQuery(event.target.value);onChange("");setOpen(true);}} onFocus={()=>{setQuery("");setOpen(true);}} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);if(event.key==="ArrowDown"){event.preventDefault();document.getElementById(`${id}-options`)?.querySelector<HTMLButtonElement>("button")?.focus();}}} />
  {open ? <div id={`${id}-options`} role="listbox" className={styles.choices}>{matches.map(option=><button type="button" role="option" aria-selected={value===option.id} className={styles.choice} key={option.id} onClick={()=>{onChange(option.id);setQuery(option.label);setOpen(false);}} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);if(event.key==="ArrowDown" && event.currentTarget.nextElementSibling instanceof HTMLElement) {event.preventDefault();event.currentTarget.nextElementSibling.focus();}if(event.key==="ArrowUp" && event.currentTarget.previousElementSibling instanceof HTMLElement) {event.preventDefault();event.currentTarget.previousElementSibling.focus();}}}>{option.label}</button>)}{!matches.length ? <div className={styles.choice}>No matches</div> : null}<button type="button" className={styles.choice} onClick={()=>setOpen(false)}>Close</button></div> : null}</div>;
}

export function LocalDateTime({label,value,onChange,required=false}:{label:string;value:string;onChange:(iso:string)=>void;required?:boolean}) {
 const id=useId();const inputRef=useRef<HTMLInputElement>(null);
 const [typed,setTyped]=useState({source:value,text:value?formatLocalDateTime(value):""});
 const text=typed.source===value?typed.text:value?formatLocalDateTime(value):"";
 const [calendar,setCalendar]=useState(false);const [month,setMonth]=useState(()=>new Date(value||Date.now()));
 const valid=!text || parseLocalDateTime(text)!==null;
 const selected=value?new Date(value):null;
 const year=month.getFullYear(),monthIndex=month.getMonth();
 const offset=(new Date(year,monthIndex,1).getDay()+6)%7;
 const dayCount=new Date(year,monthIndex+1,0).getDate();
 const two=(n:number)=>String(n).padStart(2,"0");
 const time=selected?`${two(selected.getHours())}:${two(selected.getMinutes())}`:"00:00";
 function commit(date:Date){
  const next=date.toISOString();
  setTyped({source:next,text:formatLocalDateTime(next)});onChange(next);
 }
 function choose(day:number){commit(new Date(year,monthIndex,day,selected?.getHours()??0,selected?.getMinutes()??0));}
 function close(){setCalendar(false);inputRef.current?.focus();}
 return <div className={styles.dateField} onKeyDown={event=>{if(event.key==="Escape")close();}}>
  <label htmlFor={id} className="tt-label">{label}{required?" (required)":""}</label>
  <div className={styles.dateInput}><input ref={inputRef} id={id} className="tt-input" value={text} placeholder="DD/MM/YYYY HH:mm" aria-required={required} aria-invalid={!valid} aria-describedby={!valid?`${id}-error`:undefined} onChange={event=>{const iso=parseLocalDateTime(event.target.value);setTyped({source:iso??"",text:event.target.value});onChange(iso??"");}}/>
  <button type="button" aria-label={`Choose ${label}`} aria-expanded={calendar} aria-controls={`${id}-calendar`} onClick={()=>{setMonth(new Date(value||Date.now()));setCalendar(!calendar);}}><CalendarDays size={18}/></button></div>
  {!valid?<small id={`${id}-error`} role="alert">Enter a valid date and time.</small>:null}
  {calendar?<div id={`${id}-calendar`} role="dialog" aria-label={`Choose ${label}`} className={styles.calendar}>
   <div className={styles.calendarHeading}><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(year,monthIndex-1,1))}><ChevronLeft size={16}/></button><strong>{month.toLocaleDateString("en-AU",{month:"long",year:"numeric"})}</strong><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(year,monthIndex+1,1))}><ChevronRight size={16}/></button></div>
   <div className={styles.calendarDays}>{["Mo","Tu","We","Th","Fr","Sa","Su"].map(day=><small key={day}>{day}</small>)}{Array.from({length:offset},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:dayCount},(_,i)=>i+1).map(day=><button type="button" key={day} aria-label={new Date(year,monthIndex,day).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"})} aria-pressed={selected?.getFullYear()===year&&selected?.getMonth()===monthIndex&&selected?.getDate()===day} onClick={()=>choose(day)} onKeyDown={event=>{const jump=event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:event.key==="ArrowDown"?7:event.key==="ArrowUp"?-7:0;if(jump){event.preventDefault();const target=event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[day-1+jump];target?.focus();}}}>{day}</button>)}</div>
   <label className={styles.calendarHeading}>Time<input aria-label="Calendar time" type="time" value={time} disabled={!selected} onChange={event=>{const parts=event.target.value.split(":").map(Number);if(parts.length===2&&parts.every(Number.isFinite)&&selected)commit(new Date(selected.getFullYear(),selected.getMonth(),selected.getDate(),parts[0],parts[1]));}}/></label><button type="button" onClick={close}>Done</button>
  </div>:null}
 </div>;
}

export type VehicleValue={assetId:string|null;rego:string;description:string};
export type VehicleAsset={id:string;rego:string;description:string};
export function VehiclePicker({value,onChange,assets=[]}:{value:VehicleValue;onChange:(value:VehicleValue)=>void;assets?:readonly VehicleAsset[]}) {
 const [manual,setManual]=useState(true);
 return <div><div className={styles.vehicleHeading}><span className="tt-label">Vehicle / rego</span><button type="button" onClick={()=>{setManual(!manual);onChange({assetId:null,rego:"",description:""});}}>{manual?"Search Assets":"Enter manually"}</button></div>{manual ? <><input className="tt-input" aria-label="Vehicle registration" value={value.rego} placeholder="Rego" onChange={event=>onChange({...value,assetId:null,rego:event.target.value})} /><details><summary>Vehicle description (optional)</summary><input className="tt-input" aria-label="Vehicle description" value={value.description} onChange={event=>onChange({...value,description:event.target.value})} /></details></> : <><ChoicePicker label="Asset" value={value.assetId??""} options={assets.map(asset=>({id:asset.id,label:`${asset.rego} ${asset.description}`}))} onChange={id=>{const asset=assets.find(row=>row.id===id);onChange(asset?{assetId:asset.id,rego:asset.rego,description:asset.description}:{assetId:null,rego:"",description:""});}} />{!assets.length?<small>Assets search is not connected yet. Enter manually.</small>:null}</>}</div>;
}
