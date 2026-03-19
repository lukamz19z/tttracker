"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();

  function linkStyle(href: string) {
    return `
      block p-2 rounded-lg transition
      ${
        pathname === href || pathname.startsWith(href + "/")
          ? "bg-slate-200 font-semibold"
          : "hover:bg-slate-100"
      }
    `;
  }

  return (
    <aside className="w-64 bg-white border-r min-h-screen p-4 hidden md:block">
      <nav className="space-y-2">

        <Link className={linkStyle("/")} href="/">
          Projects
        </Link>

        {projectId && (
          <>
            <Link
              className={linkStyle(`/project/${projectId}`)}
              href={`/project/${projectId}`}
            >
              Dashboard
            </Link>

            <Link
              className={linkStyle(`/project/${projectId}/towers`)}
              href={`/project/${projectId}/towers`}
            >
              Towers
            </Link>

            {/* ⭐ NEW WORKPACK LINK */}
            <Link
              className={linkStyle(`/project/${projectId}/workpack`)}
              href={`/project/${projectId}/workpack`}
            >
              Workpack
            </Link>

            <Link
              className={linkStyle(`/project/${projectId}/defects`)}
              href={`/project/${projectId}/defects`}
            >
              Defects
            </Link>

            <Link
              className={linkStyle(`/project/${projectId}/map`)}
              href={`/project/${projectId}/map`}
            >
              Map
            </Link>

            <Link
              className={linkStyle(`/project/${projectId}/dockets`)}
              href={`/project/${projectId}/dockets`}
            >
              Daily Dockets
            </Link>

            <Link
              className={linkStyle("/admin/users")}
              href="/admin/users"
            >
              Admin
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}