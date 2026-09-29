"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Settings2, Trash2 } from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";
import {
  type ConfiguredOption,
  loadConfiguredOptions,
} from "@/lib/operations/config";

type GroupDefinition = {
  moduleKey: string;
  optionGroup: string;
  title: string;
  description: string;
};

const GROUPS: GroupDefinition[] = [
  {
    moduleKey: "materials",
    optionGroup: "event_type",
    title: "Material event types",
    description: "Missing, received, transferred, damaged and other event choices.",
  },
  {
    moduleKey: "materials",
    optionGroup: "work_outcome",
    title: "Material work outcomes",
    description: "How a material issue affected the planned works.",
  },
  {
    moduleKey: "materials",
    optionGroup: "current_effect",
    title: "Current material effect",
    description: "Current status shown while the material issue remains open.",
  },
  {
    moduleKey: "materials",
    optionGroup: "mitigation_action",
    title: "Material mitigation actions",
    description: "Alternative work / actions taken to reduce impact.",
  },
  {
    moduleKey: "materials",
    optionGroup: "manual_category",
    title: "Unlisted material categories",
    description: "Categories available when the item is not in the imported register.",
  },
  {
    moduleKey: "daily_dockets",
    optionGroup: "delay_type",
    title: "Delay categories",
    description: "Delay types available on the Daily Docket.",
  },
  {
    moduleKey: "daily_dockets",
    optionGroup: "production_activity",
    title: "Production activities",
    description: "Activities available for primary/additional tower work allocation.",
  },
];

export function OperationalDropdownSettingsPanel({
  organisationId,
  projectId = null,
}: {
  organisationId: string;
  projectId?: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [activeGroup, setActiveGroup] = useState(GROUPS[0]);
  const [rows, setRows] = useState<ConfiguredOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const loaded = await loadConfiguredOptions(supabase, {
      organisationId,
      projectId,
      moduleKey: activeGroup.moduleKey,
      optionGroup: activeGroup.optionGroup,
    });
    setRows(loaded);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeGroup.moduleKey,
    activeGroup.optionGroup,
    organisationId,
    projectId,
  ]);

  async function addOption() {
    const code = `option_${Date.now()}`;
    const result = await supabase.from("v2_module_options").insert({
      organisation_id: organisationId,
      project_id: projectId,
      module_key: activeGroup.moduleKey,
      option_group: activeGroup.optionGroup,
      code,
      label: "New option",
      behavior: code,
      is_active: true,
      sort_order: (rows.at(-1)?.sort_order || 0) + 10,
    });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    await load();
  }

  async function saveRow(row: ConfiguredOption) {
    const isInherited =
      row.organisation_id !== organisationId ||
      (projectId ? row.project_id !== projectId : row.project_id !== null);

    const payload = {
      organisation_id: organisationId,
      project_id: projectId,
      module_key: activeGroup.moduleKey,
      option_group: activeGroup.optionGroup,
      code: row.code,
      label: row.label,
      behavior: row.behavior || row.code,
      is_active: row.is_active,
      sort_order: row.sort_order,
      metadata: row.metadata || {},
      updated_at: new Date().toISOString(),
    };

    const result = isInherited
      ? await supabase.from("v2_module_options").insert(payload)
      : await supabase
          .from("v2_module_options")
          .update(payload)
          .eq("id", row.id);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage("Option saved.");
    await load();
  }

  async function hideInherited(row: ConfiguredOption) {
    const result = await supabase.from("v2_module_options").insert({
      organisation_id: organisationId,
      project_id: projectId,
      module_key: activeGroup.moduleKey,
      option_group: activeGroup.optionGroup,
      code: row.code,
      label: row.label,
      behavior: row.behavior || row.code,
      is_active: false,
      sort_order: row.sort_order,
      metadata: row.metadata || {},
    });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    await load();
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Settings2 size={22} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">
            Operational dropdowns
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Labels and available options are resolved from platform defaults,
            organisation overrides and project overrides. Operational behaviour
            stays tied to the stable behavior value.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {GROUPS.map((group) => (
          <button
            type="button"
            key={`${group.moduleKey}:${group.optionGroup}`}
            onClick={() => setActiveGroup(group)}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-black ${
              group.optionGroup === activeGroup.optionGroup &&
              group.moduleKey === activeGroup.moduleKey
                ? "bg-slate-950 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {group.title}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <div className="font-black text-slate-900">{activeGroup.title}</div>
          <div className="mt-1 text-sm text-slate-500">
            {activeGroup.description}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void addOption()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
        >
          <Plus size={16} />
          Add option
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
          {message}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading options…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No options are configured for this group.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const inherited =
                row.organisation_id !== organisationId ||
                (projectId
                  ? row.project_id !== projectId
                  : row.project_id !== null);

              return (
                <div
                  key={`${row.code}:${index}`}
                  className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_110px_auto]"
                >
                  <label>
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Label
                    </span>
                    <input
                      value={row.label}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((candidate) =>
                            candidate.code === row.code
                              ? { ...candidate, label: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Stable behaviour
                    </span>
                    <input
                      value={row.behavior}
                      disabled={inherited}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((candidate) =>
                            candidate.code === row.code
                              ? {
                                  ...candidate,
                                  behavior: event.target.value,
                                }
                              : candidate,
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Order
                    </span>
                    <input
                      type="number"
                      value={row.sort_order}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((candidate) =>
                            candidate.code === row.code
                              ? {
                                  ...candidate,
                                  sort_order: Number(event.target.value),
                                }
                              : candidate,
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void saveRow(row)}
                      title={inherited ? "Create override" : "Save"}
                      className="rounded-xl bg-blue-600 p-2.5 text-white hover:bg-blue-700"
                    >
                      <Save size={16} />
                    </button>

                    {inherited ? (
                      <button
                        type="button"
                        onClick={() => void hideInherited(row)}
                        title="Hide this inherited option"
                        className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
