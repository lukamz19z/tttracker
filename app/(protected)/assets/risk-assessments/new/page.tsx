"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Gauge,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { PageHeader, PageShell } from "../../components";

type TemplateStatus = "draft" | "published" | "archived";

type RiskTemplate = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  asset_group: string;
  asset_types: string[] | null;
  status: TemplateStatus;
  version_number: number;
  default_assessment_purpose: string;
  default_review_months: number;
  allow_prefill_from_previous: boolean;
  allow_prefill_from_asset_register: boolean;
  require_review_before_approval: boolean;
};

type ExistingAssessment = {
  id: string;
  assessment_number: string;
  asset_source_table: string;
  asset_id: string;
  asset_number: string;
  asset_display_name: string | null;
  asset_type: string | null;
  assessment_date: string;
  status: string;
  overall_result: string;
  template_id: string;
  template_name?: string;
};

type AssetGroup = "vehicle" | "plant" | "trailer" | "equipment";

type AssetRecord = {
  id: string;
  sourceTable: string;
  assetGroup: AssetGroup;
  assetType: string;
  assetNumber: string;
  displayName: string;
  registration: string;
  make: string;
  model: string;
  year: string;
  odometer: string;
  hours: string;
  projectName: string;
  crewName: string;
  status: string;
  ownerName: string;
  state: string;
  imageUrl: string;
  maskedIdentifier: string;
  raw: Record<string, unknown>;
};

type AssessorOption = {
  id: string;
  name: string;
  role: string;
};

type StepNumber = 1 | 2 | 3;

const PURPOSE_OPTIONS = [
  "Plant in use",
  "Pre-purchase assessment",
  "Pre-mobilisation assessment",
  "Annual review",
  "Post-modification review",
  "Return to service",
  "Client requirement",
  "Other",
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function firstValue(
  row: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = row[key];

    if (value !== null && value !== undefined && clean(value)) {
      return clean(value);
    }
  }

  return "";
}

function firstNumberString(
  row: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    const parsed = Number(value);

    if (value !== null && value !== undefined && Number.isFinite(parsed)) {
      return String(parsed);
    }
  }

  return "";
}

function prettify(value: string | null | undefined): string {
  if (!value) return "—";

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normaliseAssetType(value: string): string {
  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases: Record<string, string> = {
    lv: "light_vehicle",
    light_vehicle: "light_vehicle",
    lightvehicle: "light_vehicle",
    ute: "utility",
    utility_vehicle: "utility",
    suv: "suv",
    passenger_vehicle: "passenger_vehicle",
    car: "passenger_vehicle",
    hv: "heavy_vehicle",
    heavy_vehicle: "heavy_vehicle",
    rigid: "rigid_truck",
    rigid_truck: "rigid_truck",
    tilt_tray: "tilt_tray_truck",
    tilt_tray_truck: "tilt_tray_truck",
    prime_mover: "prime_mover",
    semi: "semi_truck",
    semi_truck: "semi_truck",
    semi_trailer: "semi_truck",
    service_vehicle: "service_truck",
    service_truck: "service_truck",
    crane_truck: "crane_truck",
    trailer: "box_trailer",
    general_trailer: "box_trailer",
    box_trailer: "box_trailer",
    flat_top: "flat_top_trailer",
    flat_top_trailer: "flat_top_trailer",
    plant_trailer: "plant_trailer",
    low_loader: "low_loader",
    dolly: "dolly",
    telehandler: "telehandler",
    crane: "mobile_crane",
    mobile_crane: "mobile_crane",
    pick_and_carry: "pick_and_carry_crane",
    pick_and_carry_crane: "pick_and_carry_crane",
    crawler_crane: "crawler_crane",
    forklift: "forklift",
    ewp: "ewp",
    elevating_work_platform: "ewp",
    generator: "generator",
  };

  return aliases[normalised] ?? normalised;
}

function inferAssetGroup(
  sourceTable: string,
  assetType: string,
): AssetGroup {
  const type = normaliseAssetType(assetType);

  if (
    [
      "box_trailer",
      "flat_top_trailer",
      "plant_trailer",
      "low_loader",
      "dolly",
      "generator_trailer",
      "fuel_trailer",
      "water_trailer",
    ].includes(type)
  ) {
    return "trailer";
  }

  if (
    [
      "telehandler",
      "mobile_crane",
      "pick_and_carry_crane",
      "crawler_crane",
      "forklift",
      "ewp",
    ].includes(type)
  ) {
    return "plant";
  }

  if (sourceTable.includes("equipment")) {
    return "equipment";
  }

  if (sourceTable.includes("plant")) {
    return "plant";
  }

  return "vehicle";
}

function maskIdentifier(value: string): string {
  const cleaned = value.replace(/\s+/g, "");

  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= 4) {
    return cleaned;
  }

  return `Ending ${cleaned.slice(-4)}`;
}

