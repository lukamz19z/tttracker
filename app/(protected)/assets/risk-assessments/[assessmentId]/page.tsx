"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  ImagePlus,
  Loader2,
  Lock,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../../components";

type AssessmentStatus =
  | "draft"
  | "in_progress"
  | "ready_for_review"
  | "approved"
  | "superseded"
  | "cancelled";

type ResponseStatus =
  | "in_place"
  | "required"
  | "not_applicable"
  | "unable_to_verify";

type RiskLevel = "low" | "medium" | "high" | "critical";

type OverallResult =
  | "assessment_incomplete"
  | "suitable"
  | "suitable_with_actions"
  | "restricted_use"
  | "not_suitable";

type VerificationMethod =
  | "visual_inspection"
  | "functional_test"
  | "document_verified"
  | "previous_assessment"
  | "asset_register"
  | "assessor_confirmation"
  | "not_verified";

type AssessmentRow = {
  id: string;
  assessment_number: string;
  template_id: string;
  template_family_id: string;
  template_version: number;
  risk_matrix_id: string | null;
  asset_group: string;
  asset_source_table: string;
  asset_id: string;
  asset_type: string | null;
  asset_number: string;
  asset_display_name: string | null;
  assessment_date: string;
  assessment_purpose: string;
  state_or_jurisdiction: string | null;
  owner_name: string | null;
  assessor_user_id: string | null;
  assessor_name: string;
  assistant_assessor_names: string[] | null;
  completed_by_user_id: string | null;
  completed_by_name: string | null;
  reviewer_user_id: string | null;
  reviewer_name: string | null;
  status: AssessmentStatus;
  overall_result: OverallResult;
  revision_number: number;
  review_due_date: string | null;
  assessor_notes: string | null;
  limitations: string | null;
  report_notes: string | null;
  asset_snapshot: Record<string, unknown> | null;
  report_snapshot: Record<string, unknown> | null;
  in_place_count: number;
  required_count: number;
  not_applicable_count: number;
  unable_to_verify_count: number;
  low_required_count: number;
  medium_required_count: number;
  high_required_count: number;
  critical_required_count: number;
  report_pdf_path: string | null;
  report_generated_at: string | null;
  finalised_at: string | null;
  approved_at: string | null;
  superseded_at: string | null;
  supersedes_assessment_id: string | null;
  created_at: string;
  updated_at: string;
};

type ResponseRow = {
  id: string;
  assessment_id: string;
  template_item_id: string | null;
  section_id: string | null;
  library_item_id: string | null;
  section_title: string;
  section_order: number;
  item_title: string;
  item_code: string | null;
  item_order: number;
  inspection_question: string;
  hazards: string[] | null;
  in_place_text: string;
  required_text: string;
  unable_to_verify_text: string | null;
  reference_documents: string[] | null;
  response: ResponseStatus | null;
  comment: string | null;
  assessor_observation: string | null;
  recommended_action: string | null;
  verification_method: VerificationMethod;
  function_test_completed: boolean;
  document_verified: boolean;
  preliminary_likelihood: number;
  preliminary_consequence: number;
  preliminary_score: number | null;
  preliminary_level: RiskLevel | null;
  residual_likelihood: number;
  residual_consequence: number;
  residual_score: number | null;
  residual_level: RiskLevel | null;
  treatment_due_date: string | null;
  responsible_person_name: string | null;
  rectified_at: string | null;
  rectified_by_name: string | null;
  rectification_comment: string | null;
  linked_fleet_job_id: string | null;
  linked_fleet_job_number: string | null;
  stop_use: boolean;
  requires_photo: boolean;
  requires_comment_if_required: boolean;
  was_prefilled: boolean;
  prefill_source: string | null;
  prefill_source_date: string | null;
  confirmed_by_user_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  assessment_id: string;
  response_id: string | null;
  evidence_type: "photo" | "document" | "other";
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  caption: string | null;
  description: string | null;
  taken_at: string | null;
  display_order: number;
  include_in_report: boolean;
  created_at: string;
  signedUrl?: string | null;
};

type SectionGroup = {
  key: string;
  title: string;
  order: number;
  items: ResponseRow[];
};

type EditDraft = {
  comment: string;
  assessor_observation: string;
  recommended_action: string;
  verification_method: VerificationMethod;
  function_test_completed: boolean;
  document_verified: boolean;
  preliminary_likelihood: string;
  preliminary_consequence: string;
  residual_likelihood: string;
  residual_consequence: string;
  treatment_due_date: string;
  responsible_person_name: string;
  stop_use: boolean;
};

const RESPONSE_OPTIONS: Array<{
  value: ResponseStatus;
  label: string;
  shortLabel: string;
}> = [
  {
    value: "in_place",
    label: "In Place",
    shortLabel: "Yes",
  },
  {
    value: "required",
    label: "Required",
    shortLabel: "No",
  },
  {
    value: "not_applicable",
    label: "Not Applicable",
    shortLabel: "N/A",
  },
  {
    value: "unable_to_verify",
    label: "Unable to Verify",
    shortLabel: "Unable",
  },
];

