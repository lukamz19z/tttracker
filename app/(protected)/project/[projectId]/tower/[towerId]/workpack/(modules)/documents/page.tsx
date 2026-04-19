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

type WorkpackDocument = {
  id: string;
  tower_id: string;
  document_name: string;
  document_type: string | null;
  stage: string | null;
  notes: string | null;
  file_url: string | null;
  uploaded_by: string | null;
  status: string | null;
  created_at: string | null;
};

type StatusFilter = "All" | "Active" | "Superseded" | "Archived";

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

function getAttachmentHref(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  fileUrl: string | null
) {
  if (!fileUrl || fileUrl.trim() === "") return null;

  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  const { data } = supabase.storage
    .from("workpack_documents")
    .getPublicUrl(fileUrl);

  return data.publicUrl;
}

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function normalizeStatus(status?: string | null): Exclude<StatusFilter, "All"> {
  const value = (status || "").trim().toLowerCase();

  if (value === "superseded") return "Superseded";
  if (value === "archived") return "Archived";
  return "Active";
}

function getStatusClasses(status: Exclude<StatusFilter, "All">) {
  if (status === "Superseded") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (status === "Archived") {
    return "bg-slate-100 text-slate-700 border-slate-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-200";
}

export default function WorkpackDocumentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [docs, setDocs] = useState<WorkpackDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [currentUploader, setCurrentUploader] = useState("");

  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("");
  const [stage, setStage] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

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

      const [towerRes, docketRes, docsRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_daily_dockets")
          .select("docket_date")
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false })
          .limit(1),
        supabase
          .from("tower_workpack_documents")
          .select("*")
          .eq("tower_id", towerId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setTower((towerRes.data as Tower | null) ?? null);

      const docketRows =
        (docketRes.data as { docket_date: string | null }[] | null) ?? [];
      setLatestDate(docketRows.length > 0 ? docketRows[0].docket_date : null);

      setDocs((docsRes.data as WorkpackDocument[] | null) ?? []);
      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase, reloadKey]);

  const summary = useMemo(() => {
    const total = docs.length;
    const active = docs.filter((d) => normalizeStatus(d.status) === "Active").length;
    const superseded = docs.filter(
      (d) => normalizeStatus(d.status) === "Superseded"
    ).length;
    const archived = docs.filter(
      (d) => normalizeStatus(d.status) === "Archived"
    ).length;

    return { total, active, superseded, archived };
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();

    return docs.filter((doc) => {
      const status = normalizeStatus(doc.status);

      if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        doc.document_name || "",
        doc.document_type || "",
        doc.stage || "",
        doc.notes || "",
        doc.uploaded_by || "",
        status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [docs, search, statusFilter]);

  async function addDoc() {
    if (!docName.trim()) {
      alert("Enter document name");
      return;
    }

    if (!currentUploader.trim()) {
      alert("Could not determine logged-in user.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("tower_workpack_documents")
        .insert({
          tower_id: towerId,
          document_name: docName.trim(),
          document_type: docType.trim() || null,
          stage: stage.trim() || null,
          notes: notes.trim() || null,
          uploaded_by: currentUploader,
          status: "Active",
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || "Failed to add document");
      }

      if (file) {
        const uploadRes = await supabase.storage
          .from("workpack_documents")
          .upload(`${data.id}/${Date.now()}_${file.name}`, file, {
            upsert: true,
          });

        if (uploadRes.error) {
          throw new Error(uploadRes.error.message);
        }

        const { error: fileUpdateError } = await supabase
          .from("tower_workpack_documents")
          .update({ file_url: uploadRes.data.path })
          .eq("id", data.id);

        if (fileUpdateError) {
          throw new Error(fileUpdateError.message);
        }
      }

      setDocName("");
      setDocType("");
      setStage("");
      setNotes("");
      setFile(null);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to add document");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc(doc: WorkpackDocument) {
    const confirmed = window.confirm(
      `Delete document "${doc.document_name}"?\n\nThis will remove the record.`
    );
    if (!confirmed) return;

    setDeletingId(doc.id);

    try {
      if (doc.file_url) {
        const removeRes = await supabase.storage
          .from("workpack_documents")
          .remove([doc.file_url]);

        if (removeRes.error) {
          throw new Error(removeRes.error.message);
        }
      }

      const { error } = await supabase
        .from("tower_workpack_documents")
        .delete()
        .eq("id", doc.id);

      if (error) {
        throw new Error(error.message || "Failed to delete document");
      }

      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
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
  href={`/project/${projectId}/tower/${towerId}/workpack/drawings`}
>
  Drawings
</Link>
        <Link
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Docs" value={String(summary.total)} tone="slate" />
        <SummaryCard label="Active" value={String(summary.active)} tone="blue" />
        <SummaryCard
          label="Superseded"
          value={String(summary.superseded)}
          tone="amber"
        />
        <SummaryCard
          label="Archived"
          value={String(summary.archived)}
          tone="slate"
        />
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-2xl font-bold">Client Documents Register</div>
          <div className="text-sm text-slate-500 mt-1">
            Upload and manage extra client-provided documentation for this tower.
          </div>
        </div>

        <div className="grid lg:grid-cols-6 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs mb-1 font-medium">Document Name</label>
            <input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. IFC Drawing Package"
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Document Type</label>
            <input
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              placeholder="e.g. Drawing / Client Notice"
              className="border p-2.5 rounded-lg w-full"
            />
          </div>

          <div>
            <label className="block text-xs mb-1 font-medium">Stage</label>
            <input
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              placeholder="e.g. Pre-Assembly"
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

          <div>
            <label className="block text-xs mb-1 font-medium">Attach File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border p-2 rounded-lg w-full"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1 font-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className="border p-3 rounded-lg w-full min-h-24"
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={addDoc}
            disabled={saving}
            className="bg-blue-600 text-white rounded-xl px-5 py-2.5 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add Document"}
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            className="border rounded-lg px-3 py-2 w-full md:w-96"
            placeholder="Search name, type, stage, uploader..."
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
            <option value="Superseded">Superseded</option>
            <option value="Archived">Archived</option>
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
            No documents match your search or filter.
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const status = normalizeStatus(doc.status);
            const attachmentHref = getAttachmentHref(supabase, doc.file_url);

            return (
              <div
                key={doc.id}
                className="bg-white border rounded-2xl p-6 shadow-sm"
              >
                <div className="space-y-5">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-2xl font-semibold tracking-tight text-slate-900">
                          {doc.document_name}
                        </div>

                        <div
                          className={`px-3 py-1 rounded-full text-sm border ${getStatusClasses(
                            status
                          )}`}
                        >
                          {status}
                        </div>
                      </div>

                      <div className="text-sm text-slate-500 font-medium">
                        {doc.document_type || "-"}
                        {doc.stage ? ` • ${doc.stage}` : ""}
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
                        onClick={() => deleteDoc(doc)}
                        disabled={deletingId === doc.id}
                        className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 disabled:opacity-60"
                      >
                        {deletingId === doc.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-[1fr_1fr_1fr] gap-6 items-start">
                    <MetaLine label="Stage" value={doc.stage || "-"} />
                    <MetaLine label="Uploaded By" value={doc.uploaded_by || "-"} />
                    <MetaLine label="Uploaded" value={formatDate(doc.created_at)} />
                  </div>

                  {doc.notes && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                        Notes
                      </div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-6">
                        {doc.notes}
                      </div>
                    </div>
                  )}
                </div>
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
  tone: "blue" | "amber" | "slate";
}) {
  const classes: Record<typeof tone, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
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

function MetaLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-base font-medium text-slate-900 break-all">{value}</div>
    </div>
  );
}