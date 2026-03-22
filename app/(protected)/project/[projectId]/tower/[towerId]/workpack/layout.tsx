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

  function tabStyle(path: string) {
    return `px-4 py-2 rounded-lg border ${
      pathname === path
        ? "bg-white font-semibold"
        : "bg-slate-100 hover:bg-slate-200"
    }`;
  }

  return (
    <div className="p-6 space-y-6">

      {/* Workpack Sub Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Link
          className={tabStyle(
            `/project/${projectId}/tower/${towerId}/workpack/safety`
          )}
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>

        <Link
          className={tabStyle(
            `/project/${projectId}/tower/${towerId}/workpack/itc`
          )}
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
        >
          ITCs
        </Link>

        <Link
          className={tabStyle(
            `/project/${projectId}/tower/${towerId}/workpack/permits`
          )}
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
        >
          Permits
        </Link>

        <Link
          className={tabStyle(
            `/project/${projectId}/tower/${towerId}/workpack/lifts`
          )}
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}
        >
          Lift Studies
        </Link>

        <Link
          className={tabStyle(
            `/project/${projectId}/tower/${towerId}/workpack/documents`
          )}
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>

      
      </div>

      {children}
    </div>
  );
}