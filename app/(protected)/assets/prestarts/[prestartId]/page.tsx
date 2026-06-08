"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Briefcase, Car, Pencil } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { DetailGrid, PageHeader, PageShell, StatusBadge } from "../../components";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

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
  updated_at: string | null;
};

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

type FleetJob = {
  id: string;
  title: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  created_at: string | null;
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function checklistLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function answerTone(answer: string): Tone {
  if (answer === "yes") return "emerald";
  if (answer === "no") return "rose";
  return "slate";
}

function answerLabel(answer: string) {
  if (answer === "yes") return "Y";
  if (answer === "no") return "N";
  return "N/A";
}

function priorityTone(priority: string | null): Tone {
  if (priority === "Low") return "blue";
  if (priority === "Medium") return "amber";
  if (priority === "High" || priority === "Critical") return "rose";
  return "slate";
}

export default function PrestartDetailPage() {
  const params = useParams<{ prestartId: string }>();
  const prestartId = params.prestartId;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [prestart, setPrestart] = useState<VehiclePrestart | null>(null);
  const [vehicle, setVehicle] = useState<VehicleAsset | null>(null);
  const [fleetJob, setFleetJob] = useState<FleetJob | null>(null);

  useEffect(() => {
    async function loadPrestart() {
      setLoading(true);

      const { data: prestartData, error: prestartError } = await supabase
        .from("vehicle_prestarts")
        .select("*")
        .eq("id", prestartId)
        .single();

      if (prestartError || !prestartData) {
        console.error("Failed to load prestart:", prestartError?.message);
        setPrestart(null);
        setLoading(false);
        return;
      }

      const loadedPrestart = prestartData as VehiclePrestart;
      setPrestart(loadedPrestart);

      if (loadedPrestart.vehicle_asset_id) {
        const { data: vehicleData } = await supabase
          .from("vehicle_assets")
          .select("*")
          .eq("id", loadedPrestart.vehicle_asset_id)
          .maybeSingle();

        setVehicle((vehicleData as VehicleAsset) ?? null);
      }

      if (loadedPrestart.fleet_job_id) {
        const { data: fleetJobData } = await supabase
          .from("fleet_jobs")
          .select("*")
          .eq("id", loadedPrestart.fleet_job_id)
          .maybeSingle();

        setFleetJob((fleetJobData as FleetJob) ?? null);
      }

      setLoading(false);
    }

    void loadPrestart();
  }, [prestartId, supabase]);

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Vehicle Prestart"
          title="Loading prestart..."
          description="Fetching submitted vehicle prestart details."
        />
      </PageShell>
    );
  }

  if (!prestart) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Vehicle Prestart"
          title="Prestart not found"
          description="This prestart could not be found."
          actions={
            <Link
              href="/assets/prestarts"
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to Prestarts
            </Link>
          }
        />
      </PageShell>
    );
  }

  const checklist = prestart.checklist ?? {};
  const vehicleTitle =
    clean(prestart.asset_label) ||
    [clean(vehicle?.vehicle_id), clean(vehicle?.make), clean(vehicle?.model)]
      .filter(Boolean)
      .join(" ") ||
    "Vehicle Prestart";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Vehicle Prestart"
        title={vehicleTitle}
        description={`Submitted by ${clean(prestart.inspected_by_name) || "Unknown"} on ${formatDate(
          prestart.created_at,
        )}`}
        actions={
          <>
            <Link
              href="/assets/prestarts"
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to Prestarts
            </Link>

            <Link
              href={`/assets/prestarts/${prestart.id}/edit`}
              className="inline-flex min-h-10 items-center gap-2 bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Pencil size={16} />
              Edit
            </Link>
          </>
        }
      />

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <DetailGrid
          items={[
            {
              label: "Result",
              value: (
                <StatusBadge
                  label={clean(prestart.result) || "Unknown"}
                  tone={severityTone(prestart.severity)}
                />
              ),
            },
            {
              label: "Severity",
              value: (
                <StatusBadge
                  label={severityLabel(prestart.severity)}
                  tone={severityTone(prestart.severity)}
                />
              ),
            },
            { label: "Inspected By", value: clean(prestart.inspected_by_name) || "-" },
            { label: "Submitted", value: formatDate(prestart.created_at) },
            { label: "Kilometres", value: clean(prestart.kilometres) || "-" },
            { label: "Project", value: clean(prestart.project) || "-" },
            { label: "Crew", value: clean(prestart.crew) || "-" },
            { label: "Condition", value: clean(prestart.overall_condition) || "-" },
          ]}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Car size={18} className="text-slate-500" />
            <h2 className="text-lg font-bold text-slate-950">Vehicle Details</h2>
          </div>

          <div className="mt-4">
            <DetailGrid
              items={[
                { label: "Asset ID", value: clean(vehicle?.vehicle_id) || clean(prestart.asset_label) || "-" },
                { label: "Rego", value: clean(vehicle?.vehicle_rego) || clean(prestart.vehicle_rego) || "-" },
                { label: "Make", value: clean(vehicle?.make) || "-" },
                { label: "Model", value: clean(vehicle?.model) || "-" },
                { label: "Category", value: clean(vehicle?.category) || "-" },
                { label: "Status", value: clean(vehicle?.status) || "-" },
                { label: "Asset Project", value: clean(vehicle?.project) || "-" },
                { label: "Asset Crew", value: clean(vehicle?.crew) || "-" },
              ]}
            />
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Briefcase size={18} className="text-slate-500" />
            <h2 className="text-lg font-bold text-slate-950">Linked Fleet Job</h2>
          </div>

          {prestart.fleet_job_id ? (
            <div className="mt-4 space-y-4">
              <DetailGrid
                items={[
                  { label: "Title", value: clean(fleetJob?.title) || "Fleet Job Created" },
                  {
                    label: "Priority",
                    value: (
                      <StatusBadge
                        label={clean(fleetJob?.priority) || "Open"}
                        tone={priorityTone(fleetJob?.priority ?? null)}
                      />
                    ),
                  },
                  { label: "Status", value: clean(fleetJob?.status) || "Open" },
                  { label: "Created", value: formatDate(fleetJob?.created_at ?? null) },
                ]}
              />

              <Link
                href={`/assets/fleet-jobs/${prestart.fleet_job_id}`}
                className="inline-flex min-h-10 items-center gap-2 bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Open Fleet Job
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              No Fleet Job was created for this prestart.
            </p>
          )}
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Vehicle Checklist</h2>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(checklist).map(([key, answer]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="truncate text-sm font-semibold text-slate-800">
                {checklistLabel(key)}
              </span>

              <StatusBadge
                label={answerLabel(answer)}
                tone={answerTone(answer)}
              />
            </div>
          ))}
        </div>

        {Object.keys(checklist).length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No checklist answers were recorded.
          </p>
        ) : null}
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">
          Defects / General Comments
        </h2>

        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {clean(prestart.comments) || "No comments provided."}
        </p>
      </section>
    </PageShell>
  );
}