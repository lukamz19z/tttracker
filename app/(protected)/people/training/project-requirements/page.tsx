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
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";


type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  active: boolean | null;
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

type ProjectRole = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number | null;
  active: boolean | null;
};

type ProjectRoleAssignment = {
  id: string;
  project_role_id: string;
  employee_id: string;
};

type Requirement = {
  id: string;
  project_id: string;
  project_role_id: string | null;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number | null;
  accepted_alternative_training_type_ids: string[] | null;
  required_option_codes: string[] | null;
  applies_to_role: string | null;
  notes: string | null;
  active: boolean | null;
};

type RequirementForm = {
  projectId: string;
  projectRoleId: string;
  trainingTypeId: string;
  requirementLevel: "mandatory" | "recommended";
  renewalLeadDays: string;
  acceptedAlternativeTrainingTypeIds: string[];
  requiredOptionCodes: string[];
  notes: string;
  active: boolean;
};

type RoleForm = {
  name: string;
  description: string;
  active: boolean;
};

const EMPTY_REQUIREMENT: RequirementForm = {
  projectId: "",
  projectRoleId: "",
  trainingTypeId: "",
  requirementLevel: "mandatory",
  renewalLeadDays: "60",
  acceptedAlternativeTrainingTypeIds: [],
  requiredOptionCodes: [],
  notes: "",
  active: true,
};

