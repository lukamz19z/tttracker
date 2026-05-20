"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Overview", href: "/assets" },
  { label: "Plant", href: "/assets/plant" },
  { label: "Vehicles", href: "/assets/vehicles" },
  { label: "Equipment", href: "/assets/equipment" },
  { label: "Compliance", href: "/assets/compliance" },
  { label: "Prestarts", href: "/assets/prestarts" },
  { label: "Maintenance", href: "/assets/maintenance" },
  { label: "Documents", href: "/assets/documents" },
];

export default function AssetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              TTTracker
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">Assets</h2>
            <p className="mt-1 text-sm text-slate-500">
              Plant, equipment, compliance and prestarts.
            </p>
          </div>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/assets" && pathname.startsWith(item.href));

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