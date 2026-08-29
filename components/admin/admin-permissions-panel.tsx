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
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  Trash2,
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
  ] = useState<
    string | null
  >(null);

  const [
    message,
    setMessage,
  ] = useState<{
    tone:
      | "success"
      | "error";
    text: string;
  } | null>(null);

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
        (await response.json()) as AccessResponse;

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
        (await response.json()) as RouteRulesResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Failed to load route rules.",
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

            return (
              Number(
                a.access_sort_order ??
                  999,
              ) -
              Number(
                b.access_sort_order ??
                  999,
              )
            );
          },
        );
    }, [
      matrix,
      selectedRoleId,
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
        of selectedRoleRows
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
      selectedRoleRows,
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
        (await response.json()) as {
          error?: string;
        };

      if (
        !response.ok
      ) {
        throw new Error(
          payload.error ??
            "Could not save permission.",
        );
      }
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
        (await response.json()) as SharePointSyncResponse;

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

      setMessage({
        tone: "success",
        text:
          `SharePoint sync complete. ` +
          `${payload.discovered?.libraries ?? 0} libraries scanned and ` +
          `${newItems} new permission areas added.`,
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
        (await response.json()) as {
          error?: string;
        };

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
          "Route access rule saved.",
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
        `Delete route rule "${rule.name}"?\n\nPages that only depended on this rule will fall back to another matching rule or remain unrestricted if no other rule applies.`,
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
        (await response.json()) as {
          error?: string;
        };

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
          "Route access rule deleted.",
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
      <div className="flex min-h-52 items-center justify-center">
        <Loader2
          size={26}
          className="animate-spin text-slate-400"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            message.tone ===
            "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck
                size={18}
              />

              <span className="text-xs font-bold uppercase tracking-[0.12em]">
                Permissions Centre
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Roles, Routes & SharePoint
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Role permissions are stored in Supabase. TTTracker pages inherit
              permissions from configurable route rules, while SharePoint
              libraries and controlled top-level folders are discovered directly
              from Microsoft Graph.
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
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
              ? "Syncing SharePoint..."
              : "Sync SharePoint"}
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="px-2 pb-3">
            <h3 className="font-bold text-slate-950">
              Roles
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Select a role and configure what it can access.
            </p>
          </div>

          <div className="space-y-1">
            {roles.map(
              (role) => (
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
                  <div className="text-sm font-bold">
                    {
                      role.name
                    }
                  </div>

                  <div
                    className={`mt-1 text-xs ${
                      selectedRoleId ===
                      role.id
                        ? "text-slate-300"
                        : "text-slate-400"
                    }`}
                  >
                    {
                      role.code
                    }
                  </div>
                </button>
              ),
            )}
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-2xl font-bold text-slate-950">
              {selectedRole
                ?.name ??
                "Select a role"}
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {selectedRole
                ?.description ??
                "Configure default permissions for this role."}
            </p>
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
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
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

                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              {row.access_type ===
                              "sharepoint"
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

                          {row.sharepoint_library ? (
                            <p className="mt-1 text-xs font-medium text-amber-700">
                              Library:{" "}
                              {
                                row.sharepoint_library
                              }
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void setPermission(
                              row,
                              !row.allowed,
                            )
                          }
                          disabled={Boolean(
                            savingPermissionId,
                          )}
                          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                            row.allowed
                              ? "bg-emerald-500"
                              : "bg-slate-200"
                          } disabled:opacity-50`}
                        >
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition ${
                              row.allowed
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          >
                            {savingPermissionId ===
                            row.access_area_id ? (
                              <Loader2
                                size={11}
                                className="animate-spin text-slate-400"
                              />
                            ) : row.allowed ? (
                              <Check
                                size={11}
                                className="text-emerald-600"
                              />
                            ) : null}
                          </span>
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </section>
            ),
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-400">
              <Route
                size={18}
              />

              <span className="text-xs font-bold uppercase tracking-[0.12em]">
                TTTracker Route Rules
              </span>
            </div>

            <h3 className="mt-2 text-xl font-bold text-slate-950">
              Automatic Page Access
            </h3>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Pages inherit permissions from their route. A new page under an
              existing module automatically gets that module&apos;s permission.
              Add a route rule here only when you create a new module or need a
              more restrictive sub-area.
            </p>
          </div>

          <button
            type="button"
            onClick={
              openNewRouteRule
            }
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus
              size={16}
            />
            Add Route Rule
          </button>
        </div>

        {routeRules.length ===
        0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No route rules configured.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {routeRules.map(
              (
                rule,
              ) => (
                <div
                  key={
                    rule.id
                  }
                  className="grid gap-4 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-950">
                        {
                          rule.name
                        }
                      </h4>

                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">
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

                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {
                        rule.route_pattern
                      }
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Permission
                    </div>

                    <div className="mt-1 text-sm font-semibold text-slate-800">
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
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Behaviour
                    </div>

                    <div className="mt-1 text-sm text-slate-700">
                      {rule.match_type ===
                      "prefix"
                        ? `Includes every page under ${rule.route_pattern}`
                        : "Only this exact page"}
                    </div>

                    <div className="mt-0.5 text-xs text-slate-400">
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

      {routeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
          <div className="my-auto w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  {routeForm.id
                    ? "Edit Route Rule"
                    : "Add Route Rule"}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Assign a TTTracker route or module to an existing permission.
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

              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
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
                    Match
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
                      Prefix / whole module
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

                  <span className="text-sm font-semibold text-slate-700">
                    Rule active
                  </span>
                </label>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                Prefix rules automatically cover new pages underneath the route.
                For example, <strong>/project</strong> covers project dashboards,
                materials, forecasting and any future project pages unless a more
                specific rule overrides it.
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

                  Save Route Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}