const EMPTY_ROLE: RoleForm = {
  name: "",
  description: "",
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<ProjectRoleAssignment[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [includeInactiveProjects, setIncludeInactiveProjects] = useState(false);

  const [requirementOpen, setRequirementOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [requirementForm, setRequirementForm] = useState<RequirementForm>(EMPTY_REQUIREMENT);

  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ProjectRole | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(EMPTY_ROLE);

  const [assignRole, setAssignRole] = useState<ProjectRole | null>(null);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSelection, setAssignmentSelection] = useState<string[]>([]);

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
      employeeResult,
      typeResult,
      optionResult,
      roleResult,
      assignmentResult,
      requirementResult,
    ] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,project_number,status")
        .order("name"),
      supabase
        .from("employees")
        .select("id,payroll_id,full_name,role,active")
        .eq("active", true)
        .order("full_name"),
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
        .from("project_training_roles")
        .select("id,project_id,name,description,sort_order,active")
        .order("sort_order")
        .order("name"),
      supabase
        .from("project_training_role_assignments")
        .select("id,project_role_id,employee_id"),
      supabase
        .from("project_training_requirements")
        .select(
          "id,project_id,project_role_id,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,applies_to_role,notes,active",
        )
        .order("project_id"),
    ]);

    const firstError = [
      projectResult.error,
      employeeResult.error,
      typeResult.error,
      optionResult.error,
      roleResult.error,
      assignmentResult.error,
      requirementResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    const loadedProjects = (projectResult.data ?? []) as Project[];
    setProjects(loadedProjects);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setOptions((optionResult.data ?? []) as TrainingOption[]);
    setProjectRoles((roleResult.data ?? []) as ProjectRole[]);
    setRoleAssignments(
      (assignmentResult.data ?? []) as ProjectRoleAssignment[],
    );
    setRequirements((requirementResult.data ?? []) as Requirement[]);

    setSelectedProjectId((current) => {
      if (current && loadedProjects.some((project) => project.id === current)) {
        return current;
      }
      return (
        loadedProjects.find((project) => !isInactiveProject(project))?.id ??
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
  const roleById = useMemo(
    () => new Map(projectRoles.map((role) => [role.id, role])),
    [projectRoles],
  );
  const selectedProject = projectById.get(selectedProjectId);
  const visibleProjects = useMemo(
    () =>
      includeInactiveProjects
        ? projects
        : projects.filter((project) => !isInactiveProject(project)),
    [includeInactiveProjects, projects],
  );

  const selectedRoles = useMemo(
    () =>
      projectRoles
        .filter(
          (role) =>
            role.project_id === selectedProjectId &&
            (showArchived || role.active !== false),
        )
        .sort(
          (a, b) =>
            Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100) ||
            a.name.localeCompare(b.name),
        ),
    [projectRoles, selectedProjectId, showArchived],
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
          const roleA = clean(a.project_role_id ? roleById.get(a.project_role_id)?.name : "");
          const roleB = clean(b.project_role_id ? roleById.get(b.project_role_id)?.name : "");
          if (roleA !== roleB) return roleA.localeCompare(roleB);
          if (a.requirement_level !== b.requirement_level) {
            return a.requirement_level === "mandatory" ? -1 : 1;
          }
          return (
            typeById.get(a.training_type_id)?.name.localeCompare(
              typeById.get(b.training_type_id)?.name ?? "",
            ) ?? 0
          );
        }),
    [requirements, roleById, selectedProjectId, showArchived, typeById],
  );

  const typeOptions = useMemo(
    () =>
      options.filter(
        (option) => option.training_type_id === requirementForm.trainingTypeId,
      ),
    [options, requirementForm.trainingTypeId],
  );

  const assignmentFilteredEmployees = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.full_name, employee.payroll_id, employee.role]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [assignmentSearch, employees]);

  function roleAssignmentCount(roleId: string) {
    return roleAssignments.filter((row) => row.project_role_id === roleId).length;
  }

  function roleRequirementCount(roleId: string) {
    return requirements.filter(
      (row) => row.project_role_id === roleId && row.active !== false,
    ).length;
  }

  function openNewRole() {
    if (!selectedProjectId) return;
    setEditingRole(null);
    setRoleForm(EMPTY_ROLE);
    setRoleOpen(true);
    setMessage(null);
  }

  function openEditRole(role: ProjectRole) {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: clean(role.description),
      active: role.active !== false,
    });
    setRoleOpen(true);
    setMessage(null);
  }

  async function saveRole() {
    if (!selectedProjectId || !clean(roleForm.name)) {
      setMessage({ tone: "error", text: "Enter a project role name." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = {
        project_id: selectedProjectId,
        name: clean(roleForm.name),
        description: clean(roleForm.description) || null,
        active: roleForm.active,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      const result = editingRole
        ? await supabase
            .from("project_training_roles")
            .update(payload)
            .eq("id", editingRole.id)
        : await supabase.from("project_training_roles").insert({
            ...payload,
            created_by: user?.id ?? null,
          });

      if (result.error) throw new Error(result.error.message);
      await loadData();
      setRoleOpen(false);
      setEditingRole(null);
      setRoleForm(EMPTY_ROLE);
      setMessage({
        tone: "success",
        text: editingRole ? "Project role updated." : "Project role created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save project role.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setRoleActive(role: ProjectRole, active: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_training_roles")
        .update({ active, updated_at: new Date().toISOString() })
        .eq("id", role.id);
      if (error) throw new Error(error.message);
      await loadData();
      setMessage({
        tone: "success",
        text: active ? "Project role restored." : "Project role archived.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update project role.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: ProjectRole) {
    const count = roleRequirementCount(role.id);
    const confirmed = window.confirm(
      count > 0
        ? `Delete project role "${role.name}" and its ${count} linked requirement${count === 1 ? "" : "s"}?`
        : `Delete project role "${role.name}"?`,
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_training_roles")
        .delete()
        .eq("id", role.id);
      if (error) throw new Error(error.message);
      await loadData();
      setMessage({ tone: "success", text: "Project role deleted." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to delete project role.",
      });
    } finally {
      setSaving(false);
    }
  }

  function openAssignments(role: ProjectRole) {
    setAssignRole(role);
    setAssignmentSearch("");
    setAssignmentSelection(
      roleAssignments
        .filter((row) => row.project_role_id === role.id)
        .map((row) => row.employee_id),
    );
  }

  function toggleAssignment(employeeId: string) {
    setAssignmentSelection((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  }

  async function saveAssignments() {
    if (!assignRole) return;
    setSaving(true);
    setMessage(null);

    try {
      const existing = roleAssignments.filter(
        (row) => row.project_role_id === assignRole.id,
      );
      const existingIds = new Set(existing.map((row) => row.employee_id));
      const selectedIds = new Set(assignmentSelection);
      const removeIds = existing
        .filter((row) => !selectedIds.has(row.employee_id))
        .map((row) => row.id);
      const addEmployeeIds = assignmentSelection.filter(
        (employeeId) => !existingIds.has(employeeId),
      );

      if (removeIds.length > 0) {
        const { error } = await supabase
          .from("project_training_role_assignments")
          .delete()
          .in("id", removeIds);
        if (error) throw new Error(error.message);
      }

      if (addEmployeeIds.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("project_training_role_assignments")
          .insert(
            addEmployeeIds.map((employeeId) => ({
              project_role_id: assignRole.id,
              employee_id: employeeId,
              assigned_by: user?.id ?? null,
            })),
          );
        if (error) throw new Error(error.message);
      }

      await loadData();
      setAssignRole(null);
      setMessage({
        tone: "success",
        text: `People assigned to ${assignRole.name}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save project role assignments.",
      });
    } finally {
      setSaving(false);
    }
  }

  function openNewRequirement() {
    if (!selectedProjectId) return;
    setEditingRequirement(null);
    setRequirementForm({
      ...EMPTY_REQUIREMENT,
      projectId: selectedProjectId,
    });
    setRequirementOpen(true);
    setMessage(null);
  }

  function openEditRequirement(requirement: Requirement) {
    setEditingRequirement(requirement);
    setRequirementForm({
      projectId: requirement.project_id,
      projectRoleId: clean(requirement.project_role_id),
      trainingTypeId: requirement.training_type_id,
      requirementLevel: requirement.requirement_level,
      renewalLeadDays: String(requirement.renewal_lead_days ?? 60),
      acceptedAlternativeTrainingTypeIds:
        requirement.accepted_alternative_training_type_ids ?? [],
      requiredOptionCodes: requirement.required_option_codes ?? [],
      notes: clean(requirement.notes),
      active: requirement.active !== false,
    });
    setRequirementOpen(true);
    setMessage(null);
  }

  function toggleAlternative(id: string) {
    setRequirementForm((current) => ({
      ...current,
      acceptedAlternativeTrainingTypeIds:
        current.acceptedAlternativeTrainingTypeIds.includes(id)
          ? current.acceptedAlternativeTrainingTypeIds.filter((item) => item !== id)
          : [...current.acceptedAlternativeTrainingTypeIds, id],
    }));
  }

  function toggleRequiredOption(code: string) {
    setRequirementForm((current) => ({
      ...current,
      requiredOptionCodes: current.requiredOptionCodes.includes(code)
        ? current.requiredOptionCodes.filter((item) => item !== code)
        : [...current.requiredOptionCodes, code],
    }));
  }

  async function saveRequirement() {
    setMessage(null);
    if (!requirementForm.projectId || !requirementForm.trainingTypeId) {
      setMessage({ tone: "error", text: "Select a project and Training type." });
      return;
    }

    const leadDays = Number(requirementForm.renewalLeadDays);
    if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 730) {
      setMessage({
        tone: "error",
        text: "Renewal lead days must be between 0 and 730.",
      });
      return;
    }

    const duplicate = requirements.some(
      (requirement) =>
        requirement.id !== editingRequirement?.id &&
        requirement.project_id === requirementForm.projectId &&
        requirement.training_type_id === requirementForm.trainingTypeId &&
        clean(requirement.project_role_id) === clean(requirementForm.projectRoleId) &&
        requirement.active !== false,
    );

    if (duplicate && requirementForm.active) {
      setMessage({
        tone: "error",
        text: "An active requirement already exists for this project, project role and Training type.",
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_id: requirementForm.projectId,
        project_role_id: clean(requirementForm.projectRoleId) || null,
        training_type_id: requirementForm.trainingTypeId,
        requirement_level: requirementForm.requirementLevel,
        renewal_lead_days: leadDays,
        applies_to_role: null,
        accepted_alternative_training_type_ids:
          requirementForm.acceptedAlternativeTrainingTypeIds.filter(
            (id) => id !== requirementForm.trainingTypeId,
          ),
        required_option_codes: requirementForm.requiredOptionCodes,
        notes: clean(requirementForm.notes) || null,
        active: requirementForm.active,
      };

      const result = editingRequirement
        ? await supabase
            .from("project_training_requirements")
            .update(payload)
            .eq("id", editingRequirement.id)
        : await supabase.from("project_training_requirements").insert(payload);

      if (result.error) throw new Error(result.error.message);
      await loadData();
      setRequirementOpen(false);
      setEditingRequirement(null);
      setRequirementForm(EMPTY_REQUIREMENT);
      setMessage({
        tone: "success",
        text: editingRequirement
          ? "Project requirement updated."
          : "Project requirement added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save project requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setRequirementActive(requirement: Requirement, active: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_training_requirements")
        .update({ active })
        .eq("id", requirement.id);
      if (error) throw new Error(error.message);
      await loadData();
      setMessage({
        tone: "success",
        text: active ? "Requirement restored." : "Requirement archived.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update the requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRequirement(requirement: Requirement) {
    const typeName = typeById.get(requirement.training_type_id)?.name ?? "this requirement";
    if (!window.confirm(`Permanently delete ${typeName}?`)) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_training_requirements")
        .delete()
        .eq("id", requirement.id);
      if (error) throw new Error(error.message);
      await loadData();
      setMessage({ tone: "success", text: "Requirement deleted." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to delete the requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyProjectSetup() {
    if (!selectedProjectId || !copyTargetProjectId) {
      setMessage({ tone: "error", text: "Select a target project." });
      return;
    }
    if (selectedProjectId === copyTargetProjectId) {
      setMessage({ tone: "error", text: "Source and target projects must be different." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const sourceRoles = projectRoles.filter(
        (role) => role.project_id === selectedProjectId && role.active !== false,
      );
      const sourceRequirements = requirements.filter(
        (requirement) =>
          requirement.project_id === selectedProjectId && requirement.active !== false,
      );

      if (replaceTarget) {
        const [roleArchive, requirementArchive] = await Promise.all([
          supabase
            .from("project_training_roles")
            .update({ active: false })
            .eq("project_id", copyTargetProjectId)
            .eq("active", true),
          supabase
            .from("project_training_requirements")
            .update({ active: false })
            .eq("project_id", copyTargetProjectId)
            .eq("active", true),
        ]);
        if (roleArchive.error) throw new Error(roleArchive.error.message);
        if (requirementArchive.error) throw new Error(requirementArchive.error.message);
      }

      const existingTargetRoles = projectRoles.filter(
        (role) => role.project_id === copyTargetProjectId,
      );
      const roleIdMap = new Map<string, string>();

      for (const sourceRole of sourceRoles) {
        let targetRole = existingTargetRoles.find(
          (role) => clean(role.name).toLowerCase() === clean(sourceRole.name).toLowerCase(),
        );

        if (!targetRole) {
          const { data, error } = await supabase
            .from("project_training_roles")
            .insert({
              project_id: copyTargetProjectId,
              name: sourceRole.name,
              description: sourceRole.description,
              sort_order: sourceRole.sort_order ?? 100,
              active: true,
            })
            .select("id,project_id,name,description,sort_order,active")
            .single();
          if (error) throw new Error(error.message);
          targetRole = data as ProjectRole;
        } else if (targetRole.active === false) {
          const { error } = await supabase
            .from("project_training_roles")
            .update({ active: true })
            .eq("id", targetRole.id);
          if (error) throw new Error(error.message);
        }

        roleIdMap.set(sourceRole.id, targetRole.id);
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
              `${requirement.training_type_id}|${clean(requirement.project_role_id)}`,
          ),
      );

      const rows = sourceRequirements
        .map((requirement) => ({
          project_id: copyTargetProjectId,
          project_role_id: requirement.project_role_id
            ? roleIdMap.get(requirement.project_role_id) ?? null
            : null,
          training_type_id: requirement.training_type_id,
          requirement_level: requirement.requirement_level,
          renewal_lead_days: requirement.renewal_lead_days ?? 60,
          accepted_alternative_training_type_ids:
            requirement.accepted_alternative_training_type_ids ?? [],
          required_option_codes: requirement.required_option_codes ?? [],
          applies_to_role: null,
          notes: requirement.notes,
          active: true,
        }))
        .filter(
          (row) =>
            replaceTarget ||
            !existingKeys.has(
              `${row.training_type_id}|${clean(row.project_role_id)}`,
            ),
        );

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
        text: `${sourceRoles.length} project role${sourceRoles.length === 1 ? "" : "s"} and ${rows.length} requirement${rows.length === 1 ? "" : "s"} copied. People were not copied.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to copy project Training setup.",
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
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Create project-specific roles, assign people to those roles, then
                define the minimum tickets and configured classes required by
                each role. The same employee can have a different project role
                and different requirements on another project.
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
                Copy Setup
              </button>
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700"
              >
                <RefreshCw size={16} />
                Refresh
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
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="">Select project...</option>
                {visibleProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {projectLabel(project)}
                  </option>
                ))}
              </select>
            </label>

            <Toggle
              checked={showArchived}
              onChange={setShowArchived}
              label="Show archived"
            />
            <Toggle
              checked={includeInactiveProjects}
              onChange={setIncludeInactiveProjects}
              label="Inactive projects"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-black text-slate-950">
                <Users size={18} />
                Project Roles
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {selectedRoles.length} role{selectedRoles.length === 1 ? "" : "s"} for {selectedProject ? projectLabel(selectedProject) : "this project"}
              </div>
            </div>
            <button
              type="button"
              onClick={openNewRole}
              disabled={!selectedProjectId}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              <Plus size={16} />
              Add Project Role
            </button>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {selectedRoles.map((role) => (
              <div
                key={role.id}
                className={`rounded-2xl border p-4 ${
                  role.active === false
                    ? "border-slate-200 bg-slate-50 opacity-70"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-slate-950">{role.name}</div>
                    {role.description ? (
                      <div className="mt-1 text-sm text-slate-500">
                        {role.description}
                      </div>
                    ) : null}
                  </div>
                  {role.active === false ? (
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black uppercase text-slate-600">
                      Archived
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      People
                    </div>
                    <div className="mt-1 text-xl font-black text-slate-950">
                      {roleAssignmentCount(role.id)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Requirements
                    </div>
                    <div className="mt-1 text-xl font-black text-slate-950">
                      {roleRequirementCount(role.id)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openAssignments(role)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                  >
                    <UserPlus size={14} />
                    Assign People
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditRole(role)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void setRoleActive(role, role.active === false)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                  >
                    <RotateCcw size={14} />
                    {role.active === false ? "Restore" : "Archive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRole(role)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            {selectedRoles.length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
                No project roles yet. Create the roles required by this project, then assign people and Training requirements to them.
              </div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-black text-slate-950">Training Requirements</div>
              <div className="mt-1 text-sm text-slate-500">
                {selectedRequirements.length} requirement{selectedRequirements.length === 1 ? "" : "s"}
              </div>
            </div>
            <button
              type="button"
              onClick={openNewRequirement}
              disabled={!selectedProjectId}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
            >
              <Plus size={16} />
              Add Requirement
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {selectedRequirements.map((requirement) => {
              const type = typeById.get(requirement.training_type_id);
              const role = requirement.project_role_id
                ? roleById.get(requirement.project_role_id)
                : null;

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
                    <div className="mt-1 text-sm font-bold text-slate-600">
                      {role?.name || clean(requirement.applies_to_role) || "All project personnel"}
                    </div>
                  </div>

                  <div className="text-sm text-slate-600">
                    <div>
                      Renewal lead: <strong>{requirement.renewal_lead_days ?? 60} days</strong>
                    </div>
                    {requirement.required_option_codes?.length ? (
                      <div className="mt-1">
                        Required classes: <strong>{requirement.required_option_codes.join(", ")}</strong>
                      </div>
                    ) : null}
                    {requirement.accepted_alternative_training_type_ids?.length ? (
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
                      onClick={() => openEditRequirement(requirement)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
                    >
                      <Edit3 size={15} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void setRequirementActive(requirement, requirement.active === false)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700"
                    >
                      <RotateCcw size={15} />
                      {requirement.active === false ? "Restore" : "Archive"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRequirement(requirement)}
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

        {roleOpen ? (
          <Modal
            title={editingRole ? "Edit Project Role" : "Add Project Role"}
            onClose={() => !saving && setRoleOpen(false)}
          >
            <div className="space-y-4">
              <Field label="Role Name">
                <input
                  className={inputClass}
                  value={roleForm.name}
                  onChange={(event) =>
                    setRoleForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Enter project role name"
                />
              </Field>
              <Field label="Description">
                <textarea
                  className={`${inputClass} min-h-24`}
                  value={roleForm.description}
                  onChange={(event) =>
                    setRoleForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="What this role does on this project..."
                />
              </Field>
              <Toggle
                checked={roleForm.active}
                onChange={(active) => setRoleForm((current) => ({ ...current, active }))}
                label="Active role"
              />
              <PrimaryButton saving={saving} onClick={() => void saveRole()}>
                Save Project Role
              </PrimaryButton>
            </div>
          </Modal>
        ) : null}

        {assignRole ? (
          <Modal
            title={`Assign People · ${assignRole.name}`}
            onClose={() => !saving && setAssignRole(null)}
          >
            <div className="space-y-4">
              <label className="relative block">
                <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
                <input
                  className={`${inputClass} pl-9`}
                  value={assignmentSearch}
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                  placeholder="Search employees..."
                />
              </label>

              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-600">
                  {assignmentSelection.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignmentSelection(employees.map((employee) => employee.id))}
                    className="font-black text-blue-700"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignmentSelection([])}
                    className="font-black text-slate-500"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-2xl border border-slate-200 p-2">
                {assignmentFilteredEmployees.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={assignmentSelection.includes(employee.id)}
                      onChange={() => toggleAssignment(employee.id)}
                    />
                    <span>
                      <span className="block text-sm font-black text-slate-900">
                        {employee.full_name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {[employee.payroll_id, employee.role].filter(Boolean).join(" · ") || "Employee"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <PrimaryButton saving={saving} onClick={() => void saveAssignments()}>
                Save Assignments
              </PrimaryButton>
            </div>
          </Modal>
        ) : null}

        {requirementOpen ? (
          <Modal
            title={editingRequirement ? "Edit Project Requirement" : "Add Project Requirement"}
            onClose={() => !saving && setRequirementOpen(false)}
          >
            <div className="space-y-4">
              <Field label="Applies To">
                <select
                  className={inputClass}
                  value={requirementForm.projectRoleId}
                  onChange={(event) =>
                    setRequirementForm((current) => ({
                      ...current,
                      projectRoleId: event.target.value,
                    }))
                  }
                >
                  <option value="">All project personnel</option>
                  {projectRoles
                    .filter(
                      (role) =>
                        role.project_id === selectedProjectId && role.active !== false,
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Training Type">
                <select
                  className={inputClass}
                  value={requirementForm.trainingTypeId}
                  onChange={(event) =>
                    setRequirementForm((current) => ({
                      ...current,
                      trainingTypeId: event.target.value,
                      requiredOptionCodes: [],
                    }))
                  }
                >
                  <option value="">Select Training type...</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.short_code ? `${type.short_code} · ` : ""}{type.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Requirement Level">
                  <select
                    className={inputClass}
                    value={requirementForm.requirementLevel}
                    onChange={(event) =>
                      setRequirementForm((current) => ({
                        ...current,
                        requirementLevel: event.target.value as "mandatory" | "recommended",
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
                    value={requirementForm.renewalLeadDays}
                    onChange={(event) =>
                      setRequirementForm((current) => ({
                        ...current,
                        renewalLeadDays: event.target.value,
                      }))
                    }
                  />
                </Field>
              </div>

              {typeOptions.length > 0 ? (
                <Field label="Required Classes / Options">
                  <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                    {typeOptions.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={requirementForm.requiredOptionCodes.includes(option.code)}
                          onChange={() => toggleRequiredOption(option.code)}
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
                    .filter((type) => type.id !== requirementForm.trainingTypeId)
                    .map((type) => (
                      <label
                        key={type.id}
                        className="flex items-center gap-2 text-sm font-semibold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={requirementForm.acceptedAlternativeTrainingTypeIds.includes(type.id)}
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
                  value={requirementForm.notes}
                  onChange={(event) =>
                    setRequirementForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </Field>

              <Toggle
                checked={requirementForm.active}
                onChange={(active) =>
                  setRequirementForm((current) => ({ ...current, active }))
                }
                label="Active requirement"
              />

              <PrimaryButton saving={saving} onClick={() => void saveRequirement()}>
                Save Requirement
              </PrimaryButton>
            </div>
          </Modal>
        ) : null}

        {copyOpen ? (
          <Modal title="Copy Project Training Setup" onClose={() => !saving && setCopyOpen(false)}>
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Source: <strong>{projectLabel(selectedProject)}</strong>. Project roles and their requirements are copied; employee assignments are intentionally not copied.
              </div>
              <Field label="Target Project">
                <select
                  className={inputClass}
                  value={copyTargetProjectId}
                  onChange={(event) => setCopyTargetProjectId(event.target.value)}
                >
                  <option value="">Select target...</option>
                  {projects
                    .filter((project) => project.id !== selectedProjectId)
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {projectLabel(project)}
                      </option>
                    ))}
                </select>
              </Field>
              <Toggle
                checked={replaceTarget}
                onChange={setReplaceTarget}
                label="Archive existing target roles and requirements before copying"
              />
              <PrimaryButton
                saving={saving}
                disabled={!copyTargetProjectId}
                onClick={() => void copyProjectSetup()}
              >
                Copy Setup
              </PrimaryButton>
            </div>
          </Modal>
        ) : null}
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function PrimaryButton({
  saving,
  disabled = false,
  onClick,
  children,
}: {
  saving: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
    >
      {saving ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <CheckCircle2 size={16} />
      )}
      {children}
    </button>
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
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
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
