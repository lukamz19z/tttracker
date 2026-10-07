"use client";

import { FormEvent, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ClipboardCheck,
  Gauge,
  PackageCheck,
  Plus,
  Save,
  Settings2,
} from "lucide-react";

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

type SectionKey = "progress" | "dockets" | "materials" | "review";

type Props = {
  projectId: string;
  organisationId: string;
  canConfigureMaterials: boolean;
  canConfigureProject: boolean;
  canViewProjectSettings: boolean;
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
  } | null;
  options: Option[];
  reviewSettings: {
    internalReviewRequired: boolean;
    clientApprovalEnabled: boolean;
    clientApprovalRequired: boolean;
    clientCanViewRawMh: boolean;
    clientCanViewProductionMh: boolean;
  };
};

const docketOptionGroups = [
  ["delay_type", "Delay types"],
  ["weather", "Weather"],
  ["rate_type", "Rate types"],
  ["incident_type", "Incident types"],
  ["material_event_type", "Daily Docket material event types"],
  ["material_outcome", "Material work outcomes"],
  ["material_unit", "Material units"],
] as const;

const materialsOptionGroups = [
  ["material_issue_type", "Issue types"],
  ["material_issue_event_type", "Issue timeline events"],
  ["material_source_type", "Replacement / source types"],
  ["material_location_type", "Location types"],
  ["material_movement_type", "Movement types"],
  ["material_amendment_scope", "Amendment scopes"],
  ["material_amendment_action", "Amendment actions"],
  ["material_amendment_status", "Amendment statuses"],
  ["material_import_source", "Import source types"],
  ["material_import_source_role", "Import source roles"],
] as const;

const sections: Array<{
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  {
    key: "progress",
    label: "Progress & MH/t",
    description: "Progress stages, weights and MH/t basis",
    icon: Gauge,
  },
  {
    key: "dockets",
    label: "Daily Dockets",
    description: "Default dropdowns and project options",
    icon: ClipboardCheck,
  },
  {
    key: "materials",
    label: "Materials",
    description: "Deliveries, missing/excess and material defaults",
    icon: PackageCheck,
  },
  {
    key: "review",
    label: "Review & Client",
    description: "Internal review and client visibility",
    icon: Settings2,
  },
];

