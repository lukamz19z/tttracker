"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Database,
  FileCog,
  FolderCog,
  FolderSync,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Message = { tone: "success" | "error"; text: string };

type TrainingCategory = {
  id: string;
  name: string;
  code: string | null;
  sharepoint_folder_name: string | null;
  active: boolean | null;
};

type TrainingType = {
  id: string;
  category_id: string | null;
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;
  requires_review: boolean | null;
  allow_bulk_upload: boolean | null;
  is_project_onboarding: boolean | null;
  allowed_extensions: string[] | null;
  max_file_size_mb: number | null;
  expiry_warning_days: number[] | null;
};

type TrainingField = {
  id: string;
  training_type_id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  options: unknown;
  placeholder: string | null;
  help_text: string | null;
  sharepoint_column: string | null;
  sort_order: number;
  active: boolean;
};

type ReviewRule = {
  id: string;
  scope_type: "all" | "category" | "type";
  category_id: string | null;
  training_type_id: string | null;
  principal_type: "user" | "role";
  user_id: string | null;
  role: string | null;
  can_review: boolean;
  receives_in_app: boolean;
  receives_push: boolean;
  receives_email: boolean;
  active: boolean;
  sort_order: number;
};

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  user_id: string | null;
  active: boolean | null;
  sharepoint_folder_id: string | null;
};

type RoleRow = {
  user_id: string;
  role: string;
};

type Drive = {
  id: string;
  name: string;
  webUrl: string | null;
};

type Settings = {
  sharepoint_site_id: string | null;
  sharepoint_site_name: string | null;
  sharepoint_site_url: string | null;
  sharepoint_drive_id: string | null;
  sharepoint_drive_name: string | null;
  sharepoint_base_folder: string;
  employee_folder_template: string;
  training_subfolder_name: string;
  staging_bucket: string;
  core_metadata_map: Record<string, string>;
  expiry_scan_enabled: boolean;
  default_expiry_warning_days: number[];
  push_enabled: boolean;
  in_app_enabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  sharepoint_site_id: null,
  sharepoint_site_name: null,
  sharepoint_site_url: null,
  sharepoint_drive_id: null,
  sharepoint_drive_name: null,
  sharepoint_base_folder: "Employees",
  employee_folder_template: "{payroll_id} - {employee_name}",
  training_subfolder_name: "Training",
  staging_bucket: "training-staging",
  core_metadata_map: {
    employee_id: "",
    employee_name: "",
    training_type: "",
    training_code: "",
    certificate_number: "",
    provider: "",
    issue_date: "",
    expiry_date: "",
    project: "",
    status: "",
    tttracker_record_id: "",
    option_codes: "",
  },
  expiry_scan_enabled: true,
  default_expiry_warning_days: [90, 60, 30, 14, 7],
  push_enabled: true,
  in_app_enabled: true,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function csvNumbers(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item >= 0)
        .map((item) => Math.round(item)),
    ),
  ).sort((a, b) => b - a);
}

function csvExtensions(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean),
    ),
  );
}

function normaliseSettings(row: unknown): Settings {
  const source =
    row && typeof row === "object"
      ? (row as Partial<Settings>)
      : {};

  return {
    ...DEFAULT_SETTINGS,
    ...source,
    sharepoint_base_folder:
      clean(source.sharepoint_base_folder) || "Employees",
    employee_folder_template:
      clean(source.employee_folder_template) ||
      "{payroll_id} - {employee_name}",
    training_subfolder_name:
      clean(source.training_subfolder_name) || "Training",
    staging_bucket:
      clean(source.staging_bucket) || "training-staging",
    core_metadata_map: {
      ...DEFAULT_SETTINGS.core_metadata_map,
      ...(source.core_metadata_map &&
      typeof source.core_metadata_map === "object"
        ? source.core_metadata_map
        : {}),
    },
    default_expiry_warning_days: Array.isArray(
      source.default_expiry_warning_days,
    )
      ? source.default_expiry_warning_days
      : DEFAULT_SETTINGS.default_expiry_warning_days,
  };
}

export default function TrainingWorkflowConfigurationPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [categories, setCategories] = useState<TrainingCategory[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [fields, setFields] = useState<TrainingField[]>([]);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [newField, setNewField] = useState({
    label: "",
    fieldKey: "",
    fieldType: "text",
    required: false,
    options: "",
    placeholder: "",
    helpText: "",
    sharepointColumn: "",
  });

  const [newRule, setNewRule] = useState({
    scopeType: "all" as "all" | "category" | "type",
    categoryId: "",
    trainingTypeId: "",
    principalType: "role" as "role" | "user",
    role: "hseq",
    userId: "",
    receivesInApp: true,
    receivesPush: true,
    receivesEmail: false,
  });

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  const loadData = useCallback(async () => {
    const [
      categoryResult,
      typeResult,
      fieldResult,
      ruleResult,
      employeeResult,
      roleResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from("training_categories")
        .select(
          "id,name,code,sharepoint_folder_name,active",
        )
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_types")
        .select(
          "id,category_id,name,short_code,category,active,requires_review,allow_bulk_upload,is_project_onboarding,allowed_extensions,max_file_size_mb,expiry_warning_days",
        )
        .order("sort_order")
        .order("name"),
      supabase
        .from("training_type_fields")
        .select("*")
        .order("sort_order")
        .order("label"),
      supabase
        .from("training_review_rules")
        .select("*")
        .order("sort_order"),
      supabase
        .from("employees")
        .select(
          "id,payroll_id,full_name,user_id,active,sharepoint_folder_id",
        )
        .order("full_name"),
      supabase.from("user_roles").select("user_id,role"),
      supabase
        .from("training_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle(),
    ]);

    const errors = [
      categoryResult.error,
      typeResult.error,
      fieldResult.error,
      ruleResult.error,
      employeeResult.error,
      roleResult.error,
      settingsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0]?.message || "Unable to load Training configuration.");
    }

    setCategories((categoryResult.data ?? []) as TrainingCategory[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setFields((fieldResult.data ?? []) as TrainingField[]);
    setRules((ruleResult.data ?? []) as ReviewRule[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setRoleRows((roleResult.data ?? []) as RoleRow[]);
    setSettings(normaliseSettings(settingsResult.data));

    const loadedTypes = (typeResult.data ?? []) as TrainingType[];
    setSelectedTypeId((current) => {
      if (current && loadedTypes.some((item) => item.id === current)) {
        return current;
      }
      return loadedTypes.find((item) => item.active !== false)?.id ?? "";
    });

    try {
      const response = await apiFetch(
        "/api/training/configuration/sharepoint",
      );
      const payload = await response.json();

      if (response.ok) {
        setDrives((payload.drives ?? []) as Drive[]);
      }
    } catch (error) {
      console.warn("SharePoint drive list could not be loaded", error);
    }
  }, [apiFetch, supabase]);

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
              : "Unable to load Training configuration.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const selectedType = useMemo(
    () => types.find((item) => item.id === selectedTypeId) ?? null,
    [selectedTypeId, types],
  );

  const selectedTypeFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.training_type_id === selectedTypeId &&
          field.active !== false,
      ),
    [fields, selectedTypeId],
  );

  const roles = useMemo(
    () =>
      Array.from(
        new Set(roleRows.map((row) => clean(row.role)).filter(Boolean)),
      ).sort(),
    [roleRows],
  );

  const userOptions = useMemo(
    () =>
      employees
        .filter((employee) => employee.user_id)
        .map((employee) => ({
          userId: employee.user_id as string,
          label: `${employee.full_name}${
            employee.payroll_id ? ` (${employee.payroll_id})` : ""
          }`,
        })),
    [employees],
  );

  const linkedFolderCount = employees.filter(
    (employee) => clean(employee.sharepoint_folder_id),
  ).length;

  async function saveSettings() {
    setSaving(true);
    setMessage(null);

    try {
      const selectedDrive = drives.find(
        (drive) => drive.id === settings.sharepoint_drive_id,
      );

      const payload = {
        id: true,
        ...settings,
        sharepoint_drive_name:
          selectedDrive?.name ?? settings.sharepoint_drive_name,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("training_settings")
        .upsert(payload, { onConflict: "id" });

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: "Training workflow and SharePoint settings saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save Training settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedType() {
    if (!selectedType) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("training_types")
        .update({
          requires_review: selectedType.requires_review !== false,
          allow_bulk_upload: selectedType.allow_bulk_upload !== false,
          is_project_onboarding:
            selectedType.is_project_onboarding === true,
          allowed_extensions:
            selectedType.allowed_extensions?.length
              ? selectedType.allowed_extensions
              : ["pdf", "jpg", "jpeg", "png"],
          max_file_size_mb:
            Number(selectedType.max_file_size_mb ?? 20) || 20,
          expiry_warning_days:
            selectedType.expiry_warning_days?.length
              ? selectedType.expiry_warning_days
              : null,
        })
        .eq("id", selectedType.id);

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: `${selectedType.name} workflow settings saved.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the Training Type.",
      });
    } finally {
      setSaving(false);
    }
  }

  function patchSelectedType(patch: Partial<TrainingType>) {
    if (!selectedType) return;

    setTypes((current) =>
      current.map((item) =>
        item.id === selectedType.id ? { ...item, ...patch } : item,
      ),
    );
  }

  async function addField() {
    if (!selectedTypeId) return;

    const label = clean(newField.label);
    const fieldKey =
      clean(newField.fieldKey) ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!label || !fieldKey) {
      setMessage({
        tone: "error",
        text: "Enter a custom field label and key.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const options =
        newField.fieldType === "select" ||
        newField.fieldType === "multiselect"
          ? newField.options
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [];

      const { error } = await supabase
        .from("training_type_fields")
        .insert({
          training_type_id: selectedTypeId,
          field_key: fieldKey,
          label,
          field_type: newField.fieldType,
          required: newField.required,
          options,
          placeholder: clean(newField.placeholder) || null,
          help_text: clean(newField.helpText) || null,
          sharepoint_column:
            clean(newField.sharepointColumn) || null,
          sort_order:
            ((selectedTypeFields[selectedTypeFields.length - 1]?.sort_order ?? 0) + 10),
          active: true,
        });

      if (error) throw new Error(error.message);

      setNewField({
        label: "",
        fieldKey: "",
        fieldType: "text",
        required: false,
        options: "",
        placeholder: "",
        helpText: "",
        sharepointColumn: "",
      });

      await loadData();
      setMessage({
        tone: "success",
        text: "Custom Training field added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to add the custom field.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeField(field: TrainingField) {
    if (
      !window.confirm(
        `Remove "${field.label}" from this Training Type? Historical record metadata is not deleted.`,
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("training_type_fields")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", field.id);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
  }

  async function addReviewRule() {
    if (
      newRule.scopeType === "category" &&
      !newRule.categoryId
    ) {
      setMessage({
        tone: "error",
        text: "Select the category for this review rule.",
      });
      return;
    }

    if (
      newRule.scopeType === "type" &&
      !newRule.trainingTypeId
    ) {
      setMessage({
        tone: "error",
        text: "Select the Training Type for this review rule.",
      });
      return;
    }

    if (
      newRule.principalType === "user" &&
      !newRule.userId
    ) {
      setMessage({
        tone: "error",
        text: "Select the reviewer.",
      });
      return;
    }

    if (
      newRule.principalType === "role" &&
      !newRule.role
    ) {
      setMessage({
        tone: "error",
        text: "Select the reviewer role.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("training_review_rules")
        .insert({
          scope_type: newRule.scopeType,
          category_id:
            newRule.scopeType === "category"
              ? newRule.categoryId
              : null,
          training_type_id:
            newRule.scopeType === "type"
              ? newRule.trainingTypeId
              : null,
          principal_type: newRule.principalType,
          user_id:
            newRule.principalType === "user"
              ? newRule.userId
              : null,
          role:
            newRule.principalType === "role"
              ? newRule.role
              : null,
          can_review: true,
          receives_in_app: newRule.receivesInApp,
          receives_push: newRule.receivesPush,
          receives_email: newRule.receivesEmail,
          active: true,
          sort_order: ((rules[rules.length - 1]?.sort_order ?? 0) + 10),
        });

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: "Training reviewer rule added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to add the reviewer rule.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(rule: ReviewRule) {
    if (!window.confirm("Delete this Training reviewer rule?")) {
      return;
    }

    const { error } = await supabase
      .from("training_review_rules")
      .delete()
      .eq("id", rule.id);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
  }

  async function provisionEmployeeFolders() {
    if (
      !window.confirm(
        "Create or link the SharePoint employee + Training folders for every active employee profile? Existing matching folders are reused.",
      )
    ) {
      return;
    }

    setProvisioning(true);
    setMessage(null);

    try {
      const response = await apiFetch(
        "/api/training/employees/provision-folders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeInactive: false }),
        },
      );

      const responseText = await response.text();

      let payload: {
        error?: string;
        provisioned?: number;
        failed?: number;
        successes?: unknown[];
        failures?: Array<{
          employeeId?: string;
          employeeName?: string;
          error?: string;
        }>;
      } | null = null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            error?: string;
            provisioned?: number;
            failed?: number;
            successes?: unknown[];
            failures?: Array<{
              employeeId?: string;
              employeeName?: string;
              error?: string;
            }>;
          };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const serverMessage = clean(payload?.error);
        const rawMessage = clean(responseText);

        console.error("Employee folder provisioning failed", {
          status: response.status,
          statusText: response.statusText,
          response: rawMessage,
        });

        throw new Error(
          serverMessage ||
            (rawMessage && !rawMessage.startsWith("<")
              ? `Provisioning failed (${response.status}): ${rawMessage.slice(0, 500)}`
              : `Provisioning failed (${response.status} ${response.statusText}). The API returned an HTML page instead of JSON. Confirm that app/api/training/employees/provision-folders/route.ts exists and check the Next.js terminal for a route compile error.`),
        );
      }

      if (!payload) {
        throw new Error(
          `Provisioning returned an invalid response (${response.status} ${response.statusText}).`,
        );
      }

      await loadData();

      const failed = Number(payload.failed ?? 0);
      const provisioned = Number(payload.provisioned ?? 0);

      setMessage({
        tone: failed > 0 ? "error" : "success",
        text:
          failed > 0
            ? `${provisioned} employee folders linked/created; ${failed} failed. ${payload.failures?.[0]?.error ? `First error: ${payload.failures[0].error}` : "Check the server log or retry after fixing the affected profile."}`
            : `${provisioned} active employee profiles are now linked to SharePoint folders.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to provision employee folders.",
      });
    } finally {
      setProvisioning(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[65vh] items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={30} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            href="/people/training"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Training
          </Link>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <Settings2 size={17} />
                Training administration
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Workflow & SharePoint Configuration
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Control where employee training files are stored, which records
                need review, who reviews them, which fields are mandatory and
                which metadata is written to SharePoint.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/people/training/configuration"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Types / Categories / Options
              </Link>
              <Link
                href="/people/training/bulk-upload"
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                Bulk Upload
              </Link>
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-start gap-2">
              {message.tone === "success" ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              )}
              {message.text}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<FileCog size={20} />}
            label="Training Types"
            value={types.length}
            detail={`${types.filter((item) => item.active !== false).length} active`}
          />
          <Metric
            icon={<BellRing size={20} />}
            label="Review Rules"
            value={rules.filter((item) => item.active !== false).length}
            detail="Configured reviewers"
          />
          <Metric
            icon={<Users size={20} />}
            label="Employee Profiles"
            value={employees.length}
            detail={`${employees.filter((item) => item.active !== false).length} active`}
          />
          <Metric
            icon={<FolderSync size={20} />}
            label="SharePoint Linked"
            value={linkedFolderCount}
            detail={`${employees.length - linkedFolderCount} profiles not linked yet`}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
              <FolderCog size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">
                SharePoint employee folders
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                This supports employees that already existed before the update.
                If a profile has no SharePoint folder ID, TTTracker finds or
                creates the employee folder and writes the link back to that
                existing employee profile.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Field label="SharePoint document library">
              <select
                value={settings.sharepoint_drive_id ?? ""}
                onChange={(event) => {
                  const drive = drives.find(
                    (item) => item.id === event.target.value,
                  );
                  setSettings((current) => ({
                    ...current,
                    sharepoint_drive_id: event.target.value || null,
                    sharepoint_drive_name: drive?.name ?? null,
                  }));
                }}
                className={inputClass}
              >
                <option value="">Select library...</option>
                {drives.map((drive) => (
                  <option key={drive.id} value={drive.id}>
                    {drive.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Base employee folder">
              <input
                className={inputClass}
                value={settings.sharepoint_base_folder}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    sharepoint_base_folder: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Employee folder template">
              <input
                className={inputClass}
                value={settings.employee_folder_template}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    employee_folder_template: event.target.value,
                  }))
                }
              />
              <Hint>
                Use {"{payroll_id}"} and {"{employee_name}"}. Existing matching
                folders are reused.
              </Hint>
            </Field>

            <Field label="Training subfolder">
              <input
                className={inputClass}
                value={settings.training_subfolder_name}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    training_subfolder_name: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Default expiry warnings (days)">
              <input
                className={inputClass}
                value={settings.default_expiry_warning_days.join(", ")}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    default_expiry_warning_days: csvNumbers(
                      event.target.value,
                    ),
                  }))
                }
              />
            </Field>

            <div className="flex flex-col justify-end gap-2">
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Save SharePoint Settings
              </button>
              <button
                type="button"
                onClick={() => void provisionEmployeeFolders()}
                disabled={provisioning || !settings.sharepoint_drive_id}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 disabled:opacity-50"
              >
                {provisioning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FolderSync size={16} />
                )}
                Provision Existing Employee Profiles
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-violet-50 p-2 text-violet-700">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">
                SharePoint metadata mapping
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Enter the SharePoint column internal name for any field you
                want written to the uploaded document&apos;s metadata.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(settings.core_metadata_map).map(
              ([key, value]) => (
                <Field key={key} label={key.replaceAll("_", " ")}>
                  <input
                    className={inputClass}
                    placeholder="SharePoint internal column name"
                    value={value}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        core_metadata_map: {
                          ...current.core_metadata_map,
                          [key]: event.target.value,
                        },
                      }))
                    }
                  />
                </Field>
              ),
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              <Save size={16} />
              Save Metadata Mapping
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-black text-slate-950">
              Type-specific workflow
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Your existing Training Configuration page still owns the type
              name, category, validity rules, filename rules and class options.
              This section controls review, bulk upload and extra metadata
              fields.
            </p>
          </div>

          <Field label="Training Type">
            <select
              className={inputClass}
              value={selectedTypeId}
              onChange={(event) => setSelectedTypeId(event.target.value)}
            >
              <option value="">Select type...</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.short_code ? ` (${type.short_code})` : ""}
                </option>
              ))}
            </select>
          </Field>

          {selectedType ? (
            <>
              <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <Toggle
                  label="Review required"
                  checked={selectedType.requires_review !== false}
                  onChange={(checked) =>
                    patchSelectedType({ requires_review: checked })
                  }
                />
                <Toggle
                  label="Allow bulk upload"
                  checked={selectedType.allow_bulk_upload !== false}
                  onChange={(checked) =>
                    patchSelectedType({ allow_bulk_upload: checked })
                  }
                />
                <Toggle
                  label="Project onboarding item"
                  checked={selectedType.is_project_onboarding === true}
                  onChange={(checked) =>
                    patchSelectedType({
                      is_project_onboarding: checked,
                    })
                  }
                />
                <Field label="Max file size (MB)">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className={inputClass}
                    value={selectedType.max_file_size_mb ?? 20}
                    onChange={(event) =>
                      patchSelectedType({
                        max_file_size_mb:
                          Number(event.target.value) || 20,
                      })
                    }
                  />
                </Field>

                <Field label="Allowed file extensions">
                  <input
                    className={inputClass}
                    value={(
                      selectedType.allowed_extensions ?? [
                        "pdf",
                        "jpg",
                        "jpeg",
                        "png",
                      ]
                    ).join(", ")}
                    onChange={(event) =>
                      patchSelectedType({
                        allowed_extensions: csvExtensions(
                          event.target.value,
                        ),
                      })
                    }
                  />
                </Field>

                <Field label="Expiry warning days">
                  <input
                    className={inputClass}
                    placeholder="Blank = company default"
                    value={(
                      selectedType.expiry_warning_days ?? []
                    ).join(", ")}
                    onChange={(event) =>
                      patchSelectedType({
                        expiry_warning_days: csvNumbers(
                          event.target.value,
                        ),
                      })
                    }
                  />
                </Field>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveSelectedType()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  <Save size={16} />
                  Save Type Workflow
                </button>
              </div>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <h3 className="text-lg font-black text-slate-950">
                  Additional data fields
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Add any licence/VOC-specific data that should be captured and
                  optionally mapped to SharePoint metadata.
                </p>

                <div className="mt-4 space-y-2">
                  {selectedTypeFields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                      No custom fields configured for this Training Type.
                    </div>
                  ) : (
                    selectedTypeFields.map((field) => (
                      <div
                        key={field.id}
                        className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1fr_160px_100px_1fr_auto] md:items-center"
                      >
                        <div>
                          <div className="font-black text-slate-900">
                            {field.label}
                          </div>
                          <div className="text-xs text-slate-500">
                            {field.field_key}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-slate-700">
                          {field.field_type}
                        </div>
                        <div className="text-sm font-semibold text-slate-700">
                          {field.required ? "Required" : "Optional"}
                        </div>
                        <div className="text-sm text-slate-500">
                          {field.sharepoint_column
                            ? `SP: ${field.sharepoint_column}`
                            : "No SharePoint column"}
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeField(field)}
                          className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-5 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Field label">
                    <input
                      className={inputClass}
                      value={newField.label}
                      onChange={(event) =>
                        setNewField((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Field key">
                    <input
                      className={inputClass}
                      placeholder="Auto from label"
                      value={newField.fieldKey}
                      onChange={(event) =>
                        setNewField((current) => ({
                          ...current,
                          fieldKey: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Field type">
                    <select
                      className={inputClass}
                      value={newField.fieldType}
                      onChange={(event) =>
                        setNewField((current) => ({
                          ...current,
                          fieldType: event.target.value,
                        }))
                      }
                    >
                      {[
                        "text",
                        "number",
                        "date",
                        "select",
                        "multiselect",
                        "checkbox",
                        "textarea",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="SharePoint column">
                    <input
                      className={inputClass}
                      value={newField.sharepointColumn}
                      onChange={(event) =>
                        setNewField((current) => ({
                          ...current,
                          sharepointColumn: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  {(newField.fieldType === "select" ||
                    newField.fieldType === "multiselect") && (
                    <Field label="Options">
                      <input
                        className={inputClass}
                        placeholder="Option A, Option B, Option C"
                        value={newField.options}
                        onChange={(event) =>
                          setNewField((current) => ({
                            ...current,
                            options: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  )}
                  <Toggle
                    label="Required"
                    checked={newField.required}
                    onChange={(checked) =>
                      setNewField((current) => ({
                        ...current,
                        required: checked,
                      }))
                    }
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void addField()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                    >
                      <Plus size={16} />
                      Add Field
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Reviewers & notifications
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Configure who receives the review task. In-app notifications are
                created immediately and push is sent where TTTracker has a
                registered Expo push token.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {rules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                No reviewer rules configured. Until rules are added, Training
                submissions fall back to Admin/HSEQ users.
              </div>
            ) : (
              rules.map((rule) => {
                const employee = employees.find(
                  (item) => item.user_id === rule.user_id,
                );
                const scope =
                  rule.scope_type === "type"
                    ? `Type: ${
                        types.find(
                          (item) =>
                            item.id === rule.training_type_id,
                        )?.name ?? "Unknown"
                      }`
                    : rule.scope_type === "category"
                      ? `Category: ${
                          categories.find(
                            (item) =>
                              item.id === rule.category_id,
                          )?.name ?? "Unknown"
                        }`
                      : "All Training";

                return (
                  <div
                    key={rule.id}
                    className="grid gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center"
                  >
                    <div>
                      <div className="font-black text-slate-900">
                        {rule.principal_type === "user"
                          ? employee?.full_name || "TTTracker User"
                          : rule.role || "Role"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {rule.principal_type}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-700">
                      {scope}
                    </div>
                    <div className="text-sm text-slate-500">
                      {[
                        rule.receives_in_app ? "In-app" : null,
                        rule.receives_push ? "Push" : null,
                        rule.receives_email ? "Email" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No notifications"}
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteRule(rule)}
                      className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-5 grid gap-4 rounded-2xl bg-slate-50 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Scope">
              <select
                className={inputClass}
                value={newRule.scopeType}
                onChange={(event) =>
                  setNewRule((current) => ({
                    ...current,
                    scopeType: event.target.value as
                      | "all"
                      | "category"
                      | "type",
                  }))
                }
              >
                <option value="all">All Training</option>
                <option value="category">One Category</option>
                <option value="type">One Training Type</option>
              </select>
            </Field>

            {newRule.scopeType === "category" ? (
              <Field label="Category">
                <select
                  className={inputClass}
                  value={newRule.categoryId}
                  onChange={(event) =>
                    setNewRule((current) => ({
                      ...current,
                      categoryId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {newRule.scopeType === "type" ? (
              <Field label="Training Type">
                <select
                  className={inputClass}
                  value={newRule.trainingTypeId}
                  onChange={(event) =>
                    setNewRule((current) => ({
                      ...current,
                      trainingTypeId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select...</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Reviewer is">
              <select
                className={inputClass}
                value={newRule.principalType}
                onChange={(event) =>
                  setNewRule((current) => ({
                    ...current,
                    principalType: event.target.value as
                      | "role"
                      | "user",
                  }))
                }
              >
                <option value="role">Website role</option>
                <option value="user">Specific user</option>
              </select>
            </Field>

            {newRule.principalType === "role" ? (
              <Field label="Role">
                <select
                  className={inputClass}
                  value={newRule.role}
                  onChange={(event) =>
                    setNewRule((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="User">
                <select
                  className={inputClass}
                  value={newRule.userId}
                  onChange={(event) =>
                    setNewRule((current) => ({
                      ...current,
                      userId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select...</option>
                  {userOptions.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Toggle
              label="In-app"
              checked={newRule.receivesInApp}
              onChange={(checked) =>
                setNewRule((current) => ({
                  ...current,
                  receivesInApp: checked,
                }))
              }
            />
            <Toggle
              label="Push"
              checked={newRule.receivesPush}
              onChange={(checked) =>
                setNewRule((current) => ({
                  ...current,
                  receivesPush: checked,
                }))
              }
            />
            <Toggle
              label="Email"
              checked={newRule.receivesEmail}
              onChange={(checked) =>
                setNewRule((current) => ({
                  ...current,
                  receivesEmail: checked,
                }))
              }
            />

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void addReviewRule()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white"
              >
                <Plus size={16} />
                Add Reviewer Rule
              </button>
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black capitalize text-slate-800">
        {label}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12.5 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-black text-slate-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-slate-300"
      />
    </label>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-black uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-3 text-3xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500">
        {detail}
      </div>
    </div>
  );
}
