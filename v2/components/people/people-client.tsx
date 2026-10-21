"use client";
import { PersonAvatar } from "./person-avatar";
import { PersonPhotoPanel } from "./person-photo-panel";
import { peopleListHref, safePeopleBack } from "@/lib/people/navigation";
import { DocumentPreview } from "@/components/documents/document-preview";
import { DocumentStorageStatus } from "@/components/documents/document-storage-status";
import { PersonXero } from "@/components/integrations/person-xero";
import { TrainingCatalogue } from "./training-catalogue";
import { peopleDisplay } from "@/lib/people/display";
import { peopleDateValue } from "@/lib/people/dates";
import {
  TrainingClassSelection,
} from "./training-editor-content";
import { BackLink, PeopleDateInput } from "./people-ui";
import { Breadcrumbs, ConfigurationLayout, ContextTabs, PageHeading, WorkspaceHeading, WorkspaceTabs } from "@/components/workspace/workspace-navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
import styles from "./people.module.css";
import {
  PeopleOperationsPanel,
  TrainingUpload,
  TrainingHistory,
  PrivateDomains,
  LinkedCaption,
} from "./people-operations";
import { OnboardingPanel } from "./onboarding-admin";
import { PeopleDocumentNaming } from "./people-document-naming";
import { DocumentTemplateBuilder } from "@/components/integrations/document-template-builder";
import { contextTokens } from "@/lib/integrations/resolver";

type Props = {
  organisationId: string;
  organisationName: string;
  permissions: Record<string, boolean>;
  personId?: string;
  section?: string;
  settings?: boolean;
  settingsInWorkspace?: boolean;
  initialListState?: Record<string, string | undefined>;
  backTo?: string;
  from?: string;
};
import {
  Editor,
  PeoplePicker,
  responseData,
  value,
  title,
  labels,
  type Row,
  type Result,
  type Field,
} from "./people-controls";
const personFields: Field[] = [
  { key: "display_name", label: "Name", required: true },
  { key: "employee_number", label: "Employee Number" },
  {
    key: "relationship_type_id",
    label: "Employment / Engagement Type",
    area: "types",
  },
  { key: "employer", label: "Employer" },
  { key: "position", label: "Position" },
  { key: "work_email", label: "Work email", type: "email" },
  { key: "start_date", label: "Start date", type: "date" },
  { key: "end_date", label: "End date", type: "date" },
];
const typeFields: Field[] = [
  { key: "name", label: "Ticket / Training Type", required: true, group: "Basic Details" },
  { key: "code", label: "Code", group: "Basic Details" },
  { key: "category_id", label: "Category", area: "training_categories", required: true, group: "Basic Details" },
  { key: "description", label: "Description", type: "textarea", group: "Basic Details" },
  { key: "allows_multiple_current", label: "Allow multiple current records", type: "checkbox", group: "Superseding" },
  { key: "supersede_scope", label: "When new Training is completed", options: ["type", "type_and_option", "type_option_and_project", "never"], optionLabels: { type: "Replace current record for this Training Type", type_and_option: "Replace current record for the same Option / Class", type_option_and_project: "Replace current record for the same Option / Class and Project", never: "Never replace automatically" }, help: "For a Training Type with multiple Options / Classes, the Training Type rule can affect the whole current set. Use the same Option / Class rule to renew selected classes independently.", group: "Superseding" },
  {
    key: "review_policy",
    label: "Review",
    options: ["inherit", "required", "none", "trusted"],
    optionLabels: {
      inherit: "Organisation default",
      required: "Review required",
      none: "No review required",
      trusted: "Trusted submitters may confirm",
    },
    required: true,
    group: "Review",
  },
  {
    key: "validity_mode",
    label: "Expiry handling",
    options: ["manual", "automatic", "never"],
    optionLabels: { manual: "Enter expiry date manually", automatic: "Expires after a set period", never: "Never expires" },
    required: true,
    group: "Validity",
  },
  {
    key: "validity_months",
    label: "Expires after (months)",
    type: "number",
    required: true,
    visible: (data) => data.validity_mode === "automatic",
    group: "Validity",
  },
  {
    key: "renewal_lead_days",
    label: "Expiry warning (days before expiry)",
    type: "number",
    visible: (data) => data.validity_mode !== "never",
    group: "Validity",
  },
  {
    key: "document_requirement",
    label: "Evidence required",
    options: ["none", "single", "front_back", "single_or_front_back"],
    required: true,
    group: "Evidence",
  },
  {
    key: "requires_issue_date",
    label: "Issue date required",
    type: "checkbox",
    group: "Validity",
  },
  {
    key: "requires_certificate_number",
    label: "Certificate/licence number required",
    type: "checkbox",
    group: "Evidence",
  },
  { key: "matrix_option_display", label: "Options / Classes in Matrix and Register", options: ["separate", "combined"], optionLabels: { separate: "Show separately", combined: "Combine under Training Type" }, group: "Options / Classes" },
  { key: "option_selection_mode", label: "Option selection", options: ["none", "single", "multiple"], optionLabels: { none: "No Options / Classes", single: "Single selection", multiple: "Multiple selection" }, group: "Options / Classes" },
  { key: "option_evidence_mode", label: "Evidence for selected Options", options: ["shared", "separate"], optionLabels: { shared: "One shared certificate for this submission", separate: "Separate evidence per Option / Class" }, visible: (data) => data.option_selection_mode === "multiple", group: "Options / Classes" },
  { key: "is_active", label: "Active", type: "checkbox", group: "Basic Details" },
  { key: "filename_template", label: "Ticket file name override", type: "custom", group: "File Naming" },
];

