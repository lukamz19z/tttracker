"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUserRole } from "@/lib/roles";

type Role = "admin" | "editor" | "viewer" | null;

type AppShellProps = {
  title?: string;
  projectId?: string;
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  const [role, setRole] = useState<Role>(null);

  useEffect(() => {
    async function loadRole() {
      const userRole = await getUserRole();
      setRole((userRole as Role) || null);
    }

    void loadRole();
  }, []);

  const isAdmin = role === "admin";

  const navItems = [
    {
      label: "Projects",
      href: "/",
      show: true,
    },
    {
      label: "User Management",
      href: "/admin/users",
      show: isAdmin,
    },
    {
      label: "Safety",
      href: "/safety",
      show: isAdmin,
    },
    {
      label: "Commercial",
      href: "/commercial",
      show: isAdmin,
    },
    {
      label: "Assets",
      href: "/assets",
      show: isAdmin,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white">
          {/* LOGO */}
          <div className="h-16 flex items-center px-6 border-b border-slate-200">
            <Link
              href="/"
              className="text-2xl font-bold tracking-tight text-slate-900"
            >
              TTTracker
            </Link>
          </div>

          {/* NAV */}
          <nav className="flex-1 p-4 space-y-2">
            {navItems
              .filter((item) => item.show)
              .map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-x-hidden">
          {/* TOP BAR */}
          <div className="h-16 border-b border-slate-200 bg-white flex items-center justify-end px-6">
            <form action="/auth/signout" method="post">
              <button className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition">
                Logout
              </button>
            </form>
          </div>

          {/* PAGE CONTENT */}
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}