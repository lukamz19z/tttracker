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
    <div className="flex min-h-[calc(100vh-58px)] bg-slate-50">
      <aside className="hidden md:block w-64 border-r border-slate-200 bg-white">
        <nav className="p-4 space-y-2">
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

      <main className="flex-1 overflow-x-hidden p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}