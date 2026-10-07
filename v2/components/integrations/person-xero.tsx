"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
export function PersonXero({organisation,person}:{organisation:string;person:string}){
  const [name,setName]=useState<string|null>(null),[loaded,setLoaded]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/integrations/xero/mappings?organisation=${organisation}&kind=person&person=${person}`,{signal:controller.signal}).then(async r=>{if(!r.ok)return;const data=await r.json();setName(data.rows?.[0]?.display_name??null);setLoaded(true);}).catch(()=>{});return()=>controller.abort();},[organisation,person]);
  return <section><h3>Xero Employee</h3><p>{loaded?(name?`Mapped: ${name}`:"Not mapped"):"Mapping information unavailable"}</p><Link className="tt-button-secondary" href={`/workspace/settings/integrations/xero?organisation=${organisation}`}>Manage Employee Mapping</Link></section>;
}
