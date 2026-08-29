"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FolderLock,
  KeyRound,
  Layers3,
  Library,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";

type RoleRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
};

type AccessMatrixRow = {
  role_id: string;
  role_code: string;
  role_name: string;
  role_description?: string | null;

  group_id?: string | null;
  group_name?: string | null;
  group_sort_order?: number | null;

  access_area_id: string;
  access_code: string;
  access_name: string;
  access_description?: string | null;
  access_type: string;
  permission_level?: string | null;
  route?: string | null;
  sharepoint_library?: string | null;
  source?: string | null;
  access_sort_order?: number | null;

  allowed: boolean;
};

type AccessResponse = {
  roles?: RoleRecord[];
  matrix?: AccessMatrixRow[];
  error?: string;
};

type RouteAccessArea = {
  id: string;
  code: string;
  name: string;
  type: string;
  permission_level?: string | null;
  is_active?: boolean | null;
  access_groups?: {
    id?: string | null;
    code?: string | null;
    name?: string | null;
    sort_order?: number | null;
  } | null;
};

type RouteRule = {
  id: string;
  name: string;
  route_pattern: string;
  match_type: "exact" | "prefix";
  priority: number;
  is_active: boolean;

  access_area_id: string;
  access_code: string;
  access_name: string;
  access_type?: string | null;
  permission_level?: string | null;

  group_id?: string | null;
  group_code?: string | null;
  group_name?: string | null;
};

type RouteRulesResponse = {
  rules?: RouteRule[];
  accessAreas?: RouteAccessArea[];
  error?: string;
};

type SharePointSyncResponse = {
  success?: boolean;

  discovered?: {
    libraries?: number;
  };

  created?: {
    libraries?: number;
    folders?: number;
  };

  updated?: {
    libraries?: number;
    folders?: number;
  };

  error?: string;
};

type RouteRuleForm = {
  id: string;
  name: string;
  routePattern: string;
  matchType: "exact" | "prefix";
  accessAreaId: string;
  priority: string;
  isActive: boolean;
};

type ActiveTab =
  | "roles"
  | "sharepoint"
  | "routes";

type MessageState = {
  tone: "success" | "error";
  text: string;
};

const EMPTY_ROUTE_FORM: RouteRuleForm = {
  id: "",
  name: "",
  routePattern: "",
  matchType: "prefix",
  accessAreaId: "",
  priority: "100",
  isActive: true,
};

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function isSharePointRow(row: AccessMatrixRow) {
  const type = String(row.access_type ?? "")
    .trim()
    .toLowerCase();

  const source = String(row.source ?? "")
    .trim()
    .toLowerCase();

  return (
    type === "sharepoint" ||
    source.includes("sharepoint") ||
    Boolean(row.sharepoint_library)
  );
}

function roleSummary(rows: AccessMatrixRow[]) {
  const enabled = rows.filter((row) => row.allowed).length;

  return {
    enabled,
    total: rows.length,
  };
}

function routeRuleScope(rule: RouteRule) {
  if (rule.match_type === "exact") {
    return "Exact page only";
  }

  if (rule.route_pattern === "/") {
    return "All matching pages from root";
  }

  return `Everything under ${rule.route_pattern}`;
}

async function readJsonResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    const preview = text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);

    throw new Error(
      `${fallbackMessage} The API returned ${
        response.status
      } ${response.statusText || "response"} instead of JSON${
        preview ? `: ${preview}` : "."
      }`,
    );
  }

  return (await response.json()) as T;
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
            {label}
          </div>

          <div className="mt-2 text-2xl font-bold text-slate-950">
            {value}
          </div>

          <div className="mt-1 text-xs leading-5 text-slate-500">
            {detail}
          </div>
        </div>

        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  loading,
  disabled,
  onClick,
}: {
  checked: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
        checked ? "bg-emerald-500" : "bg-slate-200"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      >
        {loading ? (
          <Loader2
            size={11}
            className="animate-spin text-slate-400"
          />
        ) : checked ? (
          <Check
            size={11}
            className="text-emerald-600"
          />
        ) : null}
      </span>
    </button>
  );
}

