/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  Eye,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
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

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type ProjectOption = {
  id?: string;
  name: string | null;
};

type VehiclePrestart = {
  id: string;
  vehicle_asset_id: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  kilometres: number | null;
  project: string | null;
  crew: string | null;
  inspected_by_name: string | null;
  checklist: Record<string, string> | null;
  overall_condition: string | null;
  comments: string | null;
  severity: string | null;
  result: string | null;
  fleet_job_id: string | null;
  created_at: string | null;
};

const checklistItems = [
  "Tyres",
  "Park lights",
  "Head lights",
  "Reverse lights",
  "Reverse alarm",
  "Beacon lights",
  "Indicators",
  "Brake lights",
  "Interior lights",
  "Steering",
  "Foot brake",
  "Doors",
  "Windows",
  "Mirrors",
  "Reverse camera",
  "Seats and seat belts",
  "Wipers",
  "Horn",
  "Battery",
  "Engine fluids",
  "Fire extinguisher",
  "First aid kit",
  "Wheel chocks",
  "Spare wheel",
  "IVMS working",
  "UHF radio working",
];

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function checklistKey(label: string) {
  return label.toLowerCase().replaceAll(" ", "_").replaceAll("/", "_");
}

function defaultChecklist() {
  return checklistItems.reduce<Record<string, string>>((acc, item) => {
    acc[checklistKey(item)] = "yes";
    return acc;
  }, {});
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function getMakeModel(vehicle: VehicleAsset) {
  return [vehicle.make, vehicle.model].map(clean).filter(Boolean).join(" ");
}

function getVehicleLabel(vehicle: VehicleAsset) {
  return [
    clean(vehicle.vehicle_id) || "No ID",
    clean(vehicle.vehicle_rego) || "No rego",
    getMakeModel(vehicle),
  ]
    .filter(Boolean)
    .join(" · ");
}

function getPrestartAssetLabel(prestart: VehiclePrestart) {
  return [clean(prestart.asset_label), clean(prestart.vehicle_rego)]
    .filter(Boolean)
    .join(" · ");
}

function formatDate(value: string | null) {
  if (!value) return "No date";

  return new Date(value).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysSince(value: string | null) {
  if (!value) return null;

  const date = new Date(value).getTime();

  if (Number.isNaN(date)) return null;

  return Math.floor((Date.now() - date) / (1000 * 60 * 60 * 24));
}

function severityLabel(severity: string | null) {
  if (severity === "none") return "No Issues";
  if (severity === "minor") return "Minor";
  if (severity === "moderate") return "Moderate";
  if (severity === "major") return "Major";
  if (severity === "do_not_use") return "Do Not Use";
  return "Unknown";
}

function severityTone(severity: string | null): Tone {
  if (severity === "none") return "emerald";
  if (severity === "minor") return "blue";
  if (severity === "moderate") return "amber";
  if (severity === "major" || severity === "do_not_use") return "rose";
  return "slate";
}

function severityToPriority(severity: string) {
  if (severity === "minor") return "Low";
  if (severity === "moderate") return "Medium";
  if (severity === "major") return "High";
  if (severity === "do_not_use") return "Critical";
  return "Low";
}

function severityToResult(severity: string) {
  if (severity === "none") return "Passed";
  if (severity === "do_not_use") return "Do Not Use";
  return "Issue Raised";
}

function crewLabel(crew: Crew) {
  return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
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

function ChecklistButton({
  active,
  children,
  tone,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  tone: "yes" | "no" | "na";
  onClick: () => void;
}) {
  const activeClasses =
    tone === "yes"
      ? "border-emerald-500 bg-emerald-600 text-white"
      : tone === "no"
        ? "border-rose-500 bg-rose-600 text-white"
        : "border-slate-500 bg-slate-700 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md border px-2 text-[11px] font-black leading-none transition ${
        active
          ? activeClasses
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SearchPicker<T>({
  label,
  placeholder,
  value,
  search,
  setSearch,
  items,
  getKey,
  getLabel,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  search: string;
  setSearch: (value: string) => void;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);

  const displayValue = open ? search : value || search;

  const filteredItems = items
    .filter((item) =>
      getLabel(item).toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 10);

  return (
    <div className="relative grid gap-2 text-sm font-bold text-slate-700">
      {label}

      <input
        value={displayValue}
        onFocus={() => {
          setOpen(true);
          setSearch(value);
        }}
        onChange={(event) => {
          setOpen(true);
          setSearch(event.target.value);
        }}
        placeholder={placeholder}
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
      />

      {open ? (
        <div className="absolute left-0 right-0 top-[76px] z-40 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <button
                key={getKey(item)}
                type="button"
                onClick={() => {
                  onSelect(item);
                  setSearch(getLabel(item));
                  setOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {getLabel(item)}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm font-semibold text-slate-400">
              No matches found.
            </div>
          )}
        </div>
      ) : null}
    </div>
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

export default function VehiclePrestartsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [prestarts, setPrestarts] = useState<VehiclePrestart[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(true);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All Severities");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [inspectorFilter, setInspectorFilter] = useState("All Inspectors");

  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [selectedEmployeeName, setSelectedEmployeeName] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [selectedProject, setSelectedProject] = useState("");
  const [selectedCrew, setSelectedCrew] = useState("");
  const [checklistValues, setChecklistValues] = useState<Record<string, string>>(
    defaultChecklist,
  );

  const selectedVehicle = vehicles.find(
    (vehicle) => vehicle.id === selectedVehicleId,
  );

  const loadData = useCallback(async () => {
    setLoading(true);

    const vehiclesResult = await supabase
      .from("vehicle_assets")
      .select(
        "id, vehicle_id, vehicle_rego, make, model, category, project, crew, status",
      )
      .order("vehicle_id", { ascending: true });

    const prestartsResult = await supabase
      .from("vehicle_prestarts")
      .select("*")
      .order("created_at", { ascending: false });

    const employeesResult = await supabase
      .from("employees")
      .select("*")
      .order("full_name", { ascending: true });

    const projectsResult = await supabase
      .from("projects")
      .select("id, name")
      .order("name", { ascending: true });

    const crewsResult = await supabase
      .from("crews")
      .select("id, crew_number, crew_name")
      .order("crew_number", { ascending: true });

    if (vehiclesResult.error) {
      console.error("Failed to load vehicles:", vehiclesResult.error.message);
      setVehicles([]);
    } else {
      setVehicles((vehiclesResult.data ?? []) as VehicleAsset[]);
    }

    if (prestartsResult.error) {
      console.error("Failed to load prestarts:", prestartsResult.error.message);
      setPrestarts([]);
    } else {
      setPrestarts((prestartsResult.data ?? []) as VehiclePrestart[]);
    }

    if (employeesResult.error) {
      console.error("Failed to load employees:", employeesResult.error.message);
      setEmployees([]);
    } else {
      setEmployees(
        ((employeesResult.data ?? []) as Employee[]).filter(
          (employee) =>
            employee.active !== false && clean(employee.full_name).length > 0,
        ),
      );
    }

    setProjects(projectsResult.error ? [] : (projectsResult.data ?? []));
    setCrews(crewsResult.error ? [] : ((crewsResult.data ?? []) as Crew[]));

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const projectOptions = useMemo(() => {
    const values = [
      ...projects.map((project) => clean(project.name)),
      ...vehicles.map((vehicle) => clean(vehicle.project)),
      ...prestarts.map((prestart) => clean(prestart.project)),
    ].filter(Boolean);

    return ["All Projects", ...Array.from(new Set(values)).sort()];
  }, [projects, vehicles, prestarts]);

  const crewOptions = useMemo(() => {
    const crewLabels =
      crews.length > 0
        ? crews.map((crew) => crewLabel(crew))
        : [
            ...vehicles.map((vehicle) => clean(vehicle.crew)),
            ...prestarts.map((prestart) => clean(prestart.crew)),
          ];

    return [
      "All Crews",
      ...Array.from(new Set(crewLabels.filter(Boolean))).sort(),
    ];
  }, [crews, vehicles, prestarts]);

  const inspectorOptions = useMemo(() => {
    return [
      "All Inspectors",
      ...Array.from(
        new Set(
          [
            ...employees.map((employee) => clean(employee.full_name)),
            ...prestarts.map((prestart) => clean(prestart.inspected_by_name)),
          ].filter(Boolean),
        ),
      ).sort(),
    ];
  }, [employees, prestarts]);

  function matchCrewOption(vehicleCrew: string | null) {
    const value = clean(vehicleCrew);

    if (!value) return "";

    const exact = crewOptions.find((option) => option === value);
    if (exact) return exact;

    const byNumber = crews.find((crew) => crew.crew_number === value);
    if (byNumber) return crewLabel(byNumber);

    return value;
  }

  function openForm() {
    setSelectedVehicleId("");
    setVehicleSearch("");
    setSelectedEmployeeName("");
    setEmployeeSearch("");
    setSelectedProject("");
    setSelectedCrew("");
    setChecklistValues(defaultChecklist());
    setShowForm(true);
  }

  function handleVehicleChange(vehicleId: string) {
    setSelectedVehicleId(vehicleId);

    const vehicle = vehicles.find((item) => item.id === vehicleId);

    setSelectedProject(clean(vehicle?.project));
    setSelectedCrew(matchCrewOption(vehicle?.crew ?? null));
  }

  const latestByVehicle = useMemo(() => {
    const map = new Map<string, VehiclePrestart>();

    prestarts.forEach((prestart) => {
      const vehicleId = clean(prestart.vehicle_asset_id);
      if (!vehicleId) return;

      const existing = map.get(vehicleId);
      const currentTime = new Date(prestart.created_at ?? "").getTime();
      const existingTime = existing
        ? new Date(existing.created_at ?? "").getTime()
        : 0;

      if (!existing || currentTime > existingTime) {
        map.set(vehicleId, prestart);
      }
    });

    return map;
  }, [prestarts]);

  const overdue7Days = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const latest = latestByVehicle.get(vehicle.id);
      const days = latest ? daysSince(latest.created_at) : null;
      return days === null || days >= 7;
    });
  }, [vehicles, latestByVehicle]);

  const overdue21Days = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const latest = latestByVehicle.get(vehicle.id);
      const days = latest ? daysSince(latest.created_at) : null;
      return days === null || days >= 21;
    });
  }, [vehicles, latestByVehicle]);

  const submittedThisWeek = useMemo(() => {
    return prestarts.filter((prestart) => {
      const days = daysSince(prestart.created_at);
      return days !== null && days <= 7;
    }).length;
  }, [prestarts]);

  const vehiclesCheckedThisWeek = useMemo(() => {
    return new Set(
      prestarts
        .filter((prestart) => {
          const days = daysSince(prestart.created_at);
          return days !== null && days <= 7;
        })
        .map((prestart) => clean(prestart.vehicle_asset_id))
        .filter(Boolean),
    ).size;
  }, [prestarts]);

  const issuesRaised = useMemo(() => {
    return prestarts.filter((prestart) => clean(prestart.severity) !== "none")
      .length;
  }, [prestarts]);

  const filteredPrestarts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return prestarts.filter((prestart) => {
      const searchable = [
        prestart.asset_label,
        prestart.vehicle_rego,
        prestart.inspected_by_name,
        prestart.project,
        prestart.crew,
        prestart.result,
        prestart.severity,
        prestart.comments,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (severityFilter === "All Severities" ||
          severityLabel(prestart.severity) === severityFilter) &&
        (projectFilter === "All Projects" ||
          clean(prestart.project) === projectFilter) &&
        (crewFilter === "All Crews" || clean(prestart.crew) === crewFilter) &&
        (inspectorFilter === "All Inspectors" ||
          clean(prestart.inspected_by_name) === inspectorFilter)
      );
    });
  }, [
    prestarts,
    search,
    severityFilter,
    projectFilter,
    crewFilter,
    inspectorFilter,
  ]);

  async function handleCreatePrestart(formData: FormData) {
    setSaving(true);

    const vehicle = vehicles.find(
      (item) => item.id === clean(formData.get("vehicle_asset_id") as string),
    );

    if (!vehicle) {
      alert("Please select a vehicle.");
      setSaving(false);
      return;
    }

    if (!selectedEmployeeName) {
      alert("Please select who inspected the vehicle.");
      setSaving(false);
      return;
    }

    const severity = clean(formData.get("severity") as string) || "none";
    const comments = clean(formData.get("comments") as string);

    if (severity !== "none" && !comments) {
      alert("Please enter defect details/comments when raising an issue.");
      setSaving(false);
      return;
    }

    const assetLabel = [
      clean(vehicle.vehicle_id) || "Vehicle",
      getMakeModel(vehicle),
    ]
      .filter(Boolean)
      .join(" ");

    const insertPayload = {
      vehicle_asset_id: vehicle.id,
      asset_label: assetLabel,
      vehicle_rego: clean(vehicle.vehicle_rego),
      kilometres: Number(formData.get("kilometres") || 0),
      project: selectedProject || clean(vehicle.project),
      crew: selectedCrew || matchCrewOption(vehicle.crew),
      inspected_by_name: selectedEmployeeName,
      checklist: checklistValues,
      overall_condition: clean(formData.get("overall_condition") as string),
      comments,
      severity,
      result: severityToResult(severity),
    };

    const { data: newPrestart, error } = await supabase
      .from("vehicle_prestarts")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      console.error("Failed to save prestart:", error.message);
      alert(`Failed to save prestart: ${error.message}`);
      setSaving(false);
      return;
    }

    if (newPrestart && severity !== "none") {
      const { data: fleetJob, error: fleetJobError } = await supabase
        .from("fleet_jobs")
        .insert({
          source_type: "vehicle_prestart",
          source_id: newPrestart.id,
          vehicle_asset_id: vehicle.id,
          asset_label: assetLabel,
          title: `${severityLabel(severity)} issue - ${assetLabel}`,
          description: comments || "Issue raised from vehicle prestart.",
          priority: severityToPriority(severity),
          status: "Open",
        })
        .select("id")
        .single();

      if (!fleetJobError && fleetJob?.id) {
        await supabase
          .from("vehicle_prestarts")
          .update({ fleet_job_id: fleetJob.id })
          .eq("id", newPrestart.id);
      }

      if (fleetJobError) {
        console.warn(
          "Prestart saved, but Fleet Job was not created:",
          fleetJobError.message,
        );
      }
    }

    setShowForm(false);
    setSelectedVehicleId("");
    setVehicleSearch("");
    setSelectedEmployeeName("");
    setEmployeeSearch("");
    setSelectedProject("");
    setSelectedCrew("");
    setChecklistValues(defaultChecklist());
    await loadData();
    setSaving(false);
  }

  function exportFilteredPrestarts() {
    const headers = [
      "Date",
      "Vehicle",
      "Rego",
      "Inspected By",
      "Kilometres",
      "Project",
      "Crew",
      "Result",
      "Severity",
      "Fleet Job",
      "Comments",
    ];

    const rows = filteredPrestarts.map((prestart) => [
      formatDate(prestart.created_at),
      clean(prestart.asset_label),
      clean(prestart.vehicle_rego),
      clean(prestart.inspected_by_name),
      clean(prestart.kilometres),
      clean(prestart.project),
      clean(prestart.crew),
      clean(prestart.result),
      severityLabel(prestart.severity),
      clean(prestart.fleet_job_id),
      clean(prestart.comments),
    ]);

    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `vehicle-prestarts-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Vehicle Checks"
        title="Vehicle Prestarts"
        description="Submit, review and track vehicle prestarts. Issues raised here create Fleet Jobs based on severity."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={exportFilteredPrestarts}
              disabled={filteredPrestarts.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={openForm}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Add Prestart
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Submitted"
          value={submittedThisWeek}
          detail="Submitted in last 7 days"
          tone="emerald"
          icon={<ClipboardCheck size={22} />}
        />

        <StatCard
          label="Vehicles Checked"
          value={vehiclesCheckedThisWeek}
          detail="Unique vehicles this week"
          tone="blue"
          icon={<Car size={22} />}
        />

        <StatCard
          label="Issues Raised"
          value={issuesRaised}
          detail="Minor or higher issues"
          tone="amber"
          icon={<AlertTriangle size={22} />}
        />

        <StatCard
          label="Overdue"
          value={overdue7Days.length}
          detail="No prestart in 7+ days"
          tone={overdue21Days.length > 0 ? "rose" : "amber"}
          icon={<AlertTriangle size={22} />}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Prestart Notice Board
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Vehicles not checked recently are shown here.
              </p>
            </div>
            <StatusPill
              label={`${overdue21Days.length} critical`}
              tone={overdue21Days.length > 0 ? "rose" : "emerald"}
            />
          </div>

          <div className="mt-4 grid gap-3">
            {overdue7Days.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                All vehicles have a recent prestart.
              </div>
            ) : (
              overdue7Days.slice(0, 8).map((vehicle) => {
                const latest = latestByVehicle.get(vehicle.id);
                const days = latest ? daysSince(latest.created_at) : null;
                const critical = days === null || days >= 21;

                return (
                  <div
                    key={vehicle.id}
                    className={`rounded-2xl border p-4 ${
                      critical
                        ? "border-rose-200 bg-rose-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {getVehicleLabel(vehicle)}
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          {days === null
                            ? "No prestart record found."
                            : `Last prestart was ${days} days ago.`}
                        </p>
                      </div>

                      <StatusPill
                        label={critical ? "3+ Weeks" : "7+ Days"}
                        tone={critical ? "rose" : "amber"}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Latest Prestarts
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Most recent vehicle checks submitted.
              </p>
            </div>
            <CheckCircle2 size={22} className="text-emerald-600" />
          </div>

          <div className="mt-4 grid gap-3">
            {prestarts.slice(0, 5).map((prestart) => (
              <Link
                key={prestart.id}
                href={`/assets/prestarts/${prestart.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">
                      {getPrestartAssetLabel(prestart) || "Vehicle"}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {clean(prestart.inspected_by_name) || "Unknown"} ·{" "}
                      {formatDate(prestart.created_at)}
                    </p>
                  </div>

                  <StatusPill
                    label={severityLabel(prestart.severity)}
                    tone={severityTone(prestart.severity)}
                  />
                </div>
              </Link>
            ))}

            {!loading && prestarts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-bold text-slate-500">
                No prestarts submitted yet.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setRegisterOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <div>
            <h2 className="text-lg font-black text-slate-950">
              Prestarts Register
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {loading
                ? "Loading prestarts..."
                : `${filteredPrestarts.length} of ${prestarts.length} prestarts shown`}
            </p>
          </div>

          {registerOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {registerOpen ? (
          <div className="border-t border-slate-200 p-5">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="relative md:col-span-2">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search vehicle, rego, inspector, comments..."
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </div>

              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              >
                {[
                  "All Severities",
                  "No Issues",
                  "Minor",
                  "Moderate",
                  "Major",
                  "Do Not Use",
                ].map((option) => (
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
                value={crewFilter}
                onChange={(event) => setCrewFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              >
                {crewOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>

              <select
                value={inspectorFilter}
                onChange={(event) => setInspectorFilter(event.target.value)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 md:col-span-2"
              >
                {inspectorOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </section>

      {registerOpen ? (
        <RegisterList
          title="Submitted Vehicle Prestarts"
          description={
            loading
              ? "Loading prestarts..."
              : `${filteredPrestarts.length} submitted checks shown`
          }
          items={filteredPrestarts}
          getKey={(prestart) => prestart.id}
          columns={[
            {
              label: "Date",
              render: (prestart) => formatDate(prestart.created_at),
            },
            {
              label: "Vehicle",
              render: (prestart) => (
                <div className="flex items-center gap-3">
                  <div className="hidden rounded-xl bg-slate-100 p-2 text-slate-600 sm:flex">
                    <Car size={16} />
                  </div>

                  <div>
                    <p className="font-bold text-slate-950">
                      {clean(prestart.asset_label) || "Vehicle"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {clean(prestart.vehicle_rego) || "No rego"}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              label: "Inspected By",
              render: (prestart) => clean(prestart.inspected_by_name) || "N/A",
            },
            {
              label: "KM",
              render: (prestart) => clean(prestart.kilometres) || "-",
            },
            {
              label: "Allocation",
              render: (prestart) => (
                <div>
                  <p className="font-semibold text-slate-950">
                    {clean(prestart.project) || "Unallocated project"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {clean(prestart.crew) || "Unallocated crew"}
                  </p>
                </div>
              ),
            },
            {
              label: "Severity",
              render: (prestart) => (
                <StatusPill
                  label={severityLabel(prestart.severity)}
                  tone={severityTone(prestart.severity)}
                />
              ),
            },
            {
              label: "Actions",
              render: (prestart) => (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/assets/prestarts/${prestart.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Eye size={14} />
                    View
                  </Link>

                  {prestart.fleet_job_id ? (
                    <Link
                      href={`/assets/fleet-jobs/${prestart.fleet_job_id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 shadow-sm hover:bg-amber-100"
                    >
                      Fleet Job
                    </Link>
                  ) : null}
                </div>
              ),
            },
          ]}
          renderMobile={(prestart) => (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                    <Car size={16} />
                  </div>

                  <div>
                    <p className="font-bold text-slate-950">
                      {clean(prestart.asset_label) || "Vehicle"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {clean(prestart.vehicle_rego) || "No rego"}
                    </p>
                  </div>
                </div>

                <StatusPill
                  label={severityLabel(prestart.severity)}
                  tone={severityTone(prestart.severity)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Submitted
                  </p>
                  <p className="font-semibold text-slate-800">
                    {formatDate(prestart.created_at)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Inspector
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(prestart.inspected_by_name) || "N/A"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Project
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(prestart.project) || "Unallocated"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(prestart.crew) || "Unallocated"}
                  </p>
                </div>
              </div>

              <Link
                href={`/assets/prestarts/${prestart.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
              >
                <Eye size={14} />
                View
              </Link>
            </div>
          )}
        />
      ) : null}

      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="mx-auto my-6 w-full max-w-6xl rounded-3xl bg-white shadow-2xl">
            <form action={handleCreatePrestart}>
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl border-b border-slate-200 bg-white p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    New Vehicle Prestart
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    Add Prestart
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Complete the vehicle check. Any issue raised will be pushed
                    to Fleet Jobs.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid gap-5 p-5">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-base font-black text-slate-950">
                    Prestart Details
                  </h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-4">
                    <div className="md:col-span-2">
                      <SearchPicker
                        label="Asset ID / Rego"
                        placeholder="Start typing asset ID, rego, make or model..."
                        value={
                          selectedVehicle ? getVehicleLabel(selectedVehicle) : ""
                        }
                        search={vehicleSearch}
                        setSearch={setVehicleSearch}
                        items={vehicles}
                        getKey={(vehicle) => vehicle.id}
                        getLabel={getVehicleLabel}
                        onSelect={(vehicle) => {
                          handleVehicleChange(vehicle.id);
                          setVehicleSearch(getVehicleLabel(vehicle));
                        }}
                      />

                      <input
                        type="hidden"
                        name="vehicle_asset_id"
                        value={selectedVehicleId}
                      />
                    </div>

                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Kilometres
                      <input
                        name="kilometres"
                        type="number"
                        min="0"
                        step="1"
                        required
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      />
                    </label>

                    <div>
                      <SearchPicker
                        label="Inspected By"
                        placeholder="Start typing worker name..."
                        value={selectedEmployeeName}
                        search={employeeSearch}
                        setSearch={setEmployeeSearch}
                        items={employees}
                        getKey={(employee) => employee.id}
                        getLabel={(employee) => employee.full_name}
                        onSelect={(employee) => {
                          setSelectedEmployeeName(employee.full_name);
                          setEmployeeSearch(employee.full_name);
                        }}
                      />

                      <input
                        type="hidden"
                        name="inspected_by_name"
                        value={selectedEmployeeName}
                      />
                    </div>

                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Project
                      <select
                        name="project"
                        value={selectedProject}
                        onChange={(event) =>
                          setSelectedProject(event.target.value)
                        }
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      >
                        <option value="">No project selected</option>
                        {projectOptions
                          .filter((option) => option !== "All Projects")
                          .map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Crew
                      <select
                        name="crew"
                        value={selectedCrew}
                        onChange={(event) => setSelectedCrew(event.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      >
                        <option value="">No crew selected</option>
                        {crewOptions
                          .filter((option) => option !== "All Crews")
                          .map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                      </select>
                    </label>

                    {selectedVehicle ? (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800 md:col-span-2">
                        Selected: {getVehicleLabel(selectedVehicle)}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-base font-black text-slate-950">
                      Vehicle Checklist
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Tap Y, N or N/A for each item.
                    </p>
                  </div>

                  <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {checklistItems.map((item) => {
                      const key = checklistKey(item);
                      const value = checklistValues[key] || "yes";

                      return (
                        <div
                          key={item}
                          className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <p className="truncate text-xs font-black text-slate-800">
                            {item}
                          </p>

                          <div className="flex gap-1">
                            <ChecklistButton
                              active={value === "yes"}
                              tone="yes"
                              onClick={() =>
                                setChecklistValues((current) => ({
                                  ...current,
                                  [key]: "yes",
                                }))
                              }
                            >
                              Y
                            </ChecklistButton>

                            <ChecklistButton
                              active={value === "no"}
                              tone="no"
                              onClick={() =>
                                setChecklistValues((current) => ({
                                  ...current,
                                  [key]: "no",
                                }))
                              }
                            >
                              N
                            </ChecklistButton>

                            <ChecklistButton
                              active={value === "na"}
                              tone="na"
                              onClick={() =>
                                setChecklistValues((current) => ({
                                  ...current,
                                  [key]: "na",
                                }))
                              }
                            >
                              N/A
                            </ChecklistButton>
                          </div>

                          <input
                            type="hidden"
                            name={key}
                            value={checklistValues[key] || "yes"}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-base font-black text-slate-950">
                    Condition & Issues
                  </h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Overall Condition
                      <select
                        name="overall_condition"
                        required
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      >
                        <option>Good</option>
                        <option>Fair</option>
                        <option>Poor</option>
                        <option>Unsafe</option>
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Issue Severity
                      <select
                        name="severity"
                        required
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      >
                        <option value="none">No Issues</option>
                        <option value="minor">
                          Minor - Low Priority Fleet Job
                        </option>
                        <option value="moderate">
                          Moderate - Medium Priority Fleet Job
                        </option>
                        <option value="major">
                          Major - High Priority Fleet Job
                        </option>
                        <option value="do_not_use">
                          Do Not Use - Critical Fleet Job
                        </option>
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                      Defect Description / General Comments
                      <textarea
                        name="comments"
                        rows={5}
                        placeholder="Describe defects, missing items, warning lights, damage, or general comments."
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      />
                    </label>
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 rounded-b-3xl border-t border-slate-200 bg-white p-5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-400"
                >
                  {saving ? "Saving..." : "Save Prestart"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}