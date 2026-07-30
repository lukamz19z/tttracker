"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  FileCog,
  FolderCog,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  code: string;
  sharepoint_folder_name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

type DocumentUploadType = "none" | "single" | "front_back";

type RecordType = {
  id: string;
  category_id: string | null;
  name: string;
  code: string;
  category: string | null;
  description: string | null;
  active: boolean;
  requires_issue_date: boolean;
  requires_expiry_date: boolean;
  allows_no_expiry: boolean;
  validity_mode: "never" | "manual" | "automatic";
  validity_interval_value: number | null;
  validity_interval_unit: "days" | "weeks" | "months" | "years" | null;
  filename_date_field: "none" | "issue_date" | "expiry_date";
  requires_certificate_number: boolean;
  requires_issuer: boolean;
  requires_project: boolean;
  requires_document: boolean;
  document_upload_type: DocumentUploadType;
  allows_multiple_current: boolean;
  subtype_mode: "none" | "single" | "multiple";
  filename_components: string[];
  sort_order: number;
};

type RecordOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

type Message = { tone: "success" | "error"; text: string };

const DEFAULT_FILENAME_COMPONENTS = [
  "employee_id",
  "employee_name",
  "record_code",
  "option_code",
  "issue_date",
  "expiry_date",
  "project_code",
  "document_side",
];

function normaliseFilenameComponents(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_FILENAME_COMPONENTS];
  return value.filter((item): item is string => typeof item === "string");
}

function buildFilenamePreview(recordType: RecordType): string[] {
  const previewValues: Record<string, string> = {
    employee_id: "EMP000001",
    employee_name: "EMPLOYEE_NAME",
    record_code: clean(recordType.code) || "RECORD_CODE",
    option_code:
      recordType.subtype_mode === "multiple"
        ? "CLASS-CLASS-CLASS"
        : recordType.subtype_mode === "single"
          ? "CLASS"
          : "",
    project_code: recordType.requires_project ? "PROJECT_CODE" : "",
    issue_date:
      recordType.filename_date_field === "issue_date" ? "ISSUE_DATE" : "",
    expiry_date:
      recordType.filename_date_field === "expiry_date" ? "EXPIRY_DATE" : "",
    document_side: "",
  };

  const build = (side: "FRONT" | "BACK" | "") => {
    const values: Record<string, string> = {
      ...previewValues,
      document_side: side,
    };

    const parts = filenameComponentsFor(recordType)
      .map((component) => values[component] ?? "")
      .map((value) => value.trim())
      .filter(Boolean);

    const extension =
      recordType.document_upload_type === "front_back" ? "jpg" : "pdf";

    return `${parts.join("_") || "EMP000001_EMPLOYEE_NAME_RECORD_CODE"}.${extension}`;
  };

  if (recordType.document_upload_type === "none") return [];

  if (recordType.document_upload_type === "front_back") {
    return [build("FRONT"), build("BACK")];
  }

  return [build("")];
}

function filenameComponentsFor(recordType: RecordType): string[] {
  return [
    "employee_id",
    "employee_name",
    "record_code",
    recordType.subtype_mode === "none" ? null : "option_code",
    recordType.requires_project ? "project_code" : null,
    recordType.filename_date_field === "issue_date" ? "issue_date" : null,
    recordType.filename_date_field === "expiry_date" ? "expiry_date" : null,
    recordType.document_upload_type === "front_back"
      ? "document_side"
      : null,
  ].filter((item): item is string => Boolean(item));
}

const clean = (value: unknown) => String(value ?? "").trim();

const makeCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export default function TrainingConfigurationPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);
  const [recordOptions, setRecordOptions] = useState<RecordOption[]>([]);

  const [tab, setTab] = useState<"types" | "categories" | "options">("types");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [categoryForm, setCategoryForm] = useState<Category | null>(null);
  const [typeForm, setTypeForm] = useState<RecordType | null>(null);
  const [optionForm, setOptionForm] = useState<RecordOption | null>(null);

  const loadData = useCallback(async () => {
    const [categoryResult, typeResult, optionResult] = await Promise.all([
      supabase
        .from("training_categories")
        .select(
          "id, name, code, sharepoint_folder_name, description, sort_order, active",
        )
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_types")
        .select(
          "id, category_id, name, code:short_code, category, description, active, requires_issue_date, requires_expiry_date, allows_no_expiry, validity_mode, validity_interval_value, validity_interval_unit, filename_date_field, requires_certificate_number, requires_issuer, requires_project, requires_document, document_upload_type, allows_multiple_current, subtype_mode, filename_components, sort_order",
        )
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_type_options")
        .select(
          "id, training_type_id, name, code, description, sort_order, active",
        )
        .order("sort_order")
        .order("name"),
    ]);

    const error =
      categoryResult.error ?? typeResult.error ?? optionResult.error;
    if (error) throw new Error(error.message);

    setCategories((categoryResult.data ?? []) as Category[]);
    setRecordTypes(
      (typeResult.data ?? []).map((item) => ({
        ...(item as Omit<RecordType, "filename_components">),
        validity_mode:
          (item as { validity_mode?: RecordType["validity_mode"] }).validity_mode ??
          ((item as { requires_expiry_date?: boolean }).requires_expiry_date
            ? "manual"
            : "never"),
        validity_interval_value:
          (item as { validity_interval_value?: number | null })
            .validity_interval_value ?? null,
        validity_interval_unit:
          (item as { validity_interval_unit?: RecordType["validity_interval_unit"] })
            .validity_interval_unit ?? null,
        filename_date_field:
          (item as { filename_date_field?: RecordType["filename_date_field"] })
            .filename_date_field ??
          ((item as { requires_expiry_date?: boolean }).requires_expiry_date
            ? "expiry_date"
            : "none"),
        document_upload_type:
          (item as { document_upload_type?: DocumentUploadType | null })
            .document_upload_type ??
          ((item as { requires_document?: boolean }).requires_document
            ? "single"
            : "none"),
        filename_components: normaliseFilenameComponents(
          (item as { filename_components?: unknown }).filename_components,
        ),
      })),
    );
    setRecordOptions((optionResult.data ?? []) as RecordOption[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to load training configuration.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const categoryById = useMemo(
    () => new Map(categories.map((item) => [item.id, item])),
    [categories],
  );

  const typeById = useMemo(
    () => new Map(recordTypes.map((item) => [item.id, item])),
    [recordTypes],
  );

  const filteredTypes = useMemo(() => {
    const query = search.toLowerCase().trim();

    return recordTypes.filter((item) => {
      if (!showInactive && !item.active) return false;
      if (categoryFilter !== "all" && item.category_id !== categoryFilter) {
        return false;
      }

      if (!query) return true;

      return [
        item.name,
        item.code,
        item.description,
        item.category_id
          ? categoryById.get(item.category_id)?.name
          : item.category,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryById, categoryFilter, recordTypes, search, showInactive]);

  const filteredCategories = useMemo(() => {
    const query = search.toLowerCase().trim();

    return categories.filter((item) => {
      if (!showInactive && !item.active) return false;
      if (!query) return true;

      return [
        item.name,
        item.code,
        item.sharepoint_folder_name,
        item.description,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categories, search, showInactive]);

  const filteredOptions = useMemo(() => {
    const query = search.toLowerCase().trim();

    return recordOptions.filter((item) => {
      if (!showInactive && !item.active) return false;

      const parent = typeById.get(item.training_type_id);
      if (
        categoryFilter !== "all" &&
        parent?.category_id !== categoryFilter
      ) {
        return false;
      }

      if (!query) return true;

      return [item.name, item.code, item.description, parent?.name]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryFilter, recordOptions, search, showInactive, typeById]);

  async function refresh() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({ tone: "success", text: "Configuration refreshed." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Unable to refresh data.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function newCategory() {
    setCategoryForm({
      id: "",
      name: "",
      code: "",
      sharepoint_folder_name: "",
      description: "",
      sort_order:
        Math.max(0, ...categories.map((item) => item.sort_order || 0)) + 10,
      active: true,
    });
  }

  function newType() {
    setTypeForm({
      id: "",
      category_id:
        categoryFilter !== "all"
          ? categoryFilter
          : categories.find((item) => item.active)?.id ?? "",
      name: "",
      code: "",
      category: null,
      description: "",
      active: true,
      requires_issue_date: true,
      requires_expiry_date: true,
      allows_no_expiry: false,
      validity_mode: "manual",
      validity_interval_value: null,
      validity_interval_unit: null,
      filename_date_field: "expiry_date",
      requires_certificate_number: false,
      requires_issuer: false,
      requires_project: false,
      requires_document: true,
      document_upload_type: "single",
      allows_multiple_current: false,
      subtype_mode: "none",
      filename_components: [...DEFAULT_FILENAME_COMPONENTS],
      sort_order:
        Math.max(0, ...recordTypes.map((item) => item.sort_order || 0)) + 10,
    });
  }

  function newOption(trainingTypeId = "") {
    setOptionForm({
      id: "",
      training_type_id:
        trainingTypeId || recordTypes.find((item) => item.active)?.id || "",
      name: "",
      code: "",
      description: "",
      sort_order:
        Math.max(
          0,
          ...recordOptions
            .filter((item) =>
              trainingTypeId
                ? item.training_type_id === trainingTypeId
                : true,
            )
            .map((item) => item.sort_order || 0),
        ) + 10,
      active: true,
    });
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryForm) return;

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        name: clean(categoryForm.name),
        code: makeCode(categoryForm.code || categoryForm.name),
        sharepoint_folder_name: clean(
          categoryForm.sharepoint_folder_name || categoryForm.name,
        ),
        description: clean(categoryForm.description) || null,
        sort_order: categoryForm.sort_order || 0,
        active: categoryForm.active,
      };

      if (!payload.name) throw new Error("Category name is required.");
      if (!payload.code) throw new Error("Category code is required.");
      if (!payload.sharepoint_folder_name) {
        throw new Error("SharePoint folder name is required.");
      }

      const result = categoryForm.id
        ? await supabase
            .from("training_categories")
            .update(payload)
            .eq("id", categoryForm.id)
        : await supabase.from("training_categories").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setCategoryForm(null);
      setMessage({
        tone: "success",
        text: categoryForm.id ? "Category updated." : "Category created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Unable to save category.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!typeForm) return;

    setSaving(true);
    setMessage(null);

    try {
      const category = categoryById.get(typeForm.category_id ?? "");
      if (!category) throw new Error("Select a valid category.");

      const payload = {
        category_id: category.id,
        category: category.name,
        name: clean(typeForm.name),
        short_code: makeCode(typeForm.code || typeForm.name),
        description: clean(typeForm.description) || null,
        active: typeForm.active,
        requires_issue_date:
          typeForm.validity_mode === "automatic"
            ? true
            : typeForm.requires_issue_date,
        requires_expiry_date: typeForm.validity_mode !== "never",
        allows_no_expiry: typeForm.validity_mode === "never",
        validity_mode: typeForm.validity_mode,
        validity_interval_value:
          typeForm.validity_mode === "automatic"
            ? typeForm.validity_interval_value
            : null,
        validity_interval_unit:
          typeForm.validity_mode === "automatic"
            ? typeForm.validity_interval_unit
            : null,
        filename_date_field: typeForm.filename_date_field,
        requires_certificate_number: typeForm.requires_certificate_number,
        requires_issuer: typeForm.requires_issuer,
        requires_project: typeForm.requires_project,
        requires_document: typeForm.document_upload_type !== "none",
        document_upload_type: typeForm.document_upload_type,
        allows_multiple_current: typeForm.allows_multiple_current,
        subtype_mode: typeForm.subtype_mode,
        supports_class_codes: typeForm.subtype_mode !== "none",
        supersede_scope: "never",
        filename_components: filenameComponentsFor(typeForm),
        sort_order: typeForm.sort_order || 0,
      };

      if (!payload.name) throw new Error("Record type name is required.");
      if (!payload.short_code) throw new Error("Record type code is required.");
      if (
        payload.validity_mode === "automatic" &&
        (!payload.validity_interval_value || payload.validity_interval_value < 1)
      ) {
        throw new Error("Enter a renewal interval greater than zero.");
      }
      if (
        payload.validity_mode === "automatic" &&
        !payload.validity_interval_unit
      ) {
        throw new Error("Select a renewal interval unit.");
      }
      if (
        payload.filename_date_field === "expiry_date" &&
        payload.validity_mode === "never"
      ) {
        throw new Error(
          "A record that never expires cannot show an expiry date in its filename.",
        );
      }

      const result = typeForm.id
        ? await supabase
            .from("training_types")
            .update(payload)
            .eq("id", typeForm.id)
        : await supabase.from("training_types").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setTypeForm(null);
      setMessage({
        tone: "success",
        text: typeForm.id ? "Record type updated." : "Record type created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save record type.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!optionForm) return;

    setSaving(true);
    setMessage(null);

    try {
      if (!typeById.has(optionForm.training_type_id)) {
        throw new Error("Select a valid record type.");
      }

      const payload = {
        training_type_id: optionForm.training_type_id,
        name: clean(optionForm.name),
        code: makeCode(optionForm.code || optionForm.name),
        description: clean(optionForm.description) || null,
        sort_order: optionForm.sort_order || 0,
        active: optionForm.active,
      };

      if (!payload.name) throw new Error("Option name is required.");
      if (!payload.code) throw new Error("Option code is required.");

      const result = optionForm.id
        ? await supabase
            .from("training_type_options")
            .update(payload)
            .eq("id", optionForm.id)
        : await supabase.from("training_type_options").insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setOptionForm(null);
      setMessage({
        tone: "success",
        text: optionForm.id ? "Option updated." : "Option created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Unable to save option.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleRow(
    table: "training_categories" | "training_types" | "training_type_options",
    id: string,
    active: boolean,
  ) {
    const result = await supabase.from(table).update({ active: !active }).eq("id", id);

    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      return;
    }

    await loadData();
  }

  async function moveItem(
    table: "training_categories" | "training_types" | "training_type_options",
    items: Array<{ id: string; sort_order: number }>,
    itemId: string,
    direction: "up" | "down",
  ) {
    const ordered = [...items].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
    );
    const index = ordered.findIndex((item) => item.id === itemId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const current = ordered[index];
    const target = ordered[targetIndex];

    const currentOrder = current.sort_order || (index + 1) * 10;
    const targetOrder = target.sort_order || (targetIndex + 1) * 10;

    const [currentResult, targetResult] = await Promise.all([
      supabase.from(table).update({ sort_order: targetOrder }).eq("id", current.id),
      supabase.from(table).update({ sort_order: currentOrder }).eq("id", target.id),
    ]);

    const error = currentResult.error ?? targetResult.error;
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
  }

  async function deleteOption(item: RecordOption) {
    if (
      !window.confirm(
        `Delete "${item.name}"? Deactivate it instead if existing records may use it.`,
      )
    ) {
      return;
    }

    const result = await supabase
      .from("training_type_options")
      .delete()
      .eq("id", item.id);

    if (result.error) {
      setMessage({ tone: "error", text: result.error.message });
      return;
    }

    await loadData();
    setMessage({ tone: "success", text: "Option deleted." });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[65vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
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
                Back to Training
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <Settings2 size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Training Administration
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Configuration
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Manage categories, record types, selectable classes and
                SharePoint folder destinations. Use the arrow buttons in each
                table to control display order. Filenames include the employee’s
                full name and are generated from applicable fields.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
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
                <AlertTriangle size={17} />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Categories"
            value={categories.length}
            detail={`${categories.filter((item) => item.active).length} active`}
            icon={<FolderCog size={20} />}
          />
          <MetricCard
            label="Record Types"
            value={recordTypes.length}
            detail={`${recordTypes.filter((item) => item.active).length} active`}
            icon={<FileCog size={20} />}
          />
          <MetricCard
            label="Options"
            value={recordOptions.length}
            detail={`${recordOptions.filter((item) => item.active).length} active`}
            icon={<Tag size={20} />}
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 pt-5">
            <div className="flex flex-wrap gap-2">
              <Tab
                active={tab === "types"}
                onClick={() => setTab("types")}
                label="Record Types"
              />
              <Tab
                active={tab === "categories"}
                onClick={() => setTab("categories")}
                label="Categories"
              />
              <Tab
                active={tab === "options"}
                onClick={() => setTab("options")}
                label="Options"
              />
            </div>
          </div>

          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <label className="relative block flex-1">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search configuration..."
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                  />
                </label>

                {tab !== "categories" ? (
                  <Select
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    options={[
                      { value: "all", label: "All categories" },
                      ...categories.map((item) => ({
                        value: item.id,
                        label: item.name,
                      })),
                    ]}
                  />
                ) : null}

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Show inactive
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (tab === "types") newType();
                  if (tab === "categories") newCategory();
                  if (tab === "options") newOption();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                {tab === "types"
                  ? "Add Record Type"
                  : tab === "categories"
                    ? "Add Category"
                    : "Add Option"}
              </button>
            </div>
          </div>

          {tab === "types" ? (
            <TypesTable
              items={filteredTypes}
              categoryById={categoryById}
              optionCount={(id) =>
                recordOptions.filter((item) => item.training_type_id === id)
                  .length
              }
              onEdit={setTypeForm}
              onToggle={(item) =>
                void toggleRow("training_types", item.id, item.active)
              }
              onAddOption={newOption}
              onMove={(item, direction) =>
                void moveItem("training_types", recordTypes, item.id, direction)
              }
            />
          ) : null}

          {tab === "categories" ? (
            <CategoriesTable
              items={filteredCategories}
              typeCount={(id) =>
                recordTypes.filter((item) => item.category_id === id).length
              }
              onEdit={setCategoryForm}
              onToggle={(item) =>
                void toggleRow("training_categories", item.id, item.active)
              }
              onMove={(item, direction) =>
                void moveItem("training_categories", categories, item.id, direction)
              }
            />
          ) : null}

          {tab === "options" ? (
            <OptionsTable
              items={filteredOptions}
              typeById={typeById}
              onEdit={setOptionForm}
              onToggle={(item) =>
                void toggleRow(
                  "training_type_options",
                  item.id,
                  item.active,
                )
              }
              onDelete={(item) => void deleteOption(item)}
              onMove={(item, direction) =>
                void moveItem(
                  "training_type_options",
                  recordOptions.filter(
                    (option) =>
                      option.training_type_id === item.training_type_id,
                  ),
                  item.id,
                  direction,
                )
              }
            />
          ) : null}
        </section>

        <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          <div className="flex items-start gap-3">
            <FileCog size={20} className="mt-0.5 shrink-0" />
            <div>
              <h2 className="font-bold">Next step: SharePoint connection</h2>
              <p className="mt-1 leading-6 text-blue-800">
                This page defines record fields and classes. The Add Record
                and Renewals workflows will generate the filename, detect
                existing current records and ask the user whether the upload
                should supersede a previous document before anything is moved
                into the Superseded folder.
              </p>
            </div>
          </div>
        </section>
      </div>

      {categoryForm ? (
        <Modal
          title={categoryForm.id ? "Edit Category" : "Add Category"}
          onClose={() => setCategoryForm(null)}
        >
          <form onSubmit={saveCategory} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Category name"
                value={categoryForm.name}
                onChange={(value) =>
                  setCategoryForm((current) =>
                    current
                      ? {
                          ...current,
                          name: value,
                          code: current.code || makeCode(value),
                          sharepoint_folder_name:
                            current.sharepoint_folder_name || value,
                        }
                      : current,
                  )
                }
                required
              />
              <Field
                label="Code"
                value={categoryForm.code}
                onChange={(value) =>
                  setCategoryForm((current) =>
                    current
                      ? { ...current, code: makeCode(value) }
                      : current,
                  )
                }
                required
              />
            </div>

            <Field
              label="SharePoint folder name"
              value={categoryForm.sharepoint_folder_name}
              onChange={(value) =>
                setCategoryForm((current) =>
                  current
                    ? { ...current, sharepoint_folder_name: value }
                    : current,
                )
              }
              required
            />

            <Area
              label="Description"
              value={categoryForm.description ?? ""}
              onChange={(value) =>
                setCategoryForm((current) =>
                  current ? { ...current, description: value } : current,
                )
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle
                label="Active"
                description="Available when adding a record"
                checked={categoryForm.active}
                onChange={(value) =>
                  setCategoryForm((current) =>
                    current ? { ...current, active: value } : current,
                  )
                }
              />
            </div>

            <Actions
              saving={saving}
              onCancel={() => setCategoryForm(null)}
              label={categoryForm.id ? "Save Changes" : "Create Category"}
            />
          </form>
        </Modal>
      ) : null}

      {typeForm ? (
        <Modal
          wide
          title={typeForm.id ? "Edit Record Type" : "Add Record Type"}
          onClose={() => setTypeForm(null)}
        >
          <form onSubmit={saveType} className="space-y-6">
            <Section
              title="Basic details"
              description="Controls the display name, record code and category."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledSelect
                label="Category"
                value={typeForm.category_id ?? ""}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current ? { ...current, category_id: value } : current,
                  )
                }
                options={[
                  { value: "", label: "Select category" },
                  ...categories
                    .filter((item) => item.active)
                    .map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                ]}
                required
              />
              <Field
                label="Record type name"
                value={typeForm.name}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? {
                          ...current,
                          name: value,
                          code: current.code || makeCode(value),
                        }
                      : current,
                  )
                }
                required
              />
              <Field
                label="Record code"
                value={typeForm.code}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? { ...current, code: makeCode(value) }
                      : current,
                  )
                }
                required
              />
            </div>

            <Area
              label="Description"
              value={typeForm.description ?? ""}
              onChange={(value) =>
                setTypeForm((current) =>
                  current ? { ...current, description: value } : current,
                )
              }
            />

            <Section
              title="Validity and renewal"
              description="Choose how expiry is handled for this record type. Automatic expiry is calculated from the issue date during upload."
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <LabeledSelect
                label="Expiry handling"
                value={typeForm.validity_mode}
                onChange={(value) =>
                  setTypeForm((current) => {
                    if (!current) return current;
                    const mode = value as RecordType["validity_mode"];
                    return {
                      ...current,
                      validity_mode: mode,
                      requires_issue_date:
                        mode === "automatic" ? true : current.requires_issue_date,
                      requires_expiry_date: mode !== "never",
                      allows_no_expiry: mode === "never",
                      validity_interval_value:
                        mode === "automatic"
                          ? current.validity_interval_value ?? 1
                          : null,
                      validity_interval_unit:
                        mode === "automatic"
                          ? current.validity_interval_unit ?? "years"
                          : null,
                      filename_date_field:
                        mode === "never" &&
                        current.filename_date_field === "expiry_date"
                          ? "none"
                          : current.filename_date_field,
                    };
                  })
                }
                options={[
                  { value: "never", label: "Never expires" },
                  { value: "manual", label: "Enter expiry date manually" },
                  {
                    value: "automatic",
                    label: "Calculate expiry from issue date",
                  },
                ]}
              />

              <LabeledSelect
                label="Date shown in filename"
                value={typeForm.filename_date_field}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? {
                          ...current,
                          filename_date_field:
                            value as RecordType["filename_date_field"],
                        }
                      : current,
                  )
                }
                options={[
                  { value: "none", label: "No date" },
                  { value: "issue_date", label: "Issue date" },
                  ...(typeForm.validity_mode !== "never"
                    ? [{ value: "expiry_date", label: "Expiry date" }]
                    : []),
                ]}
              />
            </div>

            {typeForm.validity_mode === "automatic" ? (
              <div className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Field
                  label="Renewal interval"
                  type="number"
                  min="1"
                  step="1"
                  value={String(typeForm.validity_interval_value ?? 1)}
                  onChange={(value) =>
                    setTypeForm((current) =>
                      current
                        ? {
                            ...current,
                            validity_interval_value:
                              Number.parseInt(value, 10) || 1,
                          }
                        : current,
                    )
                  }
                  required
                />
                <LabeledSelect
                  label="Interval unit"
                  value={typeForm.validity_interval_unit ?? "years"}
                  onChange={(value) =>
                    setTypeForm((current) =>
                      current
                        ? {
                            ...current,
                            validity_interval_unit:
                              value as NonNullable<
                                RecordType["validity_interval_unit"]
                              >,
                          }
                        : current,
                    )
                  }
                  options={[
                    { value: "days", label: "Days" },
                    { value: "weeks", label: "Weeks" },
                    { value: "months", label: "Months" },
                    { value: "years", label: "Years" },
                  ]}
                />
                <p className="sm:col-span-2 text-xs leading-5 text-blue-800">
                  Upload example: entering the issue date automatically calculates
                  the expiry date using this interval. The calculated expiry is
                  saved to Supabase and used in the filename when Expiry date is
                  selected above.
                </p>
              </div>
            ) : null}

            {typeForm.validity_mode !== "automatic" ? (
              <Toggle
                label="Issue date"
                description={
                  typeForm.validity_mode === "manual"
                    ? "Ask for an issue date as well as the manually entered expiry date"
                    : "Ask for an issue date even though this record never expires"
                }
                checked={typeForm.requires_issue_date}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? { ...current, requires_issue_date: value }
                      : current,
                  )
                }
              />
            ) : null}

            <Section
              title="Dynamic form fields"
              description="Only enabled fields will appear on Add Record."
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

              <Toggle
                label="Certificate number"
                description="Ask for licence or certificate number"
                checked={typeForm.requires_certificate_number}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? {
                          ...current,
                          requires_certificate_number: value,
                        }
                      : current,
                  )
                }
              />
              <Toggle
                label="Issuer"
                description="Ask for RTO or issuing authority"
                checked={typeForm.requires_issuer}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current ? { ...current, requires_issuer: value } : current,
                  )
                }
              />
              <Toggle
                label="Project"
                description="Require project or client"
                checked={typeForm.requires_project}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current ? { ...current, requires_project: value } : current,
                  )
                }
              />
              <div className="sm:col-span-2 lg:col-span-1">
                <LabeledSelect
                  label="Document upload"
                  value={typeForm.document_upload_type}
                  onChange={(value) =>
                    setTypeForm((current) =>
                      current
                        ? {
                            ...current,
                            document_upload_type: value as DocumentUploadType,
                            requires_document: value !== "none",
                          }
                        : current,
                    )
                  }
                  options={[
                    { value: "none", label: "No document required" },
                    { value: "single", label: "Single document" },
                    {
                      value: "front_back",
                      label: "Front and back documents",
                    },
                  ]}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Single document accepts one original file, including a
                  multi-page PDF. Front and back requires two separate files and
                  adds FRONT and BACK to their SharePoint filenames.
                </p>
              </div>
              <Toggle
                label="Multiple current"
                description="Allow more than one current record"
                checked={typeForm.allows_multiple_current}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? { ...current, allows_multiple_current: value }
                      : current,
                  )
                }
              />
              <Toggle
                label="Active"
                description="Available when adding a record"
                checked={typeForm.active}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current ? { ...current, active: value } : current,
                  )
                }
              />
            </div>

            <Section
              title="Classes and current records"
              description="Choose whether the record has no classes, one class, or several classes on the same document."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledSelect
                label="Class selection"
                value={typeForm.subtype_mode}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? {
                          ...current,
                          subtype_mode: value as RecordType["subtype_mode"],
                        }
                      : current,
                  )
                }
                options={[
                  { value: "none", label: "No classes or endorsements" },
                  { value: "single", label: "One class per record" },
                  {
                    value: "multiple",
                    label: "Multiple classes on one record",
                  },
                ]}
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-800">
                  Existing record handling
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  When a document is uploaded, TTTracker will show any current
                  matching records and ask whether the new upload should renew
                  and supersede one of them or be added as another current
                  record.
                </p>
              </div>
            </div>

            <Section
              title="Generated SharePoint filename"
              description="The filename is built automatically from enabled fields. Empty or disabled values are omitted."
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Example
              </div>
              {buildFilenamePreview({
                ...typeForm,
                filename_components: filenameComponentsFor(typeForm),
              }).length ? (
                <div className="mt-2 space-y-2">
                  {buildFilenamePreview({
                    ...typeForm,
                    filename_components: filenameComponentsFor(typeForm),
                  }).map((filename) => (
                    <code
                      key={filename}
                      className="block break-all text-sm font-semibold text-slate-900"
                    >
                      {filename}
                    </code>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm font-semibold text-slate-500">
                  No document filename required
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-500">
                This preview uses generic field codes and updates from the
                selected configuration. Employee details are populated from
                Supabase during upload. For automatic renewals, the expiry date
                is calculated from the issue date and the configured interval.
              </p>
            </div>

            <Actions
              saving={saving}
              onCancel={() => setTypeForm(null)}
              label={typeForm.id ? "Save Changes" : "Create Record Type"}
            />
          </form>
        </Modal>
      ) : null}

      {optionForm ? (
        <Modal
          title={optionForm.id ? "Edit Option" : "Add Option"}
          onClose={() => setOptionForm(null)}
        >
          <form onSubmit={saveOption} className="space-y-4">
            <LabeledSelect
              label="Record type"
              value={optionForm.training_type_id}
              onChange={(value) =>
                setOptionForm((current) =>
                  current
                    ? { ...current, training_type_id: value }
                    : current,
                )
              }
              options={[
                { value: "", label: "Select record type" },
                ...recordTypes.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.code})`,
                })),
              ]}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Option name"
                value={optionForm.name}
                onChange={(value) =>
                  setOptionForm((current) =>
                    current
                      ? {
                          ...current,
                          name: value,
                          code: current.code || makeCode(value),
                        }
                      : current,
                  )
                }
                required
              />
              <Field
                label="Option code"
                value={optionForm.code}
                onChange={(value) =>
                  setOptionForm((current) =>
                    current
                      ? { ...current, code: makeCode(value) }
                      : current,
                  )
                }
                required
              />
            </div>

            <Area
              label="Description"
              value={optionForm.description ?? ""}
              onChange={(value) =>
                setOptionForm((current) =>
                  current ? { ...current, description: value } : current,
                )
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle
                label="Active"
                description="Available when adding a record"
                checked={optionForm.active}
                onChange={(value) =>
                  setOptionForm((current) =>
                    current ? { ...current, active: value } : current,
                  )
                }
              />
            </div>

            <Actions
              saving={saving}
              onCancel={() => setOptionForm(null)}
              label={optionForm.id ? "Save Changes" : "Create Option"}
            />
          </form>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function TypesTable({
  items,
  categoryById,
  optionCount,
  onEdit,
  onToggle,
  onAddOption,
  onMove,
}: {
  items: RecordType[];
  categoryById: Map<string, Category>;
  optionCount: (id: string) => number;
  onEdit: (item: RecordType) => void;
  onToggle: (item: RecordType) => void;
  onAddOption: (id: string) => void;
  onMove: (item: RecordType, direction: "up" | "down") => void;
}) {
  if (!items.length) return <Empty text="No record types found." />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Record Type</th>
            <th className="px-5 py-3 font-semibold">Category</th>
            <th className="px-5 py-3 font-semibold">Fields</th>
            <th className="px-5 py-3 font-semibold">Options</th>
            <th className="px-5 py-3 font-semibold">Current Records</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const fields = [
              item.validity_mode === "automatic"
                ? `Auto ${item.validity_interval_value ?? "?"} ${item.validity_interval_unit ?? ""}`
                : item.validity_mode === "manual"
                  ? "Manual expiry"
                  : "Never expires",
              item.filename_date_field === "expiry_date"
                ? "Filename: expiry"
                : item.filename_date_field === "issue_date"
                  ? "Filename: issue"
                  : null,
              item.requires_certificate_number ? "Number" : null,
              item.requires_issuer ? "Issuer" : null,
              item.requires_project ? "Project" : null,
              item.document_upload_type === "front_back"
                ? "Front + back"
                : item.document_upload_type === "single"
                  ? "Single document"
                  : "No document",
            ].filter(Boolean);

            return (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-950">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.code}
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-700">
                  {item.category_id
                    ? categoryById.get(item.category_id)?.name ?? "Unknown"
                    : item.category ?? "Unassigned"}
                </td>
                <td className="px-5 py-4">
                  <div className="flex max-w-sm flex-wrap gap-1.5">
                    {fields.map((field) => (
                      <span
                        key={field}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-slate-700">
                    {item.subtype_mode === "none"
                      ? "None"
                      : item.subtype_mode === "single"
                        ? "Single"
                        : "Multiple"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {optionCount(item.id)} configured
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {item.allows_multiple_current
                    ? "Multiple current allowed"
                    : "Prompt on upload / renewal"}
                </td>
                <td className="px-5 py-4">
                  <Status active={item.active} />
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <IconButton
                      title="Move earlier"
                      onClick={() => onMove(item, "up")}
                      icon={<ArrowUp size={15} />}
                    />
                    <IconButton
                      title="Move later"
                      onClick={() => onMove(item, "down")}
                      icon={<ArrowDown size={15} />}
                    />
                    <IconButton
                      title="Add option"
                      onClick={() => onAddOption(item.id)}
                      icon={<Plus size={15} />}
                    />
                    <IconButton
                      title="Edit"
                      onClick={() => onEdit(item)}
                      icon={<Pencil size={15} />}
                    />
                    <IconButton
                      title={item.active ? "Deactivate" : "Activate"}
                      onClick={() => onToggle(item)}
                      icon={
                        item.active ? (
                          <ToggleRight size={17} />
                        ) : (
                          <ToggleLeft size={17} />
                        )
                      }
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CategoriesTable({
  items,
  typeCount,
  onEdit,
  onToggle,
  onMove,
}: {
  items: Category[];
  typeCount: (id: string) => number;
  onEdit: (item: Category) => void;
  onToggle: (item: Category) => void;
  onMove: (item: Category, direction: "up" | "down") => void;
}) {
  if (!items.length) return <Empty text="No categories found." />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Category</th>
            <th className="px-5 py-3 font-semibold">SharePoint Folder</th>
            <th className="px-5 py-3 font-semibold">Types</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="px-5 py-4">
                <div className="font-bold text-slate-950">{item.name}</div>
                <div className="mt-1 text-xs text-slate-500">{item.code}</div>
                {item.description ? (
                  <div className="mt-2 max-w-xl text-xs text-slate-500">
                    {item.description}
                  </div>
                ) : null}
              </td>
              <td className="px-5 py-4">
                <code className="rounded bg-slate-100 px-2 py-1 text-xs">
                  {item.sharepoint_folder_name}
                </code>
              </td>
              <td className="px-5 py-4 font-semibold text-slate-700">
                {typeCount(item.id)}
              </td>
              <td className="px-5 py-4">
                <Status active={item.active} />
              </td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <IconButton
                    title="Move earlier"
                    onClick={() => onMove(item, "up")}
                    icon={<ArrowUp size={15} />}
                  />
                  <IconButton
                    title="Move later"
                    onClick={() => onMove(item, "down")}
                    icon={<ArrowDown size={15} />}
                  />
                  <IconButton
                    title="Edit"
                    onClick={() => onEdit(item)}
                    icon={<Pencil size={15} />}
                  />
                  <IconButton
                    title={item.active ? "Deactivate" : "Activate"}
                    onClick={() => onToggle(item)}
                    icon={
                      item.active ? (
                        <ToggleRight size={17} />
                      ) : (
                        <ToggleLeft size={17} />
                      )
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptionsTable({
  items,
  typeById,
  onEdit,
  onToggle,
  onDelete,
  onMove,
}: {
  items: RecordOption[];
  typeById: Map<string, RecordType>;
  onEdit: (item: RecordOption) => void;
  onToggle: (item: RecordOption) => void;
  onDelete: (item: RecordOption) => void;
  onMove: (item: RecordOption, direction: "up" | "down") => void;
}) {
  if (!items.length) return <Empty text="No options found." />;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3 font-semibold">Option</th>
            <th className="px-5 py-3 font-semibold">Record Type</th>
            <th className="px-5 py-3 font-semibold">Description</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-50">
              <td className="px-5 py-4">
                <div className="font-bold text-slate-950">{item.name}</div>
                <div className="mt-1 text-xs text-slate-500">{item.code}</div>
              </td>
              <td className="px-5 py-4 text-slate-700">
                {typeById.get(item.training_type_id)?.name ?? "Unknown"}
              </td>
              <td className="px-5 py-4 text-xs text-slate-500">
                {item.description || "No description"}
              </td>
              <td className="px-5 py-4">
                <Status active={item.active} />
              </td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <IconButton
                    title="Move earlier"
                    onClick={() => onMove(item, "up")}
                    icon={<ArrowUp size={15} />}
                  />
                  <IconButton
                    title="Move later"
                    onClick={() => onMove(item, "down")}
                    icon={<ArrowDown size={15} />}
                  />
                  <IconButton
                    title="Edit"
                    onClick={() => onEdit(item)}
                    icon={<Pencil size={15} />}
                  />
                  <IconButton
                    title={item.active ? "Deactivate" : "Activate"}
                    onClick={() => onToggle(item)}
                    icon={
                      item.active ? (
                        <ToggleRight size={17} />
                      ) : (
                        <ToggleLeft size={17} />
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-600">{label}</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Tab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 pb-3 text-sm font-semibold ${
        active
          ? "border-slate-950 text-slate-950"
          : "border-transparent text-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-500"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white"
      title={title}
    >
      {icon}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="p-12 text-center text-sm font-medium text-slate-500">
      {text}
    </div>
  );
}

function Modal({
  title,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white shadow-2xl ${
          wide ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="font-bold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "number";
  min?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="relative mt-2">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm outline-none ring-slate-200 focus:ring-2 disabled:bg-slate-100"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block min-w-48">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
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

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
      <div>
        <div className="text-sm font-bold text-slate-800">{label}</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300"
      />
    </label>
  );
}

function Actions({
  saving,
  onCancel,
  label,
}: {
  saving: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
      >
        <X size={16} />
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {label}
      </button>
    </div>
  );
}