"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Download,
  Edit3,
  Eye,
  Filter,
  GraduationCap,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  active: boolean | null;
};

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  default_expiry_months: number | null;
  does_not_expire: boolean | null;
  active: boolean | null;
};

type RoleRequirement = {
  id: string;
  role_name: string;
  training_type_id: string;
  requirement_level: "mandatory" | "recommended";
  renewal_lead_days: number;
  accepted_alternative_training_type_ids: string[];
  notes: string | null;
  active: boolean;
  created_at: string | null;
};

type RequirementForm = {
  roleName: string;
  trainingTypeId: string;
  requirementLevel: "mandatory" | "recommended";
  renewalLeadDays: string;
  acceptedAlternativeTrainingTypeIds: string[];
  notes: string;
};

type RoleSummary = {
  roleName: string;
  employeeCount: number;
  mandatoryCount: number;
  recommendedCount: number;
  activeRequirementCount: number;
  archivedRequirementCount: number;
};

type RequirementStatusFilter =
  | "all"
  | "mandatory"
  | "recommended"
  | "active"
  | "archived";

const EMPTY_FORM: RequirementForm = {
  roleName: "",
  trainingTypeId: "",
  requirementLevel: "mandatory",
  renewalLeadDays: "60",
  acceptedAlternativeTrainingTypeIds: [],
  notes: "",
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normaliseRole(value: unknown) {
  return clean(value).replace(/\s+/g, " ");
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

function requirementTone(level: RoleRequirement["requirement_level"]) {
  return level === "mandatory"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-sky-200 bg-sky-50 text-sky-700";
}

function plural(value: number, singular: string, pluralLabel?: string) {
  return `${value} ${
    value === 1 ? singular : pluralLabel ?? `${singular}s`
  }`;
}

export default function TrainingRequirementsPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [requirements, setRequirements] = useState<RoleRequirement[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] =
    useState<RequirementStatusFilter>("all");

  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] =
    useState<RoleRequirement | null>(null);
  const [form, setForm] = useState<RequirementForm>(EMPTY_FORM);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceRole, setCopySourceRole] = useState("");
  const [copyTargetRole, setCopyTargetRole] = useState("");
  const [replaceTargetRequirements, setReplaceTargetRequirements] =
    useState(false);

  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [employeeResult, typeResult, requirementResult] =
      await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, role, active")
          .eq("active", true)
          .order("full_name", { ascending: true }),
        supabase
          .from("training_types")
          .select(
            "id, name, category, default_expiry_months, does_not_expire, active",
          )
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("role_training_requirements")
          .select(
            "id, role_name, training_type_id, requirement_level, renewal_lead_days, accepted_alternative_training_type_ids, notes, active, created_at",
          )
          .order("role_name", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (employeeResult.error) {
      throw new Error(employeeResult.error.message);
    }

    if (typeResult.error) {
      throw new Error(typeResult.error.message);
    }

    if (requirementResult.error) {
      throw new Error(
        `${requirementResult.error.message}. This page expects the public.role_training_requirements table.`,
      );
    }

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
    setRequirements(
      (requirementResult.data ?? []).map((item) => ({
        ...(item as RoleRequirement),
        accepted_alternative_training_type_ids:
          (item.accepted_alternative_training_type_ids as string[] | null) ??
          [],
        renewal_lead_days:
          Number(item.renewal_lead_days) || 60,
        active: item.active !== false,
      })),
    );

    const loadedRoles = new Set<string>();
    (employeeResult.data ?? []).forEach((employee) => {
      const role = normaliseRole((employee as Employee).role);
      if (role) loadedRoles.add(role);
    });
    (requirementResult.data ?? []).forEach((requirement) => {
      const role = normaliseRole((requirement as RoleRequirement).role_name);
      if (role) loadedRoles.add(role);
    });

    if (!selectedRole && loadedRoles.size > 0) {
      setSelectedRole(
        [...loadedRoles].sort((a, b) => a.localeCompare(b))[0] ?? null,
      );
    }
  }, [selectedRole, supabase]);

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
                : "Unable to load training requirements.",
          });
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

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

  const employeeRoles = useMemo(() => {
    const values = new Set<string>();

    employees.forEach((employee) => {
      const role = normaliseRole(employee.role);
      if (role) values.add(role);
    });

    requirements.forEach((requirement) => {
      const role = normaliseRole(requirement.role_name);
      if (role) values.add(role);
    });

    return [...values].sort((a, b) => a.localeCompare(b));
  }, [employees, requirements]);

  const categories = useMemo(() => {
    const values = new Set<string>();

    trainingTypes.forEach((trainingType) => {
      const category = clean(trainingType.category);
      if (category) values.add(category);
    });

    return [...values].sort((a, b) => a.localeCompare(b));
  }, [trainingTypes]);

  const roleSummaries = useMemo<RoleSummary[]>(() => {
    return employeeRoles
      .map((roleName) => {
        const roleRequirements = requirements.filter(
          (requirement) =>
            normaliseRole(requirement.role_name) === roleName,
        );

        return {
          roleName,
          employeeCount: employees.filter(
            (employee) =>
              normaliseRole(employee.role) === roleName,
          ).length,
          mandatoryCount: roleRequirements.filter(
            (requirement) =>
              requirement.active &&
              requirement.requirement_level === "mandatory",
          ).length,
          recommendedCount: roleRequirements.filter(
            (requirement) =>
              requirement.active &&
              requirement.requirement_level === "recommended",
          ).length,
          activeRequirementCount: roleRequirements.filter(
            (requirement) => requirement.active,
          ).length,
          archivedRequirementCount: roleRequirements.filter(
            (requirement) => !requirement.active,
          ).length,
        };
      })
      .sort((a, b) => {
        if (
          a.activeRequirementCount === 0 &&
          b.activeRequirementCount > 0
        ) {
          return -1;
        }

        if (
          b.activeRequirementCount === 0 &&
          a.activeRequirementCount > 0
        ) {
          return 1;
        }

        return a.roleName.localeCompare(b.roleName);
      });
  }, [employeeRoles, employees, requirements]);

  const filteredRequirements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requirements.filter((requirement) => {
      const trainingType = trainingTypeById.get(
        requirement.training_type_id,
      );

      if (
        roleFilter !== "all" &&
        normaliseRole(requirement.role_name) !== roleFilter
      ) {
        return false;
      }

      if (
        categoryFilter !== "all" &&
        clean(trainingType?.category) !== categoryFilter
      ) {
        return false;
      }

      if (
        statusFilter === "mandatory" &&
        requirement.requirement_level !== "mandatory"
      ) {
        return false;
      }

      if (
        statusFilter === "recommended" &&
        requirement.requirement_level !== "recommended"
      ) {
        return false;
      }

      if (statusFilter === "active" && !requirement.active) {
        return false;
      }

      if (statusFilter === "archived" && requirement.active) {
        return false;
      }

      if (!query) return true;

      return [
        requirement.role_name,
        trainingType?.name,
        trainingType?.category,
        requirement.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    categoryFilter,
    requirements,
    roleFilter,
    search,
    statusFilter,
    trainingTypeById,
  ]);

  const selectedRoleRequirements = useMemo(() => {
    if (!selectedRole) return [];

    return requirements
      .filter(
        (requirement) =>
          normaliseRole(requirement.role_name) === selectedRole,
      )
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;

        if (a.requirement_level !== b.requirement_level) {
          return a.requirement_level === "mandatory" ? -1 : 1;
        }

        return (
          trainingTypeById
            .get(a.training_type_id)
            ?.name.localeCompare(
              trainingTypeById.get(b.training_type_id)?.name ?? "",
            ) ?? 0
        );
      });
  }, [
    requirements,
    selectedRole,
    trainingTypeById,
  ]);

  const rolesWithoutRequirements = roleSummaries.filter(
    (summary) => summary.activeRequirementCount === 0,
  ).length;

  const totalMandatory = requirements.filter(
    (requirement) =>
      requirement.active &&
      requirement.requirement_level === "mandatory",
  ).length;

  const totalRecommended = requirements.filter(
    (requirement) =>
      requirement.active &&
      requirement.requirement_level === "recommended",
  ).length;

  const configuredRoles = roleSummaries.filter(
    (summary) => summary.activeRequirementCount > 0,
  ).length;

  const archivedRequirements = requirements.filter(
    (requirement) => !requirement.active,
  ).length;

  const unknownTrainingTypeCount = requirements.filter(
    (requirement) => !trainingTypeById.has(requirement.training_type_id),
  ).length;

  const duplicateActiveRequirementCount = useMemo(() => {
    const keys = new Set<string>();
    let duplicates = 0;

    requirements
      .filter((requirement) => requirement.active)
      .forEach((requirement) => {
        const key = `${normaliseRole(requirement.role_name).toLowerCase()}|${requirement.training_type_id}`;
        if (keys.has(key)) duplicates += 1;
        keys.add(key);
      });

    return duplicates;
  }, [requirements]);

  const categoryCoverage = useMemo(() => {
    const map = new Map<
      string,
      { category: string; requirements: number; roles: Set<string> }
    >();

    requirements
      .filter((requirement) => requirement.active)
      .forEach((requirement) => {
        const category =
          clean(trainingTypeById.get(requirement.training_type_id)?.category) ||
          "Uncategorised";
        const current = map.get(category) ?? {
          category,
          requirements: 0,
          roles: new Set<string>(),
        };

        current.requirements += 1;
        current.roles.add(normaliseRole(requirement.role_name));
        map.set(category, current);
      });

    return [...map.values()]
      .map((item) => ({
        category: item.category,
        requirements: item.requirements,
        roles: item.roles.size,
      }))
      .sort(
        (a, b) =>
          b.requirements - a.requirements ||
          a.category.localeCompare(b.category),
      );
  }, [requirements, trainingTypeById]);

  const selectedRoleSummary = useMemo(
    () =>
      selectedRole
        ? roleSummaries.find((summary) => summary.roleName === selectedRole) ??
          null
        : null,
    [roleSummaries, selectedRole],
  );

  const selectedRoleRequirementGroups = useMemo(() => {
    const map = new Map<string, RoleRequirement[]>();

    selectedRoleRequirements.forEach((requirement) => {
      const category =
        clean(trainingTypeById.get(requirement.training_type_id)?.category) ||
        "Uncategorised";
      const list = map.get(category) ?? [];
      list.push(requirement);
      map.set(category, list);
    });

    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [selectedRoleRequirements, trainingTypeById]);

  const activeFilterCount = [
    search.trim() ? "search" : "",
    roleFilter !== "all" ? "role" : "",
    categoryFilter !== "all" ? "category" : "",
    statusFilter !== "all" ? "status" : "",
  ].filter(Boolean).length;

  function resetFilters() {
    setSearch("");
    setRoleFilter("all");
    setCategoryFilter("all");
    setStatusFilter("all");
  }

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Role training requirements refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh training requirements.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function openCreateForm(roleName?: string) {
    setEditingRequirement(null);
    setForm({
      ...EMPTY_FORM,
      roleName: roleName ?? "",
    });
    setFormOpen(true);
  }

  function openEditForm(requirement: RoleRequirement) {
    setEditingRequirement(requirement);
    setForm({
      roleName: requirement.role_name,
      trainingTypeId: requirement.training_type_id,
      requirementLevel: requirement.requirement_level,
      renewalLeadDays: String(requirement.renewal_lead_days),
      acceptedAlternativeTrainingTypeIds:
        requirement.accepted_alternative_training_type_ids ?? [],
      notes: requirement.notes ?? "",
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRequirement(null);
    setForm(EMPTY_FORM);
  }

  async function saveRequirement() {
    const roleName = normaliseRole(form.roleName);
    const renewalLeadDays = Number(form.renewalLeadDays);

    if (!roleName) {
      setMessage({
        tone: "error",
        text: "Select or enter a role.",
      });
      return;
    }

    if (!form.trainingTypeId) {
      setMessage({
        tone: "error",
        text: "Select a training type.",
      });
      return;
    }

    if (
      !Number.isFinite(renewalLeadDays) ||
      renewalLeadDays < 0 ||
      renewalLeadDays > 730
    ) {
      setMessage({
        tone: "error",
        text: "Renewal lead time must be between 0 and 730 days.",
      });
      return;
    }

    const duplicate = requirements.find(
      (requirement) =>
        requirement.id !== editingRequirement?.id &&
        normaliseRole(requirement.role_name) === roleName &&
        requirement.training_type_id === form.trainingTypeId &&
        requirement.active,
    );

    if (duplicate) {
      setMessage({
        tone: "error",
        text: "This role already has an active requirement for that training type.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      role_name: roleName,
      training_type_id: form.trainingTypeId,
      requirement_level: form.requirementLevel,
      renewal_lead_days: renewalLeadDays,
      accepted_alternative_training_type_ids:
        form.acceptedAlternativeTrainingTypeIds.filter(
          (trainingTypeId) =>
            trainingTypeId !== form.trainingTypeId,
        ),
      notes: clean(form.notes) || null,
      active: editingRequirement?.active ?? true,
    };

    try {
      if (editingRequirement) {
        const { error } = await supabase
          .from("role_training_requirements")
          .update(payload)
          .eq("id", editingRequirement.id);

        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("role_training_requirements")
          .insert(payload);

        if (error) throw new Error(error.message);
      }

      await loadData();
      closeForm();

      setMessage({
        tone: "success",
        text: editingRequirement
          ? "Training requirement updated."
          : "Training requirement added.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to save the training requirement.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setRequirementActive(
    requirement: RoleRequirement,
    active: boolean,
  ) {
    setMessage(null);

    try {
      const { error } = await supabase
        .from("role_training_requirements")
        .update({ active })
        .eq("id", requirement.id);

      if (error) throw new Error(error.message);

      await loadData();

      setMessage({
        tone: "success",
        text: active
          ? "Training requirement restored."
          : "Training requirement archived.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update the training requirement.",
      });
    }
  }

  async function deleteRequirement(requirement: RoleRequirement) {
    const trainingType = trainingTypeById.get(
      requirement.training_type_id,
    );

    const confirmed = window.confirm(
      `Permanently delete ${trainingType?.name ?? "this requirement"} from ${requirement.role_name}?`,
    );

    if (!confirmed) return;

    setMessage(null);

    try {
      const { error } = await supabase
        .from("role_training_requirements")
        .delete()
        .eq("id", requirement.id);

      if (error) throw new Error(error.message);

      await loadData();

      setMessage({
        tone: "success",
        text: "Training requirement permanently deleted.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to delete the training requirement.",
      });
    }
  }

  function openCopyModal(sourceRole?: string) {
    setCopySourceRole(sourceRole ?? "");
    setCopyTargetRole("");
    setReplaceTargetRequirements(false);
    setCopyModalOpen(true);
  }

  async function copyRequirements() {
    if (!copySourceRole || !copyTargetRole) {
      setMessage({
        tone: "error",
        text: "Select both a source role and a target role.",
      });
      return;
    }

    if (copySourceRole === copyTargetRole) {
      setMessage({
        tone: "error",
        text: "Source and target roles must be different.",
      });
      return;
    }

    const sourceRequirements = requirements.filter(
      (requirement) =>
        requirement.active &&
        normaliseRole(requirement.role_name) === copySourceRole,
    );

    if (sourceRequirements.length === 0) {
      setMessage({
        tone: "error",
        text: "The source role has no active requirements to copy.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (replaceTargetRequirements) {
        const { error: archiveError } = await supabase
          .from("role_training_requirements")
          .update({ active: false })
          .eq("role_name", copyTargetRole)
          .eq("active", true);

        if (archiveError) throw new Error(archiveError.message);
      }

      const existingTargetTypeIds = new Set(
        requirements
          .filter(
            (requirement) =>
              requirement.active &&
              normaliseRole(requirement.role_name) ===
                copyTargetRole,
          )
          .map((requirement) => requirement.training_type_id),
      );

      const rows = sourceRequirements
        .filter(
          (requirement) =>
            replaceTargetRequirements ||
            !existingTargetTypeIds.has(
              requirement.training_type_id,
            ),
        )
        .map((requirement) => ({
          role_name: copyTargetRole,
          training_type_id: requirement.training_type_id,
          requirement_level: requirement.requirement_level,
          renewal_lead_days: requirement.renewal_lead_days,
          accepted_alternative_training_type_ids:
            requirement.accepted_alternative_training_type_ids ??
            [],
          notes: requirement.notes,
          active: true,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from("role_training_requirements")
          .insert(rows);

        if (insertError) throw new Error(insertError.message);
      }

      await loadData();
      setCopyModalOpen(false);

      setMessage({
        tone: "success",
        text:
          rows.length > 0
            ? `${plural(rows.length, "requirement")} copied to ${copyTargetRole}.`
            : "The target role already contains every active source requirement.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to copy the role requirements.",
      });
    } finally {
      setSaving(false);
    }
  }

  function exportRequirements() {
    const header = [
      "Role",
      "Training Type",
      "Short Code",
      "Category",
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

      const alternatives =
        requirement.accepted_alternative_training_type_ids
          .map(
            (trainingTypeId) =>
              trainingTypeById.get(trainingTypeId)?.name,
          )
          .filter(Boolean)
          .join("; ");

      return [
        requirement.role_name,
        trainingType?.name ?? "Unknown training type",
        "",
        trainingType?.category ?? "",
        requirement.requirement_level,
        requirement.renewal_lead_days,
        alternatives,
        requirement.active ? "Active" : "Archived",
        requirement.notes ?? "",
      ];
    });

    const csv = [
      header.map(csvCell).join(","),
      ...rows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`role-training-requirements-${date}.csv`, csv);
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
                Back to Training Dashboard
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <BriefcaseBusiness size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Role Configuration
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Role Training Requirements
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Define the mandatory and recommended training each role
                requires. These rules can then drive the compliance
                dashboard, training matrix and project mobilisation
                checks.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/people/training/project-compliance"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <BarChart3 size={16} />
                Preview Compliance
              </Link>

              <button
                type="button"
                onClick={() => openCopyModal()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ClipboardCopy size={16} />
                Copy Role
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => openCreateForm()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Configured Roles"
            value={String(configuredRoles)}
            detail={`${employeeRoles.length} roles identified`}
            icon={<BriefcaseBusiness size={20} />}
            tone="slate"
          />

          <MetricCard
            label="Mandatory Rules"
            value={String(totalMandatory)}
            detail="Required for compliance"
            icon={<ShieldCheck size={20} />}
            tone="rose"
          />

          <MetricCard
            label="Recommended Rules"
            value={String(totalRecommended)}
            detail="Preferred capability"
            icon={<Sparkles size={20} />}
            tone="sky"
          />

          <MetricCard
            label="Roles Not Configured"
            value={String(rolesWithoutRequirements)}
            detail="Require requirement setup"
            icon={<AlertTriangle size={20} />}
            tone={rolesWithoutRequirements > 0 ? "amber" : "slate"}
          />

          <MetricCard
            label="Active Employees"
            value={String(employees.length)}
            detail="Affected by role rules"
            icon={<UsersRound size={20} />}
            tone="slate"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-slate-400">
                  <ShieldCheck size={17} />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Configuration Health
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-bold text-slate-950">
                  Role rule-set health
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Checks that affect whether role compliance can be calculated reliably.
                </p>
              </div>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  rolesWithoutRequirements === 0 &&
                  unknownTrainingTypeCount === 0 &&
                  duplicateActiveRequirementCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {rolesWithoutRequirements === 0 &&
                unknownTrainingTypeCount === 0 &&
                duplicateActiveRequirementCount === 0
                  ? "Healthy"
                  : "Review required"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <HealthItem
                label="Roles without active rules"
                value={rolesWithoutRequirements}
                good={rolesWithoutRequirements === 0}
                detail="Active employee roles that have no baseline requirements."
              />
              <HealthItem
                label="Unknown training references"
                value={unknownTrainingTypeCount}
                good={unknownTrainingTypeCount === 0}
                detail="Rules linked to a training type that no longer exists."
              />
              <HealthItem
                label="Duplicate active rules"
                value={duplicateActiveRequirementCount}
                good={duplicateActiveRequirementCount === 0}
                detail="More than one active rule for the same role and training type."
              />
              <HealthItem
                label="Archived rules"
                value={archivedRequirements}
                good
                detail="Retained for history but excluded from compliance calculations."
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Layers3 size={17} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Training Coverage
              </span>
            </div>
            <h2 className="mt-2 text-lg font-bold text-slate-950">
              Active rules by category
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Shows how broadly each training category is applied across roles.
            </p>

            {categoryCoverage.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                No active role requirements have been configured.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {categoryCoverage.slice(0, 7).map((item) => (
                  <CategoryCoverageRow
                    key={item.category}
                    category={item.category}
                    requirements={item.requirements}
                    roles={item.roles}
                    totalRoles={Math.max(configuredRoles, 1)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-slate-500">
              <Filter size={17} />
              <span className="text-sm font-semibold">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {activeFilterCount} active
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <RotateCcw size={15} />
              Reset filters
            </button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px_220px_210px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search role, training type, category or notes..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "all", label: "All roles" },
                ...employeeRoles.map((role) => ({
                  value: role,
                  label: role,
                })),
              ]}
            />

            <SelectField
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ]}
            />

            <SelectField
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as RequirementStatusFilter)
              }
              options={[
                { value: "all", label: "All requirements" },
                { value: "mandatory", label: "Mandatory only" },
                { value: "recommended", label: "Recommended only" },
                { value: "active", label: "Active only" },
                { value: "archived", label: "Archived only" },
              ]}
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">
                Role Profiles
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Select a role to manage its requirements.
              </p>
            </div>

            <div className="max-h-[700px] space-y-2 overflow-y-auto p-3">
              {roleSummaries.length === 0 ? (
                <EmptyState
                  icon={<BriefcaseBusiness size={28} />}
                  title="No employee roles found"
                  description="Add roles to employee profiles before creating role requirements."
                />
              ) : (
                roleSummaries.map((summary) => (
                  <button
                    key={summary.roleName}
                    type="button"
                    onClick={() =>
                      setSelectedRole(summary.roleName)
                    }
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedRole === summary.roleName
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">
                          {summary.roleName}
                        </div>
                        <div
                          className={`mt-1 text-xs ${
                            selectedRole === summary.roleName
                              ? "text-slate-300"
                              : "text-slate-500"
                          }`}
                        >
                          {plural(
                            summary.employeeCount,
                            "employee",
                          )}
                        </div>
                      </div>

                      {summary.activeRequirementCount === 0 ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                          Not configured
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                            selectedRole === summary.roleName
                              ? "bg-white/10 text-white"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {summary.activeRequirementCount} rules
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <SmallCount
                        label="Mandatory"
                        value={summary.mandatoryCount}
                        inverted={
                          selectedRole === summary.roleName
                        }
                      />
                      <SmallCount
                        label="Recommended"
                        value={summary.recommendedCount}
                        inverted={
                          selectedRole === summary.roleName
                        }
                      />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {!selectedRole ? (
              <div className="p-12">
                <EmptyState
                  icon={<Eye size={28} />}
                  title="Select a role"
                  description="Choose a role from the left to review, add, edit, copy or archive its training requirements."
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      {selectedRole}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {
                        employees.filter(
                          (employee) =>
                            normaliseRole(employee.role) ===
                            selectedRole,
                        ).length
                      }{" "}
                      active employees use this role.
                    </p>

                    {selectedRoleSummary ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                          {selectedRoleSummary.mandatoryCount} mandatory
                        </span>
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          {selectedRoleSummary.recommendedCount} recommended
                        </span>
                        {selectedRoleSummary.archivedRequirementCount > 0 ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {selectedRoleSummary.archivedRequirementCount} archived
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openCopyModal(selectedRole)
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ClipboardCopy size={15} />
                      Copy
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openCreateForm(selectedRole)
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus size={15} />
                      Add Requirement
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {selectedRoleRequirements.length === 0 ? (
                    <EmptyState
                      icon={<GraduationCap size={28} />}
                      title="No requirements configured"
                      description="Add mandatory or recommended training requirements for this role."
                      actionLabel="Add first requirement"
                      onAction={() =>
                        openCreateForm(selectedRole)
                      }
                    />
                  ) : (
                    <div className="space-y-6">
                      {selectedRoleRequirementGroups.map(
                        ([category, categoryRequirements]) => (
                          <section key={category}>
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <h3 className="font-bold text-slate-900">
                                  {category}
                                </h3>
                                <p className="mt-1 text-xs text-slate-500">
                                  {plural(categoryRequirements.length, "requirement")}
                                </p>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {categoryRequirements.filter((item) => item.active).length} active
                              </span>
                            </div>

                            <div className="space-y-3">
                              {categoryRequirements.map((requirement) => (
                                <RequirementCard
                                  key={requirement.id}
                                  requirement={requirement}
                                  trainingType={trainingTypeById.get(
                                    requirement.training_type_id,
                                  )}
                                  alternativeTrainingTypes={
                                    requirement.accepted_alternative_training_type_ids
                                      .map((trainingTypeId) =>
                                        trainingTypeById.get(trainingTypeId),
                                      )
                                      .filter(
                                        (trainingType): trainingType is TrainingType =>
                                          Boolean(trainingType),
                                      )
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
                          </section>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-950">
              All Requirements
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {plural(
                filteredRequirements.length,
                "requirement",
              )}{" "}
              match the current filters.
            </p>
          </div>

          {filteredRequirements.length === 0 ? (
            <div className="p-10">
              <EmptyState
                icon={<Settings2 size={28} />}
                title="No matching requirements"
                description="Change the filters or add a new training requirement."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">
                      Role
                    </th>
                    <th className="px-5 py-3 font-semibold">
                      Training
                    </th>
                    <th className="px-5 py-3 font-semibold">
                      Level
                    </th>
                    <th className="px-5 py-3 font-semibold">
                      Renewal lead
                    </th>
                    <th className="px-5 py-3 font-semibold">
                      Alternatives
                    </th>
                    <th className="px-5 py-3 font-semibold">
                      Status
                    </th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {filteredRequirements.map((requirement) => {
                    const trainingType = trainingTypeById.get(
                      requirement.training_type_id,
                    );

                    return (
                      <tr
                        key={requirement.id}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedRole(
                                normaliseRole(
                                  requirement.role_name,
                                ),
                              )
                            }
                            className="font-bold text-slate-950 hover:underline"
                          >
                            {requirement.role_name}
                          </button>
                        </td>

                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">
                            {trainingType?.name ??
                              "Unknown training type"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {[
                                                    trainingType?.category,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No category"}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${requirementTone(
                              requirement.requirement_level,
                            )}`}
                          >
                            {requirement.requirement_level ===
                            "mandatory"
                              ? "Mandatory"
                              : "Recommended"}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-semibold text-slate-700">
                          {requirement.renewal_lead_days} days
                        </td>

                        <td className="px-5 py-4 text-slate-600">
                          {requirement
                            .accepted_alternative_training_type_ids
                            .length > 0
                            ? plural(
                                requirement
                                  .accepted_alternative_training_type_ids
                                  .length,
                                "alternative",
                              )
                            : "None"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              requirement.active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {requirement.active
                              ? "Active"
                              : "Archived"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openEditForm(requirement)
                              }
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                              aria-label="Edit requirement"
                            >
                              <Edit3 size={15} />
                            </button>

                            {requirement.active ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void setRequirementActive(
                                    requirement,
                                    false,
                                  )
                                }
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void setRequirementActive(
                                    requirement,
                                    true,
                                  )
                                }
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {formOpen ? (
        <RequirementFormModal
          form={form}
          setForm={setForm}
          editing={Boolean(editingRequirement)}
          employeeRoles={employeeRoles}
          trainingTypes={trainingTypes.filter(
            (trainingType) => trainingType.active !== false,
          )}
          saving={saving}
          onClose={closeForm}
          onSave={() => void saveRequirement()}
        />
      ) : null}

      {copyModalOpen ? (
        <CopyRoleModal
          sourceRole={copySourceRole}
          targetRole={copyTargetRole}
          replaceTargetRequirements={replaceTargetRequirements}
          employeeRoles={employeeRoles}
          saving={saving}
          setSourceRole={setCopySourceRole}
          setTargetRole={setCopyTargetRole}
          setReplaceTargetRequirements={
            setReplaceTargetRequirements
          }
          onClose={() => setCopyModalOpen(false)}
          onCopy={() => void copyRequirements()}
        />
      ) : null}
    </AppShell>
  );
}

function RequirementCard({
  requirement,
  trainingType,
  alternativeTrainingTypes,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  requirement: RoleRequirement;
  trainingType: TrainingType | undefined;
  alternativeTrainingTypes: TrainingType[];
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        requirement.active
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
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${requirementTone(
                requirement.requirement_level,
              )}`}
            >
              {requirement.requirement_level === "mandatory"
                ? "Mandatory"
                : "Recommended"}
            </span>

            {!requirement.active ? (
              <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                Archived
              </span>
            ) : null}
          </div>

          <div className="mt-2 text-sm text-slate-500">
            {[
                    trainingType?.category,
            ]
              .filter(Boolean)
              .join(" · ") || "No category"}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InfoBlock
              label="Renewal lead time"
              value={`${requirement.renewal_lead_days} days`}
            />

            <InfoBlock
              label="Accepted alternatives"
              value={
                alternativeTrainingTypes.length > 0
                  ? alternativeTrainingTypes
                      .map(
                        (item) =>
                          item.name,
                      )
                      .join(", ")
                  : "None"
              }
            />
          </div>

          {requirement.notes ? (
            <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-600">
              {requirement.notes}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Edit3 size={15} />
            Edit
          </button>

          {requirement.active ? (
            <button
              type="button"
              onClick={onArchive}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Archive
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onRestore}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <Check size={15} />
                Restore
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RequirementFormModal({
  form,
  setForm,
  editing,
  employeeRoles,
  trainingTypes,
  saving,
  onClose,
  onSave,
}: {
  form: RequirementForm;
  setForm: React.Dispatch<React.SetStateAction<RequirementForm>>;
  editing: boolean;
  employeeRoles: string[];
  trainingTypes: TrainingType[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const selectedTrainingType = trainingTypes.find(
    (trainingType) =>
      trainingType.id === form.trainingTypeId,
  );

  const availableAlternatives = trainingTypes.filter(
    (trainingType) =>
      trainingType.id !== form.trainingTypeId,
  );

  function toggleAlternative(trainingTypeId: string) {
    setForm((current) => ({
      ...current,
      acceptedAlternativeTrainingTypeIds:
        current.acceptedAlternativeTrainingTypeIds.includes(
          trainingTypeId,
        )
          ? current.acceptedAlternativeTrainingTypeIds.filter(
              (item) => item !== trainingTypeId,
            )
          : [
              ...current.acceptedAlternativeTrainingTypeIds,
              trainingTypeId,
            ],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {editing
                ? "Edit Training Requirement"
                : "Add Training Requirement"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Define the rule applied to employees with this role.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Role" required>
              <input
                list="employee-role-options"
                value={form.roleName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    roleName: event.target.value,
                  }))
                }
                placeholder="Select or type a role"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
              />

              <datalist id="employee-role-options">
                {employeeRoles.map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </FormField>

            <FormField label="Training type" required>
              <SelectField
                value={form.trainingTypeId}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    trainingTypeId: value,
                    acceptedAlternativeTrainingTypeIds:
                      current.acceptedAlternativeTrainingTypeIds.filter(
                        (trainingTypeId) =>
                          trainingTypeId !== value,
                      ),
                  }))
                }
                options={[
                  {
                    value: "",
                    label: "Select training type",
                  },
                  ...trainingTypes.map((trainingType) => ({
                    value: trainingType.id,
                    label: trainingType.name,
                  })),
                ]}
              />
            </FormField>

            <FormField label="Requirement level" required>
              <SelectField
                value={form.requirementLevel}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    requirementLevel:
                      value as RequirementForm["requirementLevel"],
                  }))
                }
                options={[
                  {
                    value: "mandatory",
                    label: "Mandatory",
                  },
                  {
                    value: "recommended",
                    label: "Recommended",
                  },
                ]}
              />
            </FormField>

            <FormField
              label="Renewal lead time"
              hint="Days before expiry that the record should be treated as due for renewal."
              required
            >
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={730}
                  value={form.renewalLeadDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      renewalLeadDays: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-16 text-sm outline-none ring-slate-200 focus:ring-2"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  days
                </span>
              </div>
            </FormField>
          </div>

          <FormField
            label="Accepted alternatives"
            hint="Any selected training type may satisfy this requirement instead of the primary type."
          >
            {availableAlternatives.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No other active training types are available.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableAlternatives.map(
                    (trainingType) => {
                      const selected =
                        form.acceptedAlternativeTrainingTypeIds.includes(
                          trainingType.id,
                        );

                      return (
                        <button
                          key={trainingType.id}
                          type="button"
                          onClick={() =>
                            toggleAlternative(trainingType.id)
                          }
                          className={`flex items-start gap-3 rounded-xl border p-3 text-left ${
                            selected
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              selected
                                ? "border-white bg-white text-slate-950"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {selected ? (
                              <Check size={13} />
                            ) : null}
                          </span>

                          <span>
                            <span className="block text-sm font-bold">
                              {trainingType.name}
                            </span>
                            <span
                              className={`mt-1 block text-xs ${
                                selected
                                  ? "text-slate-300"
                                  : "text-slate-500"
                              }`}
                            >
                              {trainingType.category || "Uncategorised"}
                            </span>
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}
          </FormField>

          <FormField label="Notes">
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Explain any business rule, equivalency or mobilisation condition..."
              className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none ring-slate-200 focus:ring-2"
            />
          </FormField>

          {selectedTrainingType ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              <div className="font-bold">
                {selectedTrainingType.name}
              </div>
              <div className="mt-1">
                {selectedTrainingType.category ||
                  "Uncategorised training type"}

              </div>
            </div>
          ) : null}

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
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {editing ? "Save Changes" : "Add Requirement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyRoleModal({
  sourceRole,
  targetRole,
  replaceTargetRequirements,
  employeeRoles,
  saving,
  setSourceRole,
  setTargetRole,
  setReplaceTargetRequirements,
  onClose,
  onCopy,
}: {
  sourceRole: string;
  targetRole: string;
  replaceTargetRequirements: boolean;
  employeeRoles: string[];
  saving: boolean;
  setSourceRole: (value: string) => void;
  setTargetRole: (value: string) => void;
  setReplaceTargetRequirements: (value: boolean) => void;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
      <div className="my-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Copy Role Requirements
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Reuse an existing role profile without rebuilding each rule.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <FormField label="Copy from" required>
            <SelectField
              value={sourceRole}
              onChange={setSourceRole}
              options={[
                {
                  value: "",
                  label: "Select source role",
                },
                ...employeeRoles.map((role) => ({
                  value: role,
                  label: role,
                })),
              ]}
            />
          </FormField>

          <FormField label="Copy to" required>
            <SelectField
              value={targetRole}
              onChange={setTargetRole}
              options={[
                {
                  value: "",
                  label: "Select target role",
                },
                ...employeeRoles
                  .filter((role) => role !== sourceRole)
                  .map((role) => ({
                    value: role,
                    label: role,
                  })),
              ]}
            />
          </FormField>

          <button
            type="button"
            onClick={() =>
              setReplaceTargetRequirements(
                !replaceTargetRequirements,
              )
            }
            className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left ${
              replaceTargetRequirements
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                replaceTargetRequirements
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {replaceTargetRequirements ? (
                <Check size={13} />
              ) : null}
            </span>

            <span>
              <span className="block font-bold">
                Replace target role requirements
              </span>
              <span className="mt-1 block text-sm leading-6 opacity-80">
                Existing active requirements for the target role will
                be archived before the source requirements are copied.
                Leave this off to only add requirements that do not
                already exist.
              </span>
            </span>
          </button>

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

function HealthItem({
  label,
  value,
  good,
  detail,
}: {
  label: string;
  value: number;
  good: boolean;
  detail: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        good
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`text-sm font-bold ${
              good ? "text-emerald-900" : "text-amber-900"
            }`}
          >
            {label}
          </div>
          <p
            className={`mt-1 text-xs leading-5 ${
              good ? "text-emerald-700" : "text-amber-800"
            }`}
          >
            {detail}
          </p>
        </div>
        <span
          className={`text-2xl font-bold ${
            good ? "text-emerald-700" : "text-amber-800"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function CategoryCoverageRow({
  category,
  requirements,
  roles,
  totalRoles,
}: {
  category: string;
  requirements: number;
  roles: number;
  totalRoles: number;
}) {
  const coverage = Math.round((roles / Math.max(totalRoles, 1)) * 100);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-800">
            {category}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {requirements} rules across {roles} roles
          </div>
        </div>
        <span className="text-sm font-bold text-slate-700">{coverage}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-700"
          style={{ width: `${Math.min(coverage, 100)}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "rose" | "amber" | "sky" | "slate";
}) {
  const classes =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-slate-200 bg-white text-slate-800";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight">
            {value}
          </div>
          <div className="mt-1 text-xs opacity-70">{detail}</div>
        </div>

        <div className="rounded-xl bg-white/70 p-2.5">{icon}</div>
      </div>
    </div>
  );
}

function SmallCount({
  label,
  value,
  inverted,
}: {
  label: string;
  value: number;
  inverted: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 ${
        inverted ? "bg-white/10" : "bg-slate-50"
      }`}
    >
      <div
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          inverted ? "text-slate-300" : "text-slate-400"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-700">
        {value}
      </div>
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

      <h3 className="mt-4 text-lg font-bold text-slate-900">
        {title}
      </h3>

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

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-700">
        {label}
        {required ? (
          <span className="text-rose-500">*</span>
        ) : null}
      </div>

      {children}

      {hint ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {hint}
        </p>
      ) : null}
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
