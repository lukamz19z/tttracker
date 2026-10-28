"use client";
import {useEffect,useRef,type ReactNode} from "react";
import {ppeButton} from "./ppe-register-views";
export function InventoryDialog({title,children,close,busy=false}:{title:string;children:ReactNode;close:()=>void;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();const old=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{dialog?.close();document.body.style.overflow=old;};},[]);
 return <dialog ref={ref} onCancel={event=>{event.preventDefault();if(!busy)close();}} className="ppe-no-print fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40"><header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-5 py-3"><h3 className="font-black">{title}</h3><button type="button" className={ppeButton} onClick={close} disabled={busy} aria-label="Close dialog">Close</button></header><div className="space-y-3 p-5">{children}</div></dialog>;
}
