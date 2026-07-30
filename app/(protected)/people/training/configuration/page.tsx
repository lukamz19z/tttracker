"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
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
  requires_certificate_number: boolean;
  requires_issuer: boolean;
  requires_project: boolean;
  requires_document: boolean;
  allows_multiple_current: boolean;
  subtype_mode: "none" | "single" | "multiple";
  supersede_scope:
    | "type"
    | "type_and_option"
    | "type_option_and_project"
    | "never";
  filename_pattern: string;
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

const DEFAULT_FILENAME_PATTERN =
  "{employee_id}_{record_code}_{option_code}_{expiry_date}";

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
          "id, category_id, name, code:short_code, category, description, active, requires_issue_date, requires_expiry_date, allows_no_expiry, requires_certificate_number, requires_issuer, requires_project, requires_document, allows_multiple_current, subtype_mode, supersede_scope, filename_pattern, sort_order",
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
    setRecordTypes((typeResult.data ?? []) as RecordType[]);
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
      sort_order: 0,
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
      allows_no_expiry: true,
      requires_certificate_number: false,
      requires_issuer: false,
      requires_project: false,
      requires_document: true,
      allows_multiple_current: false,
      subtype_mode: "none",
      supersede_scope: "type",
      filename_pattern: DEFAULT_FILENAME_PATTERN,
      sort_order: 0,
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
      sort_order: 0,
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
        requires_issue_date: typeForm.requires_issue_date,
        requires_expiry_date: typeForm.requires_expiry_date,
        allows_no_expiry: typeForm.allows_no_expiry,
        requires_certificate_number: typeForm.requires_certificate_number,
        requires_issuer: typeForm.requires_issuer,
        requires_project: typeForm.requires_project,
        requires_document: typeForm.requires_document,
        allows_multiple_current: typeForm.allows_multiple_current,
        subtype_mode: typeForm.subtype_mode,
        supersede_scope: typeForm.allows_multiple_current
          ? "never"
          : typeForm.supersede_scope,
        filename_pattern:
          clean(typeForm.filename_pattern) || DEFAULT_FILENAME_PATTERN,
        sort_order: typeForm.sort_order || 0,
      };

      if (!payload.name) throw new Error("Record type name is required.");
      if (!payload.short_code) throw new Error("Record type code is required.");

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
                Manage categories, record types, selectable options, SharePoint
                folder destinations, filename rules and automatic superseding.
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
            />
          ) : null}
        </section>

        <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          <div className="flex items-start gap-3">
            <FileCog size={20} className="mt-0.5 shrink-0" />
            <div>
              <h2 className="font-bold">Next step: SharePoint connection</h2>
              <p className="mt-1 leading-6 text-blue-800">
                This page defines the rules. Next we connect Microsoft Graph on
                the server, locate the TTTracker Training Documents library,
                and then build Add Record so files are renamed and uploaded
                directly to SharePoint.
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
              <NumberField
                label="Sort order"
                value={categoryForm.sort_order}
                onChange={(value) =>
                  setCategoryForm((current) =>
                    current ? { ...current, sort_order: value } : current,
                  )
                }
              />
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
              <NumberField
                label="Sort order"
                value={typeForm.sort_order}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current ? { ...current, sort_order: value } : current,
                  )
                }
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
              title="Dynamic form fields"
              description="Only enabled fields will appear on Add Record."
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle
                label="Issue date"
                description="Ask for issue date"
                checked={typeForm.requires_issue_date}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? { ...current, requires_issue_date: value }
                      : current,
                  )
                }
              />
              <Toggle
                label="Expiry date"
                description="Ask for expiry date"
                checked={typeForm.requires_expiry_date}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? { ...current, requires_expiry_date: value }
                      : current,
                  )
                }
              />
              <Toggle
                label="Allow no expiry"
                description="Supports permanent qualifications"
                checked={typeForm.allows_no_expiry}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? { ...current, allows_no_expiry: value }
                      : current,
                  )
                }
              />
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
              <Toggle
                label="Document"
                description="Evidence upload is mandatory"
                checked={typeForm.requires_document}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current ? { ...current, requires_document: value } : current,
                  )
                }
              />
              <Toggle
                label="Multiple current"
                description="Allow more than one current record"
                checked={typeForm.allows_multiple_current}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? {
                          ...current,
                          allows_multiple_current: value,
                          supersede_scope: value
                            ? "never"
                            : current.supersede_scope === "never"
                              ? "type"
                              : current.supersede_scope,
                        }
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
              title="Options and superseding"
              description="Options are used for classes such as DG, RB, RI, RA and driver licence classes."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledSelect
                label="Option selection"
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
                  { value: "none", label: "No options" },
                  { value: "single", label: "Single option" },
                  { value: "multiple", label: "Multiple options" },
                ]}
              />

              <LabeledSelect
                label="Supersede matching rule"
                value={
                  typeForm.allows_multiple_current
                    ? "never"
                    : typeForm.supersede_scope
                }
                disabled={typeForm.allows_multiple_current}
                onChange={(value) =>
                  setTypeForm((current) =>
                    current
                      ? {
                          ...current,
                          supersede_scope:
                            value as RecordType["supersede_scope"],
                        }
                      : current,
                  )
                }
                options={[
                  { value: "type", label: "Same employee + record type" },
                  {
                    value: "type_and_option",
                    label: "Same employee + type + option",
                  },
                  {
                    value: "type_option_and_project",
                    label: "Same employee + type + option + project",
                  },
                  { value: "never", label: "Never supersede automatically" },
                ]}
              />
            </div>

            <Section
              title="SharePoint filename"
              description="The file extension is added automatically."
            />

            <Field
              label="Filename pattern"
              value={typeForm.filename_pattern}
              onChange={(value) =>
                setTypeForm((current) =>
                  current ? { ...current, filename_pattern: value } : current,
                )
              }
              required
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              Tokens: <code>{"{employee_id}"}</code>,{" "}
              <code>{"{employee_name}"}</code>,{" "}
              <code>{"{record_code}"}</code>,{" "}
              <code>{"{option_code}"}</code>,{" "}
              <code>{"{project_code}"}</code>,{" "}
              <code>{"{issue_date}"}</code>,{" "}
              <code>{"{expiry_date}"}</code>,{" "}
              <code>{"{document_side}"}</code>.
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
              <NumberField
                label="Sort order"
                value={optionForm.sort_order}
                onChange={(value) =>
                  setOptionForm((current) =>
                    current ? { ...current, sort_order: value } : current,
                  )
                }
              />
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
}: {
  items: RecordType[];
  categoryById: Map<string, Category>;
  optionCount: (id: string) => number;
  onEdit: (item: RecordType) => void;
  onToggle: (item: RecordType) => void;
  onAddOption: (id: string) => void;
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
            <th className="px-5 py-3 font-semibold">Superseding</th>
            <th className="px-5 py-3 font-semibold">Status</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const fields = [
              item.requires_issue_date ? "Issue" : null,
              item.requires_expiry_date ? "Expiry" : null,
              item.requires_certificate_number ? "Number" : null,
              item.requires_issuer ? "Issuer" : null,
              item.requires_project ? "Project" : null,
              item.requires_document ? "Document" : null,
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
                    ? "Multiple current"
                    : item.supersede_scope.replaceAll("_", " ")}
                </td>
                <td className="px-5 py-4">
                  <Status active={item.active} />
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
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
}: {
  items: Category[];
  typeCount: (id: string) => number;
  onEdit: (item: Category) => void;
  onToggle: (item: Category) => void;
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
}: {
  items: RecordOption[];
  typeById: Map<string, RecordType>;
  onEdit: (item: RecordOption) => void;
  onToggle: (item: RecordOption) => void;
  onDelete: (item: RecordOption) => void;
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
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