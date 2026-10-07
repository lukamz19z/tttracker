"use client";
import { peopleListHref, safePeopleBack } from "@/lib/people/navigation";
import { PersonXero } from "@/components/integrations/person-xero";
import { TrainingCatalogue } from "./training-catalogue";
import { peopleDisplay } from "@/lib/people/display";
import { peopleDateValue } from "@/lib/people/dates";
import {
  TrainingClassSelection,
  TrainingFileRules,
} from "./training-editor-content";
import { BackLink, PeopleDateInput } from "./people-ui";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MaterialsSearch } from "@/components/materials/workflow-controls";
import styles from "./people.module.css";
import {
  PeopleOperationsPanel,
  TrainingUpload,
  TrainingHistory,
  PrivateDomains,
} from "./people-operations";
import { OnboardingPanel } from "./onboarding-admin";

type Props = {
  organisationId: string;
  organisationName: string;
  permissions: Record<string, boolean>;
  personId?: string;
  section?: string;
  settings?: boolean;
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
  { key: "employee_number", label: "Person identifier" },
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
  { key: "name", label: "Training Type", required: true },
  { key: "code", label: "Code" },
  { key: "category_id", label: "Category", area: "training_categories" },
  { key: "description", label: "Description", type: "textarea" },
  {
    key: "review_policy",
    label: "Review policy",
    options: ["inherit", "required", "none", "trusted"],
    optionLabels: {
      inherit: "Organisation default",
      required: "Review required",
      none: "No review required",
      trusted: "Trusted submitters may confirm",
    },
    required: true,
  },
  {
    key: "validity_mode",
    label: "Expiry method",
    options: ["manual", "automatic", "never"],
    required: true,
  },
  {
    key: "validity_months",
    label: "Validity period (months)",
    type: "number",
  },
  {
    key: "renewal_lead_days",
    label: "Expiry warning (days before expiry)",
    type: "number",
  },
  {
    key: "document_requirement",
    label: "Evidence",
    options: ["none", "single", "front_back", "single_or_front_back"],
    required: true,
  },
  {
    key: "requires_issue_date",
    label: "Issue date required",
    type: "checkbox",
  },
  {
    key: "requires_certificate_number",
    label: "Certificate/licence number required",
    type: "checkbox",
  },
  { key: "is_active", label: "Active", type: "checkbox" },
];

