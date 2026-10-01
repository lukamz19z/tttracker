"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Edit3,
  ExternalLink,
  FileText,
  FolderKanban,
  HardHat,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Shirt,
  Trash2,
  Upload,
  UserCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type TrainingStatus =
  | "current"
  | "expiring"
  | "expired"
  | "missing"
  | "pending"
  | "revoked"
  | "superseded";

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  user_id: string | null;
  notes: string | null;
  shirt_size: string | null;
  jacket_size: string | null;
  glove_size: string | null;
  pants_size: string | null;
  created_at?: string | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
  leading_hand: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number?: string | null;
  status?: string | null;
};

type ProjectAccessRow = {
  project_id: string;
};

type ApiUser = {
  user_id?: string | null;
  id?: string | null;
  email?: string | null;
  employee?: { id?: string | null; full_name?: string | null } | null;
  employee_id?: string | null;
  employee_name?: string | null;
};

type UsersResponse = {
  users?: ApiUser[];
  error?: string;
};

type LoginAccount = {
  userId: string;
  email: string;
  linkedEmployeeId: string | null;
  linkedEmployeeName: string | null;
};

type TrainingType = {
  id: string;
  category_id: string | null;
  name: string;
  short_code: string | null;
  category: string | null;
  record_kind: string | null;
  default_expiry_months: number | null;
  allows_no_expiry: boolean | null;
  requires_issue_date: boolean | null;
  requires_expiry_date: boolean | null;
  requires_certificate_number: boolean | null;
  supports_class_codes: boolean | null;
  supports_provider: boolean | null;
  active: boolean | null;
  validity_mode: string | null;
  validity_interval_value: number | null;
  validity_interval_unit: string | null;
  requires_issuer: boolean | null;
  requires_project: boolean | null;
  requires_document: boolean | null;
  document_upload_type: string | null;
  allows_multiple_current: boolean | null;
  subtype_mode: string | null;
  requires_review: boolean | null;
  allowed_extensions?: string[] | null;
  max_file_size_mb?: number | null;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
};

type CustomField = {
  id: string;
  training_type_id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  options: unknown;
  placeholder: string | null;
  help_text: string | null;
  active: boolean;
  sort_order: number;
};

type TrainingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  training_name: string;
  training_short_code: string | null;
  category: string | null;
  record_kind: string | null;
  certificate_number: string | null;
  class_codes: string[] | null;
  option_codes: string[] | null;
  provider: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean | null;
  record_status: string | null;
  notes: string | null;
  supersedes_record_id: string | null;
  superseded_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  workflow_status: string | null;
  current_version: boolean | null;
  project_id: string | null;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
  deleted_reason: string | null;
  created_at: string | null;
};

type TrainingDocument = {
  id: string;
  training_record_id: string;
  document_type_name: string;
  document_type_code: string | null;
  document_side: string | null;
  generated_file_name: string;
  sharepoint_web_url: string | null;
  active: boolean | null;
  created_at: string | null;
};

type ProfileForm = {
  payrollId: string;
  fullName: string;
  role: string;
  crewId: string;
  active: boolean;
  notes: string;
  shirtSize: string;
  jacketSize: string;
  gloveSize: string;
  pantsSize: string;
  userId: string;
};

type TrainingForm = {
  trainingTypeId: string;
  trainingName: string;
  category: string;
  certificateNumber: string;
  classCodes: string;
  provider: string;
  issueDate: string;
  expiryDate: string;
  doesNotExpire: boolean;
  notes: string;
};

type TabKey = "overview" | "training" | "ppe" | "projects" | "history";

const EMPTY_TRAINING_FORM: TrainingForm = {
  trainingTypeId: "",
  trainingName: "",
  category: "",
  certificateNumber: "",
  classCodes: "",
  provider: "",
  issueDate: "",
  expiryDate: "",
  doesNotExpire: false,
  notes: "",
};

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const JACKET_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
const GLOVE_SIZES = ["S", "M", "L", "XL", "2XL"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}


const TRAINING_IMAGE_TARGET_BYTES = 1_400_000;
const TRAINING_REQUEST_SAFE_BYTES = 4_000_000;

function replaceFileExtension(fileName: string, extension: string) {
  const base = fileName.replace(/\.[^.]+$/, "") || "training-evidence";
  return `${base}.${extension}`;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function prepareTrainingUploadFile(file: File) {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= TRAINING_IMAGE_TARGET_BYTES) return file;

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `${file.name} could not be prepared. Save the photo as JPG or PNG and try again.`,
    );
  }

  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const initialScale = Math.min(1, 2200 / Math.max(longestSide, 1));
    let bestBlob: Blob | null = null;

    for (let sizePass = 0; sizePass < 5; sizePass += 1) {
      const passScale = initialScale * Math.pow(0.84, sizePass);
      const width = Math.max(1, Math.round(bitmap.width * passScale));
      const height = Math.max(1, Math.round(bitmap.height * passScale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("This browser could not prepare the Training photo.");
      }

      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.86, 0.76, 0.66, 0.56]) {
        const blob = await canvasBlob(canvas, "image/jpeg", quality);
        if (!blob) continue;
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;

        if (blob.size <= TRAINING_IMAGE_TARGET_BYTES) {
          return new File(
            [blob],
            replaceFileExtension(file.name, "jpg"),
            { type: "image/jpeg", lastModified: file.lastModified },
          );
        }
      }
    }

    if (!bestBlob) throw new Error(`${file.name} could not be compressed.`);

    return new File(
      [bestBlob],
      replaceFileExtension(file.name, "jpg"),
      { type: "image/jpeg", lastModified: file.lastModified },
    );
  } finally {
    bitmap.close();
  }
}

function fieldOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item)).filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => clean(item))
      .filter(Boolean);
  }

  const raw = clean(value);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => clean(item)).filter(Boolean);
    }
  } catch {
    // Fall back to comma/newline parsing.
  }

  return raw
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function configuredExpiryDate(
  issueDate: string,
  type: TrainingType | null,
) {
  if (!issueDate || !type) return "";
  if (clean(type.validity_mode) === "never") return "";

  const amount = Number(type.validity_interval_value ?? 0);
  const unit = clean(type.validity_interval_unit).toLowerCase();

  if (!amount || !unit) {
    return type.default_expiry_months
      ? addMonths(issueDate, type.default_expiry_months)
      : "";
  }

  const date = new Date(`${issueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  if (unit.startsWith("day")) date.setDate(date.getDate() + amount);
  else if (unit.startsWith("week")) date.setDate(date.getDate() + amount * 7);
  else if (unit.startsWith("year")) date.setFullYear(date.getFullYear() + amount);
  else date.setMonth(date.getMonth() + amount);

  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function crewLabel(crew: Crew | null | undefined) {
  if (!crew) return "Unassigned";

  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);

  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  if (name) return name;

  return "Unassigned";
}

function hasCompletePpe(employee: Employee | null) {
  if (!employee) return false;

  return Boolean(
    clean(employee.shirt_size) &&
      clean(employee.jacket_size) &&
      clean(employee.glove_size) &&
      clean(employee.pants_size),
  );
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function calculateTrainingStatus(record: TrainingRecord): TrainingStatus {
  if (record.deleted_at) return "revoked";
  if (["pending_review", "changes_required"].includes(clean(record.workflow_status))) {
    return "pending";
  }
  if (record.revoked_at || record.record_status === "revoked") return "revoked";
  if (record.superseded_at || record.record_status === "superseded") {
    return "superseded";
  }
  if (record.does_not_expire) return "current";
  if (!record.expiry_date) return "missing";

  const days = daysUntil(record.expiry_date);

  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= 60) return "expiring";
  return "current";
}

function trainingStatusLabel(status: TrainingStatus) {
  if (status === "current") return "Current";
  if (status === "expiring") return "Expiring";
  if (status === "expired") return "Expired";
  if (status === "pending") return "Pending review";
  if (status === "revoked") return "Revoked";
  if (status === "superseded") return "Superseded";
  return "Missing expiry";
}

function trainingStatusClasses(status: TrainingStatus) {
  if (status === "current") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "expiring") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "pending") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "expired" || status === "revoked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function splitCodes(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function addMonths(dateValue: string, months: number | null) {
  if (!dateValue || !months) return "";

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}


function mapApiUser(user: ApiUser): LoginAccount | null {
  const userId = clean(user.user_id ?? user.id);
  if (!userId) return null;

  return {
    userId,
    email: clean(user.email) || "Email not available",
    linkedEmployeeId:
      clean(user.employee?.id) || clean(user.employee_id) || null,
    linkedEmployeeName:
      clean(user.employee?.full_name) || clean(user.employee_name) || null,
  };
}

export default function EmployeeProfilePage() {
  const params = useParams<{ employeeId: string }>();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const employeeId = params.employeeId;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loginAccounts, setLoginAccounts] = useState<LoginAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainingOptions, setTrainingOptions] = useState<TrainingOption[]>([]);
  const [trainingFields, setTrainingFields] = useState<CustomField[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [trainingDocuments, setTrainingDocuments] = useState<TrainingDocument[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingTraining, setRefreshingTraining] = useState(false);

  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [trainingUploadModalOpen, setTrainingUploadModalOpen] = useState(false);
  const [deletingTrainingRecordId, setDeletingTrainingRecordId] = useState("");
  const [editingTrainingRecord, setEditingTrainingRecord] =
    useState<TrainingRecord | null>(null);
  const [trainingSaving, setTrainingSaving] = useState(false);
  const [trainingForm, setTrainingForm] =
    useState<TrainingForm>(EMPTY_TRAINING_FORM);

  const [form, setForm] = useState<ProfileForm>({
    payrollId: "",
    fullName: "",
    role: "",
    crewId: "",
    active: true,
    notes: "",
    shirtSize: "",
    jacketSize: "",
    gloveSize: "",
    pantsSize: "",
    userId: "",
  });

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const selectedCrew = useMemo(
    () => crews.find((crew) => crew.id === employee?.crew_id) ?? null,
    [crews, employee?.crew_id],
  );

  const assignedProjects = useMemo(
    () => projects.filter((project) => projectIds.includes(project.id)),
    [projectIds, projects],
  );

  const availableLoginAccounts = useMemo(
    () =>
      loginAccounts.filter((account) => {
        if (account.userId === employee?.user_id) return true;
        return !account.linkedEmployeeId;
      }),
    [employee?.user_id, loginAccounts],
  );

  const activeTrainingRecords = useMemo(
    () =>
      trainingRecords.filter(
        (record) =>
          !record.deleted_at &&
          !record.superseded_at &&
          !record.revoked_at &&
          record.record_status !== "superseded" &&
          record.record_status !== "revoked",
      ),
    [trainingRecords],
  );

  const trainingDocumentsByRecord = useMemo(() => {
    const map = new Map<string, TrainingDocument[]>();

    trainingDocuments.forEach((document) => {
      if (document.active === false) return;
      const current = map.get(document.training_record_id) ?? [];
      current.push(document);
      map.set(document.training_record_id, current);
    });

    return map;
  }, [trainingDocuments]);

  const currentTrainingCount = activeTrainingRecords.filter(
    (record) => calculateTrainingStatus(record) === "current",
  ).length;

  const expiringTrainingCount = activeTrainingRecords.filter(
    (record) => calculateTrainingStatus(record) === "expiring",
  ).length;

  const expiredTrainingCount = activeTrainingRecords.filter(
    (record) => calculateTrainingStatus(record) === "expired",
  ).length;

  const missingDocumentCount = activeTrainingRecords.filter(
    (record) => (trainingDocumentsByRecord.get(record.id) ?? []).length === 0,
  ).length;

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      return fetch(input, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const loadLoginAccounts = useCallback(async () => {
    const response = await apiFetch("/api/admin/users");
    const payload = (await response.json()) as UsersResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load login accounts.");
    }

    setLoginAccounts(
      (payload.users ?? [])
        .map(mapApiUser)
        .filter((account): account is LoginAccount => Boolean(account))
        .sort((a, b) => a.email.localeCompare(b.email)),
    );
  }, [apiFetch]);

  const loadData = useCallback(async () => {
    const employeeResult = await supabase
      .from("employees")
      .select(
        "id, payroll_id, full_name, role, crew_id, active, user_id, notes, shirt_size, jacket_size, glove_size, pants_size, created_at",
      )
      .eq("id", employeeId)
      .single();

    if (employeeResult.error || !employeeResult.data) {
      throw new Error(
        employeeResult.error?.message || "Employee profile not found.",
      );
    }

    const loadedEmployee = employeeResult.data as Employee;

    try {
      await loadLoginAccounts();
    } catch (error) {
      console.warn("Login accounts could not be loaded", error);
      setLoginAccounts([]);
    }

    const [
      crewResult,
      projectResult,
      trainingTypeResult,
      trainingOptionResult,
      trainingFieldResult,
      trainingRecordResult,
    ] = await Promise.all([
      supabase
        .from("crews")
        .select("id, crew_number, crew_name, leading_hand, active")
        .order("crew_number", { ascending: true }),
      supabase
        .from("projects")
        .select("id, name, project_number, status")
        .order("name", { ascending: true }),
      supabase
        .from("training_types")
        .select(
          "id, category_id, name, short_code, category, record_kind, default_expiry_months, allows_no_expiry, requires_issue_date, requires_expiry_date, requires_certificate_number, supports_class_codes, supports_provider, active, validity_mode, validity_interval_value, validity_interval_unit, requires_issuer, requires_project, requires_document, document_upload_type, allows_multiple_current, subtype_mode, requires_review, allowed_extensions, max_file_size_mb",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("training_type_options")
        .select(
          "id, training_type_id, name, code, description, active, sort_order",
        )
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("training_type_fields")
        .select(
          "id, training_type_id, field_key, label, field_type, required, options, placeholder, help_text, active, sort_order",
        )
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("employee_training_records")
        .select(
          "id, employee_id, training_type_id, training_name, training_short_code, category, record_kind, certificate_number, class_codes, option_codes, provider, issuing_authority, issue_date, expiry_date, does_not_expire, record_status, notes, supersedes_record_id, superseded_at, revoked_at, revoked_reason, workflow_status, current_version, project_id, deleted_at, deleted_by_user_id, deleted_reason, created_at",
        )
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false }),
    ]);

    if (crewResult.error) throw new Error(crewResult.error.message);
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (trainingTypeResult.error) {
      throw new Error(trainingTypeResult.error.message);
    }
    if (trainingOptionResult.error) {
      throw new Error(trainingOptionResult.error.message);
    }
    if (trainingFieldResult.error) {
      throw new Error(trainingFieldResult.error.message);
    }
    if (trainingRecordResult.error) {
      throw new Error(trainingRecordResult.error.message);
    }

    const loadedTrainingRecords =
      (trainingRecordResult.data ?? []) as TrainingRecord[];

    const recordIds = loadedTrainingRecords.map((record) => record.id);
    let loadedDocuments: TrainingDocument[] = [];

    if (recordIds.length > 0) {
      const documentResult = await supabase
        .from("employee_training_documents")
        .select(
          "id, training_record_id, document_type_name, document_type_code, document_side, generated_file_name, sharepoint_web_url, active, created_at",
        )
        .in("training_record_id", recordIds)
        .order("created_at", { ascending: true });

      if (documentResult.error) throw new Error(documentResult.error.message);
      loadedDocuments =
        (documentResult.data ?? []) as TrainingDocument[];
    }

    let loadedProjectIds: string[] = [];

    if (loadedEmployee.user_id) {
      const accessResult = await supabase
        .from("project_access")
        .select("project_id")
        .eq("user_id", loadedEmployee.user_id);

      if (!accessResult.error) {
        loadedProjectIds = (
          (accessResult.data ?? []) as ProjectAccessRow[]
        ).map((row) => row.project_id);
      }
    }

    setEmployee(loadedEmployee);
    setCrews((crewResult.data ?? []) as Crew[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setProjectIds(loadedProjectIds);
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setTrainingOptions((trainingOptionResult.data ?? []) as TrainingOption[]);
    setTrainingFields((trainingFieldResult.data ?? []) as CustomField[]);
    setTrainingRecords(loadedTrainingRecords);
    setTrainingDocuments(loadedDocuments);

    setForm({
      payrollId: clean(loadedEmployee.payroll_id),
      fullName: clean(loadedEmployee.full_name),
      role: clean(loadedEmployee.role),
      crewId: clean(loadedEmployee.crew_id),
      active: loadedEmployee.active !== false,
      notes: clean(loadedEmployee.notes),
      shirtSize: clean(loadedEmployee.shirt_size),
      jacketSize: clean(loadedEmployee.jacket_size),
      gloveSize: clean(loadedEmployee.glove_size),
      pantsSize: clean(loadedEmployee.pants_size),
      userId: clean(loadedEmployee.user_id),
    });
  }, [employeeId, loadLoginAccounts, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadData();
        } catch (error) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Unable to load the employee profile.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  function cancelEdit() {
    if (!employee) return;

    setForm({
      payrollId: clean(employee.payroll_id),
      fullName: clean(employee.full_name),
      role: clean(employee.role),
      crewId: clean(employee.crew_id),
      active: employee.active !== false,
      notes: clean(employee.notes),
      shirtSize: clean(employee.shirt_size),
      jacketSize: clean(employee.jacket_size),
      gloveSize: clean(employee.glove_size),
      pantsSize: clean(employee.pants_size),
      userId: clean(employee.user_id),
    });
    setEditing(false);
  }

  async function saveProfile() {
    if (!employee) return;

    const payrollId = form.payrollId.trim().toUpperCase();
    const fullName = form.fullName.trim();

    if (!payrollId) {
      setMessage({
        tone: "error",
        text: "Enter the payroll ID used in your other business systems.",
      });
      return;
    }

    if (!fullName) {
      setMessage({ tone: "error", text: "Enter the person's full name." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("employees")
        .update({
          payroll_id: payrollId,
          full_name: fullName,
          role: form.role.trim() || null,
          crew_id: form.crewId || null,
          active: form.active,
          notes: form.notes.trim() || null,
          shirt_size: form.shirtSize || null,
          jacket_size: form.jacketSize || null,
          glove_size: form.gloveSize || null,
          pants_size: form.pantsSize.trim() || null,
          user_id: form.userId || null,
        })
        .eq("id", employee.id);

      if (error) throw new Error(error.message);

      await loadData();
      setEditing(false);
      setMessage({
        tone: "success",
        text: "Employee profile updated successfully.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the employee profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function refreshTraining() {
    setRefreshingTraining(true);
    setMessage(null);

    try {
      await loadData();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh training records.",
      });
    } finally {
      setRefreshingTraining(false);
    }
  }


  async function deleteTrainingRecord(record: TrainingRecord) {
    const reason = window.prompt(
      `Delete ${record.training_name}?\n\nUse this only for a duplicate or incorrectly created record. Enter the reason for deletion:`,
      "Duplicate record",
    );

    if (reason === null) return;
    if (!reason.trim()) {
      setMessage({ tone: "error", text: "Enter a reason before deleting the Training record." });
      return;
    }

    if (
      !window.confirm(
        `Delete ${record.training_name} from ${employee?.full_name ?? "this employee"}?\n\nThe record will disappear from the employee profile and active Training registers. Linked incorrect evidence will also be removed through the controlled Training workflow.`,
      )
    ) {
      return;
    }

    setDeletingTrainingRecordId(record.id);
    setMessage(null);

    try {
      const response = await apiFetch(`/api/training/records/${record.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      const responseText = await response.text();
      let payload: { error?: string; warning?: string | null } | null = null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            error?: string;
            warning?: string | null;
          };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        throw new Error(
          clean(payload?.error) ||
            clean(responseText) ||
            "Unable to delete the Training record.",
        );
      }

      await loadData();
      setMessage({
        tone: payload?.warning ? "error" : "success",
        text: payload?.warning
          ? `Training record removed. ${payload.warning}`
          : "Training record removed from the employee profile.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to delete the Training record.",
      });
    } finally {
      setDeletingTrainingRecordId("");
    }
  }

  function openAddTraining() {
    setTrainingUploadModalOpen(true);
    setMessage(null);
  }

  function openEditTraining(record: TrainingRecord) {
    setEditingTrainingRecord(record);
    setTrainingForm({
      trainingTypeId: clean(record.training_type_id),
      trainingName: clean(record.training_name),
      category: clean(record.category),
      certificateNumber: clean(record.certificate_number),
      classCodes: (record.class_codes ?? []).join(", "),
      provider: clean(record.provider),
      issueDate: clean(record.issue_date),
      expiryDate: clean(record.expiry_date),
      doesNotExpire: Boolean(record.does_not_expire),
      notes: clean(record.notes),
    });
    setTrainingModalOpen(true);
    setMessage(null);
  }

  function applyTrainingType(trainingTypeId: string) {
    const selected = trainingTypes.find((type) => type.id === trainingTypeId);

    setTrainingForm((current) => ({
      ...current,
      trainingTypeId,
      trainingName: selected?.name ?? current.trainingName,
      category: selected?.category ?? current.category,
      doesNotExpire: Boolean(selected?.allows_no_expiry && current.doesNotExpire),
      expiryDate:
        current.issueDate && selected?.default_expiry_months
          ? addMonths(current.issueDate, selected.default_expiry_months)
          : current.expiryDate,
    }));
  }

  function updateTrainingIssueDate(issueDate: string) {
    const selected = trainingTypes.find(
      (type) => type.id === trainingForm.trainingTypeId,
    );

    setTrainingForm((current) => ({
      ...current,
      issueDate,
      expiryDate:
        !current.doesNotExpire && selected?.default_expiry_months
          ? addMonths(issueDate, selected.default_expiry_months)
          : current.expiryDate,
    }));
  }

  async function saveTrainingRecord() {
    if (!employee) return;

    const selected = trainingTypes.find(
      (type) => type.id === trainingForm.trainingTypeId,
    );

    if (!trainingForm.trainingName.trim()) {
      setMessage({
        tone: "error",
        text: "Enter or select a licence, certificate or training type.",
      });
      return;
    }

    if (selected?.requires_issue_date && !trainingForm.issueDate) {
      setMessage({ tone: "error", text: "Issue date is required." });
      return;
    }

    if (
      selected?.requires_expiry_date &&
      !trainingForm.doesNotExpire &&
      !trainingForm.expiryDate
    ) {
      setMessage({ tone: "error", text: "Expiry date is required." });
      return;
    }

    if (
      selected?.requires_certificate_number &&
      !trainingForm.certificateNumber.trim()
    ) {
      setMessage({
        tone: "error",
        text: "Certificate or licence number is required.",
      });
      return;
    }

    setTrainingSaving(true);
    setMessage(null);

    try {
      const payload = {
        employee_id: employee.id,
        training_type_id: trainingForm.trainingTypeId || null,
        training_name: trainingForm.trainingName.trim(),
        training_short_code: selected?.short_code ?? null,
        category: trainingForm.category.trim() || null,
        record_kind: selected?.record_kind ?? "other",
        certificate_number:
          trainingForm.certificateNumber.trim() || null,
        class_codes: splitCodes(trainingForm.classCodes),
        provider: trainingForm.provider.trim() || null,
        issuing_authority: null,
        issue_date: trainingForm.issueDate || null,
        expiry_date: trainingForm.doesNotExpire
          ? null
          : trainingForm.expiryDate || null,
        does_not_expire: trainingForm.doesNotExpire,
        record_status: "active",
        notes: trainingForm.notes.trim() || null,
      };

      const result = editingTrainingRecord
        ? await supabase
            .from("employee_training_records")
            .update(payload)
            .eq("id", editingTrainingRecord.id)
        : await supabase.from("employee_training_records").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setTrainingModalOpen(false);
      setEditingTrainingRecord(null);
      setTrainingForm(EMPTY_TRAINING_FORM);
      setMessage({
        tone: "success",
        text: editingTrainingRecord
          ? "Training record updated."
          : "Training record added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the training record.",
      });
    } finally {
      setTrainingSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={28} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  if (!employee) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
            <X size={30} className="mx-auto text-rose-500" />
            <h1 className="mt-4 text-2xl font-bold text-rose-900">
              Employee not found
            </h1>
            <p className="mt-2 text-sm text-rose-700">
              The employee profile could not be loaded.
            </p>
            <Link
              href="/people"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <ArrowLeft size={16} />
              Back to People
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const ppeComplete = hasCompletePpe(employee);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/people"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to People
              </Link>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-white">
                  {employee.full_name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("") || "P"}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                      {employee.full_name}
                    </h1>
                    <StatusBadge active={employee.active !== false} />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Payroll ID: {employee.payroll_id || "Not set"}
                    </span>
                    <span className="text-sm text-slate-500">
                      {employee.role || "Position not set"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <X size={16} />
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveProfile()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} />
                    )}
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Edit3 size={16} />
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </section>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {message.tone === "success" ? (
                <CheckCircle2 size={17} />
              ) : (
                <X size={17} />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            icon={<UsersRound size={20} />}
            label="Crew"
            value={crewLabel(selectedCrew)}
            detail={
              selectedCrew?.leading_hand
                ? `Leading hand: ${selectedCrew.leading_hand}`
                : "No leading hand recorded"
            }
          />
          <SummaryCard
            icon={
              employee.user_id ? (
                <UserCheck size={20} />
              ) : (
                <UserRoundX size={20} />
              )
            }
            label="Login"
            value={employee.user_id ? "Linked" : "Not linked"}
            detail={
              employee.user_id
                ? "Mobile account linked"
                : "Link in Edit Profile"
            }
          />
          <SummaryCard
            icon={<FolderKanban size={20} />}
            label="Projects"
            value={String(assignedProjects.length)}
            detail="Access follows the linked login"
          />
          <SummaryCard
            icon={<Shirt size={20} />}
            label="PPE"
            value={ppeComplete ? "Complete" : "Incomplete"}
            detail="Operational sizing only"
          />
          <SummaryCard
            icon={<ShieldCheck size={20} />}
            label="Training"
            value={String(activeTrainingRecords.length)}
            detail={`${expiringTrainingCount} expiring · ${expiredTrainingCount} expired`}
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 px-4 pt-4">
            <TabButton
              active={activeTab === "overview"}
              label="Overview"
              onClick={() => setActiveTab("overview")}
            />
            <TabButton
              active={activeTab === "training"}
              label={`Training (${activeTrainingRecords.length})`}
              onClick={() => setActiveTab("training")}
            />
            <TabButton
              active={activeTab === "ppe"}
              label="PPE"
              onClick={() => setActiveTab("ppe")}
            />
            <TabButton
              active={activeTab === "projects"}
              label="Projects"
              onClick={() => setActiveTab("projects")}
            />
            <TabButton
              active={activeTab === "history"}
              label="History"
              onClick={() => setActiveTab("history")}
            />
          </div>

          <div className="p-6">
            {activeTab === "overview" ? (
              <OverviewTab
                employee={employee}
                crews={crews}
                editing={editing}
                form={form}
                setForm={setForm}
                availableLoginAccounts={availableLoginAccounts}
              />
            ) : null}

            {activeTab === "training" ? (
              <TrainingTab
                records={activeTrainingRecords}
                documentsByRecord={trainingDocumentsByRecord}
                currentCount={currentTrainingCount}
                expiringCount={expiringTrainingCount}
                expiredCount={expiredTrainingCount}
                missingDocumentCount={missingDocumentCount}
                refreshing={refreshingTraining}
                onRefresh={() => void refreshTraining()}
                onAdd={openAddTraining}
                onEdit={openEditTraining}
                onDelete={(record) => void deleteTrainingRecord(record)}
                deletingRecordId={deletingTrainingRecordId}
              />
            ) : null}

            {activeTab === "ppe" ? (
              <PpeTab editing={editing} form={form} setForm={setForm} />
            ) : null}

            {activeTab === "projects" ? (
              <ProjectsTab
                projects={assignedProjects}
                loginLinked={Boolean(employee.user_id)}
              />
            ) : null}

            {activeTab === "history" ? (
              <HistoryTab
                employee={employee}
                trainingRecords={trainingRecords}
              />
            ) : null}
          </div>
        </section>
      </div>

      {trainingUploadModalOpen ? (
        <TrainingUploadModal
          employee={employee}
          projects={projects}
          trainingTypes={trainingTypes.filter((type) => type.active !== false)}
          trainingOptions={trainingOptions}
          trainingFields={trainingFields}
          existingRecords={activeTrainingRecords}
          apiFetch={apiFetch}
          onClose={() => setTrainingUploadModalOpen(false)}
          onSuccess={async (messageText) => {
            await loadData();
            setTrainingUploadModalOpen(false);
            setMessage({ tone: "success", text: messageText });
          }}
        />
      ) : null}

      {trainingModalOpen ? (
        <TrainingRecordModal
          form={trainingForm}
          setForm={setTrainingForm}
          editingRecord={editingTrainingRecord}
          trainingTypes={trainingTypes.filter(
            (type) =>
              type.active !== false ||
              type.id === trainingForm.trainingTypeId,
          )}
          saving={trainingSaving}
          onTrainingTypeChange={applyTrainingType}
          onIssueDateChange={updateTrainingIssueDate}
          onClose={() => {
            if (trainingSaving) return;
            setTrainingModalOpen(false);
            setEditingTrainingRecord(null);
            setTrainingForm(EMPTY_TRAINING_FORM);
          }}
          onSave={() => void saveTrainingRecord()}
        />
      ) : null}
    </AppShell>
  );
}

