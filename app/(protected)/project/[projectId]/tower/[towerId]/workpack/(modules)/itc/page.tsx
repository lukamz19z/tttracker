"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type ItcRow = {
  id: string;
  tower_id: string;
  stage: string;
  item_no: number | null;
  description: string;
  validation_status: string | null;
  leading_hand: string | null;
  signed_date: string | null;
  comments: string | null;
  created_at: string;
};

const DEFAULT_STAGES = [
  "Preparation",
  "Assembly and Erection",
  "Completion",
  "Modification",
  "Incoming Material",
  "Bolt Torque",
];

const STATUS_OPTIONS = ["Pending", "Y", "N", "NA"];

export default function ITCPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<any>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [items, setItems] = useState<ItcRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [stage, setStage] = useState("Preparation");
  const [itemNo, setItemNo] = useState("");
  const [description, setDescription] = useState("");
  const [validationStatus, setValidationStatus] = useState("Pending");
  const [leadingHand, setLeadingHand] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [comments, setComments] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editItemNo, setEditItemNo] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editValidationStatus, setEditValidationStatus] = useState("Pending");
  const [editLeadingHand, setEditLeadingHand] = useState("");
  const [editSignedDate, setEditSignedDate] = useState("");
  const [editComments, setEditComments] = useState("");

  useEffect(() => {
    load();
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [towerRes, docketRes, itcRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_itc_register")
        .select("*")
        .eq("tower_id", towerId)
        .order("stage", { ascending: true })
        .order("item_no", { ascending: true }),
    ]);

    setTower(towerRes.data || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);
    setItems((itcRes.data || []) as ItcRow[]);
    setLoading(false);
  }

  async function addItem() {
    if (!description.trim()) {
      alert("Enter an ITC description.");
      return;
    }

    const { error } = await supabase.from("tower_itc_register").insert({
      tower_id: towerId,
      stage,
      item_no: itemNo ? Number(itemNo) : null,
      description: description.trim(),
      validation_status: validationStatus,
      leading_hand: leadingHand.trim() || null,
      signed_date: signedDate || null,
      comments: comments.trim() || null,
    });

    if (error) {
      console.error(error);
      alert("Failed to add ITC item.");
      return;
    }

    setStage("Preparation");
    setItemNo("");
    setDescription("");
    setValidationStatus("Pending");
    setLeadingHand("");
    setSignedDate("");
    setComments("");

    await load();
  }

  function startEdit(row: ItcRow) {
    setEditingId(row.id);
    setEditStage(row.stage || "");
    setEditItemNo(row.item_no !== null && row.item_no !== undefined ? String(row.item_no) : "");
    setEditDescription(row.description || "");
    setEditValidationStatus(row.validation_status || "Pending");
    setEditLeadingHand(row.leading_hand || "");
    setEditSignedDate(row.signed_date || "");
    setEditComments(row.comments || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditStage("");
    setEditItemNo("");
    setEditDescription("");
    setEditValidationStatus("Pending");
    setEditLeadingHand("");
    setEditSignedDate("");
    setEditComments("");
  }

  async function saveEdit(id: string) {
    if (!editDescription.trim()) {
      alert("Enter an ITC description.");
      return;
    }

    const { error } = await supabase
      .from("tower_itc_register")
      .update({
        stage: editStage,
        item_no: editItemNo ? Number(editItemNo) : null,
        description: editDescription.trim(),
        validation_status: editValidationStatus,
        leading_hand: editLeadingHand.trim() || null,
        signed_date: editSignedDate || null,
        comments: editComments.trim() || null,
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Failed to update ITC item.");
      return;
    }

    cancelEdit();
    await load();
  }

  async function deleteItem(id: string) {
    const confirmed = window.confirm("Delete this ITC item?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("tower_itc_register")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Failed to delete ITC item.");
      return;
    }

    await load();
  }

  const grouped = useMemo(() => {
    const map: Record<string, ItcRow[]> = {};

    DEFAULT_STAGES.forEach((s) => {
      map[s] = [];
    });

    items.forEach((item) => {
      if (!map[item.stage]) map[item.stage] = [];
      map[item.stage].push(item);
    });

    return map;
  }, [items]);

  const summary = useMemo(() => {
    return Object.entries(grouped).map(([stageName, rows]) => {
      const total = rows.length;
      const complete = rows.filter((r) => r.validation_status === "Y").length;
      return { stageName, total, complete };
    });
  }, [grouped]);

  if (loading) return <div className="p-8">Loading ITCs...</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="p-8 space-y-6">
      {/* HEADER */}
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      {/* WORKPACK SUBTABS */}
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

      {/* PAGE CARD */}
      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">ITC Register</h1>
            <p className="text-slate-500 mt-1">
              Track inspection and test checklist items by stage, validation
              status, and LH sign-off.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            {summary.map((s) => (
              <div
                key={s.stageName}
                className="bg-slate-100 rounded-xl px-4 py-3 min-w-[150px]"
              >
                <div className="text-xs text-slate-500">{s.stageName}</div>
                <div className="font-semibold">
                  {s.complete}/{s.total} complete
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ADD NEW ITEM */}
        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Add ITC Item</div>

          <div className="grid md:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs mb-1">Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              >
                {DEFAULT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Item No.</label>
              <input
                value={itemNo}
                onChange={(e) => setItemNo(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="e.g. 18"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="Checklist item description"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Validation</label>
              <select
                value={validationStatus}
                onChange={(e) => setValidationStatus(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Leading Hand</label>
              <input
                value={leadingHand}
                onChange={(e) => setLeadingHand(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="LH name"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs mb-1">Signed Date</label>
              <input
                type="date"
                value={signedDate}
                onChange={(e) => setSignedDate(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs mb-1">Comments</label>
              <input
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="Optional comments"
              />
            </div>

            <button
              onClick={addItem}
              className="bg-blue-600 text-white rounded h-[42px]"
            >
              Add
            </button>
          </div>
        </div>

        {/* STAGE SECTIONS */}
        <div className="space-y-6">
          {Object.entries(grouped).map(([stageName, rows]) => (
            <div key={stageName} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{stageName}</h2>
                <div className="text-sm text-slate-500">
                  {rows.filter((r) => r.validation_status === "Y").length}/{rows.length} complete
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="border rounded-xl p-4 text-slate-500">
                  No ITC items in this stage yet.
                </div>
              ) : (
                rows.map((row) => {
                  const isEditing = editingId === row.id;

                  return (
                    <div
                      key={row.id}
                      className="border rounded-xl p-4 space-y-3"
                    >
                      {!isEditing ? (
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="font-semibold">
                              {row.item_no ? `${row.item_no}. ` : ""}
                              {row.description}
                            </div>

                            <div className="text-sm text-slate-500">
                              Validation: {row.validation_status || "Pending"}
                            </div>

                            <div className="text-sm text-slate-500">
                              LH: {row.leading_hand || "-"}
                            </div>

                            <div className="text-sm text-slate-500">
                              Date: {row.signed_date || "-"}
                            </div>

                            {row.comments && (
                              <div className="text-sm text-slate-500">
                                Comments: {row.comments}
                              </div>
                            )}
                          </div>

                          <div className="flex gap-3 items-center">
                            <StatusPill value={row.validation_status || "Pending"} />

                            <button
                              onClick={() => startEdit(row)}
                              className="text-orange-600"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => deleteItem(row.id)}
                              className="text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid md:grid-cols-6 gap-3">
                            <div>
                              <label className="block text-xs mb-1">Stage</label>
                              <select
                                value={editStage}
                                onChange={(e) => setEditStage(e.target.value)}
                                className="border p-2 rounded w-full"
                              >
                                {DEFAULT_STAGES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs mb-1">Item No.</label>
                              <input
                                value={editItemNo}
                                onChange={(e) => setEditItemNo(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-xs mb-1">Description</label>
                              <input
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            </div>

                            <div>
                              <label className="block text-xs mb-1">Validation</label>
                              <select
                                value={editValidationStatus}
                                onChange={(e) => setEditValidationStatus(e.target.value)}
                                className="border p-2 rounded w-full"
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs mb-1">Leading Hand</label>
                              <input
                                value={editLeadingHand}
                                onChange={(e) => setEditLeadingHand(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            </div>
                          </div>

                          <div className="grid md:grid-cols-6 gap-3 items-end">
                            <div>
                              <label className="block text-xs mb-1">Signed Date</label>
                              <input
                                type="date"
                                value={editSignedDate}
                                onChange={(e) => setEditSignedDate(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            </div>

                            <div className="md:col-span-4">
                              <label className="block text-xs mb-1">Comments</label>
                              <input
                                value={editComments}
                                onChange={(e) => setEditComments(e.target.value)}
                                className="border p-2 rounded w-full"
                              />
                            </div>

                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={cancelEdit}
                                className="border px-4 py-2 rounded"
                              >
                                Cancel
                              </button>

                              <button
                                onClick={() => saveEdit(row.id)}
                                className="bg-blue-600 text-white px-4 py-2 rounded"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  let classes = "bg-slate-100 text-slate-700";

  if (value === "Y") classes = "bg-green-100 text-green-700";
  if (value === "N") classes = "bg-red-100 text-red-700";
  if (value === "NA") classes = "bg-yellow-100 text-yellow-700";

  return (
    <div className={`px-3 py-1 rounded-full text-sm ${classes}`}>
      {value}
    </div>
  );
}