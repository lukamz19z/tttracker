"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
  cover_photo_path?: string | null;
};

type SafetyDoc = {
  id: string;
  tower_id: string;
  document_label: string;
  leading_hand: string | null;
  date_from: string | null;
  date_to: string | null;
  file_url: string | null;
  closed_out: boolean | null;
  created_at?: string | null;
};

type StatusFilter = "All" | "Active" | "Expired" | "Upcoming" | "Closed";

function getDocStatus(doc: SafetyDoc): Exclude<StatusFilter, "All"> {
  const today = new Date().toISOString().slice(0, 10);

  if (doc.closed_out) return "Closed";
  if (doc.date_to && today > doc.date_to) return "Expired";
  if (doc.date_from && today < doc.date_from) return "Upcoming";
  return "Active";
}

function getStatusClasses(status: Exclude<StatusFilter, "All">) {
  if (status === "Active") {
    return "bg-green-100 text-green-700 border-green-200";
  }
  if (status === "Expired") {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (status === "Closed") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  return "bg-amber-100 text-amber-700 border-amber-200";
}

function formatDate(value: string | null) {
  return value || "-";
}

function getDisplayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const meta = user.user_metadata || {};

  const candidates = [
    meta.full_name,
    meta.name,
    meta.display_name,
    meta.preferred_name,
    user.email,
  ];

  const found = candidates.find(
    (value) => typeof value === "string" && value.trim() !== ""
  );

  return typeof found === "string" ? found : "Unknown User";
}

function hasAttachment(doc: SafetyDoc) {
  return Boolean(doc.file_url && doc.file_url.trim() !== "");
}

function getAttachmentHref(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  fileUrl: string | null
) {
  if (!fileUrl || fileUrl.trim() === "") return null;

  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  const { data } = supabase.storage.from("safety_docs").getPublicUrl(fileUrl);
  return data.publicUrl;
}

