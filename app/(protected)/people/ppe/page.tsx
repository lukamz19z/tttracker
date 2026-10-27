"use client";
import Link from "next/link";
import {AppShell} from "@/components/layout/app-shell";
import {PpeRegister} from "@/components/people/ppe-register";
import {GraduationCap,Shirt,Users,UsersRound} from "lucide-react";
export default function PpePage(){return <AppShell><div className="mx-auto max-w-7xl space-y-3"><nav aria-label="People navigation" className="flex gap-1 overflow-x-auto rounded-xl p-1 text-xs font-bold">{[{href:"/people",label:"People",icon:Users},{href:"/people/crews",label:"Crews",icon:UsersRound},{href:"/people/training",label:"Training",icon:GraduationCap},{href:"/people/ppe",label:"PPE Register",icon:Shirt}].map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={href==="/people/ppe"?"page":undefined} className={`inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${href==="/people/ppe"?"bg-slate-900 text-white shadow-sm":"text-slate-500 hover:bg-white hover:text-slate-900"}`}><Icon size={14}/>{label}</Link>)}</nav><PpeRegister/></div></AppShell>;}
