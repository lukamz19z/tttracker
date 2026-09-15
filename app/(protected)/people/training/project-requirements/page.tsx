"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  Edit3,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import { normaliseTrainingRole } from "@/lib/training/compliance";

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type EmployeeRole = {
  role: string | null;
};

type TrainingType = {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  active: boolean | null;
};

type Requirement = {
  id: string;
  project_id: string;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number | null;
  accepted_alternative_training_type_ids: string[] | null;
  required_option_codes: string[] | null;
  applies_to_role: string | null;
  notes: string | null;
  active: boolean | null;
};

type FormState = {
  projectId: string;
  trainingTypeId: string;
  requirementLevel: "mandatory" | "recommended";
  renewalLeadDays: string;
  appliesToRole: string;
  acceptedAlternativeTrainingTypeIds: string[];
  requiredOptionCodes: string[];
  notes: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  projectId: "",
  trainingTypeId: "",
  requirementLevel: "mandatory",
  renewalLeadDays: "60",
  appliesToRole: "",
  acceptedAlternativeTrainingTypeIds: [],
  requiredOptionCodes: [],
  notes: "",
  active: true,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function projectLabel(project?: Project | null) {
  if (!project) return "Unknown project";
  return project.project_number
    ? `${project.project_number} · ${project.name}`
    : project.name;
}

function isInactiveProject(project: Project) {
  return ["completed", "closed", "archived", "inactive"].includes(
    clean(project.status).toLowerCase(),
  );
}

export default function ProjectTrainingRequirementsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [includeInactiveProjects, setIncludeInactiveProjects] =
    useState(false);

  const [editing, setEditing] = useState<Requirement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetProjectId, setCopyTargetProjectId] = useState("");
  const [replaceTarget, setReplaceTarget] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [
      projectResult,
      roleResult,
      typeResult,
      optionResult,
      requirementResult,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,project_number,status")
        .order("name"),
      supabase
        .from("employees")
        .select("role")
        .eq("active", true),
      supabase
        .from("training_types")
        .select("id,name,short_code,category,active")
        .eq("active", true)
        .order("category")
        .order("name"),
      supabase
        .from("training_type_options")
        .select("id,training_type_id,name,code,active")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("project_training_requirements")
        .select(
          "id,project_id,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,applies_to_role,notes,active",
        )
        .order("project_id"),
    ]);

    const firstError = [
      projectResult.error,
      roleResult.error,
      typeResult.error,
      optionResult.error,
      requirementResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    const loadedProjects = (projectResult.data ?? []) as Project[];

    setProjects(loadedProjects);
    setRoles(
      Array.from(
        new Set(
          ((roleResult.data ?? []) as EmployeeRole[])
            .map((row) => clean(row.role))
            .filter(Boolean),
        ),
      ).sort(),
    );
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setOptions((optionResult.data ?? []) as TrainingOption[]);
    setRequirements(
      (requirementResult.data ?? []) as Requirement[],
    );

    setSelectedProjectId((current) => {
      if (
        current &&
        loadedProjects.some((project) => project.id === current)
      ) {
        return current;
      }

      return (
        loadedProjects.find((project) => !isInactiveProject(project))
          ?.id ??
        loadedProjects[0]?.id ??
        ""
      );
    });
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
              : "Unable to load Project Training Requirements.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const typeById = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );

  const selectedProject = projectById.get(selectedProjectId);

  const visibleProjects = useMemo(
    () =>
      includeInactiveProjects
        ? projects
        : projects.filter((project) => !isInactiveProject(project)),
    [includeInactiveProjects, projects],
  );

  const selectedRequirements = useMemo(
    () =>
      requirements
        .filter(
          (requirement) =>
            requirement.project_id === selectedProjectId &&
            (showArchived || requirement.active !== false),
        )
        .sort((a, b) => {
          if (a.active !== b.active) return a.active === false ? 1 : -1;
          if (a.requirement_level !== b.requirement_level) {
            return a.requirement_level === "mandatory" ? -1 : 1;
          }

          return (
            typeById
              .get(a.training_type_id)
              ?.name.localeCompare(
                typeById.get(b.training_type_id)?.name ?? "",
              ) ?? 0
          );
        }),
    [
      requirements,
      selectedProjectId,
      showArchived,
      typeById,
    ],
  );

  const typeOptions = useMemo(
    () =>
      options.filter(
        (option) => option.training_type_id === form.trainingTypeId,
      ),
    [form.trainingTypeId, options],
  );

  function openNew() {
    if (!selectedProjectId) return;

    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      projectId: selectedProjectId,
    });
    setFormOpen(true);
    setMessage(null);
  }

  function openEdit(requirement: Requirement) {
    setEditing(requirement);
    setForm({
      projectId: requirement.project_id,
      trainingTypeId: requirement.training_type_id,
      requirementLevel: requirement.requirement_level,
      renewalLeadDays: String(
        requirement.renewal_lead_days ?? 60,
      ),
      appliesToRole: clean(requirement.applies_to_role),
      acceptedAlternativeTrainingTypeIds:
        requirement.accepted_alternative_training_type_ids ?? [],
      requiredOptionCodes: requirement.required_option_codes ?? [],
      notes: clean(requirement.notes),
      active: requirement.active !== false,
    });
    setFormOpen(true);
    setMessage(null);
  }

  function toggleAlternative(id: string) {
    setForm((current) => ({
      ...current,
      acceptedAlternativeTrainingTypeIds:
        current.acceptedAlternativeTrainingTypeIds.includes(id)
          ? current.acceptedAlternativeTrainingTypeIds.filter(
              (item) => item !== id,
            )
          : [...current.acceptedAlternativeTrainingTypeIds, id],
    }));
  }

  function toggleRequiredOption(code: string) {
    setForm((current) => ({
      ...current,
      requiredOptionCodes: current.requiredOptionCodes.includes(code)
        ? current.requiredOptionCodes.filter((item) => item !== code)
        : [...current.requiredOptionCodes, code],
    }));
  }

  async function saveRequirement() {
    setMessage(null);

    if (!form.projectId || !form.trainingTypeId) {
      setMessage({
        tone: "error",
        text: "Select a project and Training type.",
      });
      return;
    }

    const leadDays = Number(form.renewalLeadDays);
    if (
      !Number.isInteger(leadDays) ||
      leadDays < 0 ||
      leadDays > 730
    ) {
      setMessage({
        tone: "error",
        text: "Renewal lead days must be between 0 and 730.",
      });
      return;
    }

    const duplicate = requirements.some(
      (requirement) =>
        requirement.id !== editing?.id &&
        requirement.project_id === form.projectId &&
        requirement.training_type_id === form.trainingTypeId &&
        normaliseTrainingRole(requirement.applies_to_role) ===
          normaliseTrainingRole(form.appliesToRole) &&
        requirement.active !== false,
    );

    if (duplicate && form.active) {
      setMessage({
        tone: "error",
        text:
          "An active requirement already exists for this project, Training type and role.",
      });
      return;
    }

    setSaving(true);

    const payload = {
      project_id: form.projectId,
      training_type_id: form.trainingTypeId,
      requirement_level: form.requirementLevel,
      renewal_lead_days: leadDays,
      applies_to_role: clean(form.appliesToRole) || null,
      accepted_alternative_training_type_ids:
        form.acceptedAlternativeTrainingTypeIds.filter(
          (id) => id !== form.trainingTypeId,
        ),
      required_option_codes: form.requiredOptionCodes,
      notes: clean(form.notes) || null,
      active: form.active,
    };

    try {
      const result = editing
        ? await supabase
            .from("project_training_requirements")
            .update(payload)
            .eq("id", editing.id)
        : await supabase
            .from("project_training_requirements")
            .insert(payload);

      if (result.error) throw new Error(result.error.message);

      await loadData();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setMessage({
        tone: "success",
        text: editing
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
    requirement: Requirement,
    active: boolean,
  ) {
    setSaving(true);
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
          ? "Requirement restored."
          : "Requirement archived.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update the requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRequirement(requirement: Requirement) {
    if (
      !window.confirm(
        `Permanently delete ${
          typeById.get(requirement.training_type_id)?.name ??
          "this requirement"
        }?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_training_requirements")
        .delete()
        .eq("id", requirement.id);

      if (error) throw new Error(error.message);

      await loadData();
      setMessage({
        tone: "success",
        text: "Requirement deleted.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to delete the requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyRequirements() {
    if (!selectedProjectId || !copyTargetProjectId) {
      setMessage({
        tone: "error",
        text: "Select a target project.",
      });
      return;
    }

    if (selectedProjectId === copyTargetProjectId) {
      setMessage({
        tone: "error",
        text: "Source and target projects must be different.",
      });
      return;
    }

    const source = requirements.filter(
      (requirement) =>
        requirement.project_id === selectedProjectId &&
        requirement.active !== false,
    );

    if (source.length === 0) {
      setMessage({
        tone: "error",
        text: "The source project has no active requirements.",
      });
      return;
    }

    setSaving(true);

    try {
      if (replaceTarget) {
        const { error } = await supabase
          .from("project_training_requirements")
          .update({ active: false })
          .eq("project_id", copyTargetProjectId)
          .eq("active", true);

        if (error) throw new Error(error.message);
      }

      const existingKeys = new Set(
        requirements
          .filter(
            (requirement) =>
              requirement.project_id === copyTargetProjectId &&
              requirement.active !== false,
          )
          .map(
            (requirement) =>
              `${requirement.training_type_id}|${normaliseTrainingRole(
                requirement.applies_to_role,
              )}`,
          ),
      );

      const rows = source
        .filter(
          (requirement) =>
            replaceTarget ||
            !existingKeys.has(
              `${requirement.training_type_id}|${normaliseTrainingRole(
                requirement.applies_to_role,
              )}`,
            ),
        )
        .map((requirement) => ({
          project_id: copyTargetProjectId,
          training_type_id: requirement.training_type_id,
          requirement_level: requirement.requirement_level,
          renewal_lead_days:
            requirement.renewal_lead_days ?? 60,
          accepted_alternative_training_type_ids:
            requirement.accepted_alternative_training_type_ids ?? [],
          required_option_codes:
            requirement.required_option_codes ?? [],
          applies_to_role: requirement.applies_to_role,
          notes: requirement.notes,
          active: true,
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("project_training_requirements")
          .insert(rows);

        if (error) throw new Error(error.message);
      }

      await loadData();
      setCopyOpen(false);
      setCopyTargetProjectId("");
      setReplaceTarget(false);
      setMessage({
        tone: "success",
        text: `${rows.length} requirement${
          rows.length === 1 ? "" : "s"
        } copied.`,
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

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <Link
          href="/people/training"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700"
        >
          <ArrowLeft size={16} />
          Back to Training
        </Link>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <ListChecks size={17} />
                Project compliance rules
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Project Training Requirements
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Define project-wide and role-specific requirements. Required
                option codes can be used for class-specific licences or VOCs.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCopyOpen(true)}
                disabled={!selectedProjectId}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <ClipboardCopy size={16} />
                Copy Project
              </button>
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              <button
                type="button"
                onClick={openNew}
                disabled={!selectedProjectId}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                <Plus size={16} />
                Add Requirement
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label>
              <span className="mb-2 block text-sm font-black text-slate-700">
                Project
              </span>
              <select
                className={inputClass}
                value={selectedProjectId}
                onChange={(event) =>
                  setSelectedProjectId(event.target.value)
                }
              >
                <option value="">Select project...</option>
                {visibleProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {projectLabel(project)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) =>
                  setShowArchived(event.target.checked)
                }
              />
              Show archived
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={includeInactiveProjects}
                onChange={(event) =>
                  setIncludeInactiveProjects(event.target.checked)
                }
              />
              Inactive projects
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="font-black text-slate-950">
              {selectedProject
                ? projectLabel(selectedProject)
                : "Select a project"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {selectedRequirements.length} requirement
              {selectedRequirements.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {selectedRequirements.map((requirement) => {
              const type = typeById.get(requirement.training_type_id);

              return (
                <div
                  key={requirement.id}
                  className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-950">
                        {type?.name ?? "Unknown Training type"}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                          requirement.requirement_level === "mandatory"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-sky-200 bg-sky-50 text-sky-700"
                        }`}
                      >
                        {requirement.requirement_level}
                      </span>
                      {requirement.active === false ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {clean(requirement.applies_to_role) ||
                        "All project personnel"}
                    </div>
                  </div>

                  <div className="text-sm text-slate-600">
                    <div>
                      Renewal lead:{" "}
                      <strong>
                        {requirement.renewal_lead_days ?? 60} days
                      </strong>
                    </div>
                    {requirement.required_option_codes?.length ? (
                      <div className="mt-1">
                        Required classes:{" "}
                        <strong>
                          {requirement.required_option_codes.join(", ")}
                        </strong>
                      </div>
                    ) : null}
                    {requirement.accepted_alternative_training_type_ids
                      ?.length ? (
                      <div className="mt-1">
                        Alternatives:{" "}
                        <strong>
                          {requirement.accepted_alternative_training_type_ids
                            .map((id) => typeById.get(id)?.name)
                            .filter(Boolean)
                            .join(", ")}
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(requirement)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
                    >
                      <Edit3 size={15} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setRequirementActive(
                          requirement,
                          requirement.active === false,
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
                    >
                      <RotateCcw size={15} />
                      {requirement.active === false
                        ? "Restore"
                        : "Archive"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void deleteRequirement(requirement)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700"
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            {selectedRequirements.length === 0 ? (
              <div className="p-10 text-center text-sm font-semibold text-slate-500">
                No requirements are configured for this project.
              </div>
            ) : null}
          </div>
        </section>

        {formOpen ? (
          <Modal
            title={editing ? "Edit Project Requirement" : "Add Project Requirement"}
            onClose={() => !saving && setFormOpen(false)}
          >
            <div className="space-y-4">
              <Field label="Training Type">
                <select
                  className={inputClass}
                  value={form.trainingTypeId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      trainingTypeId: event.target.value,
                      requiredOptionCodes: [],
                    }))
                  }
                >
                  <option value="">Select Training type...</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Requirement Level">
                  <select
                    className={inputClass}
                    value={form.requirementLevel}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        requirementLevel: event.target.value as
                          | "mandatory"
                          | "recommended",
                      }))
                    }
                  >
                    <option value="mandatory">Mandatory</option>
                    <option value="recommended">Recommended</option>
                  </select>
                </Field>

                <Field label="Renewal Lead Days">
                  <input
                    type="number"
                    min={0}
                    max={730}
                    className={inputClass}
                    value={form.renewalLeadDays}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        renewalLeadDays: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              <Field label="Applies To Role">
                <select
                  className={inputClass}
                  value={form.appliesToRole}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      appliesToRole: event.target.value,
                    }))
                  }
                >
                  <option value="">All project personnel</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </Field>

              {typeOptions.length > 0 ? (
                <Field label="Required Classes / Options">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {typeOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={form.requiredOptionCodes.includes(
                            option.code,
                          )}
                          onChange={() =>
                            toggleRequiredOption(option.code)
                          }
                        />
                        {option.name} ({option.code})
                      </label>
                    ))}
                  </div>
                </Field>
              ) : null}

              <Field label="Accepted Alternative Training Types">
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
                  {types
                    .filter(
                      (type) => type.id !== form.trainingTypeId,
                    )
                    .map((type) => (
                      <label
                        key={type.id}
                        className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={form.acceptedAlternativeTrainingTypeIds.includes(
                            type.id,
                          )}
                          onChange={() => toggleAlternative(type.id)}
                        />
                        {type.name}
                      </label>
                    ))}
                </div>
              </Field>

              <Field label="Notes">
                <textarea
                  className={`${inputClass} min-h-24`}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </Field>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />
                Active requirement
              </label>

              <button
                type="button"
                onClick={() => void saveRequirement()}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Save Requirement
              </button>
            </div>
          </Modal>
        ) : null}

        {copyOpen ? (
          <Modal
            title="Copy Project Requirements"
            onClose={() => !saving && setCopyOpen(false)}
          >
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Source: <strong>{projectLabel(selectedProject)}</strong>
              </div>

              <Field label="Target Project">
                <select
                  className={inputClass}
                  value={copyTargetProjectId}
                  onChange={(event) =>
                    setCopyTargetProjectId(event.target.value)
                  }
                >
                  <option value="">Select target...</option>
                  {projects
                    .filter(
                      (project) => project.id !== selectedProjectId,
                    )
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {projectLabel(project)}
                      </option>
                    ))}
                </select>
              </Field>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={replaceTarget}
                  onChange={(event) =>
                    setReplaceTarget(event.target.checked)
                  }
                />
                Archive existing target requirements before copying
              </label>

              <button
                type="button"
                onClick={() => void copyRequirements()}
                disabled={saving || !copyTargetProjectId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ClipboardCopy size={16} />
                )}
                Copy Requirements
              </button>
            </div>
          </Modal>
        ) : null}
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600"
          >
            Close
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
