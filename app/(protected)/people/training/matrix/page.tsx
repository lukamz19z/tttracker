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

/* =========================================================
   Types
   ========================================================= */

type MatrixMode =
  | "status"
  | "detailed";

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

  expiry_warning_days:
    | number[]
    | null;

  requires_certificate_number:
    | boolean
    | null;

  requires_expiry_date:
    | boolean
    | null;

  validity_mode:
    | string
    | null;

  subtype_mode:
    | string
    | null;

  sort_order:
    | number
    | null;
};

type RoleRequirement =
  RoleTrainingRequirementLike & {
    id: string;
  };

type TrainingRecord =
  TrainingRecordLike & {
    training_name: string;
    category: string | null;

    certificate_number:
      | string
      | null;

    option_codes:
      | string[]
      | null;

    class_codes:
      | string[]
      | null;

    metadata:
      | Record<
          string,
          unknown
        >
      | null;
  };

type DetailField =
  | "classes"
  | "number"
  | "expiry"
  | "status";

/* =========================================================
   Helpers
   ========================================================= */

function clean(
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function crewLabel(
  crew?: Crew | null,
) {
  if (!crew) {
    return "Unassigned";
  }

  const number =
    clean(
      crew.crew_number,
    );

  const name =
    clean(
      crew.crew_name,
    );

  if (
    number &&
    name
  ) {
    return `Crew ${number} · ${name}`;
  }

  if (number) {
    return `Crew ${number}`;
  }

  return (
    name ||
    "Unassigned"
  );
}

function formatDate(
  value:
    | string
    | null
    | undefined,
) {
  const raw =
    clean(value);

  if (!raw) {
    return "";
  }

  const date =
    new Date(
      `${raw.slice(
        0,
        10,
      )}T00:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return raw;
  }

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(date);
}

function cellClasses(
  status:
    TrainingComplianceStatus,
) {
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

function cellText(
  status:
    TrainingComplianceStatus,
) {
  switch (status) {
    case "current":
      return "✓";

    case "expiring":
      return "⚠";

    case "expired":
      return "EXP";

    case "missing":
      return "MISSING";

    case "pending_review":
      return "PENDING";

    case "revoked":
      return "REV";

    case "not_required":
      return "N/A";
  }
}

function csv(
  value: unknown,
) {
  return `"${String(
    value ?? "",
  ).replace(
    /"/g,
    '""',
  )}"`;
}

function currentRecordForType({
  employeeId,
  trainingTypeId,
  records,
}: {
  employeeId: string;
  trainingTypeId: string;
  records: TrainingRecord[];
}) {
  return (
    records
      .filter(
        (record) =>
          record.employee_id ===
            employeeId &&
          record.training_type_id ===
            trainingTypeId &&
          record.workflow_status ===
            "approved" &&
          record.current_version !==
            false &&
          !record.superseded_at &&
          !record.revoked_at,
      )
      .sort(
        (a, b) =>
          new Date(
            clean(
              b.created_at,
            ) || 0,
          ).getTime() -
          new Date(
            clean(
              a.created_at,
            ) || 0,
          ).getTime(),
      )[0] ?? null
  );
}

function classCodes(
  record:
    | TrainingRecord
    | null,
) {
  if (!record) {
    return "";
  }

  const codes =
    Array.from(
      new Set(
        [
          ...(Array.isArray(
            record.option_codes,
          )
            ? record.option_codes
            : []),

          ...(Array.isArray(
            record.class_codes,
          )
            ? record.class_codes
            : []),
        ]
          .map(clean)
          .filter(Boolean),
      ),
    );

  return codes.join(" ");
}

