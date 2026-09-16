import { useMemo, useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useMaterials } from "@/contexts/MaterialsContext";
import { MaterialCard, MaterialsShell } from "@/components/materials/MaterialsShell";
const c=(v:unknown)=>String(v??"").trim();
export default function Bolts(){const{data}=useMaterials();const[q,setQ]=useState("");const rows=useMemo(()=>{const x=q.trim().toLowerCase();return(data?.bolts??[]).filter(r=>!x||[r.bolt_diameter,r.length,r.dn_sn,r.tower_segment].map(c).join(" ").toLowerCase().includes(x)).slice(0,500)},[data,q]);const tower=new Map((data?.towers??[]).map(t=>[c(t.id),c(t.name)]));return <MaterialsShell title="Bolts" subtitle="Bolt register cached with the project material snapshot."><TextInput style={s.input} placeholder="Diameter, length, DN/SN, segment…" value={q} onChangeText={setQ}/>{rows.map((r,i)=><MaterialCard key={c(r.id)||String(i)} title={[c(r.bolt_diameter),c(r.length)].filter(Boolean).join(" × ")||"Bolt"} subtitle={[c(r.dn_sn),c(r.tower_segment)].filter(Boolean).join(" · ")} meta={`${tower.get(c(r.tower_id))||"Tower"} · Qty ${c(r.qty)||"—"}`}/>)}</MaterialsShell>}
const s=StyleSheet.create({input:{borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",borderRadius:13,padding:13}});
