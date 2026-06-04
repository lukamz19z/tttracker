/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, RegisterList, StatusBadge } from "../components";

type Tone = "emerald" | "amber" | "rose" | "blue";

type VehicleAsset = {
  id: string;
  vehicle_rego: string | null;
  assigned_vehicle_id: string | null;
  make: string | null;
  vehicle_type: string | null;
  style: string | null;
  year: string | null;
  last_service: string | null;
  rego_expiry: string | null;
  insurance_expiry: string | null;
  ehub: boolean | null;
  dashcam: boolean | null;
  alert_button: boolean | null;
  owner: string | null;
  vin_number: string | null;
  risk_assessment: string | null;
  fuel_card: boolean | null;
  in_use: boolean | null;
  site_allocation: string | null;
  hired: boolean | null;
  link: string | null;
};

type EnhancedVehicle = VehicleAsset & {
  rego_status: string;
  service_status: string;
  insurance_status: string;
  days_until_rego_expiry: number | null;
  calculated_status: string;
  tone: Tone;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatDate(value: string | null) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryStatus(value: string | null) {
  const days = daysUntil(value);

  if (days === null) return "Missing";
  if (days < 0) return "Expired";
  if (days <= 30) return "Due Soon";

  return "Current";
}

function serviceStatus(value: string | null) {
  if (!value) return "Missing";

  const days = daysUntil(value);

  if (days === null) return "Recorded";
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due Soon";

  return "Current";
}

function getTone(status: string): Tone {
  if (status === "Current" || status === "Available") return "emerald";
  if (status === "Due Soon" || status === "In Use") return "blue";
  if (status === "Overdue" || status === "Expired") return "rose";

  return "amber";
}

function yesNo(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";

  return "N/A";
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function VehiclesPage() {
  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [siteFilter, setSiteFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const loadVehicles = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("vehicle_assets")
      .select("*")
      .order("assigned_vehicle_id", { ascending: true });

    if (error) {
      console.error("Failed to load vehicles:", error.message);
      setVehicles([]);
    } else {
      setVehicles(data ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const enhancedVehicles = useMemo<EnhancedVehicle[]>(() => {
    return vehicles.map((vehicle) => {
      const rego_status = expiryStatus(vehicle.rego_expiry);
      const insurance_status = expiryStatus(vehicle.insurance_expiry);
      const service_status = serviceStatus(vehicle.last_service);
      const days_until_rego_expiry = daysUntil(vehicle.rego_expiry);

      const calculated_status = vehicle.in_use ? "In Use" : "Available";

      const worstStatus = [rego_status, insurance_status, service_status].includes(
        "Expired",
      )
        ? "Expired"
        : [rego_status, insurance_status, service_status].includes("Overdue")
          ? "Overdue"
          : [rego_status, insurance_status, service_status].includes("Due Soon")
            ? "Due Soon"
            : calculated_status;

      return {
        ...vehicle,
        rego_status,
        insurance_status,
        service_status,
        days_until_rego_expiry,
        calculated_status,
        tone: getTone(worstStatus),
      };
    });
  }, [vehicles]);

  const typeOptions = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(enhancedVehicles.map((vehicle) => clean(vehicle.vehicle_type))),
      )
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const siteOptions = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(enhancedVehicles.map((vehicle) => clean(vehicle.site_allocation))),
      )
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const statusOptions = [
    "All",
    "Available",
    "In Use",
    "Due Soon",
    "Expired",
    "Overdue",
    "Missing",
  ];

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedVehicles.filter((vehicle) => {
      const searchable = [
        vehicle.vehicle_rego,
        vehicle.assigned_vehicle_id,
        vehicle.make,
        vehicle.vehicle_type,
        vehicle.style,
        vehicle.year,
        vehicle.owner,
        vehicle.vin_number,
        vehicle.site_allocation,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchable.includes(term);
      const matchesType =
        typeFilter === "All" || clean(vehicle.vehicle_type) === typeFilter;
      const matchesSite =
        siteFilter === "All" || clean(vehicle.site_allocation) === siteFilter;
      const matchesStatus =
        statusFilter === "All" ||
        vehicle.calculated_status === statusFilter ||
        vehicle.rego_status === statusFilter ||
        vehicle.insurance_status === statusFilter ||
        vehicle.service_status === statusFilter;

      return matchesSearch && matchesType && matchesSite && matchesStatus;
    });
  }, [enhancedVehicles, search, typeFilter, siteFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: enhancedVehicles.length,
      inUse: enhancedVehicles.filter((vehicle) => vehicle.in_use).length,
      dueSoon: enhancedVehicles.filter(
        (vehicle) =>
          vehicle.rego_status === "Due Soon" ||
          vehicle.insurance_status === "Due Soon" ||
          vehicle.service_status === "Due Soon",
      ).length,
      expired: enhancedVehicles.filter(
        (vehicle) =>
          vehicle.rego_status === "Expired" ||
          vehicle.insurance_status === "Expired" ||
          vehicle.service_status === "Overdue",
      ).length,
    };
  }, [enhancedVehicles]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Vehicles"
        description="Track light vehicles, heavy vehicles and trailers. This register covers rego, service dates, insurance, site allocation, risk assessment, fuel cards and whether the vehicle is currently in use."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadVehicles()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <Link
              href="/assets/vehicles/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Vehicle
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total Vehicles" value={stats.total} tone="blue" />
        <MiniStat label="In Use" value={stats.inUse} tone="emerald" />
        <MiniStat label="Due Soon" value={stats.dueSoon} tone="amber" />
        <MiniStat label="Expired / Overdue" value={stats.expired} tone="rose" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rego, ID, make, VIN, site..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {typeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {siteOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {statusOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </section>

      <RegisterList
        title="Vehicle Register"
        description={
          loading
            ? "Loading vehicles..."
            : `${filteredVehicles.length} of ${enhancedVehicles.length} vehicles shown`
        }
        items={filteredVehicles}
        getKey={(vehicle) => vehicle.id}
        columns={[
          {
            label: "Vehicle",
            render: (vehicle) => (
              <div>
                <p className="font-semibold text-slate-950">
                  {clean(vehicle.assigned_vehicle_id) || "No ID"}
                </p>
                <p className="text-sm text-slate-600">
                  {clean(vehicle.vehicle_rego) || "No rego"}
                </p>
              </div>
            ),
          },
          { label: "Make", render: (vehicle) => clean(vehicle.make) || "N/A" },
          { label: "Type", render: (vehicle) => clean(vehicle.vehicle_type) || "N/A" },
          { label: "Style", render: (vehicle) => clean(vehicle.style) || "N/A" },
          { label: "Year", render: (vehicle) => clean(vehicle.year) || "N/A" },
          { label: "Last Service", render: (vehicle) => formatDate(vehicle.last_service) },
          { label: "Rego Exp", render: (vehicle) => formatDate(vehicle.rego_expiry) },
          {
            label: "Insurance Exp",
            render: (vehicle) => formatDate(vehicle.insurance_expiry),
          },
          { label: "Owner", render: (vehicle) => clean(vehicle.owner) || "N/A" },
          { label: "VIN Number", render: (vehicle) => clean(vehicle.vin_number) || "N/A" },
          {
            label: "Risk Assessment",
            render: (vehicle) => clean(vehicle.risk_assessment) || "N/A",
          },
          { label: "In Use", render: (vehicle) => yesNo(vehicle.in_use) },
          {
            label: "Site Allocation",
            render: (vehicle) => clean(vehicle.site_allocation) || "Unassigned",
          },
          {
            label: "Rego Status",
            render: (vehicle) => (
              <StatusBadge
                label={vehicle.rego_status}
                tone={getTone(vehicle.rego_status)}
              />
            ),
          },
          {
            label: "Service Status",
            render: (vehicle) => (
              <StatusBadge
                label={vehicle.service_status}
                tone={getTone(vehicle.service_status)}
              />
            ),
          },
          {
            label: "Days Until Rego Expiry",
            render: (vehicle) =>
              vehicle.days_until_rego_expiry === null
                ? "N/A"
                : String(vehicle.days_until_rego_expiry),
          },
          { label: "Hired?", render: (vehicle) => yesNo(vehicle.hired) },
          {
            label: "Link",
            render: (vehicle) =>
              vehicle.link ? (
                <a
                  href={vehicle.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-blue-700 hover:underline"
                >
                  Open
                </a>
              ) : (
                "N/A"
              ),
          },
        ]}
        renderMobile={(vehicle) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">
                  {clean(vehicle.assigned_vehicle_id) || "No ID"}
                </p>
                <p className="text-sm text-slate-600">
                  {clean(vehicle.vehicle_rego) || "No rego"} ·{" "}
                  {clean(vehicle.make) || "No make"}
                </p>
              </div>

              <StatusBadge label={vehicle.calculated_status} tone={vehicle.tone} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Type</p>
                <p className="font-semibold text-slate-800">
                  {clean(vehicle.vehicle_type) || "N/A"}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Site</p>
                <p className="font-semibold text-slate-800">
                  {clean(vehicle.site_allocation) || "Unassigned"}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Rego Exp</p>
                <p className="font-semibold text-slate-800">
                  {formatDate(vehicle.rego_expiry)}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Service</p>
                <p className="font-semibold text-slate-800">
                  {vehicle.service_status}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/assets/vehicles/${vehicle.id}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
              >
                View
              </Link>

              <Link
                href={`/assets/vehicles/${vehicle.id}/edit`}
                className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white"
              >
                Edit
              </Link>
            </div>
          </div>
        )}
      />
    </PageShell>
  );
}