function detailFieldsForType(
  type: TrainingType,
): DetailField[] {
  const fields:
    DetailField[] = [];

  /**
   * Any Training Type configured with classes/options
   * automatically gets a Classes column.
   *
   * This covers:
   * - Driver Licence C / LR / MR / HR / HC / MC
   * - HRWL LF / WP / DG / RB / CN / RI etc.
   * - future configurable Training Types
   *
   * No Training names are hard-coded.
   */
  if (
    clean(
      type.subtype_mode,
    ) !== "none" &&
    clean(
      type.subtype_mode,
    )
  ) {
    fields.push(
      "classes",
    );
  }

  if (
    type.requires_certificate_number ===
    true
  ) {
    fields.push(
      "number",
    );
  }

  if (
    clean(
      type.validity_mode,
    ) !== "never" ||
    type.requires_expiry_date ===
      true
  ) {
    fields.push(
      "expiry",
    );
  }

  /**
   * Every type gets Status so a blank value is never
   * ambiguous between Missing and Not Required.
   */
  fields.push(
    "status",
  );

  return fields;
}

function detailHeading(
  field: DetailField,
) {
  switch (field) {
    case "classes":
      return "Class / Tickets";

    case "number":
      return "Number";

    case "expiry":
      return "Expiry";

    case "status":
      return "Status";
  }
}

function detailedValue({
  field,
  record,
  status,
}: {
  field: DetailField;
  record:
    | TrainingRecord
    | null;
  status:
    TrainingComplianceStatus;
}) {
  if (
    field === "status"
  ) {
    return trainingComplianceLabel(
      status,
    );
  }

  /**
   * Do not display an old / revoked / superseded value
   * merely because one existed historically.
   */
  if (!record) {
    return status ===
      "not_required"
      ? "N/A"
      : status ===
          "pending_review"
        ? "PENDING"
        : "—";
  }

  if (
    field ===
    "classes"
  ) {
    return (
      classCodes(
        record,
      ) || "—"
    );
  }

  if (
    field === "number"
  ) {
    return (
      clean(
        record.certificate_number,
      ) || "—"
    );
  }

  if (
    field === "expiry"
  ) {
    if (
      record.does_not_expire
    ) {
      return "No Expiry";
    }

    return (
      formatDate(
        record.expiry_date,
      ) || "—"
    );
  }

  return "—";
}

/* =========================================================
   Page
   ========================================================= */

