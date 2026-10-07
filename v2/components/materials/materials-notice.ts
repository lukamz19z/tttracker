"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export type MaterialsNoticeKind="success"|"error";
export type SetMaterialsMessage=(value:string|null,kind?:MaterialsNoticeKind,scope?:string)=>void;
export const MATERIALS_SUCCESS_DURATION=4500;
export function useMaterialsNotice(context:string) {
 const sequence=useRef(0);
 const [notice,setNotice]=useState<{id:number;text:string;kind:MaterialsNoticeKind;context:string}|null>(null);
 const setMessage=useCallback<SetMaterialsMessage>((text,kind="error",scope=context)=>{setNotice(text?{id:++sequence.current,text,kind,context:scope}:null);},[context]);
 useEffect(()=>{
  if(!notice||notice.kind!=="success")return;
  const timer=setTimeout(()=>setNotice(current=>current?.id===notice.id?null:current),MATERIALS_SUCCESS_DURATION);
  return ()=>clearTimeout(timer);
 },[notice]);
 const visible=notice?.context===context?notice:null;
 return {message:visible?.text??null,kind:visible?.kind??"error",setMessage};
}