export default function ConfigurationClient({
  projectId,
  organisationId,
  progress,
  options,
  reviewSettings,
  canConfigureMaterials,
  canConfigureProject,
  canViewProjectSettings,
}: Props) {
  const [section, setSection] = useState<SectionKey>(canViewProjectSettings ? "progress" : "materials");
  const [assemblyShare, setAssemblyShare] = useState(String(progress?.profile.assembly_share ?? 50));
  const [erectionShare, setErectionShare] = useState(String(progress?.profile.erection_share ?? 50));
  const [normalize, setNormalize] = useState(progress?.profile.normalize_applicable_weights ?? true);
  const [mhTBasis, setMhTBasis] = useState(progress?.profile.mh_t_basis ?? "progress_earned_tonnes");
  const [stages, setStages] = useState<Stage[]>(progress?.stages ?? []);
  const [optionRows, setOptionRows] = useState<Option[]>(() => {
    const hasDeliveryFeature = options.some(
      (option) => option.option_group === "material_feature" && option.option_key === "deliveries",
    );

    if (hasDeliveryFeature) return options;

    return [
      ...options,
      {
        id: "new-material-deliveries",
        option_group: "material_feature",
        option_key: "deliveries",
        label: "Bundle delivery management",
        sort_order: 10,
        is_active: true,
        settings: {},
      },
    ];
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [internalReviewRequired, setInternalReviewRequired] = useState(reviewSettings.internalReviewRequired);
  const [clientApprovalEnabled, setClientApprovalEnabled] = useState(reviewSettings.clientApprovalEnabled);
  const [clientApprovalRequired, setClientApprovalRequired] = useState(reviewSettings.clientApprovalRequired);
  const [clientCanViewRawMh, setClientCanViewRawMh] = useState(reviewSettings.clientCanViewRawMh);
  const [clientCanViewProductionMh, setClientCanViewProductionMh] = useState(reviewSettings.clientCanViewProductionMh);

  const assemblyStages = useMemo(
    () => stages.filter((stage) => stage.phase === "assembly"),
    [stages],
  );
  const erectionStages = useMemo(
    () => stages.filter((stage) => stage.phase === "erection"),
    [stages],
  );

  const deliveriesEnabled =
    optionRows.find(
      (option) => option.option_group === "material_feature" && option.option_key === "deliveries",
    )?.is_active !== false;

  function updateStage(id: string, patch: Partial<Stage>) {
    setStages((current) => current.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)));
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

    const response = await fetch(`/api/projects/${projectId}/configuration/progress`, {
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
    });

    const payload = await response.json();
    setSaving(null);
    setMessage(response.ok ? "Progress configuration saved." : payload.error);
  }

  async function saveOptionGroup(optionGroup: string) {
    setSaving(optionGroup);
    setMessage(null);

    const response = await fetch(`/api/projects/${projectId}/configuration/options`, {
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
    });

    const payload = await response.json();
    setSaving(null);
    setMessage(response.ok ? "Configuration saved." : payload.error);
  }

  async function saveReviewSettings() {
    setSaving("review");
    setMessage(null);

    const response = await fetch(`/api/projects/${projectId}/configuration/review`, {
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
    });

    const payload = await response.json();
    setSaving(null);
    setMessage(response.ok ? "Review settings saved." : payload.error ?? "Could not save review settings.");
  }

  function setDeliveriesEnabled(enabled: boolean) {
    setOptionRows((current) =>
      current.map((option) =>
        option.option_group === "material_feature" && option.option_key === "deliveries"
          ? { ...option, is_active: enabled }
          : option,
      ),
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "230px minmax(0,1fr)",
        gap: 14,
        alignItems: "start",
      }}
    >
      <div style={{ position: "sticky", top: 14 }}>
        <Card>
          <div className="tt-label" style={{ marginBottom: 8 }}>Configuration sections</div>
        <div style={{ display: "grid", gap: 6 }}>
          {sections.filter((item) => canViewProjectSettings || item.key === "materials").map((item) => {
            const Icon = item.icon;
            const active = section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                className={`${tt.button} ${active ? tt.buttonPrimary : tt.buttonSecondary}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr",
                  alignItems: "start",
                  gap: 8,
                  textAlign: "left",
                  justifyContent: "stretch",
                  padding: "9px 10px",
                }}
              >
                <Icon size={15} />
                <span>
                  <strong style={{ display: "block" }}>{item.label}</strong>
                  <span style={{ display: "block", opacity: .7, fontSize: 11, marginTop: 2 }}>
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
          </div>
        </Card>
      </div>

      <div className={tt.stack}>
        {message ? <div className={`${tt.notice} ${tt.noticeInfo}`}>{message}</div> : null}

        <fieldset disabled={section === "materials" ? !canConfigureMaterials : !canConfigureProject} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {section === "progress" ? (
          <form onSubmit={saveProgress}>
            <Card>
              <h2 className={tt.cardTitle}>Progress & MH/t</h2>
              <p className={tt.cardDescription}>
                Configure the project progress model without changing the rest of Materials or Daily Dockets.
              </p>

              {progress?.profile.requires_review ? (
                <div className={`${tt.notice} ${tt.noticeWarn}`} style={{ marginTop: 12 }}>
                  The section weights were seeded as a starting point. Review them before relying on MH/t.
                </div>
              ) : null}

              <div className={tt.formGrid} style={{ marginTop: 16 }}>
                <label className={tt.field}>
                  <span className={tt.label}>Assembly share</span>
                  <input className="tt-input" type="number" min={0} value={assemblyShare} onChange={(event) => setAssemblyShare(event.target.value)} />
                </label>
                <label className={tt.field}>
                  <span className={tt.label}>Erection share</span>
                  <input className="tt-input" type="number" min={0} value={erectionShare} onChange={(event) => setErectionShare(event.target.value)} />
                </label>
                <label className={tt.field}>
                  <span className={tt.label}>MH/t basis</span>
                  <select className="tt-select" value={mhTBasis} onChange={(event) => setMhTBasis(event.target.value as "progress_earned_tonnes" | "manual_tonnes")}>
                    <option value="progress_earned_tonnes">Progress-earned tonnes</option>
                    <option value="manual_tonnes">Manual actual tonnes</option>
                  </select>
                </label>
                <label className={tt.notice} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <input type="checkbox" checked={normalize} onChange={(event) => setNormalize(event.target.checked)} />
                  Normalise applicable section weights
                </label>
              </div>

              <StageEditor title="Assembly stages" rows={assemblyStages} onUpdate={updateStage} onAdd={() => addStage("assembly")} />
              <StageEditor title="Erection stages" rows={erectionStages} onUpdate={updateStage} onAdd={() => addStage("erection")} />

              <div className={tt.formActions}>
                <button className={`${tt.button} ${tt.buttonPrimary}`} disabled={saving === "progress"}>
                  <Save size={15} /> {saving === "progress" ? "Saving..." : "Save progress configuration"}
                </button>
              </div>
            </Card>
          </form>
        ) : null}

        {section === "dockets" ? (
          <div className={tt.stack}>
            <Card>
              <h2 className={tt.cardTitle}>Daily Docket default options</h2>
              <p className={tt.cardDescription}>These are the project dropdowns crews use in Daily Dockets.</p>
            </Card>
            {docketOptionGroups.map(([group, title]) => (
              <OptionEditor
                key={group}
                group={group}
                disabled={group.startsWith("material_") && !canConfigureMaterials}
                title={title}
                options={optionRows}
                setOptions={setOptionRows}
                saving={saving === group}
                onSave={() => void saveOptionGroup(group)}
              />
            ))}
          </div>
        ) : null}

        {section === "materials" ? (
          <div className={tt.stack}>
            <Card>
              <h2 className={tt.cardTitle}>Materials project features</h2>
              <p className={tt.cardDescription}>
                Enable only the workflows this project actually uses. Delivery management can be on for one project and off for another.
              </p>
              <label className={tt.notice} style={{ display: "flex", gap: 10, alignItems: "start", marginTop: 12 }}>
                <input type="checkbox" checked={deliveriesEnabled} onChange={(event) => setDeliveriesEnabled(event.target.checked)} />
                <span>
                  <strong style={{ display: "block" }}>Bundle delivery management</strong>
                  <span className={tt.secondary}>
                    Enables delivery dockets, driver bundle confirmation and the delivery stage in the Bundle Status report.
                  </span>
                </span>
              </label>
              <div className={tt.formActions}>
                <button type="button" className={`${tt.button} ${tt.buttonPrimary}`} onClick={() => void saveOptionGroup("material_feature")} disabled={saving === "material_feature"}>
                  <Save size={15} /> {saving === "material_feature" ? "Saving..." : "Save Materials features"}
                </button>
              </div>
            </Card>

            <Card>
              <h2 className={tt.cardTitle}>Materials default options</h2>
              <p className={tt.cardDescription}>
                Configure the source, location, movement, missing/excess, amendment and import options used throughout Materials Control.
              </p>
            </Card>

            {materialsOptionGroups.map(([group, title]) => (
              <OptionEditor
                key={group}
                group={group}
                disabled={group.startsWith("material_") && !canConfigureMaterials}
                title={title}
                options={optionRows}
                setOptions={setOptionRows}
                saving={saving === group}
                onSave={() => void saveOptionGroup(group)}
              />
            ))}
          </div>
        ) : null}

        {section === "review" ? (
          <Card>
            <h2 className={tt.cardTitle}>Review & client visibility</h2>
            <p className={tt.cardDescription}>Review and client visibility remain project settings rather than fixed role behaviour.</p>
            <div className={tt.stack} style={{ marginTop: 14 }}>
              <Toggle checked={internalReviewRequired} onChange={setInternalReviewRequired} label="Require internal review before finalisation" />
              <Toggle checked={clientApprovalEnabled} onChange={setClientApprovalEnabled} label="Enable client approval" />
              {clientApprovalEnabled ? (
                <>
                  <Toggle checked={clientApprovalRequired} onChange={setClientApprovalRequired} label="Client approval is required" />
                  <Toggle checked={clientCanViewRawMh} onChange={setClientCanViewRawMh} label="Client can view Raw MH/t" />
                  <Toggle checked={clientCanViewProductionMh} onChange={setClientCanViewProductionMh} label="Client can view Production MH/t" />
                </>
              ) : null}
            </div>
            <div className={tt.formActions}>
              <button type="button" className={`${tt.button} ${tt.buttonPrimary}`} onClick={() => void saveReviewSettings()} disabled={saving === "review"}>
                <Save size={15} /> {saving === "review" ? "Saving..." : "Save review settings"}
              </button>
            </div>
          </Card>
        ) : null}
        </fieldset>
      </div>
    </div>
  );
}

function OptionEditor({
  group,
  title,
  options,
  setOptions,
  saving,
  onSave,
  disabled,
}: {
  disabled: boolean;
  group: string;
  title: string;
  options: Option[];
  setOptions: Dispatch<SetStateAction<Option[]>>;
  saving: boolean;
  onSave: () => void;
}) {
  const rows = options.filter((option) => option.option_group === group);

  return (
    <Card>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className={tt.toolbar}>
        <div>
          <h3 className={tt.sectionTitle}>{title}</h3>
          <p className={tt.sectionSub}>{rows.length} option{rows.length === 1 ? "" : "s"}</p>
        </div>
        <button
          type="button"
          className={tt.button}
          onClick={() => {
            const stamp = Date.now();
            setOptions((current) => [
              ...current,
              {
                id: `new-${stamp}`,
                option_group: group,
                option_key: `option_${stamp}`,
                label: "New option",
                sort_order: rows.length * 10 + 10,
                is_active: true,
                settings: {},
              },
            ]);
          }}
        >
          <Plus size={14} /> Add option
        </button>
      </div>

      <div className={tt.mappingList} style={{ marginTop: 12 }}>
        {rows.map((option) => (
          <div key={option.id} className={tt.mappingRow}>
            <input
              className="tt-input"
              value={option.label}
              onChange={(event) =>
                setOptions((current) => current.map((row) => (row.id === option.id ? { ...row, label: event.target.value } : row)))
              }
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={option.is_active}
                onChange={(event) =>
                  setOptions((current) => current.map((row) => (row.id === option.id ? { ...row, is_active: event.target.checked } : row)))
                }
              />
              Active
            </label>
          </div>
        ))}
        {rows.length === 0 ? <div className={tt.help}>No options configured yet.</div> : null}
      </div>

      <div className={tt.formActions}>
        <button type="button" className={`${tt.button} ${tt.buttonPrimary}`} onClick={onSave} disabled={saving}>
          <Save size={15} /> {saving ? "Saving..." : "Save options"}
        </button>
      </div>
      </fieldset>
    </Card>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className={tt.notice} style={{ display: "flex", gap: 9, alignItems: "center" }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
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
  const totalWeight = rows.filter((row) => row.is_active).reduce((sum, row) => sum + Number(row.weight || 0), 0);

  return (
    <div style={{ marginTop: 20 }}>
      <div className={tt.toolbar}>
        <div>
          <h3 className={tt.sectionTitle}>{title}</h3>
          <p className={tt.sectionSub}>Active weight total: {totalWeight.toFixed(1)}</p>
        </div>
        <button type="button" className={tt.button} onClick={onAdd}>
          <Plus size={14} /> Add stage
        </button>
      </div>

      <div className={tt.tableWrap} style={{ marginTop: 10 }}>
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
                <td><input className="tt-input" value={stage.label} onChange={(event) => onUpdate(stage.id, { label: event.target.value })} /></td>
                <td><input className="tt-input" type="number" min={0} step="0.01" value={stage.weight} onChange={(event) => onUpdate(stage.id, { weight: Number(event.target.value) })} /></td>
                <td><input type="checkbox" checked={stage.default_applicable} onChange={(event) => onUpdate(stage.id, { default_applicable: event.target.checked })} /></td>
                <td><input type="checkbox" checked={stage.is_active} onChange={(event) => onUpdate(stage.id, { is_active: event.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
