"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import {
  ActionButton,
  PageHeader,
  PageShell,
} from "../../components";

type AssetType = "Vehicle" | "Plant";
type FleetJobPriority = "Low" | "Medium" | "High" | "Critical";
type FleetJobStatus =
  | "Open"
  | "In Progress"
  | "Waiting Parts"
  | "Booked"
  | "Completed"
  | "Closed";
type FleetJobSource =
  | "Manual"
  | "Prestart"
  | "Service"
  | "Defect"
  | "Compliance";

type VehicleAsset = {
  id: string;
  vehicle_id: string | null;
  vehicle_rego: string | null;
  make: string | null;
  model: string | null;
  project: string | null;
  crew: string | null;
};

type PlantAsset = {
  id: string;
  asset_id: string | null;
  rego: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  project: string | null;
  crew: string | null;
};

type JobForm = {
  asset_type: AssetType;
  vehicle_id: string;
  plant_id: string;
  title: string;
  description: string;
  source: FleetJobSource;
  priority: FleetJobPriority;
  status: FleetJobStatus;
  project: string;
  crew: string;
  reported_by: string;
  assigned_to: string;
  vendor: string;
  reported_date: string;
  due_date: string;
  completed_date: string;
  cost: string;
  notes: string;
};

const priorities: FleetJobPriority[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];

const statuses: FleetJobStatus[] = [
  "Open",
  "In Progress",
  "Waiting Parts",
  "Booked",
  "Completed",
  "Closed",
];