export default function PeopleClient({
  organisationId,
  organisationName,
  permissions: rights,
  personId,
  section: requested,
  settings = false,
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
      (item.key === "training" && allowed("training.approve")),
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
  const [data, setData] = useState<Result>({});
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
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [trainingAdd, setTrainingAdd] = useState(false);
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
    (["training_types", "training_categories", "training_options"].includes(
      section ?? "",
    ) ||
      from === "training");
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
    setNotice(action === "training_type" ? "Training Type saved." : "Saved.");
    setEditor(null);
    await load();
    if (detail && (section === "crews" || section === "prestarts"))
      await openDetail(detail, detailPage);
    return result;
  }
  async function perform(action: string, input: Row, id?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate(action, input, id);
      if (action === "review_training") setDetail(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save.");
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
          validity_mode: "manual",
          renewal_lead_days: 30,
          requires_issue_date: true,
          document_requirement: "single",
          is_active: true,
        },
      });
  }
  const rows = data.rows ?? [];
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
                    ["name", "Training"],
                    ["category", "Category"],
                    ["option_names", "Option / Class"],
                    ["validity_mode", "Expiry rule"],
                    ["validity_months", "Months"],
                    ["document_requirement", "Evidence"],
                    ["review_policy", "Review"],
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
      window.open(String(result.url), "_blank", "noopener,noreferrer");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to open document.",
      );
    }
  }
  if (!nav.length) return <p>You do not have permission to access People.</p>;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>
            {settings
              ? trainingConfiguration
                ? "Training Configuration"
                : section === "types"
                  ? "Employment / Engagement Types"
                  : section === "templates"
                    ? "Onboarding Templates"
                    : section === "document_rules"
                      ? "Document Structure"
                      : section === "review_rules"
                        ? "Review Rules"
                        : "People & Onboarding Settings"
              : personId
                ? value(person, "display_name") || "Person"
                : section === "people"
                  ? "Employee Register"
                  : section === "crews"
                    ? "Crews"
                    : section === "training"
                      ? "Training Register"
                      : section === "review"
                        ? "Training Review"
                        : section === "prestarts"
                          ? "Site Prestarts"
                          : "People"}
          </h1>
          <p className={styles.muted}>
            {organisationName} ·{" "}
            {personId
              ? [
                  value(person, "position"),
                  value(person, "type_name"),
                  title(value(person, "employment_status")),
                ]
                  .filter(Boolean)
                  .join(" - ") || "Person profile"
              : section === "crews"
                ? "Manage workforce crews used across projects, Daily Dockets and reporting."
                : trainingConfiguration
                  ? "Configure the training catalogue, options, evidence and review rules."
                  : "Organisation workspace"}
          </p>
        </div>
        {personId && (
          <BackLink
            href={safePeopleBack(backTo, organisationId)}
            label="Back to Employee Register"
          />
        )}
        {settings && (
          <BackLink
            href={
              trainingConfiguration
                ? peopleListHref(organisationId, "training")
                : `/workspace/settings?organisation=${organisationId}&section=people`
            }
            label={
              trainingConfiguration
                ? "Back to Training"
                : "Back to People & Onboarding Settings"
            }
          />
        )}
      </header>
      {trainingConfiguration && (
        <nav className={styles.nav} aria-label="Training configuration">
          {[
            ["training_categories", "Categories"],
            ["training_options", "Options / Classes"],
            ["training_types", "Training Types"],
            ["document_rules", "Document Rules"],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={href(key)}
              aria-current={section === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      {!trainingConfiguration && (
        <nav
          className={styles.nav}
          aria-label={personId ? "Person profile" : "People navigation"}
        >
          {nav
            .filter(
              (item) =>
                !settings ||
                !["training_categories", "training_options"].includes(item.key),
            )
            .map((item) => (
              <Link
                key={item.key}
                aria-current={
                  section === item.key ||
                  (item.key === "training" &&
                    trainingSections.some((s) => s.key === section))
                    ? "page"
                    : undefined
                }
                href={
                  settings && item.key === "training_types"
                    ? `/workspace/people/training/configuration?organisation=${organisationId}`
                    : href(item.key)
                }
              >
                {item.label}
              </Link>
            ))}
        </nav>
      )}
      {!settings &&
        !personId &&
        trainingSections.some((s) => s.key === section) && (
          <nav className={styles.nav} aria-label="Training navigation">
            {trainingSections.map((item) => (
              <Link
                key={item.key}
                href={
                  settings && item.key === "training_types"
                    ? `/workspace/people/training/configuration?organisation=${organisationId}`
                    : href(item.key)
                }
                aria-current={section === item.key ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
            {allowed("training.configure") && (
              <Link
                href={`/workspace/people/training/configuration?organisation=${organisationId}&section=training_types`}
              >
                Configuration
              </Link>
            )}
          </nav>
        )}
      {trainingAdd && (
        <TrainingUpload
          organisation={organisationId}
          personId={personId}
          onClose={() => setTrainingAdd(false)}
          onSaved={() => {
            setTrainingAdd(false);
            void load();
          }}
        />
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className={`${styles.notice} ${styles.error}`} role="alert">
          {error}
        </div>
      )}
      {editor && (
        <>
          <Editor
            key={editor.action + (editor.id ?? "")}
            organisation={organisationId}
            surface="medium"
            saveLabel={
              editor.action === "training_type" ? "Save Training Type" : "Save"
            }
            description={
              editor.action === "training_type"
                ? "Configure validity, evidence and review requirements."
                : undefined
            }
            heading={editor.heading}
            fields={
              editor.action === "training_type"
                ? editor.fields.map((field) => ({
                    ...field,
                    required:
                      ["category_id", "validity_months"].includes(field.key) ||
                      field.required,
                    type:
                      field.key === "validity_mode"
                        ? "training-validity"
                        : field.key === "document_requirement"
                          ? "training-evidence"
                          : field.type,
                    visible:
                      field.key === "validity_months"
                        ? (data) => data.validity_mode === "automatic"
                        : field.key === "renewal_lead_days"
                          ? (data) => data.validity_mode !== "never"
                          : undefined,
                    group:
                      field.key === "category_id"
                        ? "Category"
                        : [
                              "validity_mode",
                              "validity_months",
                              "renewal_lead_days",
                              "requires_issue_date",
                            ].includes(field.key)
                          ? "Validity"
                          : field.key === "document_requirement"
                            ? "Evidence"
                            : field.key === "review_policy"
                              ? "Review"
                              : "Basic",
                  }))
                : editor.fields
            }
            initial={editor.initial}
            groupContent={
              editor.action === "training_type"
                ? {
                    "File Rules": (
                      <>
                        {allowed("people.configure") ? (
                          <TrainingFileRules organisation={organisationId} />
                        ) : (
                          <p className={styles.muted}>
                            Document Rules are managed by authorised People
                            configuration users.
                          </p>
                        )}
                      </>
                    ),
                    Category: (
                      <p className={styles.muted}>
                        Options/classes are configured under the selected
                        category.
                      </p>
                    ),
                  }
                : undefined
            }
            sectionContent={
              editor.action === "training_type"
                ? (group, data, update) =>
                    group === "Category" && data.category_id ? (
                      <TrainingClassSelection
                        key={String(data.category_id)}
                        organisation={organisationId}
                        category={String(data.category_id)}
                        selected={(data.option_ids as string[]) ?? []}
                        onChange={(option_ids) => update({ option_ids })}
                      />
                    ) : group === "Review" ? (
                      <p className={styles.muted}>
                        {data.review_policy === "trusted"
                          ? "Trusted submitters can confirm directly; employee, mobile and onboarding uploads still require review."
                          : data.review_policy === "none"
                            ? "Valid submissions are confirmed without manual review."
                            : "Uploads remain Pending Review until an authorised reviewer confirms them."}
                      </p>
                    ) : null
                : undefined
            }
            onCancel={() => setEditor(null)}
            onSave={async (input) => {
              await mutate(editor.action, input, editor.id);
            }}
          />
        </>
      )}
      {section === "overview" ? (
        <>
          <div className={styles.metrics}>
            {[
              ["active_people", "Active people"],
              ["active_crews", "Active crews"],
              ["pending_review", "Pending training review"],
              ["training_expiring", "Training expiring"],
              ["training_expired", "Training expired"],
            ]
              .filter(([key]) => data[key] != null)
              .map(([key, label]) => (
                <div className={styles.metric} key={key}>
                  {label}
                  <strong>{Number(data[key]).toLocaleString()}</strong>
                </div>
              ))}
          </div>
          <div className={styles.actions}>
            {allowed("people.create") && (
              <Link className="tt-button-primary" href={href("people")}>
                Add Person
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
          <div className={styles.toolbar}>
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
              <button className="tt-button-primary" onClick={add}>
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
          {loading ? (
            <p role="status">Loading...</p>
          ) : rows.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
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
                          {key === "is_active"
                            ? row.is_active
                              ? "Active"
                              : "Inactive"
                            : peopleDisplay(peopleDateValue(row, key), key) ||
                              "—"}
                        </td>
                      ))}
                      <td>
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
                            Open document
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
                        ) : settings ? (
                          <button
                            className="tt-button"
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
                        {section === "training_types" && (
                          <button
                            className="tt-button"
                            onClick={() =>
                              setEditor({
                                heading:
                                  "Linked qualification — shared evidence, independent expiry and review",
                                action: "linked_type",
                                id: value(row, "id"),
                                fields: [
                                  {
                                    key: "linked_type_id",
                                    label: "Linked qualification",
                                    area: "training_types",
                                    required: true,
                                  },
                                ],
                              })
                            }
                          >
                            Link qualification
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
              <p>
                {value(detail, "display_name")} ·{" "}
                {title(value(detail, "status"))} · Expiry{" "}
                {detail.expiry_date
                  ? peopleDateValue(detail, "expiry_date")
                  : "No expiry"}
              </p>
              <p className={styles.muted}>
                Reviewer: {value(detail, "reviewed_by") || "Awaiting review"} ·{" "}
                {peopleDateValue(detail, "reviewed_at")}
                {value(detail, "review_comment") &&
                  ` · ${value(detail, "review_comment")}`}
              </p>
              <div>
                {detailRows.map((row) => (
                  <button
                    className="tt-button"
                    key={value(row, "id")}
                    onClick={() => void openDocument(value(row, "id"))}
                  >
                    {value(row, "name")} · {value(row, "side")}
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
              {allowed("training.edit") &&
                ["pending_review", "changes_required"].includes(
                  value(detail, "review_status"),
                ) && (
                  <button
                    className="tt-button"
                    onClick={() =>
                      setEditor({
                        heading: "Update submission details",
                        action: "update_training",
                        id: value(detail, "id"),
                        fields: [
                          {
                            key: "issue_date",
                            label: "Issue date",
                            type: "date",
                          },
                          {
                            key: "expiry_date",
                            label:
                              "Manual expiry (configured automatic expiry is recalculated)",
                            type: "date",
                          },
                          {
                            key: "certificate_number",
                            label: "Certificate / licence number",
                          },
                        ],
                        initial: detail,
                      })
                    }
                  >
                    Edit submission details
                  </button>
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
                            busy || (outcome !== "approved" && !comment.trim())
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
      {!settings &&
        (allowed("people.configure") || allowed("training.configure")) && (
          <Link
            href={`/workspace/people/settings?organisation=${organisationId}`}
          >
            People & Onboarding Settings
          </Link>
        )}
    </div>
  );
}
