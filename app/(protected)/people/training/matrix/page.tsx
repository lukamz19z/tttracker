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

    created_at:
      | string
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
  crew?:
    | Crew
    | null,
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

/**
 * Return the current APPROVED record for this employee +
 * configured Training Type.
 *
 * Historical superseded/revoked evidence is deliberately ignored.
 */
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
          clean(
            record.workflow_status,
          ) ===
            "approved" &&
          record.current_version !==
            false &&
          !record.superseded_at &&
          !record.revoked_at,
      )
      .sort(
        (a, b) => {
          const bTime =
            new Date(
              clean(
                b.created_at,
              ) ||
                "1970-01-01",
            ).getTime();

          const aTime =
            new Date(
              clean(
                a.created_at,
              ) ||
                "1970-01-01",
            ).getTime();

          return (
            bTime -
            aTime
          );
        },
      )[0] ?? null
  );
}

/**
 * Both option_codes and class_codes are supported because
 * older and newer Training records may contain either.
 *
 * Examples:
 * Driver Licence → HR
 * HRWL → LF WP DG RB
 */
function classCodes(
  record:
    | TrainingRecord
    | null,
) {
  if (!record) {
    return "";
  }

  const values =
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

  return values.join(
    " ",
  );
}

/**
 * Detailed Matrix columns are driven from Training Type
 * configuration rather than hard-coded names.
 *
 * subtype_mode != none:
 *   Driver Licence C / LR / MR / HR / HC / MC
 *   HRWL LF / WP / DG / RB / RI etc
 *
 * requires_certificate_number:
 *   shows Number
 *
 * expiring types:
 *   shows Expiry
 *
 * every type:
 *   shows Status
 */
