"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const topNav = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Assets", href: "/assets" },
  { label: "Admin", href: "/admin" },
];

const assetNav = [
  { label: "Dashboard", href: "/assets" },
  { label: "Fleet Jobs", href: "/assets/fleet-jobs" },
  { label: "Plant", href: "/assets/plant" },
  { label: "Vehicles", href: "/assets/vehicles" },
  {
    label: "Equipment",
    href: "/assets/equipment",
    children: [
      { label: "Overview", href: "/assets/equipment" },
      { label: "Inventory", href: "/assets/equipment/inventory" },
      { label: "Lifting Gear", href: "/assets/equipment/lifting-gear" },
      { label: "Generators", href: "/assets/equipment/generators" },
      { label: "Ladders", href: "/assets/equipment/ladders" },
      {
        label: "Torque Wrenches",
        href: "/assets/equipment/torque-wrenches",
      },
      { label: "Fall Arrest", href: "/assets/equipment/fall-arrest" },
    ],
  },
  { label: "Prestarts", href: "/assets/prestarts" },
  { label: "Inspections", href: "/assets/inspections" },
  {
    label: "Risk Assessments",
    href: "/assets/risk-assessments",
  },
  { label: "Compliance", href: "/assets/compliance" },
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

            <nav className="hidden items-center gap-2 md:flex">
              {topNav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));

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
              Plant, vehicles, equipment, prestarts, inspections, risk
              assessments and Fleet Jobs.
            </p>
          </div>

          <nav className="mt-8 flex h-[calc(100vh-260px)] flex-col overflow-y-auto">
            <div className="space-y-2">
              {assetNav.map((item) => {
                const hasChildren = "children" in item && item.children;

                const active =
                  pathname === item.href ||
                  (item.href !== "/assets" && pathname.startsWith(item.href));

                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${
                        active
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {item.label}
                    </Link>

                    {hasChildren && active && (
                      <div className="mt-2 space-y-1 border-l border-slate-200 pl-3">
                        {item.children.map((child) => {
                          const childActive = pathname === child.href;

                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`block rounded-lg px-3 py-2 text-xs font-medium transition ${
                                childActive
                                  ? "bg-slate-100 text-slate-950"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* PAGE CONTENT */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}