/* eslint-disable @next/next/no-img-element */
"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Filter,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import IssueTypeManager from "@/components/quality/IssueTypeManager";
import TowerMemberFields, { type TowerMaterialMember } from "@/components/quality/TowerMemberFields";
import TowerHeader from "@/components/towers/TowerHeader";
import { createSupabaseBrowser } from "@/lib/supabase";

type TowerRow = {
  id: string;
  name?: string | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  progress?: number | null;
  status?: string | null;
  [key: string]: unknown;
};

type IssueType = {
  id: string;
  applies_to: "defect" | "revision" | "both";
  name: string;
  active: boolean;
  sort_order: number;
};

type DefectRow = {
  id: string;
  project_id: string | null;
  tower_id: string;
  sequence_no: number | null;
  defect_number: string | null;
  issue_type_id: string | null;
  member_number: string | null;
  segment: string | null;
  drawing_number: string | null;
  description: string | null;
  responsibility: string | null;
  client_reference: string | null;
  severity: "Minor" | "Major" | "Critical";
  status: "Open" | "In Progress" | "Fixed" | "Closed";
  source: string | null;
  identified_at: string | null;
  identified_by_label: string | null;
  photo_url: string | null;
  uploaded_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
};

type QualityFile = {
  id: string;
  defect_id: string | null;
  file_role: "defect_photo";
  file_name: string;
  mime_type: string | null;
  captured_at: string | null;
  uploaded_by_label: string | null;
};

type LegacyPhoto = {
  id: string;
  defect_id: string;
  photo_path: string;
  created_at: string;
};

type DefectAction = {
  id: string;
  defect_id: string;
  action_note: string;
  created_by: string | null;
  created_at: string;
};

type EditDraft = {
  id: string;
  issue_type_id: string;
  member_number: string;
  segment: string;
  drawing_number: string;
  description: string;
  responsibility: string;
  client_reference: string;
  severity: DefectRow["severity"];
  status: DefectRow["status"];
  resolution_notes: string;
};

type PhotoView = {
  id: string;
  name: string;
  url: string;
  source: "sharepoint" | "legacy";
  capturedAt: string | null;
  uploadedBy: string | null;
};

const BLANK_FORM = {
  issue_type_id: "",
  member_number: "",
  segment: "",
  drawing_number: "",
  description: "",
  responsibility: "",
  client_reference: "",
  severity: "Minor" as DefectRow["severity"],
  files: [] as File[],
};

function prettyDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-AU");
}

function severityClasses(value: DefectRow["severity"]) {
  if (value === "Critical") return "bg-rose-100 text-rose-700";
  if (value === "Major") return "bg-amber-100 text-amber-700";
  return "bg-yellow-100 text-yellow-700";
}

function statusClasses(value: DefectRow["status"]) {
  if (value === "Closed") return "bg-emerald-100 text-emerald-700";
  if (value === "Fixed") return "bg-blue-100 text-blue-700";
  if (value === "In Progress") return "bg-violet-100 text-violet-700";
  return "bg-rose-100 text-rose-700";
}

