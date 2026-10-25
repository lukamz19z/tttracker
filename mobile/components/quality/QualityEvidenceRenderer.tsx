import { useEffect, useRef, useState } from "react";
import { PixelRatio, Platform, View } from "react-native";
import Svg, { Image, Rect, Text } from "react-native-svg";
import { registerEvidenceRenderer, type RasterJob } from "@/lib/quality-evidence";
type Active = RasterJob & { resolve: (png: string) => void; reject: (error: Error) => void };
/** Native SVG export rasterises photo and metadata together; never a preview-only overlay.
 * A nonzero-alpha single-pixel host must draw so Android starts image decoding;
 * a fully transparent/unrendered SVG can wait forever for onLoad/toDataURL.
 */
export function QualityEvidenceRenderer() {
  const [job,setJob] = useState<Active | null>(null);
  const target = useRef<Svg>(null);
  const active = useRef<Active | null>(null);
  active.current = job;
  useEffect(() => registerEvidenceRenderer(input => new Promise((resolve,reject) => setJob({...input,resolve,reject}))),[]);
  useEffect(() => {
    if (!job) return;
    const timer = setTimeout(() => { job.reject(new Error("Evidence image could not be rendered. Please retry.")); setJob(null); },15_000);
    return () => clearTimeout(timer);
  },[job]);
  if (!job) return null;
  const l = job.layout;
  // iOS UIGraphicsImageRenderer uses display scale; Android takes bitmap pixels.
  const scale = Platform.OS === "ios" ? PixelRatio.get() : 1;
  const exportImage = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (active.current !== job) return;
    try { target.current?.toDataURL(png => { if (active.current !== job) return; job.resolve(png); setJob(null); },{width:Math.max(1,Math.round(l.outputWidth/scale)),height:Math.max(1,Math.round(l.outputHeight/scale))}); }
    catch(error) { job.reject(error instanceof Error ? error : new Error("Evidence export failed.")); setJob(null); }
  }));
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",width:1,height:1,opacity:0.05}}>
    <Svg key={job.source.slice(-30)+JSON.stringify(l)} ref={target} width={1} height={1} viewBox={`0 0 ${l.outputWidth} ${l.outputHeight}`}>
      <Rect width={l.outputWidth} height={l.outputHeight} fill="#222222" />
      <Image href={job.source} x={0} y={l.imageTop} width={l.imageWidth} height={l.imageHeight} preserveAspectRatio="xMidYMid meet" onLoad={exportImage}/>
      <Rect x={l.left} y={l.top} width={l.width} height={l.height} rx={6} fill="black" fillOpacity={0.65}/>
      {l.lines.map((line,index)=><Text key={index} x={l.left+8} y={l.top+(index+1)*l.lineHeight} fontSize={l.font} fontFamily="sans-serif" fontWeight={index ? "normal" : "bold"} fill="white">{line}</Text>)}
    </Svg>
  </View>;
}