export default function PeopleClient({
  organisationId,
  permissions: rights,
  personId,
  section: requested,
  settings = false,
  settingsInWorkspace = false,
  initialListState = {},
  backTo,
  from,
}: Props) {
  const allowed = (capability: string) => rights[capability] === true;
  const modules = [
    { key: "overview", label: "Overview", permission: "people.view" },
    { key: "people", label: "Employee Register", permission: "people.view" },
    { key: "crews", label: "Crews", permission: "people.crews.view" },
    { key: "training", label: "Training", permission: "training.view" },

    {
      key: "onboarding",
      label: "Onboarding",
      permission: "people.onboarding.view",
    },
    {
      key: "prestarts",
      label: "Site Prestarts",
      permission: "people.site_prestarts.view",
    },
  ].filter(
    (item) =>
      allowed(item.permission) ||
      (item.key === "training" && (allowed("training.approve") || allowed("training.configure"))),
  );
  const profileSections = [
    { key: "profile", label: "Overview", permission: "people.view" },
    {
      key: "engagement",
      label: "Employment / Engagement",
      permission: "people.view",
    },
    { key: "training", label: "Training", permission: "training.view" },
    { key: "projects", label: "Projects", permission: "people.view" },
    { key: "crews", label: "Crews", permission: "people.crews.view" },
    { key: "documents", label: "Documents", permission: "training.view" },
    {
      key: "prestarts",
      label: "Site Prestarts",
      permission: "people.site_prestarts.view",
    },
    {
      key: "onboarding",
      label: "Onboarding",
      permission: "people.onboarding.view",
    },
    { key: "access", label: "Access", permission: "people.view" },
    { key: "private", label: "Private", permission: "people.private.view" },
    {
      key: "confidential",
      label: "Confidential",
      permission: "people.confidential.view",
    },
  ].filter(
    (item) =>
      allowed(item.permission) ||
      (item.key === "private" &&
        Object.keys(rights).some(
          (k) =>
            k.startsWith("people.private.") && k.endsWith(".view") && rights[k],
        )),
  );
  const settingsSections = [
    { key: "overview", label: "Training Configuration", permission: "training.configure" },
    { key: "file_naming", label: "Training File Naming", permission: "training.configure" },
    {
      key: "types",
      label: "Employment / Engagement Types",
      permission: "people.configure",
    },
    {
      key: "training_types",
      label: "Training configuration",
      permission: "training.configure",
    },
    {
      key: "document_naming",
      label: "Document Naming",
      permission: "integrations.sharepoint.view",
    },
  ].filter((item) => allowed(item.permission));
  const trainingSections = [
    {
      key: "training",
      label: "Training Register",
      permission: "training.view",
    },
    { key: "matrix", label: "Training Matrix", permission: "training.view" },
    {
      key: "review",
      label: "Review / Approvals",
      permission: "training.approve",
    },
    {
      key: "requirements",
      label: "Project Requirements",
      permission: "training.view",
    },
  ].filter((item) => allowed(item.permission));
  const extendedSettings = [
    {
      key: "training_categories",
      label: "Training Categories",
      permission: "training.configure",
    },
    {
      key: "training_options",
      label: "Options / Classes",
      permission: "training.configure",
    },
    {
      key: "templates",
      label: "Onboarding Templates",
      permission: "people.configure",
    },
    {
      key: "document_rules",
      label: "Document Structure",
      permission: "people.configure",
    },
    {
      key: "review_rules",
      label: "Review Rules",
      permission: "training.configure",
    },
  ].filter((item) => allowed(item.permission));
  settingsSections.push(...extendedSettings);
  const nav = settings
    ? settingsSections
    : personId
      ? profileSections
      : modules;
  const section = [
    ...nav,
    ...(!settings && !personId ? trainingSections : []),
  ].some((item) => item.key === requested)
    ? (requested ?? nav[0]?.key)
    : nav[0]?.key;
  const [documentPreview, setDocumentPreview] = useState<{url:string;name:string}|null>(null);
  const [data, setData] = useState<Result>({});
  const [overviewExtras, setOverviewExtras] = useState<{ onboarding?: { inProgress: number; underReview: number; changesRequired: number }; prestarts?: number }>({});
  const [person, setPerson] = useState<Row>({});
  const [query, setQuery] = useState(initialListState.q ?? "");
  const [page, setPage] = useState(
    Math.max(1, Number(initialListState.page) || 1),
  );
  const [status, setStatus] = useState(initialListState.status ?? "");
  const [fromDate, setFromDate] = useState(initialListState.from_date ?? "");
  const [toDate, setToDate] = useState(initialListState.to_date ?? "");
  const [prestartPerson, setPrestartPerson] = useState(
    initialListState.person ?? "",
  );
  const [date, setDate] = useState(initialListState.date ?? "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(
    !!(
      initialListState.status ||
      initialListState.crew_id ||
      initialListState.relationship_type_id ||
      initialListState.project_id ||
      initialListState.training_type_id ||
      initialListState.category_id ||
      initialListState.option_id ||
      initialListState.review_status ||
      initialListState.source_channel
    ),
  );
  const [editor, setEditor] = useState<{
    heading: string;
    action: string;
    id?: string;
    fields: Field[];
    initial?: Row;
  } | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [crewEvents, setCrewEvents] = useState<Row[]>([]);
  const [detailRows, setDetailRows] = useState<Row[]>([]);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [crewTab, setCrewTab] = useState("overview");
  const [relatedProjects, setRelatedProjects] = useState<Row[]>([]);
  const [prestartDetails, setPrestartDetails] = useState<Row>({});
  const [comment, setComment] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trainingAdd, setTrainingAdd] = useState(false);
  const [trainingDraft, setTrainingDraft] = useState<Row | null>(null);
  const [trainingDrafts, setTrainingDrafts] = useState<Row[]>([]);
  const [projectFilter, setProjectFilter] = useState(
    initialListState.project_id ?? "",
  );
  const [crewFilter, setCrewFilter] = useState(initialListState.crew_id ?? "");
  const [typeFilter, setTypeFilter] = useState(
    initialListState.training_type_id ?? "",
  );
  const [relationshipFilter, setRelationshipFilter] = useState(
    initialListState.relationship_type_id ?? "",
  );
  const [reviewFilter, setReviewFilter] = useState(
    initialListState.review_status ?? "",
  );
  const [sourceFilter, setSourceFilter] = useState(
    initialListState.source_channel ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState(
    initialListState.category_id ?? "",
  );
  const [optionFilter, setOptionFilter] = useState(
    initialListState.option_id ?? "",
  );
  const registerState = {
    q: query,
    page: String(page),
    status,
    date,
    from_date: fromDate,
    to_date: toDate,
    person: prestartPerson,
    project_id: projectFilter,
    crew_id: crewFilter,
    training_type_id: typeFilter,
    relationship_type_id: relationshipFilter,
    review_status: reviewFilter,
    source_channel: sourceFilter,
    category_id: categoryFilter,
    option_id: optionFilter,
  };
  const listHref = peopleListHref(
    organisationId,
    section ?? "people",
    registerState,
  );
  useEffect(() => {
    if (
      !settings &&
      !personId &&
      typeof window !== "undefined" &&
      window.history?.replaceState
    )
      window.history.replaceState(window.history.state, "", listHref);
  }, [listHref, settings, personId]);
  const trainingConfiguration =
    settings &&
    (["overview", "training_types", "training_categories", "training_options", "document_rules", "file_naming"].includes(
      section ?? "",
    ) ||
      from === "training");
  const trainingContext = !personId && (trainingConfiguration || (!settings && trainingSections.some((item) => item.key === section)));
  const href = (key: string) =>
    `/workspace/people${trainingConfiguration ? "/training/configuration" : settings ? "/settings" : personId ? `/${personId}` : ""}?organisation=${encodeURIComponent(organisationId)}&section=${key}${personId && backTo ? `&backTo=${encodeURIComponent(safePeopleBack(backTo, organisationId))}` : ""}${settings && from === "training" ? "&from=training" : ""}`;
  const area =
    section === "engagement" || section === "access" ? "profile" : section;
  const load = useCallback(async () => {
    if (
      !area ||
      [
        "onboarding",
        "templates",
        "matrix",
        "requirements",
        "document_rules",
        "file_naming",
        "review_rules",
        "training_categories",
        "training_options",
        "confidential",
        "private",
      ].includes(area)
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        organisation: organisationId,
        area,
        q: query,
        page: String(page),
        status,
        date,
        from_date: fromDate,
        to_date: toDate,
        project_id: projectFilter,
        crew_id: crewFilter,
        training_type_id: typeFilter,
        relationship_type_id: relationshipFilter,
        review_status: reviewFilter,
        source_channel: sourceFilter,
        category_id: categoryFilter,
        option_id: optionFilter,
      });
      if (personId || (area === "prestarts" && prestartPerson))
        params.set("person", personId ?? prestartPerson);
      const endpoint =
        area === "private" || area === "confidential"
          ? "/api/people/classified"
          : "/api/people";
      const result = await responseData(
        await fetch(`${endpoint}?${params}`, { cache: "no-store" }),
      );
      setData(result);
      if (area === "overview") {
        const onboarding = rights["people.onboarding.view"] || rights["people.onboarding.manage"]
          ? await Promise.all(["in_progress", "under_review", "changes_required"].map((workflowStatus) => fetch(`/api/people/onboarding?organisation=${organisationId}&action=list&status=${workflowStatus}`, { cache: "no-store" }).then(responseData).then((value) => Number(value.total) || 0).catch(() => undefined)))
          : undefined;
        const [prestarts] = await Promise.all([
          rights["people.site_prestarts.view"]
            ? fetch(`/api/people?organisation=${organisationId}&area=prestarts&page=1`, { cache: "no-store" }).then(responseData).then((value) => Number(value.total) || 0).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);
        setOverviewExtras({ onboarding: onboarding?.every((count) => count !== undefined) ? { inProgress: onboarding[0] ?? 0, underReview: onboarding[1] ?? 0, changesRequired: onboarding[2] ?? 0 } : undefined, prestarts });
      }
      if (area === "training" && (rights["training.create"] || rights["training.edit"])) {
        try {
          const drafts = await responseData(await fetch(`/api/people?organisation=${organisationId}&area=training_drafts`, { cache: "no-store" }));
          setTrainingDrafts(drafts.rows ?? []);
        } catch {
          setTrainingDrafts([]);
        }
      } else setTrainingDrafts([]);
      if (personId && (area === "profile" || rights["people.view"] === true)) {
        const profile = await responseData(
          await fetch(
            `/api/people?organisation=${organisationId}&area=profile&person=${personId}`,
          ),
        );
        setPerson(profile.rows?.[0] ?? {});
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load People.",
      );
    } finally {
      setLoading(false);
    }
    // rights are server-rendered and immutable for this mounted organisation context.
  }, [
    area,
    organisationId,
    personId,
    query,
    page,
    status,
    date,
    fromDate,
    toDate,
    projectFilter,
    crewFilter,
    typeFilter,
    relationshipFilter,
    reviewFilter,
    sourceFilter,
    categoryFilter,
    optionFilter,
    prestartPerson,
    rights,
  ]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!trainingAdd) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTrainingAdd(false);
        setTrainingDraft(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [trainingAdd]);
  async function mutate(
    action: string,
    input: Row,
    id?: string,
  ): Promise<Result> {
    const result = await responseData(
      await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisation: organisationId,
          action,
          id,
          data: input,
        }),
      }),
    );
    if (result.warning) {
      if (
        !window.confirm(
          labels[String(result.warning)] + " Create a separate person anyway?",
        )
      )
        throw new Error("Check the existing person before continuing.");
      return mutate(action, { ...input, confirm_duplicate: true }, id);
    }
    setNotice(
      action === "training_type"
        ? id
          ? "Training Type updated."
          : "Training Type created."
        : "Saved.",
    );
    setEditor(null);
    await load();
    if (detail && (section === "crews" || section === "prestarts"))
      await openDetail(detail, detailPage);
    return result;
  }
  async function perform(action: string, input: Row, id?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await mutate(action, input, id);
      if (action === "review_training") setDetail(null);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openDetail(row: Row, nextPage = 1) {
    setDetail(row);
    setHistoryOpen(false);
    setComment("");
    setDetailRows([]);
    setDetailPage(nextPage);
    const params = new URLSearchParams({
      organisation: organisationId,
      page: String(nextPage),
    });
    if (section === "crews") {
      params.set(
        "area",
        crewTab === "history"
          ? "crew_history"
          : crewTab === "projects"
            ? "crew_projects"
            : "crew_members",
      );
      params.set("crew_id", value(row, "id"));
    } else if (section === "prestarts") {
      params.set("area", "prestart_attendees");
      params.set("id", value(row, "id"));
    } else {
      params.set("area", "documents");
      params.set("person", value(row, "person_id"));
      params.set("evidence_group_id", value(row, "evidence_group_id"));
    }
    try {
      const result = await responseData(await fetch(`/api/people?${params}`));
      setDetailRows(result.rows ?? []);
      setCrewEvents((result.events ?? []) as Row[]);
      setDetailTotal(
        Math.max(Number(result.total ?? 0), Number(result.events_total ?? 0)),
      );
      if (section === "crews") {
        const projects = await responseData(
          await fetch(
            `/api/people?organisation=${organisationId}&area=crew_projects&crew_id=${value(row, "id")}`,
          ),
        );
        setRelatedProjects(projects.rows ?? []);
      }
      if (section === "prestarts") {
        const prestart = await responseData(
          await fetch(
            `/api/people?organisation=${organisationId}&area=prestart_detail&id=${value(row, "id")}`,
          ),
        );
        setPrestartDetails(prestart.rows?.[0] ?? {});
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to open record.",
      );
    }
  }
  const isTraining = section === "training" || section === "review";
  const canAdd =
    section === "people"
      ? allowed("people.create")
      : section === "crews"
        ? allowed("people.crews.manage")
        : section === "training"
          ? allowed("training.create")
          : section === "prestarts"
            ? allowed("people.site_prestarts.manage")
            : section === "training_types"
              ? allowed("training.configure")
            : settings;
  function add() {
    if (section === "people")
      setEditor({
        heading: "Add Person — no account required",
        action: "create_person",
        fields: [
          ...personFields,
          ...(allowed("organisation.users.configure")
            ? [
                {
                  key: "user_id",
                  label: "Link existing TTTracker user (optional)",
                  area: "users",
                },
              ]
            : []),
        ],
      });
    if (section === "crews")
      setEditor({
        heading: "New crew",
        action: "crew",
        fields: [
          { key: "name", label: "Crew name", required: true },
          { key: "leader_person_id", label: "Crew leader", area: "people" },
        ],
      });
    if (section === "training") {
      setTrainingDraft(null);
      setTrainingAdd(true);
      return;
    }
    if (section === "prestarts")
      setEditor({
        heading: "New Site Prestart",
        action: "prestart",
        fields: [
          {
            key: "project_id",
            label: "Project",
            area: "projects",
            required: true,
          },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "location", label: "Site / location", required: true },
          { key: "discussion", label: "Discussion", type: "textarea" },
        ],
        initial: { date: new Date().toLocaleDateString("en-CA") },
      });
    if (section === "types")
      setEditor({
        heading: "New Employment / Engagement Type",
        action: "type",
        fields: [
          { key: "name", label: "Name", required: true },
          { key: "description", label: "Description", type: "textarea" },
          {
            key: "default_template_id",
            label: "Default onboarding template",
            area: "onboarding_template_choices",
          },
        ],
      });
    if (section === "training_types")
      setEditor({
        heading: "New Training Type",
        action: "training_type",
        fields: typeFields,
        initial: {
          review_policy: "required",
          allows_multiple_current: false,
          supersede_scope: "type",
          matrix_option_display: "separate",
          option_selection_mode: "none",
          option_evidence_mode: "shared",
          option_definitions: [],
          validity_mode: "manual",
          renewal_lead_days: 30,
          requires_issue_date: true,
          document_requirement: "single",
          is_active: true,
        },
      });
  }
  const rows = data.rows ?? [];
  const evidenceSides = new Set(detailRows.map((row) => value(row, "side")));
  const requirement = value(detail ?? {}, "document_requirement");
  const missingRequiredEvidence = requirement === "single"
    ? !evidenceSides.has("single")
    : requirement === "front_back"
      ? !(evidenceSides.has("front") && evidenceSides.has("back"))
      : requirement === "single_or_front_back"
        ? !(evidenceSides.has("single") || (evidenceSides.has("front") && evidenceSides.has("back")))
        : false;
  const columns: [string, string][] =
    section === "people"
      ? [
          ["display_name", "Name"],
          ["type_name", "Employment / Engagement Type"],
          ["employer", "Employer"],
          ["position", "Position"],
          ["crews", "Crew"],
          ["training_status", "Training"],
          ["current_projects", "Projects"],
          ["account_status", "TTTracker account"],
          ["employment_status", "Status"],
        ]
      : section === "crews"
        ? [
            ["name", "Crew"],
            ["leader", "Leader"],
            ["member_count", "People"],
            ["projects", "Projects"],
            ["status", "Status"],
          ]
        : isTraining
          ? [
              ["display_name", "Person"],
              ["training_type", "Training"],
              ["option_name", "Option / Class"],
              ["certificate_number", "Certificate / licence"],
              ["source_channel", "Source"],
              ["issue_date", "Issued"],
              ["expiry_date", "Expiry"],
              ["validity_status", "Validity"],
              ["review_status", "Review"],
              ["document_count", "Documents"],
            ]
          : section === "prestarts"
            ? [
                ["person_names", "Person(s)"],
                ["prestart_date", "Date"],
                ["project_name", "Project"],
                ["location", "Site"],
                ["attendee_count", "Attendees"],
                ["status", "Status"],
              ]
            : section === "documents"
              ? [
                  ["name", "Document"],
                  ["side", "Evidence"],
                  ["provider", "Storage"],
                  ["created_at", "Uploaded"],
                ]
              : section === "training_types"
                ? [
                    ["name", "Ticket / Training Type"],
                    ["category", "Category"],
                    ["validity_summary", "Validity"],
                    ["evidence_summary", "Evidence"],
                    ["review_summary", "Review"],
                    ["replacement_summary", "Superseding"],
                    ["matrix_option_display", "Matrix display"],
                    ["filename_summary", "File Name"],
                    ["is_active", "Status"],
                  ]
                : section === "projects"
                  ? [
                      ["name", "Project"],
                      ["code", "Identifier"],
                      ["status", "Status"],
                    ]
                  : [
                      ["name", "Name"],
                      ["is_active", "Active"],
                    ];
  async function openDocument(id: string) {
    try {
      const result = await responseData(
        await fetch(
          `/api/people/documents?organisation=${organisationId}&id=${id}`,
        ),
      );
      setDocumentPreview({url:String(result.url),name:String(result.name??"Document Preview")});
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to open document.",
      );
    }
  }
  if (!nav.length) return <p>You do not have permission to access People.</p>;
  const peopleHref = (key: string) => peopleListHref(organisationId, key);
  const peopleWorkspaceItems = modules.map((item) => ({
    label: item.label,
    href: item.key === "training" && !allowed("training.view") && allowed("training.configure")
      ? `/workspace/people/training/configuration?organisation=${encodeURIComponent(organisationId)}`
      : peopleHref(item.key),
    active: personId ? item.key === "people" : item.key === "training" ? trainingContext : item.key === section,
  }));
  const personName = value(person, "display_name") || "Person profile";
  const trainingNavItems = [
    ...trainingSections.map((item) => ({
      key: item.key,
      label: item.key === "training" ? "Register" : item.key === "matrix" ? "Matrix" : item.key === "requirements" ? "Requirements" : "Review / Approvals",
      href: peopleHref(item.key),
      active: section === item.key,
    })),
    ...(allowed("training.configure") ? [{ key: "configuration", label: "Configuration", href: `/workspace/people/training/configuration?organisation=${encodeURIComponent(organisationId)}`, active: trainingConfiguration }] : []),
  ];
  const profileNavItems = profileSections.map((item) => ({ label: item.label, href: href(item.key), active: section === item.key }));
  const configNavItems = [
    ["overview", "Overview"], ["training_categories", "Categories"], ["training_options", "Options / Classes"],
    ["training_types", "Tickets / Training Types"], ["document_rules", "Document Rules"], ["file_naming", "File Naming"],
  ].map(([key, label]) => ({ key, label, href: href(key), active: section === key }));
  const pageTitle = settings
    ? trainingConfiguration ? "Training Configuration" : section === "types" ? "Employment / Engagement Types" : section === "templates" ? "Onboarding Templates" : section === "document_rules" ? "People Documents" : section === "review_rules" ? "Review Rules" : "People Settings"
    : personId ? personName : section === "people" ? "Employee Register" : section === "crews" ? "Crews" : section === "training" ? "Training Register" : section === "matrix" ? "Training Matrix" : section === "review" ? "Review / Approvals" : section === "requirements" ? "Project Requirements" : section === "prestarts" ? "Site Prestarts" : section === "onboarding" ? "Onboarding" : "People Overview";
  const pageSubtitle = personId
    ? [value(person, "position"), value(person, "type_name"), title(value(person, "employment_status"))].filter(Boolean).join(" · ")
    : trainingConfiguration ? "Configure Training Types, validity, evidence, review and document naming." : settingsInWorkspace && section === "templates" ? "Create and manage forms sent to new starters and external workers." : settingsInWorkspace && section === "types" ? "Manage the organisation’s employment and engagement options." : settings ? "Configure People, documents, onboarding and Training." : section === "crews" ? "Manage workforce crews and assignments." : section === "training" ? "Manage Training records across the organisation." : section === "matrix" ? "Review workforce competencies and compliance." : section === "review" ? "Review submitted Training evidence." : section === "requirements" ? "Configure and review project Training requirements." : section === "prestarts" ? "Manage workforce site prestart records." : section === "onboarding" ? "Manage onboarding invitations and submissions." : undefined;
  const pageContent = (<>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {trainingConfiguration && section === "overview" ? (
        <TrainingConfigurationOverview organisation={organisationId} />
      ) : trainingConfiguration && section === "file_naming" ? (
        <PeopleDocumentNaming organisation={organisationId} permissions={rights} />
      ) : section === "document_naming" ? (
        <PeopleDocumentNaming organisation={organisationId} permissions={rights} />
      ) : section === "overview" ? (
        <>
          <div className={styles.metrics}>
            {[
              data.active_people != null ? ["people", "Active People", Number(data.active_people)] as const : null,
              data.active_crews != null ? ["crews", "Active Crews", Number(data.active_crews)] as const : null,
              data.pending_review != null ? ["reviews", "Training Reviews", Number(data.pending_review)] as const : null,
              data.training_expiring != null && data.training_expired != null ? ["attention", "Training Attention", Number(data.training_expiring) + Number(data.training_expired)] as const : null,
              overviewExtras.onboarding !== undefined ? ["onboarding", "Onboarding", overviewExtras.onboarding.inProgress + overviewExtras.onboarding.underReview + overviewExtras.onboarding.changesRequired] as const : null,
              overviewExtras.prestarts !== undefined ? ["prestarts", "Site Prestarts", overviewExtras.prestarts] as const : null,
            ].flatMap((metric) => metric ? [metric] : []).map(([key, label, count]) => (
              <div className={styles.metric} key={key}>{label}<strong>{count.toLocaleString()}</strong></div>
            ))}
          </div>
          <div className={styles.overviewGrid}>
          <section className={styles.overviewPanel}>
          <h2>Quick Actions</h2>
          <div className={styles.actions}>
            {allowed("people.create") && (
              <Link className="tt-button-primary" href={href("people")}>
                Add Person
              </Link>
            )}
            {allowed("training.create") && (
              <Link className="tt-button" href={href("training")}>
                Add Training
              </Link>
            )}
            {allowed("people.crews.manage") && (
              <Link className="tt-button" href={href("crews")}>
                Manage Crews
              </Link>
            )}
            {allowed("training.approve") && (
              <Link className="tt-button" href={href("review")}>
                Review Training
              </Link>
            )}
            {allowed("people.site_prestarts.view") && (
              <Link className="tt-button" href={href("prestarts")}>
                View Site Prestarts
              </Link>
            )}
            {allowed("people.onboarding.manage") && (
              <Link className="tt-button" href={href("onboarding")}>
                Start Onboarding
              </Link>
            )}
          </div>
          </section>
          <section className={styles.overviewPanel}>
            <h2>Needs Attention</h2>
            {Number(data.training_expired ?? 0) > 0 && <Link href={href("training")}>{Number(data.training_expired)} Training records expired</Link>}
            {Number(data.training_expiring ?? 0) > 0 && <Link href={href("training")}>{Number(data.training_expiring)} Training records expiring soon</Link>}
            {allowed("training.approve") && Number(data.pending_review ?? 0) > 0 && <Link href={href("review")}>{Number(data.pending_review)} Training records awaiting review</Link>}
            {overviewExtras.onboarding && overviewExtras.onboarding.underReview + overviewExtras.onboarding.changesRequired > 0 && allowed("people.onboarding.view") && <Link href={href("onboarding")}>{overviewExtras.onboarding.underReview + overviewExtras.onboarding.changesRequired} onboarding submissions need review</Link>}
            {Number(data.training_expired ?? 0) === 0 && Number(data.training_expiring ?? 0) === 0 && (!allowed("training.approve") || Number(data.pending_review ?? 0) === 0) && (!overviewExtras.onboarding || overviewExtras.onboarding.underReview + overviewExtras.onboarding.changesRequired === 0) && <p className={styles.muted}>No People items need attention.</p>}
          </section>
          </div>
        </>
      ) : section === "training_categories" ||
        section === "training_options" ? (
        <TrainingCatalogue organisation={organisationId} area={section} />
      ) : section === "onboarding" || section === "templates" ? (
        <OnboardingPanel
          organisation={organisationId}
          personId={personId}
          templates={section === "templates"}
          permissions={rights}
        />
      ) : ["matrix", "requirements", "document_rules", "review_rules"].includes(
          section ?? "",
        ) ? (
        <PeopleOperationsPanel
          organisation={organisationId}
          area={section ?? ""}
          permissions={rights}
        />
      ) : section === "private" ? (
        <PrivateDomains
          organisation={organisationId}
          person={personId ?? ""}
          permissions={rights}
        />
      ) : section === "confidential" ? (
        <p>
          Confidential collection unavailable. Secure key infrastructure must be
          configured and verified before Confidential information can be
          collected.
        </p>
      ) : section === "profile" ||
        section === "engagement" ||
        section === "access" ? (
        <>
          {section === "profile" && personId && rights["people.profile_photo.view"] && <PersonPhotoPanel organisation={organisationId} personId={personId} name={personName} employeeNumber={value(person,"employee_number")} position={value(person,"position")} />}
          <dl className={styles.summary}>
            {(section === "access"
              ? [
                  ["account_status", "TTTracker account"],
                  ["account_name", "Account name"],
                ]
              : section === "engagement"
                ? [
                    ["employment_status", "Status"],
                    ["type_name", "Employment / Engagement Type"],
                    ["employer", "Employer"],
                    ["position", "Position"],
                    ["start_date", "Start date"],
                    ["end_date", "End date"],
                  ]
                : [
                    ["employment_status", "Status"],
                    ["type_name", "Employment / Engagement Type"],
                    ["employer", "Employer"],
                    ["position", "Position"],
                    ["crews", "Crews"],
                    ["training_status", "Training"],
                    ["current_projects", "Projects"],
                    ["start_date", "Start date"],
                    ["end_date", "End date"],
                    ["account_status", "TTTracker account"],
                  ]
            ).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{peopleDateValue(person, key) || "Not recorded"}</dd>
              </div>
            ))}
          </dl>
          {personId && section === "access" && allowed("xero.people.map") && allowed("integrations.xero.view") && <PersonXero organisation={organisationId} person={personId} />}
          <div className={styles.actions}>
            {section !== "access" && allowed("people.edit") && (
              <button
                className="tt-button"
                onClick={() =>
                  setEditor({
                    heading: "Edit operational details",
                    action: "update_person",
                    id: personId,
                    fields: personFields,
                    initial: person,
                  })
                }
              >
                Edit details
              </button>
            )}
            {section !== "access" && allowed("people.archive") && (
              <button
                className="tt-button-danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Archive this person? Training and history will be retained.",
                    )
                  )
                    void perform(
                      "status_person",
                      { status: "archived" },
                      personId,
                    );
                }}
              >
                Archive
              </button>
            )}
            {section !== "access" && allowed("people.archive") && (
              <button
                className="tt-button"
                disabled={busy}
                onClick={() =>
                  void perform(
                    "status_person",
                    {
                      status:
                        value(person, "employment_status") === "active"
                          ? "inactive"
                          : "active",
                    },
                    personId,
                  )
                }
              >
                {value(person, "employment_status") === "active"
                  ? "Set inactive"
                  : "Set active"}
              </button>
            )}
            {section === "access" &&
              allowed("organisation.users.configure") &&
              allowed("people.edit") && (
                <button
                  className="tt-button"
                  onClick={() =>
                    setEditor({
                      heading:
                        "Link an existing organisation user — no role or project access is granted",
                      action: "link_user",
                      id: personId,
                      fields: [
                        {
                          key: "user_id",
                          label: "TTTracker user",
                          area: "users",
                        },
                      ],
                    })
                  }
                >
                  Link / unlink user
                </button>
              )}
            {section === "access" && allowed("organisation.users.view") && (
              <Link
                className="tt-button"
                href={`/workspace/settings?organisation=${organisationId}&section=users`}
              >
                Users & Access
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={`${styles.toolbar} ${section === "training_types" ? styles.trainingTypeToolbar : ""}`}>
            <div style={{ flex: "1 1 280px", maxWidth: 560 }}>
              <MaterialsSearch
                value={query}
                placeholder={
                  section === "people"
                    ? "Search employees..."
                    : `Search ${title(section ?? "people")}...`
                }
                onClear={() => {
                  setQuery("");
                  setPage(1);
                }}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            {(isTraining || section === "people") && (
              <button
                className="tt-button"
                aria-expanded={showFilters}
                onClick={() => setShowFilters(!showFilters)}
              >
                Filters
              </button>
            )}
            {canAdd && (
              <button type="button" className={`tt-button-primary ${section === "training_types" ? styles.configurationAddButton : ""}`} onClick={add}>
                <Plus size={16} />{" "}
                {section === "people"
                  ? "Add Person"
                  : section === "crews"
                    ? "New Crew"
                    : section === "prestarts"
                      ? "New Site Prestart"
                      : section === "training_types"
                        ? "Add Training Type"
                        : section === "types"
                          ? "Add Engagement Type"
                          : "Add Record"}
              </button>
            )}
            {personId && section === "projects" && allowed("people.edit") && (
              <button
                className="tt-button"
                onClick={() =>
                  setEditor({
                    heading:
                      "Assign person to project — does not grant TTTracker access",
                    action: "person_project",
                    fields: [
                      {
                        key: "project_id",
                        label: "Project",
                        area: "projects",
                        required: true,
                      },
                    ],
                    initial: { person_id: personId },
                  })
                }
              >
                Assign project
              </button>
            )}
          </div>
          {showFilters && (isTraining || section === "people") && (
            <label className={styles.field} style={{ maxWidth: 240 }}>
              Status
              <select
                className="tt-input"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {(isTraining
                  ? [
                      "current",
                      "expiring",
                      "expired",
                      "pending_review",
                      "changes_required",
                      "rejected",
                    ]
                  : ["active", "inactive", "archived"]
                ).map((item) => (
                  <option key={item} value={item}>
                    {title(item)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showFilters && (isTraining || section === "people") && (
            <div className={styles.fields}>
              <PeoplePicker
                organisation={organisationId}
                area="types"
                label="Worker type"
                selected={relationshipFilter}
                onChange={(id) => {
                  setRelationshipFilter(id);
                  setPage(1);
                }}
              />
              <PeoplePicker
                organisation={organisationId}
                area="crews"
                label="Crew"
                selected={crewFilter}
                onChange={(id) => {
                  setCrewFilter(id);
                  setPage(1);
                }}
              />
              {isTraining && (
                <>
                  <PeoplePicker
                    organisation={organisationId}
                    area="training_types"
                    label="Training type"
                    selected={typeFilter}
                    onChange={(id) => {
                      setTypeFilter(id);
                      setPage(1);
                    }}
                  />
                  <PeoplePicker
                    organisation={organisationId}
                    area="projects"
                    label="Project"
                    selected={projectFilter}
                    onChange={(id) => {
                      setProjectFilter(id);
                      setPage(1);
                    }}
                  />
                  <label className={styles.field}>
                    Review status
                    <select
                      className="tt-input"
                      value={reviewFilter}
                      onChange={(e) => {
                        setReviewFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All review states</option>
                      {[
                        "pending_review",
                        "approved",
                        "changes_required",
                        "rejected",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {title(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    Source
                    <select
                      className="tt-input"
                      value={sourceFilter}
                      onChange={(e) => {
                        setSourceFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All sources</option>
                      {[
                        "internal",
                        "person_web",
                        "mobile",
                        "external_onboarding",
                        "import",
                        "integration",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {title(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          {showFilters && (section === "training" || section === "review") && (
            <div className={styles.fields}>
              <PeoplePicker
                organisation={organisationId}
                area="training_categories"
                label="Category"
                selected={categoryFilter}
                onChange={(id) => {
                  setCategoryFilter(id);
                  setOptionFilter("");
                  setPage(1);
                }}
              />
              <PeoplePicker
                organisation={organisationId}
                area="training_options"
                label="Option / Class"
                selected={optionFilter}
                filters={categoryFilter ? { category_id: categoryFilter } : {}}
                onChange={(id) => {
                  setOptionFilter(id);
                  setPage(1);
                }}
              />
            </div>
          )}
          {section === "prestarts" && (
            <div className={styles.fields}>
              {!personId && (
                <PeoplePicker
                  organisation={organisationId}
                  area="prestart_people_choices"
                  label="Person"
                  selected={prestartPerson}
                  onChange={(id) => {
                    setPrestartPerson(id);
                    setPage(1);
                  }}
                />
              )}
              <label className={styles.field}>
                Status
                <select
                  className="tt-input"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className={styles.field}>
                Date
                <PeopleDateInput
                  value={date}
                  onChange={(next) => {
                    setDate(next);
                    setPage(1);
                  }}
                />
              </label>
              <label className={styles.field}>
                From
                <PeopleDateInput
                  value={fromDate}
                  onChange={(next) => {
                    setFromDate(next);
                    setPage(1);
                  }}
                />
              </label>
              <label className={styles.field}>
                To
                <PeopleDateInput
                  value={toDate}
                  onChange={(next) => {
                    setToDate(next);
                    setPage(1);
                  }}
                />
              </label>
              <PeoplePicker
                organisation={organisationId}
                area="projects"
                label="Project filter"
                selected={projectFilter}
                onChange={(id) => {
                  setProjectFilter(id);
                  setPage(1);
                }}
              />
            </div>
          )}
          {section === "training" && trainingDrafts.length > 0 && (
            <section className={styles.panel} aria-label="Training uploads needing attention">
              <h2>Training uploads needing attention</h2>
              {trainingDrafts.map((draft) => (
                <div className={styles.toolbar} key={value(draft, "id")}>
                  <span>{value(draft, "training_type")} for {value(draft, "display_name")} · Upload Failed</span>
                  <button className="tt-button" onClick={() => { setTrainingDraft(draft); setTrainingAdd(true); }}>Retry Upload</button>
                </div>
              ))}
            </section>
          )}
          {loading ? (
            <p role="status">Loading...</p>
          ) : rows.length ? (
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${trainingConfiguration ? styles.configurationTable : ""} ${section === "training_types" && trainingConfiguration ? styles.trainingTypeConfigurationTable : ""}`}>
                <thead>
                  <tr>
                    {columns.map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={value(row, "id")}
                      data-selected={detail?.id === row.id}
                    >
                      {columns.map(([key]) => (
                        <td key={key}>
                          {section === "people" && key === "display_name" ? <span style={{display:"inline-flex",alignItems:"center",gap:8}}><PersonAvatar organisation={organisationId} personId={value(row,"id")} name={value(row,"display_name")} documentId={value(row,"current_profile_photo_id")} decorative />{value(row,"display_name")}</span> : section === "training_types" && key === "validity_summary"
                            ? value(row, "validity_mode") === "never" ? "Never expires" : value(row, "validity_mode") === "automatic" ? `${value(row, "validity_months")} months` : "Manual expiry"
                            : section === "training_types" && key === "evidence_summary"
                              ? ({ none: "No document", single: "Single document", front_back: "Front + back", single_or_front_back: "Single or front + back" } as Record<string, string>)[value(row, "document_requirement")] ?? "Single document"
                              : section === "training_types" && key === "review_summary"
                                ? ({ none: "No Review", required: "Review Required", trusted: "Trusted Submitter May Confirm", inherit: "Organisation Default" } as Record<string, string>)[value(row, "review_policy")] ?? "Organisation Default"
                                : section === "training_types" && key === "replacement_summary"
                                  ? row.allows_multiple_current ? "Multiple current" : ({ type: "Same Ticket", type_and_option: "Ticket + Option / Class", type_option_and_project: "Ticket + Option / Class + Project", never: "Never Replace" } as Record<string, string>)[value(row, "supersede_scope")] ?? "Same Ticket"
                                  : section === "training_types" && key === "filename_summary"
                                    ? value(row, "filename_template") ? "Custom Ticket Rule" : "Inherited Default"
                                    : section === "training_types" && key === "matrix_option_display"
                                      ? value(row, "matrix_option_display") === "combined" ? "Combined Options / Classes" : "Separate Options / Classes"
                                    : key === "is_active"
                            ? row.is_active
                              ? "Active"
                              : "Inactive"
                            : peopleDisplay(peopleDateValue(row, key), key) ||
                              "—"}
                        </td>
                      ))}
                      <td className={trainingConfiguration ? styles.configurationActionCell : undefined}>
                        {section === "people" ? (
                          <Link
                            className="tt-button"
                            href={`/workspace/people/${value(row, "id")}?organisation=${organisationId}&backTo=${encodeURIComponent(listHref)}`}
                          >
                            Open
                          </Link>
                        ) : section === "documents" ? (
                          <button
                            className="tt-button"
                            onClick={() => void openDocument(value(row, "id"))}
                          >
                            Preview
                          </button>
                        ) : section === "projects" ? (
                          <>
                            {
                              <Link
                                href={`/workspace/projects/${value(row, "id")}?organisation=${organisationId}`}
                              >
                                Open
                              </Link>
                            }
                            {personId && allowed("people.edit") && (
                              <button
                                className="tt-button-danger"
                                disabled={busy}
                                onClick={() =>
                                  void perform("person_project", {
                                    person_id: personId,
                                    project_id: row.id,
                                    remove: true,
                                  })
                                }
                              >
                                End assignment
                              </button>
                            )}
                          </>
            ) : section === "training_types" && trainingConfiguration ? (
                          <div className={styles.trainingTypeRowActions}>
                            {allowed("training.configure") ? (
                              <button
                                className={styles.configurationRowAction}
                                onClick={() =>
                                  setEditor({
                                    heading: "Edit Training Type",
                                    action: "training_type",
                                    id: value(row, "id"),
                                    fields: typeFields,
                                    initial: row,
                                  })
                                }
                              >
                                Edit
                              </button>
                            ) : <span className={styles.muted}>View only</span>}
                            {((row.linked_types ?? []) as string[]).length > 0 && (
                              <span className={styles.linkedQualificationBadge}>
                                Linked: <LinkedCaption organisation={organisationId} id={((row.linked_types ?? []) as string[])[0]} />
                                {((row.linked_types ?? []) as string[]).length > 1 && <span> +{((row.linked_types ?? []) as string[]).length - 1}</span>}
                              </span>
                            )}
                            {allowed("training.configure") && (
                              <details className={styles.trainingTypeMore}>
                                <summary aria-label={`More actions for ${value(row, "name")}`}>More</summary>
                                <div className={styles.trainingTypeMoreMenu}>
                                  <button
                                    className={styles.configurationRowAction}
                                    onClick={() =>
                                      setEditor({
                                        heading: "Linked qualification — shared evidence, independent expiry and review",
                                        action: "linked_type",
                                        id: value(row, "id"),
                                        fields: [{ key: "linked_type_id", label: "Linked qualification", area: "training_types", required: true }],
                                      })
                                    }
                                  >
                                    Link qualification
                                  </button>
                                  {((row.linked_types ?? []) as string[]).map((linkedId) => (
                                    <button
                                      key={linkedId}
                                      className={`${styles.configurationRowAction} ${styles.configurationDangerAction}`}
                                      disabled={busy}
                                      onClick={() => void perform("unlink_training_type", { linked_type_id: linkedId }, value(row, "id"))}
                                    >
                                      Remove link: <LinkedCaption organisation={organisationId} id={linkedId} />
                                    </button>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : settings ? (
                          <button
                            className={trainingConfiguration ? styles.configurationRowAction : "tt-button"}
                            onClick={() =>
                              setEditor({
                                heading:
                                  section === "training_types"
                                    ? "Edit Training Type"
                                    : "Edit Employment / Engagement Type",
                                action:
                                  section === "types"
                                    ? "type"
                                    : "training_type",
                                id: value(row, "id"),
                                fields:
                                  section === "types"
                                    ? [
                                        {
                                          key: "name",
                                          label: "Name",
                                          required: true,
                                        },
                                        {
                                          key: "description",
                                          label: "Description",
                                          type: "textarea",
                                        },
                                        {
                                          key: "default_template_id",
                                          label: "Default onboarding template",
                                          area: "onboarding_template_choices",
                                        },
                                        {
                                          key: "is_active",
                                          label: "Active",
                                          type: "checkbox",
                                        },
                                      ]
                                    : typeFields,
                                initial:
                                  section === "types"
                                    ? {
                                        ...row,
                                        description:
                                          (row.settings as Row)?.description ??
                                          "",
                                        default_template_id:
                                          (row.settings as Row)
                                            ?.default_template_id ?? "",
                                      }
                                    : row,
                              })
                            }
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            className="tt-button"
                            onClick={() => void openDetail(row)}
                          >
                            {section === "crews" ? "Manage" : "Open"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <p>
                {section === "people"
                  ? "No people have been added yet."
                  : "No matching records."}
              </p>
              {section === "types" && (
                <p>Configure how people engage with your organisation.</p>
              )}
            </div>
          )}
          <div className={styles.toolbar}>
            <small className={styles.muted}>
              {Number(data.total ?? 0).toLocaleString()} records · Page {page}
            </small>
            <div className={styles.actions}>
              <button
                className="tt-button"
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                className="tt-button"
                disabled={page * 20 >= Number(data.total ?? 0) || loading}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
      {detail && !editor && (
        <section
          className={`${styles.detail} ${styles.drawer}`}
          aria-label="Record details"
        >
          <BackLink
            href={listHref}
            label={`Back to ${section === "crews" ? "Crews" : section === "review" ? "Training Review" : section === "prestarts" ? "Site Prestarts" : "Training"}`}
            onNavigate={() => setDetail(null)}
          />
          <div className={styles.toolbar}>
            <h2>
              {value(detail, "name") ||
                value(detail, "training_type") ||
                "Site Prestart"}
            </h2>
            <button
              className="tt-button-subtle"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
          {section === "crews" ? (
            <>
              <nav className={styles.nav} aria-label="Crew details">
                {["overview", "members", "projects", "history"].map((tab) => (
                  <button
                    className="tt-button"
                    key={tab}
                    aria-current={crewTab === tab ? "page" : undefined}
                    onClick={async () => {
                      setCrewTab(tab);
                      setDetailPage(1);
                      try {
                        const r = await responseData(
                          await fetch(
                            `/api/people?organisation=${organisationId}&area=${tab === "history" ? "crew_history" : tab === "projects" ? "crew_projects" : "crew_members"}&crew_id=${detail.id}`,
                          ),
                        );
                        setDetailRows(r.rows ?? []);
                        setCrewEvents((r.events ?? []) as Row[]);
                        setDetailTotal(
                          Math.max(
                            Number(r.total ?? 0),
                            Number(r.events_total ?? 0),
                          ),
                        );
                      } catch {
                        setError("Unable to load crew details.");
                      }
                    }}
                  >
                    {title(tab)}
                  </button>
                ))}
              </nav>
              <div className={styles.actions}>
                {relatedProjects.map((project) => (
                  <Link
                    key={value(project, "id")}
                    href={`/workspace/projects/${value(project, "id")}?organisation=${organisationId}`}
                  >
                    {value(project, "name")}
                  </Link>
                ))}
              </div>
              {crewTab === "overview" && (
                <dl className={styles.summary}>
                  <div>
                    <dt>{value(detail, "leader_label") || "Crew leader"}</dt>
                    <dd>{value(detail, "leader") || "Not assigned"}</dd>
                  </div>
                  <div>
                    <dt>Projects</dt>
                    <dd>{value(detail, "projects") || "Not assigned"}</dd>
                  </div>
                  <div>
                    <dt>Notes</dt>
                    <dd>{value(detail, "notes") || "No notes"}</dd>
                  </div>
                </dl>
              )}
              <p>
                {value(detail, "member_count")} people ·{" "}
                {title(value(detail, "status"))}
              </p>
              {crewTab !== "overview" && (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{crewTab === "projects" ? "Project" : "Name"}</th>
                      <th>
                        {crewTab === "history" ? "Effective From" : "Position"}
                      </th>
                      {crewTab !== "history" && <th>Effective From</th>}
                      <th>Effective To</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((row) => (
                      <tr
                        key={value(row, "id")}
                        data-selected={detail?.id === row.id}
                      >
                        <td>
                          {crewTab === "projects"
                            ? value(row, "name")
                            : value(row, "display_name")}
                        </td>
                        <td>
                          {crewTab === "history"
                            ? peopleDateValue(row, "joined_at")
                            : value(row, "position")}
                        </td>
                        {crewTab !== "history" && (
                          <td>
                            {peopleDateValue(
                              row,
                              crewTab === "projects"
                                ? "assigned_at"
                                : "joined_at",
                            )}
                          </td>
                        )}
                        <td>
                          {crewTab === "history"
                            ? row.left_at
                              ? peopleDateValue(row, "left_at")
                              : "Current"
                            : "Current"}
                        </td>
                        <td>
                          {crewTab !== "history" &&
                            allowed("people.crews.manage") && (
                              <button
                                className="tt-button-danger"
                                disabled={busy}
                                onClick={() =>
                                  setEditor({
                                    heading:
                                      crewTab === "projects"
                                        ? "End project allocation"
                                        : "End crew membership",
                                    action:
                                      crewTab === "projects"
                                        ? "crew_project"
                                        : "crew_member",
                                    id: value(detail, "id"),
                                    fields: [
                                      {
                                        key: "effective_at",
                                        label: "Effective until",
                                        type: "datetime-local",
                                        required: true,
                                      },
                                    ],
                                    initial: {
                                      remove: true,
                                      ...(crewTab === "projects"
                                        ? { project_id: row.id }
                                        : { person_id: row.id }),
                                      effective_at: new Date(
                                        Date.now() -
                                          new Date().getTimezoneOffset() *
                                            60000,
                                      )
                                        .toISOString()
                                        .slice(0, 16),
                                    },
                                  })
                                }
                              >
                                {crewTab === "projects"
                                  ? "End project allocation"
                                  : "Remove from crew"}
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {crewTab === "history" && (
                <div className={styles.panel}>
                  <h3>Change audit</h3>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Person</th>
                        <th>Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crewEvents.map((event, n) => (
                        <tr key={n}>
                          <td>{peopleDateValue(event, "created_at")}</td>
                          <td>{title(value(event, "action"))}</td>
                          <td>{value(event, "display_name") || "Crew"}</td>
                          <td>
                            {value(event, "actor_name") ||
                              value(event, "actor_id") ||
                              "Not recorded"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {allowed("people.crews.manage") && (
                <div className={styles.actions}>
                  <button
                    className="tt-button"
                    onClick={() =>
                      setEditor({
                        heading: "Add crew member",
                        action: "crew_member",
                        id: value(detail, "id"),
                        fields: [
                          {
                            key: "person_id",
                            label: "Person",
                            area: "people_choices",
                            required: true,
                          },
                          {
                            key: "effective_at",
                            label: "Effective from",
                            type: "datetime-local",
                            required: true,
                          },
                        ],
                        initial: {
                          effective_at: new Date(
                            Date.now() - new Date().getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16),
                        },
                      })
                    }
                  >
                    Add person
                  </button>
                  <button
                    className="tt-button"
                    onClick={() =>
                      setEditor({
                        heading: "Crew details",
                        action: "crew",
                        id: value(detail, "id"),
                        fields: [
                          { key: "name", label: "Crew name", required: true },
                          { key: "leader_label", label: "Leader label" },
                          { key: "notes", label: "Notes", type: "textarea" },
                          {
                            key: "leader_person_id",
                            label: "Crew leader",
                            area: "people",
                          },
                          {
                            key: "status",
                            label: "Status",
                            options: ["active", "inactive", "archived"],
                          },
                        ],
                        initial: detail,
                      })
                    }
                  >
                    Edit crew
                  </button>
                  <button
                    className="tt-button"
                    onClick={() =>
                      setEditor({
                        heading: "Associate crew with project",
                        action: "crew_project",
                        id: value(detail, "id"),
                        fields: [
                          {
                            key: "project_id",
                            label: "Project",
                            area: "projects",
                            required: true,
                          },
                          {
                            key: "effective_at",
                            label: "Effective from",
                            type: "datetime-local",
                            required: true,
                          },
                        ],
                        initial: {
                          effective_at: new Date(
                            Date.now() - new Date().getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16),
                        },
                      })
                    }
                  >
                    Assign project
                  </button>
                </div>
              )}
            </>
          ) : section === "prestarts" ? (
            <>
              <p>
                {value(detail, "project_name")} ·{" "}
                {peopleDateValue(detail, "prestart_date")} ·{" "}
                {title(value(detail, "status"))}
              </p>
              <p>{value(prestartDetails, "discussion")}</p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Attendee</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row) => (
                    <tr
                      key={value(row, "id")}
                      data-selected={detail?.id === row.id}
                    >
                      <td>{value(row, "display_name")}</td>
                      <td>{peopleDateValue(row, "recorded_at")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allowed("people.site_prestarts.manage") &&
                value(detail, "status") === "draft" && (
                  <div className={styles.actions}>
                    <button
                      className="tt-button"
                      onClick={() =>
                        setEditor({
                          heading:
                            "Record attendee (attendance entry, not a signed declaration)",
                          action: "prestart_attendee",
                          id: value(detail, "id"),
                          fields: [
                            {
                              key: "person_id",
                              label: "Person",
                              area: "people_choices",
                              required: true,
                            },
                          ],
                        })
                      }
                    >
                      Add attendee
                    </button>
                    <button
                      className="tt-button-primary"
                      disabled={busy}
                      onClick={async () => {
                        await perform(
                          "complete_prestart",
                          {},
                          value(detail, "id"),
                        );
                        setDetail(null);
                      }}
                    >
                      Complete prestart
                    </button>
                  </div>
                )}
            </>
          ) : (
            <>
              {section === "training" || section === "review" ? <>
                <h3>Record Details</h3>
                <dl className={`${styles.summary} ${styles.trainingRecordSummary}`}>
                  <div><dt>Person</dt><dd>{value(detail, "display_name") || "—"}</dd></div>
                  <div><dt>Training Type</dt><dd>{value(detail, "training_type") || "—"}</dd></div>
                  <div><dt>Option / Class</dt><dd>{value(detail, "option_name") || "—"}</dd></div>
                  <div><dt>Certificate / Licence Number</dt><dd>{value(detail, "certificate_number") || "—"}</dd></div>
                  <div><dt>Issue Date</dt><dd>{peopleDateValue(detail, "issue_date")}</dd></div>
                  <div><dt>Expiry Date</dt><dd>{detail.expiry_date ? peopleDateValue(detail, "expiry_date") : "Does not expire"}</dd></div>
                  <div><dt>Status</dt><dd>{title(value(detail, "status"))}</dd></div>
                  <div><dt>Review</dt><dd>{title(value(detail, "review_status"))} · {value(detail, "reviewed_by") || "Awaiting review"}{value(detail, "reviewed_at") ? ` · ${peopleDateValue(detail, "reviewed_at")}` : ""}</dd></div>
                  {value(detail, "review_comment") && <div><dt>Review Comment</dt><dd>{value(detail, "review_comment")}</dd></div>}
                </dl>
              </> : <>
                <p>{value(detail, "display_name")} · {title(value(detail, "status"))} · Expiry {detail.expiry_date ? peopleDateValue(detail, "expiry_date") : "No expiry"}</p>
                <p className={styles.muted}>Reviewer: {value(detail, "reviewed_by") || "Awaiting review"} · {peopleDateValue(detail, "reviewed_at")}{value(detail, "review_comment") && ` · ${value(detail, "review_comment")}`}</p>
              </>}
              <div>
                {detailRows.map((row) => (
                  <button
                    className="tt-button"
                    key={value(row, "id")}
                    onClick={() => void openDocument(value(row, "id"))}
                  >
                    {value(row, "side") === "front" ? "Front" : value(row, "side") === "back" ? "Back" : "Evidence"} · Preview · {value(row, "name")}
                  </button>
                ))}
                {!detailRows.length && <p>No documents uploaded.</p>}
              </div>
              <details
                onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
              >
                <summary>Training and review history</summary>
                {historyOpen && (
                  <TrainingHistory
                    key={value(detail, "id")}
                    organisation={organisationId}
                    record={value(detail, "id")}
                  />
                )}
              </details>
              {allowed("training.edit") && value(detail, "voided_at") === "" && (
                <div className={styles.actions}>
                  <button className="tt-button" onClick={() => setEditor({
                    heading: "Edit Training Record",
                    action: "training_record_update",
                    id: value(detail, "id"),
                    fields: value(detail, "review_status") === "approved" && (value(detail, "status") === "current" || value(detail, "is_current") === "true")
                      ? [{ key: "certificate_number", label: "Certificate / licence number" }]
                      : [
                          { key: "issue_date", label: "Issue date", type: "date" },
                          { key: "expiry_date", label: "Expiry date (manual validity only)", type: "date" },
                          { key: "certificate_number", label: "Certificate / licence number" },
                        ],
                    initial: detail,
                  })}>Edit Record</button>
                  {!showVoidForm ? <button className="tt-button-danger" onClick={() => { setShowVoidForm(true); setVoidReason(""); }}>Delete Record</button> : <div className={styles.actions}>
                    <label className={styles.field}>Reason for removal<textarea className="tt-input" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} required /></label>
                    <button className="tt-button" onClick={() => setShowVoidForm(false)}>Cancel</button>
                    <button className="tt-button-danger" disabled={busy || !voidReason.trim()} onClick={async () => { const saved = await perform("training_record_void", { reason: voidReason }, value(detail, "id")); if (saved) { setDetail(null); setShowVoidForm(false); } }}>Delete Record</button>
                  </div>}
                </div>
              )}
              {allowed("training.edit") &&
                ["pending_review", "changes_required"].includes(
                  value(detail, "review_status"),
                ) && (
                  <form
                    className={styles.fields}
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setBusy(true);
                      const form = new FormData(event.currentTarget);
                      form.set("organisation", organisationId);
                      form.set("person_id", value(detail, "person_id"));
                      form.set("record_id", value(detail, "id"));
                      try {
                        await responseData(
                          await fetch("/api/people/documents", {
                            method: "POST",
                            body: form,
                          }),
                        );
                        setNotice("Evidence uploaded.");
                        await openDetail(detail);
                      } catch (error) {
                        setError(
                          error instanceof Error
                            ? error.message
                            : "Upload failed.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label className={styles.field}>
                      Evidence (PDF, JPG or PNG · max 10 MB)
                      <input
                        type="file"
                        name="file"
                        accept="application/pdf,image/jpeg,image/png"
                        required
                      />
                    </label>
                    <label className={styles.field}>
                      Document side
                      <select className="tt-input" name="side">
                        <option value="single">Single document</option>
                        <option value="front">Front</option>
                        <option value="back">Back</option>
                      </select>
                    </label>
                    <div>
                      <button className="tt-button" disabled={busy}>
                        Upload evidence
                      </button>
                    </div>
                  </form>
                )}
              {allowed("training.approve") &&
                ["pending_review", "changes_required"].includes(
                  value(detail, "review_status"),
                ) && (
                  <>
                    <label className={styles.field}>
                      Review comment (required for rejection or requested
                      changes)
                      <textarea
                        className="tt-input"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows={2}
                      />
                    </label>
                    <div className={styles.actions}>
                      {[
                        ["approved", "Approve"],
                        ["rejected", "Reject"],
                        ["changes_required", "Request changes"],
                      ].map(([outcome, label]) => (
                        <button
                          key={outcome}
                          className={
                            outcome === "approved"
                              ? "tt-button-primary"
                              : outcome === "rejected"
                                ? "tt-button-danger"
                                : "tt-button"
                          }
                          disabled={
                            busy || (outcome !== "approved" && !comment.trim()) || (outcome === "approved" && missingRequiredEvidence)
                          }
                          onClick={() =>
                            void perform(
                              "review_training",
                              { outcome, comment },
                              value(detail, "id"),
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {missingRequiredEvidence && <p className={styles.muted}>Upload the required evidence before this record can be reviewed.</p>}
                  </>
                )}
              {allowed("training.edit") &&
                value(detail, "review_status") === "changes_required" && (
                  <button
                    className="tt-button"
                    disabled={busy}
                    onClick={() =>
                      void perform("resubmit_training", {}, value(detail, "id"))
                    }
                  >
                    Resubmit for review
                  </button>
                )}
            </>
          )}
          <div className={styles.toolbar}>
            <small>{detailTotal} records</small>
            <div className={styles.actions}>
              <button
                className="tt-button"
                disabled={detailPage <= 1}
                onClick={() => void openDetail(detail, detailPage - 1)}
              >
                Previous
              </button>
              <button
                className="tt-button"
                disabled={detailPage * 20 >= detailTotal}
                onClick={() => void openDetail(detail, detailPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
  </>);
  return (
    <div className={styles.page}>
      {!settingsInWorkspace && <>
      <WorkspaceHeading title="People" subtitle="Workforce, crews, training, onboarding and site readiness." />
      <div className={styles.peopleWorkspaceNavigation}>
        <WorkspaceTabs items={peopleWorkspaceItems} label="People navigation" />
        {(allowed("people.configure") || allowed("training.configure")) && <Link className={styles.peopleSettingsLink} href={`/workspace/settings/people?organisation=${encodeURIComponent(organisationId)}`} aria-current={settings ? "page" : undefined}><Settings2 size={15} aria-hidden />People Settings</Link>}
      </div>
      </>}
      {personId && <Breadcrumbs items={[
        { label: "People", href: peopleHref("overview") },
        { label: "Employee Register", href: peopleHref("people") },
        { label: personName, href: `/workspace/people/${personId}?organisation=${encodeURIComponent(organisationId)}`, active: true },
      ]} />}
      {trainingContext && <ContextTabs items={trainingNavItems} label="Training navigation" />}
      {personId && <PageHeading title={pageTitle} subtitle={pageSubtitle} />}
      {personId && <ContextTabs items={profileNavItems} label="Person profile navigation" />}
      {settings && !settingsInWorkspace && !trainingConfiguration && <ContextTabs items={nav.map(item => ({ label: item.label, href: item.key === "training_types" ? `/workspace/people/training/configuration?organisation=${encodeURIComponent(organisationId)}&section=training_types` : href(item.key), active: section === item.key }))} label="People settings navigation" />}
      {trainingConfiguration && <PageHeading title="Training Configuration" subtitle={pageSubtitle} />}
      {!personId && !trainingConfiguration && !(settingsInWorkspace && section === "templates") && <PageHeading title={pageTitle} subtitle={pageSubtitle} />}
      {trainingConfiguration ? (
        <ConfigurationLayout items={configNavItems} activeKey={section ?? "overview"}>
          {pageContent}
        </ConfigurationLayout>
      ) : pageContent}
      {editor && (
        <Editor
          key={`${editor.action}:${editor.id ?? "new"}`}
          organisation={organisationId}
          heading={editor.heading}
          description={
            editor.action === "training_type"
              ? "Configure the Training Type, validity, evidence and review settings."
              : undefined
          }
          surface={editor.action === "linked_type" ? "small" : "medium"}
          saveLabel={editor.action === "training_type" ? editor.id ? "Save Changes" : "Save Training Type" : "Save"}
          fields={editor.fields}
          initial={editor.initial}
          groupContent={
            editor.action === "training_type"
              ? {
                  "Basic Details": (
                    <p className={styles.muted}>
                      Choose a Training Category. If none are available, add one in{" "}
                      <Link href={href("training_categories")}>Categories</Link>.
                    </p>
                  ),
                }
              : undefined
          }
          sectionContent={(group, data, update) => {
            if (editor.action === "training_type" && group === "Evidence")
              return (
                <FrontBackNamingNotice
                  organisation={organisationId}
                  categoryId={String(data.category_id ?? "")}
                  evidenceRequirement={String(data.document_requirement ?? "single")}
                  filenameTemplate={String(data.filename_template ?? "")}
                  onAddDocumentSide={(template) => update({ filename_template: template })}
                />
              );
            if (editor.action === "training_type" && group === "Options / Classes")
              return (
                <TrainingClassSelection
                  definitions={Array.isArray(data.option_definitions) ? data.option_definitions as Row[] : []}
                  onChange={(option_definitions) => update({ option_definitions, option_ids: option_definitions.flatMap((option) => option.id ? [option.id] : []) })}
                />
              );
            if (editor.action === "training_type" && group === "File Naming")
              return (
                <TicketFilenameEditor
                  organisation={organisationId}
                  categoryId={String(data.category_id ?? "")}
                  evidenceRequirement={String(data.document_requirement ?? "single")}
                  value={String(data.filename_template ?? "")}
                  onChange={(filename_template) => update({ filename_template })}
                />
              );
            if (editor.action === "training_type" && group === "Review")
              return (
                <p className={styles.muted}>
                  Review settings apply to employee, mobile and onboarding submissions.
                </p>
              );
            return null;
          }}
          onSave={async (data) => {
            try {
              await mutate(editor.action, data, editor.id);
            } catch (cause) {
              if (editor.action === "training_type") {
                const message = cause instanceof Error ? cause.message : "";
                throw new Error(
                  message && message !== "Unable to complete this action. Check the details and try again."
                    ? message
                    : editor.id
                      ? "Training Type could not be saved. Check the details and try again."
                      : "Training Type could not be created. Check the details and try again.",
                );
              }
              throw cause;
            }
          }}
          onCancel={() => setEditor(null)}
        />
      )}
      {trainingAdd && section === "training" && !settings &&
        (allowed("training.create") || (trainingDraft && allowed("training.edit"))) && (
          <div
            className={styles.trainingUploadBackdrop}
            role="presentation"
          >
            <section
              className={`${styles.detail} ${styles.drawer} ${styles.trainingUploadDrawer}`}
              role="dialog"
              aria-modal="true"
              aria-label={trainingDraft ? "Retry Training upload" : "Add Training record"}
            >
              <TrainingUpload
                key={value(trainingDraft ?? {}, "id") || "new-training"}
                organisation={organisationId}
                personId={personId}
                draft={trainingDraft ?? undefined}
                canEditPerson={allowed("people.edit")}
                canManageDocumentSetup={allowed("training.configure")}
                onClose={() => {
                  setTrainingAdd(false);
                  setTrainingDraft(null);
                }}
                onSaved={(message) => {
                  setTrainingAdd(false);
                  setTrainingDraft(null);
                  setNotice(message || "Training record submitted.");
                  void load();
                }}
              />
            </section>
          </div>
        )}
      {documentPreview && <DocumentPreview {...documentPreview} onClose={()=>setDocumentPreview(null)}/>}
      {["training","review","documents"].includes(section)&&<DocumentStorageStatus organisation={organisationId} context="training"/>}
    </div>
  );
}

function TicketFilenameEditor({
  organisation,
  categoryId,
  evidenceRequirement,
  value: override,
  onChange,
}: {
  organisation: string;
  categoryId: string;
  evidenceRequirement: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [defaultTemplate, setDefaultTemplate] = useState("");
  const [categoryDefault, setCategoryDefault] = useState("");
  const [source, setSource] = useState("");
  const [mode, setMode] = useState(override ? "custom" : "default");
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/integrations/sharepoint/workspace?organisation=${encodeURIComponent(organisation)}`, { signal: controller.signal, cache: "no-store" }).then(responseData),
      fetch(`/api/people?organisation=${encodeURIComponent(organisation)}&area=training_categories`, { signal: controller.signal, cache: "no-store" }).then(responseData),
    ])
      .then(([result, categoryResult]) => {
        const rules = (result.rules ?? []) as Row[];
        const trainingRules = rules.filter((rule) => rule.context === "training" && rule.is_active !== false);
        const chosen = trainingRules.find((rule) => !rule.relationship_type_id) ?? trainingRules[0];
        setDefaultTemplate(String(chosen?.filename_template ?? ""));
        setCategoryDefault(String(((categoryResult.rows ?? []) as Row[]).find((row) => String(row.id) === categoryId)?.filename_template ?? "").trim());
        setSource(chosen ? String(chosen.name ?? "Organisation Training default") : "No SharePoint Training default configured");
      })
      .catch(() => setSource("Organisation Training default could not be loaded"));
    return () => controller.abort();
  }, [organisation, categoryId]);
  const tokens = contextTokens.training.filter((token) => [
    "employee_number", "person_display_name", "training_type", "training_category",
    "training_option", "document_side", "issue_date", "expiry_date",
  ].includes(token));
  const inherited = categoryDefault || defaultTemplate || "{training_type}_{year}";
  const effective = override.trim() || (mode === "custom" ? override.trim() : inherited);
  const needsSide = ["front_back", "single_or_front_back"].includes(evidenceRequirement) && !/\{document_side\}/i.test(effective);
  const addSideToken = () => {
    const base = override.trim() || inherited;
    onChange(base.match(/\{document_side\}/i) ? base : `${base} - {document_side}`);
    setMode("custom");
  };
  return (
    <div className={styles.panel}>
      <label className={styles.field}>
        File Name
        <select className="tt-input" value={mode} onChange={(event) => { setMode(event.target.value); if (event.target.value === "default") onChange(""); }}>
          <option value="default">Use inherited file name</option>
          <option value="custom">Custom for this Ticket</option>
        </select>
      </label>
      {mode === "custom" ? (
        <>
          <p className={styles.muted}>This Ticket’s name takes priority over its Category and organisation defaults.</p>
          <DocumentTemplateBuilder value={override} onChange={onChange} tokens={tokens} filename />
          <p className={styles.muted}>Preview: {renderTrainingFilename(override)}.pdf</p>
          <button type="button" className="tt-button-subtle" onClick={() => onChange(defaultTemplate)} disabled={!defaultTemplate}>Start From Default</button>
          <button type="button" className="tt-button-subtle" onClick={() => { onChange(""); setMode("default"); }}>Reset to Default</button>
        </>
      ) : (
        <p className={styles.muted}>Using {source}{categoryId ? ". A Category default applies before the organisation default." : "."} The extension is added from the uploaded file.</p>
      )}
      {needsSide && <p className={styles.namingWarning} role="status">Front + Back evidence requires the file name to distinguish each side. <button type="button" className="tt-button-subtle" onClick={addSideToken}>Add Document Side</button></p>}
      <small>Actual records must contain every selected field. Change the storage destination under SharePoint Document Setup.</small>
    </div>
  );
}

function FrontBackNamingNotice({
  organisation,
  categoryId,
  evidenceRequirement,
  filenameTemplate,
  onAddDocumentSide,
}: {
  organisation: string;
  categoryId: string;
  evidenceRequirement: string;
  filenameTemplate: string;
  onAddDocumentSide: (template: string) => void;
}) {
  const [effectiveTemplate, setEffectiveTemplate] = useState("");
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    if (!["front_back", "single_or_front_back"].includes(evidenceRequirement)) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/integrations/sharepoint/workspace?organisation=${encodeURIComponent(organisation)}`, { signal: controller.signal, cache: "no-store" }).then(responseData),
      fetch(`/api/people?organisation=${encodeURIComponent(organisation)}&area=training_categories`, { signal: controller.signal, cache: "no-store" }).then(responseData),
    ]).then(([workspace, categoryResult]) => {
      if (controller.signal.aborted) return;
      const rules = (workspace.rules ?? []) as Row[];
      const defaults = rules.filter((rule) => rule.context === "training" && rule.is_active !== false && !rule.relationship_type_id).sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));
      const category = ((categoryResult.rows ?? []) as Row[]).find((row) => String(row.id) === categoryId);
      const destination = String(defaults[0]?.filename_template ?? "").trim() || "{training_type}_{year}";
      setEffectiveTemplate(filenameTemplate.trim() || String(category?.filename_template ?? "").trim() || destination);
      setResolved(true);
    }).catch(() => { if (!controller.signal.aborted) { setEffectiveTemplate(filenameTemplate.trim()); setResolved(true); } });
    return () => controller.abort();
  }, [organisation, categoryId, evidenceRequirement, filenameTemplate]);
  if (!resolved || !["front_back", "single_or_front_back"].includes(evidenceRequirement) || /\{document_side\}/i.test(effectiveTemplate)) return null;
  const add = () => {
    const base = effectiveTemplate || "{training_type}_{year}";
    onAddDocumentSide(base.match(/\{document_side\}/i) ? base : `${base} - {document_side}`);
  };
  return <p className={styles.namingWarning} role="status">Front + Back evidence requires the file name to distinguish each side. <button type="button" className="tt-button-subtle" onClick={add}>Add Document Side</button></p>;
}

function renderTrainingFilename(template: string) {
  const samples: Record<string, string> = {
    employee_number: "EMP-0042", person_display_name: "Alex Smith", training_type: "CPR",
    training_category: "First Aid", training_option: "Standard", document_side: "Front",
    issue_date: "10-10-2026", expiry_date: "10-10-2027",
  };
  return template.replace(/\{([^{}]+)\}/g, (_, key: string) => samples[key] ?? `{${key}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/-+/g, "-");
}

function TrainingConfigurationOverview({ organisation }: { organisation: string }) {
  const [status, setStatus] = useState<{
    categories?: number;
    options?: number;
    tickets?: number;
    documentRules?: number;
    storage?: boolean;
    storageManage?: boolean;
  }>({});
  useEffect(() => {
    const controller = new AbortController();
    const count = async (area: string) => {
      const params = new URLSearchParams({ organisation, area });
      const result = await responseData(await fetch(`/api/people?${params}`, { signal: controller.signal }));
      return Number(result.total ?? 0);
    };
    void Promise.allSettled([
      count("training_categories"), count("training_options"), count("training_types"),
      count("document_rules"),
      fetch(`/api/documents/storage?organisation=${encodeURIComponent(organisation)}&context=training`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("Storage status unavailable");
        return response.json() as Promise<{ configured: boolean; canManage: boolean }>;
      }),
    ]).then(([categories, options, tickets, documentRules, storage]) => {
      if (controller.signal.aborted) return;
      setStatus({
        categories: categories.status === "fulfilled" ? categories.value : undefined,
        options: options.status === "fulfilled" ? options.value : undefined,
        tickets: tickets.status === "fulfilled" ? tickets.value : undefined,
        documentRules: documentRules.status === "fulfilled" ? documentRules.value : undefined,
        storage: storage.status === "fulfilled" ? storage.value.configured : undefined,
        storageManage: storage.status === "fulfilled" ? storage.value.canManage : false,
      });
    });
    return () => controller.abort();
  }, [organisation]);
  const items = [
    ["Training Types", status.tickets == null ? "Status unavailable" : `${status.tickets} configured`],
    ["Categories", status.categories == null ? "Status unavailable" : `${status.categories} configured`],
    ["Options / Classes", status.options == null ? "Status unavailable" : status.options ? `${status.options} configured` : "Not configured"],
    ["Document Rules", status.documentRules == null ? "Status unavailable" : status.documentRules ? `${status.documentRules} configured` : "Not configured"],
    ["Document Storage", status.storage == null ? "Status unavailable" : status.storage ? "Ready · SharePoint" : "Needs attention"],
    ["File Naming", status.storage == null ? "Status unavailable" : status.storage ? "Uses Training destination rule" : "Needs a Training destination"],
  ] as const;
  return (
    <section className={styles.configurationStatus} aria-label="Configuration status">
      <div className={styles.configurationStatusGrid}>
        {items.map(([label, detail]) => <div className={styles.configurationStatusItem} key={label}><strong>{label}</strong><span>{detail}</span></div>)}
      </div>
      {(status.options === 0 || status.documentRules === 0 || status.storage === false) && <div className={styles.configurationAttention}>
        <strong>Needs Attention</strong>
        <ul>
          {status.options === 0 && <li>No Options / Classes have been configured.</li>}
          {status.documentRules === 0 && <li>No Training document rules have been configured.</li>}
          {status.storage === false && <li>Training document storage needs attention.</li>}
        </ul>
        {status.storage === false && status.storageManage && <Link href={`/workspace/settings/integrations/sharepoint?organisation=${encodeURIComponent(organisation)}&context=training`}>Manage Storage</Link>}
      </div>}
    </section>
  );
}