function TrainingTab({
  records,
  documentsByRecord,
  currentCount,
  expiringCount,
  expiredCount,
  missingDocumentCount,
  refreshing,
  onRefresh,
  onAdd,
  onEdit,
  onDelete,
  deletingRecordId,
}: {
  records: TrainingRecord[];
  documentsByRecord: Map<string, TrainingDocument[]>;
  currentCount: number;
  expiringCount: number;
  expiredCount: number;
  missingDocumentCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (record: TrainingRecord) => void;
  onDelete: (record: TrainingRecord) => void;
  deletingRecordId: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Training, Licences & Certificates
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Current records, expiry dates, class codes and SharePoint document
            references for this employee.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/people/training"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ShieldCheck size={16} />
            Company Register
          </Link>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add Record
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrainingMetric
          label="Current"
          value={currentCount}
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
        />
        <TrainingMetric
          label="Expiring"
          value={expiringCount}
          icon={<CalendarClock size={18} />}
          tone={expiringCount > 0 ? "amber" : "slate"}
        />
        <TrainingMetric
          label="Expired"
          value={expiredCount}
          icon={<AlertTriangle size={18} />}
          tone={expiredCount > 0 ? "rose" : "slate"}
        />
        <TrainingMetric
          label="Missing documents"
          value={missingDocumentCount}
          icon={<FileText size={18} />}
          tone={missingDocumentCount > 0 ? "amber" : "slate"}
        />
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <ShieldCheck size={30} className="mx-auto text-slate-400" />
          <h3 className="mt-4 text-lg font-bold text-slate-900">
            No training records
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Add the employee&apos;s first licence, VOC, certificate or induction.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={16} />
            Add Training Record
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const status = calculateTrainingStatus(record);
            const documents = documentsByRecord.get(record.id) ?? [];
            const remaining = record.does_not_expire
              ? null
              : daysUntil(record.expiry_date);

            return (
              <div
                key={record.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1fr)_auto] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-950">
                        {record.training_name}
                      </h3>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${trainingStatusClasses(
                          status,
                        )}`}
                      >
                        {trainingStatusLabel(status)}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {record.category || "Uncategorised"}
                    </p>

                    {record.class_codes?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {record.class_codes.map((code) => (
                          <span
                            key={`${record.id}-${code}`}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Number
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {record.certificate_number || "Not set"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Expiry
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {record.does_not_expire
                        ? "Does not expire"
                        : formatDate(record.expiry_date)}
                    </div>
                    {!record.does_not_expire && remaining !== null ? (
                      <div
                        className={`mt-1 text-xs font-medium ${
                          remaining < 0
                            ? "text-rose-600"
                            : remaining <= 60
                              ? "text-amber-700"
                              : "text-slate-400"
                        }`}
                      >
                        {remaining < 0
                          ? `${Math.abs(remaining)} days overdue`
                          : `${remaining} days remaining`}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Documents
                    </div>
                    {documents.length === 0 ? (
                      <div className="mt-1 text-sm font-semibold text-amber-700">
                        No document linked
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {documents.map((document) =>
                          document.sharepoint_web_url ? (
                            <a
                              key={document.id}
                              href={document.sharepoint_web_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              <ExternalLink size={13} />
                              {document.document_type_name}
                            </a>
                          ) : (
                            <span
                              key={document.id}
                              className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                            >
                              {document.document_type_name}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(record)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 size={15} />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => onDelete(record)}
                      disabled={deletingRecordId === record.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {deletingRecordId === record.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                      Delete
                    </button>
                  </div>
                </div>

                {record.notes ? (
                  <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-600">
                    {record.notes}
                  </div>
                ) : null}

                {status === "revoked" && record.revoked_reason ? (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                    Revoked: {record.revoked_reason}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        SharePoint uploads are not enabled yet. The page already reads linked
        document metadata from <strong>employee_training_documents</strong>, so
        the upload integration can be added later without redesigning this
        profile.
      </div>
    </div>
  );
}


function TrainingUploadModal({
  employee,
  projects,
  trainingTypes,
  trainingOptions,
  trainingFields,
  existingRecords,
  apiFetch,
  onClose,
  onSuccess,
}: {
  employee: Employee;
  projects: Project[];
  trainingTypes: TrainingType[];
  trainingOptions: TrainingOption[];
  trainingFields: CustomField[];
  existingRecords: TrainingRecord[];
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSuccess: (message: string) => Promise<void> | void;
}) {
  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [flexibleEvidenceMode, setFlexibleEvidenceMode] = useState<"single" | "front_back">("single");
  const [replaceChoice, setReplaceChoice] = useState<"replace" | "add" | "">("");
  const [replaceRecordId, setReplaceRecordId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const selectedType = useMemo(
    () => trainingTypes.find((type) => type.id === trainingTypeId) ?? null,
    [trainingTypeId, trainingTypes],
  );

  const typeOptions = useMemo(
    () =>
      trainingOptions
        .filter(
          (option) =>
            option.training_type_id === trainingTypeId && option.active !== false,
        )
        .sort(
          (a, b) =>
            Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100) ||
            a.name.localeCompare(b.name),
        ),
    [trainingOptions, trainingTypeId],
  );

  const typeFields = useMemo(
    () =>
      trainingFields
        .filter(
          (field) =>
            field.training_type_id === trainingTypeId && field.active !== false,
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [trainingFields, trainingTypeId],
  );

  const selectedOptions = useMemo(
    () => typeOptions.filter((option) => selectedOptionIds.includes(option.id)),
    [selectedOptionIds, typeOptions],
  );

  const sameTypeRecords = useMemo(
    () =>
      existingRecords.filter(
        (record) =>
          record.training_type_id === trainingTypeId &&
          !record.deleted_at &&
          !record.superseded_at &&
          !record.revoked_at &&
          record.current_version !== false,
      ),
    [existingRecords, trainingTypeId],
  );

  useEffect(() => {
    setSelectedOptionIds([]);
    setProjectId("");
    setIssuer("");
    setCertificateNumber("");
    setIssueDate("");
    setExpiryDate("");
    setNotes("");
    setMetadata({});
    setSingleFile(null);
    setFrontFile(null);
    setBackFile(null);
    setFlexibleEvidenceMode("single");
    setReplaceChoice("");
    setReplaceRecordId("");
    setLocalMessage(null);
  }, [trainingTypeId]);

  useEffect(() => {
    if (!selectedType || sameTypeRecords.length === 0) return;

    if (selectedType.allows_multiple_current === false) {
      setReplaceChoice("replace");
      if (sameTypeRecords.length === 1) setReplaceRecordId(sameTypeRecords[0].id);
    }
  }, [sameTypeRecords, selectedType]);

  function updateIssueDate(value: string) {
    setIssueDate(value);
    if (!selectedType) return;

    const configured = configuredExpiryDate(value, selectedType);
    if (configured) setExpiryDate(configured);
    if (clean(selectedType.validity_mode) === "never") setExpiryDate("");
  }

  function customFieldMissing(field: CustomField) {
    const value = metadata[field.field_key];
    return (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (field.field_type === "checkbox" && value !== true)
    );
  }

  function validate() {
    if (!selectedType) return "Select the Training Type.";

    if (selectedType.requires_project && !projectId) {
      return "Select the project.";
    }

    if (selectedType.requires_issuer && !issuer.trim()) {
      return "Enter the provider / issuing organisation.";
    }

    if (selectedType.requires_certificate_number && !certificateNumber.trim()) {
      return "Enter the certificate or licence number.";
    }

    if (selectedType.requires_issue_date && !issueDate) {
      return "Enter the issue date.";
    }

    if (
      clean(selectedType.validity_mode) !== "never" &&
      selectedType.requires_expiry_date &&
      !expiryDate
    ) {
      return "Enter the expiry date.";
    }

    if (selectedType.subtype_mode === "single" && typeOptions.length > 0 && selectedOptionIds.length !== 1) {
      return "Select one class / endorsement.";
    }

    for (const field of typeFields) {
      if (field.required && customFieldMissing(field)) {
        return `Enter ${field.label}.`;
      }
    }

    if (selectedType.requires_document) {
      if (selectedType.document_upload_type === "front_back") {
        if (!frontFile || !backFile) return "Upload both the front and back files.";
      } else if (selectedType.document_upload_type === "single_or_front_back") {
        if (flexibleEvidenceMode === "front_back") {
          if (!frontFile || !backFile) return "Upload both the front and back files.";
        } else if (!singleFile) {
          return "Upload the complete certificate / licence evidence.";
        }
      } else if (!singleFile) {
        return "Upload the required certificate / licence evidence.";
      }
    }

    if (sameTypeRecords.length > 0) {
      if (!replaceChoice) {
        return "Choose whether this replaces a current record or is another current record.";
      }
      if (replaceChoice === "replace" && !replaceRecordId) {
        return "Select the current record being replaced.";
      }
      if (replaceChoice === "add" && selectedType.allows_multiple_current === false) {
        return "This Training Type does not allow multiple current records.";
      }
    }

    return null;
  }

  async function submit() {
    const validation = validate();
    if (validation) {
      setLocalMessage({ tone: "error", text: validation });
      return;
    }

    if (!selectedType) return;

    setSubmitting(true);
    setLocalMessage(null);

    try {
      const form = new FormData();
      form.set("employeeId", employee.id);
      form.set("trainingTypeId", selectedType.id);
      form.set("projectId", projectId);
      form.set("issuer", issuer.trim());
      form.set("certificateNumber", certificateNumber.trim());
      form.set("issueDate", issueDate);
      form.set("expiryDate", expiryDate);
      form.set("notes", notes.trim());
      form.set("metadata", JSON.stringify(metadata));
      form.set("selectedOptionIds", JSON.stringify(selectedOptionIds));
      form.set(
        "selectedOptionCodes",
        JSON.stringify(selectedOptions.map((option) => option.code)),
      );
      form.set(
        "documentUploadType",
        selectedType.document_upload_type === "single_or_front_back"
          ? flexibleEvidenceMode
          : selectedType.document_upload_type || "single",
      );
      form.set("replacementMode", replaceChoice || "none");
      form.set("supersedesRecordId", replaceRecordId);
      form.set("source", "website_admin");

      const [preparedSingleFile, preparedFrontFile, preparedBackFile] =
        await Promise.all([
          singleFile ? prepareTrainingUploadFile(singleFile) : null,
          frontFile ? prepareTrainingUploadFile(frontFile) : null,
          backFile ? prepareTrainingUploadFile(backFile) : null,
        ]);

      const preparedFiles = [
        preparedSingleFile,
        preparedFrontFile,
        preparedBackFile,
      ].filter((item): item is File => Boolean(item));

      const requestFileBytes = preparedFiles.reduce(
        (total, item) => total + item.size,
        0,
      );

      if (requestFileBytes > TRAINING_REQUEST_SAFE_BYTES) {
        throw new Error(
          `The selected evidence is still ${(requestFileBytes / 1024 / 1024).toFixed(
            1,
          )} MB after photo compression. Use a smaller PDF or split the evidence before uploading.`,
        );
      }

      if (preparedSingleFile) form.set("file", preparedSingleFile);
      if (preparedFrontFile) form.set("frontFile", preparedFrontFile);
      if (preparedBackFile) form.set("backFile", preparedBackFile);

      const response = await apiFetch("/api/training/records/upload", {
        method: "POST",
        body: form,
      });

      const responseText = await response.text();
      let result: {
        error?: string;
        workflowStatus?: string;
        notificationWarning?: string | null;
      } | null = null;

      if (responseText) {
        try {
          result = JSON.parse(responseText) as {
            error?: string;
            workflowStatus?: string;
            notificationWarning?: string | null;
          };
        } catch {
          result = null;
        }
      }

      if (!response.ok) {
        throw new Error(
          clean(result?.error) ||
            (clean(responseText) && !clean(responseText).startsWith("<")
              ? `Upload failed (${response.status}): ${clean(responseText).slice(0, 500)}`
              : `Upload failed (${response.status} ${response.statusText}).`),
        );
      }

      const baseMessage =
        result?.workflowStatus === "approved"
          ? `${selectedType.name} added for ${employee.full_name} and published through the Training workflow.`
          : `${selectedType.name} submitted for ${employee.full_name} and is waiting for Training review.`;

      await onSuccess(
        result?.notificationWarning
          ? `${baseMessage} ${result.notificationWarning}`
          : baseMessage,
      );
    } catch (error) {
      setLocalMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Training record could not be uploaded.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const evidenceType = clean(selectedType?.document_upload_type) || "single";
  const acceptedExtensions = selectedType?.allowed_extensions?.length
    ? selectedType.allowed_extensions.map((item) => `.${clean(item).replace(/^\./, "")}`).join(",")
    : "application/pdf,image/*";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.12em] text-blue-600">
              {employee.full_name}
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Add Training Record
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Add the record directly to this employee using the same configured Training workflow, evidence rules and SharePoint publishing process as the main Training upload page.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[82vh] space-y-6 overflow-y-auto p-6">
          {localMessage ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                localMessage.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {localMessage.text}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <UploadField label="Training Type" required>
              <SelectField
                value={trainingTypeId}
                onChange={setTrainingTypeId}
                options={[
                  { value: "", label: "Select Training Type..." },
                  ...trainingTypes.map((type) => ({
                    value: type.id,
                    label: `${type.name}${type.short_code ? ` (${type.short_code})` : ""}`,
                  })),
                ]}
              />
            </UploadField>

            {selectedType?.requires_project ? (
              <UploadField label="Project" required>
                <SelectField
                  value={projectId}
                  onChange={setProjectId}
                  options={[
                    { value: "", label: "Select project..." },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: `${project.project_number ? `${project.project_number} · ` : ""}${project.name}`,
                    })),
                  ]}
                />
              </UploadField>
            ) : null}

            {selectedType?.requires_issuer || selectedType?.supports_provider ? (
              <UploadField
                label="Provider / Issuing Organisation"
                required={selectedType.requires_issuer === true}
              >
                <input
                  value={issuer}
                  onChange={(event) => setIssuer(event.target.value)}
                  className={trainingInputClass}
                  placeholder="Training provider or issuing authority"
                />
              </UploadField>
            ) : null}

            {selectedType?.requires_certificate_number ? (
              <UploadField label="Certificate / Licence Number" required>
                <input
                  value={certificateNumber}
                  onChange={(event) => setCertificateNumber(event.target.value)}
                  className={trainingInputClass}
                  placeholder="Enter number"
                />
              </UploadField>
            ) : null}

            {selectedType?.requires_issue_date ? (
              <UploadField label="Issue Date" required>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(event) => updateIssueDate(event.target.value)}
                  className={trainingInputClass}
                />
              </UploadField>
            ) : null}

            {selectedType && clean(selectedType.validity_mode) !== "never" ? (
              <UploadField
                label="Expiry Date"
                required={selectedType.requires_expiry_date === true}
              >
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                  className={trainingInputClass}
                />
              </UploadField>
            ) : null}
          </div>

          {selectedType && typeOptions.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="font-bold text-slate-900">Classes / Endorsements</div>
              <p className="mt-1 text-xs text-slate-500">
                These options come from the configured Training Type, so HRWL and Driver Licence classes stay consistent across TTTracker.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {typeOptions.map((option) => {
                  const checked = selectedOptionIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedOptionIds((current) => {
                          if (selectedType.subtype_mode === "single") {
                            return checked ? [] : [option.id];
                          }
                          return checked
                            ? current.filter((id) => id !== option.id)
                            : [...current, option.id];
                        });
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                        checked
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {option.code ? `${option.code} · ` : ""}{option.name}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {typeFields.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="font-bold text-slate-900">Configured Details</div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {typeFields.map((field) => (
                  <TrainingDynamicField
                    key={field.id}
                    field={field}
                    value={metadata[field.field_key]}
                    onChange={(value) =>
                      setMetadata((current) => ({
                        ...current,
                        [field.field_key]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          ) : null}

          {selectedType?.requires_document ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex items-center gap-2 font-bold text-blue-950">
                <Paperclip size={18} />
                Evidence / Attachments
              </div>
              <p className="mt-1 text-xs leading-5 text-blue-800">
                Photos are automatically compressed before upload. The approved evidence continues through the existing Training SharePoint workflow.
              </p>

              {evidenceType === "single_or_front_back" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFlexibleEvidenceMode("single")}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      flexibleEvidenceMode === "single"
                        ? "bg-blue-700 text-white"
                        : "border border-blue-200 bg-white text-blue-800"
                    }`}
                  >
                    Single / Combined File
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlexibleEvidenceMode("front_back")}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      flexibleEvidenceMode === "front_back"
                        ? "bg-blue-700 text-white"
                        : "border border-blue-200 bg-white text-blue-800"
                    }`}
                  >
                    Front + Back
                  </button>
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {evidenceType === "front_back" ||
                (evidenceType === "single_or_front_back" && flexibleEvidenceMode === "front_back") ? (
                  <>
                    <TrainingFileInput
                      label="Front"
                      file={frontFile}
                      accept={acceptedExtensions}
                      onChange={setFrontFile}
                    />
                    <TrainingFileInput
                      label="Back"
                      file={backFile}
                      accept={acceptedExtensions}
                      onChange={setBackFile}
                    />
                  </>
                ) : (
                  <div className="md:col-span-2">
                    <TrainingFileInput
                      label="Certificate / Licence Evidence"
                      file={singleFile}
                      accept={acceptedExtensions}
                      onChange={setSingleFile}
                    />
                  </div>
                )}
              </div>
            </section>
          ) : selectedType ? (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              This Training Type does not require an attachment.
            </section>
          ) : null}

          {selectedType && sameTypeRecords.length > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="font-bold text-amber-950">Existing current record found</div>
              <p className="mt-1 text-sm text-amber-800">
                Choose whether this upload replaces an existing record or is another current record.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setReplaceChoice("replace")}
                  className={`rounded-xl px-3 py-2 text-sm font-bold ${
                    replaceChoice === "replace"
                      ? "bg-amber-700 text-white"
                      : "border border-amber-200 bg-white text-amber-900"
                  }`}
                >
                  Replace Current
                </button>

                {selectedType.allows_multiple_current !== false ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceChoice("add");
                      setReplaceRecordId("");
                    }}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      replaceChoice === "add"
                        ? "bg-amber-700 text-white"
                        : "border border-amber-200 bg-white text-amber-900"
                    }`}
                  >
                    Add Another Current Record
                  </button>
                ) : null}
              </div>

              {replaceChoice === "replace" ? (
                <div className="mt-4">
                  <UploadField label="Record being replaced" required>
                    <SelectField
                      value={replaceRecordId}
                      onChange={setReplaceRecordId}
                      options={[
                        { value: "", label: "Select current record..." },
                        ...sameTypeRecords.map((record) => ({
                          value: record.id,
                          label: `${record.certificate_number || record.training_name} · ${
                            record.expiry_date ? formatDate(record.expiry_date) : "No expiry"
                          }`,
                        })),
                      ]}
                    />
                  </UploadField>
                </div>
              ) : null}
            </section>
          ) : null}

          {selectedType ? (
            <UploadField label="Notes">
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Operational Training notes"
                className={`${trainingInputClass} resize-none`}
              />
            </UploadField>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !selectedType}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              {submitting ? "Uploading..." : "Add Training Record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const trainingInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2";

function UploadField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function TrainingFileInput({
  label,
  file,
  accept,
  onChange,
}: {
  label: string;
  file: File | null;
  accept: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block rounded-2xl border border-dashed border-blue-300 bg-white p-4">
      <div className="flex items-center gap-2 font-bold text-slate-900">
        <Upload size={16} />
        {label}
      </div>
      <input
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
      />
      {file ? (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
        </div>
      ) : null}
    </label>
  );
}

function TrainingDynamicField({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = fieldOptions(field.options);

  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 md:col-span-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 rounded border-slate-300"
        />
        <span className="text-sm font-black text-slate-800">
          {field.label}
          {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
        </span>
      </label>
    );
  }

  if (field.field_type === "select") {
    return (
      <UploadField label={field.label} required={field.required}>
        <select
          className={trainingInputClass}
          value={clean(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select...</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {field.help_text ? (
          <div className="mt-1 text-xs text-slate-500">{field.help_text}</div>
        ) : null}
      </UploadField>
    );
  }

  if (field.field_type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="md:col-span-2">
        <div className="mb-2 text-sm font-black text-slate-800">
          {field.label}
          {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const checked = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() =>
                  onChange(
                    checked
                      ? selected.filter((item) => item !== option)
                      : [...selected, option],
                  )
                }
                className={`rounded-xl border px-3 py-2 text-sm font-bold ${
                  checked
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
        {field.help_text ? (
          <div className="mt-1 text-xs text-slate-500">{field.help_text}</div>
        ) : null}
      </div>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <div className="md:col-span-2">
        <UploadField label={field.label} required={field.required}>
          <textarea
            rows={3}
            className={`${trainingInputClass} resize-none`}
            placeholder={field.placeholder ?? ""}
            value={clean(value)}
            onChange={(event) => onChange(event.target.value)}
          />
          {field.help_text ? (
            <div className="mt-1 text-xs text-slate-500">{field.help_text}</div>
          ) : null}
        </UploadField>
      </div>
    );
  }

  const type =
    field.field_type === "number"
      ? "number"
      : field.field_type === "date"
        ? "date"
        : "text";

  return (
    <UploadField label={field.label} required={field.required}>
      <input
        type={type}
        className={trainingInputClass}
        placeholder={field.placeholder ?? ""}
        value={clean(value)}
        onChange={(event) =>
          onChange(
            field.field_type === "number"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : event.target.value,
          )
        }
      />
      {field.help_text ? (
        <div className="mt-1 text-xs text-slate-500">{field.help_text}</div>
      ) : null}
    </UploadField>
  );
}

function TrainingRecordModal({
  form,
  setForm,
  editingRecord,
  trainingTypes,
  saving,
  onTrainingTypeChange,
  onIssueDateChange,
  onClose,
  onSave,
}: {
  form: TrainingForm;
  setForm: React.Dispatch<React.SetStateAction<TrainingForm>>;
  editingRecord: TrainingRecord | null;
  trainingTypes: TrainingType[];
  saving: boolean;
  onTrainingTypeChange: (trainingTypeId: string) => void;
  onIssueDateChange: (issueDate: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const selectedType = trainingTypes.find(
    (type) => type.id === form.trainingTypeId,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {editingRecord ? "Edit Training Record" : "Add Training Record"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record a licence, certificate, VOC, induction or competency.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-60"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Training type">
              <SelectField
                value={form.trainingTypeId}
                onChange={onTrainingTypeChange}
                options={[
                  { value: "", label: "Manual / other..." },
                  ...trainingTypes.map((type) => ({
                    value: type.id,
                    label: `${type.name}${
                      type.category ? ` — ${type.category}` : ""
                    }`,
                  })),
                ]}
              />
            </Field>

            <Field label="Licence / certificate name">
              <input
                value={form.trainingName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    trainingName: event.target.value,
                  }))
                }
                placeholder="e.g. High Risk Work Licence"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Category">
              <input
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                placeholder="e.g. VOC"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Certificate / licence number">
              <input
                value={form.certificateNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    certificateNumber: event.target.value,
                  }))
                }
                placeholder={
                  selectedType?.requires_certificate_number
                    ? "Required"
                    : "Optional"
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Classes / competencies">
              <input
                value={form.classCodes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    classCodes: event.target.value,
                  }))
                }
                placeholder="e.g. C2, DG, LF, RB"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Provider">
              <input
                value={form.provider}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    provider: event.target.value,
                  }))
                }
                placeholder="Training provider or issuing authority"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Issue date">
              <input
                type="date"
                value={form.issueDate}
                onChange={(event) => onIssueDateChange(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </Field>

            <Field label="Expiry date">
              <input
                type="date"
                value={form.expiryDate}
                disabled={form.doesNotExpire}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expiryDate: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-100"
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={form.doesNotExpire}
              disabled={
                Boolean(form.trainingTypeId) &&
                selectedType?.allows_no_expiry !== true
              }
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  doesNotExpire: event.target.checked,
                  expiryDate: event.target.checked
                    ? ""
                    : current.expiryDate,
                }))
              }
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-bold text-slate-900">
                Does not expire
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Available only where the selected training type allows it.
              </span>
            </span>
          </label>

          <Field label="Operational notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Operational notes only"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
            />
          </Field>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <FileText size={17} />
              Documents
            </div>
            <p className="mt-2 text-sm leading-6 text-blue-800">
              Evidence / attachments are added through the Add Record workflow on this employee profile. Existing record edits here only update the record details.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {editingRecord ? "Save Changes" : "Add Record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  employee,
  crews,
  editing,
  form,
  setForm,
  availableLoginAccounts,
}: {
  employee: Employee;
  crews: Crew[];
  editing: boolean;
  form: ProfileForm;
  setForm: React.Dispatch<React.SetStateAction<ProfileForm>>;
  availableLoginAccounts: LoginAccount[];
}) {
  if (!editing) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <InfoSection title="Operational Profile" icon={<HardHat size={19} />}>
          <InfoRow
            label="Payroll ID"
            value={employee.payroll_id || "Not set"}
          />
          <InfoRow label="Full name" value={employee.full_name} />
          <InfoRow
            label="Position / trade"
            value={employee.role || "Not set"}
          />
          <InfoRow
            label="Status"
            value={employee.active !== false ? "Active" : "Inactive"}
          />
          <InfoRow
            label="Linked login"
            value={employee.user_id ? "Yes" : "No"}
          />
        </InfoSection>

        <InfoSection title="Crew Allocation" icon={<UsersRound size={19} />}>
          <InfoRow
            label="Crew"
            value={crewLabel(
              crews.find((crew) => crew.id === employee.crew_id),
            )}
          />
          <InfoRow
            label="Leading hand"
            value={
              crews.find((crew) => crew.id === employee.crew_id)
                ?.leading_hand || "Not set"
            }
          />
        </InfoSection>

        <div className="lg:col-span-2">
          <InfoSection
            title="Operational Notes"
            icon={<BriefcaseBusiness size={19} />}
          >
            <p className="text-sm leading-6 text-slate-600">
              {employee.notes ||
                "No operational notes recorded. Do not use this field for private HR, medical or personal information."}
            </p>
          </InfoSection>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Use the payroll ID from your approved business systems. Do not enter
        pay rates, bank details, tax information, medical details, home addresses
        or other sensitive personal information.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Payroll ID">
          <input
            value={form.payrollId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                payrollId: event.target.value.toUpperCase(),
              }))
            }
            placeholder="Enter payroll ID"
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold uppercase outline-none ring-slate-200 focus:ring-2"
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Use the exact identifier from payroll and your other business systems.
          </p>
        </Field>

        <Field label="Full name">
          <input
            value={form.fullName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                fullName: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Position / trade">
          <input
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                role: event.target.value,
              }))
            }
            placeholder="e.g. Rigger, Crane Operator"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Crew">
          <SelectField
            value={form.crewId}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                crewId: value,
              }))
            }
            options={[
              { value: "", label: "Unassigned" },
              ...crews
                .filter((crew) => crew.active !== false)
                .map((crew) => ({
                  value: crew.id,
                  label: crewLabel(crew),
                })),
            ]}
          />
        </Field>

        <Field label="Status">
          <SelectField
            value={form.active ? "active" : "inactive"}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                active: value === "active",
              }))
            }
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </Field>

        <div className="md:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-900">
            <Link2 size={17} />
            Link TTTracker mobile account
          </div>
          <Field label="Mobile login account">
            <SelectField
              value={form.userId}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  userId: value,
                }))
              }
              options={[
                { value: "", label: "No mobile account linked" },
                ...availableLoginAccounts.map((account) => ({
                  value: account.userId,
                  label: account.email,
                })),
              ]}
            />
          </Field>
          <p className="mt-2 text-xs leading-5 text-blue-800">
            Only unassigned login accounts are shown. The selected account will
            be linked to this employee for the TTTracker mobile app.
          </p>
        </div>
      </div>

      <Field label="Operational notes">
        <textarea
          rows={4}
          value={form.notes}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              notes: event.target.value,
            }))
          }
          placeholder="Operational notes only"
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
        />
      </Field>
    </div>
  );
}

function PpeTab({
  editing,
  form,
  setForm,
}: {
  editing: boolean;
  form: ProfileForm;
  setForm: React.Dispatch<React.SetStateAction<ProfileForm>>;
}) {
  if (!editing) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PpeCard label="Shirt" value={form.shirtSize || "Not set"} />
        <PpeCard label="Jacket" value={form.jacketSize || "Not set"} />
        <PpeCard label="Gloves" value={form.gloveSize || "Not set"} />
        <PpeCard label="Pants" value={form.pantsSize || "Not set"} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Shirt size">
        <SelectField
          value={form.shirtSize}
          onChange={(value) =>
            setForm((current) => ({ ...current, shirtSize: value }))
          }
          options={[
            { value: "", label: "Not set" },
            ...SHIRT_SIZES.map((size) => ({ value: size, label: size })),
          ]}
        />
      </Field>

      <Field label="Jacket size">
        <SelectField
          value={form.jacketSize}
          onChange={(value) =>
            setForm((current) => ({ ...current, jacketSize: value }))
          }
          options={[
            { value: "", label: "Not set" },
            ...JACKET_SIZES.map((size) => ({ value: size, label: size })),
          ]}
        />
      </Field>

      <Field label="Glove size">
        <SelectField
          value={form.gloveSize}
          onChange={(value) =>
            setForm((current) => ({ ...current, gloveSize: value }))
          }
          options={[
            { value: "", label: "Not set" },
            ...GLOVE_SIZES.map((size) => ({ value: size, label: size })),
          ]}
        />
      </Field>

      <Field label="Pants size">
        <input
          value={form.pantsSize}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              pantsSize: event.target.value,
            }))
          }
          placeholder="e.g. 87R"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
        />
      </Field>
    </div>
  );
}

function ProjectsTab({
  projects,
  loginLinked,
}: {
  projects: Project[];
  loginLinked: boolean;
}) {
  if (!loginLinked) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="font-bold text-amber-950">No login linked</h3>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          Project access is assigned to login accounts in Admin. Link a login
          to this employee before project allocations can appear here.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <FolderKanban size={28} className="mx-auto text-slate-400" />
        <h3 className="mt-4 text-lg font-bold text-slate-900">
          No project access
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Assign project access through the Admin page.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <div
          key={project.id}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          {project.project_number ? (
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {project.project_number}
            </div>
          ) : null}

          <h3 className="mt-1 font-bold text-slate-950">{project.name}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {project.status || "Status not set"}
          </p>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({
  employee,
  trainingRecords,
}: {
  employee: Employee;
  trainingRecords: TrainingRecord[];
}) {
  const historicalTraining = trainingRecords.filter(
    (record) =>
      !record.deleted_at &&
      (record.superseded_at ||
      record.revoked_at ||
      record.record_status === "superseded" ||
      record.record_status === "revoked"),
  );

  return (
    <div className="space-y-4">
      <HistoryRow
        label="Profile created"
        value={formatDate(employee.created_at)}
      />
      <HistoryRow
        label="Current status"
        value={employee.active !== false ? "Active" : "Inactive"}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="font-bold text-slate-900">Training history</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {historicalTraining.length} superseded or revoked training record
          {historicalTraining.length === 1 ? "" : "s"} retained.
        </p>

        {historicalTraining.length > 0 ? (
          <div className="mt-4 space-y-2">
            {historicalTraining.map((record) => (
              <div
                key={record.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-900">
                    {record.training_name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Expiry: {formatDate(record.expiry_date)}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${trainingStatusClasses(
                    calculateTrainingStatus(record),
                  )}`}
                >
                  {trainingStatusLabel(calculateTrainingStatus(record))}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TrainingMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "rose" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        {icon}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-1 truncate text-lg font-bold text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function InfoSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-2 text-slate-700">
        {icon}
        <h3 className="font-bold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">
        {value}
      </span>
    </div>
  );
}

function PpeCard({ label, value }: { label: string; value: string }) {
  const missing = value === "Not set";

  return (
    <div
      className={`rounded-2xl border p-5 ${
        missing
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div
        className={`text-sm font-semibold ${
          missing ? "text-rose-700" : "text-slate-500"
        }`}
      >
        {label}
      </div>
      <div
        className={`mt-2 text-2xl font-bold ${
          missing ? "text-rose-950" : "text-slate-950"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold ${
        active
          ? "border-b-2 border-slate-950 text-slate-950"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-800">
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </label>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}