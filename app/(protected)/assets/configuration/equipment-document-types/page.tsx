"use client";

import Link from "next/link";
import {
  CheckCircle2,
  FileCog,
  Loader2,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createSupabaseBrowser } from "@/lib/supabase";

type EquipmentType =
  | "all"
  | "lifting_gear"
  | "fall_arrest"
  | "generator"
  | "ladder"
  | "torque_wrench"
  | "inventory_kit";

type Category =
  | "compliance"
  | "service"
  | "inspection"
  | "manual"
  | "photo"
  | "other";

type DateRequirement =
  | "none"
  | "document_date"
  | "expiry_date"
  | "document_and_expiry";

type ReplacementMode = "current" | "historical";

type EquipmentDocumentTypeRow = {
  id: string;
  system_key: string | null;
  name: string;
  code: string;
  category: Category;
  applies_to: EquipmentType[];
  date_requirement: DateRequirement;
  replacement_mode: ReplacementMode;
  preserve_original_filename: boolean;
  active: boolean;
  sort_order: number;
};

type Payload = {
  documentTypes?: EquipmentDocumentTypeRow[];
  canConfigure?: boolean;
  error?: string;
};

type Draft = {
  id: string | null;
  systemKey: string | null;
  name: string;
  code: string;
  category: Category;
  appliesTo: EquipmentType[];
  dateRequirement: DateRequirement;
  replacementMode: ReplacementMode;
  preserveOriginalFilename: boolean;
  active: boolean;
  sortOrder: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  systemKey: null,
  name: "",
  code: "",
  category: "other",
  appliesTo: ["all"],
  dateRequirement: "none",
  replacementMode: "historical",
  preserveOriginalFilename: true,
  active: true,
  sortOrder: "100",
};

const EQUIPMENT_OPTIONS: Array<{ value: EquipmentType; label: string }> = [
  { value: "all", label: "All Equipment" },
  { value: "lifting_gear", label: "Lifting Gear" },
  { value: "fall_arrest", label: "Fall Arrest" },
  { value: "generator", label: "Generators" },
  { value: "ladder", label: "Ladders" },
  { value: "torque_wrench", label: "Torque Wrenches" },
  { value: "inventory_kit", label: "Inventory Kits" },
];

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toDraft(row: EquipmentDocumentTypeRow): Draft {
  return {
    id: row.id,
    systemKey: row.system_key,
    name: row.name,
    code: row.code,
    category: row.category,
    appliesTo: row.applies_to?.length ? row.applies_to : ["all"],
    dateRequirement: row.date_requirement,
    replacementMode: row.replacement_mode,
    preserveOriginalFilename: row.preserve_original_filename,
    active: row.active,
    sortOrder: String(row.sort_order),
  };
}

