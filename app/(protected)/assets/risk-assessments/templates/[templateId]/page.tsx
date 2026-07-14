"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  GripVertical,
  Library,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../../../components";

type TemplateStatus = "draft" | "published" | "archived";
type RiskLevel = "low" | "medium" | "high" | "critical";

type TemplateRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  asset_group: string;
  asset_types: string[] | null;
  status: TemplateStatus;
  version_number: number;
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
  updated_at: string;
};

type SectionRow = {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  code: string | null;
  display_order: number;
  is_active: boolean;
  is_collapsed_by_default: boolean;
  conditional_config: Record<string, unknown> | null;
};

type LibraryItemRow = {
  id: string;
  title: string;
  code: string;
  category: string | null;
  subcategory: string | null;
  hazards: string[] | null;
  inspection_question: string;
  in_place_text: string;
  required_text: string;
  unable_to_verify_text: string | null;
  not_applicable_text: string | null;
  default_preliminary_likelihood: number;
  default_preliminary_consequence: number;
  default_preliminary_score: number | null;
  default_preliminary_level: RiskLevel | null;
  default_residual_likelihood: number;
  default_residual_consequence: number;
  default_residual_score: number | null;
  default_residual_level: RiskLevel | null;
  reference_documents: string[] | null;
  guidance_notes: string | null;
  assessor_help_text: string | null;
  requires_photo: boolean;
  requires_comment_if_required: boolean;
  requires_comment_if_unable_to_verify: boolean;
  requires_function_test: boolean;
  requires_document_verification: boolean;
  allow_not_applicable: boolean;
  allow_unable_to_verify: boolean;
  auto_create_fleet_job: boolean;
  default_fleet_job_priority: string | null;
  stop_use_when_required: boolean;
  applies_to: string[] | null;
  is_active: boolean;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  section_id: string;
  library_item_id: string | null;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
  allow_not_applicable: boolean | null;
  allow_unable_to_verify: boolean | null;
  requires_photo: boolean | null;
  requires_comment_if_required: boolean | null;
  requires_function_test: boolean | null;
  requires_document_verification: boolean | null;
  auto_create_fleet_job: boolean | null;
  stop_use_when_required: boolean | null;
  override_title: string | null;
  override_question: string | null;
  override_in_place_text: string | null;
  override_required_text: string | null;
  override_unable_to_verify_text: string | null;
  override_hazards: string[] | null;
  override_reference_documents: string[] | null;
  override_preliminary_likelihood: number | null;
  override_preliminary_consequence: number | null;
  override_residual_likelihood: number | null;
  override_residual_consequence: number | null;
  override_default_due_days: number | null;
  override_fleet_job_priority: string | null;
  conditional_config: Record<string, unknown> | null;
  prefill_config: Record<string, unknown> | null;
  library?: LibraryItemRow | null;
};

