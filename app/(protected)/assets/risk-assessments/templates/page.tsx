"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
  Library,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../../components";

type TemplateStatus = "draft" | "published" | "archived";

type TemplateRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  asset_group: string;
  asset_types: string[] | null;
  status: TemplateStatus;
  version_number: number;
  template_family_id: string;
  supersedes_template_id: string | null;
  risk_matrix_id: string | null;
  report_title: string;
  report_subtitle: string | null;
  default_assessment_purpose: string;
  default_review_months: number;
  important_information: string | null;
  assessor_declaration: string | null;
  operator_acknowledgement_text: string | null;
  allow_prefill_from_previous: boolean;
  allow_prefill_from_asset_register: boolean;
  require_review_before_approval: boolean;
  is_active: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateSectionRow = {
  id: string;
  template_id: string;
  is_active: boolean;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  is_active: boolean;
};

type RiskMatrixRow = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
};

type TemplateSummary = TemplateRow & {
  sectionCount: number;
  itemCount: number;
};

type TemplateFormState = {
  name: string;
  code: string;
  description: string;
  asset_group: string;
  asset_types: string[];
  risk_matrix_id: string;
  report_title: string;
  report_subtitle: string;
  default_assessment_purpose: string;
  default_review_months: string;
  important_information: string;
  assessor_declaration: string;
  operator_acknowledgement_text: string;
  allow_prefill_from_previous: boolean;
  allow_prefill_from_asset_register: boolean;
  require_review_before_approval: boolean;
};

const assetGroupOptions = [
  { value: "vehicle", label: "Vehicle" },
  { value: "plant", label: "Plant" },
  { value: "trailer", label: "Trailer" },
  { value: "equipment", label: "Equipment" },
];

const assetTypeOptions: Record<string, string[]> = {
  vehicle: [
    "light_vehicle",
    "utility",
    "suv",
    "passenger_vehicle",
    "heavy_vehicle",
    "rigid_truck",
    "tilt_tray_truck",
    "prime_mover",
    "service_truck",
    "crane_truck",
    "water_truck",
    "fuel_truck",
    "bus",
    "crew_bus",
    "flatbed_truck",
  ],
  plant: [
    "telehandler",
    "mobile_crane",
    "pick_and_carry_crane",
    "crawler_crane",
    "forklift",
    "ewp",
    "excavator",
    "skid_steer",
    "loader",
    "dozer",
    "grader",
    "roller",
    "compactor",
    "tractor",
    "water_cart",
  ],
  trailer: [
    "box_trailer",
    "flat_top_trailer",
    "plant_trailer",
    "low_loader",
    "dolly",
    "generator_trailer",
    "fuel_trailer",
    "water_trailer",
  ],
  equipment: [
    "generator",
    "compressor",
    "welder",
    "lighting_tower",
    "pump",
    "other_equipment",
  ],
};

