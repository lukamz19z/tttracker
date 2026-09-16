import { useMemo, useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { useMaterials } from "@/contexts/MaterialsContext";
import { MaterialCard, MaterialsShell } from "@/components/materials/MaterialsShell";
const c=(v:unknown)=>String(v??"").trim();
export default function Members(){const{data}=useMaterials();const[q,setQ]=useState("");const rows=useMemo(()=>{const x=q.trim().toLowerCase();return(data?.members??[]).filter(r=>!x||[r.mark_no,r.bundle_reference,r.drawing_number,r.section,r.tower_segment].map(c).join(" ").toLowerCase().includes(x)).slice(0,500)},[data,q]);const tower=new Map((data?.towers??[]).map(t=>[c(t.id),c(t.name)]));return <MaterialsShell title="Members" subtitle="Member register cached by project for offline lookup."><TextInput style={s.input} placeholder="Mark no, bundle, drawing, segment…" value={q} onChangeText={setQ}/>{rows.map((r,i)=><MaterialCard key={c(r.id)||String(i)} title={c(r.mark_no)||"Member"} subtitle={[`Bundle ${c(r.bundle_reference)}`,c(r.drawing_number),c(r.tower_segment)].filter(Boolean).join(" · ")} meta={`${tower.get(c(r.tower_id))||"Tower"} · Qty/Tower ${c(r.qty_per_tower)||"—"}`}/>)}</MaterialsShell>}
const s=StyleSheet.create({input:{borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",borderRadius:13,padding:13}});
