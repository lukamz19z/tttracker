"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit3,
  FileCheck2,
  FileText,
  Filter,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type TrainingType = {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  record_kind: string;
  description: string | null;
  issuing_authority: string | null;
  default_expiry_months: number | null;
  allows_no_expiry: boolean;
  requires_issue_date: boolean;
  requires_expiry_date: boolean;
  requires_certificate_number: boolean;
  supports_class_codes: boolean;
  supports_provider: boolean;
  document_requirement: string;
  active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

type DocumentType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  kind: string;
  active: boolean;
  sort_order: number;
};

type DocumentRequirement = {
  id: string;
  training_type_id: string;
  document_type_id: string;
  required: boolean;
  minimum_count: number;
  maximum_count: number | null;
  instructions: string | null;
  sort_order: number;
};

type TrainingTypeForm = {
  name: string;
  shortCode: string;
  category: string;
  recordKind: string;
  description: string;
  issuingAuthority: string;
  defaultExpiryMonths: string;
  allowsNoExpiry: boolean;
  requiresIssueDate: boolean;
  requiresExpiryDate: boolean;
  requiresCertificateNumber: boolean;
  supportsClassCodes: boolean;
  supportsProvider: boolean;
  documentRequirement: string;
  active: boolean;
  sortOrder: string;
};

type RequirementDraft = {
  documentTypeId: string;
  required: boolean;
  minimumCount: string;
  maximumCount: string;
  instructions: string;
  sortOrder: string;
};

type DocumentTypeForm = {
  name: string;
  code: string;
  description: string;
  kind: string;
  active: boolean;
  sortOrder: string;
};

const EMPTY_TYPE_FORM: TrainingTypeForm = {
  name: "",
  shortCode: "",
  category: "",
  recordKind: "other",
  description: "",
  issuingAuthority: "",
  defaultExpiryMonths: "",
  allowsNoExpiry: false,
  requiresIssueDate: false,
  requiresExpiryDate: false,
  requiresCertificateNumber: false,
  supportsClassCodes: false,
  supportsProvider: true,
  documentRequirement: "multiple",
  active: true,
  sortOrder: "100",
};

const EMPTY_DOCUMENT_TYPE_FORM: DocumentTypeForm = {
  name: "",
  code: "",
  description: "",
  kind: "other",
  active: true,
  sortOrder: "100",
};

const CATEGORY_OPTIONS = [
  "Driver Licence",
  "High Risk Licence",
  "VOC",
  "General Training",
  "Medical / First Aid",
  "Client Requirement",
  "Internal Competency",
  "Plant / Equipment",
  "Site Induction",
  "Trade Qualification",
  "Other",
];

const RECORD_KIND_OPTIONS = [
  { value: "licence", label: "Licence" },
  { value: "voc", label: "VOC" },
  { value: "certificate", label: "Certificate" },
  { value: "induction", label: "Induction" },
  { value: "competency", label: "Competency" },
  { value: "qualification", label: "Qualification" },
  { value: "medical", label: "Medical / First Aid" },
  { value: "other", label: "Other" },
];

const DOCUMENT_RULE_OPTIONS = [
  { value: "none", label: "No document required" },
  { value: "certificate", label: "Certificate" },
  { value: "front_back", label: "Front and back" },
  { value: "combined_or_front_back", label: "Combined PDF or front and back" },
  { value: "multiple", label: "Multiple configurable documents" },
];