const sources: FleetJobSource[] = [
  "Manual",
  "Prestart",
  "Service",
  "Defect",
  "Compliance",
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function createEmptyForm(): JobForm {
  return {
    asset_type: "Vehicle",
    vehicle_id: "",
    plant_id: "",
    title: "",
    description: "",
    source: "Manual",
    priority: "Medium",
    status: "Open",
    project: "",
    crew: "",
    reported_by: "",
    assigned_to: "",
    vendor: "",
    reported_date: today(),
    due_date: "",
    completed_date: "",
    cost: "",
    notes: "",
  };
}

export default function NewFleetJobPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [form, setForm] = useState<JobForm>(() => createEmptyForm());
  const [vehicles, setVehicles] = useState<VehicleAsset[]>([]);
  const [plantAssets, setPlantAssets] = useState<PlantAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAssets() {
      setLoadingAssets(true);
      setErrorMessage("");

      const [vehiclesResult, plantResult] = await Promise.all([
        supabase
          .from("vehicle_assets")
          .select(
            "id, vehicle_id, vehicle_rego, make, model, project, crew",
          )
          .order("vehicle_id", { ascending: true }),

        supabase
          .from("plant_assets")
          .select(
            "id, asset_id, rego, make, model, plant_type, project, crew",
          )
          .order("asset_id", { ascending: true }),
      ]);

      if (!active) return;

      if (vehiclesResult.error) {
        console.error(
          "Failed to load vehicles:",
          vehiclesResult.error,
        );
        setVehicles([]);
      } else {
        setVehicles((vehiclesResult.data ?? []) as VehicleAsset[]);
      }

      if (plantResult.error) {
        console.error(
          "Failed to load plant:",
          plantResult.error,
        );
        setPlantAssets([]);
      } else {
        setPlantAssets((plantResult.data ?? []) as PlantAsset[]);
      }

      if (vehiclesResult.error || plantResult.error) {
        setErrorMessage(
          "Some asset lists could not be loaded. Refresh the page and try again.",
        );
      }

      setLoadingAssets(false);
    }

    void loadAssets();

    return () => {
      active = false;
    };
  }, [supabase]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === form.vehicle_id) ?? null,
    [form.vehicle_id, vehicles],
  );

  const selectedPlant = useMemo(
    () => plantAssets.find((plant) => plant.id === form.plant_id) ?? null,
    [form.plant_id, plantAssets],
  );

  function updateField<K extends keyof JobForm>(
    field: K,
    value: JobForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submitJob() {
    setErrorMessage("");
    setSuccessMessage("");

    if (!form.title.trim()) {
      setErrorMessage("Enter a fleet job title.");
      return;
    }

    if (
      form.asset_type === "Vehicle" &&
      !form.vehicle_id
    ) {
      setErrorMessage("Select a vehicle.");
      return;
    }

    if (
      form.asset_type === "Plant" &&
      !form.plant_id
    ) {
      setErrorMessage("Select a plant asset.");
      return;
    }

    if (
      form.cost.trim() &&
      !Number.isFinite(Number(form.cost))
    ) {
      setErrorMessage("Enter a valid cost amount.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(
          `Could not verify your login: ${userError.message}`,
        );
      }

      if (!user) {
        throw new Error(
          "Your login session is not available. Please sign out, sign back in and try again.",
        );
      }

      const assetLabel =
        form.asset_type === "Vehicle"
          ? [
              selectedVehicle?.vehicle_id,
              selectedVehicle?.vehicle_rego,
              selectedVehicle?.make,
              selectedVehicle?.model,
            ]
              .map(clean)
              .filter(Boolean)
              .join(" · ")
          : [
              selectedPlant?.asset_id,
              selectedPlant?.rego,
              selectedPlant?.make,
              selectedPlant?.model,
              selectedPlant?.plant_type,
            ]
              .map(clean)
              .filter(Boolean)
              .join(" · ");

      const reportedBy =
        form.reported_by.trim() ||
        clean(user.user_metadata?.full_name) ||
        clean(user.user_metadata?.name) ||
        user.email ||
        "TTTracker user";

      const payload = {
        asset_type: form.asset_type,
        vehicle_id:
          form.asset_type === "Vehicle"
            ? form.vehicle_id
            : null,
        vehicle_asset_id:
          form.asset_type === "Vehicle"
            ? form.vehicle_id
            : null,
        plant_id:
          form.asset_type === "Plant"
            ? form.plant_id
            : null,
        asset_label: assetLabel || null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        source: form.source,
        source_type: form.source,
        priority: form.priority,
        status: form.status,
        project:
          form.project.trim() ||
          (form.asset_type === "Vehicle"
            ? selectedVehicle?.project
            : selectedPlant?.project) ||
          null,
        crew:
          form.crew.trim() ||
          (form.asset_type === "Vehicle"
            ? selectedVehicle?.crew
            : selectedPlant?.crew) ||
          null,
        reported_by: reportedBy,
        assigned_to: form.assigned_to.trim() || null,
        vendor: form.vendor.trim() || null,
        reported_date: form.reported_date || today(),
        due_date: form.due_date || null,
        completed_date:
          form.status === "Completed" || form.status === "Closed"
            ? form.completed_date || today()
            : null,
        cost:
          form.cost.trim() === ""
            ? null
            : Number(form.cost),
        notes: form.notes.trim() || null,
      };

      const { data, error } = await supabase
        .from("fleet_jobs")
        .insert(payload)
        .select("id, job_number")
        .single();

      if (error) {
        console.error("Full fleet job insert error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          userId: user.id,
          userRole: user.role,
        });

        throw new Error(
          `${error.message}${error.details ? ` — ${error.details}` : ""}`,
        );
      }

      setSuccessMessage(
        data.job_number
          ? `${data.job_number} was created successfully.`
          : "Fleet job created successfully.",
      );

      setForm(createEmptyForm());

      window.setTimeout(() => {
        router.push(`/assets/fleet-jobs/${data.id}`);
        router.refresh();
      }, 700);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create fleet job.";

      console.error("Failed to create fleet job:", error);
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Fleet Jobs"
        title="Log Fleet Job"
        description="Raise a vehicle or plant defect, service item, repair, inspection finding or maintenance requirement."
        actions={
          <ActionButton
            href="/assets/fleet-jobs"
            variant="secondary"
            icon={<ArrowLeft size={16} />}
          >
            Back to Fleet Jobs
          </ActionButton>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-black text-slate-950">
            Job Details
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Select the affected asset and record the work required.
          </p>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 md:col-span-2">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 md:col-span-2">
              <CheckCircle2 size={18} />
              {successMessage}
            </div>
          ) : null}

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Asset Type
            <select
              value={form.asset_type}
              onChange={(event) => {
                const assetType = event.target.value as AssetType;

                setForm((current) => ({
                  ...current,
                  asset_type: assetType,
                  vehicle_id: "",
                  plant_id: "",
                  project: "",
                  crew: "",
                }));
              }}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            >
              <option value="Vehicle">Vehicle</option>
              <option value="Plant">Plant</option>
            </select>
          </label>

          {form.asset_type === "Vehicle" ? (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Vehicle
              <select
                value={form.vehicle_id}
                disabled={loadingAssets}
                onChange={(event) => {
                  const vehicle =
                    vehicles.find(
                      (item) => item.id === event.target.value,
                    ) ?? null;

                  setForm((current) => ({
                    ...current,
                    vehicle_id: event.target.value,
                    project: vehicle?.project ?? "",
                    crew: vehicle?.crew ?? "",
                  }));
                }}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 disabled:bg-slate-100"
              >
                <option value="">
                  {loadingAssets
                    ? "Loading vehicles..."
                    : "Select vehicle"}
                </option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {[
                      vehicle.vehicle_id,
                      vehicle.vehicle_rego,
                      vehicle.make,
                      vehicle.model,
                    ]
                      .map(clean)
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Plant
              <select
                value={form.plant_id}
                disabled={loadingAssets}
                onChange={(event) => {
                  const plant =
                    plantAssets.find(
                      (item) => item.id === event.target.value,
                    ) ?? null;

                  setForm((current) => ({
                    ...current,
                    plant_id: event.target.value,
                    project: plant?.project ?? "",
                    crew: plant?.crew ?? "",
                  }));
                }}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 disabled:bg-slate-100"
              >
                <option value="">
                  {loadingAssets
                    ? "Loading plant..."
                    : "Select plant"}
                </option>
                {plantAssets.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {[
                      plant.asset_id,
                      plant.rego,
                      plant.make,
                      plant.model,
                      plant.plant_type,
                    ]
                      .map(clean)
                      .filter(Boolean)
                      .join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
            Title
            <input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Example: Replace tyre / Repair reverse alarm / Service due"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
            Issue Description
            <textarea
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              rows={5}
              placeholder="Describe the defect, issue or maintenance work required."
              className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Source
            <select
              value={form.source}
              onChange={(event) =>
                updateField(
                  "source",
                  event.target.value as FleetJobSource,
                )
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            >
              {sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Priority
            <select
              value={form.priority}
              onChange={(event) =>
                updateField(
                  "priority",
                  event.target.value as FleetJobPriority,
                )
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Status
            <select
              value={form.status}
              onChange={(event) =>
                updateField(
                  "status",
                  event.target.value as FleetJobStatus,
                )
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Reported Date
            <input
              type="date"
              value={form.reported_date}
              onChange={(event) =>
                updateField("reported_date", event.target.value)
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Due Date
            <input
              type="date"
              value={form.due_date}
              onChange={(event) =>
                updateField("due_date", event.target.value)
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Completed Date
            <input
              type="date"
              value={form.completed_date}
              onChange={(event) =>
                updateField("completed_date", event.target.value)
              }
              disabled={
                form.status !== "Completed" &&
                form.status !== "Closed"
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Project
            <input
              value={form.project}
              onChange={(event) =>
                updateField("project", event.target.value)
              }
              placeholder="Project allocation"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Crew
            <input
              value={form.crew}
              onChange={(event) =>
                updateField("crew", event.target.value)
              }
              placeholder="Crew allocation"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Reported By
            <input
              value={form.reported_by}
              onChange={(event) =>
                updateField("reported_by", event.target.value)
              }
              placeholder="Defaults to logged-in user"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Assigned To
            <input
              value={form.assigned_to}
              onChange={(event) =>
                updateField("assigned_to", event.target.value)
              }
              placeholder="Employee or responsible person"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Vendor / Mechanic
            <input
              value={form.vendor}
              onChange={(event) =>
                updateField("vendor", event.target.value)
              }
              placeholder="Workshop, supplier or mechanic"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Cost Estimate / Cost
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(event) =>
                updateField("cost", event.target.value)
              }
              placeholder="0.00"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700 md:col-span-2">
            Notes
            <textarea
              value={form.notes}
              onChange={(event) =>
                updateField("notes", event.target.value)
              }
              rows={4}
              placeholder="Additional booking, supplier, repair or follow-up notes."
              className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-500"
            />
          </label>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => router.push("/assets/fleet-jobs")}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void submitJob()}
            disabled={saving || loadingAssets}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : null}
            {saving ? "Creating Fleet Job..." : "Create Fleet Job"}
          </button>
        </div>
      </section>
    </PageShell>
  );
}
