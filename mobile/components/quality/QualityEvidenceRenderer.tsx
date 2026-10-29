import { useEffect, useRef, useState } from "react";
import { PixelRatio, View, Text } from "react-native";
import { Image } from "expo-image";
import { captureRef } from "react-native-view-shot";
import { registerEvidenceRenderer, type RasterJob } from "@/lib/quality-evidence";
type Active = RasterJob & { resolve: (uri: string) => void; reject: (error: Error) => void };
/** File-backed, bounded native rasterisation. No full image/base64 crosses React state. */
export function QualityEvidenceRenderer() {
 const [job,setJob]=useState<Active|null>(null),target=useRef<View>(null),active=useRef<Active|null>(null),capturing=useRef(false);
 active.current=job;
 useEffect(()=>registerEvidenceRenderer(input=>new Promise((resolve,reject)=>setJob({...input,resolve,reject}))),[]);
 useEffect(()=>{if(!job)return;capturing.current=false;const timer=setTimeout(()=>{if(active.current===job){active.current=null;job.reject(new Error("Evidence rasterisation timed out. Original retained for Retry."));setJob(null);}},20000);return()=>clearTimeout(timer);},[job]);
 useEffect(()=>()=>{active.current?.reject(new Error("Evidence renderer closed. Original retained for Retry."));active.current=null;},[]);
 if(!job)return null;
 const l=job.layout,scale=Math.max(1,PixelRatio.get());
 const fail=(message:string)=>{if(active.current!==job)return;active.current=null;job.reject(new Error(message));setJob(null);};
 const exportImage=()=>{if(capturing.current)return;capturing.current=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(active.current!==job)return;void captureRef(target,{format:"jpg",quality:0.92,result:"tmpfile",width:l.outputWidth,height:l.outputHeight}).then(uri=>{if(active.current!==job)return;active.current=null;job.resolve(uri);setJob(null);}).catch(error=>fail(error instanceof Error?error.message:"Evidence rasterisation failed."));}));};
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",width:1,height:1,overflow:"hidden"}}>
  <View ref={target} collapsable={false} style={{width:l.outputWidth/scale,height:l.outputHeight/scale,backgroundColor:"#222"}}>
   <Image source={{uri:job.source}} allowDownscaling cachePolicy="none" contentFit="contain" style={{position:"absolute",left:0,top:l.imageTop/scale,width:l.imageWidth/scale,height:l.imageHeight/scale}} onLoad={exportImage} onError={()=>fail("Source image could not be decoded. Original retained for Retry.")}/>
   <View style={{position:"absolute",left:l.left/scale,top:l.top/scale,width:l.width/scale,height:l.height/scale,backgroundColor:"rgba(0,0,0,0.65)",borderRadius:6/scale,paddingHorizontal:8/scale,paddingTop:5/scale}}>
    {l.lines.map((line,index)=><Text key={index} allowFontScaling={false} style={{fontSize:l.font/scale,lineHeight:l.lineHeight/scale,color:"white",fontWeight:index?"400":"700"}}>{line}</Text>)}
   </View>
  </View>
 </View>;
}
