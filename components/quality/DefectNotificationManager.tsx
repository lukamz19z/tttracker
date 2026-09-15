"use client";

import {
  Bell,
  Loader2,
  Mail,
  Plus,
  Save,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ApiFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type RuleRow = {
  id: string;
  project_id: string;
  user_id: string;
  notify_new: boolean;
  notify_status_change: boolean;
  notify_action: boolean;
  notify_closed: boolean;
  notify_critical: boolean;
  receives_email: boolean;
  receives_in_app: boolean;
  receives_push: boolean;
  active: boolean;
};

type DraftRule = RuleRow & {
  dirty?: boolean;
};

type Props = {
  projectId: string;
  apiFetch: ApiFetch;
  onClose: () => void;
  onChanged?: () => void;
};

function roleLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function DefectNotificationManager({
  projectId,
  apiFetch,
  onClose,
  onChanged,
}: Props) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiFetch(
        `/api/quality/defects/notification-settings?projectId=${encodeURIComponent(projectId)}`,
      );
      const payload = (await response.json()) as {
        users?: UserOption[];
        rules?: RuleRow[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "Defect notification settings could not be loaded.",
        );
      }

      setUsers(payload.users ?? []);
      setRules((payload.rules ?? []).map((rule) => ({ ...rule })));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Defect notification settings could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ruleUserIds = useMemo(
    () => new Set(rules.map((rule) => rule.user_id)),
    [rules],
  );

  const availableUsers = useMemo(
    () => users.filter((user) => !ruleUserIds.has(user.id)),
    [ruleUserIds, users],
  );

  function addRule() {
    const userId = selectedUserId;
    if (!userId) return;

    setRules((current) => [
      ...current,
      {
        id: `new-${userId}`,
        project_id: projectId,
        user_id: userId,
        notify_new: true,
        notify_status_change: true,
        notify_action: false,
        notify_closed: true,
        notify_critical: true,
        receives_email: true,
        receives_in_app: true,
        receives_push: false,
        active: true,
        dirty: true,
      },
    ]);
    setSelectedUserId("");
  }

  function patchRule(
    userId: string,
    patch: Partial<DraftRule>,
  ) {
    setRules((current) =>
      current.map((rule) =>
        rule.user_id === userId
          ? { ...rule, ...patch, dirty: true }
          : rule,
      ),
    );
  }

  async function saveRule(rule: DraftRule) {
    setBusyId(rule.user_id);
    setMessage(null);

    try {
      const response = await apiFetch(
        "/api/quality/defects/notification-settings",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            userId: rule.user_id,
            notifyNew: rule.notify_new,
            notifyStatusChange: rule.notify_status_change,
            notifyAction: rule.notify_action,
            notifyClosed: rule.notify_closed,
            notifyCritical: rule.notify_critical,
            receivesEmail: rule.receives_email,
            receivesInApp: rule.receives_in_app,
            receivesPush: rule.receives_push,
            active: rule.active,
          }),
        },
      );

      const payload = (await response.json()) as {
        rule?: RuleRow;
        error?: string;
      };

      if (!response.ok || !payload.rule) {
        throw new Error(
          payload.error || "Notification recipient could not be saved.",
        );
      }

      setRules((current) =>
        current.map((row) =>
          row.user_id === rule.user_id
            ? { ...payload.rule!, dirty: false }
            : row,
        ),
      );

      setMessage("Defect notification recipient saved.");
      onChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Notification recipient could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeRule(rule: DraftRule) {
    const user = users.find((item) => item.id === rule.user_id);
    if (
      !window.confirm(
        `Remove ${user?.name || "this user"} from Defect notifications?`,
      )
    ) {
      return;
    }

    if (rule.id.startsWith("new-")) {
      setRules((current) =>
        current.filter((row) => row.user_id !== rule.user_id),
      );
      return;
    }

    setBusyId(rule.user_id);
    setMessage(null);

    try {
      const response = await apiFetch(
        "/api/quality/defects/notification-settings",
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            userId: rule.user_id,
          }),
        },
      );

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "Notification recipient could not be removed.",
        );
      }

      setRules((current) =>
        current.filter((row) => row.user_id !== rule.user_id),
      );
      setMessage("Defect notification recipient removed.");
      onChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Notification recipient could not be removed.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 md:p-8">
      <div className="my-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 md:px-6">
          <div>
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-slate-400" />
              <h2 className="text-xl font-black text-slate-950">
                Defect Notifications
              </h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Choose the exact TTTracker users who need visibility of Defects
              on this project. Assignment to a Defect also notifies the assigned
              person automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 md:p-6">
          {message ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-56 items-center justify-center">
              <Loader2 size={26} className="animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <label>
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
                      Add project user
                    </span>
                    <select
                      value={selectedUserId}
                      onChange={(event) =>
                        setSelectedUserId(event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">Select user...</option>
                      {availableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                          {user.email ? ` · ${user.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={addRule}
                    disabled={!selectedUserId}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Plus size={16} />
                    Add Recipient
                  </button>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-3 py-3">New</th>
                      <th className="px-3 py-3">Critical</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Actions</th>
                      <th className="px-3 py-3">Closed</th>
                      <th className="px-3 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Mail size={13} /> Email
                        </span>
                      </th>
                      <th className="px-3 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Bell size={13} /> In-App
                        </span>
                      </th>
                      <th className="px-3 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Smartphone size={13} /> Push
                        </span>
                      </th>
                      <th className="px-4 py-3 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-5 py-10 text-center text-sm text-slate-500"
                        >
                          No project Defect notification recipients configured.
                        </td>
                      </tr>
                    ) : (
                      rules.map((rule) => {
                        const user = users.find(
                          (item) => item.id === rule.user_id,
                        );

                        return (
                          <tr
                            key={rule.user_id}
                            className="border-t border-slate-100"
                          >
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">
                                {user?.name || "TTTracker User"}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-400">
                                {user?.email || "No email"} ·{" "}
                                {roleLabel(user?.role || "user")}
                              </div>
                            </td>

                            {[
                              ["notify_new", rule.notify_new],
                              ["notify_critical", rule.notify_critical],
                              [
                                "notify_status_change",
                                rule.notify_status_change,
                              ],
                              ["notify_action", rule.notify_action],
                              ["notify_closed", rule.notify_closed],
                              ["receives_email", rule.receives_email],
                              ["receives_in_app", rule.receives_in_app],
                              ["receives_push", rule.receives_push],
                            ].map(([key, checked]) => (
                              <td key={String(key)} className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={Boolean(checked)}
                                  onChange={(event) =>
                                    patchRule(rule.user_id, {
                                      [String(key)]: event.target.checked,
                                    } as Partial<DraftRule>)
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                              </td>
                            ))}

                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveRule(rule)}
                                  disabled={
                                    busyId === rule.user_id || !rule.dirty
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                                >
                                  {busyId === rule.user_id ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Save size={13} />
                                  )}
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeRule(rule)}
                                  disabled={busyId === rule.user_id}
                                  className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs leading-5 text-slate-500">
                Push is stored now for the mobile phase. Website email and
                in-app notifications work in this phase. Expo push dispatch can
                be connected when the mobile Defects module is added.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
