"use client";
import Link from "next/link";
import {AppShell} from "@/components/layout/app-shell";
import {PpeRegister} from "@/components/people/ppe-register";
export default function PpePage(){return <AppShell><div className="mx-auto max-w-7xl space-y-4"><nav className="flex gap-4 text-sm text-blue-700"><Link href="/people">People</Link><Link href="/people/crews">Crews</Link><Link href="/people/training">Training</Link><span className="font-bold text-slate-900">PPE Register</span></nav><PpeRegister/></div></AppShell>;}