const VERIFICATION_OPTIONS: Array<{
  value: VerificationMethod;
  label: string;
}> = [
  { value: "visual_inspection", label: "Visual inspection" },
  { value: "functional_test", label: "Functional test" },
  { value: "document_verified", label: "Document verified" },
  { value: "previous_assessment", label: "Previous assessment" },
  { value: "asset_register", label: "Asset register" },
  {
    value: "assessor_confirmation",
    label: "Assessor confirmation",
  },
  { value: "not_verified", label: "Not verified" },
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function prettify(value: string | null | undefined): string {
  if (!value) return "—";

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function riskScore(
  likelihood: number,
  consequence: number,
): number {
  return likelihood * consequence;
}

function riskLevel(score: number): RiskLevel {
  if (score <= 6) return "low";
  if (score <= 15) return "medium";
  if (score <= 22) return "high";
  return "critical";
}

function riskClasses(level: RiskLevel): string {
  if (level === "critical") {
    return "border-rose-300 bg-rose-100 text-rose-800";
  }

  if (level === "high") {
    return "border-orange-300 bg-orange-100 text-orange-800";
  }

  if (level === "medium") {
    return "border-amber-300 bg-amber-100 text-amber-800";
  }

  return "border-emerald-300 bg-emerald-100 text-emerald-800";
}

function statusClasses(status: AssessmentStatus): string {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "ready_for_review") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "in_progress") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "draft") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "superseded") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function responseButtonClasses(
  response: ResponseStatus,
  selected: boolean,
): string {
  if (!selected) {
    return "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50";
  }

  if (response === "in_place") {
    return "border-emerald-600 bg-emerald-600 text-white";
  }

  if (response === "required") {
    return "border-rose-600 bg-rose-600 text-white";
  }

  if (response === "not_applicable") {
    return "border-slate-700 bg-slate-700 text-white";
  }

  return "border-amber-500 bg-amber-500 text-white";
}

function buildEditDraft(response: ResponseRow): EditDraft {
  return {
    comment: response.comment ?? "",
    assessor_observation: response.assessor_observation ?? "",
    recommended_action: response.recommended_action ?? "",
    verification_method:
      response.verification_method ?? "not_verified",
    function_test_completed: response.function_test_completed,
    document_verified: response.document_verified,
    preliminary_likelihood: String(
      response.preliminary_likelihood,
    ),
    preliminary_consequence: String(
      response.preliminary_consequence,
    ),
    residual_likelihood: String(response.residual_likelihood),
    residual_consequence: String(
      response.residual_consequence,
    ),
    treatment_due_date: response.treatment_due_date ?? "",
    responsible_person_name:
      response.responsible_person_name ?? "",
    stop_use: response.stop_use,
  };
}