function detailFieldsForType(
  type: TrainingType,
): DetailField[] {
  const fields:
    DetailField[] = [];

  const subtypeMode =
    clean(
      type.subtype_mode,
    );

  if (
    subtypeMode &&
    subtypeMode !== "none"
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

  fields.push(
    "status",
  );

  return fields;
}

function detailHeading(
  field:
    DetailField,
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
  field:
    DetailField;

  record:
    | TrainingRecord
    | null;

  status:
    TrainingComplianceStatus;
}) {
  if (
    field ===
    "status"
  ) {
    return trainingComplianceLabel(
      status,
    );
  }

  if (!record) {
    if (
      status ===
      "not_required"
    ) {
      return "N/A";
    }

    if (
      status ===
      "pending_review"
    ) {
      return "PENDING";
    }

    return "—";
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
    field ===
    "number"
  ) {
    return (
      clean(
        record.certificate_number,
      ) || "—"
    );
  }

  if (
    field ===
    "expiry"
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

  /**
   * Empty array means show every Training Type.
   *
   * Once one or more types are selected, only those
   * appear in the Matrix AND export.
   */
  const [
    selectedTypeIds,
    setSelectedTypeIds,
  ] =
    useState<
      string[]
    >([]);

  const [
    ticketSearch,
    setTicketSearch,
  ] =
    useState("");

  const [
    typeFilterOpen,
    setTypeFilterOpen,
  ] =
    useState(false);

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
     Load
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
          ].find(
            Boolean,
          );

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
     Lookup data
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

  /* =======================================================
     Training Type selector
     ======================================================= */

  const ticketFilterTypes =
    useMemo(() => {
      const query =
        ticketSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return types;
      }

      return types.filter(
        (type) =>
          [
            type.name,
            type.short_code,
            type.category,
          ]
            .map(clean)
            .join(" ")
            .toLowerCase()
            .includes(
              query,
            ),
      );
    }, [
      ticketSearch,
      types,
    ]);

  const selectedTypes =
    useMemo(
      () =>
        selectedTypeIds
          .map(
            (id) =>
              types.find(
                (type) =>
                  type.id === id,
              ),
          )
          .filter(
            (
              type,
            ): type is TrainingType =>
              Boolean(type),
          ),
      [
        selectedTypeIds,
        types,
      ],
    );

  function toggleTrainingType(
    trainingTypeId:
      string,
  ) {
    setSelectedTypeIds(
      (current) => {
        if (
          current.includes(
            trainingTypeId,
          )
        ) {
          return current.filter(
            (id) =>
              id !==
              trainingTypeId,
          );
        }

        return [
          ...current,
          trainingTypeId,
        ];
      },
    );
  }

  /**
   * Useful shortcut:
   * select exactly the Training Types currently matching
   * the search inside the dropdown.
   */
  function selectFilteredTypes() {
    setSelectedTypeIds(
      ticketFilterTypes.map(
        (type) =>
          type.id,
      ),
    );
  }

  /* =======================================================
     Visible Training Types
     ======================================================= */

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

            /**
             * No selected types = show all.
             * Otherwise show only selected types.
             */
            if (
              selectedTypeIds.length >
                0 &&
              !selectedTypeIds.includes(
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
        selectedTypeIds,
        types,
      ],
    );

  /* =======================================================
     Compliance
     ======================================================= */

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

  /* =======================================================
     Employees
     ======================================================= */

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
        visibleEmployees.reduce(
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
        requiredForEmployee,
        visibleEmployees,
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
     Export
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
     * CSV cannot contain merged Excel headers, so Detailed
     * export flattens them like:
     *
     * Driver Licence - Class / Tickets
     * Driver Licence - Number
     * Driver Licence - Expiry
     * Driver Licence - Status
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

    /**
     * UTF-8 BOM improves Excel handling of names/symbols.
     */
    const blob =
      new Blob(
        [
          "\uFEFF",
          content,
        ],
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

    document.body.appendChild(
      link,
    );

    link.click();

    document.body.removeChild(
      link,
    );

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
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
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
                View company Training compliance or switch to Detailed View
                for licence classes, HRWL tickets, certificate numbers and
                expiry dates. Use the Training Types filter to show only the
                tickets you care about.
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
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
                disabled={
                  visibleTypes.length ===
                    0 ||
                  visibleEmployees.length ===
                    0
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
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
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Employees Shown"
            value={
              visibleEmployees.length
            }
          />

          <Metric
            label="Training Types Shown"
            value={
              visibleTypes.length
            }
          />

          <Metric
            label="Configured Requirements"
            value={
              requirements.length
            }
          />

          <Metric
            label="Current Required Gaps"
            value={
              gapCount
            }
          />
        </section>

        {/* View mode */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setMode(
                  "status",
                )
              }
              className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
                mode ===
                "status"
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
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
              className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
                mode ===
                "detailed"
                  ? "bg-blue-700 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Detailed View
            </button>

            <div className="ml-auto text-xs font-semibold text-slate-500">
              {mode ===
              "detailed"
                ? "Shows configured classes, numbers, expiries and status."
                : "Compact compliance-only view."}
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="relative z-40 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-700">
            <Filter
              size={16}
            />

            Matrix filters
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {/* Employee search */}
            <label className="relative xl:col-span-2">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3.5 text-slate-400"
              />

              <input
                className={`${inputClass} pl-9`}
                placeholder="Search employee, payroll ID, role or crew..."
                value={
                  search
                }
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
              />
            </label>

            {/* Crew */}
            <Select
              value={
                crewFilter
              }
              onChange={
                setCrewFilter
              }
              options={[
                {
                  value:
                    "all",
                  label:
                    "All crews",
                },
                {
                  value:
                    "unassigned",
                  label:
                    "Unassigned",
                },

                ...crews.map(
                  (crew) => ({
                    value:
                      crew.id,

                    label:
                      crewLabel(
                        crew,
                      ),
                  }),
                ),
              ]}
            />

            {/* Role */}
            <Select
              value={
                roleFilter
              }
              onChange={
                setRoleFilter
              }
              options={[
                {
                  value:
                    "all",
                  label:
                    "All roles",
                },

                ...roles.map(
                  (role) => ({
                    value:
                      role,

                    label:
                      role,
                  }),
                ),
              ]}
            />

            {/* Category */}
            <Select
              value={
                categoryFilter
              }
              onChange={
                setCategoryFilter
              }
              options={[
                {
                  value:
                    "all",
                  label:
                    "All categories",
                },

                ...categories.map(
                  (
                    category,
                  ) => ({
                    value:
                      category,

                    label:
                      category,
                  }),
                ),
              ]}
            />

            {/* Training Type multi-filter */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setTypeFilterOpen(
                    (
                      current,
                    ) =>
                      !current,
                  )
                }
                className={`${inputClass} flex items-center justify-between gap-2 text-left`}
              >
                <span className="truncate">
                  {selectedTypeIds.length ===
                  0
                    ? "All Training Types"
                    : `${selectedTypeIds.length} selected`}
                </span>

                <ChevronDown
                  size={16}
                  className={`shrink-0 text-slate-400 transition ${
                    typeFilterOpen
                      ? "rotate-180"
                      : ""
                  }`}
                />
              </button>

              {typeFilterOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      value={
                        ticketSearch
                      }
                      onChange={(event) =>
                        setTicketSearch(
                          event.target.value,
                        )
                      }
                      placeholder="Search Driver Licence, HRWL, White Card..."
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-400">
                      {selectedTypeIds.length ===
                      0
                        ? "Showing all"
                        : `${selectedTypeIds.length} selected`}
                    </div>

                    <div className="flex gap-1.5">
                      {ticketSearch.trim() &&
                      ticketFilterTypes.length >
                        0 ? (
                        <button
                          type="button"
                          onClick={
                            selectFilteredTypes
                          }
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                        >
                          Select results
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTypeIds(
                            [],
                          );

                          setTicketSearch(
                            "",
                          );
                        }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                      >
                        Show all
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
                    {ticketFilterTypes.map(
                      (type) => {
                        const selected =
                          selectedTypeIds.includes(
                            type.id,
                          );

                        return (
                          <button
                            key={
                              type.id
                            }
                            type="button"
                            onClick={() =>
                              toggleTrainingType(
                                type.id,
                              )
                            }
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                              selected
                                ? "bg-blue-50 text-blue-900"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                selected
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-300 bg-white"
                              }`}
                            >
                              {selected ? (
                                <Check
                                  size={13}
                                  strokeWidth={
                                    3
                                  }
                                />
                              ) : null}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-black">
                                {
                                  type.name
                                }
                              </span>

                              <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">
                                {[
                                  type.short_code,
                                  type.category,
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(
                                    " · ",
                                  ) ||
                                  "Training Type"}
                              </span>
                            </span>
                          </button>
                        );
                      },
                    )}

                    {ticketFilterTypes.length ===
                    0 ? (
                      <div className="px-3 py-6 text-center text-sm font-semibold text-slate-400">
                        No Training Types match that search.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setTypeFilterOpen(
                          false,
                        )
                      }
                      className="w-full rounded-xl bg-slate-950 px-3 py-2.5 text-sm font-black text-white"
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Secondary filters */}
          <div className="mt-4 flex flex-wrap gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
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

              Gaps only
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
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

          {/* Selected Training Type chips */}
          {selectedTypes.length >
          0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Showing
                </span>

                {selectedTypes.map(
                  (type) => (
                    <button
                      key={
                        type.id
                      }
                      type="button"
                      onClick={() =>
                        toggleTrainingType(
                          type.id,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-800 transition hover:bg-blue-100"
                      title={`Remove ${type.name}`}
                    >
                      {type.short_code ||
                        type.name}

                      <X
                        size={13}
                        className="text-blue-400"
                      />
                    </button>
                  ),
                )}

                <button
                  type="button"
                  onClick={() =>
                    setSelectedTypeIds(
                      [],
                    )
                  }
                  className="px-2 py-1.5 text-xs font-black text-slate-500 hover:text-slate-950"
                >
                  Show all
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Matrix */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-slate-950">
                  {mode ===
                  "detailed"
                    ? "Detailed Training Matrix"
                    : "Training Compliance Matrix"}
                </h2>

                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {visibleEmployees.length} employee
                  {visibleEmployees.length ===
                  1
                    ? ""
                    : "s"}{" "}
                  · {visibleTypes.length} Training Type
                  {visibleTypes.length ===
                  1
                    ? ""
                    : "s"}
                </p>
              </div>

              {selectedTypes.length >
              0 ? (
                <div className="text-xs font-bold text-blue-700">
                  Custom Training Type filter active
                </div>
              ) : null}
            </div>
          </div>

          {visibleTypes.length ===
          0 ? (
            <div className="p-10 text-center">
              <div className="font-black text-slate-900">
                No Training Types match the selected filters.
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedTypeIds(
                    [],
                  );

                  setCategoryFilter(
                    "all",
                  );

                  setRequiredColumnsOnly(
                    false,
                  );
                }}
                className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
              >
                Clear Training filters
              </button>
            </div>
          ) : visibleEmployees.length ===
            0 ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">
              No employees match the selected filters.
            </div>
          ) : (
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
                  requiredForEmployee={
                    requiredForEmployee
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
          )}
        </section>

        {/* Legend */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <strong>
            Legend:
          </strong>{" "}
          Current = valid current evidence · Expiring = within the configured
          warning period · Expired/Missing = compliance gap · Pending = awaiting
          review · N/A = not required and no current record.
        </section>
      </main>
    </AppShell>
  );
}

/* =========================================================
   Status Matrix
   ========================================================= */

function StatusMatrix({
  employees,
  types,
  crewById,
  cellFor,
  requiredForEmployee,
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

    daysRemaining:
      number
      | null;
  };

  requiredForEmployee: (
    employee:
      Employee,

    trainingTypeId:
      string,
  ) => boolean;
}) {
  return (
    <table className="min-w-max border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="sticky left-0 top-0 z-30 min-w-[260px] border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">
            Employee
          </th>

          {types.map(
            (type) => (
              <th
                key={
                  type.id
                }
                className="sticky top-0 z-20 min-w-[145px] border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-center align-bottom"
              >
                <div className="text-xs font-black text-slate-800">
                  {type.short_code ||
                    type.name}
                </div>

                {type.short_code ? (
                  <div className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                    {
                      type.name
                    }
                  </div>
                ) : null}
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
              className="hover:bg-slate-50/60"
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
                  const cell =
                    cellFor(
                      employee,
                      type,
                    );

                  const required =
                    requiredForEmployee(
                      employee,
                      type.id,
                    );

                  return (
                    <td
                      key={
                        `${employee.id}-${type.id}`
                      }
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
                          cell.daysRemaining !==
                          null
                            ? ` (${cell.daysRemaining} days)`
                            : ""
                        }`}
                        className={`mx-auto flex min-h-12 min-w-[88px] items-center justify-center rounded-xl border px-2 text-xs font-black transition hover:ring-2 hover:ring-blue-200 ${cellClasses(
                          cell.status,
                        )}`}
                      >
                        {required &&
                        cell.status ===
                          "not_required"
                          ? "MISSING"
                          : cellText(
                              cell.status,
                            )}
                      </Link>
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
   Detailed Matrix
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

    daysRemaining:
      number
      | null;
  };
}) {
  return (
    <table className="min-w-max border-separate border-spacing-0 text-xs">
      <thead>
        {/* Group header */}
        <tr className="bg-slate-950 text-white">
          <th
            rowSpan={2}
            className="sticky left-0 top-0 z-40 min-w-[260px] border-b border-r border-slate-700 bg-slate-950 px-4 py-3 text-left text-sm font-black"
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
                  className="sticky top-0 z-30 border-b border-r border-slate-700 bg-slate-950 px-4 py-3 text-center text-sm font-black"
                >
                  <div>
                    {type.short_code ||
                      type.name}
                  </div>

                  {type.short_code ? (
                    <div className="mt-1 text-[10px] font-semibold text-slate-300">
                      {
                        type.name
                      }
                    </div>
                  ) : null}
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
                    className="sticky top-[65px] z-20 min-w-[112px] border-b border-r border-slate-200 bg-slate-100 px-2 py-2.5 text-center font-black text-slate-600"
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
              className="hover:bg-slate-50/70"
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

                      const href =
                        `/people/training/register?employeeId=${encodeURIComponent(
                          employee.id,
                        )}&trainingTypeId=${encodeURIComponent(
                          type.id,
                        )}`;

                      return (
                        <td
                          key={`${employee.id}-${type.id}-${field}`}
                          className="border-b border-r border-slate-100 p-1.5 text-center"
                        >
                          <Link
                            href={
                              href
                            }
                            className="block"
                          >
                            {field ===
                            "status" ? (
                              <div
                                className={`rounded-lg border px-2 py-2 font-black transition hover:ring-2 hover:ring-blue-100 ${cellClasses(
                                  result.status,
                                )}`}
                              >
                                {
                                  value
                                }
                              </div>
                            ) : (
                              <div
                                className={`min-h-8 whitespace-nowrap rounded-lg px-2 py-2 font-bold transition hover:bg-blue-50 ${
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
                          </Link>
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
   Shared Employee Cell
   ========================================================= */

function EmployeeCell({
  employee,
  crew,
}: {
  employee:
    Employee;

  crew?:
    | Crew
    | null;
}) {
  return (
    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3">
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
          .filter(
            Boolean,
          )
          .join(
            " · ",
          )}
      </div>
    </td>
  );
}

/* =========================================================
   Shared controls
   ========================================================= */

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function Select({
  value,
  onChange,
  options,
}: {
  value:
    string;

  onChange: (
    value:
      string,
  ) => void;

  options:
    Array<{
      value:
        string;

      label:
        string;
    }>;
}) {
  return (
    <select
      className={
        inputClass
      }
      value={
        value
      }
      onChange={(event) =>
        onChange(
          event.target.value,
        )
      }
    >
      {options.map(
        (option) => (
          <option
            key={
              option.value
            }
            value={
              option.value
            }
          >
            {
              option.label
            }
          </option>
        ),
      )}
    </select>
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
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-3xl font-black text-slate-950">
        {value}
      </div>
    </div>
  );
}