export function AdminPermissionsPanel() {
  const supabase = useMemo(
    () => createSupabaseBrowser(),
    [],
  );

  const [roles, setRoles] =
    useState<RoleRecord[]>([]);

  const [matrix, setMatrix] =
    useState<AccessMatrixRow[]>([]);

  const [
    selectedRoleId,
    setSelectedRoleId,
  ] = useState("");

  const [routeRules, setRouteRules] =
    useState<RouteRule[]>([]);

  const [
    routeAccessAreas,
    setRouteAccessAreas,
  ] = useState<RouteAccessArea[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    savingPermissionId,
    setSavingPermissionId,
  ] = useState<string | null>(null);

  const [
    syncingSharePoint,
    setSyncingSharePoint,
  ] = useState(false);

  const [
    routeModalOpen,
    setRouteModalOpen,
  ] = useState(false);

  const [
    routeForm,
    setRouteForm,
  ] =
    useState<RouteRuleForm>(
      EMPTY_ROUTE_FORM,
    );

  const [
    savingRoute,
    setSavingRoute,
  ] = useState(false);

  const [
    deletingRouteId,
    setDeletingRouteId,
  ] = useState<string | null>(
    null,
  );

  const [
    message,
    setMessage,
  ] = useState<MessageState | null>(
    null,
  );

  const [
    activeTab,
    setActiveTab,
  ] = useState<ActiveTab>(
    "roles",
  );

  const [
    roleSearch,
    setRoleSearch,
  ] = useState("");

  const [
    permissionSearch,
    setPermissionSearch,
  ] = useState("");

  const [
    sharePointSearch,
    setSharePointSearch,
  ] = useState("");

  const [
    routeSearch,
    setRouteSearch,
  ] = useState("");

  const apiFetch =
    useCallback(
      async (
        input:
          | RequestInfo
          | URL,

        init:
          RequestInit = {},
      ) => {
        const {
          data: {
            session,
          },
        } =
          await supabase.auth
            .getSession();

        if (
          !session?.access_token
        ) {
          throw new Error(
            "Your session has expired.",
          );
        }

        const headers =
          new Headers(
            init.headers,
          );

        headers.set(
          "Authorization",
          `Bearer ${session.access_token}`,
        );

        return fetch(
          input,
          {
            ...init,
            headers,
            cache:
              "no-store",
          },
        );
      },
      [supabase],
    );

  const loadPermissions =
    useCallback(async () => {
      const response =
        await apiFetch(
          "/api/admin/access",
        );

      const payload =
        await readJsonResponse<AccessResponse>(
          response,
          "Failed to load permissions.",
        );

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Failed to load permissions.",
        );
      }

      const nextRoles =
        [...(
          payload.roles ??
          []
        )].sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
            ),
        );

      setRoles(
        nextRoles,
      );

      setMatrix(
        payload.matrix ??
          [],
      );

      setSelectedRoleId(
        (current) => {
          if (
            current &&
            nextRoles.some(
              (role) =>
                role.id ===
                current,
            )
          ) {
            return current;
          }

          return (
            nextRoles.find(
              (role) =>
                role.code ===
                "admin",
            )?.id ??
            nextRoles[0]
              ?.id ??
            ""
          );
        },
      );
    }, [apiFetch]);

  const loadRouteRules =
    useCallback(async () => {
      const response =
        await apiFetch(
          "/api/admin/access/routes",
        );

      const payload =
        await readJsonResponse<RouteRulesResponse>(
          response,
          "Failed to load automatic page rules.",
        );

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Failed to load automatic page rules.",
        );
      }

      setRouteRules(
        payload.rules ??
          [],
      );

      setRouteAccessAreas(
        payload.accessAreas ??
          [],
      );
    }, [apiFetch]);

  const loadAll =
    useCallback(async () => {
      await Promise.all([
        loadPermissions(),
        loadRouteRules(),
      ]);
    }, [
      loadPermissions,
      loadRouteRules,
    ]);

  useEffect(() => {
    void (async () => {
      try {
        await loadAll();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to load access configuration.",
        });
      } finally {
        setLoading(
          false,
        );
      }
    })();
  }, [loadAll]);

  const selectedRole =
    roles.find(
      (role) =>
        role.id ===
        selectedRoleId,
    ) ?? null;

  const selectedRoleRows =
    useMemo(() => {
      return matrix
        .filter(
          (row) =>
            row.role_id ===
            selectedRoleId,
        )
        .sort(
          (a, b) => {
            const groupDifference =
              Number(
                a.group_sort_order ??
                  999,
              ) -
              Number(
                b.group_sort_order ??
                  999,
              );

            if (
              groupDifference !==
              0
            ) {
              return groupDifference;
            }

            const accessDifference =
              Number(
                a.access_sort_order ??
                  999,
              ) -
              Number(
                b.access_sort_order ??
                  999,
              );

            if (
              accessDifference !==
              0
            ) {
              return accessDifference;
            }

            return a.access_name.localeCompare(
              b.access_name,
            );
          },
        );
    }, [
      matrix,
      selectedRoleId,
    ]);

  const selectedRoleSummary =
    useMemo(
      () =>
        roleSummary(
          selectedRoleRows,
        ),
      [selectedRoleRows],
    );

  const filteredRoles =
    useMemo(() => {
      const query =
        roleSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return roles;
      }

      return roles.filter(
        (role) =>
          [
            role.name,
            role.code,
            role.description,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
      );
    }, [roleSearch, roles]);

  const filteredRoleRows =
    useMemo(() => {
      const query =
        permissionSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return selectedRoleRows;
      }

      return selectedRoleRows.filter(
        (row) =>
          [
            row.access_name,
            row.access_code,
            row.access_description,
            row.group_name,
            row.permission_level,
            row.route,
            row.sharepoint_library,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
      );
    }, [
      permissionSearch,
      selectedRoleRows,
    ]);

  const permissionGroups =
    useMemo(() => {
      const groups =
        new Map<
          string,
          AccessMatrixRow[]
        >();

      for (
        const row
        of filteredRoleRows
      ) {
        const name =
          row.group_name ||
          "Other";

        const existing =
          groups.get(name) ??
          [];

        existing.push(
          row,
        );

        groups.set(
          name,
          existing,
        );
      }

      return Array.from(
        groups.entries(),
      );
    }, [
      filteredRoleRows,
    ]);

  const groupedRouteAreas =
    useMemo(() => {
      const groups =
        new Map<
          string,
          RouteAccessArea[]
        >();

      for (
        const area
        of routeAccessAreas
      ) {
        const groupName =
          area.access_groups
            ?.name ??
          "Other";

        const existing =
          groups.get(
            groupName,
          ) ?? [];

        existing.push(
          area,
        );

        groups.set(
          groupName,
          existing,
        );
      }

      return Array.from(
        groups.entries(),
      ).sort(
        (a, b) =>
          a[0].localeCompare(
            b[0],
          ),
      );
    }, [
      routeAccessAreas,
    ]);

  const sharePointRows =
    useMemo(() => {
      const unique =
        new Map<
          string,
          AccessMatrixRow
        >();

      for (const row of matrix) {
        if (
          isSharePointRow(row) &&
          !unique.has(
            row.access_area_id,
          )
        ) {
          unique.set(
            row.access_area_id,
            row,
          );
        }
      }

      return Array.from(
        unique.values(),
      ).sort(
        (a, b) =>
          a.access_name.localeCompare(
            b.access_name,
          ),
      );
    }, [matrix]);

  const filteredSharePointRows =
    useMemo(() => {
      const query =
        sharePointSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return sharePointRows;
      }

      return sharePointRows.filter(
        (row) =>
          [
            row.access_name,
            row.access_code,
            row.access_description,
            row.sharepoint_library,
            row.group_name,
            row.source,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
      );
    }, [
      sharePointRows,
      sharePointSearch,
    ]);

  const filteredRouteRules =
    useMemo(() => {
      const query =
        routeSearch
          .trim()
          .toLowerCase();

      if (!query) {
        return routeRules;
      }

      return routeRules.filter(
        (rule) =>
          [
            rule.name,
            rule.route_pattern,
            rule.access_name,
            rule.access_code,
            rule.group_name,
            rule.match_type,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query),
      );
    }, [
      routeRules,
      routeSearch,
    ]);

  const activeRouteCount =
    routeRules.filter(
      (rule) =>
        rule.is_active,
    ).length;

  const enabledSharePointForRole =
    selectedRoleRows.filter(
      (row) =>
        isSharePointRow(row) &&
        row.allowed,
    ).length;

  async function refreshAll() {
    setRefreshing(
      true,
    );

    setMessage(
      null,
    );

    try {
      await loadAll();

      setMessage({
        tone: "success",
        text:
          "Permissions configuration refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not refresh permissions configuration.",
      });
    } finally {
      setRefreshing(
        false,
      );
    }
  }

  async function setPermission(
    row: AccessMatrixRow,
    allowed: boolean,
  ) {
    if (
      !selectedRoleId ||
      savingPermissionId
    ) {
      return;
    }

    const previous =
      matrix;

    setSavingPermissionId(
      row.access_area_id,
    );

    setMatrix(
      (current) =>
        current.map(
          (item) =>
            item.role_id ===
              selectedRoleId &&
            item.access_area_id ===
              row.access_area_id
              ? {
                  ...item,
                  allowed,
                }
              : item,
        ),
    );

    try {
      const response =
        await apiFetch(
          "/api/admin/access",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                role_id:
                  selectedRoleId,

                access_area_id:
                  row.access_area_id,

                allowed,
              }),
          },
        );

      const payload =
        await readJsonResponse<{
          error?: string;
        }>(
          response,
          "Could not save permission.",
        );

      if (
        !response.ok
      ) {
        throw new Error(
          payload.error ??
            "Could not save permission.",
        );
      }

      setMessage({
        tone: "success",
        text:
          `${row.access_name} ${
            allowed
              ? "enabled"
              : "disabled"
          } for ${
            selectedRole?.name ??
            "the selected role"
          }.`,
      });
    } catch (error) {
      setMatrix(
        previous,
      );

      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save permission.",
      });
    } finally {
      setSavingPermissionId(
        null,
      );
    }
  }

  async function syncSharePoint() {
    setSyncingSharePoint(
      true,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await apiFetch(
          "/api/admin/access/sync",
          {
            method:
              "POST",
          },
        );

      const payload =
        await readJsonResponse<SharePointSyncResponse>(
          response,
          "SharePoint discovery failed.",
        );

      if (
        !response.ok
      ) {
        throw new Error(
          payload.error ??
            "SharePoint discovery failed.",
        );
      }

      await loadPermissions();

      const newItems =
        Number(
          payload.created
            ?.libraries ??
            0,
        ) +
        Number(
          payload.created
            ?.folders ??
            0,
        );

      const updatedItems =
        Number(
          payload.updated
            ?.libraries ??
            0,
        ) +
        Number(
          payload.updated
            ?.folders ??
            0,
        );

      setMessage({
        tone: "success",
        text:
          `SharePoint discovery complete. ` +
          `${payload.discovered?.libraries ?? 0} libraries scanned, ` +
          `${newItems} new permission areas added and ` +
          `${updatedItems} existing areas refreshed.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "SharePoint discovery failed.",
      });
    } finally {
      setSyncingSharePoint(
        false,
      );
    }
  }

  function openNewRouteRule() {
    setRouteForm({
      ...EMPTY_ROUTE_FORM,
      accessAreaId:
        routeAccessAreas[0]
          ?.id ?? "",
    });

    setRouteModalOpen(
      true,
    );
  }

  function openEditRouteRule(
    rule: RouteRule,
  ) {
    setRouteForm({
      id:
        rule.id,

      name:
        rule.name,

      routePattern:
        rule.route_pattern,

      matchType:
        rule.match_type,

      accessAreaId:
        rule.access_area_id,

      priority:
        String(
          rule.priority,
        ),

      isActive:
        rule.is_active,
    });

    setRouteModalOpen(
      true,
    );
  }

  async function saveRouteRule(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSavingRoute(
      true,
    );

    setMessage(
      null,
    );

    try {
      const response =
        await apiFetch(
          "/api/admin/access/routes",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                id:
                  routeForm.id ||
                  undefined,

                name:
                  routeForm.name,

                route_pattern:
                  routeForm.routePattern,

                match_type:
                  routeForm.matchType,

                access_area_id:
                  routeForm.accessAreaId,

                priority:
                  Number(
                    routeForm.priority ||
                      100,
                  ),

                is_active:
                  routeForm.isActive,
              }),
          },
        );

      const payload =
        await readJsonResponse<{
          error?: string;
        }>(
          response,
          "Could not save route rule.",
        );

      if (
        !response.ok
      ) {
        throw new Error(
          payload.error ??
            "Could not save route rule.",
        );
      }

      await loadRouteRules();

      setRouteModalOpen(
        false,
      );

      setRouteForm(
        EMPTY_ROUTE_FORM,
      );

      setMessage({
        tone: "success",
        text:
          "Automatic page rule saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not save route rule.",
      });
    } finally {
      setSavingRoute(
        false,
      );
    }
  }

  async function deleteRouteRule(
    rule: RouteRule,
  ) {
    const confirmed =
      window.confirm(
        `Delete automatic page rule "${rule.name}"?\n\nPages that only depended on this rule will fall back to another matching rule or remain unrestricted if no other rule applies.`,
      );

    if (
      !confirmed
    ) {
      return;
    }

    setDeletingRouteId(
      rule.id,
    );

    try {
      const response =
        await apiFetch(
          `/api/admin/access/routes?id=${encodeURIComponent(
            rule.id,
          )}`,
          {
            method:
              "DELETE",
          },
        );

      const payload =
        await readJsonResponse<{
          error?: string;
        }>(
          response,
          "Could not delete route rule.",
        );

      if (
        !response.ok
      ) {
        throw new Error(
          payload.error ??
            "Could not delete route rule.",
        );
      }

      await loadRouteRules();

      setMessage({
        tone: "success",
        text:
          "Automatic page rule deleted.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not delete route rule.",
      });
    } finally {
      setDeletingRouteId(
        null,
      );
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center">
        <div className="text-center">
          <Loader2
            size={28}
            className="mx-auto animate-spin text-slate-400"
          />

          <p className="mt-3 text-sm font-medium text-slate-500">
            Loading roles and permissions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div
          className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${
            message.tone ===
            "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.tone ===
          "success" ? (
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0"
            />
          )}

          <div className="min-w-0 flex-1">
            {message.text}
          </div>

          <button
            type="button"
            onClick={() =>
              setMessage(null)
            }
            className="rounded-lg p-1 hover:bg-black/5"
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck
                  size={18}
                />

                <span className="text-xs font-bold uppercase tracking-[0.14em]">
                  Access Control
                </span>
              </div>

              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Roles & Permissions
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Control what each role can access in TTTracker, review discovered
                SharePoint areas, and map website pages to permissions without
                editing individual page files.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void refreshAll()
              }
              disabled={
                refreshing
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-6">
          <MetricCard
            label="Roles"
            value={String(
              roles.length,
            )}
            detail="Website access profiles"
            icon={
              <UsersRound
                size={19}
              />
            }
          />

          <MetricCard
            label="Permission Areas"
            value={String(
              new Set(
                matrix.map(
                  (row) =>
                    row.access_area_id,
                ),
              ).size,
            )}
            detail="Live access controls"
            icon={
              <KeyRound
                size={19}
              />
            }
          />

          <MetricCard
            label="SharePoint Areas"
            value={String(
              sharePointRows.length,
            )}
            detail="Discovered from Microsoft Graph"
            icon={
              <Library
                size={19}
              />
            }
          />

          <MetricCard
            label="Automatic Rules"
            value={`${activeRouteCount}/${routeRules.length}`}
            detail="Active TTTracker route rules"
            icon={
              <Route
                size={19}
              />
            }
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <div className="grid gap-1 sm:grid-cols-3">
          {[
            {
              id:
                "roles" as const,
              label:
                "Role Access",
              description:
                "Default role permissions",
              icon:
                <ShieldCheck
                  size={17}
                />,
            },
            {
              id:
                "sharepoint" as const,
              label:
                "SharePoint",
              description:
                "Libraries and controlled areas",
              icon:
                <FolderLock
                  size={17}
                />,
            },
            {
              id:
                "routes" as const,
              label:
                "Automatic Pages",
              description:
                "Route inheritance rules",
              icon:
                <Sparkles
                  size={17}
                />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(
                  tab.id,
                )
              }
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                activeTab ===
                tab.id
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div
                className={`rounded-lg p-2 ${
                  activeTab ===
                  tab.id
                    ? "bg-white/10"
                    : "bg-slate-100"
                }`}
              >
                {tab.icon}
              </div>

              <div>
                <div className="text-sm font-bold">
                  {tab.label}
                </div>

                <div
                  className={`mt-0.5 text-xs ${
                    activeTab ===
                    tab.id
                      ? "text-slate-300"
                      : "text-slate-400"
                  }`}
                >
                  {tab.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {activeTab ===
      "roles" ? (
        <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="px-2 pb-3">
              <h3 className="font-bold text-slate-950">
                Roles
              </h3>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Select a role to set its default access.
              </p>
            </div>

            <div className="relative mb-3">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={
                  roleSearch
                }
                onChange={(
                  event,
                ) =>
                  setRoleSearch(
                    event.target
                      .value,
                  )
                }
                placeholder="Search roles"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="space-y-1">
              {filteredRoles.map(
                (role) => {
                  const rows =
                    matrix.filter(
                      (row) =>
                        row.role_id ===
                        role.id,
                    );

                  const summary =
                    roleSummary(
                      rows,
                    );

                  return (
                    <button
                      key={
                        role.id
                      }
                      type="button"
                      onClick={() =>
                        setSelectedRoleId(
                          role.id,
                        )
                      }
                      className={`w-full rounded-xl px-3 py-3 text-left transition ${
                        selectedRoleId ===
                        role.id
                          ? "bg-slate-950 text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">
                            {role.name}
                          </div>

                          <div
                            className={`mt-1 truncate text-xs ${
                              selectedRoleId ===
                              role.id
                                ? "text-slate-300"
                                : "text-slate-400"
                            }`}
                          >
                            {role.code}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
                            selectedRoleId ===
                            role.id
                              ? "bg-white/10 text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {summary.enabled}/
                          {summary.total}
                        </div>
                      </div>
                    </button>
                  );
                },
              )}

              {filteredRoles.length ===
              0 ? (
                <div className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  No roles found.
                </div>
              ) : null}
            </div>
          </aside>

          <div className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
                    Selected Role
                  </div>

                  <h3 className="mt-2 text-2xl font-bold text-slate-950">
                    {selectedRole
                      ?.name ??
                      "Select a role"}
                  </h3>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    {selectedRole
                      ?.description ??
                      "Configure default permissions for this role."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:min-w-64">
                  <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                      Enabled
                    </div>

                    <div className="mt-1 text-xl font-bold text-emerald-900">
                      {
                        selectedRoleSummary.enabled
                      }
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-100 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      Total
                    </div>

                    <div className="mt-1 text-xl font-bold text-slate-900">
                      {
                        selectedRoleSummary.total
                      }
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative mt-5">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={
                    permissionSearch
                  }
                  onChange={(
                    event,
                  ) =>
                    setPermissionSearch(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Search permissions, modules, routes or SharePoint areas..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </section>

            {permissionGroups.map(
              ([
                groupName,
                rows,
              ]) => (
                <section
                  key={
                    groupName
                  }
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div>
                      <h4 className="font-bold text-slate-950">
                        {
                          groupName
                        }
                      </h4>

                      <p className="mt-1 text-xs text-slate-500">
                        {
                          rows.filter(
                            (
                              row,
                            ) =>
                              row.allowed,
                          ).length
                        }{" "}
                        of{" "}
                        {
                          rows.length
                        }{" "}
                        enabled
                      </p>
                    </div>

                    <Layers3
                      size={18}
                      className="text-slate-400"
                    />
                  </div>

                  <div className="divide-y divide-slate-100">
                    {rows.map(
                      (
                        row,
                      ) => (
                        <div
                          key={
                            row.access_area_id
                          }
                          className="flex items-start justify-between gap-5 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="text-sm font-bold text-slate-900">
                                {
                                  row.access_name
                                }
                              </h5>

                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  isSharePointRow(
                                    row,
                                  )
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {isSharePointRow(
                                  row,
                                )
                                  ? "SharePoint"
                                  : pretty(
                                      row.permission_level ??
                                        "Access",
                                    )}
                              </span>
                            </div>

                            {row.access_description ? (
                              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                                {
                                  row.access_description
                                }
                              </p>
                            ) : null}

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-slate-400">
                              <span>
                                {
                                  row.access_code
                                }
                              </span>

                              {row.route ? (
                                <span className="font-mono">
                                  {
                                    row.route
                                  }
                                </span>
                              ) : null}

                              {row.sharepoint_library ? (
                                <span className="text-blue-600">
                                  Library:{" "}
                                  {
                                    row.sharepoint_library
                                  }
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <Toggle
                            checked={
                              row.allowed
                            }
                            loading={
                              savingPermissionId ===
                              row.access_area_id
                            }
                            disabled={Boolean(
                              savingPermissionId,
                            )}
                            onClick={() =>
                              void setPermission(
                                row,
                                !row.allowed,
                              )
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>
                </section>
              ),
            )}

            {permissionGroups.length ===
            0 ? (
              <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Search
                  size={28}
                  className="mx-auto text-slate-300"
                />

                <h4 className="mt-3 font-bold text-slate-900">
                  No permissions found
                </h4>

                <p className="mt-1 text-sm text-slate-500">
                  Try changing your search.
                </p>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab ===
      "sharepoint" ? (
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-600">
                  <FolderLock
                    size={18}
                  />

                  <span className="text-xs font-bold uppercase tracking-[0.12em]">
                    SharePoint Integration
                  </span>
                </div>

                <h3 className="mt-2 text-2xl font-bold text-slate-950">
                  SharePoint Permission Areas
                </h3>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  TTTracker discovers SharePoint libraries and controlled
                  top-level folders through Microsoft Graph. Role switches are
                  stored in TTTracker and are ready to drive Microsoft group
                  assignment when the SharePoint enforcement service is enabled.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void syncSharePoint()
                }
                disabled={
                  syncingSharePoint
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {syncingSharePoint ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <RefreshCw
                    size={16}
                  />
                )}

                {syncingSharePoint
                  ? "Discovering..."
                  : "Sync SharePoint"}
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-blue-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  Discovered Areas
                </div>

                <div className="mt-1 text-2xl font-bold text-blue-950">
                  {
                    sharePointRows.length
                  }
                </div>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Enabled For {selectedRole?.name ?? "Role"}
                </div>

                <div className="mt-1 text-2xl font-bold text-emerald-950">
                  {
                    enabledSharePointForRole
                  }
                </div>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-700">
                  Enforcement
                </div>

                <div className="mt-1 text-sm font-bold text-amber-950">
                  TTTracker matrix ready
                </div>

                <div className="mt-1 text-xs leading-5 text-amber-800">
                  Microsoft membership reconciliation still needs the Graph
                  write service.
                </div>
              </div>
            </div>

            <div className="relative mt-5">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={
                  sharePointSearch
                }
                onChange={(
                  event,
                ) =>
                  setSharePointSearch(
                    event.target
                      .value,
                  )
                }
                placeholder="Search SharePoint libraries and folders..."
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h4 className="font-bold text-slate-950">
                Discovered SharePoint Access
              </h4>

              <p className="mt-1 text-xs text-slate-500">
                These areas are sourced from SharePoint rather than hard-coded
                in the website.
              </p>
            </div>

            {filteredSharePointRows.length ===
            0 ? (
              <div className="p-10 text-center">
                <Library
                  size={30}
                  className="mx-auto text-slate-300"
                />

                <h5 className="mt-3 font-bold text-slate-900">
                  No SharePoint areas found
                </h5>

                <p className="mt-1 text-sm text-slate-500">
                  Run SharePoint sync or change your search.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredSharePointRows.map(
                  (row) => {
                    const roleRow =
                      selectedRoleRows.find(
                        (item) =>
                          item.access_area_id ===
                          row.access_area_id,
                      );

                    return (
                      <div
                        key={
                          row.access_area_id
                        }
                        className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_210px_180px] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="font-bold text-slate-950">
                              {
                                row.access_name
                              }
                            </h5>

                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                              SharePoint
                            </span>
                          </div>

                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {row.access_description ??
                              row.sharepoint_library ??
                              row.access_code}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium text-slate-400">
                            <span>
                              {
                                row.access_code
                              }
                            </span>

                            {row.sharepoint_library ? (
                              <span className="text-blue-600">
                                {
                                  row.sharepoint_library
                                }
                              </span>
                            ) : null}

                            {row.source ? (
                              <span>
                                Source:{" "}
                                {
                                  pretty(
                                    row.source,
                                  )
                                }
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                            Selected Role
                          </div>

                          <div className="mt-1 text-sm font-semibold text-slate-800">
                            {selectedRole?.name ??
                              "No role selected"}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 lg:justify-end">
                          <span
                            className={`text-xs font-bold ${
                              roleRow?.allowed
                                ? "text-emerald-700"
                                : "text-slate-400"
                            }`}
                          >
                            {roleRow?.allowed
                              ? "Allowed"
                              : "Not allowed"}
                          </span>

                          {roleRow ? (
                            <Toggle
                              checked={
                                roleRow.allowed
                              }
                              loading={
                                savingPermissionId ===
                                roleRow.access_area_id
                              }
                              disabled={Boolean(
                                savingPermissionId,
                              )}
                              onClick={() =>
                                void setPermission(
                                  roleRow,
                                  !roleRow.allowed,
                                )
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab ===
      "routes" ? (
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-violet-600">
                  <Sparkles
                    size={18}
                  />

                  <span className="text-xs font-bold uppercase tracking-[0.12em]">
                    Automatic Page Access
                  </span>
                </div>

                <h3 className="mt-2 text-2xl font-bold text-slate-950">
                  Route Inheritance
                </h3>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  A prefix rule protects an entire module automatically. For
                  example, a rule for <strong>/project</strong> also covers
                  future pages such as project materials, tower progress and
                  forecasting. Use an exact rule only when one page needs a
                  different permission.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  openNewRouteRule
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus
                  size={16}
                />
                Add Rule
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-violet-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-violet-700">
                  Active Rules
                </div>

                <div className="mt-1 text-2xl font-bold text-violet-950">
                  {
                    activeRouteCount
                  }
                </div>
              </div>

              <div className="rounded-2xl bg-slate-100 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Total Rules
                </div>

                <div className="mt-1 text-2xl font-bold text-slate-950">
                  {
                    routeRules.length
                  }
                </div>
              </div>

              <div className="rounded-2xl bg-blue-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-700">
                  New Pages
                </div>

                <div className="mt-1 text-sm font-bold text-blue-950">
                  Automatically inherited
                </div>

                <div className="mt-1 text-xs leading-5 text-blue-800">
                  No page-by-page permission code required under an existing
                  prefix rule.
                </div>
              </div>
            </div>

            <div className="relative mt-5">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={
                  routeSearch
                }
                onChange={(
                  event,
                ) =>
                  setRouteSearch(
                    event.target
                      .value,
                  )
                }
                placeholder="Search routes, modules or permissions..."
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 lg:grid-cols-[minmax(0,1fr)_220px_250px_92px]">
              <span>
                Page / Module
              </span>

              <span className="hidden lg:block">
                Required Permission
              </span>

              <span className="hidden lg:block">
                Automatic Behaviour
              </span>

              <span className="hidden text-right lg:block">
                Actions
              </span>
            </div>

            {filteredRouteRules.length ===
            0 ? (
              <div className="p-10 text-center">
                <Route
                  size={30}
                  className="mx-auto text-slate-300"
                />

                <h4 className="mt-3 font-bold text-slate-900">
                  No automatic page rules found
                </h4>

                <p className="mt-1 text-sm text-slate-500">
                  Add a route rule or change your search.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRouteRules.map(
                  (
                    rule,
                  ) => (
                    <div
                      key={
                        rule.id
                      }
                      className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px_250px_92px] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-950">
                            {
                              rule.name
                            }
                          </h4>

                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                              rule.match_type ===
                              "prefix"
                                ? "bg-violet-50 text-violet-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {
                              rule.match_type
                            }
                          </span>

                          {!rule.is_active ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                              Disabled
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 font-mono text-sm font-semibold text-slate-600">
                          {
                            rule.route_pattern
                          }
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 lg:hidden">
                          Permission
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-800 lg:mt-0">
                          {
                            rule.access_name
                          }
                        </div>

                        <div className="mt-0.5 text-xs text-slate-400">
                          {
                            rule.access_code
                          }
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 lg:hidden">
                          Behaviour
                        </div>

                        <div className="mt-1 flex items-start gap-2 text-sm text-slate-700 lg:mt-0">
                          <ChevronRight
                            size={16}
                            className="mt-0.5 shrink-0 text-slate-400"
                          />

                          <span>
                            {
                              routeRuleScope(
                                rule,
                              )
                            }
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                          Priority{" "}
                          {
                            rule.priority
                          }
                        </div>
                      </div>

                      <div className="flex gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            openEditRouteRule(
                              rule,
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                          aria-label="Edit route rule"
                        >
                          <Pencil
                            size={16}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void deleteRouteRule(
                              rule,
                            )
                          }
                          disabled={
                            deletingRouteId ===
                            rule.id
                          }
                          className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                          aria-label="Delete route rule"
                        >
                          {deletingRouteId ===
                          rule.id ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                            />
                          ) : (
                            <Trash2
                              size={16}
                            />
                          )}
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <Sparkles
                size={20}
                className="mt-0.5 shrink-0 text-blue-700"
              />

              <div>
                <h4 className="font-bold text-blue-950">
                  How automatic page access works
                </h4>

                <p className="mt-1 text-sm leading-6 text-blue-900">
                  The most specific matching route wins. Use prefix rules for
                  normal modules and higher-priority exact rules for exceptions.
                  This means new pages underneath an existing module inherit
                  protection automatically.
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {routeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
          <div className="my-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="flex items-center gap-2 text-violet-600">
                  <Route
                    size={17}
                  />

                  <span className="text-xs font-bold uppercase tracking-[0.1em]">
                    Automatic Pages
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-bold text-slate-950">
                  {routeForm.id
                    ? "Edit Route Rule"
                    : "Add Route Rule"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Map a TTTracker route to an existing permission.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setRouteModalOpen(
                    false,
                  )
                }
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X
                  size={20}
                />
              </button>
            </div>

            <form
              onSubmit={
                saveRouteRule
              }
              className="space-y-5 p-6"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-800">
                  Rule name
                </span>

                <input
                  value={
                    routeForm.name
                  }
                  onChange={(
                    event,
                  ) =>
                    setRouteForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        name:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                  placeholder="e.g. Projects"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-800">
                    Route
                  </span>

                  <input
                    value={
                      routeForm.routePattern
                    }
                    onChange={(
                      event,
                    ) =>
                      setRouteForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          routePattern:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    placeholder="/engineering"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-200"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-800">
                    Match type
                  </span>

                  <select
                    value={
                      routeForm.matchType
                    }
                    onChange={(
                      event,
                    ) =>
                      setRouteForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          matchType:
                            event
                              .target
                              .value as
                              | "exact"
                              | "prefix",
                        }),
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="prefix">
                      Whole module / prefix
                    </option>

                    <option value="exact">
                      Exact page only
                    </option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-800">
                  Required permission
                </span>

                <select
                  value={
                    routeForm.accessAreaId
                  }
                  onChange={(
                    event,
                  ) =>
                    setRouteForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        accessAreaId:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  required
                >
                  <option value="">
                    Select permission
                  </option>

                  {groupedRouteAreas.map(
                    ([
                      groupName,
                      areas,
                    ]) => (
                      <optgroup
                        key={
                          groupName
                        }
                        label={
                          groupName
                        }
                      >
                        {areas.map(
                          (
                            area,
                          ) => (
                            <option
                              key={
                                area.id
                              }
                              value={
                                area.id
                              }
                            >
                              {
                                area.name
                              }{" "}
                              ({area.code})
                            </option>
                          ),
                        )}
                      </optgroup>
                    ),
                  )}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-800">
                    Priority
                  </span>

                  <input
                    type="number"
                    value={
                      routeForm.priority
                    }
                    onChange={(
                      event,
                    ) =>
                      setRouteForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          priority:
                            event
                              .target
                              .value,
                        }),
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />

                  <span className="mt-1 block text-xs text-slate-400">
                    Higher priority wins when rules overlap.
                  </span>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:mt-7">
                  <input
                    type="checkbox"
                    checked={
                      routeForm.isActive
                    }
                    onChange={(
                      event,
                    ) =>
                      setRouteForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          isActive:
                            event
                              .target
                              .checked,
                        }),
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />

                  <div>
                    <span className="block text-sm font-semibold text-slate-700">
                      Rule active
                    </span>

                    <span className="block text-xs text-slate-400">
                      Disabled rules are ignored.
                    </span>
                  </div>
                </label>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
                <strong>Recommended:</strong> use a prefix rule for a module such
                as <strong>/project</strong>. Every new page below it is then
                protected automatically. Add a more specific exact rule only
                when a sub-page needs different access.
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setRouteModalOpen(
                      false,
                    )
                  }
                  disabled={
                    savingRoute
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingRoute
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingRoute ? (
                    <Loader2
                      size={16}
                      className="animate-spin"
                    />
                  ) : null}

                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}