const DOCUMENT_KIND_OPTIONS = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "combined", label: "Combined" },
  { value: "certificate", label: "Certificate" },
  { value: "statement", label: "Statement of attainment" },
  { value: "card", label: "Licence card" },
  { value: "logbook", label: "Logbook" },
  { value: "evidence", label: "Supporting evidence" },
  { value: "other", label: "Other" },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanise(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formFromType(type: TrainingType): TrainingTypeForm {
  return {
    name: clean(type.name),
    shortCode: clean(type.short_code),
    category: clean(type.category),
    recordKind: clean(type.record_kind) || "other",
    description: clean(type.description),
    issuingAuthority: clean(type.issuing_authority),
    defaultExpiryMonths:
      type.default_expiry_months === null
        ? ""
        : String(type.default_expiry_months),
    allowsNoExpiry: type.allows_no_expiry,
    requiresIssueDate: type.requires_issue_date,
    requiresExpiryDate: type.requires_expiry_date,
    requiresCertificateNumber: type.requires_certificate_number,
    supportsClassCodes: type.supports_class_codes,
    supportsProvider: type.supports_provider,
    documentRequirement: type.document_requirement || "multiple",
    active: type.active,
    sortOrder: String(type.sort_order ?? 100),
  };
}

export default function TrainingTypesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [savingRequirements, setSavingRequirements] = useState(false);
  const [savingDocumentType, setSavingDocumentType] = useState(false);
  const [busyTypeId, setBusyTypeId] = useState<string | null>(null);
  const [busyDocumentTypeId, setBusyDocumentTypeId] = useState<string | null>(
    null,
  );

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<TrainingType | null>(null);
  const [typeForm, setTypeForm] =
    useState<TrainingTypeForm>(EMPTY_TYPE_FORM);

  const [requirementsModalOpen, setRequirementsModalOpen] = useState(false);
  const [requirementsType, setRequirementsType] =
    useState<TrainingType | null>(null);
  const [requirementDrafts, setRequirementDrafts] = useState<
    Record<string, RequirementDraft>
  >({});

  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingDocumentType, setEditingDocumentType] =
    useState<DocumentType | null>(null);
  const [documentTypeForm, setDocumentTypeForm] =
    useState<DocumentTypeForm>(EMPTY_DOCUMENT_TYPE_FORM);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [typeResult, documentTypeResult, requirementResult] =
      await Promise.all([
        supabase
          .from("training_types")
          .select(
            "id, name, short_code, category, record_kind, description, issuing_authority, default_expiry_months, allows_no_expiry, requires_issue_date, requires_expiry_date, requires_certificate_number, supports_class_codes, supports_provider, document_requirement, active, sort_order, created_at, updated_at",
          )
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("training_document_types")
          .select(
            "id, name, code, description, kind, active, sort_order",
          )
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("training_type_document_requirements")
          .select(
            "id, training_type_id, document_type_id, required, minimum_count, maximum_count, instructions, sort_order",
          )
          .order("sort_order", { ascending: true }),
      ]);

    if (typeResult.error) throw new Error(typeResult.error.message);
    if (documentTypeResult.error) {
      throw new Error(documentTypeResult.error.message);
    }
    if (requirementResult.error) {
      throw new Error(requirementResult.error.message);
    }

    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
    setDocumentTypes((documentTypeResult.data ?? []) as DocumentType[]);
    setRequirements(
      (requirementResult.data ?? []) as DocumentRequirement[],
    );
  }, [supabase]);

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
                : "Unable to load training type settings.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const categories = useMemo(() => {
    const values = new Set(CATEGORY_OPTIONS);
    trainingTypes.forEach((type) => {
      if (clean(type.category)) values.add(clean(type.category));
    });
    return [...values].sort();
  }, [trainingTypes]);

  const requirementsByType = useMemo(() => {
    const map = new Map<string, DocumentRequirement[]>();

    requirements.forEach((requirement) => {
      const current = map.get(requirement.training_type_id) ?? [];
      current.push(requirement);
      map.set(requirement.training_type_id, current);
    });

    return map;
  }, [requirements]);

  const filteredTypes = useMemo(() => {
    const query = search.trim().toLowerCase();

    return trainingTypes.filter((type) => {
      if (
        categoryFilter !== "all" &&
        clean(type.category) !== categoryFilter
      ) {
        return false;
      }

      if (statusFilter === "active" && !type.active) return false;
      if (statusFilter === "inactive" && type.active) return false;

      if (!query) return true;

      return [
        type.name,
        type.short_code,
        type.category,
        type.record_kind,
        type.description,
        type.issuing_authority,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryFilter, search, statusFilter, trainingTypes]);

  const activeCount = trainingTypes.filter((type) => type.active).length;
  const inactiveCount = trainingTypes.length - activeCount;
  const configuredDocumentCount = trainingTypes.filter(
    (type) => (requirementsByType.get(type.id) ?? []).length > 0,
  ).length;

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh training settings.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function openCreateType() {
    setEditingType(null);
    setTypeForm(EMPTY_TYPE_FORM);
    setTypeModalOpen(true);
    setMessage(null);
  }

  function openEditType(type: TrainingType) {
    setEditingType(type);
    setTypeForm(formFromType(type));
    setTypeModalOpen(true);
    setMessage(null);
  }

  function openDuplicateType(type: TrainingType) {
    setEditingType(null);
    setTypeForm({
      ...formFromType(type),
      name: `${type.name} Copy`,
      shortCode: type.short_code ? `${type.short_code}-COPY` : "",
      active: true,
      sortOrder: String((type.sort_order ?? 100) + 1),
    });
    setTypeModalOpen(true);
    setMessage(null);
  }

  async function saveType() {
    const name = typeForm.name.trim();
    const shortCode = typeForm.shortCode.trim().toUpperCase();

    if (!name) {
      setMessage({ tone: "error", text: "Enter a training type name." });
      return;
    }

    const expiryMonths = numberOrNull(typeForm.defaultExpiryMonths);
    const sortOrder = numberOrNull(typeForm.sortOrder) ?? 100;

    if (
      typeForm.defaultExpiryMonths.trim() &&
      (expiryMonths === null || expiryMonths < 0)
    ) {
      setMessage({
        tone: "error",
        text: "Default expiry months must be zero or greater.",
      });
      return;
    }

    setSavingType(true);
    setMessage(null);

    const payload = {
      name,
      short_code: shortCode || null,
      category: typeForm.category.trim() || null,
      record_kind: typeForm.recordKind,
      description: typeForm.description.trim() || null,
      issuing_authority: typeForm.issuingAuthority.trim() || null,
      default_expiry_months: expiryMonths,
      allows_no_expiry: typeForm.allowsNoExpiry,
      requires_issue_date: typeForm.requiresIssueDate,
      requires_expiry_date: typeForm.requiresExpiryDate,
      requires_certificate_number: typeForm.requiresCertificateNumber,
      supports_class_codes: typeForm.supportsClassCodes,
      supports_provider: typeForm.supportsProvider,
      document_requirement: typeForm.documentRequirement,
      active: typeForm.active,
      sort_order: sortOrder,
    };

    try {
      const result = editingType
        ? await supabase
            .from("training_types")
            .update(payload)
            .eq("id", editingType.id)
        : await supabase.from("training_types").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setTypeModalOpen(false);
      setEditingType(null);
      setTypeForm(EMPTY_TYPE_FORM);
      setMessage({
        tone: "success",
        text: editingType
          ? "Training type updated."
          : "Training type created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the training type.",
      });
    } finally {
      setSavingType(false);
    }
  }

  async function toggleType(type: TrainingType) {
    setBusyTypeId(type.id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("training_types")
        .update({ active: !type.active })
        .eq("id", type.id);

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: type.active
          ? `${type.name} archived. Existing employee records are unchanged.`
          : `${type.name} activated.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to change the training type status.",
      });
    } finally {
      setBusyTypeId(null);
    }
  }

  function openRequirements(type: TrainingType) {
    const existing = requirementsByType.get(type.id) ?? [];
    const existingByDocument = new Map(
      existing.map((requirement) => [
        requirement.document_type_id,
        requirement,
      ]),
    );

    const drafts: Record<string, RequirementDraft> = {};

    documentTypes.forEach((documentType) => {
      const requirement = existingByDocument.get(documentType.id);

      drafts[documentType.id] = {
        documentTypeId: documentType.id,
        required: requirement?.required ?? false,
        minimumCount: String(requirement?.minimum_count ?? 0),
        maximumCount:
          requirement?.maximum_count === null ||
          requirement?.maximum_count === undefined
            ? ""
            : String(requirement.maximum_count),
        instructions: clean(requirement?.instructions),
        sortOrder: String(
          requirement?.sort_order ?? documentType.sort_order ?? 100,
        ),
      };
    });

    setRequirementsType(type);
    setRequirementDrafts(drafts);
    setRequirementsModalOpen(true);
    setMessage(null);
  }

  async function saveDocumentRequirements() {
    if (!requirementsType) return;

    setSavingRequirements(true);
    setMessage(null);

    try {
      const drafts = Object.values(requirementDrafts);
      const selectedDrafts = drafts.filter(
        (draft) =>
          draft.required ||
          Number(draft.minimumCount || 0) > 0 ||
          Boolean(draft.instructions.trim()),
      );

      const deleteResult = await supabase
        .from("training_type_document_requirements")
        .delete()
        .eq("training_type_id", requirementsType.id);

      if (deleteResult.error) throw new Error(deleteResult.error.message);

      if (selectedDrafts.length > 0) {
        const rows = selectedDrafts.map((draft) => ({
          training_type_id: requirementsType.id,
          document_type_id: draft.documentTypeId,
          required: draft.required,
          minimum_count: Math.max(
            draft.required ? 1 : 0,
            Number(draft.minimumCount || 0),
          ),
          maximum_count: draft.maximumCount.trim()
            ? Number(draft.maximumCount)
            : null,
          instructions: draft.instructions.trim() || null,
          sort_order: Number(draft.sortOrder || 100),
        }));

        const insertResult = await supabase
          .from("training_type_document_requirements")
          .insert(rows);

        if (insertResult.error) throw new Error(insertResult.error.message);
      }

      await loadData();
      setRequirementsModalOpen(false);
      setRequirementsType(null);
      setRequirementDrafts({});
      setMessage({
        tone: "success",
        text: `Document requirements updated for ${requirementsType.name}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save document requirements.",
      });
    } finally {
      setSavingRequirements(false);
    }
  }

  function openCreateDocumentType() {
    setEditingDocumentType(null);
    setDocumentTypeForm(EMPTY_DOCUMENT_TYPE_FORM);
    setDocumentModalOpen(true);
    setMessage(null);
  }

  function openEditDocumentType(documentType: DocumentType) {
    setEditingDocumentType(documentType);
    setDocumentTypeForm({
      name: documentType.name,
      code: documentType.code,
      description: clean(documentType.description),
      kind: documentType.kind,
      active: documentType.active,
      sortOrder: String(documentType.sort_order ?? 100),
    });
    setDocumentModalOpen(true);
    setMessage(null);
  }

  async function saveDocumentType() {
    const name = documentTypeForm.name.trim();
    const code = documentTypeForm.code.trim().toUpperCase();

    if (!name || !code) {
      setMessage({
        tone: "error",
        text: "Enter both a document type name and code.",
      });
      return;
    }

    setSavingDocumentType(true);
    setMessage(null);

    const payload = {
      name,
      code,
      description: documentTypeForm.description.trim() || null,
      kind: documentTypeForm.kind,
      active: documentTypeForm.active,
      sort_order: numberOrNull(documentTypeForm.sortOrder) ?? 100,
    };

    try {
      const result = editingDocumentType
        ? await supabase
            .from("training_document_types")
            .update(payload)
            .eq("id", editingDocumentType.id)
        : await supabase.from("training_document_types").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setDocumentModalOpen(false);
      setEditingDocumentType(null);
      setDocumentTypeForm(EMPTY_DOCUMENT_TYPE_FORM);
      setMessage({
        tone: "success",
        text: editingDocumentType
          ? "Document type updated."
          : "Document type created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the document type.",
      });
    } finally {
      setSavingDocumentType(false);
    }
  }

  async function toggleDocumentType(documentType: DocumentType) {
    setBusyDocumentTypeId(documentType.id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("training_document_types")
        .update({ active: !documentType.active })
        .eq("id", documentType.id);

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: documentType.active
          ? `${documentType.name} archived.`
          : `${documentType.name} activated.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update the document type.",
      });
    } finally {
      setBusyDocumentTypeId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/people/training"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Training Register
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <Settings2 size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Training Configuration
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Type Library
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Manage every licence, VOC, certificate, induction and
                competency available in TTTracker. Existing employee records
                retain their snapshot values when a type is renamed or
                archived.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={openCreateDocumentType}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FileText size={16} />
                Document Types
              </button>

              <button
                type="button"
                onClick={openCreateType}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                New Training Type
              </button>
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Training types"
            value={String(trainingTypes.length)}
            detail="Total configured"
            icon={<Library size={20} />}
          />
          <KpiCard
            label="Active"
            value={String(activeCount)}
            detail="Available for new records"
            icon={<ToggleRight size={20} />}
          />
          <KpiCard
            label="Archived"
            value={String(inactiveCount)}
            detail="Historical use only"
            icon={<ToggleLeft size={20} />}
          />
          <KpiCard
            label="Document rules"
            value={String(configuredDocumentCount)}
            detail="Types with requirements"
            icon={<FileCheck2 size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500">
            <Filter size={17} />
            <span className="text-sm font-semibold">Filters</span>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_180px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, short code, category or authority..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
            />

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | "active" | "inactive")
              }
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Archived" },
              ]}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">
              Configured Training Types
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {filteredTypes.length} type
              {filteredTypes.length === 1 ? "" : "s"} shown
            </p>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-400" />
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="p-10 text-center">
              <Library size={32} className="mx-auto text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">
                No training types found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Adjust the filters or create a new training type.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTypes.map((type) => {
                const typeRequirements =
                  requirementsByType.get(type.id) ?? [];

                return (
                  <div
                    key={type.id}
                    className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] xl:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">
                          {type.name}
                        </h3>
                        {type.short_code ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {type.short_code}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            type.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {type.active ? "Active" : "Archived"}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {type.description || "No description recorded."}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Category
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">
                        {type.category || "Uncategorised"}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {humanise(type.record_kind)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Expiry
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">
                        {type.default_expiry_months === null
                          ? "Manual expiry"
                          : `${type.default_expiry_months} months`}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {type.allows_no_expiry
                          ? "Can be non-expiring"
                          : "Expiry rules enforced"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Documents
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">
                        {humanise(type.document_requirement)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {typeRequirements.length} configured requirement
                        {typeRequirements.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <button
                        type="button"
                        onClick={() => openRequirements(type)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <FileCheck2 size={15} />
                        Documents
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditType(type)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Edit3 size={15} />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => openDuplicateType(type)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Copy size={15} />
                        Duplicate
                      </button>

                      <button
                        type="button"
                        onClick={() => void toggleType(type)}
                        disabled={busyTypeId === type.id}
                        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                          type.active
                            ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "bg-slate-950 text-white hover:bg-slate-800"
                        }`}
                      >
                        {busyTypeId === type.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : type.active ? (
                          <ToggleLeft size={15} />
                        ) : (
                          <ToggleRight size={15} />
                        )}
                        {type.active ? "Archive" : "Activate"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Document Type Library
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Reusable document options available when configuring a
                training type.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateDocumentType}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={16} />
              New Document Type
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {documentTypes.map((documentType) => (
              <div
                key={documentType.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">
                        {documentType.name}
                      </h3>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                        {documentType.code}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {documentType.description || "No description."}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      documentType.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {documentType.active ? "Active" : "Archived"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditDocumentType(documentType)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleDocumentType(documentType)}
                    disabled={busyDocumentTypeId === documentType.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {busyDocumentTypeId === documentType.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : documentType.active ? (
                      <ToggleLeft size={14} />
                    ) : (
                      <ToggleRight size={14} />
                    )}
                    {documentType.active ? "Archive" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {typeModalOpen ? (
        <TrainingTypeModal
          form={typeForm}
          setForm={setTypeForm}
          editingType={editingType}
          categories={categories}
          saving={savingType}
          onClose={() => {
            if (savingType) return;
            setTypeModalOpen(false);
            setEditingType(null);
            setTypeForm(EMPTY_TYPE_FORM);
          }}
          onSave={() => void saveType()}
        />
      ) : null}

      {requirementsModalOpen && requirementsType ? (
        <RequirementsModal
          trainingType={requirementsType}
          documentTypes={documentTypes}
          drafts={requirementDrafts}
          setDrafts={setRequirementDrafts}
          saving={savingRequirements}
          onClose={() => {
            if (savingRequirements) return;
            setRequirementsModalOpen(false);
            setRequirementsType(null);
            setRequirementDrafts({});
          }}
          onSave={() => void saveDocumentRequirements()}
        />
      ) : null}

      {documentModalOpen ? (
        <DocumentTypeModal
          form={documentTypeForm}
          setForm={setDocumentTypeForm}
          editingDocumentType={editingDocumentType}
          saving={savingDocumentType}
          onClose={() => {
            if (savingDocumentType) return;
            setDocumentModalOpen(false);
            setEditingDocumentType(null);
            setDocumentTypeForm(EMPTY_DOCUMENT_TYPE_FORM);
          }}
          onSave={() => void saveDocumentType()}
        />
      ) : null}
    </AppShell>
  );
}

function TrainingTypeModal({
  form,
  setForm,
  editingType,
  categories,
  saving,
  onClose,
  onSave,
}: {
  form: TrainingTypeForm;
  setForm: React.Dispatch<React.SetStateAction<TrainingTypeForm>>;
  editingType: TrainingType | null;
  categories: string[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title={editingType ? "Edit Training Type" : "New Training Type"}
      description="Configure how this training item behaves throughout TTTracker."
      saving={saving}
      onClose={onClose}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="e.g. Working at Heights"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Short code">
          <input
            value={form.shortCode}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                shortCode: event.target.value.toUpperCase(),
              }))
            }
            placeholder="e.g. WAH"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Category">
          <input
            list="training-type-categories"
            value={form.category}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
            placeholder="Select or enter a category"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
          <datalist id="training-type-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </Field>

        <Field label="Record kind">
          <SelectField
            value={form.recordKind}
            onChange={(value) =>
              setForm((current) => ({ ...current, recordKind: value }))
            }
            options={RECORD_KIND_OPTIONS}
          />
        </Field>

        <Field label="Issuing authority">
          <input
            value={form.issuingAuthority}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                issuingAuthority: event.target.value,
              }))
            }
            placeholder="Optional"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Default expiry months">
          <input
            type="number"
            min="0"
            value={form.defaultExpiryMonths}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                defaultExpiryMonths: event.target.value,
              }))
            }
            placeholder="Leave blank for manual expiry"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Document rule">
          <SelectField
            value={form.documentRequirement}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                documentRequirement: value,
              }))
            }
            options={DOCUMENT_RULE_OPTIONS}
          />
        </Field>

        <Field label="Sort order">
          <input
            type="number"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sortOrder: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          rows={3}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          placeholder="Explain what this training type covers."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 resize-none"
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <ToggleField
          checked={form.requiresIssueDate}
          title="Issue date required"
          description="The record cannot be saved without an issue date."
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              requiresIssueDate: checked,
            }))
          }
        />
        <ToggleField
          checked={form.requiresExpiryDate}
          title="Expiry date required"
          description="The record must have an expiry unless no-expiry is allowed."
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              requiresExpiryDate: checked,
            }))
          }
        />
        <ToggleField
          checked={form.allowsNoExpiry}
          title="Allow no expiry"
          description="Permit a permanent or non-expiring record."
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              allowsNoExpiry: checked,
            }))
          }
        />
        <ToggleField
          checked={form.requiresCertificateNumber}
          title="Number required"
          description="Require a certificate or licence number."
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              requiresCertificateNumber: checked,
            }))
          }
        />
        <ToggleField
          checked={form.supportsClassCodes}
          title="Supports class codes"
          description="Enable codes such as DG, RB, RI, RA, LF or C2."
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              supportsClassCodes: checked,
            }))
          }
        />
        <ToggleField
          checked={form.supportsProvider}
          title="Provider field"
          description="Allow a training provider or issuing organisation."
          onChange={(checked) =>
            setForm((current) => ({
              ...current,
              supportsProvider: checked,
            }))
          }
        />
        <ToggleField
          checked={form.active}
          title="Active"
          description="Make this option available for new employee records."
          onChange={(checked) =>
            setForm((current) => ({ ...current, active: checked }))
          }
        />
      </div>

      <ModalActions
        saving={saving}
        saveLabel={editingType ? "Save Changes" : "Create Training Type"}
        onClose={onClose}
        onSave={onSave}
      />
    </ModalShell>
  );
}

