"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Cable,
  Construction,
  Gauge,
  HardHat,
  KeyRound,
  PackageCheck,
  Settings,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { createSupabaseBrowser } from "../../../../lib/supabase";

type GearItem = {
  id: string;
  equipment_type: string | null;
  status: string | null;
  next_inspection_due: string | null;
  tag: string | null;
};

type GeneratorItem = {
  id: string;
  status: string | null;
  last_service_date: string | null;
};

type LadderItem = {
  id: string;
  status: string | null;
  last_internal_inspection: string | null;
};

type TorqueWrenchItem = {
  id: string;
  status: string | null;
  expiry_date: string | null;
};

type PpeStockItem = {
  id: string;
  item_name: string | null;
  current_stock: number | null;
  minimum_stock: number | null;
};

const fallArrestTypes = [
  "Harness",
  "Pole Strap",
  "Cobra",
  "Descender",
  "Lanyard",
  "Rope Grab",
  "Anchor Strap",
  "Rescue Kit",
  "Fall Protection Other",
  "Other",
];

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function isOutOfService(status: string | null) {
  const value = clean(status).toLowerCase();
  return value === "failed" || value === "out of service" || value === "missing";
}

function dateStatus(dateValue: string | null, todayIso: string) {
  if (!dateValue || !todayIso) return "none";

  const today = new Date(`${todayIso}T00:00:00`);
  const date = new Date(`${dateValue}T00:00:00`);

  const diffDays = Math.ceil(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "dueSoon";
  return "current";
}

function lastInspectionStatus(dateValue: string | null, todayIso: string) {
  if (!dateValue || !todayIso) return "none";

  const today = new Date(`${todayIso}T00:00:00`);
  const date = new Date(`${dateValue}T00:00:00`);

  const diffDays = Math.floor(
    (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays > 90) return "overdue";
  if (diffDays > 60) return "dueSoon";
  return "current";
}

function serviceAgeStatus(dateValue: string | null, todayIso: string) {
  if (!dateValue || !todayIso) return "none";

  const today = new Date(`${todayIso}T00:00:00`);
  const date = new Date(`${dateValue}T00:00:00`);

  const diffDays = Math.floor(
    (today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays > 180) return "overdue";
  if (diffDays > 90) return "dueSoon";
  return "current";
}

export default function EquipmentLandingPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [loading, setLoading] = useState(true);

  const [liftingGear, setLiftingGear] = useState<GearItem[]>([]);
  const [generators, setGenerators] = useState<GeneratorItem[]>([]);
  const [ladders, setLadders] = useState<LadderItem[]>([]);
  const [torqueWrenches, setTorqueWrenches] = useState<TorqueWrenchItem[]>([]);
  const [ppeStock, setPpeStock] = useState<PpeStockItem[]>([]);



  const loadData = useCallback(async () => {
    setLoading(true);

    const [
      liftingGearResult,
      generatorsResult,
      laddersResult,
      torqueWrenchesResult,
      ppeStockResult,
    ] = await Promise.all([
      supabase
        .from("equipment_lifting_gear")
        .select("id, equipment_type, status, next_inspection_due, tag"),
      supabase
        .from("equipment_generators")
        .select("id, status, last_service_date"),
      supabase
        .from("equipment_ladders")
        .select("id, status, last_internal_inspection"),
      supabase
        .from("equipment_torque_wrenches")
        .select("id, status, expiry_date"),
      supabase
        .from("inventory_ppe_stock")
        .select("id, item_name, current_stock, minimum_stock"),
    ]);

    setLiftingGear((liftingGearResult.data ?? []) as GearItem[]);
    setGenerators((generatorsResult.data ?? []) as GeneratorItem[]);
    setLadders((laddersResult.data ?? []) as LadderItem[]);
    setTorqueWrenches((torqueWrenchesResult.data ?? []) as TorqueWrenchItem[]);
    setPpeStock((ppeStockResult.data ?? []) as PpeStockItem[]);

    setLoading(false);
  }, [supabase]);

useEffect(() => {
  const timer = window.setTimeout(() => {
    void loadData();
  }, 0);

  return () => window.clearTimeout(timer);
}, [loadData]);

  const fallArrest = useMemo(() => {
    return liftingGear.filter((item) =>
      fallArrestTypes.includes(clean(item.equipment_type)),
    );
  }, [liftingGear]);

  const liftingOnly = useMemo(() => {
    return liftingGear.filter(
      (item) => !fallArrestTypes.includes(clean(item.equipment_type)),
    );
  }, [liftingGear]);

  const equipmentStats = useMemo(() => {
    const liftingOverdue = liftingOnly.filter(
      (item) => dateStatus(item.next_inspection_due, todayIso) === "overdue",
    ).length;

    const liftingDueSoon = liftingOnly.filter(
      (item) => dateStatus(item.next_inspection_due, todayIso) === "dueSoon",
    ).length;

    const fallOverdue = fallArrest.filter(
      (item) => dateStatus(item.next_inspection_due, todayIso) === "overdue",
    ).length;

    const fallDueSoon = fallArrest.filter(
      (item) => dateStatus(item.next_inspection_due, todayIso) === "dueSoon",
    ).length;

    const generatorOverdue = generators.filter(
      (item) => serviceAgeStatus(item.last_service_date, todayIso) === "overdue",
    ).length;

    const generatorDueSoon = generators.filter(
      (item) => serviceAgeStatus(item.last_service_date, todayIso) === "dueSoon",
    ).length;

    const ladderOverdue = ladders.filter(
      (item) =>
        lastInspectionStatus(item.last_internal_inspection, todayIso) ===
        "overdue",
    ).length;

    const ladderDueSoon = ladders.filter(
      (item) =>
        lastInspectionStatus(item.last_internal_inspection, todayIso) ===
        "dueSoon",
    ).length;

    const torqueOverdue = torqueWrenches.filter(
      (item) => dateStatus(item.expiry_date, todayIso) === "overdue",
    ).length;

    const torqueDueSoon = torqueWrenches.filter(
      (item) => dateStatus(item.expiry_date, todayIso) === "dueSoon",
    ).length;

    const ppeLowStock = ppeStock.filter((item) => {
      const current = Number(item.current_stock ?? 0);
      const minimum = Number(item.minimum_stock ?? 0);
      return current < minimum;
    }).length;

    const total =
      liftingOnly.length +
      fallArrest.length +
      generators.length +
      ladders.length +
      torqueWrenches.length +
      ppeStock.length;

    const dueSoon =
      liftingDueSoon +
      fallDueSoon +
      generatorDueSoon +
      ladderDueSoon +
      torqueDueSoon +
      ppeLowStock;

    const overdue =
      liftingOverdue +
      fallOverdue +
      generatorOverdue +
      ladderOverdue +
      torqueOverdue;

    const outOfService =
      liftingGear.filter((item) => isOutOfService(item.status)).length +
      generators.filter((item) => isOutOfService(item.status)).length +
      ladders.filter((item) => isOutOfService(item.status)).length +
      torqueWrenches.filter((item) => isOutOfService(item.status)).length;

    return {
      total,
      dueSoon,
      overdue,
      outOfService,
      liftingOverdue,
      liftingDueSoon,
      fallOverdue,
      fallDueSoon,
      generatorOverdue,
      generatorDueSoon,
      ladderOverdue,
      ladderDueSoon,
      torqueOverdue,
      torqueDueSoon,
      ppeLowStock,
    };
  }, [
    liftingOnly,
    fallArrest,
    generators,
    ladders,
    torqueWrenches,
    ppeStock,
    liftingGear,
    todayIso,
  ]);

  const equipmentCategories = [
    {
      title: "Inventory",
      href: "/assets/equipment/inventory",
      description:
        "PPE stock, first aid kits, snake bite kits and spare keys. Track stocktake, minimums, missing kit contents and reorder needs.",
      icon: Boxes,
      stats: `${ppeStock.length} PPE rows`,
      warning:
        equipmentStats.ppeLowStock > 0
          ? `${equipmentStats.ppeLowStock} below minimum`
          : "Stock controlled",
    },
    {
      title: "Lifting Gear",
      href: "/assets/equipment/lifting-gear",
      description:
        "Slings, shackles, chain gear, lifting eyes and certified lifting equipment. Includes colour tags, inspection dates and bulk tag updates.",
      icon: Cable,
      stats: `${liftingOnly.length} items`,
      warning:
        equipmentStats.liftingOverdue > 0
          ? `${equipmentStats.liftingOverdue} overdue`
          : equipmentStats.liftingDueSoon > 0
            ? `${equipmentStats.liftingDueSoon} due soon`
            : "Current",
    },
    {
      title: "Fall Arrest",
      href: "/assets/equipment/fall-arrest",
      description:
        "Filtered fall-arrest view from the lifting gear register. Harnesses, pole straps, cobras, descenders, lanyards and rescue gear.",
      icon: HardHat,
      stats: `${fallArrest.length} items`,
      warning:
        equipmentStats.fallOverdue > 0
          ? `${equipmentStats.fallOverdue} overdue`
          : equipmentStats.fallDueSoon > 0
            ? `${equipmentStats.fallDueSoon} due soon`
            : "Current",
    },
    {
      title: "Generators",
      href: "/assets/equipment/generators",
      description:
        "Generator asset IDs, crew allocation, status, last service and prestart frequency.",
      icon: Settings,
      stats: `${generators.length} generators`,
      warning:
        equipmentStats.generatorOverdue > 0
          ? `${equipmentStats.generatorOverdue} review service`
          : equipmentStats.generatorDueSoon > 0
            ? `${equipmentStats.generatorDueSoon} service ageing`
            : "Current",
    },
    {
      title: "Ladders",
      href: "/assets/equipment/ladders",
      description:
        "Ladder asset IDs, type, height, crew allocation, status and internal inspection date.",
      icon: Construction,
      stats: `${ladders.length} ladders`,
      warning:
        equipmentStats.ladderOverdue > 0
          ? `${equipmentStats.ladderOverdue} review inspection`
          : equipmentStats.ladderDueSoon > 0
            ? `${equipmentStats.ladderDueSoon} inspection ageing`
            : "Current",
    },
    {
      title: "Torque Wrenches",
      href: "/assets/equipment/torque-wrenches",
      description:
        "Torque wrench register with TW asset numbers, serial numbers, expiry dates and crew allocation.",
      icon: Gauge,
      stats: `${torqueWrenches.length} torque wrenches`,
      warning:
        equipmentStats.torqueOverdue > 0
          ? `${equipmentStats.torqueOverdue} expired`
          : equipmentStats.torqueDueSoon > 0
            ? `${equipmentStats.torqueDueSoon} due soon`
            : "Current",
    },
  ];

  const kpis = [
    {
      label: "Total Registered",
      value: loading ? "…" : String(equipmentStats.total),
      detail: "Across equipment and inventory registers",
    },
    {
      label: "Due Soon / Low Stock",
      value: loading ? "…" : String(equipmentStats.dueSoon),
      detail: "Upcoming inspections, service ageing or stock below minimum",
    },
    {
      label: "Overdue",
      value: loading ? "…" : String(equipmentStats.overdue),
      detail: "Expired, overdue or requiring review",
    },
    {
      label: "Unavailable",
      value: loading ? "…" : String(equipmentStats.outOfService),
      detail: "Failed, missing or out of service items",
    },
  ];

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
              Central equipment hub for inventory, lifting gear, fall arrest,
              generators, ladders and torque wrenches.
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
              href="/assets/equipment/lifting-gear"
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Open Lifting Gear
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
                Open the relevant equipment register. Each register has filters,
                CSV export and print to PDF where required.
              </p>
            </div>

            <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 sm:block">
              6 registers
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {equipmentCategories.map((category) => {
              const Icon = category.icon;
              const hasWarning =
                !["Current", "Stock controlled"].includes(category.warning);

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

                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                        {category.stats}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                          hasWarning
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        }`}
                      >
                        {category.warning}
                      </span>
                    </div>
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
                  High-risk equipment is tracked through inspection dates,
                  status and colour tag updates.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Link
                href="/assets/equipment/lifting-gear"
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm"
              >
                <Cable className="h-5 w-5 text-slate-700" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Lifting Gear
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Bulk inspection, tag changes and printable register.
                </p>
              </Link>

              <Link
                href="/assets/equipment/fall-arrest"
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm"
              >
                <HardHat className="h-5 w-5 text-slate-700" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Fall Arrest
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Pulls from lifting gear so data is not duplicated.
                </p>
              </Link>

              <Link
                href="/assets/equipment/torque-wrenches"
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm"
              >
                <Gauge className="h-5 w-5 text-slate-700" />
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Torque Wrenches
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Track expiry, serial numbers and crew allocation.
                </p>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <PackageCheck className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Inventory Controls
                </h2>

                <p className="text-sm text-slate-500">
                  Stocktake and site consumables.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <Link
                href="/assets/equipment/inventory"
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
              >
                PPE Stock
                <Tags className="h-4 w-4" />
              </Link>

              <Link
                href="/assets/equipment/inventory"
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
              >
                First Aid / Snake Bite Kits
                <PackageCheck className="h-4 w-4" />
              </Link>

              <Link
                href="/assets/equipment/inventory"
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white"
              >
                Spare Keys
                <KeyRound className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}