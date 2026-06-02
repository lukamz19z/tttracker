"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const topNav = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Assets", href: "/assets" },
];

const assetNav = [
  { label: "Dashboard", href: "/assets" },
  { label: "Fleet Jobs", href: "/assets/maintenance" },
  { label: "Plant", href: "/assets/plant" },
  { label: "Vehicles", href: "/assets/vehicles" },
  { label: "Equipment", href: "/assets/equipment" },
  { label: "Prestarts", href: "/assets/prestarts" },
  { label: "Compliance", href: "/assets/compliance" },
  { label: "Documents", href: "/assets/documents" },
];

export default function AssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100">

      {/* TOPBAR */}

      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-6">

          <div className="flex items-center gap-10">

            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-slate-900"
            >
              TTTracker
            </Link>

            <nav className="hidden md:flex items-center gap-2">

              {topNav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" &&
                    pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                  className={`px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Settings
            </Link>
          </div>

        </div>
      </header>

      {/* CONTENT */}

      <div className="flex">

        {/* SIDEBAR */}

        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-64 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">

          <div>

            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
              Asset Manager
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Fleet Assets
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Plant, vehicles, equipment, prestarts and Fleet Jobs.
            </p>

          </div>

          <nav className="mt-8 space-y-2">

            {assetNav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/assets" &&
                  pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

        </aside>

        {/* PAGE CONTENT */}

        <main className="min-w-0 flex-1">
          {children}
        </main>

      </div>
    </div>
  );
}
