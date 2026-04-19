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

type DrawingRow = {
  id: string;
  tower_id: string;
  drawing_no: string;
  title: string | null;
  revision: string | null;
  stage: string | null;
  status: string | null;
  notes: string | null;
  file_url: string | null;
  uploaded_by: string | null;
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
    .from("drawing_register")
    .getPublicUrl(fileUrl);

  return data.publicUrl;
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

function formatDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function parseDrawingFilename(filename: string) {
  const withoutPdf = filename.replace(/\.pdf$/i, "").trim();

  const parts = withoutPdf.split(".");

  let drawingNo = "";
  let revision = "";
  let stage = "IFC";
  let title = withoutPdf;

  if (parts.length >= 3) {
    drawingNo = parts[0].trim();
    revision = parts[1].trim();
    const afterStage = parts.slice(2).join(".").trim();

    if (afterStage.toUpperCase().startsWith("IFC")) {
      stage = "IFC";
      title = afterStage.replace(/^IFC\s*/i, "").trim();
    } else {
      title = afterStage;
    }
  } else {
    const ifcMatch = withoutPdf.match(/^(.*?)(?:\s+|\.)(IFC)\s+(.*)$/i);
    if (ifcMatch) {
      drawingNo = ifcMatch[1].trim();
      stage = "IFC";
      title = ifcMatch[3].trim();
    } else {
      drawingNo = withoutPdf;
      title = withoutPdf;
    }
  }

  if (!title) {
    title = withoutPdf;
  }

  return {
    drawingNo: drawingNo || withoutPdf,
    revision: revision || null,
    stage,
    title,
  };
}

export default function DrawingRegisterPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<DrawingRow[]>([]);
  const [currentUploader, setCurrentUploader] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

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

      const [towerRes, docketRes, drawingRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase
          .from("tower_daily_dockets")
          .select("docket_date")
          .eq("tower_id", towerId)
          .order("docket_date", { ascending: false })
          .limit(1),
        supabase
          .from("tower_drawing_register")
          .select("*")
          .eq("tower_id", towerId)
          .order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setTower((towerRes.data as Tower | null) ?? null);

      const docketRows =
        (docketRes.data as { docket_date: string | null }[] | null) ?? [];
      setLatestDate(docketRows.length > 0 ? docketRows[0].docket_date : null);

      setDrawings((drawingRes.data as DrawingRow[] | null) ?? []);
      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase, reloadKey]);

  const summary = useMemo(() => {
    const total = drawings.length;
    const active = drawings.filter(
      (d) => normalizeStatus(d.status) === "Active"
    ).length;
    const superseded = drawings.filter(
      (d) => normalizeStatus(d.status) === "Superseded"
    ).length;
    const archived = drawings.filter(
      (d) => normalizeStatus(d.status) === "Archived"
    ).length;

    return { total, active, superseded, archived };
  }, [drawings]);

  const filteredDrawings = useMemo(() => {
    const q = search.trim().toLowerCase();

    return drawings.filter((drawing) => {
      const status = normalizeStatus(drawing.status);

      if (statusFilter !== "All" && status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        drawing.drawing_no || "",
        drawing.title || "",
        drawing.revision || "",
        drawing.stage || "",
        drawing.uploaded_by || "",
        drawing.notes || "",
        status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [drawings, search, statusFilter]);

  async function uploadDrawings() {
    if (files.length === 0) {
      alert("Please choose one or more PDF drawings.");
      return;
    }

    if (!currentUploader.trim()) {
      alert("Could not determine logged-in user.");
      return;
    }

    const nonPdf = files.find((file) => file.type !== "application/pdf");
    if (nonPdf) {
      alert("Only PDF files are supported.");
      return;
    }

    setSaving(true);

    try {
      for (const file of files) {
        const parsed = parseDrawingFilename(file.name);

        const { data, error } = await supabase
          .from("tower_drawing_register")
          .insert({
            tower_id: towerId,
            drawing_no: parsed.drawingNo,
            title: parsed.title || null,
            revision: parsed.revision,
            stage: "IFC",
            status: "Active",
            uploaded_by: currentUploader,
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(error?.message || `Failed to create row for ${file.name}`);
        }

        const uploadRes = await supabase.storage
          .from("drawing_register")
          .upload(`${data.id}/${Date.now()}_${file.name}`, file, {
            upsert: true,
          });

        if (uploadRes.error) {
          throw new Error(uploadRes.error.message);
        }

        const { error: updateError } = await supabase
          .from("tower_drawing_register")
          .update({
            file_url: uploadRes.data.path,
          })
          .eq("id", data.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      }

      setFiles([]);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Failed to upload drawings"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteDrawing(drawing: DrawingRow) {
    const confirmed = window.confirm(
      `Delete drawing "${drawing.drawing_no}"?\n\nThis will remove the register row and attachment.`
    );
    if (!confirmed) return;

    setDeletingId(drawing.id);

    try {
      if (drawing.file_url) {
        const removeRes = await supabase.storage
          .from("drawing_register")
          .remove([drawing.file_url]);

        if (removeRes.error) {
          throw new Error(removeRes.error.message);
        }
      }

      const { error } = await supabase
        .from("tower_drawing_register")
        .delete()
        .eq("id", drawing.id);

      if (error) {
        throw new Error(error.message || "Failed to delete drawing");
      }

      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Failed to delete drawing"
      );
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
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Drawings" value={String(summary.total)} tone="slate" />
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
          <div className="text-2xl font-bold">Drawing Register</div>
          <div className="text-sm text-slate-500 mt-1">
            Bulk upload IFC drawing PDFs and automatically build the register from the filenames.
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_220px] gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-2">
              Upload IFC Drawing PDFs
            </label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="border rounded-lg p-2 w-full"
            />
            <div className="text-xs text-slate-500 mt-2">
              Example: TL-902774-01.D.IFC GEOMETRIC OUTLINE.pdf
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Uploaded By</label>
            <input
              value={currentUploader}
              readOnly
              className="border rounded-lg p-2 w-full bg-slate-50 text-slate-600"
            />
          </div>
        </div>

        {files.length > 0 && (
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="text-sm font-medium mb-2">
              {files.length} file{files.length === 1 ? "" : "s"} selected
            </div>
            <div className="space-y-1 text-sm text-slate-600 max-h-48 overflow-auto">
              {files.map((file) => {
                const parsed = parseDrawingFilename(file.name);
                return (
                  <div key={file.name} className="flex flex-wrap gap-2">
                    <span className="font-medium text-slate-900">
                      {parsed.drawingNo}
                    </span>
                    <span>Rev {parsed.revision || "-"}</span>
                    <span>IFC</span>
                    <span className="text-slate-500">•</span>
                    <span>{parsed.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={uploadDrawings}
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving ? "Uploading..." : "Upload Drawings"}
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            className="border rounded-lg px-3 py-2 w-full md:w-96"
            placeholder="Search drawing no, title, revision..."
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
            Showing <span className="font-medium">{filteredDrawings.length}</span> of{" "}
            <span className="font-medium">{drawings.length}</span> drawings
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredDrawings.length === 0 ? (
          <div className="bg-white border rounded-2xl p-10 text-center text-slate-500">
            No drawings match your search or filter.
          </div>
        ) : (
          filteredDrawings.map((drawing) => {
            const status = normalizeStatus(drawing.status);
            const attachmentHref = getAttachmentHref(supabase, drawing.file_url);

            return (
              <div
                key={drawing.id}
                className="bg-white border rounded-2xl p-6 shadow-sm"
              >
                <div className="space-y-5">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-2xl font-semibold tracking-tight text-slate-900">
                          {drawing.drawing_no}
                        </div>

                        <div
                          className={`px-3 py-1 rounded-full text-sm border ${getStatusClasses(
                            status
                          )}`}
                        >
                          {status}
                        </div>
                      </div>

                      <div className="text-base text-slate-700">
                        {drawing.title || "-"}
                      </div>

                      <div className="text-sm text-slate-500 font-medium">
                        Rev {drawing.revision || "-"} • {drawing.stage || "IFC"}
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
                          View Drawing
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
                        onClick={() => deleteDrawing(drawing)}
                        disabled={deletingId === drawing.id}
                        className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 disabled:opacity-60"
                      >
                        {deletingId === drawing.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-4 gap-6 items-start">
                    <MetaLine label="Revision" value={drawing.revision || "-"} />
                    <MetaLine label="Stage" value={drawing.stage || "IFC"} />
                    <MetaLine label="Uploaded By" value={drawing.uploaded_by || "-"} />
                    <MetaLine label="Uploaded" value={formatDate(drawing.created_at)} />
                  </div>

                  {drawing.notes && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                        Notes
                      </div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-6">
                        {drawing.notes}
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