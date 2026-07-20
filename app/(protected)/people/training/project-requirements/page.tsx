"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Download,
  Edit3,
  Filter,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type EmployeeRoleRow = {
  role: string | null;
};

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  default_expiry_months: number | null;
  does_not_expire: boolean | null;
  active: boolean | null;
};

type ProjectRequirement = {
  id: string;
  project_id: string;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number | null;
  accepted_alternative_training_type_ids: string[] | null;
  applies_to_role: string | null;
  notes: string | null;
  active: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RequirementForm = {
  projectId: string;
  trainingTypeId: string;
  requirementLevel: "mandatory" | "recommended";
  renewalLeadDays: string;
  appliesToRole: string;
  acceptedAlternativeTrainingTypeIds: string[];
  notes: string;
  active: boolean;
};

type StatusFilter = "all" | "active" | "archived";
type LevelFilter = "all" | "mandatory" | "recommended";
type RoleFilter = "all" | "everyone" | string;

const EMPTY_FORM: RequirementForm = {
  projectId: "",
  trainingTypeId: "",
  requirementLevel: "mandatory",
  renewalLeadDays: "60",
  appliesToRole: "",
  acceptedAlternativeTrainingTypeIds: [],
  notes: "",
  active: true,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalise(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function plural(value: number, singular: string, pluralLabel?: string) {
  return `${value} ${value === 1 ? singular : pluralLabel ?? `${singular}s`}`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function projectLabel(project: Project | null | undefined) {
  if (!project) return "Unknown project";

  return project.project_number
    ? `${project.project_number} · ${project.name}`
    : project.name;
}

function requirementLevelClasses(
  level: "mandatory" | "recommended",
) {
  return level === "mandatory"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-sky-200 bg-sky-50 text-sky-700";
}

function isInactiveProject(project: Project) {
  return ["completed", "closed", "archived", "inactive"].includes(
    normalise(project.status),
  );
}

export default function ProjectTrainingRequirementsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [employeeRoles, setEmployeeRoles] = useState<string[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [requirements, setRequirements] = useState<ProjectRequirement[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [includeInactiveProjects, setIncludeInactiveProjects] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] =
    useState<ProjectRequirement | null>(null);
  const [form, setForm] = useState<RequirementForm>(EMPTY_FORM);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceProjectId, setCopySourceProjectId] = useState("");
  const [copyTargetProjectId, setCopyTargetProjectId] = useState("");
  const [replaceTargetRequirements, setReplaceTargetRequirements] =
    useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [projectResult, employeeResult, trainingTypeResult, requirementResult] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id, name, project_number, status")
          .order("name", { ascending: true }),
        supabase
          .from("employees")
          .select("role")
          .eq("active", true),
        supabase
          .from("training_types")
          .select(
            "id, name, category, default_expiry_months, does_not_expire, active",
          )
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("project_training_requirements")
          .select(
            "id, project_id, training_type_id, requirement_level, renewal_lead_days, accepted_alternative_training_type_ids, applies_to_role, notes, active, created_at, updated_at",
          )
          .order("created_at", { ascending: true }),
      ]);

    if (projectResult.error) throw new Error(projectResult.error.message);
    if (employeeResult.error) throw new Error(employeeResult.error.message);
    if (trainingTypeResult.error) {
      throw new Error(trainingTypeResult.error.message);
    }
    if (requirementResult.error) {
      throw new Error(requirementResult.error.message);
    }

    const loadedProjects = (projectResult.data ?? []) as Project[];
    const loadedRoles = [
      ...new Set(
        ((employeeResult.data ?? []) as EmployeeRoleRow[])
          .map((row) => clean(row.role))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));

    setProjects(loadedProjects);
    setEmployeeRoles(loadedRoles);
    setTrainingTypes((trainingTypeResult.data ?? []) as TrainingType[]);
    setRequirements(
      (requirementResult.data ?? []).map((row) => ({
        ...(row as ProjectRequirement),
        accepted_alternative_training_type_ids:
          row.accepted_alternative_training_type_ids ?? [],
      })),
    );

    setSelectedProjectId((current) => {
      if (
        current &&
        loadedProjects.some((project) => project.id === current)
      ) {
        return current;
      }

      const firstActive =
        loadedProjects.find((project) => !isInactiveProject(project)) ??
        loadedProjects[0];

      return firstActive?.id ?? "";
    });
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
                : "Unable to load project training requirements.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const trainingTypeById = useMemo(
    () =>
      new Map(
        trainingTypes.map((trainingType) => [
          trainingType.id,
          trainingType,
        ]),
      ),
    [trainingTypes],
  );

  const visibleProjects = useMemo(() => {
    if (includeInactiveProjects) return projects;
    return projects.filter((project) => !isInactiveProject(project));
  }, [includeInactiveProjects, projects]);

  const selectedProject = selectedProjectId
    ? projectById.get(selectedProjectId) ?? null
    : null;

  const selectedProjectRequirements = useMemo(
    () =>
      requirements
        .filter(
          (requirement) =>
            requirement.project_id === selectedProjectId,
        )
        .sort((a, b) => {
          if (a.active !== b.active) return a.active === false ? 1 : -1;
          if (a.requirement_level !== b.requirement_level) {
            return a.requirement_level === "mandatory" ? -1 : 1;
          }

          const aRole = clean(a.applies_to_role) || "All personnel";
          const bRole = clean(b.applies_to_role) || "All personnel";

          if (aRole !== bRole) return aRole.localeCompare(bRole);

          return (
            trainingTypeById
              .get(a.training_type_id)
              ?.name.localeCompare(
                trainingTypeById.get(b.training_type_id)?.name ?? "",
              ) ?? 0
          );
        }),
    [requirements, selectedProjectId, trainingTypeById],
  );

  const projectRoles = useMemo(() => {
    const values = new Set(employeeRoles);

    selectedProjectRequirements.forEach((requirement) => {
      const role = clean(requirement.applies_to_role);
      if (role) values.add(role);
    });

    return [...values].sort((a, b) => a.localeCompare(b));
  }, [employeeRoles, selectedProjectRequirements]);

  const filteredRequirements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return selectedProjectRequirements.filter((requirement) => {
      const active = requirement.active !== false;
      const role = clean(requirement.applies_to_role);
      const trainingType = trainingTypeById.get(
        requirement.training_type_id,
      );

      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "archived" && active) return false;

      if (
        levelFilter !== "all" &&
        requirement.requirement_level !== levelFilter
      ) {
        return false;
      }

      if (roleFilter === "everyone" && role) return false;
      if (
        roleFilter !== "all" &&
        roleFilter !== "everyone" &&
        role !== roleFilter
      ) {
        return false;
      }

      if (!query) return true;

      const alternatives = (
        requirement.accepted_alternative_training_type_ids ?? []
      )
        .map((id) => trainingTypeById.get(id)?.name ?? "")
        .join(" ");

      return [
        trainingType?.name,
        trainingType?.category,
        role || "All personnel",
        requirement.requirement_level,
        requirement.notes,
        alternatives,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    levelFilter,
    roleFilter,
    search,
    selectedProjectRequirements,
    statusFilter,
    trainingTypeById,
  ]);

  const activeRequirements = selectedProjectRequirements.filter(
    (requirement) => requirement.active !== false,
  );
  const mandatoryCount = activeRequirements.filter(
    (requirement) => requirement.requirement_level === "mandatory",
  ).length;
  const recommendedCount = activeRequirements.filter(
    (requirement) => requirement.requirement_level === "recommended",
  ).length;
  const allPersonnelCount = activeRequirements.filter(
    (requirement) => !clean(requirement.applies_to_role),
  ).length;
  const roleSpecificCount = activeRequirements.length - allPersonnelCount;

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Project requirements refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh project requirements.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function openCreateForm(role = "") {
    if (!selectedProjectId) {
      setMessage({
        tone: "error",
        text: "Select a project before adding a requirement.",
      });
      return;
    }

    setEditingRequirement(null);
    setForm({
      ...EMPTY_FORM,
      projectId: selectedProjectId,
      appliesToRole: role,
    });
    setFormOpen(true);
    setMessage(null);
  }

  function openEditForm(requirement: ProjectRequirement) {
    setEditingRequirement(requirement);
    setForm({
      projectId: requirement.project_id,
      trainingTypeId: requirement.training_type_id,
      requirementLevel: requirement.requirement_level,
      renewalLeadDays: String(requirement.renewal_lead_days ?? 60),
      appliesToRole: clean(requirement.applies_to_role),
      acceptedAlternativeTrainingTypeIds:
        requirement.accepted_alternative_training_type_ids ?? [],
      notes: clean(requirement.notes),
      active: requirement.active !== false,
    });
    setFormOpen(true);
    setMessage(null);
  }

  function closeForm() {
    if (saving) return;

    setFormOpen(false);
    setEditingRequirement(null);
    setForm(EMPTY_FORM);
  }

  function toggleAlternative(trainingTypeId: string) {
    setForm((current) => {
      const exists =
        current.acceptedAlternativeTrainingTypeIds.includes(trainingTypeId);

      return {
        ...current,
        acceptedAlternativeTrainingTypeIds: exists
          ? current.acceptedAlternativeTrainingTypeIds.filter(
              (id) => id !== trainingTypeId,
            )
          : [
              ...current.acceptedAlternativeTrainingTypeIds,
              trainingTypeId,
            ],
      };
    });
  }

  async function saveRequirement() {
    setMessage(null);

    if (!form.projectId) {
      setMessage({ tone: "error", text: "Select a project." });
      return;
    }

    if (!form.trainingTypeId) {
      setMessage({
        tone: "error",
        text: "Select the required training type.",
      });
      return;
    }

    const leadDays = Number(form.renewalLeadDays);

    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 730) {
      setMessage({
        tone: "error",
        text: "Renewal lead days must be a whole number from 0 to 730.",
      });
      return;
    }

    const duplicate = requirements.some((requirement) => {
      if (requirement.id === editingRequirement?.id) return false;

      return (
        requirement.project_id === form.projectId &&
        requirement.training_type_id === form.trainingTypeId &&
        requirement.requirement_level === form.requirementLevel &&
        normalise(requirement.applies_to_role) ===
          normalise(form.appliesToRole) &&
        requirement.active !== false
      );
    });

    if (duplicate && form.active) {
      setMessage({
        tone: "error",
        text:
          "An active requirement already exists for this project, training type, level and role.",
      });
      return;
    }

    setSaving(true);

    const payload = {
      project_id: form.projectId,
      training_type_id: form.trainingTypeId,
      requirement_level: form.requirementLevel,
      renewal_lead_days: leadDays,
      accepted_alternative_training_type_ids:
        form.acceptedAlternativeTrainingTypeIds.filter(
          (id) => id !== form.trainingTypeId,
        ),
      applies_to_role: form.appliesToRole.trim() || null,
      notes: form.notes.trim() || null,
      active: form.active,
    };

    try {
      const result = editingRequirement
        ? await supabase
            .from("project_training_requirements")
            .update(payload)
            .eq("id", editingRequirement.id)
        : await supabase
            .from("project_training_requirements")
            .insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      closeForm();

      setMessage({
        tone: "success",
        text: editingRequirement
          ? "Project requirement updated."
          : "Project requirement added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the project requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setRequirementActive(
    requirement: ProjectRequirement,
    active: boolean,
  ) {
    setChangingStatusId(requirement.id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("project_training_requirements")
        .update({ active })
        .eq("id", requirement.id);

      if (error) throw new Error(error.message);

      await loadData();

      setMessage({
        tone: "success",
        text: active
          ? "Project requirement restored."
          : "Project requirement archived.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update the requirement status.",
      });
    } finally {
      setChangingStatusId(null);
    }
  }

  async function deleteRequirement(requirement: ProjectRequirement) {
    const trainingName =
      trainingTypeById.get(requirement.training_type_id)?.name ??
      "this requirement";

    const confirmed = window.confirm(
      `Permanently delete ${trainingName} from ${projectLabel(
        projectById.get(requirement.project_id),
      )}?`,
    );

    if (!confirmed) return;

    setDeletingId(requirement.id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("project_training_requirements")
        .delete()
        .eq("id", requirement.id);

      if (error) throw new Error(error.message);

      await loadData();

      setMessage({
        tone: "success",
        text: "Project requirement permanently deleted.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to delete the project requirement.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  function openCopyModal(sourceProjectId = selectedProjectId) {
    if (!sourceProjectId) {
      setMessage({
        tone: "error",
        text: "Select a source project first.",
      });
      return;
    }

    setCopySourceProjectId(sourceProjectId);
    setCopyTargetProjectId("");
    setReplaceTargetRequirements(false);
    setCopyModalOpen(true);
    setMessage(null);
  }

  async function copyProjectRequirements() {
    setMessage(null);

    if (!copySourceProjectId || !copyTargetProjectId) {
      setMessage({
        tone: "error",
        text: "Select both a source project and target project.",
      });
      return;
    }

    if (copySourceProjectId === copyTargetProjectId) {
      setMessage({
        tone: "error",
        text: "Source and target projects must be different.",
      });
      return;
    }

    const sourceRequirements = requirements.filter(
      (requirement) =>
        requirement.project_id === copySourceProjectId &&
        requirement.active !== false,
    );

    if (sourceRequirements.length === 0) {
      setMessage({
        tone: "error",
        text: "The source project has no active requirements to copy.",
      });
      return;
    }

    setSaving(true);

    try {
      if (replaceTargetRequirements) {
        const { error: archiveError } = await supabase
          .from("project_training_requirements")
          .update({ active: false })
          .eq("project_id", copyTargetProjectId)
          .eq("active", true);

        if (archiveError) throw new Error(archiveError.message);
      }

      const existingTargetKeys = new Set(
        requirements
          .filter(
            (requirement) =>
              requirement.project_id === copyTargetProjectId &&
              requirement.active !== false,
          )
          .map(
            (requirement) =>
              `${requirement.training_type_id}|${
                requirement.requirement_level
              }|${normalise(requirement.applies_to_role)}`,
          ),
      );

      const rows = sourceRequirements
        .filter((requirement) => {
          if (replaceTargetRequirements) return true;

          const key = `${requirement.training_type_id}|${
            requirement.requirement_level
          }|${normalise(requirement.applies_to_role)}`;

          return !existingTargetKeys.has(key);
        })
        .map((requirement) => ({
          project_id: copyTargetProjectId,
          training_type_id: requirement.training_type_id,
          requirement_level: requirement.requirement_level,
          renewal_lead_days: requirement.renewal_lead_days ?? 60,
          accepted_alternative_training_type_ids:
            requirement.accepted_alternative_training_type_ids ?? [],
          applies_to_role: requirement.applies_to_role,
          notes: requirement.notes,
          active: true,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from("project_training_requirements")
          .insert(rows);

        if (insertError) throw new Error(insertError.message);
      }

      await loadData();
      setCopyModalOpen(false);

      const sourceProject = projectById.get(copySourceProjectId);
      const targetProject = projectById.get(copyTargetProjectId);

      setMessage({
        tone: "success",
        text:
          rows.length > 0
            ? `${plural(rows.length, "requirement")} copied from ${projectLabel(
                sourceProject,
              )} to ${projectLabel(targetProject)}.`
            : "The target project already contains every active source requirement.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to copy project requirements.",
      });
    } finally {
      setSaving(false);
    }
  }

  function exportRequirements() {
    const header = [
      "Project",
      "Training Type",
      "Category",
      "Applies To",
      "Requirement Level",
      "Renewal Lead Days",
      "Accepted Alternatives",
      "Status",
      "Notes",
    ];

    const rows = filteredRequirements.map((requirement) => {
      const trainingType = trainingTypeById.get(
        requirement.training_type_id,
      );

      const alternatives = (
        requirement.accepted_alternative_training_type_ids ?? []
      )
        .map((trainingTypeId) => trainingTypeById.get(trainingTypeId)?.name)
        .filter(Boolean)
        .join("; ");

      return [
        selectedProject?.name ?? "",
        trainingType?.name ?? "Unknown training type",
        trainingType?.category ?? "",
        clean(requirement.applies_to_role) || "All personnel",
        requirement.requirement_level,
        requirement.renewal_lead_days ?? 60,
        alternatives,
        requirement.active === false ? "Archived" : "Active",
        requirement.notes ?? "",
      ];
    });

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const safeProjectName = (selectedProject?.name ?? "project")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

    const date = new Date().toISOString().slice(0, 10);

    downloadTextFile(
      `${safeProjectName}-training-requirements-${date}.csv`,
      csv,
    );
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
                Back to Training Register
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <BriefcaseBusiness size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Project Configuration
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Project Training Requirements
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Configure project-wide inductions, licences and competencies,
                then add role-specific rules where particular workers need
                additional evidence before mobilisation.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openCopyModal()}
                disabled={!selectedProjectId}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ClipboardCopy size={16} />
                Copy Project
              </button>

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
                onClick={exportRequirements}
                disabled={filteredRequirements.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => openCreateForm()}
                disabled={!selectedProjectId}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus size={16} />
                Add Requirement
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

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Project
              </label>

              <SelectField
                value={selectedProjectId}
                onChange={(value) => {
                  setSelectedProjectId(value);
                  setRoleFilter("all");
                  setSearch("");
                }}
                options={[
                  { value: "", label: "Select a project..." },
                  ...visibleProjects.map((project) => ({
                    value: project.id,
                    label: projectLabel(project),
                  })),
                ]}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setIncludeInactiveProjects((current) => !current)
              }
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                includeInactiveProjects
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {includeInactiveProjects ? (
                <CheckCircle2 size={16} />
              ) : (
                <RotateCcw size={16} />
              )}
              Include inactive projects
            </button>
          </div>
        </section>

        {!selectedProject ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
            <EmptyState
              icon={<BriefcaseBusiness size={30} />}
              title="Select a project"
              description="Choose a project above to configure its training and mobilisation rules."
            />
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Active Requirements"
                value={String(activeRequirements.length)}
                detail="Used by compliance checks"
                tone="slate"
              />
              <MetricCard
                label="Mandatory"
                value={String(mandatoryCount)}
                detail="Can block mobilisation"
                tone={mandatoryCount > 0 ? "rose" : "slate"}
              />
              <MetricCard
                label="Recommended"
                value={String(recommendedCount)}
                detail="Advisory requirements"
                tone={recommendedCount > 0 ? "sky" : "slate"}
              />
              <MetricCard
                label="All Personnel"
                value={String(allPersonnelCount)}
                detail="Applies project-wide"
                tone="emerald"
              />
              <MetricCard
                label="Role Specific"
                value={String(roleSpecificCount)}
                detail="Applies to selected roles"
                tone="amber"
              />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-slate-500">
                <Filter size={17} />
                <span className="text-sm font-semibold">Filters</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_240px]">
                <label className="relative block">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search training, category, role or notes..."
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
                  />
                </label>

                <SelectField
                  value={statusFilter}
                  onChange={(value) =>
                    setStatusFilter(value as StatusFilter)
                  }
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "active", label: "Active only" },
                    { value: "archived", label: "Archived only" },
                  ]}
                />

                <SelectField
                  value={levelFilter}
                  onChange={(value) =>
                    setLevelFilter(value as LevelFilter)
                  }
                  options={[
                    { value: "all", label: "All levels" },
                    { value: "mandatory", label: "Mandatory" },
                    { value: "recommended", label: "Recommended" },
                  ]}
                />

                <SelectField
                  value={roleFilter}
                  onChange={(value) => setRoleFilter(value as RoleFilter)}
                  options={[
                    { value: "all", label: "All personnel and roles" },
                    { value: "everyone", label: "All personnel only" },
                    ...projectRoles.map((role) => ({
                      value: role,
                      label: role,
                    })),
                  ]}
                />
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.65fr)]">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      {projectLabel(selectedProject)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {plural(filteredRequirements.length, "requirement")} match
                      the current filters.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openCreateForm()}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    <Plus size={15} />
                    Add Requirement
                  </button>
                </div>

                {filteredRequirements.length === 0 ? (
                  <div className="p-10">
                    <EmptyState
                      icon={<GraduationCap size={28} />}
                      title="No matching requirements"
                      description="Change the filters or add the first training requirement for this project."
                      actionLabel="Add requirement"
                      onAction={() => openCreateForm()}
                    />
                  </div>
                ) : (
                  <div className="space-y-3 p-5">
                    {filteredRequirements.map((requirement) => (
                      <RequirementCard
                        key={requirement.id}
                        requirement={requirement}
                        trainingType={trainingTypeById.get(
                          requirement.training_type_id,
                        )}
                        alternatives={(
                          requirement.accepted_alternative_training_type_ids ??
                          []
                        )
                          .map((id) => trainingTypeById.get(id))
                          .filter(
                            (
                              item,
                            ): item is TrainingType => Boolean(item),
                          )}
                        deleting={deletingId === requirement.id}
                        changingStatus={
                          changingStatusId === requirement.id
                        }
                        onEdit={() => openEditForm(requirement)}
                        onArchive={() =>
                          void setRequirementActive(requirement, false)
                        }
                        onRestore={() =>
                          void setRequirementActive(requirement, true)
                        }
                        onDelete={() =>
                          void deleteRequirement(requirement)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-lg font-bold text-slate-950">
                      Quick Add by Role
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Create a requirement already scoped to a role.
                    </p>
                  </div>

                  <div className="space-y-2 p-4">
                    <button
                      type="button"
                      onClick={() => openCreateForm("")}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-bold text-slate-950">
                          All Personnel
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Applies to everyone on the project
                        </div>
                      </div>
                      <Plus size={17} className="text-slate-400" />
                    </button>

                    {projectRoles.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => openCreateForm(role)}
                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-bold text-slate-950">
                            {role}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Role-specific project rule
                          </div>
                        </div>
                        <Plus size={17} className="text-slate-400" />
                      </button>
                    ))}

                    {projectRoles.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        Employee roles will appear here once they are recorded
                        against active employees.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-blue-900">
                    <ShieldCheck size={18} />
                    <h3 className="font-bold">How these rules work</h3>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-blue-800">
                    Project rules are combined with each employee&apos;s role
                    requirements. Project rules take priority where the same
                    training type and requirement level apply.
                  </p>

                  <p className="mt-3 text-sm leading-6 text-blue-800">
                    Mandatory missing, expired, revoked or incomplete evidence
                    blocks mobilisation. Recommended requirements are shown but
                    do not block readiness.
                  </p>
                </section>
              </div>
            </section>
          </>
        )}
      </div>

      {formOpen ? (
        <RequirementModal
          form={form}
          setForm={setForm}
          editingRequirement={editingRequirement}
          projects={projects}
          trainingTypes={trainingTypes}
          roles={employeeRoles}
          saving={saving}
          onToggleAlternative={toggleAlternative}
          onClose={closeForm}
          onSave={() => void saveRequirement()}
        />
      ) : null}

      {copyModalOpen ? (
        <CopyProjectModal
          projects={projects}
          sourceProjectId={copySourceProjectId}
          targetProjectId={copyTargetProjectId}
          replaceTargetRequirements={replaceTargetRequirements}
          saving={saving}
          onSourceChange={setCopySourceProjectId}
          onTargetChange={setCopyTargetProjectId}
          onReplaceChange={setReplaceTargetRequirements}
          onClose={() => {
            if (saving) return;
            setCopyModalOpen(false);
          }}
          onCopy={() => void copyProjectRequirements()}
        />
      ) : null}
    </AppShell>
  );
}

function RequirementCard({
  requirement,
  trainingType,
  alternatives,
  deleting,
  changingStatus,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  requirement: ProjectRequirement;
  trainingType: TrainingType | undefined;
  alternatives: TrainingType[];
  deleting: boolean;
  changingStatus: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const active = requirement.active !== false;

  return (
    <article
      className={`rounded-2xl border p-5 ${
        active
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-slate-50 opacity-75"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-950">
              {trainingType?.name ?? "Unknown training type"}
            </h3>

            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${requirementLevelClasses(
                requirement.requirement_level,
              )}`}
            >
              {requirement.requirement_level === "mandatory"
                ? "Mandatory"
                : "Recommended"}
            </span>

            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-100 text-slate-600"
              }`}
            >
              {active ? "Active" : "Archived"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>{trainingType?.category || "Uncategorised"}</span>
            <span>
              Applies to:{" "}
              <strong className="text-slate-700">
                {clean(requirement.applies_to_role) || "All personnel"}
              </strong>
            </span>
            <span>
              Renewal lead:{" "}
              <strong className="text-slate-700">
                {requirement.renewal_lead_days ?? 60} days
              </strong>
            </span>
          </div>

          {alternatives.length > 0 ? (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Accepted alternatives
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {alternatives.map((alternative) => (
                  <span
                    key={alternative.id}
                    className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"
                  >
                    {alternative.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {requirement.notes ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-600">
              {requirement.notes}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Edit3 size={15} />
            Edit
          </button>

          {active ? (
            <button
              type="button"
              onClick={onArchive}
              disabled={changingStatus}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              {changingStatus ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RotateCcw size={15} />
              )}
              Archive
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestore}
              disabled={changingStatus}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              {changingStatus ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RotateCcw size={15} />
              )}
              Restore
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Trash2 size={15} />
            )}
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function RequirementModal({
  form,
  setForm,
  editingRequirement,
  projects,
  trainingTypes,
  roles,
  saving,
  onToggleAlternative,
  onClose,
  onSave,
}: {
  form: RequirementForm;
  setForm: React.Dispatch<React.SetStateAction<RequirementForm>>;
  editingRequirement: ProjectRequirement | null;
  projects: Project[];
  trainingTypes: TrainingType[];
  roles: string[];
  saving: boolean;
  onToggleAlternative: (trainingTypeId: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const activeTrainingTypes = trainingTypes.filter(
    (trainingType) =>
      trainingType.active !== false ||
      trainingType.id === form.trainingTypeId ||
      form.acceptedAlternativeTrainingTypeIds.includes(trainingType.id),
  );

  const alternativeTypes = activeTrainingTypes.filter(
    (trainingType) => trainingType.id !== form.trainingTypeId,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {editingRequirement
                ? "Edit Project Requirement"
                : "Add Project Requirement"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Configure who the requirement applies to and what alternatives
              may satisfy it.
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

        <div className="space-y-6 p-6">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Requirement Details
            </h3>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Project">
                <SelectField
                  value={form.projectId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      projectId: value,
                    }))
                  }
                  options={[
                    { value: "", label: "Select project..." },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: projectLabel(project),
                    })),
                  ]}
                />
              </Field>

              <Field label="Training type">
                <SelectField
                  value={form.trainingTypeId}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      trainingTypeId: value,
                      acceptedAlternativeTrainingTypeIds:
                        current.acceptedAlternativeTrainingTypeIds.filter(
                          (id) => id !== value,
                        ),
                    }))
                  }
                  options={[
                    { value: "", label: "Select training type..." },
                    ...activeTrainingTypes.map((trainingType) => ({
                      value: trainingType.id,
                      label: `${trainingType.name}${
                        trainingType.category
                          ? ` — ${trainingType.category}`
                          : ""
                      }`,
                    })),
                  ]}
                />
              </Field>

              <Field label="Requirement level">
                <SelectField
                  value={form.requirementLevel}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      requirementLevel: value as
                        | "mandatory"
                        | "recommended",
                    }))
                  }
                  options={[
                    { value: "mandatory", label: "Mandatory" },
                    { value: "recommended", label: "Recommended" },
                  ]}
                />
              </Field>

              <Field label="Applies to role">
                <SelectField
                  value={form.appliesToRole}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      appliesToRole: value,
                    }))
                  }
                  options={[
                    { value: "", label: "All personnel" },
                    ...roles.map((role) => ({
                      value: role,
                      label: role,
                    })),
                  ]}
                />
              </Field>

              <Field label="Renewal lead days">
                <input
                  type="number"
                  min={0}
                  max={730}
                  step={1}
                  value={form.renewalLeadDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      renewalLeadDays: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
                />
              </Field>

              <Field label="Status">
                <SelectField
                  value={form.active ? "active" : "archived"}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      active: value === "active",
                    }))
                  }
                  options={[
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" },
                  ]}
                />
              </Field>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
              Accepted Alternatives
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Select any other training types that should satisfy this
              requirement in Project Compliance.
            </p>

            {alternativeTypes.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No alternative training types are available.
              </div>
            ) : (
              <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 sm:grid-cols-2">
                {alternativeTypes.map((trainingType) => {
                  const checked =
                    form.acceptedAlternativeTrainingTypeIds.includes(
                      trainingType.id,
                    );

                  return (
                    <label
                      key={trainingType.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                        checked
                          ? "border-sky-300 bg-sky-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onToggleAlternative(trainingType.id)
                        }
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />

                      <span>
                        <span className="block text-sm font-bold text-slate-900">
                          {trainingType.name}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {trainingType.category || "Uncategorised"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <Field label="Notes">
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Project-specific interpretation, client condition or operational note"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
            />
          </Field>

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
              {editingRequirement ? "Save Changes" : "Add Requirement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyProjectModal({
  projects,
  sourceProjectId,
  targetProjectId,
  replaceTargetRequirements,
  saving,
  onSourceChange,
  onTargetChange,
  onReplaceChange,
  onClose,
  onCopy,
}: {
  projects: Project[];
  sourceProjectId: string;
  targetProjectId: string;
  replaceTargetRequirements: boolean;
  saving: boolean;
  onSourceChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onReplaceChange: (value: boolean) => void;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Copy Project Requirements
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Copy every active requirement from one project to another.
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

        <div className="space-y-5 p-6">
          <Field label="Source project">
            <SelectField
              value={sourceProjectId}
              onChange={onSourceChange}
              options={[
                { value: "", label: "Select source project..." },
                ...projects.map((project) => ({
                  value: project.id,
                  label: projectLabel(project),
                })),
              ]}
            />
          </Field>

          <Field label="Target project">
            <SelectField
              value={targetProjectId}
              onChange={onTargetChange}
              options={[
                { value: "", label: "Select target project..." },
                ...projects
                  .filter((project) => project.id !== sourceProjectId)
                  .map((project) => ({
                    value: project.id,
                    label: projectLabel(project),
                  })),
              ]}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={replaceTargetRequirements}
              onChange={(event) =>
                onReplaceChange(event.target.checked)
              }
              className="mt-1 h-4 w-4 rounded border-amber-300"
            />

            <span>
              <span className="block text-sm font-bold text-amber-900">
                Replace active target requirements
              </span>
              <span className="mt-1 block text-xs leading-5 text-amber-800">
                Existing active requirements on the target project will be
                archived before the source requirements are copied.
              </span>
            </span>
          </label>

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
              onClick={onCopy}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ClipboardCopy size={16} />
              )}
              Copy Requirements
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "rose" | "amber" | "sky" | "slate";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : tone === "sky"
            ? "border-sky-200 bg-sky-50 text-sky-800"
            : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs opacity-70">{detail}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
        {icon}
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {description}
      </p>

      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          {actionLabel}
        </button>
      ) : null}
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
      <span className="mb-2 block text-sm font-semibold text-slate-700">
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
          <option
            key={`${option.value}-${option.label}`}
            value={option.value}
          >
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