const blankTemplateForm: TemplateFormState = {
  name: "",
  code: "",
  description: "",
  asset_group: "vehicle",
  asset_types: [],
  risk_matrix_id: "",
  report_title: "Risk Management Report",
  report_subtitle: "",
  default_assessment_purpose: "Plant in use",
  default_review_months: "12",
  important_information:
    "This report relates to the asset as it appeared on the date of assessment. The condition of the asset may change through use, damage, maintenance, modification or environmental exposure. Additional task-specific or site-specific risk assessment may be required.",
  assessor_declaration:
    "I confirm that this assessment records the asset conditions and controls identified during the assessment and that the information entered is true and correct to the best of my knowledge.",
  operator_acknowledgement_text:
    "I acknowledge that I have read and understood this risk management report and the controls relevant to the operation, inspection and maintenance of this asset.",
  allow_prefill_from_previous: true,
  allow_prefill_from_asset_register: true,
  require_review_before_approval: false,
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function prettify(value: string): string {
  return value
    .replace(/_/g, " ")
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

function statusClasses(status: TemplateStatus): string {
  if (status === "published") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "archived") {
    return "border-slate-300 bg-slate-100 text-slate-600";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
}

function normaliseCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
}

function templateCanBeDeleted(template: TemplateSummary): boolean {
  return template.status === "draft";
}

export default function RiskAssessmentTemplatesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [riskMatrices, setRiskMatrices] = useState<RiskMatrixRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | TemplateStatus
  >("all");
  const [assetGroupFilter, setAssetGroupFilter] = useState("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] =
    useState<TemplateFormState>(blankTemplateForm);

  const defaultRiskMatrixId = useMemo(() => {
    const defaultMatrix =
      riskMatrices.find((matrix) => matrix.is_default) ??
      riskMatrices[0];

    return defaultMatrix?.id ?? "";
  }, [riskMatrices]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [templatesResult, sectionsResult, itemsResult, matrixResult] =
      await Promise.all([
        supabase
          .from("asset_risk_templates")
          .select("*")
          .order("updated_at", { ascending: false }),

        supabase
          .from("asset_risk_template_sections")
          .select("id,template_id,is_active"),

        supabase
          .from("asset_risk_template_items")
          .select("id,template_id,is_active"),

        supabase
          .from("asset_risk_matrix_configurations")
          .select("id,name,description,is_default,is_active")
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("name", { ascending: true }),
      ]);

    if (templatesResult.error) {
      console.error(templatesResult.error);
      setErrorMessage(
        `Failed to load templates: ${templatesResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    if (sectionsResult.error) {
      console.error(sectionsResult.error);
    }

    if (itemsResult.error) {
      console.error(itemsResult.error);
    }

    if (matrixResult.error) {
      console.error(matrixResult.error);
    }

    const templateRows =
      (templatesResult.data ?? []) as TemplateRow[];

    const sectionRows =
      (sectionsResult.data ?? []) as TemplateSectionRow[];

    const itemRows =
      (itemsResult.data ?? []) as TemplateItemRow[];

    const summaries = templateRows.map((template) => ({
      ...template,
      sectionCount: sectionRows.filter(
        (section) =>
          section.template_id === template.id && section.is_active,
      ).length,
      itemCount: itemRows.filter(
        (item) => item.template_id === template.id && item.is_active,
      ).length,
    }));

    setTemplates(summaries);
    setRiskMatrices((matrixResult.data ?? []) as RiskMatrixRow[]);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTemplates();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates.filter((template) => {
      if (!showArchived && template.status === "archived") {
        return false;
      }

      if (
        statusFilter !== "all" &&
        template.status !== statusFilter
      ) {
        return false;
      }

      if (
        assetGroupFilter !== "all" &&
        template.asset_group !== assetGroupFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        template.name,
        template.code,
        template.description,
        template.asset_group,
        ...(template.asset_types ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [
    templates,
    search,
    statusFilter,
    assetGroupFilter,
    showArchived,
  ]);

  const publishedCount = templates.filter(
    (template) => template.status === "published",
  ).length;

  const draftCount = templates.filter(
    (template) => template.status === "draft",
  ).length;

  const archivedCount = templates.filter(
    (template) => template.status === "archived",
  ).length;

  const totalItemCount = templates.reduce(
    (sum, template) => sum + template.itemCount,
    0,
  );

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function resetForm() {
    setForm({
      ...blankTemplateForm,
      risk_matrix_id: defaultRiskMatrixId,
    });
  }

  function updateForm<K extends keyof TemplateFormState>(
    key: K,
    value: TemplateFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleAssetType(assetType: string) {
    setForm((current) => {
      const exists = current.asset_types.includes(assetType);

      return {
        ...current,
        asset_types: exists
          ? current.asset_types.filter((item) => item !== assetType)
          : [...current.asset_types, assetType],
      };
    });
  }

  function changeAssetGroup(assetGroup: string) {
    setForm((current) => ({
      ...current,
      asset_group: assetGroup,
      asset_types: [],
    }));
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    clearMessages();

    const name = clean(form.name);
    const code = normaliseCode(form.code || form.name);
    const reviewMonths = Number(form.default_review_months);

    if (!name) {
      setErrorMessage("Enter a template name.");
      return;
    }

    if (!code) {
      setErrorMessage("Enter a template code.");
      return;
    }

    if (!form.asset_group) {
      setErrorMessage("Select an asset group.");
      return;
    }

    if (form.asset_types.length === 0) {
      setErrorMessage("Select at least one applicable asset type.");
      return;
    }

    if (
      !Number.isInteger(reviewMonths) ||
      reviewMonths < 1 ||
      reviewMonths > 120
    ) {
      setErrorMessage(
        "The review period must be between 1 and 120 months.",
      );
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("asset_risk_templates")
      .insert({
        name,
        code,
        description: clean(form.description) || null,
        asset_group: form.asset_group,
        asset_types: form.asset_types,
        status: "draft",
        version_number: 1,
        risk_matrix_id:
          form.risk_matrix_id || defaultRiskMatrixId || null,
        report_title:
          clean(form.report_title) || "Risk Management Report",
        report_subtitle: clean(form.report_subtitle) || null,
        default_assessment_purpose:
          clean(form.default_assessment_purpose) || "Plant in use",
        default_review_months: reviewMonths,
        important_information:
          clean(form.important_information) || null,
        assessor_declaration:
          clean(form.assessor_declaration) || null,
        operator_acknowledgement_text:
          clean(form.operator_acknowledgement_text) || null,
        allow_prefill_from_previous:
          form.allow_prefill_from_previous,
        allow_prefill_from_asset_register:
          form.allow_prefill_from_asset_register,
        require_review_before_approval:
          form.require_review_before_approval,
        is_active: true,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      console.error(error);

      if (
        error.message.toLowerCase().includes("row-level security")
      ) {
        setErrorMessage(
          "You do not have permission to create templates. Check your user_roles record and the is_asset_risk_admin SQL function.",
        );
        return;
      }

      if (
        error.message.toLowerCase().includes("duplicate") ||
        error.code === "23505"
      ) {
        setErrorMessage(
          "A template with this code and version already exists.",
        );
        return;
      }

      setErrorMessage(`Failed to create template: ${error.message}`);
      return;
    }

    resetForm();
    setShowCreateForm(false);
    setMessage("Template created successfully.");

    await loadTemplates();

    if (data?.id) {
      router.push(
        `/assets/risk-assessments/templates/${data.id}`,
      );
    }
  }

  async function duplicateTemplate(template: TemplateSummary) {
    clearMessages();

    const newName = window.prompt(
      "Name for the duplicated template:",
      `${template.name} Copy`,
    );

    if (!newName?.trim()) {
      return;
    }

    const suggestedCode = `${template.code}-COPY`;

    const newCode = window.prompt(
      "Template code:",
      suggestedCode,
    );

    if (!newCode?.trim()) {
      return;
    }

    setActionId(template.id);

    const { data, error } = await supabase.rpc(
      "duplicate_asset_risk_template",
      {
        p_template_id: template.id,
        p_new_name: newName.trim(),
        p_new_code: normaliseCode(newCode),
      },
    );

    setActionId(null);

    if (error) {
      console.error(error);
      setErrorMessage(
        `Failed to duplicate template: ${error.message}`,
      );
      return;
    }

    setMessage("Template duplicated successfully.");
    await loadTemplates();

    if (typeof data === "string" && data) {
      router.push(
        `/assets/risk-assessments/templates/${data}`,
      );
    }
  }

  async function publishTemplate(template: TemplateSummary) {
    clearMessages();

    if (template.sectionCount === 0) {
      setErrorMessage(
        "This template cannot be published until it contains at least one section.",
      );
      return;
    }

    if (template.itemCount === 0) {
      setErrorMessage(
        "This template cannot be published until it contains at least one assessment item.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Publish ${template.name} version ${template.version_number}?\n\nOnce published, this version should not be edited because assessments may be created from it.`,
    );

    if (!confirmed) {
      return;
    }

    setActionId(template.id);

    const { error } = await supabase.rpc(
      "publish_asset_risk_template",
      {
        p_template_id: template.id,
      },
    );

    setActionId(null);

    if (error) {
      console.error(error);
      setErrorMessage(
        `Failed to publish template: ${error.message}`,
      );
      return;
    }

    setMessage(`${template.name} has been published.`);
    await loadTemplates();
  }

  async function updateTemplateStatus(
    template: TemplateSummary,
    status: TemplateStatus,
  ) {
    clearMessages();

    const actionText =
      status === "archived" ? "archive" : "restore";

    const confirmed = window.confirm(
      `${actionText === "archive" ? "Archive" : "Restore"} ${template.name}?`,
    );

    if (!confirmed) {
      return;
    }

    setActionId(template.id);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("asset_risk_templates")
      .update({
        status,
        is_active: status !== "archived",
        updated_by: user?.id ?? null,
      })
      .eq("id", template.id);

    setActionId(null);

    if (error) {
      console.error(error);
      setErrorMessage(
        `Failed to ${actionText} template: ${error.message}`,
      );
      return;
    }

    setMessage(
      status === "archived"
        ? `${template.name} has been archived.`
        : `${template.name} has been restored as a draft.`,
    );

    await loadTemplates();
  }

  async function deleteTemplate(template: TemplateSummary) {
    clearMessages();

    if (!templateCanBeDeleted(template)) {
      setErrorMessage(
        "Only draft templates can be permanently deleted.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete ${template.name}?\n\nIts sections and template items will also be deleted. This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setActionId(template.id);

    const { error } = await supabase
      .from("asset_risk_templates")
      .delete()
      .eq("id", template.id);

    setActionId(null);

    if (error) {
      console.error(error);
      setErrorMessage(
        `Failed to delete template: ${error.message}`,
      );
      return;
    }

    setMessage(`${template.name} was deleted.`);
    await loadTemplates();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Risk Assessments"
        title="Template Builder"
        description="Create reusable assessment templates for vehicles, trucks, trailers, cranes, telehandlers and other plant. Asset details, previous answers and known equipment can be prefilled when an assessment is created."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/risk-assessments"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <ClipboardList size={16} />
              Assessments
            </Link>

            <Link
              href="/assets/risk-assessments/library"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Library size={16} />
              Risk Library
            </Link>

            <button
              type="button"
              onClick={() => void loadTemplates()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => {
                clearMessages();
                resetForm();
                setShowCreateForm((current) => !current);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              {showCreateForm ? <X size={16} /> : <Plus size={16} />}
              {showCreateForm ? "Close" : "New Template"}
            </button>
          </div>
        }
      />

      <div className="space-y-6 px-4 pb-10 sm:px-6 lg:px-8">
        {message && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
            <span>{message}</span>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {errorMessage}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Published"
            value={publishedCount}
            helper="Available for new assessments"
            tone="emerald"
          />

          <SummaryCard
            label="Drafts"
            value={draftCount}
            helper="Still being configured"
            tone="amber"
          />

          <SummaryCard
            label="Assessment Items"
            value={totalItemCount}
            helper="Items assigned across templates"
            tone="blue"
          />

          <SummaryCard
            label="Archived"
            value={archivedCount}
            helper="Retained but unavailable"
            tone="slate"
          />
        </section>

        {showCreateForm && (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-slate-900 p-3 text-white">
                  <Plus size={20} />
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-950">
                    Create Risk Assessment Template
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Set the template details first. Sections and
                    assessment items are added from the template editor
                    after creation.
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={createTemplate}
              className="space-y-8 p-5 sm:p-6"
            >
              <div>
                <SectionTitle
                  title="Template identification"
                  description="Name the template and define the assets it applies to."
                />

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <FormField
                    label="Template name"
                    required
                    value={form.name}
                    placeholder="Light Vehicle"
                    onChange={(value) => {
                      updateForm("name", value);

                      if (!form.code) {
                        updateForm("code", normaliseCode(value));
                      }
                    }}
                  />

                  <FormField
                    label="Template code"
                    required
                    value={form.code}
                    placeholder="LV"
                    helper="Used in report numbers, for example RA-LV-00001."
                    onChange={(value) =>
                      updateForm("code", normaliseCode(value))
                    }
                  />

                  <div>
                    <label className="text-sm font-bold text-slate-800">
                      Asset group
                      <span className="ml-1 text-rose-600">*</span>
                    </label>

                    <select
                      value={form.asset_group}
                      onChange={(event) =>
                        changeAssetGroup(event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    >
                      {assetGroupOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-800">
                      Risk matrix
                    </label>

                    <select
                      value={form.risk_matrix_id || defaultRiskMatrixId}
                      onChange={(event) =>
                        updateForm(
                          "risk_matrix_id",
                          event.target.value,
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="">No matrix selected</option>

                      {riskMatrices.map((matrix) => (
                        <option key={matrix.id} value={matrix.id}>
                          {matrix.name}
                          {matrix.is_default ? " — Default" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <FormTextArea
                      label="Description"
                      value={form.description}
                      placeholder="Company standard risk management assessment for light vehicles used on construction projects."
                      rows={3}
                      onChange={(value) =>
                        updateForm("description", value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <SectionTitle
                  title="Applicable asset types"
                  description="Select every asset type that can use this template."
                />

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {(assetTypeOptions[form.asset_group] ?? []).map(
                    (assetType) => {
                      const selected =
                        form.asset_types.includes(assetType);

                      return (
                        <button
                          type="button"
                          key={assetType}
                          onClick={() =>
                            toggleAssetType(assetType)
                          }
                          className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${
                            selected
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                          }`}
                        >
                          {prettify(assetType)}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div>
                <SectionTitle
                  title="Report defaults"
                  description="These values are copied into assessments created from this template."
                />

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <FormField
                    label="Report title"
                    required
                    value={form.report_title}
                    onChange={(value) =>
                      updateForm("report_title", value)
                    }
                  />

                  <FormField
                    label="Report subtitle"
                    value={form.report_subtitle}
                    placeholder="Light Vehicle Assessment"
                    onChange={(value) =>
                      updateForm("report_subtitle", value)
                    }
                  />

                  <FormField
                    label="Default assessment purpose"
                    value={form.default_assessment_purpose}
                    placeholder="Plant in use"
                    onChange={(value) =>
                      updateForm(
                        "default_assessment_purpose",
                        value,
                      )
                    }
                  />

                  <FormField
                    label="Review period"
                    type="number"
                    value={form.default_review_months}
                    helper="Months until the next assessment review is due."
                    onChange={(value) =>
                      updateForm("default_review_months", value)
                    }
                  />

                  <div className="lg:col-span-2">
                    <FormTextArea
                      label="Important information and limitations"
                      value={form.important_information}
                      rows={5}
                      onChange={(value) =>
                        updateForm("important_information", value)
                      }
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <FormTextArea
                      label="Assessor declaration"
                      value={form.assessor_declaration}
                      rows={4}
                      onChange={(value) =>
                        updateForm("assessor_declaration", value)
                      }
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <FormTextArea
                      label="Operator acknowledgement"
                      value={form.operator_acknowledgement_text}
                      rows={4}
                      onChange={(value) =>
                        updateForm(
                          "operator_acknowledgement_text",
                          value,
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <SectionTitle
                  title="Assessment automation"
                  description="Control how much information TTTracker prefills."
                />

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  <ToggleCard
                    title="Prefill asset details"
                    description="Use details from the selected vehicle or plant record."
                    checked={
                      form.allow_prefill_from_asset_register
                    }
                    onChange={(checked) =>
                      updateForm(
                        "allow_prefill_from_asset_register",
                        checked,
                      )
                    }
                  />

                  <ToggleCard
                    title="Prefill previous answers"
                    description="Use the last approved assessment as a starting point."
                    checked={form.allow_prefill_from_previous}
                    onChange={(checked) =>
                      updateForm(
                        "allow_prefill_from_previous",
                        checked,
                      )
                    }
                  />

                  <ToggleCard
                    title="Manager review required"
                    description="Send completed assessments for review before approval."
                    checked={
                      form.require_review_before_approval
                    }
                    onChange={(checked) =>
                      updateForm(
                        "require_review_before_approval",
                        checked,
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowCreateForm(false);
                  }}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={16} />
                  {saving
                    ? "Creating Template..."
                    : "Create and Open Editor"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Assessment Templates
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Published versions can be selected when creating a
                  new risk assessment.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setShowArchived((current) => !current)
                  }
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                    showArchived
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Archive size={15} />
                  {showArchived
                    ? "Hide Archived"
                    : "Show Archived"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <label className="relative block">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search template name, code or asset type..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as
                      | "all"
                      | TemplateStatus,
                  )
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>

              <select
                value={assetGroupFilter}
                onChange={(event) =>
                  setAssetGroupFilter(event.target.value)
                }
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value="all">All asset groups</option>

                {assetGroupOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center p-8">
              <div className="text-center">
                <RefreshCw
                  size={28}
                  className="mx-auto animate-spin text-slate-400"
                />
                <p className="mt-3 text-sm font-medium text-slate-500">
                  Loading templates...
                </p>
              </div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex min-h-72 items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                  <FileText size={26} />
                </div>

                <h3 className="mt-4 text-lg font-black text-slate-900">
                  No templates found
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Create the first assessment template or adjust the
                  current filters.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowCreateForm(true);
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <Plus size={16} />
                  New Template
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredTemplates.map((template) => {
                const busy = actionId === template.id;

                return (
                  <article
                    key={template.id}
                    className="p-5 transition hover:bg-slate-50/70 sm:p-6"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-black text-slate-950">
                            {template.name}
                          </h3>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${statusClasses(
                              template.status,
                            )}`}
                          >
                            {prettify(template.status)}
                          </span>

                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                            Version {template.version_number}
                          </span>

                          {!template.is_active && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                              Inactive
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                          <span>
                            Code:{" "}
                            <strong className="font-bold text-slate-900">
                              {template.code}
                            </strong>
                          </span>

                          <span>
                            Group:{" "}
                            <strong className="font-bold text-slate-900">
                              {prettify(template.asset_group)}
                            </strong>
                          </span>

                          <span>
                            Updated:{" "}
                            <strong className="font-bold text-slate-900">
                              {formatDate(template.updated_at)}
                            </strong>
                          </span>
                        </div>

                        {template.description && (
                          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
                            {template.description}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {(template.asset_types ?? []).map(
                            (assetType) => (
                              <span
                                key={assetType}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                              >
                                {prettify(assetType)}
                              </span>
                            ),
                          )}

                          {(template.asset_types ?? []).length ===
                            0 && (
                            <span className="text-xs font-semibold text-amber-700">
                              No asset types assigned
                            </span>
                          )}
                        </div>

                        <div className="mt-5 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                          <TemplateMetric
                            label="Sections"
                            value={template.sectionCount}
                          />

                          <TemplateMetric
                            label="Items"
                            value={template.itemCount}
                          />

                          <TemplateMetric
                            label="Review"
                            value={`${template.default_review_months} mo`}
                          />

                          <TemplateMetric
                            label="Prefill"
                            value={
                              template.allow_prefill_from_asset_register
                                ? "Enabled"
                                : "Off"
                            }
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-sm xl:justify-end">
                        <Link
                          href={`/assets/risk-assessments/templates/${template.id}`}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
                        >
                          <Edit3 size={15} />
                          {template.status === "draft"
                            ? "Edit Template"
                            : "View Template"}
                        </Link>

                        <button
                          type="button"
                          onClick={() =>
                            void duplicateTemplate(template)
                          }
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          <Copy size={15} />
                          Duplicate
                        </button>

                        {template.status === "draft" && (
                          <button
                            type="button"
                            onClick={() =>
                              void publishTemplate(template)
                            }
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckCircle2 size={15} />
                            Publish
                          </button>
                        )}

                        {template.status !== "archived" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void updateTemplateStatus(
                                template,
                                "archived",
                              )
                            }
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                          >
                            <Archive size={15} />
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void updateTemplateStatus(
                                template,
                                "draft",
                              )
                            }
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                          >
                            <RefreshCw size={15} />
                            Restore
                          </button>
                        )}

                        {templateCanBeDeleted(template) && (
                          <button
                            type="button"
                            onClick={() =>
                              void deleteTemplate(template)
                            }
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-600 p-3 text-white">
              <Settings2 size={20} />
            </div>

            <div>
              <h2 className="text-lg font-black text-blue-950">
                Template workflow
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-blue-900">
                Create a draft, add sections and reusable risk-library
                items, preview it and then publish it. New assessments
                only use published templates. Duplicate a published
                template before making major changes so completed
                assessments remain tied to the original version.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: number;
  helper: string;
  tone: "emerald" | "amber" | "blue" | "slate";
}) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    slate: "border-slate-200 bg-white text-slate-950",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses}`}>
      <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black">{value}</p>

      <p className="mt-2 text-xs font-medium opacity-70">{helper}</p>
    </div>
  );
}

function TemplateMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-black text-slate-900">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-base font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {description}
      </p>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  required = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  required?: boolean;
  type?: "text" | "number";
}) {
  return (
    <div>
      <label className="text-sm font-bold text-slate-800">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </label>

      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 120 : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />

      {helper && (
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </div>
  );
}

function FormTextArea({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows: number;
}) {
  return (
    <div>
      <label className="text-sm font-bold text-slate-800">
        {label}
      </label>

      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </div>
  );
}

function ToggleCard({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        checked
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
              checked ? "bg-emerald-400" : "bg-slate-300"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${
                checked ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>

          <span>
            <span className="block text-sm font-black">{title}</span>

            {!expanded && (
              <span
                className={`mt-1 block line-clamp-1 text-xs ${
                  checked ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {description}
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          aria-label={expanded ? "Collapse details" : "Expand details"}
          onClick={() => setExpanded((current) => !current)}
          className={`rounded-lg p-1 ${
            checked
              ? "text-slate-300 hover:bg-white/10 hover:text-white"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          }`}
        >
          {expanded ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>
      </div>

      {expanded && (
        <p
          className={`mt-3 text-xs leading-5 ${
            checked ? "text-slate-300" : "text-slate-500"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}