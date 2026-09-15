/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
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
  [key: string]: unknown;
};

type IssueType = {
  id: string;
  applies_to: "defect" | "revision" | "both";
  name: string;
  active: boolean;
  sort_order: number;
};

type RevisionRow = {
  id: string;
  project_id: string;
  tower_id: string;
  sequence_no: number | null;
  fli_number: string;
  inspection_stage: "Post Assembly" | "Post Erection" | "Other";
  inspection_date: string;
  client_inspector: string | null;
  client_company: string | null;
  client_reference: string | null;
  notes: string | null;
  status: "Draft" | "In Progress" | "Ready for Review" | "Closed";
  created_by_label: string | null;
  completed_by_label: string | null;
  completed_at: string | null;
  pdf_revision: number;
  latest_pdf_file_id: string | null;
  created_at: string;
  updated_at: string;
};

type RevisionItem = {
  id: string;
  revision_id: string;
  project_id: string;
  tower_id: string;
  item_number: number;
  issue_type_id: string | null;
  other_issue_text: string | null;
  tower_segment: string | null;
  member_number: string | null;
  drawing_number: string | null;
  finding: string;
  rectification_comment: string | null;
  status: "Open" | "Rectified" | "Verified";
  before_taken_at: string | null;
  before_taken_by_label: string | null;
  after_taken_at: string | null;
  after_taken_by_label: string | null;
  sort_order: number;
  created_at: string;
};

type QualityFile = {
  id: string;
  revision_id: string | null;
  revision_item_id: string | null;
  file_role: "before_photo" | "after_photo" | "supporting" | "revision_pdf";
  file_name: string;
  mime_type: string | null;
  captured_at: string | null;
  uploaded_by_label: string | null;
  created_at: string;
};

type RevisionDraft = {
  inspection_stage: RevisionRow["inspection_stage"];
  inspection_date: string;
  client_inspector: string;
  client_company: string;
  client_reference: string;
  notes: string;
};

type FindingDraft = {
  revision_id: string;
  issue_type_id: string;
  other_issue_text: string;
  tower_segment: string;
  member_number: string;
  drawing_number: string;
  finding: string;
  rectification_comment: string;
  beforeFiles: File[];
  afterFiles: File[];
};

type FindingEdit = {
  id: string;
  revision_id: string;
  issue_type_id: string;
  other_issue_text: string;
  tower_segment: string;
  member_number: string;
  drawing_number: string;
  finding: string;
  rectification_comment: string;
  status: RevisionItem["status"];
};

type EvidenceView = {
  id: string;
  name: string;
  role: "before_photo" | "after_photo";
  url: string;
  capturedAt: string | null;
  uploadedBy: string | null;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

const BLANK_REVISION: RevisionDraft = {
  inspection_stage: "Post Erection",
  inspection_date: today(),
  client_inspector: "",
  client_company: "",
  client_reference: "",
  notes: "",
};

const BLANK_FINDING: FindingDraft = {
  revision_id: "",
  issue_type_id: "",
  other_issue_text: "",
  tower_segment: "",
  member_number: "",
  drawing_number: "",
  finding: "",
  rectification_comment: "",
  beforeFiles: [],
  afterFiles: [],
};

function prettyDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-AU");
}

function prettyDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-AU");
}