function mapAssetRow(
  row: Record<string, unknown>,
  sourceTable: string,
): AssetRecord | null {
  const id = firstValue(row, ["id"]);

  if (!id) {
    return null;
  }

  const explicitType = firstValue(row, [
    "asset_type",
    "vehicle_type",
    "plant_type",
    "category",
    "type",
    "subtype",
  ]);

  const assetType = normaliseAssetType(explicitType || sourceTable);
  const assetGroup = inferAssetGroup(sourceTable, assetType);

  const assetNumber = firstValue(row, [
    "asset_number",
    "asset_id",
    "vehicle_id",
    "plant_id",
    "equipment_id",
    "fleet_number",
    "unit_number",
    "code",
  ]);

  const registration = firstValue(row, [
    "registration",
    "rego",
    "registration_number",
    "rego_number",
  ]);

  const make = firstValue(row, ["make", "manufacturer", "brand"]);
  const model = firstValue(row, ["model", "model_name"]);
  const year = firstValue(row, ["year", "manufacture_year"]);
  const status = firstValue(row, ["status", "asset_status"]);
  const ownerName =
    firstValue(row, ["owner_name", "owner", "company"]) ||
    "BC Contracting";

  const projectName = firstValue(row, [
    "project_name",
    "allocated_project_name",
    "project",
  ]);

  const crewName = firstValue(row, [
    "crew_name",
    "allocated_crew_name",
    "crew",
  ]);

  const state = firstValue(row, [
    "state",
    "jurisdiction",
    "registration_state",
  ]);

  const odometer = firstNumberString(row, [
    "odometer",
    "current_odometer",
    "kilometres",
    "kilometers",
    "current_km",
    "km",
  ]);

  const hours = firstNumberString(row, [
    "hours",
    "current_hours",
    "engine_hours",
    "upper_cab_hours",
  ]);

  const imageUrl = firstValue(row, [
    "image_url",
    "photo_url",
    "picture_url",
    "primary_image_url",
  ]);

  const fullIdentifier = firstValue(row, [
    "vin",
    "vin_number",
    "chassis_number",
    "serial_number",
    "engine_number",
  ]);

  const composedName = [make, model].filter(Boolean).join(" ");

  return {
    id,
    sourceTable,
    assetGroup,
    assetType,
    assetNumber: assetNumber || registration || id.slice(0, 8),
    displayName:
      firstValue(row, ["display_name", "name", "description"]) ||
      composedName ||
      prettify(assetType),
    registration,
    make,
    model,
    year,
    odometer,
    hours,
    projectName,
    crewName,
    status,
    ownerName,
    state,
    imageUrl,
    maskedIdentifier: maskIdentifier(fullIdentifier),
    raw: row,
  };
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

function todayIso(): string {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000,
  );

  return local.toISOString().slice(0, 10);
}

function buildSafeSnapshot(asset: AssetRecord): Record<string, unknown> {
  return {
    assetNumber: asset.assetNumber,
    registration: asset.registration || null,
    make: asset.make || null,
    model: asset.model || null,
    year: asset.year || null,
    type: asset.assetType,
    assetGroup: asset.assetGroup,
    displayName: asset.displayName,
    odometer: asset.odometer ? Number(asset.odometer) : null,
    hours: asset.hours ? Number(asset.hours) : null,
    projectName: asset.projectName || null,
    crewName: asset.crewName || null,
    status: asset.status || null,
    ownerName: asset.ownerName || "BC Contracting",
    state: asset.state || null,
    identifierMasked: asset.maskedIdentifier || null,
    imageUrl: asset.imageUrl || null,
    capturedAt: new Date().toISOString(),
  };
}