export default function CompanyTrainingMatrixPage() {
  const supabase =
    useMemo(
      () =>
        createSupabaseBrowser(),
      [],
    );

  const [
    employees,
    setEmployees,
  ] =
    useState<Employee[]>([]);

  const [
    crews,
    setCrews,
  ] =
    useState<Crew[]>([]);

  const [
    types,
    setTypes,
  ] =
    useState<
      TrainingType[]
    >([]);

  const [
    records,
    setRecords,
  ] =
    useState<
      TrainingRecord[]
    >([]);

  const [
    requirements,
    setRequirements,
  ] =
    useState<
      RoleRequirement[]
    >([]);

  const [
    mode,
    setMode,
  ] =
    useState<MatrixMode>(
      "detailed",
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    crewFilter,
    setCrewFilter,
  ] =
    useState("all");

  const [
    roleFilter,
    setRoleFilter,
  ] =
    useState("all");

  const [
    categoryFilter,
    setCategoryFilter,
  ] =
    useState("all");

  const [
    gapsOnly,
    setGapsOnly,
  ] =
    useState(false);

  const [
    requiredColumnsOnly,
    setRequiredColumnsOnly,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  /* =======================================================
     Load data
     ======================================================= */

  const loadData =
    useCallback(
      async () => {
        const [
          employeeResult,
          crewResult,
          typeResult,
          recordResult,
          requirementResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "employees",
              )
              .select(
                "id,payroll_id,full_name,role,crew_id,active",
              )
              .eq(
                "active",
                true,
              )
              .order(
                "full_name",
              ),

            supabase
              .from(
                "crews",
              )
              .select(
                "id,crew_number,crew_name",
              )
              .order(
                "crew_number",
              ),

            supabase
              .from(
                "training_types",
              )
              .select(
                "id,name,short_code,category,active,expiry_warning_days,requires_certificate_number,requires_expiry_date,validity_mode,subtype_mode,sort_order",
              )
              .eq(
                "active",
                true,
              )
              .order(
                "sort_order",
              )
              .order(
                "name",
              ),

            supabase
              .from(
                "employee_training_records",
              )
              .select(
                "id,employee_id,training_type_id,training_name,category,workflow_status,record_status,current_version,superseded_at,revoked_at,does_not_expire,expiry_date,issue_date,created_at,certificate_number,option_codes,class_codes,metadata",
              ),

            supabase
              .from(
                "role_training_requirements",
              )
              .select(
                "id,role_name,training_type_id,requirement_level,renewal_lead_days,accepted_alternative_training_type_ids,required_option_codes,active",
              )
              .eq(
                "active",
                true,
              ),
          ]);

        const firstError =
          [
            employeeResult.error,
            crewResult.error,
            typeResult.error,
            recordResult.error,
            requirementResult.error,
          ].find(Boolean);

        if (
          firstError
        ) {
          throw new Error(
            firstError.message,
          );
        }

        setEmployees(
          (employeeResult.data ??
            []) as Employee[],
        );

        setCrews(
          (crewResult.data ??
            []) as Crew[],
        );

        setTypes(
          (typeResult.data ??
            []) as TrainingType[],
        );

        setRecords(
          (recordResult.data ??
            []) as TrainingRecord[],
        );

        setRequirements(
          (requirementResult.data ??
            []) as RoleRequirement[],
        );
      },
      [supabase],
    );

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (
        loadError
      ) {
        setError(
          loadError instanceof
          Error
            ? loadError.message
            : "Unable to load the Training Matrix.",
        );
      } finally {
        setLoading(
          false,
        );
      }
    })();
  }, [loadData]);

  /* =======================================================
     Maps / filters
     ======================================================= */

  const crewById =
    useMemo(
      () =>
        new Map(
          crews.map(
            (crew) => [
              crew.id,
              crew,
            ],
          ),
        ),
      [crews],
    );

  const roles =
    useMemo(
      () =>
        Array.from(
          new Set(
            employees
              .map(
                (
                  employee,
                ) =>
                  clean(
                    employee.role,
                  ),
              )
              .filter(
                Boolean,
              ),
          ),
        ).sort(),
      [employees],
    );

  const categories =
    useMemo(
      () =>
        Array.from(
          new Set(
            types
              .map(
                (type) =>
                  clean(
                    type.category,
                  ),
              )
              .filter(
                Boolean,
              ),
          ),
        ).sort(),
      [types],
    );

  const requiredTypeIds =
    useMemo(
      () =>
        new Set(
          requirements
            .filter(
              (
                requirement,
              ) =>
                requirement.active !==
                false,
            )
            .map(
              (
                requirement,
              ) =>
                requirement.training_type_id,
            ),
        ),
      [requirements],
    );

  const visibleTypes =
    useMemo(
      () =>
        types.filter(
          (type) => {
            if (
              categoryFilter !==
                "all" &&
              clean(
                type.category,
              ) !==
                categoryFilter
            ) {
              return false;
            }

            if (
              requiredColumnsOnly &&
              !requiredTypeIds.has(
                type.id,
              )
            ) {
              return false;
            }

            return true;
          },
        ),
      [
        categoryFilter,
        requiredColumnsOnly,
        requiredTypeIds,
        types,
      ],
    );

  const requiredForEmployee =
    useCallback(
      (
        employee:
          Employee,
        trainingTypeId:
          string,
      ) => {
        const employeeRequirements =
          roleRequirementsForEmployee(
            {
              employee,
              requirements,
            },
          );

        return employeeRequirements.some(
          (
            requirement,
          ) =>
            requirement.training_type_id ===
            trainingTypeId,
        );
      },
      [requirements],
    );

  const cellFor =
    useCallback(
      (
        employee:
          Employee,
        type:
          TrainingType,
      ) => {
        const employeeRequirements =
          roleRequirementsForEmployee(
            {
              employee,
              requirements,
            },
          );

        const requirement =
          employeeRequirements.find(
            (item) =>
              item.training_type_id ===
              type.id,
          );

        if (
          requirement
        ) {
          return evaluateTrainingRequirement(
            {
              employeeId:
                employee.id,

              requirement,

              records,

              defaultLeadDays:
                60,
            },
          );
        }

        return matrixStatusForTrainingType(
          {
            employeeId:
              employee.id,

            trainingTypeId:
              type.id,

            records,

            leadDays:
              Array.isArray(
                type.expiry_warning_days,
              ) &&
              type.expiry_warning_days.length >
                0
                ? Math.max(
                    ...type.expiry_warning_days,
                  )
                : 60,

            required:
              false,
          },
        );
      },
      [
        records,
        requirements,
      ],
    );

  const visibleEmployees =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return employees.filter(
        (employee) => {
          if (
            crewFilter !==
              "all" &&
            (employee.crew_id ||
              "unassigned") !==
              crewFilter
          ) {
            return false;
          }

          if (
            roleFilter !==
              "all" &&
            normaliseTrainingRole(
              employee.role,
            ) !==
              normaliseTrainingRole(
                roleFilter,
              )
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
                  ? crewById.get(
                      employee.crew_id,
                    )
                  : null,
              ),
            ]
              .map(clean)
              .join(" ")
              .toLowerCase()
              .includes(
                query,
              )
          ) {
            return false;
          }

          if (
            gapsOnly
          ) {
            return visibleTypes.some(
              (type) => {
                const status =
                  cellFor(
                    employee,
                    type,
                  ).status;

                return [
                  "missing",
                  "expired",
                  "revoked",
                ].includes(
                  status,
                );
              },
            );
          }

          return true;
        },
      );
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

  const gapCount =
    useMemo(
      () =>
        employees.reduce(
          (
            total,
            employee,
          ) =>
            total +
            visibleTypes.filter(
              (type) => {
                if (
                  !requiredForEmployee(
                    employee,
                    type.id,
                  )
                ) {
                  return false;
                }

                const status =
                  cellFor(
                    employee,
                    type,
                  ).status;

                return [
                  "missing",
                  "expired",
                  "revoked",
                ].includes(
                  status,
                );
              },
            ).length,
          0,
        ),
      [
        cellFor,
        employees,
        requiredForEmployee,
        visibleTypes,
      ],
    );

  /* =======================================================
     Refresh
     ======================================================= */

  async function refresh() {
    setRefreshing(
      true,
    );

    setError("");

    try {
      await loadData();
    } catch (
      refreshError
    ) {
      setError(
        refreshError instanceof
        Error
          ? refreshError.message
          : "Unable to refresh the matrix.",
      );
    } finally {
      setRefreshing(
        false,
      );
    }
  }

  /* =======================================================
     CSV export
     ======================================================= */

  function exportMatrix() {
    if (
      mode === "status"
    ) {
      const headers = [
        "Employee",
        "Payroll ID",
        "Role",
        "Crew",

        ...visibleTypes.map(
          (type) =>
            type.name,
        ),
      ];

      const rows =
        visibleEmployees.map(
          (employee) => [
            employee.full_name,
            employee.payroll_id,
            employee.role,

            crewLabel(
              employee.crew_id
                ? crewById.get(
                    employee.crew_id,
                  )
                : null,
            ),

            ...visibleTypes.map(
              (type) =>
                trainingComplianceLabel(
                  cellFor(
                    employee,
                    type,
                  )
                    .status,
                ),
            ),
          ],
        );

      downloadCsv(
        [
          headers,
          ...rows,
        ],
        "training-matrix-status",
      );

      return;
    }

    /**
     * Detailed export uses flattened headers because CSV
     * does not support merged cells.
     *
     * Example:
     * HRWL - Class / Tickets
     * HRWL - Number
     * HRWL - Expiry
     */
    const detailedHeaders =
      visibleTypes.flatMap(
        (type) =>
          detailFieldsForType(
            type,
          ).map(
            (field) =>
              `${type.name} - ${detailHeading(
                field,
              )}`,
          ),
      );

    const headers = [
      "Employee",
      "Payroll ID",
      "Role",
      "Crew",
      ...detailedHeaders,
    ];

    const rows =
      visibleEmployees.map(
        (employee) => {
          const values =
            visibleTypes.flatMap(
              (type) => {
                const status =
                  cellFor(
                    employee,
                    type,
                  ).status;

                const record =
                  currentRecordForType(
                    {
                      employeeId:
                        employee.id,

                      trainingTypeId:
                        type.id,

                      records,
                    },
                  );

                return detailFieldsForType(
                  type,
                ).map(
                  (field) =>
                    detailedValue(
                      {
                        field,
                        record,
                        status,
                      },
                    ),
                );
              },
            );

          return [
            employee.full_name,
            employee.payroll_id,
            employee.role,

            crewLabel(
              employee.crew_id
                ? crewById.get(
                    employee.crew_id,
                  )
                : null,
            ),

            ...values,
          ];
        },
      );

    downloadCsv(
      [
        headers,
        ...rows,
      ],
      "training-matrix-detailed",
    );
  }

  function downloadCsv(
    rows:
      unknown[][],
    prefix:
      string,
  ) {
    const content =
      rows
        .map(
          (row) =>
            row
              .map(csv)
              .join(","),
        )
        .join("\n");

    const blob =
      new Blob(
        [content],
        {
          type:
            "text/csv;charset=utf-8;",
        },
      );

    const url =
      URL.createObjectURL(
        blob,
      );

    const link =
      document.createElement(
        "a",
      );

    link.href =
      url;

    link.download =
      `${prefix}-${new Date()
        .toISOString()
        .slice(
          0,
          10,
        )}.csv`;

    link.click();

    URL.revokeObjectURL(
      url,
    );
  }

  /* =======================================================
     Loading
     ======================================================= */

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2
            size={30}
            className="animate-spin text-slate-400"
          />
        </div>
      </AppShell>
    );
  }

  /* =======================================================
     UI
     ======================================================= */

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1900px] space-y-6 px-4 py-6 sm:px-6">
        <Link
          href="/people/training"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700"
        >
          <ArrowLeft
            size={16}
          />

          Back to Training
        </Link>

        {/* Header */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                <Grid3X3
                  size={17}
                />

                Company compliance
              </div>

              <h1 className="mt-2 text-3xl font-black text-slate-950">
                Training Matrix
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Employees are rows and configured Training Types are columns.
                Detailed View also shows configured licence classes, ticket
                classes, certificate numbers and expiry dates.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void refresh()
                }
                disabled={
                  refreshing
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <RefreshCw
                    size={16}
                  />
                )}

                Refresh
              </button>

              <button
                type="button"
                onClick={
                  exportMatrix
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
              >
                <Download
                  size={16}
                />

                Export{" "}
                {mode ===
                "detailed"
                  ? "Detailed"
                  : "Status"}{" "}
                CSV
              </button>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {/* Metrics */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Metric
            label="Employees"
            value={
              visibleEmployees.length
            }
          />

          <Metric
            label="Training Types"
            value={
              visibleTypes.length
            }
          />

          <Metric
            label="Required Gaps"
            value={
              gapCount
            }
          />
        </section>

        {/* Mode */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setMode(
                  "status",
                )
              }
              className={`rounded-xl px-4 py-2 text-sm font-black ${
                mode ===
                "status"
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              Status View
            </button>

            <button
              type="button"
              onClick={() =>
                setMode(
                  "detailed",
                )
              }
              className={`rounded-xl px-4 py-2 text-sm font-black ${
                mode ===
                "detailed"
                  ? "bg-blue-700 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              Detailed View
            </button>
          </div>
        </section>

        {/* Filters */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(170px,1fr))]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={
                  search
                }
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search employee, payroll ID, role or crew..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-400"
              />
            </label>

            <select
              value={
                crewFilter
              }
              onChange={(event) =>
                setCrewFilter(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
            >
              <option value="all">
                All crews
              </option>

              <option value="unassigned">
                Unassigned
              </option>

              {crews.map(
                (crew) => (
                  <option
                    key={
                      crew.id
                    }
                    value={
                      crew.id
                    }
                  >
                    {crewLabel(
                      crew,
                    )}
                  </option>
                ),
              )}
            </select>

            <select
              value={
                roleFilter
              }
              onChange={(event) =>
                setRoleFilter(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
            >
              <option value="all">
                All roles
              </option>

              {roles.map(
                (role) => (
                  <option
                    key={
                      role
                    }
                    value={
                      role
                    }
                  >
                    {role}
                  </option>
                ),
              )}
            </select>

            <select
              value={
                categoryFilter
              }
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value,
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"
            >
              <option value="all">
                All categories
              </option>

              {categories.map(
                (
                  category,
                ) => (
                  <option
                    key={
                      category
                    }
                    value={
                      category
                    }
                  >
                    {category}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={
                  gapsOnly
                }
                onChange={(event) =>
                  setGapsOnly(
                    event.target.checked,
                  )
                }
              />

              Employees with gaps only
            </label>

            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={
                  requiredColumnsOnly
                }
                onChange={(event) =>
                  setRequiredColumnsOnly(
                    event.target.checked,
                  )
                }
              />

              Required Training Types only
            </label>
          </div>
        </section>

        {/* Matrix */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-auto">
            {mode ===
            "status" ? (
              <StatusMatrix
                employees={
                  visibleEmployees
                }
                types={
                  visibleTypes
                }
                crewById={
                  crewById
                }
                cellFor={
                  cellFor
                }
              />
            ) : (
              <DetailedMatrix
                employees={
                  visibleEmployees
                }
                types={
                  visibleTypes
                }
                records={
                  records
                }
                crewById={
                  crewById
                }
                cellFor={
                  cellFor
                }
              />
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

/* =========================================================
   Status matrix
   ========================================================= */

function StatusMatrix({
  employees,
  types,
  crewById,
  cellFor,
}: {
  employees:
    Employee[];

  types:
    TrainingType[];

  crewById:
    Map<
      string,
      Crew
    >;

  cellFor: (
    employee:
      Employee,
    type:
      TrainingType,
  ) => {
    status:
      TrainingComplianceStatus;
  };
}) {
  return (
    <table className="min-w-max border-collapse text-sm">
      <thead>
        <tr className="bg-slate-50">
          <th className="sticky left-0 z-30 min-w-[230px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-black text-slate-700">
            Employee
          </th>

          {types.map(
            (type) => (
              <th
                key={
                  type.id
                }
                className="min-w-[125px] border-b border-r border-slate-200 px-3 py-3 text-center font-black text-slate-700"
              >
                {type.name}
              </th>
            ),
          )}
        </tr>
      </thead>

      <tbody>
        {employees.map(
          (employee) => (
            <tr
              key={
                employee.id
              }
              className="hover:bg-slate-50/50"
            >
              <EmployeeCell
                employee={
                  employee
                }
                crew={
                  employee.crew_id
                    ? crewById.get(
                        employee.crew_id,
                      )
                    : null
                }
              />

              {types.map(
                (type) => {
                  const status =
                    cellFor(
                      employee,
                      type,
                    ).status;

                  return (
                    <td
                      key={
                        `${employee.id}-${type.id}`
                      }
                      className="border-b border-r border-slate-100 p-1.5 text-center"
                    >
                      <div
                        className={`rounded-lg border px-2 py-2 text-xs font-black ${cellClasses(
                          status,
                        )}`}
                        title={
                          trainingComplianceLabel(
                            status,
                          )
                        }
                      >
                        {cellText(
                          status,
                        )}
                      </div>
                    </td>
                  );
                },
              )}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/* =========================================================
   Detailed matrix
   ========================================================= */

function DetailedMatrix({
  employees,
  types,
  records,
  crewById,
  cellFor,
}: {
  employees:
    Employee[];

  types:
    TrainingType[];

  records:
    TrainingRecord[];

  crewById:
    Map<
      string,
      Crew
    >;

  cellFor: (
    employee:
      Employee,
    type:
      TrainingType,
  ) => {
    status:
      TrainingComplianceStatus;
  };
}) {
  return (
    <table className="min-w-max border-collapse text-xs">
      <thead>
        {/* Top grouped Training headings */}
        <tr className="bg-slate-950 text-white">
          <th
            rowSpan={2}
            className="sticky left-0 z-40 min-w-[240px] border-b border-r border-slate-700 bg-slate-950 px-4 py-3 text-left text-sm font-black"
          >
            Employee
          </th>

          {types.map(
            (type) => {
              const fields =
                detailFieldsForType(
                  type,
                );

              return (
                <th
                  key={
                    type.id
                  }
                  colSpan={
                    fields.length
                  }
                  className="border-b border-r border-slate-700 px-3 py-3 text-center text-sm font-black"
                >
                  {type.name}
                </th>
              );
            },
          )}
        </tr>

        {/* Sub headings */}
        <tr className="bg-slate-100">
          {types.flatMap(
            (type) =>
              detailFieldsForType(
                type,
              ).map(
                (field) => (
                  <th
                    key={`${type.id}-${field}`}
                    className="min-w-[105px] border-b border-r border-slate-200 px-2 py-2 text-center font-black text-slate-600"
                  >
                    {detailHeading(
                      field,
                    )}
                  </th>
                ),
              ),
          )}
        </tr>
      </thead>

      <tbody>
        {employees.map(
          (employee) => (
            <tr
              key={
                employee.id
              }
              className="hover:bg-slate-50"
            >
              <EmployeeCell
                employee={
                  employee
                }
                crew={
                  employee.crew_id
                    ? crewById.get(
                        employee.crew_id,
                      )
                    : null
                }
              />

              {types.flatMap(
                (type) => {
                  const result =
                    cellFor(
                      employee,
                      type,
                    );

                  const record =
                    currentRecordForType(
                      {
                        employeeId:
                          employee.id,

                        trainingTypeId:
                          type.id,

                        records,
                      },
                    );

                  return detailFieldsForType(
                    type,
                  ).map(
                    (field) => {
                      const value =
                        detailedValue(
                          {
                            field,
                            record,
                            status:
                              result.status,
                          },
                        );

                      return (
                        <td
                          key={`${employee.id}-${type.id}-${field}`}
                          className="border-b border-r border-slate-100 p-1.5 text-center"
                        >
                          {field ===
                          "status" ? (
                            <div
                              className={`rounded-md border px-2 py-1.5 font-black ${cellClasses(
                                result.status,
                              )}`}
                            >
                              {
                                value
                              }
                            </div>
                          ) : (
                            <div
                              className={`whitespace-nowrap rounded-md px-2 py-1.5 font-bold ${
                                result.status ===
                                "not_required"
                                  ? "text-slate-400"
                                  : result.status ===
                                        "expired" ||
                                      result.status ===
                                        "missing" ||
                                      result.status ===
                                        "revoked"
                                    ? "text-rose-700"
                                    : "text-slate-800"
                              }`}
                            >
                              {
                                value
                              }
                            </div>
                          )}
                        </td>
                      );
                    },
                  );
                },
              )}
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/* =========================================================
   Shared UI
   ========================================================= */

function EmployeeCell({
  employee,
  crew,
}: {
  employee:
    Employee;

  crew?:
    Crew
    | null;
}) {
  return (
    <td className="sticky left-0 z-20 border-b border-r border-slate-200 bg-white px-4 py-3">
      <div className="font-black text-slate-950">
        {
          employee.full_name
        }
      </div>

      <div className="mt-1 whitespace-nowrap text-[11px] font-semibold text-slate-500">
        {[
          employee.payroll_id,
          employee.role,
          crewLabel(
            crew,
          ),
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </td>
  );
}

function Metric({
  label,
  value,
}: {
  label:
    string;

  value:
    number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-3xl font-black text-slate-950">
        {value}
      </div>
    </div>
  );
}