"use client";
import Image from "next/image";
import { useState } from "react";
export function PersonAvatar({ organisation, personId, name, documentId, size = 36, portrait = false, decorative = false }: { organisation: string; personId?: string; name: string; documentId?: string | null; size?: number; portrait?: boolean; decorative?: boolean }) {
 const src = documentId && personId ? `/api/people/profile-photo?organisation=${encodeURIComponent(organisation)}&person=${encodeURIComponent(personId)}&image=1&v=${encodeURIComponent(documentId)}` : "";
 const [failed, setFailed] = useState("");
 const initials = name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase() || "?";
 return <span style={{ display:"inline-flex", width:size, height:size, flexShrink:0, borderRadius:portrait?12:"50%", overflow:"hidden", alignItems:"center", justifyContent:"center", background:"#334155", color:"#f8fafc", fontSize:Math.max(11,size/3), fontWeight:600, verticalAlign:"middle" }} aria-hidden={decorative || undefined}>
 {src && failed !== src ? <Image unoptimized src={src} width={size} height={size} style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy" alt={decorative?"":`${name} profile photo`} onError={()=>setFailed(src)} /> : <span aria-label={decorative?undefined:`${name} initials`}>{initials}</span>}
 </span>;
}
