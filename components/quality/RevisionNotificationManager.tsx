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

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
  notify_created: boolean;
  notify_submitted: boolean;
  receives_email: boolean;
  receives_in_app: boolean;
  receives_push: boolean;
  active: boolean;
};

type DraftRule = RuleRow & { dirty?: boolean };

export default function RevisionNotificationManager({
  projectId,
  apiFetch,
  onClose,
}: {
  projectId: string;
  apiFetch: ApiFetch;
  onClose: () => void;
}) {
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
        `/api/quality/revisions/notification-settings?projectId=${encodeURIComponent(projectId)}`,
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Revision notification settings could not be loaded.");
      setUsers(payload.users ?? []);
      setRules((payload.rules ?? []).map((rule: RuleRow) => ({ ...rule })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revision notification settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, projectId]);

  useEffect(() => { void load(); }, [load]);

  const used = useMemo(() => new Set(rules.map((rule) => rule.user_id)), [rules]);
  const availableUsers = useMemo(
    () => users.filter((user) => !used.has(user.id)),
    [users, used],
  );

  function patch(userId: string, value: Partial<DraftRule>) {
    setRules((current) =>
      current.map((rule) =>
        rule.user_id === userId ? { ...rule, ...value, dirty: true } : rule,
      ),
    );
  }

  function addRule() {
    if (!selectedUserId) return;
    setRules((current) => [
      ...current,
      {
        id: `new-${selectedUserId}`,
        project_id: projectId,
        user_id: selectedUserId,
        notify_created: true,
        notify_submitted: true,
        receives_email: true,
        receives_in_app: true,
        receives_push: false,
        active: true,
        dirty: true,
      },
    ]);
    setSelectedUserId("");
  }

  async function save(rule: DraftRule) {
    setBusyId(rule.user_id);
    setMessage(null);
    try {
      const response = await apiFetch("/api/quality/revisions/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          userId: rule.user_id,
          notifyCreated: rule.notify_created,
          notifySubmitted: rule.notify_submitted,
          receivesEmail: rule.receives_email,
          receivesInApp: rule.receives_in_app,
          receivesPush: rule.receives_push,
          active: rule.active,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.rule) throw new Error(payload.error || "Recipient could not be saved.");
      setRules((current) =>
        current.map((row) =>
          row.user_id === rule.user_id ? { ...payload.rule, dirty: false } : row,
        ),
      );
      setMessage("Revision notification recipient saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recipient could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: DraftRule) {
    if (rule.id.startsWith("new-")) {
      setRules((current) => current.filter((row) => row.user_id !== rule.user_id));
      return;
    }
    setBusyId(rule.user_id);
    try {
      const response = await apiFetch("/api/quality/revisions/notification-settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, userId: rule.user_id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Recipient could not be removed.");
      setRules((current) => current.filter((row) => row.user_id !== rule.user_id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recipient could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-xl font-black text-slate-950">Revision notifications</h2>
            <p className="mt-1 text-sm text-slate-500">
              Exact users notified when a Revision is created and/or submitted for review.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="input flex-1"
            >
              <option value="">Select user…</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}{user.email ? ` · ${user.email}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addRule}
              disabled={!selectedUserId}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus size={16} /> Add person
            </button>
          </div>

          {message ? <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div> : null}
          {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin" /></div> : null}

          {!loading && rules.map((rule) => {
            const user = users.find((row) => row.id === rule.user_id);
            const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
                {label}
              </label>
            );

            return (
              <div key={rule.user_id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="font-black text-slate-900">{user?.name || rule.user_id}</div>
                    <div className="text-xs text-slate-500">{user?.email || "No email"}{user?.role ? ` · ${user.role}` : ""}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void save(rule)} disabled={!rule.dirty || busyId === rule.user_id} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                      {busyId === rule.user_id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                    </button>
                    <button type="button" onClick={() => void remove(rule)} className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-700">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Toggle value={rule.notify_created} onChange={(v) => patch(rule.user_id, { notify_created: v })} label="Created" />
                  <Toggle value={rule.notify_submitted} onChange={(v) => patch(rule.user_id, { notify_submitted: v })} label="Submitted" />
                  <Toggle value={rule.receives_in_app} onChange={(v) => patch(rule.user_id, { receives_in_app: v })} label="In-app" />
                  <Toggle value={rule.receives_push} onChange={(v) => patch(rule.user_id, { receives_push: v })} label="Push" />
                  <Toggle value={rule.receives_email} onChange={(v) => patch(rule.user_id, { receives_email: v })} label="Email" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><Bell size={12} /> in-app</span>
                  <span className="inline-flex items-center gap-1"><Smartphone size={12} /> push</span>
                  <span className="inline-flex items-center gap-1"><Mail size={12} /> email</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
