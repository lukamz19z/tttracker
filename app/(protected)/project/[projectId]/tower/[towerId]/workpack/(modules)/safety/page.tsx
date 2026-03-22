"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Tower = {
  id: string;
  name: string;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
};

type SafetyDoc = {
  id: string;
  tower_id: string;
  document_name: string;
  frequency_type: "daily" | "swing" | "once";
  notes: string | null;
  active: boolean;
  created_at: string;
};

type SafetySignoff = {
  id: string;
  doc_id: string;
  tower_id: string;
  crew_member_name: string;
  cycle_key: string;
  signed_at: string;
};

type DocketDateRow = {
  docket_date: string;
};

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function titleCaseFrequency(value: string) {
  if (value === "daily") return "Daily";
  if (value === "swing") return "Per Swing";
  return "Once Only";
}

export default function SafetySignonPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [docs, setDocs] = useState<SafetyDoc[]>([]);
  const [signoffs, setSignoffs] = useState<SafetySignoff[]>([]);
  const [loading, setLoading] = useState(true);

  const [newDocName, setNewDocName] = useState("");
  const [newFrequency, setNewFrequency] = useState<"daily" | "swing" | "once">("daily");
  const [newNotes, setNewNotes] = useState("");

  const [swingLabel, setSwingLabel] = useState("");
  const [crewInputs, setCrewInputs] = useState<Record<string, string>>({});
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    loadAll();
  }, [towerId]);

  async function loadAll() {
    setLoading(true);

    const [
      towerRes,
      latestDocketRes,
      docsRes,
      signoffsRes,
    ] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_safety_docs")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tower_safety_signoffs")
        .select("*")
        .eq("tower_id", towerId)
        .order("signed_at", { ascending: false }),
    ]);

    if (towerRes.error) console.error(towerRes.error);
    if (latestDocketRes.error) console.error(latestDocketRes.error);
    if (docsRes.error) console.error(docsRes.error);
    if (signoffsRes.error) console.error(signoffsRes.error);

    setTower(towerRes.data || null);

    const latestRows = (latestDocketRes.data || []) as DocketDateRow[];
    setLatestDate(latestRows.length > 0 ? latestRows[0].docket_date : null);

    setDocs((docsRes.data || []) as SafetyDoc[]);
    setSignoffs((signoffsRes.data || []) as SafetySignoff[]);

    setLoading(false);
  }

  function getCycleKey(doc: SafetyDoc) {
    if (doc.frequency_type === "daily") return todayKey;
    if (doc.frequency_type === "swing") return swingLabel.trim();
    return "once";
  }

  function getCurrentCycleSignoffs(doc: SafetyDoc) {
    const cycleKey = getCycleKey(doc);
    if (!cycleKey) return [];
    return signoffs.filter(
      (s) => s.doc_id === doc.id && s.cycle_key === cycleKey
    );
  }

  function isFullyConfiguredForSigning(doc: SafetyDoc) {
    if (doc.frequency_type === "swing") {
      return swingLabel.trim().length > 0;
    }
    return true;
  }

  async function createSafetyDoc() {
    if (!newDocName.trim()) {
      alert("Enter a document name.");
      return;
    }

    const { error } = await supabase.from("tower_safety_docs").insert({
      tower_id: towerId,
      document_name: newDocName.trim(),
      frequency_type: newFrequency,
      notes: newNotes.trim() || null,
      active: true,
    });

    if (error) {
      console.error(error);
      alert("Failed to create safety document.");
      return;
    }

    setNewDocName("");
    setNewFrequency("daily");
    setNewNotes("");
    await loadAll();
  }

  async function toggleDocActive(doc: SafetyDoc) {
    const { error } = await supabase
      .from("tower_safety_docs")
      .update({ active: !doc.active })
      .eq("id", doc.id);

    if (error) {
      console.error(error);
      alert("Failed to update document status.");
      return;
    }

    await loadAll();
  }

  async function signCrewMember(doc: SafetyDoc) {
    const crewName = (crewInputs[doc.id] || "").trim();
    if (!crewName) {
      alert("Enter crew member name.");
      return;
    }

    const cycleKey = getCycleKey(doc);
    if (!cycleKey) {
      alert("Enter the current swing label first.");
      return;
    }

    const { error } = await supabase.from("tower_safety_signoffs").insert({
      doc_id: doc.id,
      tower_id: towerId,
      crew_member_name: crewName,
      cycle_key: cycleKey,
    });

    if (error) {
      console.error(error);
      alert(
        "Failed to sign on. This person may already be signed for the current cycle."
      );
      return;
    }

    setCrewInputs((prev) => ({ ...prev, [doc.id]: "" }));
    await loadAll();
  }

  async function removeSignoff(signoffId: string) {
    const confirmed = window.confirm("Remove this sign-on entry?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("tower_safety_signoffs")
      .delete()
      .eq("id", signoffId);

    if (error) {
      console.error(error);
      alert("Failed to remove sign-on.");
      return;
    }

    await loadAll();
  }

  if (loading) return <div className="p-8">Loading safety sign-ons...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  const activeDocs = docs.filter((d) => d.active);
  const fullySignedCount = activeDocs.filter(
    (d) => getCurrentCycleSignoffs(d).length > 0
  ).length;

  return (
    <div className="p-8 space-y-6">
      {/* HEADER */}
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Safety Sign-Ons</h1>
            <p className="text-slate-500 mt-1">
              Manage tower-specific safety documents and crew sign-ons with
              flexible frequency rules.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <StatusCard
              label="Active Documents"
              value={String(activeDocs.length)}
            />
            <StatusCard
              label="Signed This Cycle"
              value={`${fullySignedCount}/${activeDocs.length}`}
            />
            <StatusCard
              label="Today"
              value={todayKey}
            />
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50">
          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">
                Current Swing Label
              </label>
              <input
                value={swingLabel}
                onChange={(e) => setSwingLabel(e.target.value)}
                placeholder="e.g. Swing 12 / 2026-03-22"
                className="border rounded-lg p-2 w-full bg-white"
              />
            </div>

            <div className="md:col-span-2 text-sm text-slate-600">
              Used only for documents set to <strong>Per Swing</strong>. Daily
              documents use today’s date automatically. Once-only documents use a
              permanent cycle.
            </div>
          </div>
        </div>

        <div className="border rounded-2xl p-5 space-y-4">
          <div className="text-lg font-semibold">Add Safety Document</div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Document Name
              </label>
              <input
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="e.g. SWMS, Work at Height Permit"
                className="border rounded-lg p-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Frequency
              </label>
              <select
                value={newFrequency}
                onChange={(e) =>
                  setNewFrequency(e.target.value as "daily" | "swing" | "once")
                }
                className="border rounded-lg p-2 w-full"
              >
                <option value="daily">Daily</option>
                <option value="swing">Per Swing</option>
                <option value="once">Once Only</option>
              </select>
            </div>

            <div className="md:row-span-2">
              <label className="block text-sm font-medium mb-1">
                Notes
              </label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="border rounded-lg p-2 w-full min-h-[92px]"
                placeholder="Optional notes or instructions"
              />
            </div>

            <div className="md:col-span-2">
              <button
                onClick={createSafetyDoc}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg"
              >
                Create Safety Document
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {docs.length === 0 ? (
            <div className="border rounded-xl p-8 text-center text-slate-500">
              No safety documents created yet.
            </div>
          ) : (
            docs.map((doc) => {
              const currentCycleKey = getCycleKey(doc);
              const currentCycleSignoffs = getCurrentCycleSignoffs(doc);

              return (
                <div
                  key={doc.id}
                  className={`border rounded-2xl p-5 space-y-4 ${
                    doc.active ? "bg-white" : "bg-slate-50 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold">
                          {doc.document_name}
                        </h2>

                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          {titleCaseFrequency(doc.frequency_type)}
                        </span>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            doc.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {doc.active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      {doc.notes && (
                        <p className="text-sm text-slate-600 mt-2">
                          {doc.notes}
                        </p>
                      )}

                      <p className="text-sm text-slate-500 mt-2">
                        Current cycle:{" "}
                        <strong>{currentCycleKey || "Not set"}</strong>
                      </p>
                    </div>

                    <button
                      onClick={() => toggleDocActive(doc)}
                      className="border px-4 py-2 rounded-lg"
                    >
                      {doc.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>

                  <div className="border rounded-xl p-4 bg-slate-50">
                    <div className="flex items-end gap-3 flex-wrap">
                      <div className="min-w-[260px]">
                        <label className="block text-sm font-medium mb-1">
                          Crew Member Sign-On
                        </label>
                        <input
                          value={crewInputs[doc.id] || ""}
                          onChange={(e) =>
                            setCrewInputs((prev) => ({
                              ...prev,
                              [doc.id]: e.target.value,
                            }))
                          }
                          placeholder="Enter crew member name"
                          className="border rounded-lg p-2 w-full bg-white"
                          disabled={!doc.active}
                        />
                      </div>

                      <button
                        onClick={() => signCrewMember(doc)}
                        disabled={!doc.active || !isFullyConfiguredForSigning(doc)}
                        className="bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        Sign On
                      </button>
                    </div>

                    {!isFullyConfiguredForSigning(doc) && doc.frequency_type === "swing" && (
                      <p className="text-sm text-amber-700 mt-2">
                        Enter a current swing label above before signing crew to
                        this document.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-2">
                      Current Cycle Sign-Ons
                    </div>

                    {currentCycleSignoffs.length === 0 ? (
                      <div className="text-sm text-slate-500">
                        No one signed for this cycle yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {currentCycleSignoffs.map((signoff) => (
                          <div
                            key={signoff.id}
                            className="flex items-center justify-between border rounded-lg p-3"
                          >
                            <div>
                              <div className="font-medium">
                                {signoff.crew_member_name}
                              </div>
                              <div className="text-sm text-slate-500">
                                {formatDateTime(signoff.signed_at)}
                              </div>
                            </div>

                            <button
                              onClick={() => removeSignoff(signoff.id)}
                              className="text-red-600 font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-sm font-semibold mb-2">
                      Full Sign-On History
                    </div>

                    <div className="space-y-2">
                      {signoffs
                        .filter((s) => s.doc_id === doc.id)
                        .slice(0, 8)
                        .map((s) => (
                          <div
                            key={s.id}
                            className="border rounded-lg p-3 text-sm flex justify-between gap-4"
                          >
                            <div>
                              <div className="font-medium">{s.crew_member_name}</div>
                              <div className="text-slate-500">
                                Cycle: {s.cycle_key}
                              </div>
                            </div>
                            <div className="text-slate-500">
                              {formatDateTime(s.signed_at)}
                            </div>
                          </div>
                        ))}

                      {signoffs.filter((s) => s.doc_id === doc.id).length === 0 && (
                        <div className="text-sm text-slate-500">
                          No history yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-[150px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}