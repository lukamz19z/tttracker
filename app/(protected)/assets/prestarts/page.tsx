/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
type AssetType = "Vehicle" | "Plant";

type RawVehicleAsset = {
  id: string;
  vehicle_id?: string | null;
  vehicle_rego?: string | null;
  rego?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
  project?: string | null;
  crew?: string | null;
  status?: string | null;
};

type RawPlantAsset = {
  id: string;
  asset_id?: string | null;
  plant_id?: string | null;
  equipment_id?: string | null;
  name?: string | null;
  make?: string | null;
  model?: string | null;
  category?: string | null;
  plant_type?: string | null;
  project?: string | null;
  crew?: string | null;
  status?: string | null;
  cab_hours?: number | null;
  current_hours?: number | null;
  hours?: number | null;
};

type PrestartAsset = {
  id: string;
  assetType: AssetType;
  assetId: string;
  rego: string;
  makeModel: string;
  category: string;
  project: string;
  crew: string;
  status: string;
  currentHours: number | null;
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

type ChecklistValue = {
  answer: string;
  severity: string;
  comment: string;
};

type PrestartRecord = {
  id: string;
  docket_number: string | null;
  asset_type: AssetType | string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  asset_category: string | null;
  kilometres: number | null;
  cab_hours: number | null;
  project: string | null;
  crew: string | null;
  inspected_by_name: string | null;
  checklist: Record<string, ChecklistValue> | null;
  overall_condition: string | null;
  comments: string | null;
  severity: string | null;
  result: string | null;
  fleet_job_id: string | null;
  prestart_date: string | null;
  created_at: string | null;
};

const vehicleChecklistSections = [
  {
    title: "Vehicle Condition",
    items: ["Tyres", "Doors", "Windows", "Mirrors", "Wipers"],
  },
  {
    title: "Lights & Alarms",
    items: [
      "Park lights",
      "Head lights",
      "Reverse lights",
      "Indicators",
      "Brake lights",
      "Beacon lights",
      "Reverse alarm",
      "Horn",
    ],
  },
  {
    title: "Driver Controls",
    items: [
      "Steering",
      "Foot brake",
      "Reverse camera",
      "Seats and seat belts",
      "AC / Heater",
      "Instruments",
    ],
  },
  {
    title: "Safety Equipment",
    items: ["Fire extinguisher", "First aid kit", "Wheel chocks"],
  },
  {
    title: "Communications",
    items: ["UHF radio working", "IVMS working"],
  },
  {
    title: "Mechanical",
    items: ["Battery", "Engine oil", "Coolant"],
  },
  {
    title: "Transport Compliance",
    items: ["Spare wheel"],
  },
];

const plantChecklistSections = [
  {
    title: "Engine",
    items: [
      "Oil level",
      "Coolant level",
      "Fuel water drain",
      "Brake fluid",
      "Battery",
      "Air filter",
      "V belts",
    ],
  },
  {
    title: "Carrier",
    items: [
      "Tyres",
      "Wheel nuts",
      "Fuel level",
      "Air tank drain",
      "Steering function",
      "Brake function",
      "Carrier lubrication",
      "Lights / horn / gauges",
    ],
  },
  {
    title: "Crane Functions",
    items: [
      "Slew",
      "Boom raising and lowering",
      "Boom extension and retraction",
      "Winches",
      "Wire ropes",
      "Sheaves",
      "Anti two block",
      "Load indicator",
      "Outriggers",
      "Crane lubrication",
      "Crane structural components",
    ],
  },
  {
    title: "Hydraulics",
    items: [
      "Hydraulic oil level",
      "Hydraulic oil line leaks",
      "Cylinder leaks",
    ],
  },
];

function getChecklistSections(assetType: AssetType) {
  return assetType === "Plant" ? plantChecklistSections : vehicleChecklistSections;
}

function getChecklistItems(assetType: AssetType) {
  return getChecklistSections(assetType).flatMap((section) => section.items);
}

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function checklistKey(label: string) {
  return label.toLowerCase().replaceAll(" ", "_").replaceAll("/", "_");
}

function defaultChecklist(assetType: AssetType = "Vehicle") {
  return getChecklistItems(assetType).reduce<Record<string, ChecklistValue>>((acc, item) => {
    acc[checklistKey(item)] = {
      answer: "yes",
      severity: "minor",
      comment: "",
    };
    return acc;
  }, {});
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function prestartDateValue(prestart: PrestartRecord) {
  return prestart.prestart_date || prestart.created_at;
}

function formatShortDate(value: string | null) {
  if (!value) return "No date";

  return new Date(value).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

function highestSeverity(severities: string[]) {
  const rank: Record<string, number> = {
    none: 0,
    minor: 1,
    moderate: 2,
    major: 3,
    do_not_use: 4,
  };

  return severities.reduce((highest, current) => {
    return (rank[current] ?? 0) > (rank[highest] ?? 0) ? current : highest;
  }, "none");
}

function crewLabel(crew: Crew) {
  return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
}

function makeModel(make?: string | null, model?: string | null) {
  return [make, model].map(clean).filter(Boolean).join(" ");
}

function mapVehicleAsset(vehicle: RawVehicleAsset): PrestartAsset {
  return {
    id: vehicle.id,
    assetType: "Vehicle",
    assetId: clean(vehicle.vehicle_id) || "Vehicle",
    rego: clean(vehicle.vehicle_rego) || clean(vehicle.rego),
    makeModel: makeModel(vehicle.make, vehicle.model),
    category: clean(vehicle.category) || "Vehicle",
    project: clean(vehicle.project),
    crew: clean(vehicle.crew),
    status: clean(vehicle.status),
    currentHours: null,
  };
}

function mapPlantAsset(plant: RawPlantAsset): PrestartAsset {
  return {
    id: plant.id,
    assetType: "Plant",
    assetId:
      clean(plant.asset_id) ||
      clean(plant.plant_id) ||
      clean(plant.equipment_id) ||
      clean(plant.name) ||
      "Plant",
    rego: "",
    makeModel: makeModel(plant.make, plant.model) || clean(plant.name),
    category: clean(plant.category) || clean(plant.plant_type) || "Plant",
    project: clean(plant.project),
    crew: clean(plant.crew),
    status: clean(plant.status),
    currentHours:
      typeof plant.cab_hours === "number"
        ? plant.cab_hours
        : typeof plant.current_hours === "number"
          ? plant.current_hours
          : typeof plant.hours === "number"
            ? plant.hours
            : null,
  };
}

function getAssetLabel(asset: PrestartAsset) {
  return [
    asset.assetType,
    asset.assetId || "No ID",
    asset.rego || "",
    asset.makeModel,
    asset.category,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getPrestartAssetLabel(prestart: PrestartRecord) {
  return [
    clean(prestart.asset_label),
    clean(prestart.vehicle_rego),
    clean(prestart.asset_category),
  ]
    .filter(Boolean)
    .join(" · ");
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
  children: ReactNode;
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
    .filter((item) => getLabel(item).toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

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
  icon: ReactNode;
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

export default function AssetPrestartsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [assets, setAssets] = useState<PrestartAsset[]>([]);
  const [prestarts, setPrestarts] = useState<PrestartRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(true);

  const [assetTypeFilter, setAssetTypeFilter] = useState<"All Assets" | AssetType>("All Assets");
  const [formAssetType, setFormAssetType] = useState<AssetType>("Vehicle");

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All Severities");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [crewFilter, setCrewFilter] = useState("All Crews");
  const [inspectorFilter, setInspectorFilter] = useState("All Inspectors");

  const [selectedAssetKey, setSelectedAssetKey] = useState("");
  const [assetSearch, setAssetSearch] = useState("");

  const [selectedEmployeeName, setSelectedEmployeeName] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [selectedProject, setSelectedProject] = useState("");
  const [selectedCrew, setSelectedCrew] = useState("");
  const [checklistValues, setChecklistValues] =
    useState<Record<string, ChecklistValue>>(defaultChecklist);

  const selectedAsset = assets.find(
    (asset) => `${asset.assetType}:${asset.id}` === selectedAssetKey,
  );

  const formAssets = useMemo(() => {
    return assets.filter((asset) => asset.assetType === formAssetType);
  }, [assets, formAssetType]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [vehiclesResult, plantResult, prestartsResult, employeesResult, projectsResult, crewsResult] =
      await Promise.all([
        supabase.from("vehicle_assets").select("*").order("vehicle_id", { ascending: true }),
        supabase.from("plant_assets").select("*").order("asset_id", { ascending: true }),
        supabase
          .from("vehicle_prestarts")
          .select("*")
          .order("prestart_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("employees").select("*").order("full_name", { ascending: true }),
        supabase.from("projects").select("id, name").order("name", { ascending: true }),
        supabase.from("crews").select("id, crew_number, crew_name").order("crew_number", { ascending: true }),
      ]);

    const vehicleAssets =
      vehiclesResult.error || !vehiclesResult.data
        ? []
        : (vehiclesResult.data as RawVehicleAsset[])
            .filter((vehicle) => clean(vehicle.category).toLowerCase() !== "trailer")
            .map(mapVehicleAsset);

    const plantAssets =
      plantResult.error || !plantResult.data
        ? []
        : (plantResult.data as RawPlantAsset[])
            .filter((plant) => {
              const category = clean(plant.category || plant.plant_type).toLowerCase();
              return category.includes("crane") || category.includes("tele");
            })
            .map(mapPlantAsset);

    if (vehiclesResult.error) {
      console.error("Failed to load vehicles:", vehiclesResult.error.message);
    }

    if (plantResult.error) {
      console.error("Failed to load plant:", plantResult.error.message);
    }

    setAssets([...vehicleAssets, ...plantAssets]);

    if (prestartsResult.error) {
      console.error("Failed to load prestarts:", prestartsResult.error.message);
      setPrestarts([]);
    } else {
      setPrestarts((prestartsResult.data ?? []) as PrestartRecord[]);
    }

    if (employeesResult.error) {
      console.error("Failed to load employees:", employeesResult.error.message);
      setEmployees([]);
    } else {
      setEmployees(
        ((employeesResult.data ?? []) as Employee[]).filter(
          (employee) => employee.active !== false && clean(employee.full_name).length > 0,
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
      ...assets.map((asset) => clean(asset.project)),
      ...prestarts.map((prestart) => clean(prestart.project)),
    ].filter(Boolean);

    return ["All Projects", ...Array.from(new Set(values)).sort()];
  }, [projects, assets, prestarts]);

  const crewOptions = useMemo(() => {
    const crewLabels =
      crews.length > 0
        ? crews.map((crew) => crewLabel(crew))
        : [
            ...assets.map((asset) => clean(asset.crew)),
            ...prestarts.map((prestart) => clean(prestart.crew)),
          ];

    return ["All Crews", ...Array.from(new Set(crewLabels.filter(Boolean))).sort()];
  }, [crews, assets, prestarts]);

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

  function matchCrewOption(assetCrew: string | null) {
    const value = clean(assetCrew);

    if (!value) return "";

    const exact = crewOptions.find((option) => option === value);
    if (exact) return exact;

    const byNumber = crews.find((crew) => crew.crew_number === value);
    if (byNumber) return crewLabel(byNumber);

    return value;
  }

  function openForm() {
    setSelectedAssetKey("");
    setAssetSearch("");
    setSelectedEmployeeName("");
    setEmployeeSearch("");
    setSelectedProject("");
    setSelectedCrew("");
    setFormAssetType("Vehicle");
    setChecklistValues(defaultChecklist("Vehicle"));
    setShowForm(true);
  }

  function handleAssetTypeChange(assetType: AssetType) {
    setFormAssetType(assetType);
    setSelectedAssetKey("");
    setAssetSearch("");
    setSelectedProject("");
    setSelectedCrew("");
    setChecklistValues(defaultChecklist(assetType));
  }

  function handleAssetChange(asset: PrestartAsset) {
    setSelectedAssetKey(`${asset.assetType}:${asset.id}`);
    setSelectedProject(clean(asset.project));
    setSelectedCrew(matchCrewOption(asset.crew));
  }

  const latestByAsset = useMemo(() => {
    const map = new Map<string, PrestartRecord>();

    prestarts.forEach((prestart) => {
      const assetType = clean(prestart.asset_type) === "Plant" ? "Plant" : "Vehicle";
      const assetId =
        assetType === "Plant"
          ? clean(prestart.plant_asset_id)
          : clean(prestart.vehicle_asset_id);

      if (!assetId) return;

      const key = `${assetType}:${assetId}`;
      const existing = map.get(key);
      const currentTime = new Date(prestartDateValue(prestart) ?? "").getTime();
      const existingTime = existing
        ? new Date(prestartDateValue(existing) ?? "").getTime()
        : 0;

      if (!existing || currentTime > existingTime) {
        map.set(key, prestart);
      }
    });

    return map;
  }, [prestarts]);

  const overdue7Days = useMemo(() => {
    return assets.filter((asset) => {
      const latest = latestByAsset.get(`${asset.assetType}:${asset.id}`);
      const days = latest ? daysSince(prestartDateValue(latest)) : null;
      return days === null || days >= 7;
    });
  }, [assets, latestByAsset]);

  const overdue21Days = useMemo(() => {
    return assets.filter((asset) => {
      const latest = latestByAsset.get(`${asset.assetType}:${asset.id}`);
      const days = latest ? daysSince(prestartDateValue(latest)) : null;
      return days === null || days >= 21;
    });
  }, [assets, latestByAsset]);

  const submittedThisWeek = useMemo(() => {
    return prestarts.filter((prestart) => {
      const days = daysSince(prestartDateValue(prestart));
      return days !== null && days <= 7;
    }).length;
  }, [prestarts]);

  const assetsCheckedThisWeek = useMemo(() => {
    return new Set(
      prestarts
        .filter((prestart) => {
          const days = daysSince(prestartDateValue(prestart));
          return days !== null && days <= 7;
        })
        .map((prestart) => {
          const assetType = clean(prestart.asset_type) === "Plant" ? "Plant" : "Vehicle";
          const assetId =
            assetType === "Plant"
              ? clean(prestart.plant_asset_id)
              : clean(prestart.vehicle_asset_id);
          return `${assetType}:${assetId}`;
        })
        .filter(Boolean),
    ).size;
  }, [prestarts]);

  const issuesRaised = useMemo(() => {
    return prestarts.filter((prestart) => clean(prestart.severity) !== "none").length;
  }, [prestarts]);

  const filteredPrestarts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return prestarts.filter((prestart) => {
      const assetType = clean(prestart.asset_type) === "Plant" ? "Plant" : "Vehicle";

      const searchable = [
        prestart.docket_number,
        assetType,
        prestart.asset_label,
        prestart.vehicle_rego,
        prestart.asset_category,
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
        (assetTypeFilter === "All Assets" || assetType === assetTypeFilter) &&
        (severityFilter === "All Severities" ||
          severityLabel(prestart.severity) === severityFilter) &&
        (projectFilter === "All Projects" || clean(prestart.project) === projectFilter) &&
        (crewFilter === "All Crews" || clean(prestart.crew) === crewFilter) &&
        (inspectorFilter === "All Inspectors" ||
          clean(prestart.inspected_by_name) === inspectorFilter)
      );
    });
  }, [
    prestarts,
    search,
    assetTypeFilter,
    severityFilter,
    projectFilter,
    crewFilter,
    inspectorFilter,
  ]);

  async function handleCreatePrestart(formData: FormData) {
    setSaving(true);

    if (!selectedAsset) {
      alert("Please select an asset.");
      setSaving(false);
      return;
    }

    if (!selectedEmployeeName) {
      alert("Please select who inspected the asset.");
      setSaving(false);
      return;
    }

    const prestartDate = clean(formData.get("prestart_date") as string);
    const comments = clean(formData.get("comments") as string);

    if (!prestartDate) {
      alert("Please select the prestart date.");
      setSaving(false);
      return;
    }

    const kilometres =
      selectedAsset.assetType === "Vehicle"
        ? Number(formData.get("kilometres") || 0)
        : null;

    const cabHours =
      selectedAsset.assetType === "Plant"
        ? Number(formData.get("cab_hours") || 0)
        : null;

    if (selectedAsset.assetType === "Vehicle" && !kilometres) {
      alert("Please enter kilometres.");
      setSaving(false);
      return;
    }

    if (selectedAsset.assetType === "Plant" && !cabHours) {
      alert("Please enter upper cab hours.");
      setSaving(false);
      return;
    }

    const selectedChecklistItems = getChecklistItems(selectedAsset.assetType);

    const failedItems = selectedChecklistItems.filter((item) => {
      const key = checklistKey(item);
      return checklistValues[key]?.answer === "no";
    });

    const failedItemsMissingComments = failedItems.filter((item) => {
      const key = checklistKey(item);
      return !checklistValues[key]?.comment?.trim();
    });

    if (failedItemsMissingComments.length > 0) {
      alert(`Comments required for: ${failedItemsMissingComments.join(", ")}`);
      setSaving(false);
      return;
    }

    const failedItemsMissingSeverity = failedItems.filter((item) => {
      const key = checklistKey(item);
      return !checklistValues[key]?.severity;
    });

    if (failedItemsMissingSeverity.length > 0) {
      alert(`Severity required for: ${failedItemsMissingSeverity.join(", ")}`);
      setSaving(false);
      return;
    }

    const failedSeverities = failedItems.map((item) => {
      const key = checklistKey(item);
      return checklistValues[key]?.severity || "minor";
    });

    const severity = failedItems.length > 0 ? highestSeverity(failedSeverities) : "none";

    const failedChecklistDetails = failedItems.map((item) => {
      const key = checklistKey(item);
      const itemSeverity = checklistValues[key]?.severity || "minor";
      const itemComment =
        checklistValues[key]?.comment?.trim() || "No comment provided";

      return `${item}\nSeverity: ${severityLabel(itemSeverity)}\nComment: ${itemComment}`;
    });

    const fleetJobDescription = [
      failedChecklistDetails.length > 0
        ? `${selectedAsset.assetType} prestart defect(s):\n\n${failedChecklistDetails.join("\n\n")}`
        : "",
      comments ? `General comments:\n${comments}` : "",
      selectedAsset.assetType === "Plant" ? `Upper cab hours: ${cabHours}` : "",
      selectedAsset.assetType === "Vehicle" ? `Kilometres: ${kilometres}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const docketPrefix = selectedAsset.assetType === "Plant" ? "PPS" : "VPS";

    const { count: prestartCount } = await supabase
      .from("vehicle_prestarts")
      .select("id", { count: "exact", head: true })
      .eq("asset_type", selectedAsset.assetType);

    const docketNumber = `${docketPrefix}-${String((prestartCount ?? 0) + 1).padStart(6, "0")}`;

    const assetLabel = [
      selectedAsset.assetId || selectedAsset.assetType,
      selectedAsset.makeModel,
    ]
      .filter(Boolean)
      .join(" ");

    const insertPayload = {
      docket_number: docketNumber,
      asset_type: selectedAsset.assetType,
      vehicle_asset_id: selectedAsset.assetType === "Vehicle" ? selectedAsset.id : null,
      plant_asset_id: selectedAsset.assetType === "Plant" ? selectedAsset.id : null,
      asset_label: assetLabel,
      vehicle_rego: selectedAsset.assetType === "Vehicle" ? selectedAsset.rego : null,
      asset_category: selectedAsset.category,
      prestart_date: prestartDate,
      kilometres,
      cab_hours: cabHours,
      project: selectedProject || clean(selectedAsset.project),
      crew: selectedCrew || matchCrewOption(selectedAsset.crew),
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
      const jobNumber = `FJ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const selectedPriority = severityToPriority(severity);

      const jobTitle =
        failedItems.length === 1
          ? `${severityLabel(severity)} issue - ${failedItems[0]} - ${assetLabel}`
          : `${severityLabel(severity)} prestart issues - ${assetLabel}`;

      const { data: fleetJob, error: fleetJobError } = await supabase
        .from("fleet_jobs")
        .insert({
          job_number: jobNumber,

          asset_type: selectedAsset.assetType,
          vehicle_id: selectedAsset.assetType === "Vehicle" ? selectedAsset.id : null,
          plant_id: selectedAsset.assetType === "Plant" ? selectedAsset.id : null,
          prestart_id: newPrestart.id,

          source_type:
            selectedAsset.assetType === "Vehicle" ? "vehicle_prestart" : "plant_prestart",
          source_id: newPrestart.id,
          vehicle_asset_id: selectedAsset.assetType === "Vehicle" ? selectedAsset.id : null,
          plant_asset_id: selectedAsset.assetType === "Plant" ? selectedAsset.id : null,
          asset_label: assetLabel,

          source: "Prestart",
          title: jobTitle,
          description: fleetJobDescription || "Issue raised from prestart.",
          priority: selectedPriority,
          status: "Open",

          project: selectedProject || clean(selectedAsset.project) || null,
          crew: selectedCrew || matchCrewOption(selectedAsset.crew) || null,

          reported_by: selectedEmployeeName || null,
          assigned_to: null,
          vendor: null,

          reported_date: prestartDate,
          due_date: null,
          completed_date: null,

          cost: null,
          notes: `Created automatically from ${selectedAsset.assetType.toLowerCase()} prestart on ${prestartDate}.`,
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
    setSelectedAssetKey("");
    setAssetSearch("");
    setSelectedEmployeeName("");
    setEmployeeSearch("");
    setSelectedProject("");
    setSelectedCrew("");
    setFormAssetType("Vehicle");
    setChecklistValues(defaultChecklist("Vehicle"));
    await loadData();
    setSaving(false);
  }

  function exportFilteredPrestarts() {
    const headers = [
      "Docket",
      "Date",
      "Asset Type",
      "Asset",
      "Rego",
      "Category",
      "Inspected By",
      "Kilometres",
      "Cab Hours",
      "Project",
      "Crew",
      "Result",
      "Severity",
      "Fleet Job",
      "Comments",
    ];

    const rows = filteredPrestarts.map((prestart) => [
      clean(prestart.docket_number),
      formatShortDate(prestartDateValue(prestart)),
      clean(prestart.asset_type) || "Vehicle",
      clean(prestart.asset_label),
      clean(prestart.vehicle_rego),
      clean(prestart.asset_category),
      clean(prestart.inspected_by_name),
      clean(prestart.kilometres),
      clean(prestart.cab_hours),
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
    link.download = `asset-prestarts-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Checks"
        title="Prestarts"
        description="Submit, review and track vehicle and plant prestarts. Vehicle prestarts record kilometres; plant prestarts record upper cab hours for service tracking."
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
          label="Assets Checked"
          value={assetsCheckedThisWeek}
          detail="Unique assets this week"
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
                Vehicles and plant not checked recently are shown here. Trailers are excluded.
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
                All required assets have a recent prestart.
              </div>
            ) : (
              overdue7Days.slice(0, 8).map((asset) => {
                const latest = latestByAsset.get(`${asset.assetType}:${asset.id}`);
                const days = latest ? daysSince(prestartDateValue(latest)) : null;
                const critical = days === null || days >= 21;

                return (
                  <div
                    key={`${asset.assetType}:${asset.id}`}
                    className={`rounded-2xl border p-4 ${
                      critical
                        ? "border-rose-200 bg-rose-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {getAssetLabel(asset)}
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-700">
                          {days === null
                            ? "No prestart record found."
                            : `Last prestart was ${days} days ago.`}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <StatusPill label={asset.assetType} tone="blue" />
                        <StatusPill
                          label={critical ? "3+ Weeks" : "7+ Days"}
                          tone={critical ? "rose" : "amber"}
                        />
                      </div>
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
                Most recent asset checks submitted.
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
                      {getPrestartAssetLabel(prestart) || "Asset"}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {clean(prestart.docket_number) || "No docket"} · {clean(prestart.inspected_by_name) || "Unknown"} ·{" "}
                      {formatShortDate(prestartDateValue(prestart))}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      label={clean(prestart.asset_type) || "Vehicle"}
                      tone="blue"
                    />
                    <StatusPill
                      label={severityLabel(prestart.severity)}
                      tone={severityTone(prestart.severity)}
                    />
                  </div>
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
            <div className="grid gap-3 md:grid-cols-6">
              <div className="relative md:col-span-2">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search asset, inspector, comments..."
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </div>

              <select
                value={assetTypeFilter}
                onChange={(event) =>
                  setAssetTypeFilter(event.target.value as "All Assets" | AssetType)
                }
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              >
                <option>All Assets</option>
                <option>Vehicle</option>
                <option>Plant</option>
              </select>

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
          title="Submitted Prestarts"
          description={
            loading
              ? "Loading prestarts..."
              : `${filteredPrestarts.length} submitted checks shown`
          }
          items={filteredPrestarts}
          getKey={(prestart) => prestart.id}
          columns={[
            {
              label: "Docket",
              render: (prestart) => (
                <span className="font-black text-slate-950">
                  {clean(prestart.docket_number) || "-"}
                </span>
              ),
            },
            {
              label: "Date",
              render: (prestart) => formatShortDate(prestartDateValue(prestart)),
            },
            {
              label: "Asset",
              render: (prestart) => (
                <div className="flex items-center gap-3">
                  <div className="hidden rounded-xl bg-slate-100 p-2 text-slate-600 sm:flex">
                    <Car size={16} />
                  </div>

                  <div>
                    <p className="font-bold text-slate-950">
                      {clean(prestart.asset_label) || "Asset"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {[clean(prestart.asset_type) || "Vehicle", clean(prestart.vehicle_rego), clean(prestart.asset_category)]
                        .filter(Boolean)
                        .join(" · ")}
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
              label: "Reading",
              render: (prestart) =>
                clean(prestart.asset_type) === "Plant"
                  ? `${clean(prestart.cab_hours) || "-"} hrs`
                  : `${clean(prestart.kilometres) || "-"} km`,
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
                      {clean(prestart.asset_label) || "Asset"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {[clean(prestart.asset_type) || "Vehicle", clean(prestart.vehicle_rego), clean(prestart.asset_category)]
                        .filter(Boolean)
                        .join(" · ")}
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
                    Docket
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(prestart.docket_number) || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Prestart Date
                  </p>
                  <p className="font-semibold text-slate-800">
                    {formatShortDate(prestartDateValue(prestart))}
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
                    Reading
                  </p>
                  <p className="font-semibold text-slate-800">
                    {clean(prestart.asset_type) === "Plant"
                      ? `${clean(prestart.cab_hours) || "-"} hrs`
                      : `${clean(prestart.kilometres) || "-"} km`}
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
                    New Asset Prestart
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    Add Prestart
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Select Vehicle or Plant. Vehicles record kilometres; plant records upper cab hours.
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
                    <div className="grid gap-2 text-sm font-bold text-slate-700">
                      Asset Type
                      <div className="grid grid-cols-2 gap-2">
                        {(["Vehicle", "Plant"] as AssetType[]).map((assetType) => (
                          <button
                            key={assetType}
                            type="button"
                            onClick={() => handleAssetTypeChange(assetType)}
                            className={`rounded-xl border px-4 py-3 text-sm font-black ${
                              formAssetType === assetType
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {assetType}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <SearchPicker
                        label={formAssetType === "Plant" ? "Plant Asset" : "Asset ID / Rego"}
                        placeholder={
                          formAssetType === "Plant"
                            ? "Start typing crane / telehandler ID..."
                            : "Start typing asset ID, rego, make or model..."
                        }
                        value={selectedAsset ? getAssetLabel(selectedAsset) : ""}
                        search={assetSearch}
                        setSearch={setAssetSearch}
                        items={formAssets}
                        getKey={(asset) => `${asset.assetType}:${asset.id}`}
                        getLabel={getAssetLabel}
                        onSelect={(asset) => {
                          handleAssetChange(asset);
                          setAssetSearch(getAssetLabel(asset));
                        }}
                      />

                      <input
                        type="hidden"
                        name="asset_id"
                        value={selectedAsset?.id || ""}
                      />
                    </div>

                    <label className="grid gap-2 text-sm font-bold text-slate-700">
                      Prestart Date
                      <input
                        name="prestart_date"
                        type="date"
                        required
                        defaultValue={todayDate()}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      />
                    </label>

                    {selectedAsset?.assetType === "Plant" ? (
                      <label className="grid gap-2 text-sm font-bold text-slate-700">
                        Upper Cab Hours
                        <input
                          name="cab_hours"
                          type="number"
                          min="0"
                          step="0.1"
                          required
                          defaultValue={selectedAsset.currentHours ?? ""}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        />
                      </label>
                    ) : (
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
                    )}

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
                        onChange={(event) => setSelectedProject(event.target.value)}
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

                    {selectedAsset ? (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800 md:col-span-2">
                        Selected: {getAssetLabel(selectedAsset)}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-base font-black text-slate-950">
                      Checklist
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Tap Y, N or N/A for each item. Selecting N requires item severity and a comment.
                    </p>
                  </div>

                  <div className="grid gap-5 p-4">
                    {getChecklistSections(formAssetType).map((section) => (
                      <div key={section.title}>
                        <div className="mb-3 border-b border-slate-200 pb-2">
                          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                            {section.title}
                          </h3>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {section.items.map((item) => {
                            const key = checklistKey(item);
                            const value = checklistValues[key]?.answer || "yes";
                            const itemSeverity =
                              checklistValues[key]?.severity || "minor";
                            const comment = checklistValues[key]?.comment || "";

                            return (
                              <div
                                key={item}
                                className={`rounded-xl border px-3 py-2 ${
                                  value === "no"
                                    ? "border-rose-200 bg-rose-50"
                                    : "border-slate-200 bg-slate-50"
                                }`}
                              >
                                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
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
                                          [key]: {
                                            ...(current[key] || {
                                              answer: "yes",
                                              severity: "minor",
                                              comment: "",
                                            }),
                                            answer: "yes",
                                            comment: "",
                                          },
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
                                          [key]: {
                                            ...(current[key] || {
                                              answer: "yes",
                                              severity: "minor",
                                              comment: "",
                                            }),
                                            answer: "no",
                                            severity:
                                              current[key]?.severity || "minor",
                                          },
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
                                          [key]: {
                                            ...(current[key] || {
                                              answer: "yes",
                                              severity: "minor",
                                              comment: "",
                                            }),
                                            answer: "na",
                                            comment: "",
                                          },
                                        }))
                                      }
                                    >
                                      N/A
                                    </ChecklistButton>
                                  </div>
                                </div>

                                {value === "no" ? (
                                  <div className="mt-2 grid gap-2">
                                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                                      {[
                                        ["minor", "Minor"],
                                        ["moderate", "Moderate"],
                                        ["major", "Major"],
                                        ["do_not_use", "Do Not Use"],
                                      ].map(([severityValue, label]) => (
                                        <button
                                          key={severityValue}
                                          type="button"
                                          onClick={() =>
                                            setChecklistValues((current) => ({
                                              ...current,
                                              [key]: {
                                                ...(current[key] || {
                                                  answer: "no",
                                                  severity: "minor",
                                                  comment: "",
                                                }),
                                                answer: "no",
                                                severity: severityValue,
                                              },
                                            }))
                                          }
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-black transition ${
                                            itemSeverity === severityValue
                                              ? severityTone(severityValue) === "rose"
                                                ? "border-rose-500 bg-rose-600 text-white"
                                                : severityTone(severityValue) === "amber"
                                                  ? "border-amber-500 bg-amber-500 text-white"
                                                  : "border-blue-500 bg-blue-600 text-white"
                                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                    </div>

                                    <textarea
                                      value={comment}
                                      onChange={(event) =>
                                        setChecklistValues((current) => ({
                                          ...current,
                                          [key]: {
                                            ...(current[key] || {
                                              answer: "no",
                                              severity: "minor",
                                              comment: "",
                                            }),
                                            answer: "no",
                                            comment: event.target.value,
                                          },
                                        }))
                                      }
                                      placeholder="Required: explain this defect..."
                                      rows={2}
                                      className="w-full rounded-lg border border-rose-300 bg-white px-2 py-2 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                                    />
                                  </div>
                                ) : null}

                                <input type="hidden" name={key} value={value} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
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

                    <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                      General Comments
                      <textarea
                        name="comments"
                        rows={5}
                        placeholder="Any general comments not covered by failed checklist items."
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
