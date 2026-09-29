"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus, Save } from "lucide-react";

import { Card, tt } from "@/components/ui/tt-ui";

type Stage = {
  id: string;
  stage_key: string;
  label: string;
  phase: "assembly" | "erection";
  weight: number;
  sort_order: number;
  is_active: boolean;
  default_applicable: boolean;
};

type Option = {
  id: string;
  option_group: string;
  option_key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  settings: Record<string, unknown>;
};

type Props = {
  projectId: string;
  organisationId: string;
  progress: {
    profile: {
      id: string;
      assembly_share: number;
      erection_share: number;
      normalize_applicable_weights: boolean;
      mh_t_basis: "progress_earned_tonnes" | "manual_tonnes";
      requires_review: boolean;
    };
    stages: Stage[];
  };
  options: Option[];
  reviewSettings: {
    internalReviewRequired: boolean;
    clientApprovalEnabled: boolean;
    clientApprovalRequired: boolean;
    clientCanViewRawMh: boolean;
    clientCanViewProductionMh: boolean;
  };
};

const optionGroups = [
  ["delay_type", "Delay types"],
  ["material_event_type", "Material event types"],
  ["weather", "Weather"],
  ["rate_type", "Rate types"],
  ["incident_type", "Incident types"],
  ["material_outcome", "Material work outcomes"],
  ["material_unit", "Material units"],
] as const;

