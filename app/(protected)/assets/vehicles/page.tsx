/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Car, Eye, Pencil, Plus, RefreshCw, Truck, Wrench } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell, RegisterList } from "../components";

type Tone = "emerald" | "amber" | "rose" | "blue" | "teal" | "slate";

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  category: string | null;
  project: string | null;
  crew: string | null;
  status: string | null;
};

type EnhancedVehicle = VehicleAsset & {
  calculated_status: string;
  tone: Tone;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function getTone(status: string): Tone {
  if (status === "Available" || status === "Active") return "emerald";
  if (status === "In Use" || status === "On Hire") return "teal";
  if (
    status === "Off Hire" ||
    status === "Inactive" ||
    status === "Retired" ||
    status === "Superseded" ||
    status === "Not Hired"
  ) {
    return "rose";
  }

  return "amber";
}

function getMakeModel(vehicle: VehicleAsset) {
  return [vehicle.make, vehicle.model].map(clean).filter(Boolean).join(" ");
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "teal"
        ? "border-teal-200 bg-teal-50 text-teal-700"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : tone === "blue"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold ${classes}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${classes}`}>
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-white/70 p-3 shadow-sm">{icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-75">
            {label}
          </p>
          <p className="mt-1 text-3xl font-black">{value}</p>
          <p className="text-sm font-medium opacity-80">{detail}</p>
        </div>
      </div>
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
const [categoryFilter, setCategoryFilter] = useState("All Categories");
const [projectFilter, setProjectFilter] = useState("All Projects");
const [statusFilter, setStatusFilter] = useState("All Statuses");

  const loadVehicles = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("vehicle_assets")
      .select(
        "id, vehicle_id, vehicle_rego, make, model, category, project, crew, status",
      )
      .order("vehicle_id", { ascending: true });

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
      const calculated_status = clean(vehicle.status) || "Available";

      return {
        ...vehicle,
        calculated_status,
        tone: getTone(calculated_status),
      };
    });
  }, [vehicles]);

  const categoryOptions = useMemo(() => {
    return [
      "All Categories",
      ...Array.from(new Set(enhancedVehicles.map((v) => clean(v.category))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const projectOptions = useMemo(() => {
    return [
      "All Projects",
      ...Array.from(new Set(enhancedVehicles.map((v) => clean(v.project))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const statusOptions = useMemo(() => {
    return [
      "All Statuses",
      ...Array.from(new Set(enhancedVehicles.map((v) => clean(v.calculated_status))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedVehicles.filter((vehicle) => {
      const makeModel = getMakeModel(vehicle);

      const searchable = [
        vehicle.vehicle_id,
        vehicle.vehicle_rego,
        vehicle.make,
        vehicle.model,
        makeModel,
        vehicle.category,
        vehicle.project,
        vehicle.crew,
        vehicle.calculated_status,
      ]
        .join(" ")
        .toLowerCase();

return (
  searchable.includes(term) &&
  (categoryFilter === "All Categories" ||
    clean(vehicle.category) === categoryFilter) &&
  (projectFilter === "All Projects" ||
    clean(vehicle.project) === projectFilter) &&
  (statusFilter === "All Statuses" ||
    vehicle.calculated_status === statusFilter)
);
    });
  }, [enhancedVehicles, search, categoryFilter, projectFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: enhancedVehicles.length,
      lightVehicles: enhancedVehicles.filter(
        (vehicle) => clean(vehicle.category) === "Light Vehicle",
      ).length,
      heavyVehicles: enhancedVehicles.filter(
        (vehicle) => clean(vehicle.category) === "Heavy Vehicle",
      ).length,
      trailers: enhancedVehicles.filter(
        (vehicle) => clean(vehicle.category) === "Trailer",
      ).length,
    };
  }, [enhancedVehicles]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Vehicles"
        description="Track light vehicles, heavy vehicles and trailers. Keep the register simple here, then open the view page for service, insurance, documents and compliance details."
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Vehicles"
          value={stats.total}
          detail="All registered vehicles"
          tone="blue"
          icon={<Car size={22} />}
        />
        <StatCard
          label="Light Vehicles"
          value={stats.lightVehicles}
          detail="Light vehicles"
          tone="emerald"
          icon={<Car size={22} />}
        />
        <StatCard
          label="Heavy Vehicles"
          value={stats.heavyVehicles}
          detail="Heavy vehicles"
          tone="amber"
          icon={<Truck size={22} />}
        />
        <StatCard
          label="Trailers"
          value={stats.trailers}
          detail="Trailers"
          tone="rose"
          icon={<Truck size={22} />}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vehicle ID, rego, make, model..."
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            {categoryOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          >
            {projectOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
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
    label: "Vehicle ID",
    render: (vehicle) => (
      <div className="flex items-center gap-3">
        <div className="hidden rounded-xl bg-slate-100 p-2 text-slate-600 sm:flex">
          <Car size={16} />
        </div>
        <span className="font-bold text-slate-950">
          {clean(vehicle.vehicle_id) || "No ID"}
        </span>
      </div>
    ),
  },
  {
    label: "Rego",
    render: (vehicle) => clean(vehicle.vehicle_rego) || "No rego",
  },
  {
    label: "Make & Model",
    render: (vehicle) => getMakeModel(vehicle) || "N/A",
  },
  {
    label: "Allocation",
    render: (vehicle) => (
      <div>
        <p className="font-semibold text-slate-950">
          {clean(vehicle.project) || "Unallocated project"}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {clean(vehicle.crew) || "Unallocated crew"}
        </p>
      </div>
    ),
  },
  {
    label: "Status",
    render: (vehicle) => (
      <StatusPill label={vehicle.calculated_status} tone={vehicle.tone} />
    ),
  },
{
  label: "Actions",
  className: "whitespace-nowrap w-px",
  render: (vehicle) => (
      <div className="flex w-max items-center gap-2">
        <Link
          href={`/assets/vehicles/${vehicle.id}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Eye size={14} />
          View
        </Link>

        <Link
          href={`/assets/vehicles/${vehicle.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
        >
          <Pencil size={14} />
          Edit
        </Link>

        <Link
          href={`/assets/vehicles/${vehicle.id}/update`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 shadow-sm hover:bg-orange-100"
        >
          <Wrench size={14} />
          Update Asset
        </Link>
      </div>
    ),
  },
]}
        renderMobile={(vehicle) => {
          const makeModel = getMakeModel(vehicle);

          return (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                    <Car size={16} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-950">
                      {clean(vehicle.vehicle_id) || "No ID"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {clean(vehicle.vehicle_rego) || "No rego"}
                    </p>
                  </div>
                </div>

                <StatusPill
                  label={vehicle.calculated_status}
                  tone={vehicle.tone}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Make & Model
                  </p>
                  <p className="font-semibold text-slate-800">
                    {makeModel || "N/A"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Category
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(vehicle.category) || "N/A"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Project
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(vehicle.project) || "Unallocated"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(vehicle.crew) || "Unallocated"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/assets/vehicles/${vehicle.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  <Eye size={14} />
                  View
                </Link>

                <Link
                  href={`/assets/vehicles/${vehicle.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                >
                  <Pencil size={14} />
                  Edit
                </Link>

                <Link
                  href={`/assets/vehicles/${vehicle.id}/update`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700"
                >
                  <Wrench size={14} />
                  Update Asset
                </Link>
              </div>
            </div>
          );
        }}
      />
    </PageShell>
  );
}