function RequirementsModal({
  trainingType,
  documentTypes,
  drafts,
  setDrafts,
  saving,
  onClose,
  onSave,
}: {
  trainingType: TrainingType;
  documentTypes: DocumentType[];
  drafts: Record<string, RequirementDraft>;
  setDrafts: React.Dispatch<
    React.SetStateAction<Record<string, RequirementDraft>>
  >;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title={`Documents · ${trainingType.name}`}
      description="Set the documents expected for this training type. Required items will later drive upload validation and missing-document alerts."
      saving={saving}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-3">
        {documentTypes
          .filter((documentType) => documentType.active)
          .map((documentType) => {
            const draft = drafts[documentType.id];
            if (!draft) return null;

            return (
              <div
                key={documentType.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px_140px_140px] lg:items-end">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={draft.required}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [documentType.id]: {
                            ...current[documentType.id],
                            required: event.target.checked,
                            minimumCount:
                              event.target.checked &&
                              Number(
                                current[documentType.id]?.minimumCount || 0,
                              ) < 1
                                ? "1"
                                : current[documentType.id]?.minimumCount || "0",
                          },
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {documentType.name}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                          {documentType.code}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-slate-500">
                        {documentType.description || "No description."}
                      </span>
                    </span>
                  </label>

                  <Field label="Minimum">
                    <input
                      type="number"
                      min="0"
                      value={draft.minimumCount}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [documentType.id]: {
                            ...current[documentType.id],
                            minimumCount: event.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                    />
                  </Field>

                  <Field label="Maximum">
                    <input
                      type="number"
                      min="1"
                      value={draft.maximumCount}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [documentType.id]: {
                            ...current[documentType.id],
                            maximumCount: event.target.value,
                          },
                        }))
                      }
                      placeholder="No limit"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                    />
                  </Field>

                  <Field label="Sort order">
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [documentType.id]: {
                            ...current[documentType.id],
                            sortOrder: event.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                    />
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Instructions">
                    <input
                      value={draft.instructions}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [documentType.id]: {
                            ...current[documentType.id],
                            instructions: event.target.value,
                          },
                        }))
                      }
                      placeholder="Optional instructions shown during upload"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
      </div>

      <ModalActions
        saving={saving}
        saveLabel="Save Document Requirements"
        onClose={onClose}
        onSave={onSave}
      />
    </ModalShell>
  );
}

