"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Database,
  ExternalLink,
  FileCog,
  FolderCog,
  FolderSync,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
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
  sharepoint_drive_id: string | null;
  sharepoint_folder_id: string | null;
  sharepoint_web_url: string | null;
  sharepoint_folder_name: string | null;
};

type SharePointColumn = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  hidden: boolean;
  readOnly: boolean;
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
  auto_approve_authorised_uploads: boolean;
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
  auto_approve_authorised_uploads: false,
};

const CORE_METADATA_FIELDS: Array<{
  key: keyof Settings["core_metadata_map"];
  label: string;
  source: string;
  example: string;
}> = [
  {
    key: "employee_id",
    label: "Payroll ID",
    source: "Employee profile → payroll_id",
    example: "1600",
  },
  {
    key: "employee_name",
    label: "Employee Name",
    source: "Employee profile → full_name",
    example: "Luka Zetovic",
  },
  {
    key: "training_type",
    label: "Training Type",
    source: "Training record",
    example: "CPR",
  },
  {
    key: "training_code",
    label: "Training Code",
    source: "Configured short code",
    example: "CPR",
  },
  {
    key: "certificate_number",
    label: "Certificate Number",
    source: "Training record",
    example: "CERT-12345",
  },
  {
    key: "provider",
    label: "Provider",
    source: "Training record",
    example: "Training Provider",
  },
  {
    key: "issue_date",
    label: "Issue Date",
    source: "Training record",
    example: "15/09/2026",
  },
  {
    key: "expiry_date",
    label: "Expiry Date",
    source: "Training record",
    example: "15/09/2027",
  },
  {
    key: "project",
    label: "Project",
    source: "Linked project",
    example: "P.25.0002 - HumeLink West",
  },
  {
    key: "status",
    label: "Status",
    source: "TTTracker workflow",
    example: "Approved",
  },
  {
    key: "tttracker_record_id",
    label: "TTTracker Record ID",
    source: "Internal audit link",
    example: "UUID",
  },
  {
    key: "option_codes",
    label: "Classes / Option Codes",
    source: "Configured Training options",
    example: "DG, RB",
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function expectedEmployeeFolderName(
  template: string,
  employee: Employee,
) {
  const payroll = clean(employee.payroll_id);
  const name = clean(employee.full_name) || "Employee";

  return (
    template
      .replaceAll("{payroll_id}", payroll)
      .replaceAll("{employee_name}", name)
      .replace(/\s*-\s*-\s*/g, " - ")
      .replace(/^\s*-\s*|\s*-\s*$/g, "")
      .trim() || name
  );
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
  const [sharePointColumns, setSharePointColumns] = useState<
    SharePointColumn[]
  >([]);
  const [columnError, setColumnError] = useState("");
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [syncingSharePoint, setSyncingSharePoint] = useState(false);
  const [syncingEmployeeId, setSyncingEmployeeId] = useState<string | null>(
    null,
  );
  const [employeeFolderSearch, setEmployeeFolderSearch] = useState("");
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
    receivesEmail: true,
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

  const loadSharePointColumns = useCallback(
    async (driveId: string) => {
      const resolvedDriveId = clean(driveId);

      if (!resolvedDriveId) {
        setSharePointColumns([]);
        setColumnError("");
        return;
      }

      setLoadingColumns(true);
      setColumnError("");

      try {
        const response = await apiFetch(
          `/api/training/configuration/sharepoint?driveId=${encodeURIComponent(
            resolvedDriveId,
          )}`,
        );

        const payload = (await response.json().catch(() => null)) as
          | {
              columns?: SharePointColumn[];
              columnError?: string | null;
              error?: string;
            }
          | null;

        if (!response.ok) {
          throw new Error(
            clean(payload?.error) ||
              "Unable to load SharePoint library columns.",
          );
        }

        setSharePointColumns(payload?.columns ?? []);
        setColumnError(clean(payload?.columnError));
      } catch (error) {
        setSharePointColumns([]);
        setColumnError(
          error instanceof Error
            ? error.message
            : "Unable to load SharePoint library columns.",
        );
      } finally {
        setLoadingColumns(false);
      }
    },
    [apiFetch],
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
          "id,payroll_id,full_name,user_id,active,sharepoint_drive_id,sharepoint_folder_id,sharepoint_web_url,sharepoint_folder_name",
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

    const loadedSettings = normaliseSettings(settingsResult.data);
    setSettings(loadedSettings);

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

    if (clean(loadedSettings.sharepoint_drive_id)) {
      await loadSharePointColumns(
        clean(loadedSettings.sharepoint_drive_id),
      );
    } else {
      setSharePointColumns([]);
      setColumnError("");
    }
  }, [apiFetch, loadSharePointColumns, supabase]);

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

  const mappedMetadataCount = Object.values(
    settings.core_metadata_map,
  ).filter((value) => clean(value)).length;

  const visibleFolderEmployees = useMemo(() => {
    const query = employeeFolderSearch.trim().toLowerCase();

    return employees
      .filter((employee) => employee.active !== false)
      .filter((employee) => {
        if (!query) return true;

        return [
          employee.full_name,
          employee.payroll_id,
          employee.sharepoint_folder_name,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [employeeFolderSearch, employees]);

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

async function syncEmployeeSharePoint(
  employeeIds?: string[],
) {
  const syncingOne =
    Array.isArray(employeeIds) && employeeIds.length === 1;

  if (
    !syncingOne &&
    !window.confirm(
      "Sync all active employee SharePoint folders with the current payroll IDs/names and refresh configured metadata on existing published Training documents?",
    )
  ) {
    return;
  }

  if (syncingOne) {
    setSyncingEmployeeId(employeeIds[0]);
  } else {
    setSyncingSharePoint(true);
  }

  setMessage(null);

  try {
    const response = await apiFetch(
      "/api/training/employees/sync-sharepoint",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          includeInactive: false,
          employeeIds: employeeIds ?? [],
          syncMetadata: true,
        }),
      },
    );

    const responseText = await response.text();

    type SyncPayload = {
      error?: string;
      success?: boolean;
      requested?: number;
      synced?: number;
      failed?: number;
      renamed?: number;
      createdOrLinked?: number;
      metadataUpdated?: number;
      documentLinksRefreshed?: number;
      documentsMoved?: number;
      supersededArchived?: number;
      legacyTrainingFoldersRemoved?: number;
      failures?: Array<{
        employeeId?: string;
        employeeName?: string;
        error?: string;
      }>;
    };

    let payload: SyncPayload | null = null;

    if (responseText.trim()) {
      try {
        payload = JSON.parse(responseText) as SyncPayload;
      } catch {
        const rawMessage = responseText.trim();

        console.error(
          "SharePoint employee sync returned a non-JSON response",
          {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get("content-type"),
            response: rawMessage.slice(0, 2000),
          },
        );

        if (rawMessage.startsWith("<!DOCTYPE") || rawMessage.startsWith("<html")) {
          throw new Error(
            `SharePoint sync failed (${response.status} ${response.statusText}). ` +
              "The server returned an HTML error page instead of JSON. " +
              "Check the Next.js/Vercel server logs for /api/training/employees/sync-sharepoint.",
          );
        }

        throw new Error(
          `SharePoint sync failed (${response.status} ${response.statusText}). ` +
            `Server response: ${
              rawMessage.slice(0, 500) ||
              "No readable response was returned."
            }`,
        );
      }
    }

    if (!response.ok) {
      const serverMessage = clean(payload?.error);

      console.error("SharePoint employee sync failed", {
        status: response.status,
        statusText: response.statusText,
        payload,
        response: responseText.slice(0, 2000),
      });

      throw new Error(
        serverMessage ||
          `SharePoint employee sync failed (${response.status} ${response.statusText}).`,
      );
    }

    if (!payload) {
      throw new Error(
        `SharePoint sync returned an empty or invalid response (${response.status} ${response.statusText}).`,
      );
    }

    await loadData();

    const synced = Number(payload.synced ?? 0);
    const failed = Number(payload.failed ?? 0);
    const renamed = Number(payload.renamed ?? 0);
    const linked = Number(payload.createdOrLinked ?? 0);
    const metadataUpdated = Number(payload.metadataUpdated ?? 0);
    const linksRefreshed = Number(
      payload.documentLinksRefreshed ?? 0,
    );
    const documentsMoved = Number(payload.documentsMoved ?? 0);
    const supersededArchived = Number(
      payload.supersededArchived ?? 0,
    );
    const legacyFoldersRemoved = Number(
      payload.legacyTrainingFoldersRemoved ?? 0,
    );

    const firstFailure = clean(payload.failures?.[0]?.error);

    if (failed > 0) {
      setMessage({
        tone: "error",
        text:
          `${synced} employee SharePoint profile${
            synced === 1 ? "" : "s"
          } synced; ` +
          `${failed} failed. ` +
          `${renamed} folder${renamed === 1 ? "" : "s"} renamed; ` +
          `${documentsMoved} published file${
            documentsMoved === 1 ? "" : "s"
          } moved; ` +
          `${supersededArchived} superseded file${
            supersededArchived === 1 ? "" : "s"
          } archived; ` +
          `${metadataUpdated} metadata item${
            metadataUpdated === 1 ? "" : "s"
          } refreshed.` +
          (firstFailure
            ? ` First error: ${firstFailure}`
            : ""),
      });

      return;
    }

    setMessage({
      tone: "success",
      text:
        `${synced} employee SharePoint profile${
          synced === 1 ? "" : "s"
        } synced. ` +
        `${renamed} folder${renamed === 1 ? "" : "s"} renamed, ` +
        `${linked} linked/created, ` +
        `${documentsMoved} published file${
          documentsMoved === 1 ? "" : "s"
        } moved, ` +
        `${supersededArchived} superseded file${
          supersededArchived === 1 ? "" : "s"
        } archived, ` +
        `${metadataUpdated} metadata item${
          metadataUpdated === 1 ? "" : "s"
        } refreshed, ` +
        `${linksRefreshed} document link${
          linksRefreshed === 1 ? "" : "s"
        } refreshed and ` +
        `${legacyFoldersRemoved} empty legacy Training folder${
          legacyFoldersRemoved === 1 ? "" : "s"
        } removed.`,
    });
  } catch (error) {
    console.error("Unable to sync employee SharePoint folders", error);

    setMessage({
      tone: "error",
      text:
        error instanceof Error
          ? error.message
          : "Unable to sync employee SharePoint folders.",
    });
  } finally {
    setSyncingSharePoint(false);
    setSyncingEmployeeId(null);
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
                Missing folders can be provisioned here. The sync action also
                checks linked folders against the employee&apos;s current payroll
                ID and name, renames the existing SharePoint folder when needed,
                migrates tracked files out of the old employee Training subfolder,
                archives superseded evidence, and refreshes configured metadata.
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
                  const driveId = event.target.value;

                  setSettings((current) => ({
                    ...current,
                    sharepoint_drive_id: driveId || null,
                    sharepoint_drive_name: drive?.name ?? null,
                  }));

                  void loadSharePointColumns(driveId);
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

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-sm font-black text-blue-950">
                Simplified employee folder structure
              </div>
              <div className="mt-2 text-sm leading-6 text-blue-900">
                The redundant employee <strong>Training</strong> subfolder is no
                longer used. Published files now go directly to:
                <div className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700">
                  {clean(settings.sharepoint_base_folder) || "Employees"} /
                  {" "}
                  {"{payroll_id} - {employee_name}"} / Category
                </div>
                <div className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700">
                  {clean(settings.sharepoint_base_folder) || "Employees"} /
                  {" "}
                  {"{payroll_id} - {employee_name}"} / Superseded
                </div>
              </div>
            </div>

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

            <div className="space-y-2">
              <Toggle
                label="Auto-approve authorised Admin / HSEQ / Training Officer uploads"
                checked={settings.auto_approve_authorised_uploads}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    auto_approve_authorised_uploads: checked,
                  }))
                }
              />
              <Hint>
                When enabled, authorised Admin, HSEQ or Training Officer uploads publish
                immediately without creating a review task for themselves.
                Employee self-service uploads still follow the configured
                review workflow.
              </Hint>
            </div>

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
              <button
                type="button"
                onClick={() => void syncEmployeeSharePoint()}
                disabled={
                  syncingSharePoint ||
                  provisioning ||
                  !settings.sharepoint_drive_id
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 disabled:opacity-50"
              >
                {syncingSharePoint ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Sync Folders & Metadata
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="font-black text-slate-950">
                  Employee SharePoint links
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Use Sync after correcting an employee&apos;s payroll ID or name.
                  TTTracker renames the existing folder by SharePoint item ID.
                  Current files are moved directly into their category folder and
                  superseded files are moved into the employee&apos;s Superseded
                  folder.
                </p>
              </div>

              <label className="relative w-full lg:max-w-sm">
                <Search
                  size={16}
                  className="absolute left-3 top-3.5 text-slate-400"
                />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Search employee or payroll ID..."
                  value={employeeFolderSearch}
                  onChange={(event) =>
                    setEmployeeFolderSearch(event.target.value)
                  }
                />
              </label>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <div className="divide-y divide-slate-100">
                {visibleFolderEmployees.map((employee) => {
                  const expectedName = expectedEmployeeFolderName(
                    settings.employee_folder_template,
                    employee,
                  );
                  const linked = Boolean(
                    clean(employee.sharepoint_folder_id),
                  );
                  const folderMatches =
                    linked &&
                    clean(employee.sharepoint_folder_name) === expectedName;

                  return (
                    <div
                      key={employee.id}
                      className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center"
                    >
                      <div>
                        <div className="font-black text-slate-950">
                          {employee.full_name}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          Payroll ID: {clean(employee.payroll_id) || "Missing"}
                        </div>
                      </div>

                      <div className="text-sm">
                        <div className="font-semibold text-slate-700">
                          Current:{" "}
                          {clean(employee.sharepoint_folder_name) ||
                            "Not linked"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Expected: {expectedName}
                        </div>
                        <div
                          className={`mt-1 text-xs font-black ${
                            !linked
                              ? "text-amber-700"
                              : folderMatches
                                ? "text-emerald-700"
                                : "text-blue-700"
                          }`}
                        >
                          {!linked
                            ? "Needs provisioning"
                            : folderMatches
                              ? "Folder name matches"
                              : "Needs folder sync"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {employee.sharepoint_web_url ? (
                          <a
                            href={employee.sharepoint_web_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                          >
                            <ExternalLink size={14} />
                            Open
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            void syncEmployeeSharePoint([employee.id])
                          }
                          disabled={
                            Boolean(syncingEmployeeId) ||
                            syncingSharePoint ||
                            !settings.sharepoint_drive_id
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                        >
                          {syncingEmployeeId === employee.id ? (
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          Sync
                        </button>
                      </div>
                    </div>
                  );
                })}

                {visibleFolderEmployees.length === 0 ? (
                  <div className="p-6 text-center text-sm font-semibold text-slate-500">
                    No employees match the search.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-50 p-2 text-violet-700">
                <Database size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  SharePoint metadata mapping
                </h2>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                  Metadata is information stored in SharePoint columns against
                  the certificate file. It is separate from the file name and
                  folder name. Mapping tells TTTracker which existing SharePoint
                  column should receive each TTTracker value.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadSharePointColumns(
                  clean(settings.sharepoint_drive_id),
                )
              }
              disabled={
                loadingColumns || !settings.sharepoint_drive_id
              }
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-800 disabled:opacity-50"
            >
              {loadingColumns ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Refresh SharePoint Columns
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-sm font-black text-blue-950">
                1. The certificate file
              </div>
              <p className="mt-2 text-sm leading-6 text-blue-900">
                Example: <strong>CPR - Luka Zetovic.pdf</strong>. The file still
                lives under the employee&apos;s Training folder.
              </p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="text-sm font-black text-violet-950">
                2. Metadata sits on that file
              </div>
              <p className="mt-2 text-sm leading-6 text-violet-900">
                Example columns: Payroll ID = <strong>1600</strong>, Training
                Type = <strong>CPR</strong>, Expiry Date ={" "}
                <strong>15/09/2027</strong>.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-black text-emerald-950">
                3. Why use it?
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-900">
                SharePoint can filter, group and search certificates by employee,
                Training type, expiry, project or status without relying on the
                folder name.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <strong>Important:</strong> this page does not create SharePoint
            columns. Create the columns in the selected SharePoint document
            library first, then click <strong>Refresh SharePoint Columns</strong>{" "}
            and map them below. Leaving a mapping blank is completely valid —
            TTTracker will still upload the file, it just will not write that
            metadata field.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
            <span>
              {mappedMetadataCount} of {CORE_METADATA_FIELDS.length} TTTracker
              fields mapped
            </span>
            <span>·</span>
            <span>
              {sharePointColumns.length} writable SharePoint column
              {sharePointColumns.length === 1 ? "" : "s"} loaded
            </span>
          </div>

          {columnError ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              SharePoint columns could not be loaded automatically:{" "}
              {columnError}
            </div>
          ) : null}

          <datalist id="training-sharepoint-columns">
            {sharePointColumns.map((column) => (
              <option
                key={column.id}
                value={column.name}
              >
                {column.displayName}
              </option>
            ))}
          </datalist>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CORE_METADATA_FIELDS.map((field) => {
              const value = clean(
                settings.core_metadata_map[field.key],
              );
              const mappedColumn = sharePointColumns.find(
                (column) => column.name === value,
              );

              return (
                <div
                  key={field.key}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="font-black text-slate-950">
                    {field.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {field.source} · Example: {field.example}
                  </div>

                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
                      SharePoint column
                    </span>
                    <select
                      className={inputClass}
                      value={
                        mappedColumn
                          ? mappedColumn.name
                          : value
                            ? "__manual__"
                            : ""
                      }
                      onChange={(event) => {
                        const nextValue =
                          event.target.value === "__manual__"
                            ? value
                            : event.target.value;

                        setSettings((current) => ({
                          ...current,
                          core_metadata_map: {
                            ...current.core_metadata_map,
                            [field.key]: nextValue,
                          },
                        }));
                      }}
                    >
                      <option value="">Do not write this metadata</option>
                      {sharePointColumns.map((column) => (
                        <option
                          key={column.id}
                          value={column.name}
                        >
                          {column.displayName} ({column.name})
                        </option>
                      ))}
                      {value && !mappedColumn ? (
                        <option value="__manual__">
                          Current/manual: {value}
                        </option>
                      ) : null}
                    </select>
                  </label>

                  <input
                    list="training-sharepoint-columns"
                    className={`${inputClass} mt-2`}
                    placeholder="Or enter SharePoint internal name manually"
                    value={value}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        core_metadata_map: {
                          ...current.core_metadata_map,
                          [field.key]: event.target.value,
                        },
                      }))
                    }
                  />

                  {mappedColumn ? (
                    <div className="mt-2 text-xs font-semibold text-emerald-700">
                      Maps to: {mappedColumn.displayName}
                    </div>
                  ) : value ? (
                    <div className="mt-2 text-xs font-semibold text-amber-700">
                      Manual internal name. Confirm this exists in SharePoint.
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-400">
                      Not mapped.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-xs leading-5 text-slate-500">
              When you run <strong>Sync Folders & Metadata</strong>, existing
              published certificates are re-written using the current employee
              payroll ID/name and the mappings saved here.
            </p>

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
