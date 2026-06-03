"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  FileText,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { PageHeader, PageShell, StatusBadge } from "../../components";

type Tone = "emerald" | "amber" | "rose" | "blue";

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
  cranesafe_expiry: string | null;
  insurance_expiry: string | null;
  hired: boolean | null;
  hired_from: string | null;
  hire_term: string | null;
  last_service_date?: string | null;
  last_service_hours?: number | null;
  service_interval_hours?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  notes: string | null;
};

type PlantDocument = {
  id: string;
  plant_asset_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  notes: string | null;
  created_at: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function getAssetStatus(asset: PlantAsset) {
  const cranesafeDays = daysUntil(asset.cranesafe_expiry);
  const insuranceDays = daysUntil(asset.insurance_expiry);

  const expiryDays = [cranesafeDays, insuranceDays].filter(
    (day): day is number => day !== null
  );

  if (expiryDays.some((day) => day < 0)) return "Review";
  if (expiryDays.some((day) => day <= 30)) return "Due Soon";
  if (clean(asset.crew) || clean(asset.project)) return "In Use";

  return "Available";
}

function getTone(status: string): Tone {
  const value = status.toLowerCase();

  if (value.includes("available")) return "emerald";
  if (value.includes("due")) return "amber";
  if (value.includes("review") || value.includes("expired")) return "rose";

  return "blue";
}

function ExpiryCard({
  title,
  date,
  icon,
}: {
  title: string;
  date: string | null | undefined;
  icon: React.ReactNode;
}) {
  const remaining = daysUntil(date);

  let tone = "border-slate-200 bg-white text-slate-700";
  let label = "No date recorded";

  if (remaining !== null) {
    if (remaining < 0) {
      tone = "border-rose-200 bg-rose-50 text-rose-800";
      label = `Expired ${Math.abs(remaining)} days ago`;
    } else if (remaining <= 30) {
      tone = "border-amber-200 bg-amber-50 text-amber-800";
      label = `Due in ${remaining} days`;
    } else {
      tone = "border-emerald-200 bg-emerald-50 text-emerald-800";
      label = `Valid for ${remaining} days`;
    }
  }

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className="mt-3 text-2xl font-bold">{formatDate(date)}</p>
      <p className="mt-1 text-sm">{label}</p>
    </div>
  );
}

export default function PlantViewPage() {
  const params = useParams<{ assetId: string }>();
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
  const [documents, setDocuments] = useState<PlantDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAsset() {
      const [assetResult, documentResult] = await Promise.all([
        supabase.from("plant_assets").select("*").eq("id", assetId).single(),
        supabase
          .from("plant_asset_documents")
          .select("*")
          .eq("plant_asset_id", assetId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (assetResult.error) {
        console.error(assetResult.error.message);
        setAsset(null);
      } else {
        setAsset(assetResult.data as PlantAsset);
      }

      if (documentResult.error) {
        console.error(documentResult.error.message);
        setDocuments([]);
      } else {
        setDocuments((documentResult.data ?? []) as PlantDocument[]);
      }

      setLoading(false);
    }

    void loadAsset();

    return () => {
      cancelled = true;
    };
  }, [assetId, supabase]);

  if (loading) {
    return (
      <PageShell>
        <p className="text-sm text-slate-500">Loading plant asset...</p>
      </PageShell>
    );
  }

  if (!asset) {
    return (
      <PageShell>
        <Link
          href="/assets/plant"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={16} />
          Back to Plant
        </Link>

        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h1 className="text-xl font-bold text-rose-900">Plant asset not found</h1>
        </div>
      </PageShell>
    );
  }

  const status = getAssetStatus(asset);
  const statusTone = getTone(status);
  const title = `${clean(asset.asset_id)} — ${[clean(asset.make), clean(asset.model)]
    .filter(Boolean)
    .join(" ")}`;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Plant Asset"
        title={title}
        description="View plant details, allocation, compliance expiries, documents and service status."
        actions={
          <>
            <Link
              href="/assets/plant"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </Link>

            <Link
              href={`/assets/plant/${asset.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Edit
            </Link>

            <Link
              href={`/assets/plant/${asset.id}/docs`}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              + Update Docs
            </Link>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Asset Details
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                {clean(asset.asset_id)}
              </h2>
              <p className="mt-1 text-slate-500">
                {[clean(asset.make), clean(asset.model)].filter(Boolean).join(" ") ||
                  "No make/model recorded"}
              </p>
            </div>

            <StatusBadge label={status} tone={statusTone} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Info label="Type" value={clean(asset.plant_type) || "N/A"} />
            <Info label="Registration" value={clean(asset.rego) || "No rego"} />
            <Info label="Serial Number" value={clean(asset.serial_number) || "N/A"} />
            <Info label="Ownership" value={asset.hired ? "Hired Plant" : "Owned"} />
            {asset.hired && (
              <>
                <Info label="Hired From" value={clean(asset.hired_from) || "N/A"} />
                <Info label="Hire Term" value={clean(asset.hire_term) || "N/A"} />
              </>
            )}
          </div>

          {clean(asset.notes) && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Notes</p>
              <p className="mt-2 text-sm text-slate-700">{asset.notes}</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Current Allocation
          </p>

          <div className="mt-5 space-y-4">
            <Info label="Crew" value={clean(asset.crew) || "Unassigned"} />
            <Info label="Project" value={clean(asset.project) || "No project"} />
            <Info label="Last Updated" value={formatDate(asset.updated_at)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ExpiryCard
          title="Insurance Expiry"
          date={asset.insurance_expiry}
          icon={<ShieldCheck size={18} />}
        />

        <ExpiryCard
          title="CraneSafe Expiry"
          date={asset.cranesafe_expiry}
          icon={<Truck size={18} />}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Wrench size={18} className="text-slate-500" />
          <h2 className="text-lg font-bold text-slate-950">Service Status</h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Info label="Last Service Date" value={formatDate(asset.last_service_date)} />
          <Info
            label="Last Service Hours"
            value={
              asset.last_service_hours !== null && asset.last_service_hours !== undefined
                ? `${asset.last_service_hours} hrs`
                : "Not recorded"
            }
          />
          <Info
            label="Service Interval"
            value={
              asset.service_interval_hours !== null &&
              asset.service_interval_hours !== undefined
                ? `${asset.service_interval_hours} hrs`
                : "Not recorded"
            }
          />
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Next service due will be calculated from prestart hour-meter readings once the prestart
          module is linked.
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-slate-500" />
          <h2 className="text-lg font-bold text-slate-950">Document History</h2>
        </div>

        {documents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No documents uploaded yet.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="font-semibold text-slate-950">{document.document_type}</p>
                  <p className="mt-1 text-sm text-slate-500">{document.file_name}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <Calendar size={13} />
                    Uploaded {formatDate(document.created_at)}
                  </p>
                </div>

                <a
                  href={document.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}