function DocumentTypeModal({
  form,
  setForm,
  editingDocumentType,
  saving,
  onClose,
  onSave,
}: {
  form: DocumentTypeForm;
  setForm: React.Dispatch<React.SetStateAction<DocumentTypeForm>>;
  editingDocumentType: DocumentType | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ModalShell
      title={
        editingDocumentType ? "Edit Document Type" : "New Document Type"
      }
      description="Create a reusable document option for training requirements."
      saving={saving}
      onClose={onClose}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="e.g. Front"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Code">
          <input
            value={form.code}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                code: event.target.value.toUpperCase(),
              }))
            }
            placeholder="e.g. FRONT"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>

        <Field label="Kind">
          <SelectField
            value={form.kind}
            onChange={(value) =>
              setForm((current) => ({ ...current, kind: value }))
            }
            options={DOCUMENT_KIND_OPTIONS}
          />
        </Field>

        <Field label="Sort order">
          <input
            type="number"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sortOrder: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          rows={3}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2 resize-none"
        />
      </Field>

      <ToggleField
        checked={form.active}
        title="Active"
        description="Make this document type available when configuring training requirements."
        onChange={(checked) =>
          setForm((current) => ({ ...current, active: checked }))
        }
      />

      <ModalActions
        saving={saving}
        saveLabel={
          editingDocumentType ? "Save Changes" : "Create Document Type"
        }
        onClose={onClose}
        onSave={onSave}
      />
    </ModalShell>
  );
}

function ModalShell({
  title,
  description,
  saving,
  onClose,
  maxWidth = "max-w-4xl",
  children,
}: {
  title: string;
  description: string;
  saving: boolean;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div
        className={`my-auto w-full ${maxWidth} rounded-3xl border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {description}
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

        <div className="space-y-6 p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  saveLabel,
  onClose,
  onSave,
}: {
  saving: boolean;
  saveLabel: string;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
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
        {saveLabel}
      </button>
    </div>
  );
}

function ToggleField({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300"
      />
      <span>
        <span className="block text-sm font-bold text-slate-900">
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
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
