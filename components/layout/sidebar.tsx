"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar({ projectId }: { projectId?: string }) {
  const pathname = usePathname();

  function isActive(route: string) {
    if (!projectId) return false;

    // dashboard
    if (route === "dashboard") {
      return pathname === `/project/${projectId}`;
    }

    // towers (includes tower detail pages)
    if (route === "towers") {
      return pathname.startsWith(`/project/${projectId}/tower`) ||
             pathname.startsWith(`/project/${projectId}/towers`);
    }

    // map
    if (route === "map") {
      return pathname.startsWith(`/project/${projectId}/map`);
    }

    return false;
  }

  function linkStyle(active: boolean) {
    return `
      block p-2 rounded-lg
      ${active ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}
    `;
  }

  return (
    <aside className="w-64 bg-white border-r min-h-screen p-4 hidden md:block">
      <h2 className="text-2xl font-bold mb-6">TTTracker</h2>

      <nav className="space-y-2">

        {/* DASHBOARD */}
        <Link
          className={linkStyle(isActive("dashboard"))}
          href={`/project/${projectId}`}
        >
          Dashboard
        </Link>

        {/* TOWERS */}
        <Link
          className={linkStyle(isActive("towers"))}
          href={`/project/${projectId}/towers`}
        >
          Towers
        </Link>

        {/* MAP */}
        <Link
          className={linkStyle(isActive("map"))}
          href={`/project/${projectId}/map`}
        >
          Map
        </Link>

        {/* ADMIN */}
        <Link
          className={linkStyle(pathname.startsWith("/admin"))}
          href="/admin/users"
        >
          Admin
        </Link>

      </nav>
    </aside>
  );
}