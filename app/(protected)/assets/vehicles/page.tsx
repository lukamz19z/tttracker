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
  if (status === "In Use" || status === "On Hire") return "blue";
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
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const loadVehicles = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("vehicle_assets")
      .select("id, vehicle_id, vehicle_rego, make, model, category, project, crew, status")
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
      "All",
      ...Array.from(new Set(enhancedVehicles.map((v) => clean(v.category))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const projectOptions = useMemo(() => {
    return [
      "All",
      ...Array.from(new Set(enhancedVehicles.map((v) => clean(v.project))))
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const statusOptions = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(enhancedVehicles.map((v) => clean(v.calculated_status))),
      )
        .filter(Boolean)
        .sort(),
    ];
  }, [enhancedVehicles]);

  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();

    return enhancedVehicles.filter((vehicle) => {
      const makeModel = [vehicle.make, vehicle.model]
        .map(clean)
        .filter(Boolean)
        .join(" ");

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
        (categoryFilter === "All" || clean(vehicle.category) === categoryFilter) &&
        (projectFilter === "All" || clean(vehicle.project) === projectFilter) &&
        (statusFilter === "All" || vehicle.calculated_status === statusFilter)
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Total Vehicles" value={stats.total} tone="blue" />
        <MiniStat label="Light Vehicles" value={stats.lightVehicles} tone="emerald" />
        <MiniStat label="Heavy Vehicles" value={stats.heavyVehicles} tone="amber" />
        <MiniStat label="Trailers" value={stats.trailers} tone="rose" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vehicle ID, rego, make, model..."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {categoryOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>

          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {projectOptions.map((option) => (
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
            label: "Vehicle ID",
            render: (vehicle) => clean(vehicle.vehicle_id) || "No ID",
          },
          {
            label: "Rego",
            render: (vehicle) => clean(vehicle.vehicle_rego) || "No rego",
          },
          {
            label: "Make & Model",
            render: (vehicle) => {
              const makeModel = [vehicle.make, vehicle.model]
                .map(clean)
                .filter(Boolean)
                .join(" ");

              return makeModel || "N/A";
            },
          },
          {
            label: "Project",
            render: (vehicle) => clean(vehicle.project) || "Unallocated",
          },
          {
            label: "Status",
            render: (vehicle) => (
              <StatusBadge
                label={vehicle.calculated_status}
                tone={vehicle.tone}
              />
            ),
          },
{
  label: "Actions",
  render: (vehicle) => (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/assets/vehicles/${vehicle.id}`}
        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
      >
        View
      </Link>

      <Link
        href={`/assets/vehicles/${vehicle.id}/edit`}
        className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
      >
        Edit
      </Link>

      <Link
        href={`/assets/vehicles/${vehicle.id}/update`}
        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
      >
        Update Asset
      </Link>
    </div>
  ),
},
]}
renderMobile={(vehicle) => {
          const makeModel = [vehicle.make, vehicle.model]
            .map(clean)
            .filter(Boolean)
            .join(" ");

          return (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">
                    {clean(vehicle.vehicle_id) || "No ID"}
                  </p>
                  <p className="text-sm text-slate-600">
                    {clean(vehicle.vehicle_rego) || "No rego"}
                  </p>
                </div>

                <StatusBadge
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

  <Link
    href={`/assets/vehicles/${vehicle.id}/update`}
    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"
  >
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