export default function RiskAssessmentChecklistPage() {
  const params = useParams<{ assessmentId: string }>();
  const assessmentId = params.assessmentId;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [assessment, setAssessment] =
    useState<AssessmentRow | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [finalising, setFinalising] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  const [expandedSections, setExpandedSections] = useState<
    Set<string>
  >(new Set());

  const [editingResponse, setEditingResponse] =
    useState<ResponseRow | null>(null);
  const [editDraft, setEditDraft] =
    useState<EditDraft | null>(null);

  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [limitations, setLimitations] = useState("");
  const [reportNotes, setReportNotes] = useState("");

  const readOnly =
    assessment?.status === "approved" ||
    assessment?.status === "superseded" ||
    assessment?.status === "cancelled";

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [assessmentResult, responseResult, evidenceResult] =
      await Promise.all([
        supabase
          .from("asset_risk_assessments")
          .select("*")
          .eq("id", assessmentId)
          .single(),

        supabase
          .from("asset_risk_assessment_responses")
          .select("*")
          .eq("assessment_id", assessmentId)
          .order("section_order", { ascending: true })
          .order("item_order", { ascending: true }),

        supabase
          .from("asset_risk_assessment_evidence")
          .select("*")
          .eq("assessment_id", assessmentId)
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (assessmentResult.error) {
      setErrorMessage(
        `Failed to load assessment: ${assessmentResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    const loadedAssessment =
      assessmentResult.data as AssessmentRow;
    const loadedResponses =
      (responseResult.data ?? []) as ResponseRow[];
    const loadedEvidence =
      (evidenceResult.data ?? []) as EvidenceRow[];

    const evidenceWithUrls = await Promise.all(
      loadedEvidence.map(async (item) => {
        const { data } = await supabase.storage
          .from(item.storage_bucket)
          .createSignedUrl(item.storage_path, 60 * 60);

        return {
          ...item,
          signedUrl: data?.signedUrl ?? null,
        };
      }),
    );

    setAssessment(loadedAssessment);
    setResponses(loadedResponses);
    setEvidence(evidenceWithUrls);
    setAssessmentNotes(loadedAssessment.assessor_notes ?? "");
    setLimitations(loadedAssessment.limitations ?? "");
    setReportNotes(loadedAssessment.report_notes ?? "");

    setExpandedSections(
      new Set(
        loadedResponses.map(
          (response) =>
            response.section_id ??
            `${response.section_order}:${response.section_title}`,
        ),
      ),
    );

    setLoading(false);
  }, [assessmentId, supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAssessment();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadAssessment]);

  const sections = useMemo<SectionGroup[]>(() => {
    const groups = new Map<string, SectionGroup>();

    for (const response of responses) {
      const key =
        response.section_id ??
        `${response.section_order}:${response.section_title}`;

      const existing = groups.get(key);

      if (existing) {
        existing.items.push(response);
      } else {
        groups.set(key, {
          key,
          title: response.section_title,
          order: response.section_order,
          items: [response],
        });
      }
    }

    return [...groups.values()].sort(
      (a, b) => a.order - b.order,
    );
  }, [responses]);

  const totalQuestions = responses.length;
  const answeredQuestions = responses.filter(
    (response) => response.response !== null,
  ).length;
  const completionPercent =
    totalQuestions === 0
      ? 0
      : Math.round((answeredQuestions / totalQuestions) * 100);

  const requiredResponses = responses.filter(
    (response) => response.response === "required",
  );

  const criticalResponses = requiredResponses.filter(
    (response) =>
      (response.residual_level ??
        riskLevel(
          riskScore(
            response.residual_likelihood,
            response.residual_consequence,
          ),
        )) === "critical",
  );

  const stopUseResponses = requiredResponses.filter(
    (response) => response.stop_use,
  );

  const missingRequiredComments = responses.filter(
    (response) =>
      response.response === "required" &&
      response.requires_comment_if_required &&
      !clean(response.comment),
  );

  const evidenceByResponse = useMemo(() => {
    const map = new Map<string, EvidenceRow[]>();

    for (const item of evidence) {
      if (!item.response_id) continue;

      const current = map.get(item.response_id) ?? [];
      current.push(item);
      map.set(item.response_id, current);
    }

    return map;
  }, [evidence]);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function toggleSection(sectionKey: string) {
    setExpandedSections((current) => {
      const next = new Set(current);

      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }

      return next;
    });
  }

  async function setResponseStatus(
    response: ResponseRow,
    nextStatus: ResponseStatus,
  ) {
    if (readOnly) return;

    clearMessages();
    setSavingId(response.id);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const updatePayload: Record<string, unknown> = {
      response: nextStatus,
      confirmed_by_user_id: user?.id ?? null,
      confirmed_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    };

    if (nextStatus === "in_place") {
      updatePayload.stop_use = false;
    }

    if (
      nextStatus === "required" &&
      !clean(response.recommended_action)
    ) {
      updatePayload.recommended_action =
        response.required_text;
    }

    const { error } = await supabase
      .from("asset_risk_assessment_responses")
      .update(updatePayload)
      .eq("id", response.id);

    if (error) {
      setSavingId(null);
      setErrorMessage(
        `Failed to save response: ${error.message}`,
      );
      return;
    }

    if (assessment?.status === "draft") {
      await supabase
        .from("asset_risk_assessments")
        .update({ status: "in_progress" })
        .eq("id", assessment.id);
    }

    setSavingId(null);

    setResponses((current) =>
      current.map((item) =>
        item.id === response.id
          ? {
              ...item,
              response: nextStatus,
              stop_use:
                nextStatus === "in_place"
                  ? false
                  : item.stop_use,
              recommended_action:
                nextStatus === "required" &&
                !clean(item.recommended_action)
                  ? item.required_text
                  : item.recommended_action,
              confirmed_at: new Date().toISOString(),
              confirmed_by_user_id: user?.id ?? null,
            }
          : item,
      ),
    );

    if (
      nextStatus === "required" &&
      response.requires_comment_if_required &&
      !clean(response.comment)
    ) {
      openEditResponse({
        ...response,
        response: nextStatus,
        recommended_action:
          response.recommended_action ??
          response.required_text,
      });
    }
  }

  async function markSectionInPlace(section: SectionGroup) {
    if (readOnly) return;

    const unanswered = section.items.filter(
      (item) => item.response === null,
    );

    if (unanswered.length === 0) {
      setMessage("This section has no unanswered items.");
      return;
    }

    const confirmed = window.confirm(
      `Mark ${unanswered.length} unanswered item(s) in "${section.title}" as In Place?`,
    );

    if (!confirmed) return;

    setSavingId(`section:${section.key}`);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const updates = unanswered.map((item) =>
      supabase
        .from("asset_risk_assessment_responses")
        .update({
          response: "in_place",
          stop_use: false,
          confirmed_by_user_id: user?.id ?? null,
          confirmed_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq("id", item.id),
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    setSavingId(null);

    if (failed?.error) {
      setErrorMessage(
        `Failed to update section: ${failed.error.message}`,
      );
      return;
    }

    if (assessment?.status === "draft") {
      await supabase
        .from("asset_risk_assessments")
        .update({ status: "in_progress" })
        .eq("id", assessment.id);
    }

    setMessage(
      `${unanswered.length} item(s) marked as In Place.`,
    );
    await loadAssessment();
  }

  function openEditResponse(response: ResponseRow) {
    setEditingResponse(response);
    setEditDraft(buildEditDraft(response));
  }

  async function saveResponseDetails() {
    if (
      readOnly ||
      !editingResponse ||
      !editDraft
    ) {
      return;
    }

    if (
      editingResponse.response === "required" &&
      editingResponse.requires_comment_if_required &&
      !clean(editDraft.comment)
    ) {
      setErrorMessage(
        "A comment is required when this treatment is marked Required.",
      );
      return;
    }

    setSavingId(editingResponse.id);
    clearMessages();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const preliminaryLikelihood = Number(
      editDraft.preliminary_likelihood,
    );
    const preliminaryConsequence = Number(
      editDraft.preliminary_consequence,
    );
    const residualLikelihood = Number(
      editDraft.residual_likelihood,
    );
    const residualConsequence = Number(
      editDraft.residual_consequence,
    );

    const { error } = await supabase
      .from("asset_risk_assessment_responses")
      .update({
        comment: clean(editDraft.comment) || null,
        assessor_observation:
          clean(editDraft.assessor_observation) || null,
        recommended_action:
          clean(editDraft.recommended_action) || null,
        verification_method:
          editDraft.verification_method,
        function_test_completed:
          editDraft.function_test_completed,
        document_verified: editDraft.document_verified,
        preliminary_likelihood: preliminaryLikelihood,
        preliminary_consequence: preliminaryConsequence,
        residual_likelihood: residualLikelihood,
        residual_consequence: residualConsequence,
        treatment_due_date:
          editDraft.treatment_due_date || null,
        responsible_person_name:
          clean(editDraft.responsible_person_name) || null,
        stop_use: editDraft.stop_use,
        updated_by: user?.id ?? null,
      })
      .eq("id", editingResponse.id);

    setSavingId(null);

    if (error) {
      setErrorMessage(
        `Failed to save item details: ${error.message}`,
      );
      return;
    }

    setEditingResponse(null);
    setEditDraft(null);
    setMessage("Assessment item updated.");
    await loadAssessment();
  }

  async function saveAssessmentNotes() {
    if (!assessment || readOnly) return;

    setSavingId("assessment-notes");
    clearMessages();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("asset_risk_assessments")
      .update({
        assessor_notes:
          clean(assessmentNotes) || null,
        limitations: clean(limitations) || null,
        report_notes: clean(reportNotes) || null,
        updated_by: user?.id ?? null,
      })
      .eq("id", assessment.id);

    setSavingId(null);

    if (error) {
      setErrorMessage(
        `Failed to save assessment notes: ${error.message}`,
      );
      return;
    }

    setMessage("Assessment notes saved.");
    await loadAssessment();
  }

  async function uploadEvidence(
    response: ResponseRow,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (readOnly) return;

    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage(
        "Only JPG, PNG, WEBP and PDF files are supported.",
      );
      event.target.value = "";
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage(
        "The evidence file must be 20 MB or smaller.",
      );
      event.target.value = "";
      return;
    }

    setUploadingId(response.id);
    clearMessages();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUploadingId(null);
      setErrorMessage("You must be signed in to upload evidence.");
      return;
    }

    const extension =
      file.name.split(".").pop()?.toLowerCase() || "file";
    const safeName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    const evidenceSequence =
      (evidenceByResponse.get(response.id)?.length ?? 0) + 1;

    const storagePath = `${user.id}/${assessmentId}/${response.id}/${file.lastModified}-${evidenceSequence}-${safeName}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("asset-risk-assessments")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      setUploadingId(null);
      setErrorMessage(
        `Failed to upload evidence: ${uploadError.message}`,
      );
      event.target.value = "";
      return;
    }

    const evidenceType =
      file.type === "application/pdf"
        ? "document"
        : "photo";

    const { error: insertError } = await supabase
      .from("asset_risk_assessment_evidence")
      .insert({
        assessment_id: assessmentId,
        response_id: response.id,
        evidence_type: evidenceType,
        storage_bucket: "asset-risk-assessments",
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        caption: response.item_title,
        display_order:
          (evidenceByResponse.get(response.id)?.length ?? 0) + 1,
        include_in_report: true,
        uploaded_by: user.id,
      });

    setUploadingId(null);
    event.target.value = "";

    if (insertError) {
      setErrorMessage(
        `Evidence uploaded but could not be registered: ${insertError.message}`,
      );
      return;
    }

    setMessage("Evidence uploaded.");
    await loadAssessment();
  }

  async function deleteEvidence(item: EvidenceRow) {
    if (readOnly) return;

    const confirmed = window.confirm(
      `Delete ${item.file_name || "this evidence file"}?`,
    );

    if (!confirmed) return;

    setUploadingId(item.id);

    await supabase.storage
      .from(item.storage_bucket)
      .remove([item.storage_path]);

    const { error } = await supabase
      .from("asset_risk_assessment_evidence")
      .delete()
      .eq("id", item.id);

    setUploadingId(null);

    if (error) {
      setErrorMessage(
        `Failed to delete evidence: ${error.message}`,
      );
      return;
    }

    setMessage("Evidence deleted.");
    await loadAssessment();
  }

  async function finaliseAssessment() {
    if (!assessment || readOnly) return;

    if (answeredQuestions !== totalQuestions) {
      setErrorMessage(
        `${totalQuestions - answeredQuestions} assessment item(s) are still unanswered.`,
      );
      return;
    }

    if (missingRequiredComments.length > 0) {
      setErrorMessage(
        `${missingRequiredComments.length} required treatment item(s) are missing mandatory comments.`,
      );
      return;
    }

    const missingRequiredPhotos = responses.filter(
      (response) =>
        response.response === "required" &&
        response.requires_photo &&
        (evidenceByResponse.get(response.id)?.length ?? 0) === 0,
    );

    if (missingRequiredPhotos.length > 0) {
      setErrorMessage(
        `${missingRequiredPhotos.length} required treatment item(s) are missing required evidence.`,
      );
      return;
    }

    const confirmed = window.confirm(
      criticalResponses.length > 0 ||
        stopUseResponses.length > 0
        ? `Finalise this assessment with ${criticalResponses.length} critical treatment(s) and ${stopUseResponses.length} stop-use item(s)?`
        : "Finalise this risk assessment?",
    );

    if (!confirmed) return;

    setFinalising(true);
    clearMessages();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const completedByName =
      assessment.assessor_name ||
      clean(user?.user_metadata?.full_name) ||
      clean(user?.email);

    const { error } = await supabase.rpc(
      "finalise_asset_risk_assessment",
      {
        p_assessment_id: assessment.id,
        p_completed_by_name: completedByName,
      },
    );

    setFinalising(false);

    if (error) {
      setErrorMessage(
        `Failed to finalise assessment: ${error.message}`,
      );
      return;
    }

    setMessage("Assessment finalised successfully.");
    await loadAssessment();
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[65vh] items-center justify-center">
          <div className="text-center">
            <Loader2
              size={30}
              className="mx-auto animate-spin text-slate-500"
            />
            <p className="mt-3 text-sm font-bold text-slate-600">
              Loading assessment...
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!assessment) {
    return (
      <PageShell>
        <div className="p-8">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <h1 className="text-lg font-black text-rose-900">
              Assessment not available
            </h1>
            <p className="mt-2 text-sm text-rose-800">
              {errorMessage ||
                "The requested risk assessment could not be loaded."}
            </p>
            <Link
              href="/assets/risk-assessments"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              <ArrowLeft size={16} />
              Back to Register
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const assetSnapshot = assessment.asset_snapshot ?? {};
  const registration = clean(assetSnapshot.registration);
  const make = clean(assetSnapshot.make);
  const model = clean(assetSnapshot.model);
  const projectName = clean(assetSnapshot.projectName);
  const crewName = clean(assetSnapshot.crewName);
  const odometer = clean(assetSnapshot.odometer);
  const hours = clean(assetSnapshot.hours);
  const maskedIdentifier = clean(
    assetSnapshot.identifierMasked,
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Risk Assessments"
        title={assessment.assessment_number}
        description={`${assessment.asset_number} · ${
          assessment.asset_display_name ||
          prettify(assessment.asset_type)
        }`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/risk-assessments"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Register
            </Link>

            <button
              type="button"
              onClick={() => void loadAssessment()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            {assessment.status === "approved" && (
              <Link
                href={`/assets/risk-assessments/${assessment.id}/report`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Eye size={16} />
                View Report
              </Link>
            )}

            {assessment.report_pdf_path && (
              <a
                href={assessment.report_pdf_path}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download size={16} />
                PDF
              </a>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={() => void finaliseAssessment()}
                disabled={finalising}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {finalising ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <ClipboardCheck size={16} />
                )}
                {finalising
                  ? "Finalising..."
                  : "Finalise Assessment"}
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
        {readOnly && (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Lock
              size={18}
              className="mt-0.5 shrink-0"
            />
            <div>
              <p className="text-sm font-black">
                This assessment is read-only
              </p>
              <p className="mt-1 text-sm leading-6">
                Approved, superseded and cancelled assessments are
                retained as controlled historical records.
              </p>
            </div>
          </div>
        )}

        {message && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0"
            />
            {errorMessage}
          </div>
        )}

        {(criticalResponses.length > 0 ||
          stopUseResponses.length > 0) && (
          <section className="rounded-3xl border border-rose-300 bg-rose-50 p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={22}
                className="mt-0.5 shrink-0 text-rose-700"
              />
              <div>
                <h2 className="text-lg font-black text-rose-950">
                  Stop-use and critical treatments identified
                </h2>
                <p className="mt-2 text-sm leading-6 text-rose-900">
                  This assessment contains{" "}
                  {criticalResponses.length} critical residual risk
                  item(s) and {stopUseResponses.length} item(s)
                  marked to stop use. These controls must be reviewed
                  before the asset is operated.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-950">
                    {assessment.asset_number}
                  </h2>

                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${statusClasses(
                      assessment.status,
                    )}`}
                  >
                    {prettify(assessment.status)}
                  </span>
                </div>

                <p className="mt-2 text-sm font-bold text-slate-700">
                  {assessment.asset_display_name ||
                    prettify(assessment.asset_type)}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {prettify(assessment.asset_group)} ·{" "}
                  {prettify(assessment.asset_type)}
                </p>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <AssetDetail
                  label="Assessment date"
                  value={formatDate(
                    assessment.assessment_date,
                  )}
                />
                <AssetDetail
                  label="Assessor"
                  value={assessment.assessor_name}
                />
                <AssetDetail
                  label="Project"
                  value={projectName || "Not recorded"}
                />
                <AssetDetail
                  label="Crew"
                  value={crewName || "Not recorded"}
                />
              </dl>
            </div>

            <div className="mt-5 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2 xl:grid-cols-6">
              <AssetDetail
                label="Registration"
                value={registration || "Not recorded"}
              />
              <AssetDetail
                label="Make"
                value={make || "Not recorded"}
              />
              <AssetDetail
                label="Model"
                value={model || "Not recorded"}
              />
              <AssetDetail
                label="Odometer"
                value={
                  odometer
                    ? `${Number(odometer).toLocaleString(
                        "en-AU",
                      )} km`
                    : "Not recorded"
                }
              />
              <AssetDetail
                label="Hours"
                value={
                  hours
                    ? `${Number(hours).toLocaleString(
                        "en-AU",
                      )} h`
                    : "Not recorded"
                }
              />
              <AssetDetail
                label="Identifier"
                value={maskedIdentifier || "Not displayed"}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">
                Assessment progress
              </h2>
              <span className="text-2xl font-black text-slate-950">
                {completionPercent}%
              </span>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900 transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <ProgressMetric
                label="Answered"
                value={`${answeredQuestions}/${totalQuestions}`}
              />
              <ProgressMetric
                label="Required"
                value={requiredResponses.length}
                danger={requiredResponses.length > 0}
              />
              <ProgressMetric
                label="Missing comments"
                value={missingRequiredComments.length}
                danger={missingRequiredComments.length > 0}
              />
              <ProgressMetric
                label="Evidence files"
                value={evidence.length}
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Assessment checklist
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Select an outcome for every item. Use notes,
                  treatment actions and evidence where required.
                </p>
              </div>

              <div className="text-sm font-bold text-slate-500">
                {sections.length} sections · {responses.length} items
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            {sections.map((section) => {
              const expanded = expandedSections.has(section.key);
              const answered = section.items.filter(
                (item) => item.response !== null,
              ).length;
              const required = section.items.filter(
                (item) => item.response === "required",
              ).length;
              const sectionComplete =
                answered === section.items.length;

              return (
                <article
                  key={section.key}
                  className="overflow-hidden rounded-2xl border border-slate-200"
                >
                  <div className="flex flex-col gap-3 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <button
                      type="button"
                      onClick={() =>
                        toggleSection(section.key)
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-slate-950">
                          {section.title}
                        </h3>

                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-black ${
                            sectionComplete
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {answered}/{section.items.length} complete
                        </span>

                        {required > 0 && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">
                            {required} required
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            void markSectionInPlace(section)
                          }
                          disabled={
                            savingId ===
                            `section:${section.key}`
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {savingId ===
                          `section:${section.key}` ? (
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <Check size={14} />
                          )}
                          Mark unanswered In Place
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          toggleSection(section.key)
                        }
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
                      >
                        {expanded ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="divide-y divide-slate-200">
                      {section.items.map((response) => (
                        <AssessmentItem
                          key={response.id}
                          response={response}
                          evidence={
                            evidenceByResponse.get(response.id) ??
                            []
                          }
                          readOnly={readOnly}
                          saving={
                            savingId === response.id
                          }
                          uploading={
                            uploadingId === response.id
                          }
                          onSelectResponse={(status) =>
                            void setResponseStatus(
                              response,
                              status,
                            )
                          }
                          onEdit={() =>
                            openEditResponse(response)
                          }
                          onUpload={(event) =>
                            void uploadEvidence(
                              response,
                              event,
                            )
                          }
                          onDeleteEvidence={(item) =>
                            void deleteEvidence(item)
                          }
                        />
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <h2 className="text-xl font-black text-slate-950">
              Assessment notes
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Add general observations, limitations and report notes
              that apply to the whole assessment.
            </p>
          </div>

          <fieldset
            disabled={readOnly}
            className="space-y-5 p-5 disabled:opacity-75 sm:p-6"
          >
            <TextArea
              label="Assessor notes"
              value={assessmentNotes}
              rows={4}
              onChange={setAssessmentNotes}
            />

            <TextArea
              label="Assessment limitations"
              value={limitations}
              rows={4}
              onChange={setLimitations}
            />

            <TextArea
              label="Report notes"
              value={reportNotes}
              rows={4}
              onChange={setReportNotes}
            />

            {!readOnly && (
              <div className="flex justify-end border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={() =>
                    void saveAssessmentNotes()
                  }
                  disabled={
                    savingId === "assessment-notes"
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingId === "assessment-notes" ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Notes
                </button>
              </div>
            )}
          </fieldset>
        </section>

        {!readOnly && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <ClipboardCheck
                  size={22}
                  className="mt-0.5 shrink-0 text-emerald-700"
                />

                <div>
                  <h2 className="text-lg font-black text-emerald-950">
                    Finalise assessment
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-900">
                    All items must be answered. Required treatments
                    must include mandatory comments and evidence where
                    configured.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void finaliseAssessment()
                }
                disabled={
                  finalising ||
                  answeredQuestions !== totalQuestions ||
                  missingRequiredComments.length > 0
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {finalising ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                {finalising
                  ? "Finalising..."
                  : "Finalise Assessment"}
              </button>
            </div>
          </section>
        )}
      </div>

      {editingResponse && editDraft && (
        <Modal
          title={editingResponse.item_title}
          onClose={() => {
            setEditingResponse(null);
            setEditDraft(null);
          }}
        >
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">
                {editingResponse.inspection_question}
              </p>

              {editingResponse.response && (
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  Current response:{" "}
                  {prettify(editingResponse.response)}
                </p>
              )}
            </div>

            <TextArea
              label="Comment"
              value={editDraft.comment}
              rows={3}
              required={
                editingResponse.response === "required" &&
                editingResponse.requires_comment_if_required
              }
              onChange={(value) =>
                setEditDraft((current) =>
                  current
                    ? { ...current, comment: value }
                    : current,
                )
              }
            />

            <TextArea
              label="Assessor observation"
              value={editDraft.assessor_observation}
              rows={3}
              onChange={(value) =>
                setEditDraft((current) =>
                  current
                    ? {
                        ...current,
                        assessor_observation: value,
                      }
                    : current,
                )
              }
            />

            <TextArea
              label="Recommended action"
              value={editDraft.recommended_action}
              rows={4}
              onChange={(value) =>
                setEditDraft((current) =>
                  current
                    ? {
                        ...current,
                        recommended_action: value,
                      }
                    : current,
                )
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Verification method"
                value={editDraft.verification_method}
                options={VERIFICATION_OPTIONS}
                onChange={(value) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          verification_method:
                            value as VerificationMethod,
                        }
                      : current,
                  )
                }
              />

              <TextField
                label="Responsible person"
                value={editDraft.responsible_person_name}
                onChange={(value) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          responsible_person_name: value,
                        }
                      : current,
                  )
                }
              />

              <TextField
                label="Treatment due date"
                type="date"
                value={editDraft.treatment_due_date}
                onChange={(value) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          treatment_due_date: value,
                        }
                      : current,
                  )
                }
              />
            </div>

            <RiskEditor
              preliminaryLikelihood={
                editDraft.preliminary_likelihood
              }
              preliminaryConsequence={
                editDraft.preliminary_consequence
              }
              residualLikelihood={
                editDraft.residual_likelihood
              }
              residualConsequence={
                editDraft.residual_consequence
              }
              onChange={(key, value) =>
                setEditDraft((current) =>
                  current
                    ? { ...current, [key]: value }
                    : current,
                )
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleCard
                title="Functional test completed"
                checked={
                  editDraft.function_test_completed
                }
                onChange={(checked) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          function_test_completed: checked,
                        }
                      : current,
                  )
                }
              />

              <ToggleCard
                title="Document verified"
                checked={editDraft.document_verified}
                onChange={(checked) =>
                  setEditDraft((current) =>
                    current
                      ? {
                          ...current,
                          document_verified: checked,
                        }
                      : current,
                  )
                }
              />

              <ToggleCard
                title="Stop use"
                checked={editDraft.stop_use}
                danger
                onChange={(checked) =>
                  setEditDraft((current) =>
                    current
                      ? { ...current, stop_use: checked }
                      : current,
                  )
                }
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={() => {
                  setEditingResponse(null);
                  setEditDraft(null);
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveResponseDetails()
                }
                disabled={
                  savingId === editingResponse.id
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingId === editingResponse.id ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={15} />
                )}
                Save Item
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}

function AssessmentItem({
  response,
  evidence,
  readOnly,
  saving,
  uploading,
  onSelectResponse,
  onEdit,
  onUpload,
  onDeleteEvidence,
}: {
  response: ResponseRow;
  evidence: EvidenceRow[];
  readOnly: boolean;
  saving: boolean;
  uploading: boolean;
  onSelectResponse: (status: ResponseStatus) => void;
  onEdit: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDeleteEvidence: (item: EvidenceRow) => void;
}) {
  const preliminaryLevel =
    response.preliminary_level ??
    riskLevel(
      riskScore(
        response.preliminary_likelihood,
        response.preliminary_consequence,
      ),
    );

  const residualLevel =
    response.residual_level ??
    riskLevel(
      riskScore(
        response.residual_likelihood,
        response.residual_consequence,
      ),
    );

  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-slate-950">
              {response.item_title}
            </h4>

            {response.was_prefilled && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">
                Prefilled
              </span>
            )}

            {response.stop_use && (
              <span className="rounded-full border border-rose-300 bg-rose-100 px-2 py-1 text-[10px] font-black uppercase text-rose-800">
                Stop use
              </span>
            )}
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-700">
            {response.inspection_question}
          </p>

          {(response.hazards ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(response.hazards ?? []).map((hazard) => (
                <span
                  key={hazard}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
                >
                  {prettify(hazard)}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${riskClasses(
                preliminaryLevel,
              )}`}
            >
              Initial{" "}
              {response.preliminary_score ??
                riskScore(
                  response.preliminary_likelihood,
                  response.preliminary_consequence,
                )}
            </span>

            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${riskClasses(
                residualLevel,
              )}`}
            >
              Residual{" "}
              {response.residual_score ??
                riskScore(
                  response.residual_likelihood,
                  response.residual_consequence,
                )}
            </span>
          </div>

          {(response.comment ||
            response.assessor_observation ||
            response.recommended_action) && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {response.comment && (
                <p>
                  <strong>Comment:</strong> {response.comment}
                </p>
              )}

              {response.assessor_observation && (
                <p className="mt-1">
                  <strong>Observation:</strong>{" "}
                  {response.assessor_observation}
                </p>
              )}

              {response.recommended_action && (
                <p className="mt-1">
                  <strong>Action:</strong>{" "}
                  {response.recommended_action}
                </p>
              )}
            </div>
          )}

          {evidence.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evidence.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  {item.mime_type?.startsWith("image/") &&
                  item.signedUrl ? (
                    <a
                      href={item.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.signedUrl}
                        alt={item.caption || item.file_name || "Evidence"}
                        className="h-36 w-full object-cover"
                      />
                    </a>
                  ) : (
                    <a
                      href={item.signedUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-28 items-center justify-center bg-slate-50 text-slate-500"
                    >
                      <FileText size={28} />
                    </a>
                  )}

                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-800">
                        {item.file_name || "Evidence"}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDateTime(item.created_at)}
                      </p>
                    </div>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          onDeleteEvidence(item)
                        }
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-full shrink-0 xl:w-97.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {RESPONSE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                disabled={readOnly || saving}
                onClick={() =>
                  onSelectResponse(option.value)
                }
                className={`rounded-xl border px-3 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${responseButtonClasses(
                  option.value,
                  response.response === option.value,
                )}`}
              >
                {saving &&
                response.response !== option.value ? (
                  <Loader2
                    size={15}
                    className="mx-auto animate-spin"
                  />
                ) : (
                  option.label
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              disabled={readOnly}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <MessageSquareText size={15} />
              Notes and Risk
            </button>

            {!readOnly && (
              <label className="inline-flex cursor-pointer flex-1 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100">
                {uploading ? (
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <ImagePlus size={15} />
                )}
                Add Evidence
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={onUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {response.requires_photo &&
            evidence.length === 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                <Camera
                  size={14}
                  className="mt-0.5 shrink-0"
                />
                Evidence is required for this item.
              </div>
            )}

          {response.response === "required" &&
            response.requires_comment_if_required &&
            !clean(response.comment) && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                <CircleAlert
                  size={14}
                  className="mt-0.5 shrink-0"
                />
                A comment is required.
              </div>
            )}

          {response.linked_fleet_job_number && (
            <Link
              href={`/assets/fleet-jobs/${response.linked_fleet_job_id}`}
              className="mt-3 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-black text-blue-700 hover:bg-blue-100"
            >
              Fleet Job {response.linked_fleet_job_number}
              <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-black text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        danger
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-black ${
          danger ? "text-rose-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TextArea({
  label,
  value,
  rows,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">
        {label}
        {required && (
          <span className="ml-1 text-rose-600">*</span>
        )}
      </span>
      <textarea
        value={value}
        rows={rows}
        required={required}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleCard({
  title,
  checked,
  onChange,
  danger = false,
}: {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-xl border p-4 text-left transition ${
        checked
          ? danger
            ? "border-rose-600 bg-rose-600 text-white"
            : "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-5 w-9 items-center rounded-full p-0.5 ${
            checked ? "bg-emerald-400" : "bg-slate-300"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow transition ${
              checked ? "translate-x-4" : ""
            }`}
          />
        </span>

        <span className="text-sm font-black">{title}</span>
      </div>
    </button>
  );
}

function RiskEditor({
  preliminaryLikelihood,
  preliminaryConsequence,
  residualLikelihood,
  residualConsequence,
  onChange,
}: {
  preliminaryLikelihood: string;
  preliminaryConsequence: string;
  residualLikelihood: string;
  residualConsequence: string;
  onChange: (
    key:
      | "preliminary_likelihood"
      | "preliminary_consequence"
      | "residual_likelihood"
      | "residual_consequence",
    value: string,
  ) => void;
}) {
  const preliminaryScore = riskScore(
    Number(preliminaryLikelihood),
    Number(preliminaryConsequence),
  );

  const residualScore = riskScore(
    Number(residualLikelihood),
    Number(residualConsequence),
  );

  return (
    <div>
      <h3 className="text-sm font-black text-slate-900">
        Risk ratings
      </h3>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-black text-slate-900">
              Preliminary
            </p>

            <span
              className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${riskClasses(
                riskLevel(preliminaryScore),
              )}`}
            >
              {riskLevel(preliminaryScore)} {preliminaryScore}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <RiskSelect
              label="Likelihood"
              value={preliminaryLikelihood}
              onChange={(value) =>
                onChange(
                  "preliminary_likelihood",
                  value,
                )
              }
            />
            <RiskSelect
              label="Consequence"
              value={preliminaryConsequence}
              onChange={(value) =>
                onChange(
                  "preliminary_consequence",
                  value,
                )
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-black text-slate-900">
              Residual
            </p>

            <span
              className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${riskClasses(
                riskLevel(residualScore),
              )}`}
            >
              {riskLevel(residualScore)} {residualScore}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <RiskSelect
              label="Likelihood"
              value={residualLikelihood}
              onChange={(value) =>
                onChange(
                  "residual_likelihood",
                  value,
                )
              }
            />
            <RiskSelect
              label="Consequence"
              value={residualConsequence}
              onChange={(value) =>
                onChange(
                  "residual_consequence",
                  value,
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
      >
        {[1, 2, 3, 4, 5].map((score) => (
          <option
            key={score}
            value={String(score)}
          >
            {score}
          </option>
        ))}
      </select>
    </label>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-68px)] overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