export default function ConfigurationClient({
  projectId,
  organisationId,
  progress,
  options,
  reviewSettings,
}: Props) {
  const [assemblyShare, setAssemblyShare] = useState(
    String(progress.profile.assembly_share),
  );
  const [erectionShare, setErectionShare] = useState(
    String(progress.profile.erection_share),
  );
  const [normalize, setNormalize] = useState(
    progress.profile.normalize_applicable_weights,
  );
  const [mhTBasis, setMhTBasis] = useState(
    progress.profile.mh_t_basis,
  );
  const [stages, setStages] = useState<Stage[]>(progress.stages);
  const [optionRows, setOptionRows] = useState<Option[]>(options);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [internalReviewRequired, setInternalReviewRequired] = useState(
    reviewSettings.internalReviewRequired,
  );
  const [clientApprovalEnabled, setClientApprovalEnabled] = useState(
    reviewSettings.clientApprovalEnabled,
  );
  const [clientApprovalRequired, setClientApprovalRequired] = useState(
    reviewSettings.clientApprovalRequired,
  );
  const [clientCanViewRawMh, setClientCanViewRawMh] = useState(
    reviewSettings.clientCanViewRawMh,
  );
  const [clientCanViewProductionMh, setClientCanViewProductionMh] = useState(
    reviewSettings.clientCanViewProductionMh,
  );

  const assemblyStages = useMemo(
    () => stages.filter((stage) => stage.phase === "assembly"),
    [stages],
  );

  const erectionStages = useMemo(
    () => stages.filter((stage) => stage.phase === "erection"),
    [stages],
  );

  function updateStage(id: string, patch: Partial<Stage>) {
    setStages((current) =>
      current.map((stage) =>
        stage.id === id ? { ...stage, ...patch } : stage,
      ),
    );
  }

  function addStage(phase: "assembly" | "erection") {
    const stamp = Date.now();
    setStages((current) => [
      ...current,
      {
        id: `new-${stamp}`,
        stage_key: `stage_${stamp}`,
        label: "New stage",
        phase,
        weight: 0,
        sort_order: current.length * 10 + 10,
        is_active: true,
        default_applicable: true,
      },
    ]);
  }

  async function saveProgress(event: FormEvent) {
    event.preventDefault();
    setSaving("progress");
    setMessage(null);

    const response = await fetch(
      `/api/projects/${projectId}/configuration/progress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          assemblyShare: Number(assemblyShare),
          erectionShare: Number(erectionShare),
          normalizeApplicableWeights: normalize,
          mhTBasis,
          stages: stages.map((stage) => ({
            stageKey: stage.stage_key,
            label: stage.label,
            phase: stage.phase,
            weight: Number(stage.weight),
            sortOrder: stage.sort_order,
            isActive: stage.is_active,
            defaultApplicable: stage.default_applicable,
          })),
        }),
      },
    );

    const payload = await response.json();

    setSaving(null);
    setMessage(response.ok ? "Progress configuration saved." : payload.error);
  }

  async function saveOptionGroup(optionGroup: string) {
    setSaving(optionGroup);
    setMessage(null);

    const response = await fetch(
      `/api/projects/${projectId}/configuration/options`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          optionGroup,
          options: optionRows
            .filter((option) => option.option_group === optionGroup)
            .map((option) => ({
              optionKey: option.option_key,
              label: option.label,
              sortOrder: option.sort_order,
              isActive: option.is_active,
              settings: option.settings,
            })),
        }),
      },
    );

    const payload = await response.json();

    setSaving(null);
    setMessage(response.ok ? "Options saved." : payload.error);
  }

  async function saveReviewSettings() {
    setSaving("review");
    setMessage(null);

    const response = await fetch(
      `/api/projects/${projectId}/configuration/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          internalReviewRequired,
          clientApprovalEnabled,
          clientApprovalRequired,
          clientCanViewRawMh,
          clientCanViewProductionMh,
        }),
      },
    );

    const payload = await response.json();
    setSaving(null);
    setMessage(
      response.ok
        ? "Review settings saved."
        : payload.error ?? "Could not save review settings.",
    );
  }

  return (
    <div className={tt.stack}>
      {progress.profile.requires_review ? (
        <div className={`${tt.notice} ${tt.noticeWarn}`}>
          The section weights were seeded as a legacy-compatible starting point.
          Review them before relying on MH/t. If the weights do not represent
          the physical share of tower tonnage, use Manual Tonnes for MH/t instead.
        </div>
      ) : null}

      <form onSubmit={saveProgress}>
        <Card>
          <h2 className={tt.cardTitle}>Progress & MH/t</h2>
          <p className={tt.cardDescription}>
            Assembly and erection tracking is project-configurable. Non-applicable
            stages can be normalised so a tower can still reach 100%.
          </p>

          <div className={tt.formGrid} style={{ marginTop: 18 }}>
            <label className={tt.field}>
              <span className={tt.label}>Assembly share of total progress</span>
              <input
                className="tt-input"
                type="number"
                min={0}
                value={assemblyShare}
                onChange={(event) => setAssemblyShare(event.target.value)}
              />
            </label>

            <label className={tt.field}>
              <span className={tt.label}>Erection share of total progress</span>
              <input
                className="tt-input"
                type="number"
                min={0}
                value={erectionShare}
                onChange={(event) => setErectionShare(event.target.value)}
              />
            </label>

            <label className={tt.field}>
              <span className={tt.label}>MH/t tonnage basis</span>
              <select
                className="tt-select"
                value={mhTBasis}
                onChange={(event) =>
                  setMhTBasis(
                    event.target.value as
                      | "progress_earned_tonnes"
                      | "manual_tonnes",
                  )
                }
              >
                <option value="progress_earned_tonnes">
                  Progress-earned tonnes
                </option>
                <option value="manual_tonnes">
                  Manual actual tonnes
                </option>
              </select>
              <div className={tt.help}>
                Progress-earned tonnes uses tower weight × progress gained.
                Manual tonnes allows the docket to record actual productive tonnes.
              </div>
            </label>

            <label
              className={tt.notice}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <input
                type="checkbox"
                checked={normalize}
                onChange={(event) => setNormalize(event.target.checked)}
              />
              Normalise applicable section weights
            </label>
          </div>

          <StageEditor
            title="Assembly stages"
            rows={assemblyStages}
            onUpdate={updateStage}
            onAdd={() => addStage("assembly")}
          />

          <StageEditor
            title="Erection stages"
            rows={erectionStages}
            onUpdate={updateStage}
            onAdd={() => addStage("erection")}
          />

          <div className={tt.formActions}>
            <button
              className={`${tt.button} ${tt.buttonPrimary}`}
              disabled={saving === "progress"}
            >
              <Save size={15} />
              {saving === "progress" ? "Saving..." : "Save progress configuration"}
            </button>
          </div>
        </Card>
      </form>

      {optionGroups.map(([group, title]) => (
        <Card key={group}>
          <div className={tt.toolbar}>
            <div>
              <h2 className={tt.cardTitle}>{title}</h2>
              <p className={tt.cardDescription}>
                These values feed project Daily Docket dropdowns.
              </p>
            </div>

            <button
              type="button"
              className={tt.button}
              onClick={() => {
                const stamp = Date.now();
                setOptionRows((current) => [
                  ...current,
                  {
                    id: `new-${stamp}`,
                    option_group: group,
                    option_key: `option_${stamp}`,
                    label: "New option",
                    sort_order:
                      current.filter((option) => option.option_group === group)
                        .length *
                        10 +
                      10,
                    is_active: true,
                    settings: {},
                  },
                ]);
              }}
            >
              <Plus size={14} />
              Add option
            </button>
          </div>

          <div className={tt.mappingList} style={{ marginTop: 16 }}>
            {optionRows
              .filter((option) => option.option_group === group)
              .map((option) => (
                <div key={option.id} className={tt.mappingRow}>
                  <input
                    className="tt-input"
                    value={option.label}
                    onChange={(event) =>
                      setOptionRows((current) =>
                        current.map((row) =>
                          row.id === option.id
                            ? { ...row, label: event.target.value }
                            : row,
                        ),
                      )
                    }
                  />

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#cbd5e1",
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={option.is_active}
                      onChange={(event) =>
                        setOptionRows((current) =>
                          current.map((row) =>
                            row.id === option.id
                              ? { ...row, is_active: event.target.checked }
                              : row,
                          ),
                        )
                      }
                    />
                    Active
                  </label>
                </div>
              ))}
          </div>

          <div className={tt.formActions}>
            <button
              type="button"
              className={`${tt.button} ${tt.buttonPrimary}`}
              onClick={() => void saveOptionGroup(group)}
              disabled={saving === group}
            >
              <Save size={15} />
              {saving === group ? "Saving..." : "Save options"}
            </button>
          </div>
        </Card>
      ))}

      <Card>
        <h2 className={tt.cardTitle}>Daily Docket review</h2>
        <p className={tt.cardDescription}>
          Review and client visibility are project settings, not fixed role behaviour.
        </p>

        <div className={tt.stack} style={{ marginTop: 16 }}>
          <label className={tt.notice} style={{ display: "flex", gap: 9 }}>
            <input
              type="checkbox"
              checked={internalReviewRequired}
              onChange={(event) =>
                setInternalReviewRequired(event.target.checked)
              }
            />
            Require internal review before finalisation
          </label>

          <label className={tt.notice} style={{ display: "flex", gap: 9 }}>
            <input
              type="checkbox"
              checked={clientApprovalEnabled}
              onChange={(event) =>
                setClientApprovalEnabled(event.target.checked)
              }
            />
            Enable client approval
          </label>

          {clientApprovalEnabled ? (
            <>
              <label className={tt.notice} style={{ display: "flex", gap: 9 }}>
                <input
                  type="checkbox"
                  checked={clientApprovalRequired}
                  onChange={(event) =>
                    setClientApprovalRequired(event.target.checked)
                  }
                />
                Client approval is required
              </label>

              <label className={tt.notice} style={{ display: "flex", gap: 9 }}>
                <input
                  type="checkbox"
                  checked={clientCanViewRawMh}
                  onChange={(event) =>
                    setClientCanViewRawMh(event.target.checked)
                  }
                />
                Client can view Raw MH/t
              </label>

              <label className={tt.notice} style={{ display: "flex", gap: 9 }}>
                <input
                  type="checkbox"
                  checked={clientCanViewProductionMh}
                  onChange={(event) =>
                    setClientCanViewProductionMh(event.target.checked)
                  }
                />
                Client can view Production MH/t
              </label>
            </>
          ) : null}
        </div>

        <div className={tt.formActions}>
          <button
            type="button"
            className={`${tt.button} ${tt.buttonPrimary}`}
            onClick={() => void saveReviewSettings()}
            disabled={saving === "review"}
          >
            <Save size={15} />
            {saving === "review" ? "Saving..." : "Save review settings"}
          </button>
        </div>
      </Card>

      {message ? (
        <div className={`${tt.notice} ${tt.noticeInfo}`}>{message}</div>
      ) : null}
    </div>
  );
}

