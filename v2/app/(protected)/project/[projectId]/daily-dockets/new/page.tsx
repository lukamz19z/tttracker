"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardCopy, FilePlus2, HardHat } from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";

type TowerRow = {
  id: string;
  name: string | null;
  line: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DocketRow = {
  id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
};

function safe(value: unknown) {
  return value == null ? "" : String(value);
}

function towerLabel(tower: TowerRow) {
  const extra = tower.extra_data || {};
  return (
    safe(extra["Tower Number"]) ||
    safe(extra["tower_number"]) ||
    safe(extra["Structure Number"]) ||
    safe(extra["structure_number"]) ||
    safe(tower.name) ||
    "Unnamed tower"
  );
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function NewProjectDailyDocketPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.projectId || "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [towers, setTowers] = useState<TowerRow[]>([]);
  const [dockets, setDockets] = useState<DocketRow[]>([]);
  const [docketDate, setDocketDate] = useState(localDateKey());
  const [towerId, setTowerId] = useState("");
  const [copyPrevious, setCopyPrevious] = useState(true);
  const [previousDocketId, setPreviousDocketId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [towerRes, docketRes] = await Promise.all([
        supabase
          .from("towers")
          .select("id,name,line,extra_data")
          .eq("project_id", projectId),
        supabase
          .from("tower_daily_dockets")
          .select("id,tower_id,docket_date,crew,leading_hand")
          .eq("project_id", projectId)
          .order("docket_date", { ascending: false }),
      ]);

      if (cancelled) return;

      setTowers(
        ((towerRes.data || []) as TowerRow[]).sort((a, b) =>
          towerLabel(a).localeCompare(towerLabel(b), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
      );
      setDockets((docketRes.data || []) as DocketRow[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const selectedTower = towers.find((tower) => tower.id === towerId) || null;

  const previousOptions = useMemo(
    () =>
      dockets
        .filter((docket) => docket.tower_id === towerId)
        .filter(
          (docket) =>
            !docketDate ||
            !docket.docket_date ||
            docket.docket_date.slice(0, 10) < docketDate,
        )
        .slice(0, 12),
    [docketDate, dockets, towerId],
  );

  useEffect(() => {
    if (!towerId) {
      setPreviousDocketId("");
      return;
    }

    setPreviousDocketId(previousOptions[0]?.id || "");
  }, [previousOptions, towerId]);

  function continueToEditor() {
    if (!towerId) return;

    const query = new URLSearchParams();
    if (docketDate) query.set("docketDate", docketDate);
    if (copyPrevious && previousDocketId) {
      query.set("copyDocketId", previousDocketId);
    }

    const suffix = query.toString() ? `?${query.toString()}` : "";
    router.push(
      `/project/${projectId}/tower/${towerId}/dockets/new${suffix}`,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            Daily Dockets
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            New Daily Docket
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Start the docket from the project, select the primary tower, then
            continue into the V1-proven crew, plant, progress, events and review
            workflow.
          </p>
        </div>

        <Link
          href={`/project/${projectId}/daily-dockets`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
            <FilePlus2 size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-950">Docket setup</h2>
            <p className="mt-1 text-sm text-slate-500">
              The primary tower is selected here. Crew, personnel, plant and
              work information remain inside the actual docket editor.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Docket date">
            <input
              type="date"
              value={docketDate}
              onChange={(event) => setDocketDate(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"
            />
          </Field>

          <Field label="Primary tower">
            <select
              value={towerId}
              onChange={(event) => setTowerId(event.target.value)}
              disabled={loading}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm disabled:bg-slate-100"
            >
              <option value="">
                {loading ? "Loading towers..." : "Select tower..."}
              </option>
              {towers.map((tower) => (
                <option key={tower.id} value={tower.id}>
                  {towerLabel(tower)}
                  {tower.line ? ` · ${tower.line}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {selectedTower ? (
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2 font-black text-blue-950">
              <HardHat size={17} />
              {towerLabel(selectedTower)}
            </div>
            {selectedTower.line ? (
              <div className="mt-1 text-sm text-blue-700">
                {selectedTower.line}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-black text-slate-950">
              <ClipboardCopy size={18} />
              Previous docket
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Select the previous docket for this tower. The editor should only
              carry forward workforce, plant, defaults and opening progress —
              not delays, material events, defects, incidents, comments,
              signatures or approval state.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={copyPrevious}
              onChange={(event) => setCopyPrevious(event.target.checked)}
              disabled={!towerId}
            />
            Copy previous
          </label>
        </div>

        <div className="mt-4">
          <Field label="Copy from">
            <select
              value={previousDocketId}
              onChange={(event) => setPreviousDocketId(event.target.value)}
              disabled={!towerId || !copyPrevious || previousOptions.length === 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm disabled:bg-slate-100"
            >
              <option value="">
                {!towerId
                  ? "Select a tower first"
                  : previousOptions.length === 0
                    ? "No previous docket available"
                    : "Do not copy a previous docket"}
              </option>
              {previousOptions.map((docket) => (
                <option key={docket.id} value={docket.id}>
                  {formatDate(docket.docket_date)}
                  {docket.crew ? ` · ${docket.crew}` : ""}
                  {docket.leading_hand ? ` · ${docket.leading_hand}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!towerId}
          onClick={continueToEditor}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Continue to Docket Editor
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
