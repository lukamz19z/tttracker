"use client";

import { Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

type Scope = "defect" | "revision" | "both";

type IssueType = {
  id: string;
  project_id: string;
  applies_to: Scope;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
};

export default function IssueTypeManager({
  open,
  onClose,
  projectId,
  defaultScope,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  defaultScope: "defect" | "revision";
  onChanged?: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [rows, setRows] = useState<IssueType[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<Scope>(defaultScope);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewScope(defaultScope);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, defaultScope]);

  async function load() {
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("project_field_issue_types")
      .select("id,project_id,applies_to,name,description,active,sort_order")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("name");

    if (error) {
      setMessage(error.message);
    } else {
      setRows((data ?? []) as IssueType[]);
    }
    setLoading(false);
  }

  async function addIssueType() {
    const name = newName.trim();
    if (!name) return;

    setSavingId("new");
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const nextSort =
      rows.length > 0 ? Math.max(...rows.map((row) => row.sort_order || 0)) + 10 : 10;

    const { error } = await supabase.from("project_field_issue_types").insert({
      project_id: projectId,
      applies_to: newScope,
      name,
      description: null,
      active: true,
      sort_order: nextSort,
      created_by: user?.id ?? null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setNewName("");
      await load();
      await onChanged?.();
    }
    setSavingId(null);
  }

  function patchRow(id: string, patch: Partial<IssueType>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function saveRow(row: IssueType) {
    if (!row.name.trim()) {
      setMessage("Issue type name cannot be blank.");
      return;
    }

    setSavingId(row.id);
    setMessage(null);
    const { error } = await supabase
      .from("project_field_issue_types")
      .update({
        name: row.name.trim(),
        description: row.description?.trim() || null,
        applies_to: row.applies_to,
        active: row.active,
        sort_order: Number(row.sort_order) || 0,
      })
      .eq("id", row.id)
      .eq("project_id", projectId);

    if (error) {
      setMessage(error.message);
    } else {
      await load();
      await onChanged?.();
    }
    setSavingId(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Project Issue Types</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add or change the common field issues available to this project. Changes are available to the website now and the mobile workflow later.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close issue type manager"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(90vh-90px)] overflow-y-auto p-5">
          {message ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {message}
            </div>
          ) : null}

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                New issue type
              </span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Incorrect washer arrangement"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Use in
              </span>
              <select
                value={newScope}
                onChange={(event) => setNewScope(event.target.value as Scope)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="defect">Defects</option>
                <option value="revision">Revisions</option>
                <option value="both">Both</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void addIssueType()}
              disabled={!newName.trim() || savingId === "new"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus size={16} />
              Add
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="py-10 text-center text-sm text-slate-500">Loading issue types…</div>
            ) : null}

            {!loading && rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No issue types configured yet.
              </div>
            ) : null}

            {rows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-2xl border border-slate-200 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px_90px_90px_auto] lg:items-end"
              >
                <label>
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Name</span>
                  <input
                    value={row.name}
                    onChange={(event) => patchRow(row.id, { name: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Description</span>
                  <input
                    value={row.description ?? ""}
                    onChange={(event) =>
                      patchRow(row.id, { description: event.target.value })
                    }
                    placeholder="Optional"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Use in</span>
                  <select
                    value={row.applies_to}
                    onChange={(event) =>
                      patchRow(row.id, { applies_to: event.target.value as Scope })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="defect">Defects</option>
                    <option value="revision">Revisions</option>
                    <option value="both">Both</option>
                  </select>
                </label>

                <label>
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Order</span>
                  <input
                    type="number"
                    value={row.sort_order}
                    onChange={(event) =>
                      patchRow(row.id, { sort_order: Number(event.target.value) || 0 })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>

                <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) => patchRow(row.id, { active: event.target.checked })}
                  />
                  Active
                </label>

                <button
                  type="button"
                  onClick={() => void saveRow(row)}
                  disabled={savingId === row.id}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Save size={15} />
                  Save
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
