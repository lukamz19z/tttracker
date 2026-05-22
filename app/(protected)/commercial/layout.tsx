// app/(protected)/commercial/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const topNav = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Assets", href: "/assets" },
  { label: "Commercial", href: "/commercial" },
];

const commercialNav = [
  { label: "Overview", href: "/commercial" },
  { label: "Projects", href: "/commercial" },
  { label: "Dayworks", href: "/commercial/dayworks" },
  { label: "Variations", href: "/commercial/variations" },
  { label: "Claims", href: "/commercial/claims" },
  { label: "Forecasting", href: "/commercial/forecasting" },
];

export default function CommercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-10">
            <Link
              href="/"
              className="text-xl font-bold tracking-tight text-slate-900"
            >
              TTTracker
            </Link>

            <nav className="hidden items-center gap-2 md:flex">
              {topNav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
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
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-64 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
              Commercial
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Commercial
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Revenue, dayworks, variations, claims and commercial forecasting.
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            {commercialNav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/commercial" && pathname.startsWith(item.href));

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

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}