"use client";

import {
  Boxes,
  ClipboardCheck,
  FileCheck2,
  RefreshCw,
  Gauge,
  HardHat,
  PackageSearch,
  Settings,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Gauge;
  children?: Array<{ label: string; href: string }>;
};

const NAV: NavItem[] = [
  { label: "Overview", href: "/assets", icon: Gauge },
  { label: "Update Asset", href: "/assets/update", icon: RefreshCw },
  { label: "Fleet Jobs", href: "/assets/fleet-jobs", icon: Wrench },
  { label: "Service Register", href: "/assets/services", icon: FileCheck2 },
  { label: "Plant", href: "/assets/plant", icon: HardHat },
  { label: "Vehicles", href: "/assets/vehicles", icon: Truck },
  {
    label: "Equipment",
    href: "/assets/equipment",
    icon: Boxes,
    children: [
      { label: "Overview", href: "/assets/equipment" },
      { label: "Inventory", href: "/assets/equipment/inventory" },
      { label: "Lifting Gear", href: "/assets/equipment/lifting-gear" },
      { label: "Generators", href: "/assets/equipment/generators" },
      { label: "Ladders", href: "/assets/equipment/ladders" },
      { label: "Torque Wrenches", href: "/assets/equipment/torque-wrenches" },
      { label: "Fall Arrest", href: "/assets/equipment/fall-arrest" },
    ],
  },
  { label: "Prestarts", href: "/assets/prestarts", icon: ClipboardCheck },
  {
    label: "Risk Assessments",
    href: "/assets/risk-assessments",
    icon: ShieldCheck,
  },
  { label: "Compliance", href: "/assets/compliance", icon: PackageSearch },
  {
    label: "Configuration",
    href: "/assets/configuration",
    icon: Settings,
    children: [
      { label: "General", href: "/assets/configuration" },
      {
        label: "Document Types",
        href: "/assets/configuration/document-types",
      },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/assets") return pathname === "/assets";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AssetsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              className="shrink-0 text-lg font-black tracking-tight text-slate-950"
            >
              TTTracker
            </Link>

            <div className="hidden h-7 w-px bg-slate-200 sm:block" />

            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900">
                Assets & Fleet
              </div>
              <div className="hidden truncate text-xs text-slate-500 sm:block">
                Asset lifecycle, servicing, compliance, documents and spend
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/assets/update"
              className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 md:inline-flex"
            >
              Update Asset
            </Link>

            <Link
              href="/assets/services/new"
              className="hidden rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-slate-800 sm:inline-flex"
            >
              BC Service
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Main Menu
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1800px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 lg:block">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Asset Management
            </div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-700">
              Structured service history in TTTracker. Controlled files in SharePoint.
            </div>
          </div>

          <nav className="space-y-1.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${
                      active
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>

                  {item.children && active ? (
                    <div className="ml-5 mt-1.5 space-y-1 border-l border-slate-200 pl-3">
                      {item.children.map((child) => {
                        const childActive = pathname === child.href;

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block rounded-lg px-3 py-2 text-xs font-bold ${
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
                  ) : null}
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${
                      active
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
