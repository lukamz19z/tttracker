import Link from "next/link";
import {
  Boxes,
  Cable,
  Construction,
  Gauge,
  HardHat,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const equipmentCategories = [
  {
    title: "Inventory",
    href: "/assets/equipment/inventory",
    description:
      "General tools, consumables, site gear and miscellaneous equipment.",
    icon: Boxes,
    stats: "General equipment",
  },
  {
    title: "Lifting Gear",
    href: "/assets/equipment/lifting-gear",
    description:
      "Slings, shackles, chains, lifting beams, hooks and certified gear.",
    icon: Cable,
    stats: "WLL / test certs",
  },
  {
    title: "Generators",
    href: "/assets/equipment/generators",
    description:
      "Generator register, service tracking, hours and project allocation.",
    icon: Settings,
    stats: "Service / hours",
  },
  {
    title: "Ladders",
    href: "/assets/equipment/ladders",
    description: "Step ladders, extension ladders and inspection records.",
    icon: Construction,
    stats: "Inspection due",
  },
  {
    title: "Torque Wrenches",
    href: "/assets/equipment/torque-wrenches",
    description: "Torque wrench register, calibration dates and certificates.",
    icon: Gauge,
    stats: "Calibration due",
  },
  {
    title: "Fall Arrest",
    href: "/assets/equipment/fall-arrest",
    description:
      "Harnesses, lanyards, SRLs, inertia reels and height safety gear.",
    icon: HardHat,
    stats: "Inspection / expiry",
  },
];

const kpis = [
  {
    label: "Total Equipment",
    value: "—",
    detail: "Across all equipment categories",
  },
  {
    label: "Due Soon",
    value: "—",
    detail: "Inspections, services or calibrations",
  },
  {
    label: "Overdue",
    value: "—",
    detail: "Expired or past due items",
  },
  {
    label: "Out of Service",
    value: "—",
    detail: "Tagged out or unavailable",
  },
];

export default function EquipmentLandingPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
              Asset Manager
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Equipment
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Manage inventory, lifting gear, generators, ladders, torque
              wrenches and fall arrest equipment from one central equipment
              register.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/assets/equipment/inventory"
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Open Inventory
            </Link>

            <Link
              href="/assets/inspections"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              View Inspections
            </Link>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {item.label}
              </p>

              <p className="mt-3 text-3xl font-bold text-slate-950">
                {item.value}
              </p>

              <p className="mt-2 text-sm text-slate-500">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Equipment Registers
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Select a category to open the correct register.
              </p>
            </div>

            <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 sm:block">
              6 categories
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {equipmentCategories.map((category) => {
              const Icon = category.icon;

              return (
                <Link
                  key={category.href}
                  href={category.href}
                  className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 transition group-hover:bg-slate-900 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                      {category.stats}
                    </span>
                  </div>

                  <h3 className="mt-5 text-lg font-bold text-slate-950">
                    {category.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {category.description}
                  </p>

                  <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    Open register
                    <span className="transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <ShieldCheck className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Compliance Focus
                </h2>

                <p className="text-sm text-slate-500">
                  High-risk equipment should be easy to find and track.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Lifting gear
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Track WLL, colour code and test certificates.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Torque wrenches
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Track calibration dates and cert expiry.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Fall arrest
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Track inspections, expiry and retirement dates.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Wrench className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Quick Actions
                </h2>

                <p className="text-sm text-slate-500">
                  Common equipment tasks.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <Link
                href="/assets/equipment/inventory"
                className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Add general inventory item
              </Link>

              <Link
                href="/assets/equipment/lifting-gear"
                className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Check lifting gear register
              </Link>

              <Link
                href="/assets/equipment/torque-wrenches"
                className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Review torque wrench calibration
              </Link>

              <Link
                href="/assets/equipment/fall-arrest"
                className="block rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Review fall arrest inspections
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}