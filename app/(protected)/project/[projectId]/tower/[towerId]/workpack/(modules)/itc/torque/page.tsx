"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";
import { recalcWorkpackCompletion } from "@/lib/recalcWorkpackCompletion";

type TorqueRow = {
  id: string;
  tower_id: string;
  section_name: string | null;
  connection_name: string;
  bolt_grade: string | null;
  bolt_dia_mm: number | null;
  structural_washers: string | null;
  number_of_bolts: number | null;
  required_torque_min: number | null;
  required_torque_max: number | null;
  achieved_torque: number | null;
  remarks: string | null;
  leading_hand: string | null;
  record_date: string | null;
};

export default function BoltTorquePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [rows, setRows] = useState<TorqueRow[]>([]);

  const [sectionName, setSectionName] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [boltGrade, setBoltGrade] = useState("");
  const [boltDia, setBoltDia] = useState("");
  const [washers, setWashers] = useState("");
  const [numBolts, setNumBolts] = useState("");
  const [torqueMin, setTorqueMin] = useState("");
  const [torqueMax, setTorqueMax] = useState("");
  const [torqueAchieved, setTorqueAchieved] = useState("");
  const [remarks, setRemarks] = useState("");
  const [leadingHand, setLeadingHand] = useState("");
  const [recordDate, setRecordDate] = useState("");

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {
    const [towerRes, docketRes, rowRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_bolt_torque_records")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setRows((rowRes.data || []) as TorqueRow[]);
  }

  async function addRow() {
    if (!connectionName.trim()) {
      alert("Enter connection name");
      return;
    }

    const { error } = await supabase.from("tower_bolt_torque_records").insert({
      tower_id: towerId,
      section_name: sectionName.trim() || null,
      connection_name: connectionName.trim(),
      bolt_grade: boltGrade.trim() || null,
      bolt_dia_mm: boltDia ? Number(boltDia) : null,
      structural_washers: washers.trim() || null,
      number_of_bolts: numBolts ? Number(numBolts) : null,
      required_torque_min: torqueMin ? Number(torqueMin) : null,
      required_torque_max: torqueMax ? Number(torqueMax) : null,
      achieved_torque: torqueAchieved ? Number(torqueAchieved) : null,
      remarks: remarks.trim() || null,
      leading_hand: leadingHand.trim() || null,
      record_date: recordDate || null,
    });

    if (error) {
      alert("Failed to add torque row");
      return;
    }

    setSectionName("");
    setConnectionName("");
    setBoltGrade("");
    setBoltDia("");
    setWashers("");
    setNumBolts("");
    setTorqueMin("");
    setTorqueMax("");
    setTorqueAchieved("");
    setRemarks("");
    setLeadingHand("");
    setRecordDate("");

    await recalcWorkpackCompletion(towerId);
    await load();
  }

  function result(row: TorqueRow) {
    const achieved = Number(row.achieved_torque || 0);
    const min = Number(row.required_torque_min || 0);
    const max = Number(row.required_torque_max || 0);
    if (!min && !max) return "Pending";
    return achieved >= min && achieved <= max ? "PASS" : "FAIL";
  }

  if (!tower) return <div className="p-8">Loading torque records...</div>;

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
          <h1 className="text-2xl font-bold">Bolt Torque Records</h1>

          <Link
            href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
            className="border px-4 py-2 rounded-lg"
          >
            Back to ITC
          </Link>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="grid md:grid-cols-6 gap-3">
            <input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="Section"
              className="border p-2 rounded bg-white"
            />
            <input
              value={connectionName}
              onChange={(e) => setConnectionName(e.target.value)}
              placeholder="Connection Name"
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
              placeholder="Bolt Dia mm"
              className="border p-2 rounded bg-white"
            />
            <input
              value={washers}
              onChange={(e) => setWashers(e.target.value)}
              placeholder="Structural Washers"
              className="border p-2 rounded bg-white"
            />
            <input
              value={numBolts}
              onChange={(e) => setNumBolts(e.target.value)}
              placeholder="No. of Bolts"
              className="border p-2 rounded bg-white"
            />
          </div>

          <div className="grid md:grid-cols-6 gap-3">
            <input
              value={torqueMin}
              onChange={(e) => setTorqueMin(e.target.value)}
              placeholder="Required Min"
              className="border p-2 rounded bg-white"
            />
            <input
              value={torqueMax}
              onChange={(e) => setTorqueMax(e.target.value)}
              placeholder="Required Max"
              className="border p-2 rounded bg-white"
            />
            <input
              value={torqueAchieved}
              onChange={(e) => setTorqueAchieved(e.target.value)}
              placeholder="Achieved Torque"
              className="border p-2 rounded bg-white"
            />
            <input
              value={leadingHand}
              onChange={(e) => setLeadingHand(e.target.value)}
              placeholder="Leading Hand"
              className="border p-2 rounded bg-white"
            />
            <input
              type="date"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
              className="border p-2 rounded bg-white"
            />
            <button
              onClick={addRow}
              className="bg-blue-600 text-white rounded"
            >
              Add
            </button>
          </div>

          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks"
            className="border p-2 rounded w-full bg-white"
          />
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border rounded-xl p-4 flex justify-between gap-4"
            >
              <div>
                <div className="font-semibold">{row.connection_name}</div>
                <div className="text-sm text-slate-500">
                  {row.section_name || "-"} · Dia {row.bolt_dia_mm || "-"} · Grade {row.bolt_grade || "-"}
                </div>
                <div className="text-sm text-slate-500">
                  Required: {row.required_torque_min || "-"} to {row.required_torque_max || "-"} Nm
                </div>
                <div className="text-sm text-slate-500">
                  Achieved: {row.achieved_torque || "-"} Nm
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-full text-sm h-fit ${
                  result(row) === "PASS"
                    ? "bg-green-100 text-green-700"
                    : result(row) === "FAIL"
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {result(row)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}