"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Filter,
  Grid3X3,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";
import {
  evaluateTrainingRequirement,
  matrixStatusForTrainingType,
  normaliseTrainingRole,
  roleRequirementsForEmployee,
  trainingComplianceLabel,
  type RoleTrainingRequirementLike,
  type TrainingComplianceStatus,
  type TrainingRecordLike,
  type TrainingRequirementLike,
} from "@/lib/training/compliance";

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type Crew = {
  id: string;
  crew_number: string | null;
  crew_name: string | null;
};

type TrainingType = {
  id: string;
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;
  expiry_warning_days: number[] | null;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  active: boolean | null;
};

type RoleRequirement = RoleTrainingRequirementLike & {
  id: string;
};

type TrainingRecord = TrainingRecordLike & {
  training_name: string;
  category: string | null;
};

type MatrixColumn = {
  key: string;
  trainingTypeId: string;
  optionCode: string | null;
  optionName: string | null;
};

type SelectOption = {
  value: string;
  label: string;
  group?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function crewLabel(crew?: Crew | null) {
  if (!crew) return "Unassigned";
  const number = clean(crew.crew_number);
  const name = clean(crew.crew_name);
  if (number && name) return `Crew ${number} · ${name}`;
  if (number) return `Crew ${number}`;
  return name || "Unassigned";
}

function optionKey(trainingTypeId: string, code: string) {
  return `${trainingTypeId}::${clean(code).toUpperCase()}`;
}

function cellClasses(status: TrainingComplianceStatus) {
  switch (status) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "expiring":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "expired":
    case "missing":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "pending_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "revoked":
      return "border-slate-200 bg-slate-50 text-slate-400";
    case "not_required":
      return "border-slate-100 bg-white text-slate-300";
  }
}