function revisionStatusClasses(status: RevisionRow["status"]) {
  if (status === "Closed") return "bg-emerald-100 text-emerald-700";
  if (status === "Ready for Review") return "bg-blue-100 text-blue-700";
  if (status === "In Progress") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function itemStatusClasses(status: RevisionItem["status"]) {
  if (status === "Verified") return "bg-emerald-100 text-emerald-700";
  if (status === "Rectified") return "bg-blue-100 text-blue-700";
  return "bg-rose-100 text-rose-700";
}

export default function TowerRevisionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<TowerRow | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [files, setFiles] = useState<QualityFile[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [towerMembers, setTowerMembers] = useState<TowerMaterialMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionDraft, setRevisionDraft] = useState<RevisionDraft>(BLANK_REVISION);
  const [revisionSaving, setRevisionSaving] = useState(false);
  const [issueManagerOpen, setIssueManagerOpen] = useState(false);

  const [findingDraft, setFindingDraft] = useState<FindingDraft | null>(null);
  const [findingSaving, setFindingSaving] = useState(false);
  const [findingEdit, setFindingEdit] = useState<FindingEdit | null>(null);
  const [findingEditSaving, setFindingEditSaving] = useState(false);

  const [evidenceItem, setEvidenceItem] = useState<RevisionItem | null>(null);
  const [evidenceViews, setEvidenceViews] = useState<EvidenceView[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceUploading, setEvidenceUploading] = useState<string | null>(null);
  const [preview, setPreview] = useState<EvidenceView | null>(null);

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
    setLoading(true);
    const [towerRes, docketRes, revisionRes, itemRes, fileRes, issueRes, memberRes] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_revisions")
        .select("*")
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tower_revision_items")
        .select("*")
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .order("sort_order")
        .order("item_number"),
      supabase
        .from("tower_quality_files")
        .select("id,revision_id,revision_item_id,file_role,file_name,mime_type,captured_at,uploaded_by_label,created_at")
        .eq("project_id", projectId)
        .eq("tower_id", towerId)
        .order("created_at"),
      supabase
        .from("project_field_issue_types")
        .select("id,applies_to,name,active,sort_order")
        .eq("project_id", projectId)
        .order("sort_order")
        .order("name"),
      supabase
        .from("tower_material_members")
        .select("id,tower_id,bundle_reference,drawing_number,mark_no,qty_per_tower,section,tower_segment")
        .eq("tower_id", towerId)
        .order("tower_segment")
        .order("mark_no"),
    ]);

    if (towerRes.error) console.error(towerRes.error);
    if (revisionRes.error) console.error(revisionRes.error);
    if (itemRes.error) console.error(itemRes.error);
    if (fileRes.error) console.error(fileRes.error);
    if (issueRes.error) console.error(issueRes.error);
    if (memberRes.error) console.error("Tower member load error", memberRes.error);

    setTower((towerRes.data as TowerRow | null) ?? null);
    setLatestDate(docketRes.data?.[0]?.docket_date ?? null);
    setRevisions((revisionRes.data ?? []) as RevisionRow[]);
    setItems((itemRes.data ?? []) as RevisionItem[]);
    setFiles((fileRes.data ?? []) as QualityFile[]);
    setIssueTypes((issueRes.data ?? []) as IssueType[]);
    setTowerMembers((memberRes.data ?? []) as TowerMaterialMember[]);
    setLoading(false);
  }, [projectId, supabase, towerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const revisionIssueTypes = useMemo(() => {
    const seen = new Set<string>();
    return issueTypes.filter((item) => {
      if (!item.active || !["revision", "both"].includes(item.applies_to)) return false;
      const key = item.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [issueTypes]);

  const issueName = useCallback(
    (id: string | null, otherIssueText?: string | null) =>
      (id ? issueTypes.find((item) => item.id === id)?.name : null) ||
      otherIssueText?.trim() ||
      "Other",
    [issueTypes],
  );

  const itemsByRevision = useMemo(() => {
    const map = new Map<string, RevisionItem[]>();
    items.forEach((item) => {
      const list = map.get(item.revision_id) ?? [];
      list.push(item);
      map.set(item.revision_id, list);
    });
    return map;
  }, [items]);

  const filesByItem = useMemo(() => {
    const map = new Map<string, QualityFile[]>();
    files.forEach((file) => {
      if (!file.revision_item_id) return;
      const list = map.get(file.revision_item_id) ?? [];
      list.push(file);
      map.set(file.revision_item_id, list);
    });
    return map;
  }, [files]);

  const pdfsByRevision = useMemo(() => {
    const map = new Map<string, QualityFile[]>();
    files
      .filter((file) => file.file_role === "revision_pdf" && file.revision_id)
      .forEach((file) => {
        const list = map.get(file.revision_id!) ?? [];
        list.push(file);
        map.set(file.revision_id!, list);
      });
    return map;
  }, [files]);

  const stats = useMemo(() => {
    const openFindings = items.filter((item) => item.status === "Open").length;
    const rectified = items.filter((item) => item.status === "Rectified").length;
    const closed = revisions.filter((revision) => revision.status === "Closed").length;
    return { revisions: revisions.length, openFindings, rectified, closed };
  }, [items, revisions]);

  function isHeic(file: File) {
    const name = file.name.toLowerCase();
    return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
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

  async function uploadFindingPhotos({
    revisionId,
    itemId,
    role,
    selectedFiles,
  }: {
    revisionId: string;
    itemId: string;
    role: "before_photo" | "after_photo";
    selectedFiles: File[];
  }) {
    for (const original of selectedFiles) {
      const file = await normalisePhoto(original);
      const body = new FormData();
      body.set("projectId", projectId);
      body.set("towerId", towerId);
      body.set("revisionId", revisionId);
      body.set("revisionItemId", itemId);
      body.set("fileRole", role);
      body.set("capturedAt", new Date().toISOString());
      body.set("file", file);
      const response = await apiFetch("/api/quality/files/upload", { method: "POST", body });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Could not upload ${original.name}.`);
    }
  }

  async function createRevision() {
    setRevisionSaving(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const label = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Unknown User";
      const { data, error } = await supabase
        .from("tower_revisions")
        .insert({
          project_id: projectId,
          tower_id: towerId,
          inspection_stage: revisionDraft.inspection_stage,
          inspection_date: revisionDraft.inspection_date || today(),
          client_inspector: revisionDraft.client_inspector.trim() || null,
          client_company: revisionDraft.client_company.trim() || null,
          client_reference: revisionDraft.client_reference.trim() || null,
          notes: revisionDraft.notes.trim() || null,
          status: "Draft",
          created_by: user?.id ?? null,
          created_by_label: label,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message || "Revision could not be created.");
      setRevisionDraft(BLANK_REVISION);
      setRevisionModalOpen(false);
      setExpanded((current) => new Set(current).add(data.id));
      setMessage({ tone: "success", text: `${data.fli_number || "Revision"} created.` });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Revision could not be created." });
    } finally {
      setRevisionSaving(false);
    }
  }

  function openFinding(revisionId: string) {
    setFindingDraft({ ...BLANK_FINDING, revision_id: revisionId });
  }

  async function saveFinding() {
    if (!findingDraft) return;

    if (!findingDraft.issue_type_id) {
      setMessage({ tone: "error", text: "Select a common issue or choose Other." });
      return;
    }

    const isOtherIssue = findingDraft.issue_type_id === "__other__";
    if (isOtherIssue && !findingDraft.other_issue_text.trim()) {
      setMessage({ tone: "error", text: "Enter the issue details for Other." });
      return;
    }

    setFindingSaving(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const hasAfter = findingDraft.afterFiles.length > 0;
      const status: RevisionItem["status"] = hasAfter ? "Rectified" : "Open";

      const { data, error } = await supabase
        .from("tower_revision_items")
        .insert({
          revision_id: findingDraft.revision_id,
          project_id: projectId,
          tower_id: towerId,
          issue_type_id: isOtherIssue ? null : findingDraft.issue_type_id,
          other_issue_text: isOtherIssue
            ? findingDraft.other_issue_text.trim()
            : null,
          tower_segment: findingDraft.tower_segment.trim() || null,
          member_number: findingDraft.member_number.trim() || null,
          drawing_number: findingDraft.drawing_number.trim() || null,
          finding: findingDraft.finding.trim() || null,
          rectification_comment:
            findingDraft.rectification_comment.trim() || null,
          status,
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message || "Finding could not be saved.");

      if (findingDraft.beforeFiles.length) {
        await uploadFindingPhotos({
          revisionId: findingDraft.revision_id,
          itemId: data.id,
          role: "before_photo",
          selectedFiles: findingDraft.beforeFiles,
        });
      }
      if (findingDraft.afterFiles.length) {
        await uploadFindingPhotos({
          revisionId: findingDraft.revision_id,
          itemId: data.id,
          role: "after_photo",
          selectedFiles: findingDraft.afterFiles,
        });
      }

      await supabase
        .from("tower_revisions")
        .update({ status: "In Progress" })
        .eq("id", findingDraft.revision_id)
        .eq("status", "Draft");

      setFindingDraft(null);
      setMessage({ tone: "success", text: `Finding ${String(data.item_number).padStart(3, "0")} added.` });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Finding could not be saved." });
    } finally {
      setFindingSaving(false);
    }
  }

  function editFinding(item: RevisionItem) {
    setFindingEdit({
      id: item.id,
      revision_id: item.revision_id,
      issue_type_id: item.issue_type_id || "__other__",
      other_issue_text: item.other_issue_text || "",
      tower_segment: item.tower_segment || "",
      member_number: item.member_number || "",
      drawing_number: item.drawing_number || "",
      finding: item.finding,
      rectification_comment: item.rectification_comment || "",
      status: item.status,
    });
  }

  async function saveFindingEdit() {
    if (!findingEdit) return;

    if (!findingEdit.issue_type_id) {
      setMessage({ tone: "error", text: "Select a common issue or choose Other." });
      return;
    }

    const isOtherIssue = findingEdit.issue_type_id === "__other__";
    if (isOtherIssue && !findingEdit.other_issue_text.trim()) {
      setMessage({ tone: "error", text: "Enter the issue details for Other." });
      return;
    }

    setFindingEditSaving(true);
    try {
      const itemFiles = filesByItem.get(findingEdit.id) ?? [];
      const hasAfter = itemFiles.some((file) => file.file_role === "after_photo");
      const status =
        findingEdit.status === "Verified"
          ? "Verified"
          : hasAfter
            ? "Rectified"
            : "Open";

      const { error } = await supabase
        .from("tower_revision_items")
        .update({
          issue_type_id: isOtherIssue ? null : findingEdit.issue_type_id,
          other_issue_text: isOtherIssue
            ? findingEdit.other_issue_text.trim()
            : null,
          tower_segment: findingEdit.tower_segment.trim() || null,
          member_number: findingEdit.member_number.trim() || null,
          drawing_number: findingEdit.drawing_number.trim() || null,
          finding: findingEdit.finding.trim() || null,
          rectification_comment:
            findingEdit.rectification_comment.trim() || null,
          status,
        })
        .eq("id", findingEdit.id);
      if (error) throw error;
      setFindingEdit(null);
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Finding could not be updated." });
    } finally {
      setFindingEditSaving(false);
    }
  }

  async function updateRevisionStatus(revision: RevisionRow, status: RevisionRow["status"]) {
    setBusyId(revision.id);
    const update: Record<string, unknown> = { status };
    if (status !== "Closed") {
      update.completed_by = null;
      update.completed_by_label = null;
      update.completed_at = null;
    }
    const { error } = await supabase.from("tower_revisions").update(update).eq("id", revision.id);
    if (error) setMessage({ tone: "error", text: error.message });
    await load();
    setBusyId(null);
  }

  async function deleteRevision(revision: RevisionRow) {
    const confirmation = window.prompt(
      `Delete ${revision.fli_number}?\n\nThis permanently removes the Revision, all findings, SharePoint evidence and generated PDFs.\n\nType the full Revision number to confirm:`,
    );

    if (confirmation === null) return;

    if (confirmation.trim() !== revision.fli_number) {
      setMessage({
        tone: "error",
        text: "Revision was not deleted because the confirmation did not match.",
      });
      return;
    }

    setBusyId(`delete-${revision.id}`);
    setMessage(null);

    try {
      const response = await apiFetch(
        `/api/quality/revisions/${encodeURIComponent(revision.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirm: revision.fli_number,
            projectId,
            towerId,
          }),
        },
      );

      const payload = (await response.json()) as {
        success?: boolean;
        warning?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Revision could not be deleted.");
      }

      setExpanded((current) => {
        const next = new Set(current);
        next.delete(revision.id);
        return next;
      });

      setMessage({
        tone: "success",
        text: payload.warning
          ? `${revision.fli_number} deleted. ${payload.warning}`
          : `${revision.fli_number} deleted successfully.`,
      });

      await load();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Revision could not be deleted.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function openFile(fileId: string, popup?: Window | null) {
    const response = await apiFetch(`/api/quality/files/${encodeURIComponent(fileId)}/content`);
    if (!response.ok) {
      let text = "Quality file could not be opened.";
      try {
        const payload = (await response.json()) as { error?: string };
        text = payload.error || text;
      } catch {}
      throw new Error(text);
    }
    const url = URL.createObjectURL(await response.blob());
    if (popup) popup.location.href = url;
    else window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function viewPdf(file: QualityFile) {
    const popup = window.open("", "_blank");
    try {
      await openFile(file.id, popup);
    } catch (error) {
      popup?.close();
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "PDF could not be opened." });
    }
  }

  async function createPdf(revision: RevisionRow) {
    const popup = window.open("", "_blank");
    setBusyId(`pdf-${revision.id}`);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/quality/revisions/${encodeURIComponent(revision.id)}/pdf`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        report_revision?: number;
        file?: QualityFile;
      };
      if (!response.ok || !payload.file) throw new Error(payload.error || "Revision PDF could not be created.");
      await load();
      setMessage({
        tone: "success",
        text: `${revision.fli_number}-R${String(payload.report_revision ?? 1).padStart(2, "0")} created and saved to SharePoint.`,
      });
      await openFile(payload.file.id, popup);
    } catch (error) {
      popup?.close();
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Revision PDF could not be created." });
    } finally {
      setBusyId(null);
    }
  }

  function clearEvidence() {
    evidenceViews.forEach((view) => URL.revokeObjectURL(view.url));
    setEvidenceViews([]);
    setPreview(null);
  }

  async function openEvidence(item: RevisionItem) {
    clearEvidence();
    setEvidenceItem(item);
    setEvidenceLoading(true);
    try {
      // Read the current evidence rows directly so the modal always reflects
      // the latest SharePoint uploads, including files added moments ago.
      const { data, error } = await supabase
        .from("tower_quality_files")
        .select(
          "id,revision_id,revision_item_id,file_role,file_name,mime_type,captured_at,uploaded_by_label,created_at",
        )
        .eq("revision_item_id", item.id)
        .in("file_role", ["before_photo", "after_photo"])
        .order("created_at", { ascending: true });

      if (error) throw error;

      const itemFiles = ((data ?? []) as QualityFile[]).filter(
        (file): file is QualityFile & { file_role: "before_photo" | "after_photo" } =>
          file.file_role === "before_photo" || file.file_role === "after_photo",
      );

      const views = await Promise.all(
        itemFiles.map(async (file) => {
          const response = await apiFetch(`/api/quality/files/${encodeURIComponent(file.id)}/content`);
          if (!response.ok) throw new Error(`Could not load ${file.file_name}.`);
          return {
            id: file.id,
            name: file.file_name,
            role: file.file_role,
            url: URL.createObjectURL(await response.blob()),
            capturedAt: file.captured_at,
            uploadedBy: file.uploaded_by_label,
          } as EvidenceView;
        }),
      );
      setEvidenceViews(views);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Evidence could not be loaded." });
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function addEvidence(item: RevisionItem, role: "before_photo" | "after_photo", selectedFiles: File[]) {
    if (!selectedFiles.length) return;
    setEvidenceUploading(`${item.id}-${role}`);
    try {
      await uploadFindingPhotos({
        revisionId: item.revision_id,
        itemId: item.id,
        role,
        selectedFiles,
      });
      await load();
      await openEvidence(item);
      setMessage({ tone: "success", text: `${role === "before_photo" ? "Before" : "After"} evidence saved to SharePoint.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Evidence could not be uploaded." });
    } finally {
      setEvidenceUploading(null);
    }
  }

  function completeness(item: RevisionItem) {
    const itemFiles = filesByItem.get(item.id) ?? [];
    const before = itemFiles.some((file) => file.file_role === "before_photo");
    const after = itemFiles.some((file) => file.file_role === "after_photo");
    const issueSelected = Boolean(
      item.issue_type_id || item.other_issue_text?.trim(),
    );
    return {
      before,
      after,
      issueSelected,
      complete: before && after && issueSelected,
    };
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading Revisions…</div>;
  if (!tower) return <div className="p-8">Tower not found.</div>;

  return (
    <div className="min-h-screen space-y-4 bg-slate-50 p-3 md:p-6">
      <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><ClipboardCheck size={21} /></div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950">Revisions</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  Post-assembly and post-erection client inspection findings. Review what was flagged, monitor rectification, compare before/after evidence and generate the controlled FLI PDF.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setIssueManagerOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><Settings2 size={16} /> Common Issues</button>
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><RefreshCw size={16} /> Refresh</button>
              <button type="button" onClick={() => setRevisionModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"><Plus size={16} /> New Revision</button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="FLI Records" value={stats.revisions} />
            <Stat label="Open Findings" value={stats.openFindings} tone="rose" />
            <Stat label="Rectified" value={stats.rectified} tone="blue" />
            <Stat label="Closed Reports" value={stats.closed} tone="green" />
          </div>
        </div>

        {message ? <div className={`mx-5 mt-5 rounded-xl border px-4 py-3 text-sm ${message.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div> : null}

        <div className="space-y-4 p-5">
          {revisions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <FileCheck2 className="mx-auto text-slate-300" size={30} />
              <div className="mt-3 font-bold text-slate-700">No Revisions / FLI records yet</div>
              <p className="mt-1 text-sm text-slate-500">Create the first record after a client inspection.</p>
            </div>
          ) : null}

          {revisions.map((revision) => {
            const revisionItems = itemsByRevision.get(revision.id) ?? [];
            const completeCount = revisionItems.filter((item) => completeness(item).complete).length;
            const openCount = revisionItems.filter((item) => item.status === "Open").length;
            const pdfs = pdfsByRevision.get(revision.id) ?? [];
            const latestPdf = revision.latest_pdf_file_id
              ? files.find((file) => file.id === revision.latest_pdf_file_id) || pdfs[pdfs.length - 1]
              : pdfs[pdfs.length - 1];
            const isExpanded = expanded.has(revision.id);

            return (
              <article key={revision.id} className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="p-4 md:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <button type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(revision.id)) next.delete(revision.id); else next.add(revision.id); return next; })} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-blue-700">{revision.fli_number}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${revisionStatusClasses(revision.status)}`}>{revision.status}</span>
                        {revision.pdf_revision > 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">PDF R{String(revision.pdf_revision).padStart(2, "0")}</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                        <span><b>Stage:</b> {revision.inspection_stage}</span>
                        <span><b>Inspection:</b> {prettyDate(revision.inspection_date)}</span>
                        <span><b>Client:</b> {revision.client_company || "-"}</span>
                        <span><b>Reference:</b> {revision.client_reference || "-"}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-600">{revisionItems.length} findings</span><span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-700">{completeCount} complete</span>{openCount > 0 ? <span className="rounded-lg bg-rose-50 px-2.5 py-1.5 font-bold text-rose-700">{openCount} open</span> : null}</div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => openFinding(revision.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Plus size={14} /> Finding</button>
                      {latestPdf ? <button type="button" onClick={() => void viewPdf(latestPdf)} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700"><FileText size={14} /> View PDF</button> : null}
                      <button type="button" onClick={() => void createPdf(revision)} disabled={busyId === `pdf-${revision.id}` || revisionItems.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busyId === `pdf-${revision.id}` ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />} Create PDF</button>
                      <button
                        type="button"
                        onClick={() => void deleteRevision(revision)}
                        disabled={busyId === `delete-${revision.id}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        title={`Delete ${revision.fli_number}`}
                      >
                        {busyId === `delete-${revision.id}` ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        Delete
                      </button>
                      <button type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(revision.id)) next.delete(revision.id); else next.add(revision.id); return next; })} className="rounded-xl border border-slate-200 p-2 text-slate-500">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                    </div>
                  </div>

                  {revision.notes ? <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{revision.notes}</div> : null}
                </div>

                {isExpanded ? (
                  <div className="border-t border-slate-200 bg-slate-50/60 p-4 md:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-black text-slate-800">Inspection Findings</div>
                      <div className="flex flex-wrap gap-2">
                        {revision.status !== "Ready for Review" && revision.status !== "Closed" ? <button type="button" onClick={() => void updateRevisionStatus(revision, "Ready for Review")} disabled={busyId === revision.id} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">Ready for Review</button> : null}
                        {revision.status === "Closed" ? <button type="button" onClick={() => void updateRevisionStatus(revision, "In Progress")} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Reopen</button> : null}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {revisionItems.map((item) => {
                        const itemFiles = filesByItem.get(item.id) ?? [];
                        const beforeCount = itemFiles.filter((file) => file.file_role === "before_photo").length;
                        const afterCount = itemFiles.filter((file) => file.file_role === "after_photo").length;
                        const complete = completeness(item);
                        return (
                          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-blue-700">ITEM {String(item.item_number).padStart(3, "0")}</span><span className="font-bold text-slate-900">{issueName(item.issue_type_id, item.other_issue_text)}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${itemStatusClasses(item.status)}`}>{item.status}</span>{complete.complete ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Evidence Complete</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Evidence Incomplete</span>}</div>
                                <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-3"><span>Segment: <b className="text-slate-700">{item.tower_segment || "-"}</b></span><span>Member: <b className="text-slate-700">{item.member_number || "-"}</b></span><span>Drawing: <b className="text-slate-700">{item.drawing_number || "-"}</b></span></div>
                                <div className="mt-3 grid gap-3 lg:grid-cols-2"><div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Client Finding</div><div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.finding || "No additional client comment."}</div></div><div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Rectification Comment</div><div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.rectification_comment || "No additional rectification comment."}</div></div></div>
                                <div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className={`rounded-lg px-2 py-1 ${beforeCount ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>Before {beforeCount ? `✓ (${beforeCount})` : "missing"}</span><span className={`rounded-lg px-2 py-1 ${item.rectification_comment?.trim() ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>Comment {item.rectification_comment?.trim() ? "✓" : "missing"}</span><span className={`rounded-lg px-2 py-1 ${afterCount ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>After {afterCount ? `✓ (${afterCount})` : "missing"}</span></div>
                              </div>
                              <div className="flex shrink-0 gap-2"><button type="button" onClick={() => void openEvidence(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-700"><Camera size={14} /> Evidence</button><button type="button" onClick={() => editFinding(item)} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Pencil size={14} /></button></div>
                            </div>
                          </div>
                        );
                      })}
                      {revisionItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No findings recorded. Add the first client inspection item.</div> : null}
                    </div>

                    {pdfs.length > 0 ? <div className="mt-5 border-t border-slate-200 pt-4"><div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Controlled PDF History</div><div className="flex flex-wrap gap-2">{pdfs.map((file) => <button key={file.id} type="button" onClick={() => void viewPdf(file)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{file.file_name}</button>)}</div></div> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <IssueTypeManager open={issueManagerOpen} onClose={() => setIssueManagerOpen(false)} projectId={projectId} defaultScope="revision" onChanged={load} />

      {revisionModalOpen ? (
        <Modal title="New Revision / FLI" subtitle="Create an inspection rectification record for this tower." onClose={() => setRevisionModalOpen(false)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Inspection stage"><select value={revisionDraft.inspection_stage} onChange={(event) => setRevisionDraft((current) => ({ ...current, inspection_stage: event.target.value as RevisionRow["inspection_stage"] }))} className="input"><option>Post Assembly</option><option>Post Erection</option><option>Other</option></select></Field>
            <Field label="Inspection date"><input type="date" value={revisionDraft.inspection_date} onChange={(event) => setRevisionDraft((current) => ({ ...current, inspection_date: event.target.value }))} className="input" /></Field>
            <Field label="Client inspector"><input value={revisionDraft.client_inspector} onChange={(event) => setRevisionDraft((current) => ({ ...current, client_inspector: event.target.value }))} placeholder="Name" className="input" /></Field>
            <Field label="Client / company"><input value={revisionDraft.client_company} onChange={(event) => setRevisionDraft((current) => ({ ...current, client_company: event.target.value }))} placeholder="Transgrid / UGL / etc." className="input" /></Field>
            <div className="md:col-span-2"><Field label="Client inspection / punchlist reference"><input value={revisionDraft.client_reference} onChange={(event) => setRevisionDraft((current) => ({ ...current, client_reference: event.target.value }))} placeholder="Optional reference" className="input" /></Field></div>
            <div className="md:col-span-2"><Field label="Notes"><textarea rows={3} value={revisionDraft.notes} onChange={(event) => setRevisionDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Inspection context or general notes" className="input" /></Field></div>
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRevisionModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={() => void createRevision()} disabled={revisionSaving} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{revisionSaving ? "Creating…" : "Create Revision"}</button></div>
        </Modal>
      ) : null}

      {findingDraft ? (
        <Modal title="Add Inspection Finding" subtitle={revisions.find((revision) => revision.id === findingDraft.revision_id)?.fli_number} onClose={() => setFindingDraft(null)} wide>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Common issue"><select value={findingDraft.issue_type_id} onChange={(event) => setFindingDraft((current) => current ? { ...current, issue_type_id: event.target.value, other_issue_text: event.target.value === "__other__" ? current.other_issue_text : "" } : current)} className="input"><option value="">Select common issue...</option>{revisionIssueTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__other__">Other</option></select></Field>
            {findingDraft.issue_type_id === "__other__" ? <Field label="Other issue details"><input value={findingDraft.other_issue_text} onChange={(event) => setFindingDraft((current) => current ? { ...current, other_issue_text: event.target.value } : current)} placeholder="Describe the issue identified by the inspector" className="input" /></Field> : null}
            <TowerMemberFields
              members={towerMembers}
              segment={findingDraft.tower_segment}
              memberNumber={findingDraft.member_number}
              onSegmentChange={(tower_segment) =>
                setFindingDraft((current) => {
                  if (!current) return current;
                  const currentMemberStillMatches =
                    !current.member_number ||
                    towerMembers.some(
                      (member) =>
                        member.mark_no === current.member_number &&
                        (member.tower_segment ?? "") === tower_segment,
                    );
                  return {
                    ...current,
                    tower_segment,
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
                setFindingDraft((current) =>
                  current
                    ? { ...current, member_number, drawing_number: "" }
                    : current,
                )
              }
              onSelectMember={(member) =>
                setFindingDraft((current) =>
                  current
                    ? {
                        ...current,
                        member_number: member.mark_no,
                        tower_segment:
                          member.tower_segment || current.tower_segment,
                        drawing_number: member.drawing_number || "",
                      }
                    : current,
                )
              }
            />
            <Field label="Drawing"><input value={findingDraft.drawing_number} onChange={(event) => setFindingDraft((current) => current ? { ...current, drawing_number: event.target.value } : current)} placeholder="Optional" className="input" /></Field>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2"><Field label="Client finding (optional)"><textarea rows={5} value={findingDraft.finding} onChange={(event) => setFindingDraft((current) => current ? { ...current, finding: event.target.value } : current)} placeholder="What was flagged during the inspection?" className="input" /></Field><Field label="Rectification comment (optional)"><textarea rows={5} value={findingDraft.rectification_comment} onChange={(event) => setFindingDraft((current) => current ? { ...current, rectification_comment: event.target.value } : current)} placeholder="What was changed / rectified? Can be added later." className="input" /></Field></div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2"><PhotoChooser label="Before photo(s)" help="Evidence of the client finding before rectification." files={findingDraft.beforeFiles} onChange={(selected) => setFindingDraft((current) => current ? { ...current, beforeFiles: selected } : current)} /><PhotoChooser label="After photo(s)" help="Evidence after BC rectification. Can be added later." files={findingDraft.afterFiles} onChange={(selected) => setFindingDraft((current) => current ? { ...current, afterFiles: selected } : current)} /></div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFindingDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={() => void saveFinding()} disabled={findingSaving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{findingSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Save Finding</button></div>
        </Modal>
      ) : null}

      {findingEdit ? (
        <Modal title="Edit Finding" subtitle={`Item ${String(items.find((item) => item.id === findingEdit.id)?.item_number || 0).padStart(3, "0")}`} onClose={() => setFindingEdit(null)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Common issue"><select value={findingEdit.issue_type_id} onChange={(event) => setFindingEdit((current) => current ? { ...current, issue_type_id: event.target.value, other_issue_text: event.target.value === "__other__" ? current.other_issue_text : "" } : current)} className="input"><option value="">Select common issue...</option>{revisionIssueTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__other__">Other</option></select></Field>
            {findingEdit.issue_type_id === "__other__" ? <Field label="Other issue details"><input value={findingEdit.other_issue_text} onChange={(event) => setFindingEdit((current) => current ? { ...current, other_issue_text: event.target.value } : current)} placeholder="Describe the issue identified by the inspector" className="input" /></Field> : null}
            <Field label="Status"><select value={findingEdit.status} onChange={(event) => setFindingEdit((current) => current ? { ...current, status: event.target.value as RevisionItem["status"] } : current)} className="input"><option>Open</option><option>Rectified</option><option>Verified</option></select></Field>
            <TowerMemberFields
              members={towerMembers}
              segment={findingEdit.tower_segment}
              memberNumber={findingEdit.member_number}
              onSegmentChange={(tower_segment) =>
                setFindingEdit((current) => {
                  if (!current) return current;
                  const currentMemberStillMatches =
                    !current.member_number ||
                    towerMembers.some(
                      (member) =>
                        member.mark_no === current.member_number &&
                        (member.tower_segment ?? "") === tower_segment,
                    );
                  return {
                    ...current,
                    tower_segment,
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
                setFindingEdit((current) =>
                  current
                    ? { ...current, member_number, drawing_number: "" }
                    : current,
                )
              }
              onSelectMember={(member) =>
                setFindingEdit((current) =>
                  current
                    ? {
                        ...current,
                        member_number: member.mark_no,
                        tower_segment:
                          member.tower_segment || current.tower_segment,
                        drawing_number: member.drawing_number || "",
                      }
                    : current,
                )
              }
            />
            <div className="md:col-span-2"><Field label="Drawing"><input value={findingEdit.drawing_number} onChange={(event) => setFindingEdit((current) => current ? { ...current, drawing_number: event.target.value } : current)} className="input" /></Field></div>
            <div className="md:col-span-2"><Field label="Client finding (optional)"><textarea rows={4} value={findingEdit.finding} onChange={(event) => setFindingEdit((current) => current ? { ...current, finding: event.target.value } : current)} className="input" /></Field></div>
            <div className="md:col-span-2"><Field label="Rectification comment (optional)"><textarea rows={4} value={findingEdit.rectification_comment} onChange={(event) => setFindingEdit((current) => current ? { ...current, rectification_comment: event.target.value } : current)} className="input" /></Field></div>
          </div>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setFindingEdit(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancel</button><button type="button" onClick={() => void saveFindingEdit()} disabled={findingEditSaving} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{findingEditSaving ? "Saving…" : "Save Changes"}</button></div>
        </Modal>
      ) : null}

      {evidenceItem ? (
        <Modal title="Before / After Evidence" subtitle={`Item ${String(evidenceItem.item_number).padStart(3, "0")} · ${issueName(evidenceItem.issue_type_id)}`} onClose={() => { clearEvidence(); setEvidenceItem(null); }} wide>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["before_photo", "after_photo"] as const).map((role) => {
              const roleViews = evidenceViews.filter((view) => view.role === role);
              const label = role === "before_photo" ? "Before" : "After";
              return <div key={role} className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><div className="font-black text-slate-900">{label}</div><div className="text-xs text-slate-500">{role === "before_photo" ? "Condition identified during inspection." : "Condition following rectification."}</div></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"><Camera size={14} />{evidenceUploading === `${evidenceItem.id}-${role}` ? "Uploading…" : `Add ${label}`}<input type="file" multiple disabled={Boolean(evidenceUploading)} accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" className="hidden" onChange={(event) => { const selected = Array.from(event.target.files ?? []); event.currentTarget.value = ""; void addEvidence(evidenceItem, role, selected); }} /></label></div>{evidenceLoading ? <div className="py-10 text-center text-sm text-slate-500">Loading…</div> : <div className="grid grid-cols-2 gap-2">{roleViews.map((view) => <button key={view.id} type="button" onClick={() => setPreview(view)} className="overflow-hidden rounded-xl border border-slate-200 text-left"><img src={view.url} alt={view.name} className="aspect-square w-full object-cover" /><div className="p-2"><div className="truncate text-[11px] font-bold text-slate-700">{view.name}</div><div className="mt-1 text-[10px] text-slate-400">{prettyDateTime(view.capturedAt)}<br />{view.uploadedBy || "-"}</div></div></button>)}{roleViews.length === 0 ? <div className="col-span-2 rounded-xl border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500">No {label.toLowerCase()} evidence yet.</div> : null}</div>}</div>;
            })}
          </div>
        </Modal>
      ) : null}

      {preview ? <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4" onClick={() => setPreview(null)}><div onClick={(event) => event.stopPropagation()}><img src={preview.url} alt={preview.name} className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain" /><div className="mt-2 text-center text-sm text-white">{preview.role === "before_photo" ? "Before" : "After"} · {preview.name}</div></div></div> : null}

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

function PhotoChooser({ label, help, files, onChange }: { label: string; help: string; files: File[]; onChange: (files: File[]) => void }) {
  return <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4"><div className="flex items-center gap-2 font-bold text-slate-800"><Camera size={16} />{label}</div><div className="mt-1 text-xs text-slate-500">{help}</div><input type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif" onChange={(event) => onChange(Array.from(event.target.files ?? []))} className="mt-3 block w-full text-xs" />{files.length ? <div className="mt-2 text-xs font-semibold text-blue-700">{files.length} photo(s) selected</div> : null}</label>;
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "rose" | "blue" | "green" }) {
  const classes = tone === "rose" ? "bg-rose-50 text-rose-700" : tone === "blue" ? "bg-blue-50 text-blue-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";
  return <div className={`rounded-2xl px-3 py-3 ${classes}`}><div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/70 p-4"><div className={`max-h-[92vh] w-full overflow-hidden rounded-3xl bg-white shadow-2xl ${wide ? "max-w-6xl" : "max-w-3xl"}`}><div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><div className="text-lg font-black text-slate-950">{title}</div>{subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}</div><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><X size={17} /></button></div><div className="max-h-[calc(92vh-74px)] overflow-y-auto p-5">{children}</div></div></div>;
}