export default function NewRiskAssessmentPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [step, setStep] = useState<StepNumber>(1);

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [templates, setTemplates] = useState<RiskTemplate[]>([]);
  const [assessors, setAssessors] = useState<AssessorOption[]>([]);
  const [previousAssessments, setPreviousAssessments] = useState<
    ExistingAssessment[]
  >([]);

  const [selectedAssetKey, setSelectedAssetKey] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedAssessorId, setSelectedAssessorId] = useState("");
  const [assessorName, setAssessorName] = useState("");

  const [assessmentDate, setAssessmentDate] = useState(todayIso());
  const [purpose, setPurpose] = useState("Plant in use");
  const [customPurpose, setCustomPurpose] = useState("");
  const [stateOrJurisdiction, setStateOrJurisdiction] = useState("");
  const [ownerName, setOwnerName] = useState("BC Contracting");
  const [copyPrevious, setCopyPrevious] = useState(true);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetGroupFilter, setAssetGroupFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);

  const selectedAsset = useMemo(() => {
    return (
      assets.find(
        (asset) =>
          `${asset.sourceTable}:${asset.id}` === selectedAssetKey,
      ) ?? null
    );
  }, [assets, selectedAssetKey]);

  const selectedTemplate = useMemo(() => {
    return (
      templates.find(
        (template) => template.id === selectedTemplateId,
      ) ?? null
    );
  }, [templates, selectedTemplateId]);

  const matchingTemplates = useMemo(() => {
    if (!selectedAsset) {
      return [];
    }

    const exactMatches = templates.filter((template) => {
      const templateTypes = template.asset_types ?? [];

      return (
        template.status === "published" &&
        template.asset_group === selectedAsset.assetGroup &&
        templateTypes.includes(selectedAsset.assetType)
      );
    });

    if (exactMatches.length > 0) {
      return exactMatches;
    }

    return templates.filter(
      (template) =>
        template.status === "published" &&
        template.asset_group === selectedAsset.assetGroup,
    );
  }, [templates, selectedAsset]);

  const latestPreviousAssessment = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }

    return (
      previousAssessments
        .filter(
          (assessment) =>
            assessment.asset_id === selectedAsset.id &&
            assessment.asset_source_table ===
              selectedAsset.sourceTable &&
            assessment.status === "approved",
        )
        .sort(
          (a, b) =>
            new Date(b.assessment_date).getTime() -
            new Date(a.assessment_date).getTime(),
        )[0] ?? null
    );
  }, [previousAssessments, selectedAsset]);

  const assetTypeOptions = useMemo(() => {
    return Array.from(
      new Set(assets.map((asset) => asset.assetType)),
    ).sort();
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();

    return assets.filter((asset) => {
      if (
        assetGroupFilter !== "all" &&
        asset.assetGroup !== assetGroupFilter
      ) {
        return false;
      }

      if (
        assetTypeFilter !== "all" &&
        asset.assetType !== assetTypeFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        asset.assetNumber,
        asset.displayName,
        asset.registration,
        asset.make,
        asset.model,
        asset.assetType,
        asset.projectName,
        asset.crewName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [assets, assetSearch, assetGroupFilter, assetTypeFilter]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setLoadWarnings([]);

    const warnings: string[] = [];

    const [
      templatesResult,
      vehiclesResult,
      plantResult,
      employeesResult,
      assessmentsResult,
      userResult,
    ] = await Promise.all([
      supabase
        .from("asset_risk_templates")
        .select(
          "id,name,code,description,asset_group,asset_types,status,version_number,default_assessment_purpose,default_review_months,allow_prefill_from_previous,allow_prefill_from_asset_register,require_review_before_approval",
        )
        .eq("status", "published")
        .eq("is_active", true)
        .order("name", { ascending: true }),

      supabase.from("vehicle_assets").select("*"),

      supabase.from("plant_assets").select("*"),

      supabase
        .from("employees")
        .select("id,full_name,role,active")
        .eq("active", true)
        .order("full_name", { ascending: true }),

      supabase
        .from("asset_risk_assessment_register")
        .select(
          "id,assessment_number,asset_source_table,asset_id,asset_number,asset_display_name,asset_type,assessment_date,status,overall_result,template_id,template_name",
        )
        .order("assessment_date", { ascending: false }),

      supabase.auth.getUser(),
    ]);

    if (templatesResult.error) {
      setErrorMessage(
        `Failed to load published templates: ${templatesResult.error.message}`,
      );
      setLoading(false);
      return;
    }

    const mappedAssets: AssetRecord[] = [];

    if (vehiclesResult.error) {
      warnings.push(
        `Vehicles could not be loaded: ${vehiclesResult.error.message}`,
      );
    } else {
      for (const row of vehiclesResult.data ?? []) {
        const mapped = mapAssetRow(
          row as Record<string, unknown>,
          "vehicle_assets",
        );

        if (mapped) {
          mappedAssets.push(mapped);
        }
      }
    }

    if (plantResult.error) {
      warnings.push(
        `Plant could not be loaded: ${plantResult.error.message}`,
      );
    } else {
      for (const row of plantResult.data ?? []) {
        const mapped = mapAssetRow(
          row as Record<string, unknown>,
          "plant_assets",
        );

        if (mapped) {
          mappedAssets.push(mapped);
        }
      }
    }

    const uniqueAssets = Array.from(
      new Map(
        mappedAssets.map((asset) => [
          `${asset.sourceTable}:${asset.id}`,
          asset,
        ]),
      ).values(),
    ).sort((a, b) =>
      a.assetNumber.localeCompare(b.assetNumber, undefined, {
        numeric: true,
      }),
    );

    setAssets(uniqueAssets);
    setTemplates(
      (templatesResult.data ?? []) as RiskTemplate[],
    );

    if (employeesResult.error) {
      warnings.push(
        `Employees could not be loaded: ${employeesResult.error.message}`,
      );
    } else {
      setAssessors(
        (employeesResult.data ?? []).map((employee) => ({
          id: clean(employee.id),
          name: clean(employee.full_name),
          role: clean(employee.role),
        })),
      );
    }

    if (assessmentsResult.error) {
      warnings.push(
        `Previous assessments could not be loaded: ${assessmentsResult.error.message}`,
      );
    } else {
      setPreviousAssessments(
        (assessmentsResult.data ?? []) as ExistingAssessment[],
      );
    }

    const currentUser = userResult.data.user;

    if (currentUser) {
      const metadataName =
        clean(currentUser.user_metadata?.full_name) ||
        clean(currentUser.user_metadata?.name) ||
        clean(currentUser.email);

      setAssessorName((current) => current || metadataName);
    }

    setLoadWarnings(warnings);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadPage();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadPage]);

  useEffect(() => {
    if (!selectedAsset) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStateOrJurisdiction(
        (current) => current || selectedAsset.state,
      );
      setOwnerName(
        selectedAsset.ownerName || "BC Contracting",
      );

      const exact = templates.find(
        (template) =>
          template.asset_group === selectedAsset.assetGroup &&
          (template.asset_types ?? []).includes(
            selectedAsset.assetType,
          ),
      );

      const groupFallback = templates.find(
        (template) =>
          template.asset_group === selectedAsset.assetGroup,
      );

      setSelectedTemplateId(
        exact?.id ?? groupFallback?.id ?? "",
      );

      if (exact?.default_assessment_purpose) {
        setPurpose(exact.default_assessment_purpose);
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedAsset, templates]);

  function selectAssessor(value: string) {
    setSelectedAssessorId(value);

    const employee = assessors.find(
      (assessor) => assessor.id === value,
    );

    if (employee) {
      setAssessorName(employee.name);
    }
  }

  function validateStepOne(): boolean {
    if (!selectedAsset) {
      setErrorMessage("Select an asset before continuing.");
      return false;
    }

    setErrorMessage("");
    return true;
  }

  function validateStepTwo(): boolean {
    if (!selectedTemplate) {
      setErrorMessage(
        "Select a published risk assessment template.",
      );
      return false;
    }

    if (
      selectedTemplate.asset_group !== selectedAsset?.assetGroup
    ) {
      setErrorMessage(
        "The selected template does not match the asset group.",
      );
      return false;
    }

    setErrorMessage("");
    return true;
  }

  function goToStep(nextStep: StepNumber) {
    if (nextStep === 2 && !validateStepOne()) {
      return;
    }

    if (nextStep === 3) {
      if (!validateStepOne() || !validateStepTwo()) {
        return;
      }
    }

    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createAssessment(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedAsset || !selectedTemplate) {
      setErrorMessage(
        "Select an asset and published template before creating the assessment.",
      );
      return;
    }

    const finalPurpose =
      purpose === "Other" ? customPurpose.trim() : purpose;

    if (!assessmentDate) {
      setErrorMessage("Select an assessment date.");
      return;
    }

    if (!finalPurpose) {
      setErrorMessage("Enter the assessment purpose.");
      return;
    }

    if (!assessorName.trim()) {
      setErrorMessage("Select or enter the assessor name.");
      return;
    }

    setCreating(true);
    setErrorMessage("");

    const assetSnapshot = buildSafeSnapshot(selectedAsset);

    const { data, error } = await supabase.rpc(
      "create_asset_risk_assessment",
      {
        p_template_id: selectedTemplate.id,
        p_asset_group: selectedAsset.assetGroup,
        p_asset_source_table: selectedAsset.sourceTable,
        p_asset_id: selectedAsset.id,
        p_asset_type: selectedAsset.assetType,
        p_asset_number: selectedAsset.assetNumber,
        p_asset_display_name: selectedAsset.displayName,
        p_assessment_date: assessmentDate,
        p_assessment_purpose: finalPurpose,
        p_state_or_jurisdiction:
          stateOrJurisdiction.trim() || null,
        p_owner_name: ownerName.trim() || "BC Contracting",
        p_assessor_name: assessorName.trim(),
        p_asset_snapshot: assetSnapshot,
        p_supersedes_assessment_id:
          copyPrevious && latestPreviousAssessment
            ? latestPreviousAssessment.id
            : null,
      },
    );

    if (error) {
      console.error(error);
      setCreating(false);
      setErrorMessage(
        `Failed to create risk assessment: ${error.message}`,
      );
      return;
    }

    const assessmentId =
      typeof data === "string"
        ? data
        : clean(
            (data as Record<string, unknown> | null)?.id,
          );

    if (!assessmentId) {
      setCreating(false);
      setErrorMessage(
        "The assessment was created but TTTracker did not receive its ID.",
      );
      return;
    }

    if (
      copyPrevious &&
      latestPreviousAssessment &&
      selectedTemplate.allow_prefill_from_previous
    ) {
      await copyPreviousResponses(
        latestPreviousAssessment.id,
        assessmentId,
      );
    }

    setCreating(false);
    router.push(
      `/assets/risk-assessments/${assessmentId}`,
    );
  }

  async function copyPreviousResponses(
    sourceAssessmentId: string,
    destinationAssessmentId: string,
  ) {
    const [sourceResult, destinationResult] = await Promise.all([
      supabase
        .from("asset_risk_assessment_responses")
        .select(
          "library_item_id,response,comment,assessor_observation,recommended_action,verification_method,function_test_completed,document_verified,preliminary_likelihood,preliminary_consequence,residual_likelihood,residual_consequence,treatment_due_date,responsible_person_name,stop_use",
        )
        .eq("assessment_id", sourceAssessmentId),

      supabase
        .from("asset_risk_assessment_responses")
        .select("id,library_item_id")
        .eq("assessment_id", destinationAssessmentId),
    ]);

    if (sourceResult.error || destinationResult.error) {
      return;
    }

    const sourceByLibraryId = new Map(
      (sourceResult.data ?? [])
        .filter((row) => row.library_item_id)
        .map((row) => [
          clean(row.library_item_id),
          row,
        ]),
    );

    const sourceAssessmentDate =
      latestPreviousAssessment?.assessment_date ?? null;

    const updates = (destinationResult.data ?? [])
      .map((destination) => {
        const libraryId = clean(destination.library_item_id);
        const source = sourceByLibraryId.get(libraryId);

        if (!source) {
          return null;
        }

        return supabase
          .from("asset_risk_assessment_responses")
          .update({
            response: source.response,
            comment: source.comment,
            assessor_observation:
              source.assessor_observation,
            recommended_action: source.recommended_action,
            verification_method:
              source.verification_method,
            function_test_completed:
              source.function_test_completed,
            document_verified: source.document_verified,
            preliminary_likelihood:
              source.preliminary_likelihood,
            preliminary_consequence:
              source.preliminary_consequence,
            residual_likelihood:
              source.residual_likelihood,
            residual_consequence:
              source.residual_consequence,
            treatment_due_date:
              source.treatment_due_date,
            responsible_person_name:
              source.responsible_person_name,
            stop_use: source.stop_use,
            was_prefilled: true,
            prefill_source: "previous_assessment",
            prefill_source_date: sourceAssessmentDate,
          })
          .eq("id", destination.id);
      })
      .filter(Boolean);

    await Promise.all(updates);
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
              Loading assets and templates...
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Risk Assessments"
        title="New Risk Assessment"
        description="Select an existing TTTracker asset, confirm the matching template and create a prefilled assessment checklist."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/risk-assessments"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Assessment Register
            </Link>

            <button
              type="button"
              onClick={() => void loadPage()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        }
      />

      <div className="space-y-6 px-4 pb-12 sm:px-6 lg:px-8">
        <StepIndicator currentStep={step} />

        {loadWarnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0 text-amber-700"
              />
              <div>
                <p className="text-sm font-black text-amber-900">
                  Some supporting information could not be loaded
                </p>
                <div className="mt-2 space-y-1">
                  {loadWarnings.map((warning) => (
                    <p
                      key={warning}
                      className="text-xs leading-5 text-amber-800"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            <AlertTriangle
              className="mt-0.5 shrink-0"
              size={18}
            />
            <span>{errorMessage}</span>
          </div>
        )}

        {step === 1 && (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-slate-900 p-3 text-white">
                  <Truck size={21} />
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-950">
                    Select an asset
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Vehicle and plant details are pulled from the existing
                    TTTracker asset register.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_220px]">
                <label className="relative block">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    value={assetSearch}
                    onChange={(event) =>
                      setAssetSearch(event.target.value)
                    }
                    placeholder="Search asset number, registration, make, model, project or crew..."
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <select
                  value={assetGroupFilter}
                  onChange={(event) =>
                    setAssetGroupFilter(event.target.value)
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="all">All asset groups</option>
                  <option value="vehicle">Vehicles</option>
                  <option value="plant">Plant</option>
                  <option value="trailer">Trailers</option>
                  <option value="equipment">Equipment</option>
                </select>

                <select
                  value={assetTypeFilter}
                  onChange={(event) =>
                    setAssetTypeFilter(event.target.value)
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="all">All asset types</option>
                  {assetTypeOptions.map((assetType) => (
                    <option key={assetType} value={assetType}>
                      {prettify(assetType)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="p-10 text-center">
                <Truck
                  size={34}
                  className="mx-auto text-slate-400"
                />
                <h3 className="mt-4 text-lg font-black text-slate-900">
                  No matching assets
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Check the search and filters, or confirm that the asset
                  exists in Vehicles or Plant.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
                {filteredAssets.map((asset) => {
                  const key = `${asset.sourceTable}:${asset.id}`;
                  const selected = selectedAssetKey === key;

                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => {
                        setSelectedAssetKey(key);
                        setErrorMessage("");
                      }}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                          : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-lg font-black">
                              {asset.assetNumber}
                            </span>

                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                                selected
                                  ? "bg-white/15 text-white"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {prettify(asset.assetGroup)}
                            </span>
                          </div>

                          <p
                            className={`mt-1 text-sm font-bold ${
                              selected
                                ? "text-slate-100"
                                : "text-slate-800"
                            }`}
                          >
                            {asset.displayName}
                          </p>

                          <p
                            className={`mt-1 text-xs ${
                              selected
                                ? "text-slate-300"
                                : "text-slate-500"
                            }`}
                          >
                            {prettify(asset.assetType)}
                            {asset.registration
                              ? ` · ${asset.registration}`
                              : ""}
                          </p>
                        </div>

                        {selected && (
                          <CheckCircle2
                            size={20}
                            className="shrink-0 text-emerald-300"
                          />
                        )}
                      </div>

                      <div
                        className={`mt-4 grid grid-cols-2 gap-2 text-xs ${
                          selected
                            ? "text-slate-300"
                            : "text-slate-500"
                        }`}
                      >
                        <span>{asset.projectName || "No project"}</span>
                        <span className="text-right">
                          {asset.crewName || "No crew"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end border-t border-slate-200 p-5 sm:p-6">
              <button
                type="button"
                onClick={() => goToStep(2)}
                disabled={!selectedAsset}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            </div>
          </section>
        )}

        {step === 2 && selectedAsset && (
          <section className="space-y-6">
            <AssetSummary asset={selectedAsset} />

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-600 p-3 text-white">
                    <FileText size={21} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-slate-950">
                      Confirm the template
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      TTTracker has matched templates using the asset type{" "}
                      <strong>{prettify(selectedAsset.assetType)}</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {matchingTemplates.length === 0 ? (
                <div className="p-8">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                    <h3 className="font-black text-amber-900">
                      No published template matches this asset
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      Open the template builder and ensure a published
                      template includes the asset type{" "}
                      <strong>{selectedAsset.assetType}</strong>.
                    </p>

                    <Link
                      href="/assets/risk-assessments/templates"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                    >
                      Open Templates
                      <ChevronRight size={15} />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
                  {matchingTemplates.map((template) => {
                    const selected =
                      selectedTemplateId === template.id;
                    const exactMatch = (
                      template.asset_types ?? []
                    ).includes(selectedAsset.assetType);

                    return (
                      <button
                        type="button"
                        key={template.id}
                        onClick={() =>
                          setSelectedTemplateId(template.id)
                        }
                        className={`rounded-2xl border p-5 text-left transition ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-lg"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-black">
                                {template.name}
                              </h3>

                              {exactMatch && (
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                                    selected
                                      ? "bg-white/15 text-white"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  Exact match
                                </span>
                              )}
                            </div>

                            <p
                              className={`mt-1 text-xs font-bold ${
                                selected
                                  ? "text-blue-100"
                                  : "text-slate-500"
                              }`}
                            >
                              {template.code} · Version{" "}
                              {template.version_number}
                            </p>

                            {template.description && (
                              <p
                                className={`mt-3 text-sm leading-6 ${
                                  selected
                                    ? "text-blue-100"
                                    : "text-slate-600"
                                }`}
                              >
                                {template.description}
                              </p>
                            )}
                          </div>

                          {selected && (
                            <CheckCircle2
                              size={20}
                              className="shrink-0"
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {latestPreviousAssessment && (
                <div className="border-t border-slate-200 p-5 sm:p-6">
                  <button
                    type="button"
                    onClick={() =>
                      setCopyPrevious((current) => !current)
                    }
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      copyPrevious
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ${
                          copyPrevious
                            ? "bg-emerald-500"
                            : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow transition ${
                            copyPrevious ? "translate-x-4" : ""
                          }`}
                        />
                      </span>

                      <div>
                        <p className="text-sm font-black text-slate-900">
                          Start from the previous approved assessment
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          Copy responses from{" "}
                          {latestPreviousAssessment.assessment_number},
                          completed{" "}
                          {formatDate(
                            latestPreviousAssessment.assessment_date,
                          )}. Every prefilled response must still be
                          reviewed and confirmed.
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              )}

              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 p-5 sm:p-6">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  disabled={!selectedTemplate}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  Continue
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && selectedAsset && selectedTemplate && (
          <form onSubmit={createAssessment} className="space-y-6">
            <AssetSummary asset={selectedAsset} />

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-emerald-600 p-3 text-white">
                    <ClipboardCheck size={21} />
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-slate-950">
                      Assessment details
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Confirm the report details before TTTracker creates
                      the checklist.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-7 p-5 sm:p-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Assessment date" required>
                    <input
                      type="date"
                      value={assessmentDate}
                      onChange={(event) =>
                        setAssessmentDate(event.target.value)
                      }
                      required
                      className="field-input"
                    />
                  </Field>

                  <Field label="Assessment purpose" required>
                    <select
                      value={purpose}
                      onChange={(event) =>
                        setPurpose(event.target.value)
                      }
                      className="field-input"
                    >
                      {PURPOSE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {purpose === "Other" && (
                    <div className="lg:col-span-2">
                      <Field label="Other assessment purpose" required>
                        <input
                          value={customPurpose}
                          onChange={(event) =>
                            setCustomPurpose(event.target.value)
                          }
                          className="field-input"
                          placeholder="Describe why the assessment is being completed"
                        />
                      </Field>
                    </div>
                  )}

                  <Field label="Select assessor">
                    <select
                      value={selectedAssessorId}
                      onChange={(event) =>
                        selectAssessor(event.target.value)
                      }
                      className="field-input"
                    >
                      <option value="">
                        Use current user or enter manually
                      </option>

                      {assessors.map((assessor) => (
                        <option
                          key={assessor.id}
                          value={assessor.id}
                        >
                          {assessor.name}
                          {assessor.role
                            ? ` — ${assessor.role}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Assessor name" required>
                    <input
                      value={assessorName}
                      onChange={(event) =>
                        setAssessorName(event.target.value)
                      }
                      required
                      className="field-input"
                    />
                  </Field>

                  <Field label="Owner">
                    <input
                      value={ownerName}
                      onChange={(event) =>
                        setOwnerName(event.target.value)
                      }
                      className="field-input"
                    />
                  </Field>

                  <Field label="State or jurisdiction">
                    <input
                      value={stateOrJurisdiction}
                      onChange={(event) =>
                        setStateOrJurisdiction(
                          event.target.value,
                        )
                      }
                      placeholder="NSW"
                      className="field-input"
                    />
                  </Field>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <div className="flex items-start gap-3">
                    <Sparkles
                      size={20}
                      className="mt-0.5 shrink-0 text-blue-700"
                    />

                    <div>
                      <h3 className="font-black text-blue-950">
                        What TTTracker will prefill
                      </h3>

                      <div className="mt-3 grid gap-2 text-sm text-blue-900 sm:grid-cols-2">
                        <PrefillLine
                          enabled={
                            selectedTemplate.allow_prefill_from_asset_register
                          }
                          text="Asset register details"
                        />
                        <PrefillLine
                          enabled={
                            copyPrevious &&
                            Boolean(latestPreviousAssessment) &&
                            selectedTemplate.allow_prefill_from_previous
                          }
                          text="Previous approved responses"
                        />
                        <PrefillLine
                          enabled
                          text="Template questions and treatments"
                        />
                        <PrefillLine
                          enabled
                          text="Initial and residual risk ratings"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="font-black text-slate-900">
                    Creation summary
                  </h3>

                  <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryDetail
                      icon={<Truck size={16} />}
                      label="Asset"
                      value={selectedAsset.assetNumber}
                    />
                    <SummaryDetail
                      icon={<FileText size={16} />}
                      label="Template"
                      value={`${selectedTemplate.name} V${selectedTemplate.version_number}`}
                    />
                    <SummaryDetail
                      icon={<CalendarDays size={16} />}
                      label="Review period"
                      value={`${selectedTemplate.default_review_months} months`}
                    />
                    <SummaryDetail
                      icon={<ShieldCheck size={16} />}
                      label="Approval"
                      value={
                        selectedTemplate.require_review_before_approval
                          ? "Manager review required"
                          : "Assessor finalisation"
                      }
                    />
                  </dl>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 p-5 sm:p-6">
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  disabled={creating}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Back
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                      Creating Assessment...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck size={16} />
                      Create and Start Assessment
                    </>
                  )}
                </button>
              </div>
            </section>
          </form>
        )}
      </div>

      <style jsx global>{`
        .field-input {
          margin-top: 0.5rem;
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
        }

        .field-input:focus {
          border-color: rgb(100 116 139);
          box-shadow: 0 0 0 2px rgb(226 232 240);
        }
      `}</style>
    </PageShell>
  );
}

function StepIndicator({
  currentStep,
}: {
  currentStep: StepNumber;
}) {
  const steps = [
    { number: 1 as StepNumber, label: "Select Asset" },
    { number: 2 as StepNumber, label: "Confirm Template" },
    { number: 3 as StepNumber, label: "Create Assessment" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step) => {
          const complete = currentStep > step.number;
          const active = currentStep === step.number;

          return (
            <div key={step.number} className="text-center">
              <div
                className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                  complete
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {complete ? (
                  <CheckCircle2 size={18} />
                ) : (
                  step.number
                )}
              </div>

              <p
                className={`mt-2 text-xs font-black ${
                  active
                    ? "text-slate-900"
                    : "text-slate-500"
                }`}
              >
                {step.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssetSummary({ asset }: { asset: AssetRecord }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-slate-900 p-3 text-white">
            <Truck size={22} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-slate-950">
                {asset.assetNumber}
              </h2>

              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                {prettify(asset.assetType)}
              </span>
            </div>

            <p className="mt-1 text-sm font-bold text-slate-700">
              {asset.displayName}
            </p>

            {asset.registration && (
              <p className="mt-1 text-sm text-slate-500">
                Registration: {asset.registration}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AssetDetail
            icon={<Building2 size={16} />}
            label="Project"
            value={asset.projectName || "Not allocated"}
          />

          <AssetDetail
            icon={<UserRound size={16} />}
            label="Crew"
            value={asset.crewName || "Not allocated"}
          />

          <AssetDetail
            icon={<Gauge size={16} />}
            label={asset.hours ? "Hours" : "Odometer"}
            value={
              asset.hours
                ? `${Number(asset.hours).toLocaleString("en-AU")} h`
                : asset.odometer
                  ? `${Number(asset.odometer).toLocaleString("en-AU")} km`
                  : "Not recorded"
            }
          />

          <AssetDetail
            icon={<MapPin size={16} />}
            label="State"
            value={asset.state || "Not recorded"}
          />
        </div>
      </div>

      {asset.maskedIdentifier && (
        <p className="mt-4 text-xs font-semibold text-slate-400">
          Sensitive identifier: {asset.maskedIdentifier}
        </p>
      )}
    </section>
  );
}

function AssetDetail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-40 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>

      <p className="mt-2 text-sm font-black text-slate-900">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-800">
        {label}
        {required && (
          <span className="ml-1 text-rose-600">*</span>
        )}
      </span>
      {children}
    </label>
  );
}

function PrefillLine({
  enabled,
  text,
}: {
  enabled: boolean;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <CheckCircle2
          size={16}
          className="shrink-0 text-emerald-600"
        />
      ) : (
        <Wrench
          size={16}
          className="shrink-0 text-slate-400"
        />
      )}

      <span className={enabled ? "" : "text-slate-500"}>
        {text}
      </span>
    </div>
  );
}

function SummaryDetail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <dt className="text-[10px] font-black uppercase tracking-[0.14em]">
          {label}
        </dt>
      </div>

      <dd className="mt-2 text-sm font-black text-slate-900">
        {value}
      </dd>
    </div>
  );
}