function cellText(status: TrainingComplianceStatus) {
  switch (status) {
    case "current":
      return "✓";
    case "expiring":
      return "⚠";
    case "expired":
      return "EXP";
    case "missing":
      return "—";
    case "pending_review":
      return "P";
    case "revoked":
      return "";
    case "not_required":
      return "";
  }
}

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function CompanyTrainingMatrixPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [requirements, setRequirements] = useState<RoleRequirement[]>([]);

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<string[]>([]);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [requiredColumnsOnly, setRequiredColumnsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [
      employeeResult,
      crewResult,
      typeResult,
      optionResult,
      recordResult,
      requirementResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id,payroll_id,full_name,role,crew_id,active")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("crews")
        .select("id,crew_number,crew_name")
        .order("crew_number"),
      supabase
        .from("training_types")
        .select(
          "id,name,short_code,category,active,expiry_warning_days",
        )
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
        .from("employee_training_records")
        .select(
          "id,employee_id,training_type_id,training_name,category,workflow_status,record_status,current_version,superseded_at,revoked_at,does_not_expire,expiry_date,issue_date,created_at,option_codes",
        ),
      supabase
        .from("role_training_requirements")
        .select(
          "id,role_name,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,active",
        )
        .eq("active", true),
    ]);

    const firstError = [
      employeeResult.error,
      crewResult.error,
      typeResult.error,
      optionResult.error,
      recordResult.error,
      requirementResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setOptions((optionResult.data ?? []) as TrainingOption[]);
    setRecords((recordResult.data ?? []) as TrainingRecord[]);
    setRequirements((requirementResult.data ?? []) as RoleRequirement[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the Training Matrix.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const crewById = useMemo(
    () => new Map(crews.map((crew) => [crew.id, crew])),
    [crews],
  );

  const typeById = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types],
  );

  const roles = useMemo(
    () =>
      Array.from(
        new Set(
          employees.map((employee) => clean(employee.role)).filter(Boolean),
        ),
      ).sort(),
    [employees],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(types.map((type) => clean(type.category)).filter(Boolean)),
      ).sort(),
    [types],
  );

  const requiredTypeIds = useMemo(
    () =>
      new Set(
        requirements
          .filter((requirement) => requirement.active !== false)
          .map((requirement) => requirement.training_type_id),
      ),
    [requirements],
  );

  const baseTypes = useMemo(() => {
    const optionTypeIds = new Set(
      selectedOptionKeys
        .map((value) => value.split("::")[0])
        .filter(Boolean),
    );

    return types.filter((type) => {
      if (
        categoryFilter !== "all" &&
        clean(type.category) !== categoryFilter
      ) {
        return false;
      }

      if (requiredColumnsOnly && !requiredTypeIds.has(type.id)) {
        return false;
      }

      if (selectedTypeIds.length > 0) {
        return selectedTypeIds.includes(type.id);
      }

      if (optionTypeIds.size > 0) {
        return optionTypeIds.has(type.id);
      }

      return true;
    });
  }, [
    categoryFilter,
    requiredColumnsOnly,
    requiredTypeIds,
    selectedOptionKeys,
    selectedTypeIds,
    types,
  ]);

  const ticketFilterOptions = useMemo<SelectOption[]>(
    () =>
      types.map((type) => ({
        value: type.id,
        label: type.short_code
          ? `${type.short_code} · ${type.name}`
          : type.name,
        group: clean(type.category) || "Other",
      })),
    [types],
  );

  const classFilterOptions = useMemo<SelectOption[]>(() => {
    const allowedTypeIds = new Set(
      selectedTypeIds.length > 0
        ? selectedTypeIds
        : baseTypes.map((type) => type.id),
    );

    return options
      .filter((option) => allowedTypeIds.has(option.training_type_id))
      .map((option) => {
        const type = typeById.get(option.training_type_id);
        const typeLabel = type?.short_code || type?.name || "Training";
        return {
          value: optionKey(option.training_type_id, option.code),
          label: `${typeLabel} · ${option.name} (${option.code})`,
          group: type?.name || "Training",
        };
      });
  }, [baseTypes, options, selectedTypeIds, typeById]);

  useEffect(() => {
    const allowed = new Set(classFilterOptions.map((option) => option.value));
    setSelectedOptionKeys((current) =>
      current.filter((value) => allowed.has(value)),
    );
  }, [classFilterOptions]);

  const columns = useMemo<MatrixColumn[]>(() => {
    const selectedOptionSet = new Set(selectedOptionKeys);
    const result: MatrixColumn[] = [];

    for (const type of baseTypes) {
      const selectedForType = options.filter(
        (option) =>
          option.training_type_id === type.id &&
          selectedOptionSet.has(optionKey(type.id, option.code)),
      );

      if (selectedForType.length > 0) {
        for (const option of selectedForType) {
          result.push({
            key: optionKey(type.id, option.code),
            trainingTypeId: type.id,
            optionCode: option.code,
            optionName: option.name,
          });
        }
        continue;
      }

      result.push({
        key: type.id,
        trainingTypeId: type.id,
        optionCode: null,
        optionName: null,
      });
    }

    return result;
  }, [baseTypes, options, selectedOptionKeys]);

  const requirementForEmployee = useCallback(
    (employee: Employee, trainingTypeId: string) =>
      roleRequirementsForEmployee({
        employee,
        requirements,
      }).find((item) => item.training_type_id === trainingTypeId) ?? null,
    [requirements],
  );

  const requiredForEmployee = useCallback(
    (employee: Employee, column: MatrixColumn) => {
      const requirement = requirementForEmployee(
        employee,
        column.trainingTypeId,
      );

      if (!requirement) return false;
      if (!column.optionCode) return true;

      const requiredCodes = (requirement.required_option_codes ?? []).map(
        (code) => clean(code).toUpperCase(),
      );

      return requiredCodes.includes(clean(column.optionCode).toUpperCase());
    },
    [requirementForEmployee],
  );

  const cellFor = useCallback(
    (employee: Employee, column: MatrixColumn) => {
      const type = typeById.get(column.trainingTypeId);
      const baseRequirement = requirementForEmployee(
        employee,
        column.trainingTypeId,
      );
      const leadDays =
        Array.isArray(type?.expiry_warning_days) &&
        type.expiry_warning_days.length > 0
          ? Math.max(...type.expiry_warning_days)
          : 60;

      if (column.optionCode) {
        const requirement: TrainingRequirementLike = {
          ...(baseRequirement ?? {
            training_type_id: column.trainingTypeId,
            requirement_level: "recorded",
            renewal_lead_days: leadDays,
          }),
          training_type_id: column.trainingTypeId,
          required_option_codes: [column.optionCode],
        };

        return evaluateTrainingRequirement({
          employeeId: employee.id,
          requirement,
          records,
          defaultLeadDays: leadDays,
        });
      }

      if (baseRequirement) {
        return evaluateTrainingRequirement({
          employeeId: employee.id,
          requirement: baseRequirement,
          records,
          defaultLeadDays: leadDays,
        });
      }

      return matrixStatusForTrainingType({
        employeeId: employee.id,
        trainingTypeId: column.trainingTypeId,
        records,
        leadDays,
        required: false,
      });
    },
    [records, requirementForEmployee, typeById],
  );

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    return employees.filter((employee) => {
      if (
        crewFilter !== "all" &&
        (employee.crew_id || "unassigned") !== crewFilter
      ) {
        return false;
      }

      if (
        roleFilter !== "all" &&
        normaliseTrainingRole(employee.role) !==
          normaliseTrainingRole(roleFilter)
      ) {
        return false;
      }

      if (
        query &&
        ![
          employee.full_name,
          employee.payroll_id,
          employee.role,
          crewLabel(
            employee.crew_id
              ? crewById.get(employee.crew_id)
              : null,
          ),
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (gapsOnly) {
        return columns.some((column) => {
          if (!requiredForEmployee(employee, column)) return false;
          const status = cellFor(employee, column).status;
          return ["missing", "expired"].includes(status);
        });
      }

      return true;
    });
  }, [
    cellFor,
    columns,
    crewById,
    crewFilter,
    employees,
    gapsOnly,
    requiredForEmployee,
    roleFilter,
    search,
  ]);

  const gapCount = useMemo(
    () =>
      employees.reduce(
        (total, employee) =>
          total +
          columns.filter((column) => {
            if (!requiredForEmployee(employee, column)) return false;
            return ["missing", "expired"].includes(
              cellFor(employee, column).status,
            );
          }).length,
        0,
      ),
    [cellFor, columns, employees, requiredForEmployee],
  );

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      await loadData();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh the matrix.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  function clearColumnFilters() {
    setSelectedTypeIds([]);
    setSelectedOptionKeys([]);
  }

  function exportMatrix() {
    const headers = [
      "Employee",
      "Payroll ID",
      "Role",
      "Crew",
      ...columns.map((column) => {
        const type = typeById.get(column.trainingTypeId);
        return column.optionCode
          ? `${type?.name ?? "Training"} - ${column.optionName ?? column.optionCode} (${column.optionCode})`
          : type?.name ?? column.trainingTypeId;
      }),
    ];

    const rows = visibleEmployees.map((employee) => [
      employee.full_name,
      employee.payroll_id,
      employee.role,
      crewLabel(
        employee.crew_id ? crewById.get(employee.crew_id) : null,
      ),
      ...columns.map((column) =>
        trainingComplianceLabel(cellFor(employee, column).status),
      ),
    ]);

    const content = [
      headers.map(csv).join(","),
      ...rows.map((row) => row.map(csv).join(",")),
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `training-matrix-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
      <main className="mx-auto w-full max-w-[1700px] space-y-5 px-4 py-6 sm:px-6">
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
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                <Grid3X3 size={17} />
                Company compliance
              </div>
              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Training Matrix
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Filter the matrix down to the tickets and configured classes you
                actually need to review. Classes come directly from Training
                Configuration; none are hard-coded into this page.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={exportMatrix}
                disabled={columns.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                <Download size={16} />
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Employees" value={visibleEmployees.length} />
          <Metric label="Visible columns" value={columns.length} />
          <Metric label="Role requirements" value={requirements.length} />
          <Metric label="Current gaps" value={gapCount} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-black text-slate-700">
              <Filter size={16} />
              Matrix filters
            </div>
            {(selectedTypeIds.length > 0 || selectedOptionKeys.length > 0) && (
              <button
                type="button"
                onClick={clearColumnFilters}
                className="inline-flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-slate-900"
              >
                <X size={14} />
                Clear ticket filters
              </button>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-6">
            <label className="relative xl:col-span-2">
              <Search
                size={16}
                className="absolute left-3 top-3.5 text-slate-400"
              />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Search employees..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <MultiSelectFilter
              label="Tickets"
              emptyLabel="All tickets"
              options={ticketFilterOptions}
              selected={selectedTypeIds}
              onChange={setSelectedTypeIds}
            />

            <MultiSelectFilter
              label="Classes / options"
              emptyLabel="All classes"
              options={classFilterOptions}
              selected={selectedOptionKeys}
              onChange={setSelectedOptionKeys}
              disabled={classFilterOptions.length === 0}
            />

            <Select
              value={crewFilter}
              onChange={setCrewFilter}
              options={[
                { value: "all", label: "All crews" },
                { value: "unassigned", label: "Unassigned" },
                ...crews.map((crew) => ({
                  value: crew.id,
                  label: crewLabel(crew),
                })),
              ]}
            />

            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: "all", label: "All employee roles" },
                ...roles.map((role) => ({ value: role, label: role })),
              ]}
            />

            <Select
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

            <div className="flex flex-wrap gap-2 xl:col-span-3">
              <Toggle
                checked={gapsOnly}
                onChange={setGapsOnly}
                label="Required gaps only"
              />
              <Toggle
                checked={requiredColumnsOnly}
                onChange={setRequiredColumnsOnly}
                label="Required tickets only"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-auto">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 min-w-64 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                    Employee
                  </th>
                  {columns.map((column) => {
                    const type = typeById.get(column.trainingTypeId);
                    return (
                      <th
                        key={column.key}
                        className="sticky top-0 z-20 min-w-28 border-b border-r border-slate-200 bg-slate-100 px-2 py-3 text-center align-bottom"
                      >
                        <div className="text-xs font-black text-slate-800">
                          {type?.short_code || type?.name || "Training"}
                        </div>
                        {column.optionCode ? (
                          <div className="mt-1 rounded-md bg-white/80 px-1.5 py-1 text-[10px] font-black text-slate-600">
                            {column.optionName || column.optionCode}
                            <span className="ml-1 text-slate-400">
                              {column.optionCode}
                            </span>
                          </div>
                        ) : type?.short_code ? (
                          <div className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                            {type.name}
                          </div>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3">
                      <div className="font-black text-slate-950">
                        {employee.full_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {employee.role || "No role"} ·{" "}
                        {crewLabel(
                          employee.crew_id
                            ? crewById.get(employee.crew_id)
                            : null,
                        )}
                      </div>
                    </td>

                    {columns.map((column) => {
                      const cell = cellFor(employee, column);
                      const required = requiredForEmployee(employee, column);

                      return (
                        <td
                          key={column.key}
                          className="border-b border-r border-slate-100 p-1.5 text-center"
                        >
                          <Link
                            href={`/people/training/register?employeeId=${encodeURIComponent(
                              employee.id,
                            )}&trainingTypeId=${encodeURIComponent(
                              column.trainingTypeId,
                            )}`}
                            title={`${
                              typeById.get(column.trainingTypeId)?.name ??
                              "Training"
                            }${
                              column.optionCode
                                ? ` · ${column.optionName || column.optionCode}`
                                : ""
                            }: ${trainingComplianceLabel(cell.status)}${
                              cell.daysRemaining !== null
                                ? ` (${cell.daysRemaining} days)`
                                : ""
                            }`}
                            className={`mx-auto flex h-10 w-16 items-center justify-center rounded-lg border px-1 text-[11px] font-black transition hover:ring-2 hover:ring-blue-200 ${cellClasses(
                              cell.status,
                            )}`}
                          >
                            {cellText(cell.status)}
                            {required && cell.status === "not_required" ? "—" : ""}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {columns.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No Training columns match the selected ticket filters.
            </div>
          ) : visibleEmployees.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No employees match the selected filters.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <strong>Legend:</strong> ✓ Current · ⚠ Expiring · EXP Expired · — Missing
          required Training · P Pending Review · blank means the ticket/class is
          not required or no live record exists. Removed/revoked uploads are
          treated as history and no longer leave an optional matrix cell red.
        </section>
      </main>
    </AppShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function MultiSelectFilter({
  label,
  emptyLabel,
  options,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  emptyLabel: string;
  options: SelectOption[];
  selected: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return options;
    return options.filter((option) =>
      `${option.label} ${option.group ?? ""}`.toLowerCase().includes(value),
    );
  }, [options, query]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:bg-slate-50 disabled:text-slate-400`}
      >
        <span className="min-w-0 truncate">
          {selected.length === 0
            ? emptyLabel
            : `${label}: ${selected.length} selected`}
        </span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" />
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(440px,90vw)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className={`${inputClass} py-2.5 pl-9`}
              />
            </div>
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-600"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto">
            {filtered.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800">
                      {option.label}
                    </span>
                    {option.group ? (
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {option.group}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm font-semibold text-slate-400">
                No matches.
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white"
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}
