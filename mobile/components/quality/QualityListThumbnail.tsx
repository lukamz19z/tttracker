import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { cachedQualityImageVariant } from "@/lib/api/quality";
import { logMobilePerf } from "@/lib/perf-trace";

export function QualityListThumbnail({ projectId, fileId, label }: { projectId:string;fileId:string|null|undefined;label:string }) {
  const [uri,setUri]=useState("");
  useEffect(()=>{if(!fileId||!projectId)return;let live=true;const started=Date.now();void cachedQualityImageVariant(projectId,fileId,"thumbnail").then(value=>{if(live&&value){setUri(value);logMobilePerf("quality.list-thumbnail-ready",{module:"quality",operation:"quality-list.thumbnail-cache-hit",projectId,durationMs:Date.now()-started,outcome:"cache-hit"});}}).catch(()=>undefined);return()=>{live=false;};},[fileId,label,projectId]);
  return <View style={{width:56,height:56,borderRadius:9,overflow:"hidden",backgroundColor:"#e2e8f0",alignItems:"center",justifyContent:"center"}}>{uri?<Image alt={`${label} thumbnail`} source={{uri}} contentFit="contain" style={{width:"100%",height:"100%"}}/>:<Text style={{color:"#94a3b8",fontSize:9,fontWeight:"700"}}>{fileId?"Photo":"—"}</Text>}</View>;
}