export default function TowerDefectsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<TowerRow | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [rows, setRows] = useState<DefectRow[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [qualityFiles, setQualityFiles] = useState<QualityFile[]>([]);
  const [towerMembers, setTowerMembers] = useState<TowerMaterialMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [issueManagerOpen, setIssueManagerOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [actionsDefect, setActionsDefect] = useState<DefectRow | null>(null);
  const [actions, setActions] = useState<DefectAction[]>([]);
  const [newAction, setNewAction] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  const [photosDefect, setPhotosDefect] = useState<DefectRow | null>(null);
  const [photoViews, setPhotoViews] = useState<PhotoView[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [preview, setPreview] = useState<PhotoView | null>(null);

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const load = useCallback(async () => {
    if (!towerId || !projectId) return;
    setLoading(true);

    const [towerRes, docketRes, defectRes, issueRes, fileRes, memberRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_defects")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_field_issue_types")
        .select("id,applies_to,name,active,sort_order")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("name"),
      supabase
        .from("tower_quality_files")
        .select("id,defect_id,file_role,file_name,mime_type,captured_at,uploaded_by_label")
        .eq("tower_id", towerId)
        .eq("file_role", "defect_photo")
        .order("created_at"),
      supabase
        .from("tower_material_members")
        .select("id,tower_id,bundle_reference,drawing_number,mark_no,qty_per_tower,section,tower_segment")
        .eq("tower_id", towerId)
        .order("tower_segment")
        .order("mark_no"),
    ]);

    if (towerRes.error) console.error("Tower load error", towerRes.error);
    if (docketRes.error) console.error("Docket load error", docketRes.error);
    if (defectRes.error) console.error("Defect load error", defectRes.error);
    if (issueRes.error) console.error("Issue type load error", issueRes.error);
    if (fileRes.error) console.error("Quality file load error", fileRes.error);
    if (memberRes.error) console.error("Tower member load error", memberRes.error);

    setTower((towerRes.data as TowerRow | null) ?? null);
    setLatestDate(docketRes.data?.[0]?.docket_date ?? null);
    setRows((defectRes.data ?? []) as DefectRow[]);
    setIssueTypes((issueRes.data ?? []) as IssueType[]);
    setQualityFiles((fileRes.data ?? []) as QualityFile[]);
    setTowerMembers((memberRes.data ?? []) as TowerMaterialMember[]);
    setLoading(false);
  }, [projectId, supabase, towerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const defectIssueTypes = useMemo(() => {
    const seen = new Set<string>();
    return issueTypes.filter((item) => {
      if (!item.active || !["defect", "both"].includes(item.applies_to)) return false;
      const key = item.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [issueTypes]);

  const issueTypeName = useCallback(
    (id: string | null) => issueTypes.find((item) => item.id === id)?.name || "Other",
    [issueTypes],
  );

  const filesByDefect = useMemo(() => {
    const map = new Map<string, QualityFile[]>();
    qualityFiles.forEach((file) => {
      if (!file.defect_id) return;
      const list = map.get(file.defect_id) ?? [];
      list.push(file);
      map.set(file.defect_id, list);
    });
    return map;
  }, [qualityFiles]);

  const stats = useMemo(() => {
    const open = rows.filter((row) => row.status === "Open").length;
    const inProgress = rows.filter((row) => row.status === "In Progress").length;
    const fixed = rows.filter((row) => row.status === "Fixed").length;
    const closed = rows.filter((row) => row.status === "Closed").length;
    return { total: rows.length, open, inProgress, fixed, closed };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "All" || row.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        row.defect_number,
        row.member_number,
        row.segment,
        row.drawing_number,
        row.description,
        row.client_reference,
        row.responsibility,
        issueTypeName(row.issue_type_id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [issueTypeName, rows, search, statusFilter]);

  function isHeic(file: File) {
    const name = file.name.toLowerCase();
    return (
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      name.endsWith(".heic") ||
      name.endsWith(".heif")
    );
  }

  async function normalisePhoto(file: File) {
    if (!isHeic(file)) return file;
    const heic2anyModule = await import("heic2any");
    const converted = await heic2anyModule.default({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  async function uploadDefectPhotos(defectId: string, files: File[]) {
    for (const original of files) {
      const file = await normalisePhoto(original);
      const body = new FormData();
      body.set("projectId", projectId);
      body.set("towerId", towerId);
      body.set("defectId", defectId);
      body.set("fileRole", "defect_photo");
      body.set("capturedAt", new Date().toISOString());
      body.set("file", file);

      const response = await apiFetch("/api/quality/files/upload", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Failed to upload ${original.name}.`);
    }
  }

  async function saveDefect() {
    if (!form.description.trim()) {
      setMessage({ tone: "error", text: "Enter a Defect description." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userLabel =
        user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Unknown User";

      const { data, error } = await supabase
        .from("tower_defects")
        .insert({
          project_id: projectId,
          tower_id: towerId,
          issue_type_id: form.issue_type_id || null,
          member_number: form.member_number.trim() || null,
          segment: form.segment.trim() || null,
          drawing_number: form.drawing_number.trim() || null,
          description: form.description.trim(),
          responsibility: form.responsibility.trim() || null,
          client_reference: form.client_reference.trim() || null,
          severity: form.severity,
          status: "Open",
          source: "manual",
          identified_at: new Date().toISOString(),
          identified_by: user?.id ?? null,
          identified_by_label: userLabel,
          uploaded_by: userLabel,
          photo_url: null,
        })
        .select("*")
        .single();

      if (error || !data) throw new Error(error?.message || "Defect could not be saved.");

      if (form.files.length > 0) await uploadDefectPhotos(data.id, form.files);

      setForm(BLANK_FORM);
      setShowAdd(false);
      setMessage({
        tone: "success",
        text: `${data.defect_number || "Defect"} created successfully.`,
      });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Defect could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: DefectRow) {
    setEditDraft({
      id: row.id,
      issue_type_id: row.issue_type_id || "",
      member_number: row.member_number || "",
      segment: row.segment || "",
      drawing_number: row.drawing_number || "",
      description: row.description || "",
      responsibility: row.responsibility || "",
      client_reference: row.client_reference || "",
      severity: row.severity,
      status: row.status,
      resolution_notes: row.resolution_notes || "",
    });
  }

  async function saveEdit() {
    if (!editDraft?.description.trim()) return;
    setEditSaving(true);
    try {
      const { error } = await supabase
        .from("tower_defects")
        .update({
          issue_type_id: editDraft.issue_type_id || null,
          member_number: editDraft.member_number.trim() || null,
          segment: editDraft.segment.trim() || null,
          drawing_number: editDraft.drawing_number.trim() || null,
          description: editDraft.description.trim(),
          responsibility: editDraft.responsibility.trim() || null,
          client_reference: editDraft.client_reference.trim() || null,
          severity: editDraft.severity,
          status: editDraft.status,
          resolution_notes: editDraft.resolution_notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editDraft.id);
      if (error) throw error;
      setEditDraft(null);
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Defect could not be updated." });
    } finally {
      setEditSaving(false);
    }
  }

  async function signOff(row: DefectRow) {
    if (!window.confirm(`Close ${row.defect_number || "this Defect"}?`)) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const label = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Unknown User";
    const { error } = await supabase
      .from("tower_defects")
      .update({
        status: "Closed",
        completed_by: label,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    await load();
  }

  async function openActions(row: DefectRow) {
    const { data, error } = await supabase
      .from("defect_actions")
      .select("*")
      .eq("defect_id", row.id)
      .order("created_at", { ascending: false });
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    setActionsDefect(row);
    setActions((data ?? []) as DefectAction[]);
    setNewAction("");
  }

  async function addAction() {
    if (!actionsDefect || !newAction.trim()) return;
    setActionSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const label = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Unknown User";
    const { error } = await supabase.from("defect_actions").insert({
      defect_id: actionsDefect.id,
      action_note: newAction.trim(),
      created_by: label,
    });
    if (error) {
      setMessage({ tone: "error", text: error.message });
    } else {
      await openActions(actionsDefect);
    }
    setActionSaving(false);
  }

  async function fetchQualityFileUrl(fileId: string) {
    const response = await apiFetch(`/api/quality/files/${encodeURIComponent(fileId)}/content`);
    if (!response.ok) {
      let message = "Photo could not be loaded.";
      try {
        const payload = (await response.json()) as { error?: string };
        message = payload.error || message;
      } catch {}
      throw new Error(message);
    }
    return URL.createObjectURL(await response.blob());
  }

  function clearPhotoViews() {
    photoViews
      .filter((photo) => photo.source === "sharepoint")
      .forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotoViews([]);
    setPreview(null);
  }

  async function openPhotos(row: DefectRow) {
    setPhotosDefect(row);
    setPhotosLoading(true);
    clearPhotoViews();

    try {
      const currentFiles = filesByDefect.get(row.id) ?? [];
      const sharePointViews = await Promise.all(
        currentFiles.map(async (file) => ({
          id: file.id,
          name: file.file_name,
          url: await fetchQualityFileUrl(file.id),
          source: "sharepoint" as const,
          capturedAt: file.captured_at,
          uploadedBy: file.uploaded_by_label,
        })),
      );

      const { data: legacyRows } = await supabase
        .from("defect_photos")
        .select("id,defect_id,photo_path,created_at")
        .eq("defect_id", row.id)
        .order("created_at");

      const legacyViews: PhotoView[] = [];
      for (const legacy of (legacyRows ?? []) as LegacyPhoto[]) {
        const { data } = await supabase.storage
          .from("defect-photos")
          .createSignedUrl(legacy.photo_path, 60 * 60);
        if (data?.signedUrl) {
          legacyViews.push({
            id: `legacy-${legacy.id}`,
            name: legacy.photo_path.split("/").pop() || "Legacy photo",
            url: data.signedUrl,
            source: "legacy",
            capturedAt: legacy.created_at,
            uploadedBy: row.uploaded_by,
          });
        }
      }

      // Support the oldest single photo_url records as a final fallback.
      if (
        legacyViews.length === 0 &&
        sharePointViews.length === 0 &&
        row.photo_url &&
        row.photo_url !== "pending"
      ) {
        if (/^https?:\/\//i.test(row.photo_url)) {
          legacyViews.push({
            id: "legacy-photo-url",
            name: "Legacy photo",
            url: row.photo_url,
            source: "legacy",
            capturedAt: row.created_at,
            uploadedBy: row.uploaded_by,
          });
        } else {
          const { data } = await supabase.storage
            .from("defect-photos")
            .createSignedUrl(row.photo_url, 60 * 60);
          if (data?.signedUrl) {
            legacyViews.push({
              id: "legacy-photo-url",
              name: "Legacy photo",
              url: data.signedUrl,
              source: "legacy",
              capturedAt: row.created_at,
              uploadedBy: row.uploaded_by,
            });
          }
        }
      }

      setPhotoViews([...sharePointViews, ...legacyViews]);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Photos could not be loaded." });
    } finally {
      setPhotosLoading(false);
    }
  }

  async function addPhotosToOpenDefect(files: File[]) {
    if (!photosDefect || files.length === 0) return;
    setPhotoUploading(true);
    try {
      await uploadDefectPhotos(photosDefect.id, files);
      await load();
      await openPhotos(photosDefect);
      setMessage({ tone: "success", text: "Defect photos saved to SharePoint." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Photos could not be uploaded." });
    } finally {
      setPhotoUploading(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading Defects…</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="min-h-screen space-y-4 bg-slate-50 p-3 md:p-6">
      <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950">Defects</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  Site issue register for traceability, assessment, actions, evidence and close-out. New formal evidence is stored in the project SharePoint quality folders.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIssueManagerOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Settings2 size={16} /> Common Issues
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw size={16} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowAdd((value) => !value)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                <Plus size={16} /> Add Defect
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Total" value={stats.total} />
            <Stat label="Open" value={stats.open} tone="rose" />
            <Stat label="In Progress" value={stats.inProgress} tone="violet" />
            <Stat label="Fixed" value={stats.fixed} tone="blue" />
            <Stat label="Closed" value={stats.closed} tone="green" />
          </div>
        </div>

        {message ? (
          <div className={`mx-5 mt-5 rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {message.text}
          </div>
        ) : null}

        {showAdd ? (
          <div className="m-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-black text-slate-900">Manual Defect Entry</div>
                <div className="text-xs text-slate-500">Website entry for supervisors/admin. Mobile capture will use the same register later.</div>
              </div>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg p-2 hover:bg-white"><X size={17} /></button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Common issue">
                <select value={form.issue_type_id} onChange={(event) => setForm((current) => ({ ...current, issue_type_id: event.target.value }))} className="input">
                  <option value="">Other / not selected</option>
                  {defectIssueTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <TowerMemberFields
                members={towerMembers}
                segment={form.segment}
                memberNumber={form.member_number}
                onSegmentChange={(segment) =>
                  setForm((current) => ({
                    ...current,
                    segment,
                    member_number:
                      current.member_number &&
                      !towerMembers.some(
                        (member) =>
                          member.mark_no === current.member_number &&
                          (member.tower_segment ?? "") === segment,
                      )
                        ? ""
                        : current.member_number,
                    drawing_number:
                      current.member_number &&
                      !towerMembers.some(
                        (member) =>
                          member.mark_no === current.member_number &&
                          (member.tower_segment ?? "") === segment,
                      )
                        ? ""
                        : current.drawing_number,
                  }))
                }
                onMemberNumberChange={(member_number) =>
                  setForm((current) => ({
                    ...current,
                    member_number,
                    drawing_number: "",
                  }))
                }
                onSelectMember={(member) =>
                  setForm((current) => ({
                    ...current,
                    member_number: member.mark_no,
                    segment: member.tower_segment || current.segment,
                    drawing_number: member.drawing_number || "",
                  }))
                }
              />
              <Field label="Drawing"><input value={form.drawing_number} onChange={(event) => setForm((current) => ({ ...current, drawing_number: event.target.value }))} placeholder="Optional" className="input" /></Field>
              <Field label="Severity"><select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as DefectRow["severity"] }))} className="input"><option>Minor</option><option>Major</option><option>Critical</option></select></Field>
              <Field label="Responsibility"><input value={form.responsibility} onChange={(event) => setForm((current) => ({ ...current, responsibility: event.target.value }))} placeholder="BC / UGL / Supplier / Client" className="input" /></Field>
              <Field label="Client / RFI reference"><input value={form.client_reference} onChange={(event) => setForm((current) => ({ ...current, client_reference: event.target.value }))} placeholder="Optional" className="input" /></Field>
              <Field label="Photos"><input type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" onChange={(event) => setForm((current) => ({ ...current, files: Array.from(event.target.files ?? []) }))} className="input" /></Field>
            </div>
            <div className="mt-3"><Field label="Defect description"><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Describe what was identified and where." className="input" /></Field></div>
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => void saveDefect()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Save Defect</button></div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-lg">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, member, segment, issue, drawing, reference…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <div className="flex items-center gap-2"><Filter size={15} className="text-slate-400" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option>All</option><option>Open</option><option>In Progress</option><option>Fixed</option><option>Closed</option></select></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-295 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Defect</th><th className="px-4 py-3 text-left">Issue</th><th className="px-4 py-3 text-left">Location / Steel</th><th className="px-4 py-3 text-left">Severity</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Identified</th><th className="px-4 py-3 text-left">Evidence</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                  <td className="px-4 py-4"><div className="font-black text-slate-950">{row.defect_number || "Legacy Defect"}</div><div className="mt-1 text-xs text-slate-500">{row.client_reference || "No client reference"}</div></td>
                  <td className="px-4 py-4"><div className="font-bold text-slate-800">{issueTypeName(row.issue_type_id)}</div><div className="mt-1 max-w-md whitespace-pre-wrap text-xs leading-5 text-slate-600">{row.description || "-"}</div>{row.responsibility ? <div className="mt-1 text-xs text-slate-400">Responsibility: {row.responsibility}</div> : null}</td>
                  <td className="px-4 py-4 text-xs text-slate-600"><div><b>Segment:</b> {row.segment || "-"}</div><div><b>Member:</b> {row.member_number || "-"}</div><div><b>Drawing:</b> {row.drawing_number || "-"}</div></td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${severityClasses(row.severity)}`}>{row.severity}</span></td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(row.status)}`}>{row.status}</span>{row.status === "Closed" ? <div className="mt-2 text-[11px] text-slate-500">{row.completed_by || "-"}<br />{prettyDateTime(row.completed_at)}</div> : null}</td>
                  <td className="px-4 py-4 text-xs text-slate-600">{prettyDateTime(row.identified_at || row.created_at)}<div className="mt-1 text-slate-400">{row.identified_by_label || row.uploaded_by || "-"}</div></td>
                  <td className="px-4 py-4"><button type="button" onClick={() => void openPhotos(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Camera size={14} /> Photos {filesByDefect.get(row.id)?.length ? `(${filesByDefect.get(row.id)?.length})` : ""}</button></td>
                  <td className="px-4 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => void openActions(row)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white" title="Actions / history"><MessageSquareText size={15} /></button><button type="button" onClick={() => startEdit(row)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white" title="Edit"><Pencil size={15} /></button>{row.status !== "Closed" ? <button type="button" onClick={() => void signOff(row)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white"><CheckCircle2 size={14} /> Close</button> : null}</div></td>
                </tr>
              ))}
              {filteredRows.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">No Defects match this view.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <IssueTypeManager open={issueManagerOpen} onClose={() => setIssueManagerOpen(false)} projectId={projectId} defaultScope="defect" onChanged={load} />

      {editDraft ? (
        <Modal title="Edit Defect" subtitle={rows.find((row) => row.id === editDraft.id)?.defect_number || "Defect"} onClose={() => setEditDraft(null)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Common issue"><select value={editDraft.issue_type_id} onChange={(event) => setEditDraft((current) => current ? { ...current, issue_type_id: event.target.value } : current)} className="input"><option value="">Other / not selected</option>{defectIssueTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Status"><select value={editDraft.status} onChange={(event) => setEditDraft((current) => current ? { ...current, status: event.target.value as DefectRow["status"] } : current)} className="input"><option>Open</option><option>In Progress</option><option>Fixed</option><option>Closed</option></select></Field>
            <TowerMemberFields
              members={towerMembers}
              segment={editDraft.segment}
              memberNumber={editDraft.member_number}
              segmentLabel="Tower segment"
              memberLabel="Member number"
              onSegmentChange={(segment) =>
                setEditDraft((current) => {
                  if (!current) return current;
                  const currentMemberStillMatches =
                    !current.member_number ||
                    towerMembers.some(
                      (member) =>
                        member.mark_no === current.member_number &&
                        (member.tower_segment ?? "") === segment,
                    );
                  return {
                    ...current,
                    segment,
                    member_number: currentMemberStillMatches
                      ? current.member_number
                      : "",
                    drawing_number: currentMemberStillMatches
                      ? current.drawing_number
                      : "",
                  };
                })
              }
              onMemberNumberChange={(member_number) =>
                setEditDraft((current) =>
                  current
                    ? { ...current, member_number, drawing_number: "" }
                    : current,
                )
              }
              onSelectMember={(member) =>
                setEditDraft((current) =>
                  current
                    ? {
                        ...current,
                        member_number: member.mark_no,
                        segment: member.tower_segment || current.segment,
                        drawing_number: member.drawing_number || "",
                      }
                    : current,
                )
              }
            />
            <Field label="Drawing"><input value={editDraft.drawing_number} onChange={(event) => setEditDraft((current) => current ? { ...current, drawing_number: event.target.value } : current)} className="input" /></Field>
            <Field label="Severity"><select value={editDraft.severity} onChange={(event) => setEditDraft((current) => current ? { ...current, severity: event.target.value as DefectRow["severity"] } : current)} className="input"><option>Minor</option><option>Major</option><option>Critical</option></select></Field>
            <Field label="Responsibility"><input value={editDraft.responsibility} onChange={(event) => setEditDraft((current) => current ? { ...current, responsibility: event.target.value } : current)} className="input" /></Field>
            <Field label="Client / RFI reference"><input value={editDraft.client_reference} onChange={(event) => setEditDraft((current) => current ? { ...current, client_reference: event.target.value } : current)} className="input" /></Field>
          </div>
          <div className="mt-3"><Field label="Description"><textarea rows={4} value={editDraft.description} onChange={(event) => setEditDraft((current) => current ? { ...current, description: event.target.value } : current)} className="input" /></Field></div>
          <div className="mt-3"><Field label="Resolution / close-out notes"><textarea rows={3} value={editDraft.resolution_notes} onChange={(event) => setEditDraft((current) => current ? { ...current, resolution_notes: event.target.value } : current)} className="input" /></Field></div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={() => void saveEdit()} disabled={editSaving} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{editSaving ? "Saving…" : "Save Changes"}</button></div>
        </Modal>
      ) : null}

      {actionsDefect ? (
        <Modal title="Defect Actions / Traceability" subtitle={actionsDefect.defect_number || "Defect"} onClose={() => setActionsDefect(null)}>
          <div className="flex gap-2"><textarea value={newAction} onChange={(event) => setNewAction(event.target.value)} rows={2} placeholder="Add instruction, response, rectification note or other traceability comment…" className="input flex-1" /><button type="button" onClick={() => void addAction()} disabled={actionSaving || !newAction.trim()} className="self-end rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Add</button></div>
          <div className="mt-5 space-y-3">{actions.map((action) => <div key={action.id} className="rounded-xl border border-slate-200 p-4"><div className="whitespace-pre-wrap text-sm text-slate-700">{action.action_note}</div><div className="mt-2 text-xs text-slate-400">{action.created_by || "-"} · {prettyDateTime(action.created_at)}</div></div>)}{actions.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">No actions recorded yet.</div> : null}</div>
        </Modal>
      ) : null}

      {photosDefect ? (
        <Modal title="Defect Evidence" subtitle={photosDefect.defect_number || "Defect"} onClose={() => { clearPhotoViews(); setPhotosDefect(null); }} wide>
          <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold text-slate-900">Add SharePoint evidence</div><div className="text-xs text-slate-500">New photos are stored under 03 Quality → Defects → this tower → this Defect ID.</div></div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"><Camera size={16} />{photoUploading ? "Uploading…" : "Add Photos"}<input type="file" multiple disabled={photoUploading} accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ""; void addPhotosToOpenDefect(files); }} /></label></div>
          </div>
          {photosLoading ? <div className="py-12 text-center text-sm text-slate-500">Loading evidence…</div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{photoViews.map((photo) => <button key={photo.id} type="button" onClick={() => setPreview(photo)} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"><img src={photo.url} alt={photo.name} className="aspect-square w-full object-cover" /><div className="p-2"><div className="truncate text-xs font-bold text-slate-700">{photo.name}</div><div className="mt-1 text-[10px] text-slate-400">{photo.source === "sharepoint" ? "SharePoint" : "Legacy Supabase"} · {prettyDateTime(photo.capturedAt)}</div></div></button>)}{photoViews.length === 0 ? <div className="col-span-full py-12 text-center text-sm text-slate-500">No photos attached.</div> : null}</div>}
        </Modal>
      ) : null}

      {preview ? <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4" onClick={() => setPreview(null)}><div className="max-h-[95vh] max-w-[95vw]" onClick={(event) => event.stopPropagation()}><img src={preview.url} alt={preview.name} className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain" /><div className="mt-2 text-center text-sm text-white">{preview.name}</div></div></div> : null}

      <style jsx global>{`
        .input { width: 100%; border: 1px solid rgb(226 232 240); border-radius: 0.75rem; background: white; padding: 0.625rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px rgb(226 232 240); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "rose" | "violet" | "blue" | "green" }) {
  const classes = tone === "rose" ? "bg-rose-50 text-rose-700" : tone === "violet" ? "bg-violet-50 text-violet-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";
  return <div className={`rounded-2xl px-3 py-3 ${classes}`}><div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/70 p-4"><div className={`max-h-[92vh] w-full overflow-hidden rounded-3xl bg-white shadow-2xl ${wide ? "max-w-6xl" : "max-w-3xl"}`}><div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><div className="text-lg font-black text-slate-950">{title}</div>{subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}</div><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><X size={17} /></button></div><div className="max-h-[calc(92vh-74px)] overflow-y-auto p-5">{children}</div></div></div>;
}
