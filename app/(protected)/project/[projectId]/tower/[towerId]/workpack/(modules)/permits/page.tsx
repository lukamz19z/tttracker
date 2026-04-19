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

type PermitDoc = {
  id: string;
  tower_id: string;
  permit_type: string | null;
  permit_number: string | null;
  document_label: string;
  issued_by: string | null;
  uploaded_by: string | null;
  date_from: string | null;
  date_to: string | null;
  notes: string | null;
  file_url: string | null;
  closed_out: boolean | null;
  created_at?: string | null;
};

type StatusFilter = "All" | "Active" | "Expired" | "Upcoming" | "Closed";

function getPermitStatus(doc: PermitDoc): Exclude<StatusFilter, "All"> {
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

function hasAttachment(doc: PermitDoc) {
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

  const { data } = supabase.storage.from("permit_docs").getPublicUrl(fileUrl);
  return data.publicUrl;
}

export default function PermitsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [docs, setDocs] = useState<PermitDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [currentUploader, setCurrentUploader] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const [permitType, setPermitType] = useState("");
  const [permitNumber, setPermitNumber] = useState("");
  const [label, setLabel] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPermitType, setEditPermitType] = useState("");
  const [editPermitNumber, setEditPermitNumber] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editIssuedBy, setEditIssuedBy] = useState("");
  const [editUploadedBy, setEditUploadedBy] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editNotes, setEditNotes] = useState("");
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

      const [towerRes, docketsRes, permitDocsRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_daily_dockets")
          .select("docket_date")
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false })
          .limit(1),
        supabase
          .from("tower_permits")
          .select("*")
          .eq("tower_id", towerId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setTower((towerRes.data as Tower | null) ?? null);

      const docketRows =
        (docketsRes.data as { docket_date: string | null }[] | null) ?? [];
      setLatestDate(docketRows.length > 0 ? docketRows[0].docket_date : null);

      setDocs((permitDocsRes.data as PermitDoc[] | null) ?? []);
      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase, reloadKey]);

  const summary = useMemo(() => {
    const active = docs.filter((d) => getPermitStatus(d) === "Active").length;
    const expired = docs.filter((d) => getPermitStatus(d) === "Expired").length;
    const upcoming = docs.filter((d) => getPermitStatus(d) === "Upcoming").length;
    const closed = docs.filter((d) => getPermitStatus(d) === "Closed").length;

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
      const status = getPermitStatus(doc);

      if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        doc.document_label || "",
        doc.permit_type || "",
        doc.permit_number || "",
        doc.issued_by || "",
        doc.uploaded_by || "",
        doc.date_from || "",
        doc.date_to || "",
        doc.notes || "",
        status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [docs, search, statusFilter]);

  async function addDoc() {
    if (!label.trim()) {
      alert("Enter permit title");
      return;
    }

    if (!currentUploader.trim()) {
      alert("Could not determine logged-in user.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("tower_permits")
        .insert({
          tower_id: towerId,
          permit_type: permitType.trim() || null,
          permit_number: permitNumber.trim() || null,
          document_label: label.trim(),
          issued_by: issuedBy.trim() || null,
          uploaded_by: currentUploader,
          date_from: from || null,
          date_to: to || null,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error("Failed to add permit");
      }

      if (file) {
        const uploadRes = await supabase.storage
          .from("permit_docs")
          .upload(`${data.id}/${Date.now()}_${file.name}`, file, {
            upsert: true,
          });

        if (uploadRes.error) {
          throw new Error(uploadRes.error.message);
        }

        const { error: fileUpdateError } = await supabase
          .from("tower_permits")
          .update({ file_url: uploadRes.data.path })
          .eq("id", data.id);

        if (fileUpdateError) {
          throw new Error(fileUpdateError.message);
        }
      }

      setPermitType("");
      setPermitNumber("");
      setLabel("");
      setIssuedBy("");
      setFrom("");
      setTo("");
      setNotes("");
      setFile(null);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to add permit");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(doc: PermitDoc) {
    setEditingId(doc.id);
    setEditPermitType(doc.permit_type || "");
    setEditPermitNumber(doc.permit_number || "");
    setEditLabel(doc.document_label || "");
    setEditIssuedBy(doc.issued_by || "");
    setEditUploadedBy(doc.uploaded_by || "");
    setEditFrom(doc.date_from || "");
    setEditTo(doc.date_to || "");
    setEditNotes(doc.notes || "");
    setEditFile(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPermitType("");
    setEditPermitNumber("");
    setEditLabel("");
    setEditIssuedBy("");
    setEditUploadedBy("");
    setEditFrom("");
    setEditTo("");
    setEditNotes("");
    setEditFile(null);
  }

  async function saveEdit(doc: PermitDoc) {
    if (!editLabel.trim()) {
      alert("Enter permit title");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("tower_permits")
        .update({
          permit_type: editPermitType.trim() || null,
          permit_number: editPermitNumber.trim() || null,
          document_label: editLabel.trim(),
          issued_by: editIssuedBy.trim() || null,
          uploaded_by: editUploadedBy.trim() || null,
          date_from: editFrom || null,
          date_to: editTo || null,
          notes: editNotes.trim() || null,
        })
        .eq("id", doc.id);

      if (error) {
        throw new Error("Failed to update permit");
      }

      if (editFile) {
        const uploadRes = await supabase.storage
          .from("permit_docs")
          .upload(`${doc.id}/${Date.now()}_${editFile.name}`, editFile, {
            upsert: true,
          });

        if (uploadRes.error) {
          throw new Error(uploadRes.error.message);
        }

        const { error: fileUpdateError } = await supabase
          .from("tower_permits")
          .update({ file_url: uploadRes.data.path })
          .eq("id", doc.id);

        if (fileUpdateError) {
          throw new Error(fileUpdateError.message);
        }
      }

      cancelEdit();
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to update permit");
    } finally {
      setSaving(false);
    }
  }

  async function closeOut(docId: string) {
    await supabase
      .from("tower_permits")
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
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
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
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold whitespace-nowrap"
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
        <SummaryCard label="Total Permits" value={String(summary.total)} tone="slate" />
        <SummaryCard label="Active" value={String(summary.active)} tone="green" />
        <SummaryCard label="Expired" value={String(summary.expired)} tone="red" />
        <SummaryCard label="Upcoming" value={String(summary.upcoming)} tone="amber" />
        <SummaryCard label="Closed" value={String(summary.closed)} tone="slate" />
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-2xl font-bold">Permits Register</div>
          <div className="text-sm text-slate-500 mt-1">
            Track tower permits, validity dates, issuer details and attached permit files.
          </div>
        </div>

        <div className="grid lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-xs mb-1 font-medium">Permit Type</label>
            <input
              placeholder="e.g. Work at Height"
              value={permitType}
              onChange={(e) => setPermitType(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Permit Number</label>
            <input
              placeholder="e.g. PTW-001"
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs mb-1 font-medium">Permit Title</label>
            <input
              placeholder="e.g. Tower 12 Lift Permit"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Issued By</label>
            <input
              placeholder="Issuer"
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Uploaded By</label>
            <input
              value={currentUploader}
              readOnly
              className="border p-2.5 rounded-lg w-full bg-slate-50 text-slate-600"
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-3 items-end">
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

          <div className="flex justify-end">
            <button
              onClick={addDoc}
              disabled={saving}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Add Permit"}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border p-3 rounded-lg w-full min-h-24"
            placeholder="Optional notes..."
          />
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            className="border rounded-lg px-3 py-2 w-full md:w-96"
            placeholder="Search permit type, number, title, issuer..."
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
            <span className="font-medium">{docs.length}</span> permits
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredDocs.length === 0 ? (
          <div className="bg-white border rounded-2xl p-10 text-center text-slate-500">
            No permits match your search or filter.
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isEditing = editingId === doc.id;
            const currentStatus = getPermitStatus(doc);
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

                        <div className="text-sm text-slate-500">
                          {doc.permit_type || "-"} {doc.permit_number ? `• ${doc.permit_number}` : ""}
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

                    <div className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_1fr]">
                      <div className="rounded-xl border bg-slate-50 px-4 py-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Issued / Uploaded
                        </div>
                        <div className="mt-2 space-y-1">
                          <div className="text-sm text-slate-500">Issued By</div>
                          <div className="font-semibold">{doc.issued_by || "-"}</div>
                          <div className="text-sm text-slate-500 mt-2">Uploaded By</div>
                          <div className="font-semibold break-all">
                            {doc.uploaded_by || "-"}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
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
                        <InfoMiniCompact
                          label="Permit No."
                          value={doc.permit_number || "-"}
                        />
                      </div>

                      <div className="rounded-xl border bg-slate-50 px-4 py-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Notes
                        </div>
                        <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                          {doc.notes || "-"}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid lg:grid-cols-6 gap-3 items-end">
                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Permit Type
                        </label>
                        <input
                          value={editPermitType}
                          onChange={(e) => setEditPermitType(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Permit Number
                        </label>
                        <input
                          value={editPermitNumber}
                          onChange={(e) => setEditPermitNumber(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="block text-xs mb-1 font-medium">
                          Permit Title
                        </label>
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Issued By
                        </label>
                        <input
                          value={editIssuedBy}
                          onChange={(e) => setEditIssuedBy(e.target.value)}
                          className="border p-2.5 rounded-lg w-full"
                        />
                      </div>

                      <div>
                        <label className="block text-xs mb-1 font-medium">
                          Uploaded By
                        </label>
                        <input
                          value={editUploadedBy}
                          readOnly
                          className="border p-2.5 rounded-lg w-full bg-slate-50 text-slate-600"
                        />
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-4 gap-3 items-end">
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

                    <div>
                      <label className="block text-xs mb-1 font-medium">Notes</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="border p-3 rounded-lg w-full min-h-24"
                      />
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