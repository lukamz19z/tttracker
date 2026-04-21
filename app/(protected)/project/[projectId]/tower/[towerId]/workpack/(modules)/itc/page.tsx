"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TorqueRow = {
  id: string;
  itc_id: string;
  item_no: number | null;
  bolt_grade: string | null;
  bolt_dia: number | null;
  structural_washers: string | null;
  bolt_count: number | null;
  torque_achieved: string | null;
  remarks: string | null;
};

type TowerRecord = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  project_id?: string | null;
  [key: string]: unknown;
};

type ItcDocument = {
  id: string;
  tower_id: string;
  status?: string | null;
  title?: string | null;
  document_name?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type GenericRow = Record<string, unknown>;

function normaliseStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isClosedLike(status: unknown): boolean {
  const s = normaliseStatus(status);
  return (
    s === "closed" ||
    s === "complete" ||
    s === "completed" ||
    s === "resolved" ||
    s === "approved" ||
    s === "accepted" ||
    s === "done"
  );
}

function isOpenLike(status: unknown): boolean {
  const s = normaliseStatus(status);
  return (
    s === "open" ||
    s === "pending" ||
    s === "in progress" ||
    s === "in-progress" ||
    s === "submitted" ||
    s === "draft" ||
    s === "rejected" ||
    s === "outstanding"
  );
}

function isDeliveredLike(status: unknown): boolean {
  const s = normaliseStatus(status);
  return (
    s === "delivered" ||
    s === "complete" ||
    s === "completed" ||
    s === "received" ||
    s === "closed"
  );
}

function isPendingDeliveryLike(status: unknown): boolean {
  const s = normaliseStatus(status);
  return (
    s === "pending" ||
    s === "part delivered" ||
    s === "partial" ||
    s === "ordered" ||
    s === "open" ||
    s === "outstanding" ||
    s === "in transit"
  );
}

function getStringField(row: GenericRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function getRowStatus(row: GenericRow): string {
  return (
    getStringField(row, "status") ??
    getStringField(row, "delivery_status") ??
    getStringField(row, "defect_status") ??
    getStringField(row, "current_status") ??
    getStringField(row, "state") ??
    ""
  );
}

function badgeClasses(kind: "green" | "yellow" | "red" | "blue" | "slate") {
  switch (kind) {
    case "green":
      return "bg-green-100 text-green-700 border-green-200";
    case "yellow":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "red":
      return "bg-red-100 text-red-700 border-red-200";
    case "blue":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function TorquePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [itcId, setItcId] = useState<string | null>(null);
  const [itcDoc, setItcDoc] = useState<ItcDocument | null>(null);
  const [rows, setRows] = useState<TorqueRow[]>([]);

  const [defects, setDefects] = useState<GenericRow[]>([]);
  const [deliveries, setDeliveries] = useState<GenericRow[]>([]);
  const [modifications, setModifications] = useState<GenericRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [itemNo, setItemNo] = useState("");
  const [boltGrade, setBoltGrade] = useState("");
  const [boltDia, setBoltDia] = useState("");
  const [washers, setWashers] = useState("");
  const [boltCount, setBoltCount] = useState("");
  const [torqueAchieved, setTorqueAchieved] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [
      towerRes,
      docketRes,
      itcRes,
      defectsRes,
      deliveriesRes,
      modificationsRes,
    ] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_itc_documents")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("tower_defects")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tower_deliveries")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tower_modifications")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    setTower((towerRes.data as TowerRecord | null) ?? null);
    setLatestDate(docketRes.data?.[0]?.docket_date ?? null);
    setDefects((defectsRes.data as GenericRow[] | null) ?? []);
    setDeliveries((deliveriesRes.data as GenericRow[] | null) ?? []);
    setModifications((modificationsRes.data as GenericRow[] | null) ?? []);
    setItcDoc((itcRes.data as ItcDocument | null) ?? null);

    if (itcRes.data) {
      const typedItc = itcRes.data as ItcDocument;
      setItcId(typedItc.id);

      const { data: torqueData } = await supabase
        .from("tower_itc_torque")
        .select("*")
        .eq("itc_id", typedItc.id)
        .order("item_no", { ascending: true });

      setRows((torqueData as TorqueRow[] | null) ?? []);
    } else {
      setItcId(null);
      setRows([]);
    }

    setLoading(false);
  }

  async function addRow() {
    if (!itcId) {
      alert("Create the main ITC first.");
      return;
    }

    const { error } = await supabase.from("tower_itc_torque").insert({
      itc_id: itcId,
      item_no: itemNo ? Number(itemNo) : null,
      bolt_grade: boltGrade || null,
      bolt_dia: boltDia ? Number(boltDia) : null,
      structural_washers: washers || null,
      bolt_count: boltCount ? Number(boltCount) : null,
      torque_achieved: torqueAchieved || null,
      remarks: remarks || null,
    });

    if (error) {
      alert(error.message || "Failed to add torque row.");
      return;
    }

    setItemNo("");
    setBoltGrade("");
    setBoltDia("");
    setWashers("");
    setBoltCount("");
    setTorqueAchieved("");
    setRemarks("");

    await load();
  }

  async function removeRow(id: string) {
    const confirmed = window.confirm("Delete this torque row?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("tower_itc_torque")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message || "Failed to delete torque row.");
      return;
    }

    await load();
  }

  const defectsSummary = useMemo(() => {
    const total = defects.length;
    const closed = defects.filter((d) => isClosedLike(getRowStatus(d))).length;
    const open = defects.filter((d) => {
      const s = getRowStatus(d);
      return isOpenLike(s) || !isClosedLike(s);
    }).length;

    return {
      total,
      closed,
      open: total === 0 ? 0 : open,
      complete: total > 0 && open === 0,
    };
  }, [defects]);

  const deliveriesSummary = useMemo(() => {
    const total = deliveries.length;
    const complete = deliveries.filter((d) =>
      isDeliveredLike(getRowStatus(d))
    ).length;
    const pending = deliveries.filter((d) => {
      const s = getRowStatus(d);
      return isPendingDeliveryLike(s) || !isDeliveredLike(s);
    }).length;

    return {
      total,
      complete,
      pending: total === 0 ? 0 : pending,
      allDelivered: total > 0 && pending === 0,
    };
  }, [deliveries]);

  const modificationsSummary = useMemo(() => {
    return {
      total: modifications.length,
      complete: true,
    };
  }, [modifications]);

  const torqueSummary = useMemo(() => {
    const total = rows.length;
    const withTorqueValue = rows.filter(
      (r) => String(r.torque_achieved || "").trim() !== ""
    ).length;

    return {
      total,
      withTorqueValue,
      complete: total > 0 && withTorqueValue === total,
    };
  }, [rows]);

  const docketSummary = useMemo(() => {
    return {
      exists: !!latestDate,
      complete: !!latestDate,
    };
  }, [latestDate]);

  const bcItcReady = useMemo(() => {
    return (
      docketSummary.complete &&
      torqueSummary.complete &&
      defectsSummary.complete &&
      deliveriesSummary.allDelivered
    );
  }, [docketSummary, torqueSummary, defectsSummary, deliveriesSummary]);

  const readinessItems = [
    {
      label: "Latest daily docket submitted",
      complete: docketSummary.complete,
      detail: latestDate ? `Latest docket: ${latestDate}` : "No daily docket yet",
    },
    {
      label: "Torque sheet completed",
      complete: torqueSummary.complete,
      detail:
        torqueSummary.total > 0
          ? `${torqueSummary.withTorqueValue}/${torqueSummary.total} torque rows completed`
          : "No torque rows added yet",
    },
    {
      label: "Defects closed",
      complete: defectsSummary.complete,
      detail:
        defectsSummary.total > 0
          ? `${defectsSummary.closed}/${defectsSummary.total} closed`
          : "No defects raised",
    },
    {
      label: "Deliveries complete",
      complete: deliveriesSummary.allDelivered,
      detail:
        deliveriesSummary.total > 0
          ? `${deliveriesSummary.complete}/${deliveriesSummary.total} complete`
          : "No delivery records yet",
    },
    {
      label: "Modifications logged",
      complete: true,
      detail:
        modificationsSummary.total > 0
          ? `${modificationsSummary.total} modification record(s)`
          : "No modifications logged",
    },
  ];

  if (loading || !tower) {
    return <div className="p-8">Loading torque...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>

        <Link
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
        >
          ITCs
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
        >
          Permits
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}
        >
          Lift Studies
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div
        className={`border rounded-2xl p-5 ${
          bcItcReady
            ? "bg-green-50 border-green-200"
            : "bg-yellow-50 border-yellow-200"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              {bcItcReady
                ? "Tower looks ready for BC ITC sign-off"
                : "Tower still has ITC items requiring attention"}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              This summary pulls live information from defects, deliveries,
              modifications, daily dockets, and torque records.
            </p>
          </div>

          <div
            className={`inline-flex items-center px-3 py-2 rounded-full border text-sm font-semibold w-fit ${
              bcItcReady ? badgeClasses("green") : badgeClasses("yellow")
            }`}
          >
            {bcItcReady ? "Ready for sign-off" : "Attention required"}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Defects</div>
          <div className="text-2xl font-bold">{defectsSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Open: {defectsSummary.open} · Closed: {defectsSummary.closed}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Deliveries</div>
          <div className="text-2xl font-bold">{deliveriesSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Pending: {deliveriesSummary.pending} · Complete:{" "}
            {deliveriesSummary.complete}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Modifications</div>
          <div className="text-2xl font-bold">{modificationsSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Logged against this tower
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Torque Rows</div>
          <div className="text-2xl font-bold">{torqueSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Completed: {torqueSummary.withTorqueValue}/{torqueSummary.total}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Latest Docket</div>
          <div className="text-lg font-bold">
            {latestDate || "Not submitted"}
          </div>
          <div className="text-sm text-slate-600 mt-1">
            Required before final ITC sign-off
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Torque Sheet</h1>
            <p className="text-sm text-slate-500 mt-1">
              Use this alongside the BC ITC. This page now also checks linked
              tower records for readiness.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
              className="border px-4 py-2 rounded-lg"
            >
              Back to ITC
            </Link>

            <Link
              href={`/project/${projectId}/tower/${towerId}/defects`}
              className="border px-4 py-2 rounded-lg"
            >
              View Defects
            </Link>

            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="border px-4 py-2 rounded-lg"
            >
              View Deliveries
            </Link>

            <Link
              href={`/project/${projectId}/tower/${towerId}/modifications`}
              className="border px-4 py-2 rounded-lg"
            >
              View Modifications
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="border rounded-2xl p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">BC ITC readiness</h2>
              <span
                className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                  bcItcReady ? badgeClasses("green") : badgeClasses("yellow")
                }`}
              >
                {bcItcReady ? "Ready" : "Pending items"}
              </span>
            </div>

            <div className="space-y-3">
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-4 border rounded-xl bg-white p-3"
                >
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-sm text-slate-500">{item.detail}</div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${
                      item.complete
                        ? badgeClasses("green")
                        : badgeClasses("red")
                    }`}
                  >
                    {item.complete ? "Complete" : "Required"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border rounded-2xl p-4 bg-slate-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">Current ITC document</h2>
              <span
                className={`px-3 py-1 rounded-full border text-xs font-semibold ${
                  itcDoc?.status
                    ? badgeClasses(
                        isClosedLike(itcDoc.status)
                          ? "green"
                          : isOpenLike(itcDoc.status)
                          ? "yellow"
                          : "slate"
                      )
                    : badgeClasses("slate")
                }`}
              >
                {itcDoc?.status || "No status"}
              </span>
            </div>

            {itcDoc ? (
              <div className="space-y-3">
                <div className="bg-white border rounded-xl p-3">
                  <div className="text-sm text-slate-500">ITC record</div>
                  <div className="font-semibold">
                    {itcDoc.title || itcDoc.document_name || "Latest ITC"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white border rounded-xl p-3">
                    <div className="text-sm text-slate-500">Created</div>
                    <div className="font-medium">
                      {itcDoc.created_at
                        ? new Date(itcDoc.created_at).toLocaleDateString()
                        : "-"}
                    </div>
                  </div>

                  <div className="bg-white border rounded-xl p-3">
                    <div className="text-sm text-slate-500">BC ready</div>
                    <div className="font-medium">
                      {bcItcReady ? "Yes" : "No"}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-500">
                  This does not automatically sign off the ITC, but it gives the
                  page enough live data to show whether the tower looks complete
                  from a BC point of view.
                </div>
              </div>
            ) : (
              <div className="text-slate-500">
                No main ITC document has been created for this tower yet.
              </div>
            )}
          </div>
        </div>

        <div className="border rounded-2xl p-4 bg-slate-50 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-lg">Add torque row</h2>
            {!itcId && (
              <span className="text-sm text-red-600">
                Create the main ITC first before adding torque rows.
              </span>
            )}
          </div>

          <div className="grid md:grid-cols-7 gap-3">
            <input
              value={itemNo}
              onChange={(e) => setItemNo(e.target.value)}
              placeholder="Item No."
              className="border p-2 rounded bg-white"
            />
            <input
              value={boltGrade}
              onChange={(e) => setBoltGrade(e.target.value)}
              placeholder="Bolt Grade"
              className="border p-2 rounded bg-white"
            />
            <input
              value={boltDia}
              onChange={(e) => setBoltDia(e.target.value)}
              placeholder="Bolt Dia"
              className="border p-2 rounded bg-white"
            />
            <input
              value={washers}
              onChange={(e) => setWashers(e.target.value)}
              placeholder="Structural Washers"
              className="border p-2 rounded bg-white"
            />
            <input
              value={boltCount}
              onChange={(e) => setBoltCount(e.target.value)}
              placeholder="Number of Bolts"
              className="border p-2 rounded bg-white"
            />
            <input
              value={torqueAchieved}
              onChange={(e) => setTorqueAchieved(e.target.value)}
              placeholder="Bolt Torque Achieved"
              className="border p-2 rounded bg-white"
            />
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Remarks"
              className="border p-2 rounded bg-white"
            />
          </div>

          <button
            onClick={addRow}
            disabled={!itcId}
            className={`px-4 py-2 rounded-lg text-white ${
              itcId
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-400 cursor-not-allowed"
            }`}
          >
            Add Torque Row
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border rounded-xl p-4 flex justify-between items-start gap-4"
            >
              <div className="space-y-1">
                <div className="font-semibold">
                  Item {row.item_no ?? "-"} · Grade {row.bolt_grade || "-"}
                </div>

                <div className="text-sm text-slate-500">
                  Dia: {row.bolt_dia ?? "-"} · Washers:{" "}
                  {row.structural_washers || "-"}
                </div>

                <div className="text-sm text-slate-500">
                  Bolts: {row.bolt_count ?? "-"} · Achieved:{" "}
                  {row.torque_achieved || "-"}
                </div>

                <div className="text-sm text-slate-500">
                  Remarks: {row.remarks || "-"}
                </div>
              </div>

              <button
                onClick={() => void removeRow(row.id)}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="text-slate-500">No torque rows added yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}