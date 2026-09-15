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
  Download,
  Filter,
  Grid3X3,
  Loader2,
  RefreshCw,
  Search,
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

type RoleRequirement = RoleTrainingRequirementLike & {
  id: string;
};

type TrainingRecord = TrainingRecordLike & {
  training_name: string;
  category: string | null;
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

function cellClasses(status: TrainingComplianceStatus) {
  switch (status) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "expiring":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "expired":
    case "missing":
    case "revoked":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "pending_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "not_required":
      return "border-slate-200 bg-slate-50 text-slate-400";
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
      return "REV";
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
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [requirements, setRequirements] = useState<RoleRequirement[]>([]);

  const [search, setSearch] = useState("");
  const [crewFilter, setCrewFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
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
      recordResult.error,
      requirementResult.error,
    ].find(Boolean);

    if (firstError) throw new Error(firstError.message);

    setEmployees((employeeResult.data ?? []) as Employee[]);
    setCrews((crewResult.data ?? []) as Crew[]);
    setTypes((typeResult.data ?? []) as TrainingType[]);
    setRecords((recordResult.data ?? []) as TrainingRecord[]);
    setRequirements(
      (requirementResult.data ?? []) as RoleRequirement[],
    );
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

  const visibleTypes = useMemo(
    () =>
      types.filter((type) => {
        if (
          categoryFilter !== "all" &&
          clean(type.category) !== categoryFilter
        ) {
          return false;
        }

        if (requiredColumnsOnly && !requiredTypeIds.has(type.id)) {
          return false;
        }

        return true;
      }),
    [
      categoryFilter,
      requiredColumnsOnly,
      requiredTypeIds,
      types,
    ],
  );

  const requiredForEmployee = useCallback(
    (employee: Employee, trainingTypeId: string) => {
      const employeeRequirements = roleRequirementsForEmployee({
        employee,
        requirements,
      });

      return employeeRequirements.some(
        (requirement) =>
          requirement.training_type_id === trainingTypeId,
      );
    },
    [requirements],
  );

  const cellFor = useCallback(
    (employee: Employee, type: TrainingType) => {
      const employeeRequirements = roleRequirementsForEmployee({
        employee,
        requirements,
      });

      const requirement = employeeRequirements.find(
        (item) => item.training_type_id === type.id,
      );

      if (requirement) {
        return evaluateTrainingRequirement({
          employeeId: employee.id,
          requirement,
          records,
          defaultLeadDays: 60,
        });
      }

      return matrixStatusForTrainingType({
        employeeId: employee.id,
        trainingTypeId: type.id,
        records,
        leadDays:
          Array.isArray(type.expiry_warning_days) &&
          type.expiry_warning_days.length > 0
            ? Math.max(...type.expiry_warning_days)
            : 60,
        required: false,
      });
    },
    [records, requirements],
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
        return visibleTypes.some((type) => {
          const status = cellFor(employee, type).status;
          return ["missing", "expired", "revoked"].includes(status);
        });
      }

      return true;
    });
  }, [
    cellFor,
    crewById,
    crewFilter,
    employees,
    gapsOnly,
    roleFilter,
    search,
    visibleTypes,
  ]);

  const gapCount = useMemo(
    () =>
      employees.reduce(
        (total, employee) =>
          total +
          visibleTypes.filter((type) => {
            if (!requiredForEmployee(employee, type.id)) return false;
            const status = cellFor(employee, type).status;
            return ["missing", "expired", "revoked"].includes(status);
          }).length,
        0,
      ),
    [cellFor, employees, requiredForEmployee, visibleTypes],
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

  function exportMatrix() {
    const headers = [
      "Employee",
      "Payroll ID",
      "Role",
      "Crew",
      ...visibleTypes.map((type) => type.name),
    ];

    const rows = visibleEmployees.map((employee) => [
      employee.full_name,
      employee.payroll_id,
      employee.role,
      crewLabel(
        employee.crew_id ? crewById.get(employee.crew_id) : null,
      ),
      ...visibleTypes.map((type) =>
        trainingComplianceLabel(cellFor(employee, type).status),
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
      <main className="mx-auto w-full max-w-[1700px] space-y-6 px-4 py-6 sm:px-6">
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
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Employees are rows and configured Training types are columns.
                Role requirements make missing evidence visible instead of
                hiding an empty cell.
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700"
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
          <Metric label="Employees" value={employees.length} />
          <Metric label="Training Types" value={visibleTypes.length} />
          <Metric label="Role Requirements" value={requirements.length} />
          <Metric label="Current Gaps" value={gapCount} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-700">
            <Filter size={16} />
            Matrix filters
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
                { value: "all", label: "All roles" },
                ...roles.map((role) => ({
                  value: role,
                  label: role,
                })),
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

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={gapsOnly}
                  onChange={(event) => setGapsOnly(event.target.checked)}
                />
                Gaps only
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={requiredColumnsOnly}
                  onChange={(event) =>
                    setRequiredColumnsOnly(event.target.checked)
                  }
                />
                Required columns only
              </label>
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
                  {visibleTypes.map((type) => (
                    <th
                      key={type.id}
                      className="sticky top-0 z-20 min-w-36 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-center align-bottom"
                    >
                      <div className="text-xs font-black text-slate-800">
                        {type.short_code || type.name}
                      </div>
                      {type.short_code ? (
                        <div className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                          {type.name}
                        </div>
                      ) : null}
                    </th>
                  ))}
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

                    {visibleTypes.map((type) => {
                      const cell = cellFor(employee, type);
                      const required = requiredForEmployee(
                        employee,
                        type.id,
                      );

                      return (
                        <td
                          key={type.id}
                          className="border-b border-r border-slate-100 p-2 text-center"
                        >
                          <Link
                            href={`/people/training/register?employeeId=${encodeURIComponent(
                              employee.id,
                            )}&trainingTypeId=${encodeURIComponent(
                              type.id,
                            )}`}
                            title={`${type.name}: ${trainingComplianceLabel(
                              cell.status,
                            )}${
                              cell.daysRemaining !== null
                                ? ` (${cell.daysRemaining} days)`
                                : ""
                            }`}
                            className={`mx-auto flex min-h-12 w-20 items-center justify-center rounded-xl border px-2 text-xs font-black transition hover:ring-2 hover:ring-blue-200 ${cellClasses(
                              cell.status,
                            )}`}
                          >
                            <span>
                              {cellText(cell.status)}
                              {required &&
                              cell.status === "not_required"
                                ? "—"
                                : ""}
                            </span>
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {visibleEmployees.length === 0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No employees match the selected filters.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <strong>Legend:</strong> ✓ Current · ⚠ Expiring · EXP Expired ·
          — Missing required Training · P Pending Review · REV Revoked · blank
          means the Training type is not required and no record exists.
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

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black text-slate-950">
        {value}
      </div>
    </div>
  );
}
