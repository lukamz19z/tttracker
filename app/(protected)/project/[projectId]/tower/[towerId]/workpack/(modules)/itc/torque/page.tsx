"use client";

import { useEffect, useState } from "react";
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

export default function TorquePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [itcId, setItcId] = useState<string | null>(null);
  const [rows, setRows] = useState<TorqueRow[]>([]);

  const [itemNo, setItemNo] = useState("");
  const [boltGrade, setBoltGrade] = useState("");
  const [boltDia, setBoltDia] = useState("");
  const [washers, setWashers] = useState("");
  const [boltCount, setBoltCount] = useState("");
  const [torqueAchieved, setTorqueAchieved] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {
    const [towerRes, docketRes, itcRes] = await Promise.all([
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
    ]);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);

    if (itcRes.data) {
      setItcId(itcRes.data.id);

      const { data: torqueData } = await supabase
        .from("tower_itc_torque")
        .select("*")
        .eq("itc_id", itcRes.data.id)
        .order("item_no", { ascending: true });

      setRows((torqueData || []) as TorqueRow[]);
    } else {
      setItcId(null);
      setRows([]);
    }
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
      alert("Failed to add torque row.");
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
      alert("Failed to delete torque row.");
      return;
    }

    await load();
  }

  if (!tower) return <div className="p-8">Loading torque...</div>;

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="flex gap-2 border-b pb-2">
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>

        <Link
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold"
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
        >
          ITCs
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
        >
          Permits
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}
        >
          Lift Studies
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Torque Sheet</h1>

          <Link
            href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
            className="border px-4 py-2 rounded-lg"
          >
            Back to ITC
          </Link>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
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
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Add Torque Row
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border rounded-xl p-4 flex justify-between items-start"
            >
              <div>
                <div className="font-semibold">
                  Item {row.item_no ?? "-"} · Grade {row.bolt_grade || "-"}
                </div>
                <div className="text-sm text-slate-500">
                  Dia: {row.bolt_dia ?? "-"} · Washers: {row.structural_washers || "-"}
                </div>
                <div className="text-sm text-slate-500">
                  Bolts: {row.bolt_count ?? "-"} · Achieved: {row.torque_achieved || "-"}
                </div>
                <div className="text-sm text-slate-500">
                  Remarks: {row.remarks || "-"}
                </div>
              </div>

              <button
                onClick={() => removeRow(row.id)}
                className="text-red-600"
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