function StageEditor({
  title,
  rows,
  onUpdate,
  onAdd,
}: {
  title: string;
  rows: Stage[];
  onUpdate: (id: string, patch: Partial<Stage>) => void;
  onAdd: () => void;
}) {
  const totalWeight = rows
    .filter((row) => row.is_active)
    .reduce((sum, row) => sum + Number(row.weight || 0), 0);

  return (
    <div style={{ marginTop: 24 }}>
      <div className={tt.toolbar}>
        <div>
          <h3 className={tt.sectionTitle}>{title}</h3>
          <p className={tt.sectionSub}>
            Active weight total: {totalWeight.toFixed(1)}
          </p>
        </div>

        <button type="button" className={tt.button} onClick={onAdd}>
          <Plus size={14} />
          Add stage
        </button>
      </div>

      <div className={tt.tableWrap} style={{ marginTop: 12 }}>
        <table className={tt.table}>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Weight</th>
              <th>Applicable by default</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((stage) => (
              <tr key={stage.id}>
                <td>
                  <input
                    className="tt-input"
                    value={stage.label}
                    onChange={(event) =>
                      onUpdate(stage.id, { label: event.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    className="tt-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={stage.weight}
                    onChange={(event) =>
                      onUpdate(stage.id, {
                        weight: Number(event.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={stage.default_applicable}
                    onChange={(event) =>
                      onUpdate(stage.id, {
                        default_applicable: event.target.checked,
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={stage.is_active}
                    onChange={(event) =>
                      onUpdate(stage.id, {
                        is_active: event.target.checked,
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
