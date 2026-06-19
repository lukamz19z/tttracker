/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../../../components";

type AssetType = "Vehicle" | "Plant";
type Tone = "emerald" | "amber" | "rose" | "blue" | "slate";

type ChecklistValue = {
  answer: string;
  severity: string;
  comment: string;
};

type PrestartRecord = {
  id: string;
  docket_number: string | null;
  asset_type: string | null;
  asset_label: string | null;
  vehicle_rego: string | null;
  asset_category: string | null;
  vehicle_asset_id: string | null;
  plant_asset_id: string | null;
  prestart_date: string | null;
  kilometres: number | null;
  cab_hours: number | null;
  project: string | null;
  crew: string | null;
  inspected_by_name: string | null;
  checklist: Record<string, ChecklistValue | string> | null;
  overall_condition: string | null;
  comments: string | null;
  severity: string | null;
  result: string | null;
  fleet_job_id: string | null;
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
      "Lubrication",
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
      "Lubrication",
      "Crane structural components",
    ],
  },
  {
    title: "Hydraulics",
    items: ["Hydraulic oil level", "Hydraulic oil line leaks", "Cylinder leaks"],
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function checklistKey(label: string) {
  return label.toLowerCase().replaceAll(" ", "_").replaceAll("/", "_");
}

function normaliseChecklist(
  checklist: Record<string, ChecklistValue | string> | null,
  items: string[],
) {
  const existing = checklist ?? {};

  return items.reduce<Record<string, ChecklistValue>>((acc, item) => {
    const key = checklistKey(item);
    const value = existing[key];

    if (typeof value === "string") {
      acc[key] = {
        answer: value || "yes",
        severity: "minor",
        comment: "",
      };
    } else {
      acc[key] = {
        answer: value?.answer || "yes",
        severity: value?.severity || "minor",
        comment: value?.comment || "",
      };
    }

    return acc;
  }, {});
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

function ChecklistButton({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: "yes" | "no" | "na";
}) {
  const activeClass =
    tone === "yes"
      ? "border-emerald-500 bg-emerald-600 text-white"
      : tone === "no"
        ? "border-rose-500 bg-rose-600 text-white"
        : "border-slate-500 bg-slate-700 text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-md border px-2 text-[11px] font-black ${
        active
          ? activeClass
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${classes}`}>
      {label}
    </span>
  );
}

export default function EditPrestartPage() {
  const params = useParams<{ prestartId: string }>();
  const prestartId = params.prestartId;
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prestart, setPrestart] = useState<PrestartRecord | null>(null);

  const [prestartDate, setPrestartDate] = useState("");
  const [reading, setReading] = useState("");
  const [project, setProject] = useState("");
  const [crew, setCrew] = useState("");
  const [inspectedBy, setInspectedBy] = useState("");
  const [overallCondition, setOverallCondition] = useState("Good");
  const [comments, setComments] = useState("");
  const [checklistValues, setChecklistValues] = useState<Record<string, ChecklistValue>>({});

  const assetType: AssetType =
    clean(prestart?.asset_type).toLowerCase() === "plant" ? "Plant" : "Vehicle";

  const activeSections =
    assetType === "Plant" ? plantChecklistSections : vehicleChecklistSections;

  const activeItems = activeSections.flatMap((section) => section.items);

  useEffect(() => {
    async function loadPrestart() {
      setLoading(true);

      const { data, error } = await supabase
        .from("vehicle_prestarts")
        .select("*")
        .eq("id", prestartId)
        .single();

      if (error || !data) {
        setPrestart(null);
        setLoading(false);
        return;
      }

      const loaded = data as PrestartRecord;
      const loadedAssetType: AssetType =
        clean(loaded.asset_type).toLowerCase() === "plant" ? "Plant" : "Vehicle";

      const sections =
        loadedAssetType === "Plant" ? plantChecklistSections : vehicleChecklistSections;

      const items = sections.flatMap((section) => section.items);

      setPrestart(loaded);
      setPrestartDate(loaded.prestart_date || "");
      setReading(
        loadedAssetType === "Plant"
          ? clean(loaded.cab_hours)
          : clean(loaded.kilometres),
      );
      setProject(clean(loaded.project));
      setCrew(clean(loaded.crew));
      setInspectedBy(clean(loaded.inspected_by_name));
      setOverallCondition(clean(loaded.overall_condition) || "Good");
      setComments(clean(loaded.comments));
      setChecklistValues(normaliseChecklist(loaded.checklist, items));

      setLoading(false);
    }

    void loadPrestart();
  }, [prestartId, supabase]);

  async function handleSave() {
    if (!prestart) return;

    setSaving(true);

    const failedItems = activeItems.filter((item) => {
      const key = checklistKey(item);
      return checklistValues[key]?.answer === "no";
    });

    const missingComments = failedItems.filter((item) => {
      const key = checklistKey(item);
      return !checklistValues[key]?.comment?.trim();
    });

    if (missingComments.length > 0) {
      alert(`Comments required for: ${missingComments.join(", ")}`);
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
      const row = checklistValues[key];

      return `${item}
Severity: ${severityLabel(row?.severity || "minor")}
Comment: ${row?.comment?.trim() || "No comment provided"}`;
    });

    const fleetJobDescription = [
      failedChecklistDetails.length > 0
        ? `${assetType} prestart defect(s):\n\n${failedChecklistDetails.join("\n\n")}`
        : "",
      comments ? `General comments:\n${comments}` : "",
      assetType === "Plant" ? `Cab hours: ${reading}` : "",
      assetType === "Vehicle" ? `Kilometres: ${reading}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const updatePayload = {
      prestart_date: prestartDate || null,
      kilometres: assetType === "Vehicle" ? Number(reading || 0) : null,
      cab_hours: assetType === "Plant" ? Number(reading || 0) : null,
      project: project || null,
      crew: crew || null,
      inspected_by_name: inspectedBy || null,
      checklist: checklistValues,
      overall_condition: overallCondition || null,
      comments,
      severity,
      result: severityToResult(severity),
    };

    const { error } = await supabase
      .from("vehicle_prestarts")
      .update(updatePayload)
      .eq("id", prestart.id);

    if (error) {
      alert(`Failed to update prestart: ${error.message}`);
      setSaving(false);
      return;
    }

    if (prestart.fleet_job_id) {
      await supabase
        .from("fleet_jobs")
        .update({
          title:
            failedItems.length === 1
              ? `${severityLabel(severity)} issue - ${failedItems[0]} - ${prestart.asset_label}`
              : `${severityLabel(severity)} prestart issues - ${prestart.asset_label}`,
          description:
            fleetJobDescription || "Prestart edited. No current defects recorded.",
          priority: severityToPriority(severity),
          status: severity === "none" ? "Closed" : "Open",
          project: project || null,
          crew: crew || null,
          reported_by: inspectedBy || null,
        })
        .eq("id", prestart.fleet_job_id);
    } else if (severity !== "none") {
      const jobNumber = `FJ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const { data: fleetJob } = await supabase
        .from("fleet_jobs")
        .insert({
          job_number: jobNumber,
          asset_type: assetType,
          vehicle_id: assetType === "Vehicle" ? prestart.vehicle_asset_id : null,
          plant_id: assetType === "Plant" ? prestart.plant_asset_id : null,
          vehicle_asset_id:
            assetType === "Vehicle" ? prestart.vehicle_asset_id : null,
          plant_asset_id: assetType === "Plant" ? prestart.plant_asset_id : null,
          prestart_id: prestart.id,
          source_type:
            assetType === "Vehicle" ? "vehicle_prestart" : "plant_prestart",
          source_id: prestart.id,
          source: "Prestart",
          asset_label: prestart.asset_label,
          title:
            failedItems.length === 1
              ? `${severityLabel(severity)} issue - ${failedItems[0]} - ${prestart.asset_label}`
              : `${severityLabel(severity)} prestart issues - ${prestart.asset_label}`,
          description: fleetJobDescription || "Issue raised from edited prestart.",
          priority: severityToPriority(severity),
          status: "Open",
          project: project || null,
          crew: crew || null,
          reported_by: inspectedBy || null,
          reported_date: prestartDate || null,
          notes: `Created automatically from edited ${assetType.toLowerCase()} prestart.`,
        })
        .select("id")
        .single();

      if (fleetJob?.id) {
        await supabase
          .from("vehicle_prestarts")
          .update({ fleet_job_id: fleetJob.id })
          .eq("id", prestart.id);
      }
    }

    setSaving(false);
    router.push(`/assets/prestarts/${prestart.id}`);
  }

  if (loading) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Edit Prestart"
          title="Loading prestart..."
          description="Fetching prestart details."
        />
      </PageShell>
    );
  }

  if (!prestart) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Edit Prestart"
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

  return (
    <PageShell>
      <PageHeader
        eyebrow="Edit Prestart"
        title={`Edit ${prestart.docket_number || prestart.id}`}
        description={`Correct this ${assetType.toLowerCase()} prestart. Failed checklist items require severity and comments.`}
        actions={
          <>
            <Link
              href={`/assets/prestarts/${prestart.id}`}
              className="inline-flex min-h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back to View
            </Link>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-2 bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Asset
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {prestart.asset_label || "Asset"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill label={assetType} tone={assetType === "Plant" ? "blue" : "emerald"} />
              <StatusPill label={severityLabel(prestart.severity)} tone={severityTone(prestart.severity)} />
            </div>
          </div>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Prestart Date
            <input
              type="date"
              value={prestartDate}
              onChange={(event) => setPrestartDate(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            {assetType === "Plant" ? "Upper Cab Hours" : "Kilometres"}
            <input
              type="number"
              min="0"
              step={assetType === "Plant" ? "0.1" : "1"}
              value={reading}
              onChange={(event) => setReading(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Inspected By
            <input
              value={inspectedBy}
              onChange={(event) => setInspectedBy(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Project
            <input
              value={project}
              onChange={(event) => setProject(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Crew
            <input
              value={crew}
              onChange={(event) => setCrew(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-slate-700">
            Overall Condition
            <select
              value={overallCondition}
              onChange={(event) => setOverallCondition(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-400"
            >
              <option>Good</option>
              <option>Fair</option>
              <option>Poor</option>
              <option>Unsafe</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">
          {assetType} Checklist
        </h2>

        <div className="mt-5 grid gap-5">
          {activeSections.map((section) => (
            <div key={section.title}>
              <div className="mb-3 border-b border-slate-200 pb-2">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                  {section.title}
                </h3>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => {
                  const key = checklistKey(item);
                  const row = checklistValues[key] || {
                    answer: "yes",
                    severity: "minor",
                    comment: "",
                  };

                  return (
                    <div
                      key={item}
                      className={`rounded-xl border px-3 py-2 ${
                        row.answer === "no"
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
                            active={row.answer === "yes"}
                            tone="yes"
                            label="Y"
                            onClick={() =>
                              setChecklistValues((current) => ({
                                ...current,
                                [key]: {
                                  ...row,
                                  answer: "yes",
                                  comment: "",
                                },
                              }))
                            }
                          />
                          <ChecklistButton
                            active={row.answer === "no"}
                            tone="no"
                            label="N"
                            onClick={() =>
                              setChecklistValues((current) => ({
                                ...current,
                                [key]: {
                                  ...row,
                                  answer: "no",
                                  severity: row.severity || "minor",
                                },
                              }))
                            }
                          />
                          <ChecklistButton
                            active={row.answer === "na"}
                            tone="na"
                            label="N/A"
                            onClick={() =>
                              setChecklistValues((current) => ({
                                ...current,
                                [key]: {
                                  ...row,
                                  answer: "na",
                                  comment: "",
                                },
                              }))
                            }
                          />
                        </div>
                      </div>

                      {row.answer === "no" ? (
                        <div className="mt-2 grid gap-2">
                          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                            {[
                              ["minor", "Minor"],
                              ["moderate", "Moderate"],
                              ["major", "Major"],
                              ["do_not_use", "Do Not Use"],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  setChecklistValues((current) => ({
                                    ...current,
                                    [key]: {
                                      ...row,
                                      answer: "no",
                                      severity: value,
                                    },
                                  }))
                                }
                                className={`rounded-md border px-2 py-1.5 text-[10px] font-black ${
                                  row.severity === value
                                    ? "border-slate-950 bg-slate-950 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          <textarea
                            value={row.comment}
                            onChange={(event) =>
                              setChecklistValues((current) => ({
                                ...current,
                                [key]: {
                                  ...row,
                                  answer: "no",
                                  comment: event.target.value,
                                },
                              }))
                            }
                            placeholder="Required: explain this defect..."
                            rows={2}
                            className="w-full rounded-lg border border-rose-300 bg-white px-2 py-2 text-xs font-medium text-slate-900 outline-none focus:border-rose-400"
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">General Comments</h2>

        <textarea
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          rows={5}
          placeholder="Any general comments not covered by failed checklist items."
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-slate-400"
        />
      </section>
    </PageShell>
  );
}