/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PageHeader, PageShell } from "../../components";

type VehicleForm = {
  vehicle_id: string;
  vehicle_rego: string;
  make: string;
  model: string;
  category: string;
  site: string;
  status: string;
  year: string;
  style: string;
  owner: string;
  vin_number: string;
  last_service: string;
  rego_expiry: string;
  insurance_expiry: string;
  risk_assessment: string;
  ehub: boolean;
  dashcam: boolean;
  alert_button: boolean;
  fuel_card: boolean;
  hired: boolean;
  link: string;
  notes: string;
};

const initialForm: VehicleForm = {
  vehicle_id: "",
  vehicle_rego: "",
  make: "",
  model: "",
  category: "Light Vehicle",
  site: "",
  status: "Available",
  year: "",
  style: "",
  owner: "",
  vin_number: "",
  last_service: "",
  rego_expiry: "",
  insurance_expiry: "",
  risk_assessment: "",
  ehub: false,
  dashcam: false,
  alert_button: false,
  fuel_card: false,
  hired: false,
  link: "",
  notes: "",
};

const categories = ["Light Vehicle", "Heavy Vehicle", "Trailer"];
const statuses = [
  "Available",
  "In Use",
  "Not Hired",
  "Superseded",
  "Retired",
  "Under Maintenance",
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function AddVehiclePage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const [form, setForm] = useState<VehicleForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function updateField<K extends keyof VehicleForm>(
    key: K,
    value: VehicleForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");

    const payload = {
      vehicle_id: form.vehicle_id.trim() || null,
      vehicle_rego: form.vehicle_rego.trim() || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      category: form.category || null,
      site: form.site.trim() || null,
      status: form.status || null,
      year: form.year.trim() || null,
      style: form.style.trim() || null,
      owner: form.owner.trim() || null,
      vin_number: form.vin_number.trim() || null,
      last_service: form.last_service || null,
      rego_expiry: form.rego_expiry || null,
      insurance_expiry: form.insurance_expiry || null,
      risk_assessment: form.risk_assessment.trim() || null,
      ehub: form.ehub,
      dashcam: form.dashcam,
      alert_button: form.alert_button,
      fuel_card: form.fuel_card,
      hired: form.hired,
      link: form.link.trim() || null,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase.from("vehicle_assets").insert(payload);

    if (error) {
      setErrorMessage(error.message);
      setSaving(false);
      return;
    }

    router.push("/assets/vehicles");
    router.refresh();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asset Register"
        title="Add Vehicle"
        description="Add a light vehicle, heavy vehicle or trailer. Only the basic fields are required now; service, insurance and compliance details can be completed later."
        actions={
          <Link
            href="/assets/vehicles"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Vehicles
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        <Section
          title="Basic Vehicle Details"
          description="This is what appears on the main vehicle register."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Vehicle ID"
              value={form.vehicle_id}
              onChange={(value) => updateField("vehicle_id", value)}
              placeholder="LV001, HV003, TR002"
              required
            />

            <Field
              label="Rego"
              value={form.vehicle_rego}
              onChange={(value) => updateField("vehicle_rego", value.toUpperCase())}
              placeholder="ABC123"
              required
            />

            <SelectField
              label="Category"
              value={form.category}
              onChange={(value) => updateField("category", value)}
              options={categories}
            />

            <Field
              label="Make"
              value={form.make}
              onChange={(value) => updateField("make", value)}
              placeholder="Toyota"
            />

            <Field
              label="Model"
              value={form.model}
              onChange={(value) => updateField("model", value)}
              placeholder="Hilux"
            />

            <Field
              label="Year"
              value={form.year}
              onChange={(value) => updateField("year", value)}
              placeholder="2023"
            />

            <Field
              label="Style"
              value={form.style}
              onChange={(value) => updateField("style", value)}
              placeholder="Dual cab, prime mover, trailer"
            />

            <Field
              label="Site"
              value={form.site}
              onChange={(value) => updateField("site", value)}
              placeholder="Depot, Maragle, Lobs Hole"
            />

            <SelectField
              label="Status"
              value={form.status}
              onChange={(value) => updateField("status", value)}
              options={statuses}
            />
          </div>
        </Section>

        <Section
          title="Registration & Ownership"
          description="Useful details for the view page, compliance checks and admin follow-up."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Owner"
              value={form.owner}
              onChange={(value) => updateField("owner", value)}
              placeholder="BC Contracting, hire company, supplier"
            />

            <Field
              label="VIN Number"
              value={form.vin_number}
              onChange={(value) => updateField("vin_number", value.toUpperCase())}
              placeholder="VIN / chassis number"
            />

            <Field
              label="Rego Expiry"
              type="date"
              value={form.rego_expiry}
              onChange={(value) => updateField("rego_expiry", value)}
            />

            <Field
              label="Insurance Expiry"
              type="date"
              value={form.insurance_expiry}
              onChange={(value) => updateField("insurance_expiry", value)}
            />

            <Field
              label="Last Service"
              type="date"
              value={form.last_service}
              onChange={(value) => updateField("last_service", value)}
            />

            <Field
              label="Document Link"
              value={form.link}
              onChange={(value) => updateField("link", value)}
              placeholder="SharePoint / document link"
            />
          </div>
        </Section>

        <Section
          title="Vehicle Setup"
          description="Tick what applies. Trailers can leave vehicle-specific items unticked."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <CheckField
              label="eHub fitted"
              checked={form.ehub}
              onChange={(value) => updateField("ehub", value)}
            />

            <CheckField
              label="Dashcam fitted"
              checked={form.dashcam}
              onChange={(value) => updateField("dashcam", value)}
            />

            <CheckField
              label="Alert button fitted"
              checked={form.alert_button}
              onChange={(value) => updateField("alert_button", value)}
            />

            <CheckField
              label="Fuel card issued"
              checked={form.fuel_card}
              onChange={(value) => updateField("fuel_card", value)}
            />

            <CheckField
              label="Currently hired"
              checked={form.hired}
              onChange={(value) => updateField("hired", value)}
            />
          </div>
        </Section>

        <Section
          title="Compliance Notes"
          description="Risk assessment and extra notes can be refined later from the edit page."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Risk Assessment
              </span>
              <textarea
                value={form.risk_assessment}
                onChange={(event) =>
                  updateField("risk_assessment", event.target.value)
                }
                placeholder="Risk assessment status, location or notes..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Notes
              </span>
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Anything else important..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
            </label>
          </div>
        </Section>

        <div className="sticky bottom-4 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          <Link
            href="/assets/vehicles"
            className="inline-flex justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex justify-center items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Vehicle"}
          </button>
        </div>
      </form>
    </PageShell>
  );
}