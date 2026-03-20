"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();

function linkStyle(href: string) {
  let isActive = false;

  // Projects root
  if (href === "/") {
    isActive = pathname === "/";
  }

  // Dashboard (EXACT only)
  else if (
    projectId &&
    href === `/project/${projectId}`
  ) {
    isActive = pathname === href;
  }

  // All other project pages allow nested
  else {
    isActive =
      pathname === href ||
      pathname.startsWith(href + "/");
  }

  return `
    block p-2 rounded-lg transition
    ${isActive ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}
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

            <Link
              className={linkStyle(`/project/${projectId}/map`)}
              href={`/project/${projectId}/map`}
            >
              Map
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