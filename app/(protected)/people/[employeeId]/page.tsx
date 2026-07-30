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
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Shirt,
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
  if (status === "revoked") return "Revoked";
  if (status === "superseded") return "Superseded";
  return "Missing expiry";
}

function trainingStatusClasses(status: TrainingStatus) {
  if (status === "current") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "expiring") return "border-amber-200 bg-amber-50 text-amber-800";
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
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [trainingDocuments, setTrainingDocuments] = useState<TrainingDocument[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshingTraining, setRefreshingTraining] = useState(false);

  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
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
          "id, name, short_code, category, record_kind, default_expiry_months, allows_no_expiry, requires_issue_date, requires_expiry_date, requires_certificate_number, supports_class_codes, supports_provider, active",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("employee_training_records")
        .select(
          "id, employee_id, training_type_id, training_name, training_short_code, category, record_kind, certificate_number, class_codes, provider, issuing_authority, issue_date, expiry_date, does_not_expire, record_status, notes, supersedes_record_id, superseded_at, revoked_at, revoked_reason, created_at",
        )
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false }),
    ]);

    if (crewResult.error) throw new Error(crewResult.error.message);
    if (projectResult.error) throw new Error(projectResult.error.message);
    if (trainingTypeResult.error) {
      throw new Error(trainingTypeResult.error.message);
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

  function openAddTraining() {
    setEditingTrainingRecord(null);
    setTrainingForm(EMPTY_TRAINING_FORM);
    setTrainingModalOpen(true);
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
                records={trainingRecords}
                documentsByRecord={trainingDocumentsByRecord}
                currentCount={currentTrainingCount}
                expiringCount={expiringTrainingCount}
                expiredCount={expiredTrainingCount}
                missingDocumentCount={missingDocumentCount}
                refreshing={refreshingTraining}
                onRefresh={() => void refreshTraining()}
                onAdd={openAddTraining}
                onEdit={openEditTraining}
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

                  <button
                    type="button"
                    onClick={() => onEdit(record)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 size={15} />
                    Edit
                  </button>
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
              Save the record now. Front, back, combined PDF and certificate
              uploads will be connected to SharePoint later through the
              employee_training_documents table.
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
      record.superseded_at ||
      record.revoked_at ||
      record.record_status === "superseded" ||
      record.record_status === "revoked",
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
