"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ShieldX,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";

export default function UnauthorisedPage() {
  return (
    <AppShell>
      <div className="mx-auto flex min-h-[65vh] max-w-3xl items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldX size={28} />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-950">
            Access not available
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Your TTTracker role does not currently include access to this area.
            Access can be changed by an administrator from Users, Roles &
            Permissions.
          </p>

          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <ArrowLeft size={16} />
            Back to TTTracker
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