export default function SafetyRegisterPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [docs, setDocs] = useState<SafetyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentUploader, setCurrentUploader] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editLh, setEditLh] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (user) {
        setCurrentUploader(
          getDisplayNameFromUser({
            email: user.email,
            user_metadata: user.user_metadata,
          })
        );
      } else {
        setCurrentUploader("");
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [towerRes, docketsRes, safetyDocsRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_daily_dockets")
          .select("docket_date")
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false })
          .limit(1),
        supabase
          .from("tower_safety_register")
          .select("*")
          .eq("tower_id", towerId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setTower((towerRes.data as Tower | null) ?? null);

      const docketRows =
        (docketsRes.data as { docket_date: string | null }[] | null) ?? [];
      setLatestDate(docketRows.length > 0 ? docketRows[0].docket_date : null);

      setDocs((safetyDocsRes.data as SafetyDoc[] | null) ?? []);
      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase, reloadKey]);

  const summary = useMemo(() => {
    const active = docs.filter((d) => getDocStatus(d) === "Active").length;
    const expired = docs.filter((d) => getDocStatus(d) === "Expired").length;
    const upcoming = docs.filter((d) => getDocStatus(d) === "Upcoming").length;
    const closed = docs.filter((d) => getDocStatus(d) === "Closed").length;

    return {
      total: docs.length,
      active,
      expired,
      upcoming,
      closed,
    };
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return docs.filter((doc) => {
      const status = getDocStatus(doc);

      if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        doc.document_label || "",
        doc.leading_hand || "",
        doc.date_from || "",
        doc.date_to || "",
        doc.created_at || "",
        status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [docs, search, statusFilter]);

  async function addDoc() {
    if (!label.trim()) {
      alert("Enter document label");
      return;
    }

    if (!currentUploader.trim()) {
      alert("Could not determine logged-in user.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("tower_safety_register")
        .insert({
          tower_id: towerId,
          document_label: label.trim(),
          leading_hand: currentUploader,
          date_from: from || null,
          date_to: to || null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error("Failed to add safety document");
      }

      if (file) {
        const uploadRes = await supabase.storage
          .from("safety_docs")
          .upload(`${data.id}/${Date.now()}_${file.name}`, file, {
            upsert: true,
          });

        if (!uploadRes.error) {
          await supabase
            .from("tower_safety_register")
            .update({ file_url: uploadRes.data.path })
            .eq("id", data.id);
        }
      }

      setLabel("");
      setFrom("");
      setTo("");
      setFile(null);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to add document");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(doc: SafetyDoc) {
    setEditingId(doc.id);
    setEditLabel(doc.document_label || "");
    setEditLh(doc.leading_hand || "");
    setEditFrom(doc.date_from || "");
    setEditTo(doc.date_to || "");
    setEditFile(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditLh("");
    setEditFrom("");
    setEditTo("");
    setEditFile(null);
  }

  async function saveEdit(doc: SafetyDoc) {
    if (!editLabel.trim()) {
      alert("Enter document label");
      return;
    }

    setSaving(true);

    try {
      const updatePayload: Partial<SafetyDoc> = {
        document_label: editLabel.trim(),
        leading_hand: editLh.trim() || null,
        date_from: editFrom || null,
        date_to: editTo || null,
      };

      const { error } = await supabase
        .from("tower_safety_register")
        .update(updatePayload)
        .eq("id", doc.id);

      if (error) {
        throw new Error("Failed to update safety document");
      }

      if (editFile) {
        const uploadRes = await supabase.storage
          .from("safety_docs")
          .upload(`${doc.id}/${Date.now()}_${editFile.name}`, editFile, {
            upsert: true,
          });

        if (!uploadRes.error) {
          await supabase
            .from("tower_safety_register")
            .update({ file_url: uploadRes.data.path })
            .eq("id", doc.id);
        }
      }

      cancelEdit();
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to update document");
    } finally {
      setSaving(false);
    }
  }

  async function closeOut(docId: string) {
    await supabase
      .from("tower_safety_register")
      .update({ closed_out: true })
      .eq("id", docId);

    setReloadKey((v) => v + 1);
  }

  if (loading || !tower) {
    return <div className="p-8">Loading...</div>;
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
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard label="Total Docs" value={String(summary.total)} tone="slate" />
        <SummaryCard label="Active" value={String(summary.active)} tone="green" />
        <SummaryCard label="Expired" value={String(summary.expired)} tone="red" />
        <SummaryCard label="Upcoming" value={String(summary.upcoming)} tone="amber" />
        <SummaryCard label="Closed" value={String(summary.closed)} tone="slate" />
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-2xl font-bold">Safety Register</div>
          <div className="text-sm text-slate-500 mt-1">
            Upload scanned sign-ons, permits, SWMS, work instructions and related safety documents.
          </div>
        </div>

        <div className="grid lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs mb-1 font-medium">Document Label</label>
            <input
              placeholder="e.g. Daily Sign On / SWMS / Permit"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Uploader</label>
            <input
              value={currentUploader}
              readOnly
              className="border p-2.5 rounded-lg w-full bg-slate-50 text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Valid From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Valid To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Attach File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border p-2 rounded-lg w-full"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={addDoc}
            disabled={saving}
            className="bg-blue-600 text-white rounded-xl px-5 py-2.5 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add Safety Record"}
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            className="border rounded-lg px-3 py-2 w-full md:w-80"
            placeholder="Search label, uploader or date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="border rounded-lg px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Expired">Expired</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Closed">Closed</option>
          </select>

          <div className="text-sm text-slate-500 md:ml-auto">
            Showing <span className="font-medium">{filteredDocs.length}</span> of{" "}
            <span className="font-medium">{docs.length}</span> records
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
          <div className="bg-white border rounded-2xl p-10 text-center text-slate-500">
            No safety documents match your search or filter.
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isEditing = editingId === doc.id;
            const currentStatus = getDocStatus(doc);
            const attachmentHref = getAttachmentHref(supabase, doc.file_url);

            return (
              <div key={doc.id} className="bg-white border rounded-2xl p-5">
                {!isEditing ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-4 flex-wrap">
                      <div className="space-y-2 min-w-[260px]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-lg font-semibold">
                            {doc.document_label}
                          </div>

                          <div
                            className={`px-3 py-1 rounded-full text-sm border ${getStatusClasses(
                              currentStatus
                            )}`}
                          >
                            {currentStatus}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 items-center flex-wrap justify-end">
                        {attachmentHref ? (
                          <a
                            href={attachmentHref}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800"
                          >
                            View Attachment
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="bg-slate-200 text-slate-500 px-4 py-2 rounded-lg cursor-not-allowed"
                          >
                            No Attachment
                          </button>
                        )}

                        <button
                          onClick={() => startEdit(doc)}
                          className="border px-4 py-2 rounded-lg hover:bg-slate-50 text-orange-700"
                        >
                          Edit
                        </button>

                        {currentStatus === "Expired" && !doc.closed_out && (
                          <button
                            onClick={() => closeOut(doc.id)}
                            className="bg-red-600 text-white px-4 py-2 rounded-lg"
                          >
                            Close Out
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                      <div className="rounded-xl border bg-slate-50 px-4 py-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Uploaded By
                        </div>
                        <div className="text-base font-semibold mt-1 break-all">
                          {doc.leading_hand || "-"}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <InfoMiniCompact
                          label="Valid From"
                          value={formatDate(doc.date_from)}
                        />
                        <InfoMiniCompact
                          label="Valid To"
                          value={formatDate(doc.date_to)}
                        />
                        <InfoMiniCompact
                          label="Uploaded"
                          value={doc.created_at ? doc.created_at.slice(0, 10) : "-"}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid lg:grid-cols-5 gap-3 items-end">
                      <div className="lg:col-span-2">
                        <label className="block text-xs mb-1 font-medium">
                          Document Label
                        </label>
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Uploaded By
                        </label>
                        <input
                          value={editLh}
                          readOnly
                          className="border p-2.5 rounded-lg w-full bg-slate-50 text-slate-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Valid From
                        </label>
                        <input
                          type="date"
                          value={editFrom}
                          onChange={(e) => setEditFrom(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Valid To
                        </label>
                        <input
                          type="date"
                          value={editTo}
                          onChange={(e) => setEditTo(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-[1fr_auto] gap-3 items-end">
                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Replace File
                        </label>
                        <input
                          type="file"
                          onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                          className="border p-2 rounded-lg w-full"
                        />
                      </div>

                      <div className="flex gap-2 justify-end flex-wrap">
                        {attachmentHref ? (
                          <a
                            href={attachmentHref}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800"
                          >
                            View Attachment
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="bg-slate-200 text-slate-500 px-4 py-2 rounded-lg cursor-not-allowed"
                          >
                            No Attachment
                          </button>
                        )}

                        <button
                          onClick={cancelEdit}
                          className="border px-4 py-2 rounded-lg hover:bg-slate-50"
                        >
                          Cancel
                        </button>

                        <button
                          onClick={() => saveEdit(doc)}
                          disabled={saving}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-60"
                        >
                          {saving ? "Saving..." : "Save"}
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
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "amber" | "slate";
}) {
  const classes: Record<typeof tone, string> = {
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  };

  return (
    <div className={`border rounded-2xl p-4 ${classes[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function InfoMiniCompact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold mt-1">{value}</div>
    </div>
  );
}