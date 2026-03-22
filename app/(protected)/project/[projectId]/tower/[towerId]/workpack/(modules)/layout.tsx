"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export default function WorkpackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  function tab(path: string, label: string) {
    return (
      <Link
        href={path}
        className={`px-4 py-2 border rounded-t-lg ${
          pathname === path
            ? "bg-white font-semibold"
            : "bg-slate-100 hover:bg-slate-200"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="space-y-6">

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b">
        {tab(`/project/${projectId}/tower/${towerId}/workpack/safety`, "Safety")}
        {tab(`/project/${projectId}/tower/${towerId}/workpack/itc`, "ITCs")}
        {tab(`/project/${projectId}/tower/${towerId}/workpack/permits`, "Permits")}
        {tab(`/project/${projectId}/tower/${towerId}/workpack/lifts`, "Lift Studies")}
        {tab(`/project/${projectId}/tower/${towerId}/workpack/documents`, "Documents")}
      </div>

      {children}
    </div>
  );
}