type RiskMatrixRow = {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

type TemplateForm = {
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

type SectionForm = {
  title: string;
  code: string;
  description: string;
  is_collapsed_by_default: boolean;
};

type NewLibraryForm = {
  title: string;
  code: string;
  category: string;
  hazards: string;
  inspection_question: string;
  in_place_text: string;
  required_text: string;
  unable_to_verify_text: string;
  references: string;
  preliminary_likelihood: string;
  preliminary_consequence: string;
  residual_likelihood: string;
  residual_consequence: string;
  requires_photo: boolean;
  requires_comment_if_required: boolean;
  requires_function_test: boolean;
  requires_document_verification: boolean;
  allow_not_applicable: boolean;
  allow_unable_to_verify: boolean;
  auto_create_fleet_job: boolean;
  default_fleet_job_priority: string;
  stop_use_when_required: boolean;
  applies_to: string[];
};

type ItemOverrideForm = {
  title: string;
  question: string;
  in_place_text: string;
  required_text: string;
  unable_to_verify_text: string;
  hazards: string;
  references: string;
  preliminary_likelihood: string;
  preliminary_consequence: string;
  residual_likelihood: string;
  residual_consequence: string;
  default_due_days: string;
  fleet_job_priority: string;
  allow_not_applicable: boolean;
  allow_unable_to_verify: boolean;
  requires_photo: boolean;
  requires_comment_if_required: boolean;
  requires_function_test: boolean;
  requires_document_verification: boolean;
  auto_create_fleet_job: boolean;
  stop_use_when_required: boolean;
};

const ASSET_TYPE_OPTIONS: Record<string, string[]> = {
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

const EMPTY_SECTION_FORM: SectionForm = {
  title: "",
  code: "",
  description: "",
  is_collapsed_by_default: false,
};

const EMPTY_LIBRARY_FORM: NewLibraryForm = {
  title: "",
  code: "",
  category: "",
  hazards: "",
  inspection_question: "",
  in_place_text: "",
  required_text: "",
  unable_to_verify_text: "",
  references: "",
  preliminary_likelihood: "3",
  preliminary_consequence: "3",
  residual_likelihood: "2",
  residual_consequence: "2",
  requires_photo: false,
  requires_comment_if_required: true,
  requires_function_test: false,
  requires_document_verification: false,
  allow_not_applicable: true,
  allow_unable_to_verify: true,
  auto_create_fleet_job: false,
  default_fleet_job_priority: "medium",
  stop_use_when_required: false,
  applies_to: [],
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function prettify(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normaliseCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToCsv(value: string[] | null | undefined): string {
  return (value ?? []).join(", ");
}

function riskScore(likelihood: number, consequence: number): number {
  return likelihood * consequence;
}

function riskLevel(score: number): RiskLevel {
  if (score <= 6) return "low";
  if (score <= 15) return "medium";
  if (score <= 22) return "high";
  return "critical";
}

function riskBadge(level: RiskLevel): string {
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

export default function RiskAssessmentTemplateEditorPage() {
  const params = useParams<{ templateId: string }>();
  const router = useRouter();
  const templateId = params.templateId;
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [items, setItems] = useState<TemplateItemRow[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItemRow[]>([]);
  const [riskMatrices, setRiskMatrices] = useState<RiskMatrixRow[]>([]);

  const [form, setForm] = useState<TemplateForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionRow | null>(null);
  const [sectionForm, setSectionForm] =
    useState<SectionForm>(EMPTY_SECTION_FORM);

  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryTargetSectionId, setLibraryTargetSectionId] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(
    new Set(),
  );

  const [showNewLibraryModal, setShowNewLibraryModal] = useState(false);
  const [newLibraryTargetSectionId, setNewLibraryTargetSectionId] =
    useState("");
  const [newLibraryForm, setNewLibraryForm] =
    useState<NewLibraryForm>(EMPTY_LIBRARY_FORM);

  const [editingItem, setEditingItem] = useState<TemplateItemRow | null>(null);
  const [itemOverrideForm, setItemOverrideForm] =
    useState<ItemOverrideForm | null>(null);

  const readOnly = template?.status !== "draft";

  const loadPage = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const [
      templateResult,
      sectionResult,
      itemResult,
      libraryResult,
      matrixResult,
    ] = await Promise.all([
      supabase
        .from("asset_risk_templates")
        .select("*")
        .eq("id", templateId)
        .single(),
      supabase
        .from("asset_risk_template_sections")
        .select("*")
        .eq("template_id", templateId)
        .order("display_order", { ascending: true }),
      supabase
        .from("asset_risk_template_items")
        .select(
          "*,library:asset_risk_library_items(*)",
        )
        .eq("template_id", templateId)
        .order("display_order", { ascending: true }),
      supabase
        .from("asset_risk_library_items")
        .select("*")
        .eq("is_active", true)
        .order("title", { ascending: true }),
      supabase
        .from("asset_risk_matrix_configurations")
        .select("id,name,is_default,is_active")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
    ]);

    if (templateResult.error) {
      setErrorMessage(
        `Failed to load template: ${templateResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    const loadedTemplate = templateResult.data as TemplateRow;
    const loadedSections = (sectionResult.data ?? []) as SectionRow[];
    const loadedItems = (itemResult.data ?? []) as TemplateItemRow[];

    setTemplate(loadedTemplate);
    setSections(loadedSections);
    setItems(loadedItems);
    setLibraryItems((libraryResult.data ?? []) as LibraryItemRow[]);
    setRiskMatrices((matrixResult.data ?? []) as RiskMatrixRow[]);
    setForm({
      name: loadedTemplate.name,
      code: loadedTemplate.code,
      description: loadedTemplate.description ?? "",
      asset_group: loadedTemplate.asset_group,
      asset_types: loadedTemplate.asset_types ?? [],
      risk_matrix_id: loadedTemplate.risk_matrix_id ?? "",
      report_title: loadedTemplate.report_title,
      report_subtitle: loadedTemplate.report_subtitle ?? "",
      default_assessment_purpose:
        loadedTemplate.default_assessment_purpose,
      default_review_months: String(
        loadedTemplate.default_review_months,
      ),
      important_information:
        loadedTemplate.important_information ?? "",
      assessor_declaration:
        loadedTemplate.assessor_declaration ?? "",
      operator_acknowledgement_text:
        loadedTemplate.operator_acknowledgement_text ?? "",
      allow_prefill_from_previous:
        loadedTemplate.allow_prefill_from_previous,
      allow_prefill_from_asset_register:
        loadedTemplate.allow_prefill_from_asset_register,
      require_review_before_approval:
        loadedTemplate.require_review_before_approval,
    });

    setExpandedSections(
      new Set(loadedSections.map((section) => section.id)),
    );
    setLoading(false);
  }, [supabase, templateId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPage();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadPage]);

  const filteredLibrary = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();

    return libraryItems.filter((item) => {
      if (!query) return true;

      return [
        item.title,
        item.code,
        item.category,
        item.subcategory,
        ...(item.hazards ?? []),
        ...(item.reference_documents ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [libraryItems, librarySearch]);

  const itemCountBySection = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.is_active) continue;
      counts.set(
        item.section_id,
        (counts.get(item.section_id) ?? 0) + 1,
      );
    }
    return counts;
  }, [items]);

  function clearMessages() {
    setMessage("");
    setErrorMessage("");
  }

  function updateTemplateForm<K extends keyof TemplateForm>(
    key: K,
    value: TemplateForm[K],
  ) {
    setForm((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }

  function toggleAssetType(assetType: string) {
    setForm((current) => {
      if (!current) return current;

      const selected = current.asset_types.includes(assetType);

      return {
        ...current,
        asset_types: selected
          ? current.asset_types.filter((item) => item !== assetType)
          : [...current.asset_types, assetType],
      };
    });
  }

  function toggleSection(sectionId: string) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !template || readOnly) return;

    clearMessages();

    const reviewMonths = Number(form.default_review_months);

    if (!clean(form.name)) {
      setErrorMessage("Template name is required.");
      return;
    }

    if (!normaliseCode(form.code)) {
      setErrorMessage("Template code is required.");
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
        "Review period must be between 1 and 120 months.",
      );
      return;
    }

    setSavingTemplate(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("asset_risk_templates")
      .update({
        name: clean(form.name),
        code: normaliseCode(form.code),
        description: clean(form.description) || null,
        asset_group: form.asset_group,
        asset_types: form.asset_types,
        risk_matrix_id: form.risk_matrix_id || null,
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
        updated_by: user?.id ?? null,
      })
      .eq("id", template.id);

    setSavingTemplate(false);

    if (error) {
      setErrorMessage(`Failed to save template: ${error.message}`);
      return;
    }

    setMessage("Template details saved.");
    await loadPage();
  }

  function openCreateSection() {
    clearMessages();
    setEditingSection(null);
    setSectionForm(EMPTY_SECTION_FORM);
    setShowSectionModal(true);
  }

  function openEditSection(section: SectionRow) {
    clearMessages();
    setEditingSection(section);
    setSectionForm({
      title: section.title,
      code: section.code ?? "",
      description: section.description ?? "",
      is_collapsed_by_default:
        section.is_collapsed_by_default,
    });
    setShowSectionModal(true);
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;

    const title = clean(sectionForm.title);
    if (!title) {
      setErrorMessage("Section title is required.");
      return;
    }

    setBusyId(editingSection?.id ?? "new-section");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (editingSection) {
      const { error } = await supabase
        .from("asset_risk_template_sections")
        .update({
          title,
          code: normaliseCode(sectionForm.code || title),
          description: clean(sectionForm.description) || null,
          is_collapsed_by_default:
            sectionForm.is_collapsed_by_default,
          updated_by: user?.id ?? null,
        })
        .eq("id", editingSection.id);

      setBusyId(null);

      if (error) {
        setErrorMessage(`Failed to update section: ${error.message}`);
        return;
      }
    } else {
      const nextOrder =
        Math.max(-1, ...sections.map((section) => section.display_order)) +
        1;

      const { error } = await supabase
        .from("asset_risk_template_sections")
        .insert({
          template_id: templateId,
          title,
          code: normaliseCode(sectionForm.code || title),
          description: clean(sectionForm.description) || null,
          display_order: nextOrder,
          is_active: true,
          is_collapsed_by_default:
            sectionForm.is_collapsed_by_default,
          conditional_config: {},
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });

      setBusyId(null);

      if (error) {
        setErrorMessage(`Failed to create section: ${error.message}`);
        return;
      }
    }

    setShowSectionModal(false);
    setEditingSection(null);
    setSectionForm(EMPTY_SECTION_FORM);
    setMessage(editingSection ? "Section updated." : "Section created.");
    await loadPage();
  }

  async function deleteSection(section: SectionRow) {
    if (readOnly) return;

    const count = itemCountBySection.get(section.id) ?? 0;
    const confirmed = window.confirm(
      `Delete "${section.title}"?\n\n${count} assessment item(s) in this section will also be deleted.`,
    );

    if (!confirmed) return;

    setBusyId(section.id);

    const { error } = await supabase
      .from("asset_risk_template_sections")
      .delete()
      .eq("id", section.id);

    setBusyId(null);

    if (error) {
      setErrorMessage(`Failed to delete section: ${error.message}`);
      return;
    }

    setMessage("Section deleted.");
    await loadPage();
  }

  async function moveSection(section: SectionRow, direction: -1 | 1) {
    if (readOnly) return;

    const ordered = [...sections].sort(
      (a, b) => a.display_order - b.display_order,
    );
    const index = ordered.findIndex((item) => item.id === section.id);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
      return;
    }

    const target = ordered[targetIndex];

    setBusyId(section.id);

    const { error: firstError } = await supabase
      .from("asset_risk_template_sections")
      .update({ display_order: target.display_order })
      .eq("id", section.id);

    if (!firstError) {
      await supabase
        .from("asset_risk_template_sections")
        .update({ display_order: section.display_order })
        .eq("id", target.id);
    }

    setBusyId(null);

    if (firstError) {
      setErrorMessage(`Failed to reorder section: ${firstError.message}`);
      return;
    }

    await loadPage();
  }

  function openLibrary(sectionId: string) {
    setLibraryTargetSectionId(sectionId);
    setLibrarySearch("");
    setSelectedLibraryIds(new Set());
    setShowLibraryModal(true);
  }

  function toggleLibrarySelection(id: string) {
    setSelectedLibraryIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function addSelectedLibraryItems() {
    if (
      readOnly ||
      !libraryTargetSectionId ||
      selectedLibraryIds.size === 0
    ) {
      return;
    }

    const existingIds = new Set(
      items
        .filter(
          (item) =>
            item.section_id === libraryTargetSectionId &&
            item.library_item_id,
        )
        .map((item) => item.library_item_id as string),
    );

    const idsToAdd = [...selectedLibraryIds].filter(
      (id) => !existingIds.has(id),
    );

    if (idsToAdd.length === 0) {
      setErrorMessage(
        "All selected library items are already in this section.",
      );
      return;
    }

    const currentSectionItems = items.filter(
      (item) => item.section_id === libraryTargetSectionId,
    );
    const startingOrder =
      Math.max(
        -1,
        ...currentSectionItems.map((item) => item.display_order),
      ) + 1;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rows = idsToAdd.map((libraryItemId, index) => ({
      template_id: templateId,
      section_id: libraryTargetSectionId,
      library_item_id: libraryItemId,
      display_order: startingOrder + index,
      is_required: true,
      is_active: true,
      conditional_config: {},
      prefill_config: {},
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    }));

    setBusyId("add-library");

    const { error } = await supabase
      .from("asset_risk_template_items")
      .insert(rows);

    setBusyId(null);

    if (error) {
      setErrorMessage(
        `Failed to add library items: ${error.message}`,
      );
      return;
    }

    setShowLibraryModal(false);
    setSelectedLibraryIds(new Set());
    setMessage(`${idsToAdd.length} item(s) added to the section.`);
    await loadPage();
  }

  function openNewLibraryItem(sectionId: string) {
    setNewLibraryTargetSectionId(sectionId);
    setNewLibraryForm({
      ...EMPTY_LIBRARY_FORM,
      applies_to: form?.asset_types ?? [],
    });
    setShowNewLibraryModal(true);
  }

  async function createLibraryItemAndAdd(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (readOnly || !newLibraryTargetSectionId) return;

    const title = clean(newLibraryForm.title);
    const code = normaliseCode(
      newLibraryForm.code || newLibraryForm.title,
    );

    if (!title || !code) {
      setErrorMessage("Risk item title and code are required.");
      return;
    }

    if (!clean(newLibraryForm.inspection_question)) {
      setErrorMessage("Inspection question is required.");
      return;
    }

    if (!clean(newLibraryForm.in_place_text)) {
      setErrorMessage("In-place treatment wording is required.");
      return;
    }

    if (!clean(newLibraryForm.required_text)) {
      setErrorMessage("Required treatment wording is required.");
      return;
    }

    const prelimLikelihood = Number(
      newLibraryForm.preliminary_likelihood,
    );
    const prelimConsequence = Number(
      newLibraryForm.preliminary_consequence,
    );
    const residualLikelihood = Number(
      newLibraryForm.residual_likelihood,
    );
    const residualConsequence = Number(
      newLibraryForm.residual_consequence,
    );

    setBusyId("new-library");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: libraryData, error: libraryError } = await supabase
      .from("asset_risk_library_items")
      .insert({
        title,
        code,
        category: clean(newLibraryForm.category) || null,
        hazards: csvToArray(newLibraryForm.hazards),
        inspection_question: clean(
          newLibraryForm.inspection_question,
        ),
        in_place_text: clean(newLibraryForm.in_place_text),
        required_text: clean(newLibraryForm.required_text),
        unable_to_verify_text:
          clean(newLibraryForm.unable_to_verify_text) || null,
        reference_documents: csvToArray(newLibraryForm.references),
        default_preliminary_likelihood: prelimLikelihood,
        default_preliminary_consequence: prelimConsequence,
        default_residual_likelihood: residualLikelihood,
        default_residual_consequence: residualConsequence,
        requires_photo: newLibraryForm.requires_photo,
        requires_comment_if_required:
          newLibraryForm.requires_comment_if_required,
        requires_comment_if_unable_to_verify: true,
        requires_function_test:
          newLibraryForm.requires_function_test,
        requires_document_verification:
          newLibraryForm.requires_document_verification,
        allow_not_applicable:
          newLibraryForm.allow_not_applicable,
        allow_unable_to_verify:
          newLibraryForm.allow_unable_to_verify,
        auto_create_fleet_job:
          newLibraryForm.auto_create_fleet_job,
        default_fleet_job_priority:
          newLibraryForm.auto_create_fleet_job
            ? newLibraryForm.default_fleet_job_priority
            : null,
        stop_use_when_required:
          newLibraryForm.stop_use_when_required,
        applies_to: newLibraryForm.applies_to,
        is_active: true,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select("*")
      .single();

    if (libraryError) {
      setBusyId(null);
      setErrorMessage(
        `Failed to create risk-library item: ${libraryError.message}`,
      );
      return;
    }

    const currentSectionItems = items.filter(
      (item) => item.section_id === newLibraryTargetSectionId,
    );
    const nextOrder =
      Math.max(
        -1,
        ...currentSectionItems.map((item) => item.display_order),
      ) + 1;

    const { error: itemError } = await supabase
      .from("asset_risk_template_items")
      .insert({
        template_id: templateId,
        section_id: newLibraryTargetSectionId,
        library_item_id: libraryData.id,
        display_order: nextOrder,
        is_required: true,
        is_active: true,
        conditional_config: {},
        prefill_config: {},
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });

    setBusyId(null);

    if (itemError) {
      setErrorMessage(
        `Risk item was created but could not be added to the template: ${itemError.message}`,
      );
      return;
    }

    setShowNewLibraryModal(false);
    setNewLibraryForm(EMPTY_LIBRARY_FORM);
    setMessage("New risk-library item created and added.");
    await loadPage();
  }

  function openItemEditor(item: TemplateItemRow) {
    const library = item.library;
    if (!library) return;

    setEditingItem(item);
    setItemOverrideForm({
      title: item.override_title ?? library.title,
      question:
        item.override_question ?? library.inspection_question,
      in_place_text:
        item.override_in_place_text ?? library.in_place_text,
      required_text:
        item.override_required_text ?? library.required_text,
      unable_to_verify_text:
        item.override_unable_to_verify_text ??
        library.unable_to_verify_text ??
        "",
      hazards: arrayToCsv(
        item.override_hazards ?? library.hazards,
      ),
      references: arrayToCsv(
        item.override_reference_documents ??
          library.reference_documents,
      ),
      preliminary_likelihood: String(
        item.override_preliminary_likelihood ??
          library.default_preliminary_likelihood,
      ),
      preliminary_consequence: String(
        item.override_preliminary_consequence ??
          library.default_preliminary_consequence,
      ),
      residual_likelihood: String(
        item.override_residual_likelihood ??
          library.default_residual_likelihood,
      ),
      residual_consequence: String(
        item.override_residual_consequence ??
          library.default_residual_consequence,
      ),
      default_due_days:
        item.override_default_due_days?.toString() ?? "",
      fleet_job_priority:
        item.override_fleet_job_priority ??
        library.default_fleet_job_priority ??
        "medium",
      allow_not_applicable:
        item.allow_not_applicable ??
        library.allow_not_applicable,
      allow_unable_to_verify:
        item.allow_unable_to_verify ??
        library.allow_unable_to_verify,
      requires_photo:
        item.requires_photo ?? library.requires_photo,
      requires_comment_if_required:
        item.requires_comment_if_required ??
        library.requires_comment_if_required,
      requires_function_test:
        item.requires_function_test ??
        library.requires_function_test,
      requires_document_verification:
        item.requires_document_verification ??
        library.requires_document_verification,
      auto_create_fleet_job:
        item.auto_create_fleet_job ??
        library.auto_create_fleet_job,
      stop_use_when_required:
        item.stop_use_when_required ??
        library.stop_use_when_required,
    });
  }

  async function saveItemOverrides(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      readOnly ||
      !editingItem ||
      !itemOverrideForm ||
      !editingItem.library
    ) {
      return;
    }

    const library = editingItem.library;

    setBusyId(editingItem.id);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("asset_risk_template_items")
      .update({
        override_title:
          clean(itemOverrideForm.title) === library.title
            ? null
            : clean(itemOverrideForm.title),
        override_question:
          clean(itemOverrideForm.question) ===
          library.inspection_question
            ? null
            : clean(itemOverrideForm.question),
        override_in_place_text:
          clean(itemOverrideForm.in_place_text) ===
          library.in_place_text
            ? null
            : clean(itemOverrideForm.in_place_text),
        override_required_text:
          clean(itemOverrideForm.required_text) ===
          library.required_text
            ? null
            : clean(itemOverrideForm.required_text),
        override_unable_to_verify_text:
          clean(itemOverrideForm.unable_to_verify_text) ===
          clean(library.unable_to_verify_text)
            ? null
            : clean(itemOverrideForm.unable_to_verify_text) || null,
        override_hazards:
          arrayToCsv(library.hazards) ===
          clean(itemOverrideForm.hazards)
            ? null
            : csvToArray(itemOverrideForm.hazards),
        override_reference_documents:
          arrayToCsv(library.reference_documents) ===
          clean(itemOverrideForm.references)
            ? null
            : csvToArray(itemOverrideForm.references),
        override_preliminary_likelihood:
          Number(itemOverrideForm.preliminary_likelihood) ===
          library.default_preliminary_likelihood
            ? null
            : Number(itemOverrideForm.preliminary_likelihood),
        override_preliminary_consequence:
          Number(itemOverrideForm.preliminary_consequence) ===
          library.default_preliminary_consequence
            ? null
            : Number(itemOverrideForm.preliminary_consequence),
        override_residual_likelihood:
          Number(itemOverrideForm.residual_likelihood) ===
          library.default_residual_likelihood
            ? null
            : Number(itemOverrideForm.residual_likelihood),
        override_residual_consequence:
          Number(itemOverrideForm.residual_consequence) ===
          library.default_residual_consequence
            ? null
            : Number(itemOverrideForm.residual_consequence),
        override_default_due_days:
          itemOverrideForm.default_due_days
            ? Number(itemOverrideForm.default_due_days)
            : null,
        override_fleet_job_priority:
          itemOverrideForm.auto_create_fleet_job
            ? itemOverrideForm.fleet_job_priority
            : null,
        allow_not_applicable:
          itemOverrideForm.allow_not_applicable,
        allow_unable_to_verify:
          itemOverrideForm.allow_unable_to_verify,
        requires_photo: itemOverrideForm.requires_photo,
        requires_comment_if_required:
          itemOverrideForm.requires_comment_if_required,
        requires_function_test:
          itemOverrideForm.requires_function_test,
        requires_document_verification:
          itemOverrideForm.requires_document_verification,
        auto_create_fleet_job:
          itemOverrideForm.auto_create_fleet_job,
        stop_use_when_required:
          itemOverrideForm.stop_use_when_required,
        updated_by: user?.id ?? null,
      })
      .eq("id", editingItem.id);

    setBusyId(null);

    if (error) {
      setErrorMessage(
        `Failed to update template item: ${error.message}`,
      );
      return;
    }

    setEditingItem(null);
    setItemOverrideForm(null);
    setMessage("Assessment item updated.");
    await loadPage();
  }

  async function removeTemplateItem(item: TemplateItemRow) {
    if (readOnly) return;

    const title =
      item.override_title ?? item.library?.title ?? "this item";

    if (!window.confirm(`Remove "${title}" from this template?`)) {
      return;
    }

    setBusyId(item.id);

    const { error } = await supabase
      .from("asset_risk_template_items")
      .delete()
      .eq("id", item.id);

    setBusyId(null);

    if (error) {
      setErrorMessage(`Failed to remove item: ${error.message}`);
      return;
    }

    setMessage("Assessment item removed.");
    await loadPage();
  }

  async function moveTemplateItem(
    item: TemplateItemRow,
    direction: -1 | 1,
  ) {
    if (readOnly) return;

    const sectionItems = items
      .filter((candidate) => candidate.section_id === item.section_id)
      .sort((a, b) => a.display_order - b.display_order);

    const index = sectionItems.findIndex(
      (candidate) => candidate.id === item.id,
    );
    const targetIndex = index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >= sectionItems.length
    ) {
      return;
    }

    const target = sectionItems[targetIndex];

    setBusyId(item.id);

    const { error: firstError } = await supabase
      .from("asset_risk_template_items")
      .update({ display_order: target.display_order })
      .eq("id", item.id);

    if (!firstError) {
      await supabase
        .from("asset_risk_template_items")
        .update({ display_order: item.display_order })
        .eq("id", target.id);
    }

    setBusyId(null);

    if (firstError) {
      setErrorMessage(`Failed to reorder item: ${firstError.message}`);
      return;
    }

    await loadPage();
  }

  async function publishTemplate() {
    if (!template || readOnly) return;

    if (sections.length === 0) {
      setErrorMessage("Add at least one section before publishing.");
      return;
    }

    if (items.length === 0) {
      setErrorMessage(
        "Add at least one assessment item before publishing.",
      );
      return;
    }

    if (
      !window.confirm(
        `Publish ${template.name} version ${template.version_number}?\n\nThis version will become read-only and available for new assessments.`,
      )
    ) {
      return;
    }

    setBusyId("publish");

    const { error } = await supabase.rpc(
      "publish_asset_risk_template",
      { p_template_id: template.id },
    );

    setBusyId(null);

    if (error) {
      setErrorMessage(`Failed to publish template: ${error.message}`);
      return;
    }

    setMessage("Template published successfully.");
    await loadPage();
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto animate-spin text-slate-500" />
            <p className="mt-3 text-sm font-semibold text-slate-600">
              Loading template editor...
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!template || !form) {
    return (
      <PageShell>
        <div className="p-8">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <h1 className="text-lg font-black text-rose-900">
              Template not available
            </h1>
            <p className="mt-2 text-sm text-rose-800">
              {errorMessage || "The requested template could not be loaded."}
            </p>
            <Link
              href="/assets/risk-assessments/templates"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              <ArrowLeft size={16} />
              Back to Templates
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Risk Assessments"
        title={template.name}
        description={`Template ${template.code} · Version ${template.version_number} · ${prettify(
          template.status,
        )}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/risk-assessments/templates"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Templates
            </Link>

            <button
              type="button"
              onClick={() => void loadPage()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={() => void publishTemplate()}
                disabled={busyId === "publish"}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                {busyId === "publish" ? "Publishing..." : "Publish"}
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
        {readOnly && (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Lock className="mt-0.5 shrink-0" size={18} />
            <div>
              <p className="text-sm font-black">
                This template version is read-only
              </p>
              <p className="mt-1 text-sm leading-6">
                Published and archived versions cannot be edited. Duplicate
                this template from the templates register to create a new
                editable draft.
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
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={saveTemplate}
          className="rounded-3xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-slate-900 p-3 text-white">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Template settings
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Configure the assets, report wording and automation used by
                  this template.
                </p>
              </div>
            </div>
          </div>

          <fieldset
            disabled={readOnly || savingTemplate}
            className="space-y-8 p-5 disabled:opacity-75 sm:p-6"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <TextField
                label="Template name"
                value={form.name}
                required
                onChange={(value) =>
                  updateTemplateForm("name", value)
                }
              />

              <TextField
                label="Template code"
                value={form.code}
                required
                onChange={(value) =>
                  updateTemplateForm("code", normaliseCode(value))
                }
              />

              <SelectField
                label="Asset group"
                value={form.asset_group}
                options={[
                  { value: "vehicle", label: "Vehicle" },
                  { value: "plant", label: "Plant" },
                  { value: "trailer", label: "Trailer" },
                  { value: "equipment", label: "Equipment" },
                ]}
                onChange={(value) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          asset_group: value,
                          asset_types: [],
                        }
                      : current,
                  )
                }
              />

              <SelectField
                label="Risk matrix"
                value={form.risk_matrix_id}
                options={[
                  { value: "", label: "No matrix selected" },
                  ...riskMatrices.map((matrix) => ({
                    value: matrix.id,
                    label: `${matrix.name}${
                      matrix.is_default ? " — Default" : ""
                    }`,
                  })),
                ]}
                onChange={(value) =>
                  updateTemplateForm("risk_matrix_id", value)
                }
              />

              <div className="lg:col-span-2">
                <TextAreaField
                  label="Description"
                  value={form.description}
                  rows={3}
                  onChange={(value) =>
                    updateTemplateForm("description", value)
                  }
                />
              </div>
            </div>

            <div>
              <SectionHeading
                title="Applicable asset types"
                description="Select all vehicle, plant, trailer or equipment types that can use this template."
              />

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(ASSET_TYPE_OPTIONS[form.asset_group] ?? []).map(
                  (assetType) => {
                    const selected =
                      form.asset_types.includes(assetType);

                    return (
                      <button
                        type="button"
                        key={assetType}
                        onClick={() => toggleAssetType(assetType)}
                        className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${
                          selected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
              <SectionHeading
                title="Report defaults"
                description="These values are copied into each assessment and included in the generated report."
              />

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <TextField
                  label="Report title"
                  value={form.report_title}
                  onChange={(value) =>
                    updateTemplateForm("report_title", value)
                  }
                />

                <TextField
                  label="Report subtitle"
                  value={form.report_subtitle}
                  onChange={(value) =>
                    updateTemplateForm("report_subtitle", value)
                  }
                />

                <TextField
                  label="Default assessment purpose"
                  value={form.default_assessment_purpose}
                  onChange={(value) =>
                    updateTemplateForm(
                      "default_assessment_purpose",
                      value,
                    )
                  }
                />

                <TextField
                  label="Review period in months"
                  type="number"
                  value={form.default_review_months}
                  onChange={(value) =>
                    updateTemplateForm(
                      "default_review_months",
                      value,
                    )
                  }
                />

                <div className="lg:col-span-2">
                  <TextAreaField
                    label="Important information and limitations"
                    value={form.important_information}
                    rows={5}
                    onChange={(value) =>
                      updateTemplateForm(
                        "important_information",
                        value,
                      )
                    }
                  />
                </div>

                <div className="lg:col-span-2">
                  <TextAreaField
                    label="Assessor declaration"
                    value={form.assessor_declaration}
                    rows={4}
                    onChange={(value) =>
                      updateTemplateForm(
                        "assessor_declaration",
                        value,
                      )
                    }
                  />
                </div>

                <div className="lg:col-span-2">
                  <TextAreaField
                    label="Operator acknowledgement"
                    value={form.operator_acknowledgement_text}
                    rows={4}
                    onChange={(value) =>
                      updateTemplateForm(
                        "operator_acknowledgement_text",
                        value,
                      )
                    }
                  />
                </div>
              </div>
            </div>

            <div>
              <SectionHeading
                title="Automation"
                description="Control what TTTracker copies into new assessments."
              />

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <ToggleCard
                  title="Prefill asset details"
                  description="Load report-safe information from the selected asset record."
                  checked={
                    form.allow_prefill_from_asset_register
                  }
                  onChange={(checked) =>
                    updateTemplateForm(
                      "allow_prefill_from_asset_register",
                      checked,
                    )
                  }
                />

                <ToggleCard
                  title="Prefill previous answers"
                  description="Use the most recent approved assessment as a starting point."
                  checked={form.allow_prefill_from_previous}
                  onChange={(checked) =>
                    updateTemplateForm(
                      "allow_prefill_from_previous",
                      checked,
                    )
                  }
                />

                <ToggleCard
                  title="Manager review"
                  description="Require approval before the assessment becomes final."
                  checked={
                    form.require_review_before_approval
                  }
                  onChange={(checked) =>
                    updateTemplateForm(
                      "require_review_before_approval",
                      checked,
                    )
                  }
                />
              </div>
            </div>

            {!readOnly && (
              <div className="flex justify-end border-t border-slate-200 pt-6">
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save size={16} />
                  {savingTemplate ? "Saving..." : "Save Template"}
                </button>
              </div>
            )}
          </fieldset>
        </form>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Sections and assessment items
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Organise the report into sections and reuse controls from the
                master risk library.
              </p>
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={openCreateSection}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                Add Section
              </button>
            )}
          </div>

          {sections.length === 0 ? (
            <div className="p-10 text-center">
              <FileText className="mx-auto text-slate-400" size={32} />
              <h3 className="mt-4 text-lg font-black text-slate-900">
                No sections yet
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Start with sections such as Documentation, Operation,
                Design Compliance and Maintenance.
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={openCreateSection}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
                >
                  <Plus size={16} />
                  Create First Section
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-6">
              {sections.map((section, sectionIndex) => {
                const expanded = expandedSections.has(section.id);
                const sectionItems = items
                  .filter((item) => item.section_id === section.id)
                  .sort(
                    (a, b) => a.display_order - b.display_order,
                  );

                return (
                  <div
                    key={section.id}
                    className="overflow-hidden rounded-2xl border border-slate-200"
                  >
                    <div className="flex items-start gap-3 bg-slate-50 p-4">
                      <GripVertical
                        className="mt-1 shrink-0 text-slate-400"
                        size={18}
                      />

                      <button
                        type="button"
                        onClick={() => toggleSection(section.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-slate-950">
                            {section.title}
                          </h3>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
                            {sectionItems.length} items
                          </span>
                          {section.code && (
                            <span className="text-xs font-bold text-slate-400">
                              {section.code}
                            </span>
                          )}
                        </div>

                        {section.description && (
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {section.description}
                          </p>
                        )}
                      </button>

                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {!readOnly && (
                          <>
                            <IconButton
                              label="Move section up"
                              disabled={sectionIndex === 0}
                              onClick={() =>
                                void moveSection(section, -1)
                              }
                            >
                              <ArrowUp size={15} />
                            </IconButton>
                            <IconButton
                              label="Move section down"
                              disabled={
                                sectionIndex === sections.length - 1
                              }
                              onClick={() =>
                                void moveSection(section, 1)
                              }
                            >
                              <ArrowDown size={15} />
                            </IconButton>
                            <IconButton
                              label="Edit section"
                              onClick={() => openEditSection(section)}
                            >
                              <Pencil size={15} />
                            </IconButton>
                            <IconButton
                              label="Delete section"
                              danger
                              onClick={() =>
                                void deleteSection(section)
                              }
                            >
                              <Trash2 size={15} />
                            </IconButton>
                          </>
                        )}

                        <IconButton
                          label={
                            expanded
                              ? "Collapse section"
                              : "Expand section"
                          }
                          onClick={() => toggleSection(section.id)}
                        >
                          {expanded ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </IconButton>
                      </div>
                    </div>

                    {expanded && (
                      <div className="space-y-3 p-4">
                        {!readOnly && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openLibrary(section.id)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <Library size={15} />
                              Add From Library
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openNewLibraryItem(section.id)
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
                            >
                              <Plus size={15} />
                              Create New Risk Item
                            </button>
                          </div>
                        )}

                        {sectionItems.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                            No assessment items have been added to this
                            section.
                          </div>
                        ) : (
                          sectionItems.map((item, itemIndex) => {
                            const library = item.library;
                            const title =
                              item.override_title ??
                              library?.title ??
                              "Unnamed item";
                            const question =
                              item.override_question ??
                              library?.inspection_question ??
                              "";
                            const hazards =
                              item.override_hazards ??
                              library?.hazards ??
                              [];
                            const prelimLikelihood =
                              item.override_preliminary_likelihood ??
                              library?.default_preliminary_likelihood ??
                              3;
                            const prelimConsequence =
                              item.override_preliminary_consequence ??
                              library?.default_preliminary_consequence ??
                              3;
                            const residualLikelihood =
                              item.override_residual_likelihood ??
                              library?.default_residual_likelihood ??
                              2;
                            const residualConsequence =
                              item.override_residual_consequence ??
                              library?.default_residual_consequence ??
                              2;
                            const prelimScore = riskScore(
                              prelimLikelihood,
                              prelimConsequence,
                            );
                            const residualScore = riskScore(
                              residualLikelihood,
                              residualConsequence,
                            );

                            return (
                              <div
                                key={item.id}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-black text-slate-950">
                                        {title}
                                      </h4>

                                      <span
                                        className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${riskBadge(
                                          riskLevel(prelimScore),
                                        )}`}
                                      >
                                        Initial {prelimScore}
                                      </span>

                                      <span
                                        className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${riskBadge(
                                          riskLevel(residualScore),
                                        )}`}
                                      >
                                        Residual {residualScore}
                                      </span>

                                      {(item.override_title ||
                                        item.override_question ||
                                        item.override_required_text ||
                                        item.override_in_place_text) && (
                                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                                          Template override
                                        </span>
                                      )}
                                    </div>

                                    <p className="mt-2 text-sm leading-6 text-slate-700">
                                      {question}
                                    </p>

                                    {hazards.length > 0 && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {hazards.map((hazard) => (
                                          <span
                                            key={hazard}
                                            className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
                                          >
                                            {prettify(hazard)}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                                      <span>
                                        Photo:{" "}
                                        {(item.requires_photo ??
                                          library?.requires_photo)
                                          ? "Required"
                                          : "Optional"}
                                      </span>
                                      <span>
                                        Function test:{" "}
                                        {(item.requires_function_test ??
                                          library?.requires_function_test)
                                          ? "Required"
                                          : "No"}
                                      </span>
                                      <span>
                                        Fleet job:{" "}
                                        {(item.auto_create_fleet_job ??
                                          library?.auto_create_fleet_job)
                                          ? "Automatic"
                                          : "No"}
                                      </span>
                                      <span>
                                        Stop use:{" "}
                                        {(item.stop_use_when_required ??
                                          library?.stop_use_when_required)
                                          ? "Yes"
                                          : "No"}
                                      </span>
                                    </div>
                                  </div>

                                  {!readOnly && (
                                    <div className="flex shrink-0 flex-wrap gap-1">
                                      <IconButton
                                        label="Move item up"
                                        disabled={itemIndex === 0}
                                        onClick={() =>
                                          void moveTemplateItem(item, -1)
                                        }
                                      >
                                        <ArrowUp size={15} />
                                      </IconButton>

                                      <IconButton
                                        label="Move item down"
                                        disabled={
                                          itemIndex ===
                                          sectionItems.length - 1
                                        }
                                        onClick={() =>
                                          void moveTemplateItem(item, 1)
                                        }
                                      >
                                        <ArrowDown size={15} />
                                      </IconButton>

                                      <IconButton
                                        label="Edit template item"
                                        onClick={() =>
                                          openItemEditor(item)
                                        }
                                      >
                                        <Pencil size={15} />
                                      </IconButton>

                                      <IconButton
                                        label="Remove item"
                                        danger
                                        onClick={() =>
                                          void removeTemplateItem(item)
                                        }
                                      >
                                        <Trash2 size={15} />
                                      </IconButton>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {showSectionModal && (
        <Modal
          title={editingSection ? "Edit Section" : "Add Section"}
          onClose={() => setShowSectionModal(false)}
        >
          <form onSubmit={saveSection} className="space-y-4">
            <TextField
              label="Section title"
              required
              value={sectionForm.title}
              onChange={(value) =>
                setSectionForm((current) => ({
                  ...current,
                  title: value,
                }))
              }
            />

            <TextField
              label="Section code"
              value={sectionForm.code}
              onChange={(value) =>
                setSectionForm((current) => ({
                  ...current,
                  code: normaliseCode(value),
                }))
              }
            />

            <TextAreaField
              label="Description"
              value={sectionForm.description}
              rows={3}
              onChange={(value) =>
                setSectionForm((current) => ({
                  ...current,
                  description: value,
                }))
              }
            />

            <ToggleCard
              title="Collapsed by default"
              description="The section starts collapsed when an assessor opens the assessment."
              checked={sectionForm.is_collapsed_by_default}
              onChange={(checked) =>
                setSectionForm((current) => ({
                  ...current,
                  is_collapsed_by_default: checked,
                }))
              }
            />

            <ModalActions
              busy={busyId === (editingSection?.id ?? "new-section")}
              submitLabel={editingSection ? "Save Section" : "Add Section"}
              onCancel={() => setShowSectionModal(false)}
            />
          </form>
        </Modal>
      )}

      {showLibraryModal && (
        <Modal
          title="Add From Risk Library"
          wide
          onClose={() => setShowLibraryModal(false)}
        >
          <div className="space-y-4">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={librarySearch}
                onChange={(event) =>
                  setLibrarySearch(event.target.value)
                }
                placeholder="Search risks, hazards, codes or references..."
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {filteredLibrary.map((item) => {
                const selected = selectedLibraryIds.has(item.id);
                const alreadyAdded = items.some(
                  (templateItem) =>
                    templateItem.section_id ===
                      libraryTargetSectionId &&
                    templateItem.library_item_id === item.id,
                );

                return (
                  <button
                    type="button"
                    key={item.id}
                    disabled={alreadyAdded}
                    onClick={() => toggleLibrarySelection(item.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      alreadyAdded
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                        : selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black">{item.title}</span>
                          <span className="text-xs font-bold opacity-70">
                            {item.code}
                          </span>
                          {alreadyAdded && (
                            <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">
                              Already added
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 opacity-80">
                          {item.inspection_question}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-sm font-bold text-slate-600">
                {selectedLibraryIds.size} selected
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void addSelectedLibraryItems()}
                  disabled={
                    selectedLibraryIds.size === 0 ||
                    busyId === "add-library"
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Plus size={15} />
                  Add Selected
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {showNewLibraryModal && (
        <Modal
          title="Create New Risk Item"
          wide
          onClose={() => setShowNewLibraryModal(false)}
        >
          <form
            onSubmit={createLibraryItemAndAdd}
            className="space-y-6"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <TextField
                label="Title"
                required
                value={newLibraryForm.title}
                onChange={(value) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    title: value,
                    code: current.code || normaliseCode(value),
                  }))
                }
              />
              <TextField
                label="Code"
                required
                value={newLibraryForm.code}
                onChange={(value) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    code: normaliseCode(value),
                  }))
                }
              />
              <TextField
                label="Category"
                value={newLibraryForm.category}
                onChange={(value) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    category: value,
                  }))
                }
              />
              <TextField
                label="Hazards"
                value={newLibraryForm.hazards}
                helper="Comma-separated, for example collision, crushing."
                onChange={(value) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    hazards: value,
                  }))
                }
              />
              <div className="lg:col-span-2">
                <TextAreaField
                  label="Inspection question"
                  required
                  value={newLibraryForm.inspection_question}
                  rows={3}
                  onChange={(value) =>
                    setNewLibraryForm((current) => ({
                      ...current,
                      inspection_question: value,
                    }))
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <TextAreaField
                  label="Treatment wording when in place"
                  required
                  value={newLibraryForm.in_place_text}
                  rows={4}
                  onChange={(value) =>
                    setNewLibraryForm((current) => ({
                      ...current,
                      in_place_text: value,
                    }))
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <TextAreaField
                  label="Treatment wording when required"
                  required
                  value={newLibraryForm.required_text}
                  rows={4}
                  onChange={(value) =>
                    setNewLibraryForm((current) => ({
                      ...current,
                      required_text: value,
                    }))
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <TextAreaField
                  label="Unable-to-verify wording"
                  value={newLibraryForm.unable_to_verify_text}
                  rows={3}
                  onChange={(value) =>
                    setNewLibraryForm((current) => ({
                      ...current,
                      unable_to_verify_text: value,
                    }))
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <TextField
                  label="References"
                  value={newLibraryForm.references}
                  helper="Comma-separated standards, legislation or guidance."
                  onChange={(value) =>
                    setNewLibraryForm((current) => ({
                      ...current,
                      references: value,
                    }))
                  }
                />
              </div>
            </div>

            <RiskGrid
              preliminaryLikelihood={
                newLibraryForm.preliminary_likelihood
              }
              preliminaryConsequence={
                newLibraryForm.preliminary_consequence
              }
              residualLikelihood={
                newLibraryForm.residual_likelihood
              }
              residualConsequence={
                newLibraryForm.residual_consequence
              }
              onChange={(key, value) =>
                setNewLibraryForm((current) => ({
                  ...current,
                  [key]: value,
                }))
              }
            />

            <div className="grid gap-3 lg:grid-cols-2">
              <ToggleCard
                title="Photo required"
                description="The assessor must attach evidence for this item."
                checked={newLibraryForm.requires_photo}
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    requires_photo: checked,
                  }))
                }
              />
              <ToggleCard
                title="Comment required when missing"
                description="A comment is mandatory when treatment is required."
                checked={
                  newLibraryForm.requires_comment_if_required
                }
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    requires_comment_if_required: checked,
                  }))
                }
              />
              <ToggleCard
                title="Functional test required"
                description="The control must be tested rather than only viewed."
                checked={
                  newLibraryForm.requires_function_test
                }
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    requires_function_test: checked,
                  }))
                }
              />
              <ToggleCard
                title="Document verification required"
                description="A supporting record or document must be checked."
                checked={
                  newLibraryForm.requires_document_verification
                }
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    requires_document_verification: checked,
                  }))
                }
              />
              <ToggleCard
                title="Allow not applicable"
                description="Assessors may exclude this item where it does not apply."
                checked={newLibraryForm.allow_not_applicable}
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    allow_not_applicable: checked,
                  }))
                }
              />
              <ToggleCard
                title="Allow unable to verify"
                description="Assessors may record that the control could not be confirmed."
                checked={newLibraryForm.allow_unable_to_verify}
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    allow_unable_to_verify: checked,
                  }))
                }
              />
              <ToggleCard
                title="Create fleet job"
                description="Automatically raise a fleet job when treatment is required."
                checked={newLibraryForm.auto_create_fleet_job}
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    auto_create_fleet_job: checked,
                  }))
                }
              />
              <ToggleCard
                title="Stop use when required"
                description="Flag the asset as unsuitable for operation until rectified."
                checked={newLibraryForm.stop_use_when_required}
                onChange={(checked) =>
                  setNewLibraryForm((current) => ({
                    ...current,
                    stop_use_when_required: checked,
                  }))
                }
              />
            </div>

            <ModalActions
              busy={busyId === "new-library"}
              submitLabel="Create and Add Item"
              onCancel={() => setShowNewLibraryModal(false)}
            />
          </form>
        </Modal>
      )}

      {editingItem && itemOverrideForm && (
        <Modal
          title="Edit Template Item"
          wide
          onClose={() => {
            setEditingItem(null);
            setItemOverrideForm(null);
          }}
        >
          <form onSubmit={saveItemOverrides} className="space-y-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
              Changes here apply only to this template. The master
              risk-library item remains unchanged.
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TextField
                label="Title"
                value={itemOverrideForm.title}
                onChange={(value) =>
                  setItemOverrideForm((current) =>
                    current ? { ...current, title: value } : current,
                  )
                }
              />

              <TextField
                label="Hazards"
                value={itemOverrideForm.hazards}
                onChange={(value) =>
                  setItemOverrideForm((current) =>
                    current
                      ? { ...current, hazards: value }
                      : current,
                  )
                }
              />

              <div className="lg:col-span-2">
                <TextAreaField
                  label="Inspection question"
                  value={itemOverrideForm.question}
                  rows={3}
                  onChange={(value) =>
                    setItemOverrideForm((current) =>
                      current
                        ? { ...current, question: value }
                        : current,
                    )
                  }
                />
              </div>

              <div className="lg:col-span-2">
                <TextAreaField
                  label="Treatment wording when in place"
                  value={itemOverrideForm.in_place_text}
                  rows={4}
                  onChange={(value) =>
                    setItemOverrideForm((current) =>
                      current
                        ? { ...current, in_place_text: value }
                        : current,
                    )
                  }
                />
              </div>

              <div className="lg:col-span-2">
                <TextAreaField
                  label="Treatment wording when required"
                  value={itemOverrideForm.required_text}
                  rows={4}
                  onChange={(value) =>
                    setItemOverrideForm((current) =>
                      current
                        ? { ...current, required_text: value }
                        : current,
                    )
                  }
                />
              </div>

              <div className="lg:col-span-2">
                <TextAreaField
                  label="Unable-to-verify wording"
                  value={itemOverrideForm.unable_to_verify_text}
                  rows={3}
                  onChange={(value) =>
                    setItemOverrideForm((current) =>
                      current
                        ? {
                            ...current,
                            unable_to_verify_text: value,
                          }
                        : current,
                    )
                  }
                />
              </div>

              <div className="lg:col-span-2">
                <TextField
                  label="References"
                  value={itemOverrideForm.references}
                  onChange={(value) =>
                    setItemOverrideForm((current) =>
                      current
                        ? { ...current, references: value }
                        : current,
                    )
                  }
                />
              </div>
            </div>

            <RiskGrid
              preliminaryLikelihood={
                itemOverrideForm.preliminary_likelihood
              }
              preliminaryConsequence={
                itemOverrideForm.preliminary_consequence
              }
              residualLikelihood={
                itemOverrideForm.residual_likelihood
              }
              residualConsequence={
                itemOverrideForm.residual_consequence
              }
              onChange={(key, value) =>
                setItemOverrideForm((current) =>
                  current
                    ? {
                        ...current,
                        [key]: value,
                      }
                    : current,
                )
              }
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <TextField
                label="Default rectification days"
                type="number"
                value={itemOverrideForm.default_due_days}
                onChange={(value) =>
                  setItemOverrideForm((current) =>
                    current
                      ? { ...current, default_due_days: value }
                      : current,
                  )
                }
              />

              <SelectField
                label="Fleet job priority"
                value={itemOverrideForm.fleet_job_priority}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "critical", label: "Critical" },
                ]}
                onChange={(value) =>
                  setItemOverrideForm((current) =>
                    current
                      ? { ...current, fleet_job_priority: value }
                      : current,
                  )
                }
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {[
                [
                  "allow_not_applicable",
                  "Allow not applicable",
                  "Assessors may exclude this item.",
                ],
                [
                  "allow_unable_to_verify",
                  "Allow unable to verify",
                  "Assessors may record that the control could not be confirmed.",
                ],
                [
                  "requires_photo",
                  "Photo required",
                  "Evidence must be attached.",
                ],
                [
                  "requires_comment_if_required",
                  "Comment required when missing",
                  "A comment is mandatory for required treatment.",
                ],
                [
                  "requires_function_test",
                  "Functional test required",
                  "The control must be tested.",
                ],
                [
                  "requires_document_verification",
                  "Document verification required",
                  "A supporting document must be checked.",
                ],
                [
                  "auto_create_fleet_job",
                  "Create fleet job",
                  "Raise a fleet job automatically.",
                ],
                [
                  "stop_use_when_required",
                  "Stop use when required",
                  "Flag the asset as unsuitable until rectified.",
                ],
              ].map(([key, title, description]) => (
                <ToggleCard
                  key={key}
                  title={title}
                  description={description}
                  checked={
                    itemOverrideForm[
                      key as keyof ItemOverrideForm
                    ] as boolean
                  }
                  onChange={(checked) =>
                    setItemOverrideForm((current) =>
                      current
                        ? { ...current, [key]: checked }
                        : current,
                    )
                  }
                />
              ))}
            </div>

            <ModalActions
              busy={busyId === editingItem.id}
              submitLabel="Save Item"
              onCancel={() => {
                setEditingItem(null);
                setItemOverrideForm(null);
              }}
            />
          </form>
        </Modal>
      )}
    </PageShell>
  );
}