export default function EquipmentDocumentTypesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [rows, setRows] = useState<EquipmentDocumentTypeRow[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Sign in again.");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.access_token}`);
      if (typeof init.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(url, { ...init, headers, cache: "no-store" });
    },
    [supabase],
  );

  const fetchRows = useCallback(async () => {
    const response = await apiFetch("/api/assets/equipment-document-types");
    const payload = (await response.json()) as Payload;

    if (!response.ok) {
      throw new Error(
        payload.error || "Equipment document types could not be loaded.",
      );
    }

    return {
      rows: payload.documentTypes ?? [],
      canConfigure: Boolean(payload.canConfigure),
    };
  }, [apiFetch]);

  const reload = useCallback(async () => {
    const result = await fetchRows();
    setRows(result.rows);
    setCanConfigure(result.canConfigure);
  }, [fetchRows]);

  useEffect(() => {
    let cancelled = false;

    void fetchRows()
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setCanConfigure(result.canConfigure);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage({
            tone: "error",
            text:
              error instanceof Error
                ? error.message
                : "Equipment document types could not be loaded.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  function toggleAppliesTo(value: EquipmentType) {
    if (!draft) return;

    setDraft((current) => {
      if (!current) return current;

      if (value === "all") {
        return { ...current, appliesTo: ["all"] };
      }

      const withoutAll = current.appliesTo.filter((item) => item !== "all");
      const next = withoutAll.includes(value)
        ? withoutAll.filter((item) => item !== value)
        : [...withoutAll, value];

      return {
        ...current,
        appliesTo: next.length > 0 ? next : ["all"],
      };
    });
  }

  async function save() {
    if (!draft) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await apiFetch(
        draft.id
          ? `/api/assets/equipment-document-types/${draft.id}`
          : "/api/assets/equipment-document-types",
        {
          method: draft.id ? "PATCH" : "POST",
          body: JSON.stringify({
            name: draft.name,
            code: draft.code,
            category: draft.category,
            appliesTo: draft.appliesTo,
            dateRequirement: draft.dateRequirement,
            replacementMode: draft.replacementMode,
            preserveOriginalFilename: draft.preserveOriginalFilename,
            active: draft.active,
            sortOrder: Number(draft.sortOrder) || 100,
          }),
        },
      );

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error || "Equipment document type could not be saved.",
        );
      }

      await reload();
      setDraft(null);
      setMessage({
        tone: "success",
        text: "Equipment document type saved.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Equipment document type could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
              <FileCog size={23} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Assets · Configuration
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                Equipment Document Types
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Configure the document register used by lifting gear, fall arrest,
                fall arrest, generators, ladders, torque wrenches and inventory kits. Files are
                stored in SharePoint; these settings only control TTTracker metadata,
                folder placement and current-versus-historical behaviour.
              </p>
              <Link
                href="/assets/configuration"
                className="mt-3 inline-flex text-sm font-black text-blue-700 hover:underline"
              >
                ← Back to Assets Configuration
              </Link>
            </div>
          </div>

          {canConfigure ? (
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
            >
              <Plus size={16} />
              Add Equipment Document Type
            </button>
          ) : null}
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Applies To</th>
                <th className="px-5 py-3">Date Rule</th>
                <th className="px-5 py-3">Behaviour</th>
                <th className="px-5 py-3">Filename</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <Loader2
                      size={26}
                      className="mx-auto animate-spin text-slate-400"
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-16 text-center text-sm font-semibold text-slate-400"
                  >
                    No equipment document types are configured.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="align-top hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-black text-slate-950">{row.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {titleCase(row.category)}
                        {row.system_key ? ` · System: ${row.system_key}` : " · Custom"}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-black text-slate-700">
                      {row.code}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {(row.applies_to ?? [])
                        .map(
                          (value) =>
                            EQUIPMENT_OPTIONS.find((option) => option.value === value)
                              ?.label || titleCase(value),
                        )
                        .join(", ") || "All Equipment"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {titleCase(row.date_requirement)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ${
                          row.replacement_mode === "current"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {row.replacement_mode === "current"
                          ? "Current / Supersede"
                          : "Historical"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      {row.preserve_original_filename
                        ? "Preserve original filename"
                        : "TTTracker-controlled filename"}
                    </td>
                    <td className="px-5 py-4">
                      {row.active ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                          <CheckCircle2 size={15} /> Active
                        </span>
                      ) : (
                        <span className="font-bold text-slate-400">Inactive</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {canConfigure ? (
                        <button
                          type="button"
                          onClick={() => setDraft(toDraft(row))}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-8">
          <div className="my-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {draft.id ? "Edit" : "Add"} Equipment Document Type
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  This controls metadata and SharePoint behaviour for future
                  equipment uploads.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={saving}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Document Type Name">
                  <Input
                    value={draft.name}
                    onChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, name: value } : current,
                      )
                    }
                    placeholder="e.g. Annual Inspection Certificate"
                  />
                </Field>
                <Field label="Code">
                  <Input
                    value={draft.code}
                    onChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, code: value } : current,
                      )
                    }
                    placeholder="INSP"
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              category: event.target.value as Category,
                            }
                          : current,
                      )
                    }
                    className="input"
                  >
                    <option value="compliance">Compliance</option>
                    <option value="service">Service & Repairs</option>
                    <option value="inspection">Inspections</option>
                    <option value="manual">Manuals</option>
                    <option value="photo">Photos</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Date Requirement">
                  <select
                    value={draft.dateRequirement}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              dateRequirement: event.target
                                .value as DateRequirement,
                            }
                          : current,
                      )
                    }
                    className="input"
                  >
                    <option value="none">No date required</option>
                    <option value="document_date">Document / completion date</option>
                    <option value="expiry_date">Expiry / due date</option>
                    <option value="document_and_expiry">Document + expiry dates</option>
                  </select>
                </Field>
                <Field label="Replacement Behaviour">
                  <select
                    value={draft.replacementMode}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              replacementMode: event.target
                                .value as ReplacementMode,
                            }
                          : current,
                      )
                    }
                    className="input"
                  >
                    <option value="current">
                      Current — supersede previous version
                    </option>
                    <option value="historical">
                      Historical — keep every upload
                    </option>
                  </select>
                </Field>
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, sortOrder: value } : current,
                      )
                    }
                  />
                </Field>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="font-black text-slate-900">Applies To</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {EQUIPMENT_OPTIONS.map((option) => {
                    const checked = draft.appliesTo.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAppliesTo(option.value)}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={draft.preserveOriginalFilename}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              preserveOriginalFilename: event.target.checked,
                            }
                          : current,
                      )
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-black text-slate-900">
                      Preserve original filename
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Recommended until BC defines a controlled naming convention
                      for each equipment class.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, active: event.target.checked }
                          : current,
                      )
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-black text-slate-900">
                      Active
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Inactive types remain in history but cannot be selected for
                      new uploads.
                    </span>
                  </span>
                </label>
              </div>

              {draft.systemKey ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  System key: <span className="font-black">{draft.systemKey}</span>.
                  The integration key remains stable even if the display name or
                  code changes.
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  Save Document Type
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px rgb(219 234 254);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-800">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="input"
    />
  );
}
