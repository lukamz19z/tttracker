"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Save } from "lucide-react";
import { PageHeader, PageShell } from "../../../components";

type PlantAsset = {
  id: string;
  asset_id: string | null;
  make: string | null;
  model: string | null;
  plant_type: string | null;
  serial_number: string | null;
  rego: string | null;
  crew: string | null;
  project: string | null;
  insurance_expiry: string | null;
  rego_expiry: string | null;
  cranesafe_expiry: string | null;
  last_service_date: string | null;
  last_service_hours: number | null;
  service_interval_hours: number | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CrewOption = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
};

type ProjectOption = {
  id: string;
  name: string;
};

const plantTypeOptions = ["Crane", "Telehandler", "Other"];

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isCrane(asset: PlantAsset) {
  return clean(asset.plant_type).toLowerCase() === "crane";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EditPlantPage() {
  const params = useParams<{ assetId: string }>();
  const router = useRouter();
  const assetId = params.assetId;

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [asset, setAsset] = useState<PlantAsset | null>(null);
  const [crews, setCrews] = useState<CrewOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const [assetResult, crewResult, projectResult] = await Promise.all([
        supabase.from("plant_assets").select("*").eq("id", assetId).single(),
        supabase
          .from("crews")
          .select("id, crew_number, crew_name, leading_hand")
          .order("crew_number", { ascending: true }),
        supabase.from("projects").select("id, name").order("name", { ascending: true }),
      ]);

      if (cancelled) return;

      if (!assetResult.error) setAsset(assetResult.data as PlantAsset);
      if (!crewResult.error) setCrews((crewResult.data ?? []) as CrewOption[]);
      if (!projectResult.error) setProjects((projectResult.data ?? []) as ProjectOption[]);
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [assetId, supabase]);

  async function saveAsset() {
    if (!asset) return;

    if (!clean(asset.asset_id)) {
      alert("Asset ID is required.");
      return;
    }

    if (!clean(asset.plant_type)) {
      alert("Plant type is required.");
      return;
    }

    setSaving(true);

    const payload = {
      asset_id: clean(asset.asset_id),
      make: clean(asset.make),
      model: clean(asset.model),
      plant_type: clean(asset.plant_type),
      serial_number: clean(asset.serial_number),
      rego: clean(asset.rego),
      crew: clean(asset.crew),
      project: clean(asset.project),
      insurance_expiry: clean(asset.insurance_expiry) || null,
      rego_expiry: clean(asset.rego_expiry) || null,
      cranesafe_expiry: isCrane(asset) ? clean(asset.cranesafe_expiry) || null : null,
      last_service_date: clean(asset.last_service_date) || null,
      last_service_hours:
        asset.last_service_hours !== null && asset.last_service_hours !== undefined
          ? Number(asset.last_service_hours)
          : null,
      service_interval_hours:
        asset.service_interval_hours !== null && asset.service_interval_hours !== undefined
          ? Number(asset.service_interval_hours)
          : null,
      hired: Boolean(asset.hired),
      hired_from: asset.hired ? clean(asset.hired_from) : "",
      hire_term: asset.hired ? clean(asset.hire_term) : "",
      notes: clean(asset.notes),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("plant_assets").update(payload).eq("id", assetId);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push(`/assets/plant/${assetId}`);
  }

  if (!asset) {
    return (
      <PageShell>
        <p className="text-sm text-slate-500">Loading asset...</p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Edit Plant"
        title={`${clean(asset.asset_id)} — ${[clean(asset.make), clean(asset.model)]
          .filter(Boolean)
          .join(" ")}`}
        description="Edit asset details, allocation, compliance dates and service setup."
        actions={
          <>
            <Link
              href={`/assets/plant/${assetId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </Link>

            <button
              type="button"
              onClick={() => void saveAsset()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Asset Details</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <TextInput label="Asset ID" value={asset.asset_id} onChange={(value) => setAsset({ ...asset, asset_id: value })} />
          <TextInput label="Make" value={asset.make} onChange={(value) => setAsset({ ...asset, make: value })} />
          <TextInput label="Model" value={asset.model} onChange={(value) => setAsset({ ...asset, model: value })} />
          <TextInput label="Serial Number" value={asset.serial_number} onChange={(value) => setAsset({ ...asset, serial_number: value })} />
          <TextInput label="Rego" value={asset.rego} onChange={(value) => setAsset({ ...asset, rego: value })} />

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-600">Type</span>
            <select
              value={clean(asset.plant_type)}
              onChange={(event) =>
                setAsset({
                  ...asset,
                  plant_type: event.target.value,
                  cranesafe_expiry:
                    event.target.value === "Crane" ? asset.cranesafe_expiry : null,
                })
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
            >
              <option value="">Select type</option>
              {plantTypeOptions.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-600">Crew</span>
            <select
              value={clean(asset.crew)}
              onChange={(event) => setAsset({ ...asset, crew: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
            >
              <option value="">Unassigned</option>
              {crews.map((crew) => {
                const crewNumber = clean(crew.crew_number);
                const crewName = clean(crew.crew_name);
                const leadingHand = clean(crew.leading_hand);

                const label = [
                  crewNumber || "Unnamed Crew",
                  crewName,
                  leadingHand ? `LH: ${leadingHand}` : "",
                ]
                  .filter(Boolean)
                  .join(" - ");

                return (
                  <option key={crew.id} value={crewNumber || label}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-600">Project</span>
            <select
              value={clean(asset.project)}
              onChange={(event) => setAsset({ ...asset, project: event.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.name}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Compliance Dates</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <DateInput
            label="Insurance Expiry"
            value={asset.insurance_expiry}
            onChange={(value) => setAsset({ ...asset, insurance_expiry: value })}
          />

          <DateInput
            label="Registration Expiry"
            value={asset.rego_expiry}
            onChange={(value) => setAsset({ ...asset, rego_expiry: value })}
          />

          {isCrane(asset) ? (
            <DateInput
              label="CraneSafe Expiry"
              value={asset.cranesafe_expiry}
              onChange={(value) => setAsset({ ...asset, cranesafe_expiry: value })}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              <p className="font-semibold text-slate-700">CraneSafe Expiry</p>
              <p className="mt-1">Only required for Crane assets.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Service Setup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Prestarts will later update current hours. For now this stores the last known service setup.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <DateInput
            label="Last Service Date"
            value={asset.last_service_date}
            onChange={(value) => setAsset({ ...asset, last_service_date: value })}
          />

          <NumberInput
            label="Last Service Hours"
            value={asset.last_service_hours}
            onChange={(value) => setAsset({ ...asset, last_service_hours: value })}
          />

          <NumberInput
            label="Service Interval Hours"
            value={asset.service_interval_hours}
            onChange={(value) => setAsset({ ...asset, service_interval_hours: value })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Hire Details</h2>

        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(asset.hired)}
            onChange={(event) =>
              setAsset({
                ...asset,
                hired: event.target.checked,
                hired_from: event.target.checked ? asset.hired_from : "",
                hire_term: event.target.checked ? asset.hire_term : "",
              })
            }
          />
          Hired plant
        </label>

        {asset.hired && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextInput label="Hired From" value={asset.hired_from} onChange={(value) => setAsset({ ...asset, hired_from: value })} />

            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-600">Hire Term</span>
              <select
                value={clean(asset.hire_term)}
                onChange={(event) => setAsset({ ...asset, hire_term: event.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
              >
                <option value="">Select term</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Project Duration">Project Duration</option>
                <option value="As Required">As Required</option>
              </select>
            </label>
          </div>
        )}

        <label className="mt-4 block space-y-1 text-sm">
          <span className="font-semibold text-slate-600">Notes</span>
          <textarea
            value={clean(asset.notes)}
            onChange={(event) => setAsset({ ...asset, notes: event.target.value })}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        <p>Created: {formatDateTime(asset.created_at)}</p>
        <p className="mt-1">Last updated: {formatDateTime(asset.updated_at)}</p>
      </section>
    </PageShell>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <input
        value={clean(value)}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <input
        type="date"
        value={clean(value)}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400"
      />
    </label>
  );
}