function SectionHeading({
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

function TextField({
  label,
  value,
  onChange,
  required = false,
  helper,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  helper?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
      {helper && (
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {helper}
        </span>
      )}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      <textarea
        value={value}
        rows={rows}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-2xl border p-4 text-left transition ${
        checked
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
            checked ? "bg-emerald-400" : "bg-slate-300"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${
              checked ? "translate-x-4" : ""
            }`}
          />
        </span>
        <span>
          <span className="block text-sm font-black">{title}</span>
          <span
            className={`mt-1 block text-xs leading-5 ${
              checked ? "text-slate-300" : "text-slate-500"
            }`}
          >
            {description}
          </span>
        </span>
      </div>
    </button>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border p-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function RiskGrid({
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
      <SectionHeading
        title="Risk ratings"
        description="Set the default initial risk and expected residual risk after controls are in place."
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-black text-slate-900">
              Preliminary risk
            </h4>
            <span
              className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${riskBadge(
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
                onChange("preliminary_likelihood", value)
              }
            />
            <RiskSelect
              label="Consequence"
              value={preliminaryConsequence}
              onChange={(value) =>
                onChange("preliminary_consequence", value)
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-black text-slate-900">
              Residual risk
            </h4>
            <span
              className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${riskBadge(
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
                onChange("residual_likelihood", value)
              }
            />
            <RiskSelect
              label="Consequence"
              value={residualConsequence}
              onChange={(value) =>
                onChange("residual_consequence", value)
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
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900"
      >
        {[1, 2, 3, 4, 5].map((score) => (
          <option key={score} value={String(score)}>
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
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4">
      <div
        className={`max-h-[92vh] w-full overflow-hidden rounded-3xl bg-white shadow-2xl ${
          wide ? "max-w-5xl" : "max-w-xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
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

function ModalActions({
  busy,
  submitLabel,
  onCancel,
}: {
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="animate-spin" size={15} />}
        {busy ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}
