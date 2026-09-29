"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock3,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import EmployeeSearch, {
  type EmployeeSearchValue,
} from "@/components/people/employee-search";
import {
  Card,
  MetricCard,
  tt,
} from "@/components/ui/tt-ui";
import {
  aggregateMhPerTonne,
  calculateLabourTotals,
  calculateTowerProgress,
  type ProgressStageInput,
} from "@/lib/dockets/calculations";

type Tower = {
  id: string;
  tower_identifier: string;
  tower_weight_t?: number | null;
};

type ProjectOption = {
  id: string;
  option_group: string;
  option_key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type Profile = {
  id: string;
  assembly_share: number;
  erection_share: number;
  normalize_applicable_weights: boolean;
  mh_t_basis: "progress_earned_tonnes" | "manual_tonnes";
  requires_review: boolean;
};

type LabourRow = {
  key: string;
  person: EmployeeSearchValue | null;
  workerName: string;
  timeIn: string;
  timeOut: string;
  prestartMinutes: string;
  lunchMinutes: string;
  travelInMinutes: string;
  travelOutMinutes: string;
  mobilisationHours: string;
  delayHours: string;
};

type DelayRow = {
  key: string;
  delayKey: string;
  delayLabel: string;
  delayHours: string;
  appliesTo: "entire_crew" | "selected_workers";
  notes: string;
};

type MaterialEventRow = {
  key: string;
  eventType: string;
  towerId: string;
  itemReference: string;
  description: string;
  quantity: string;
  unit: string;
  notes: string;
};

type PlantRow = {
  key: string;
  plantName: string;
  plantType: string;
  assetNumber: string;
  timeIn: string;
  timeOut: string;
  totalHours: string;
  delayHours: string;
  notes: string;
};

type StageState = {
  id: string;
  stageKey: string;
  label: string;
  phase: "assembly" | "erection";
  weight: number;
  applicable: boolean;
  percentBefore: number;
  percentAfter: number;
};

type TowerAllocation = {
  key: string;
  towerId: string;
  towerWeight: number;
  rawHours: string;
  productionHours: string;
  manualProductionTonnes: string;
  stages: StageState[];
  loading: boolean;
};

type Props = {
  organisationId: string;
  projectId: string;
  towers: Tower[];
  options: ProjectOption[];
  progressProfile: Profile;
  initialTowerId: string;
  initialDate: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankLabour(): LabourRow {
  return {
    key: uid(),
    person: null,
    workerName: "",
    timeIn: "",
    timeOut: "",
    prestartMinutes: "",
    lunchMinutes: "",
    travelInMinutes: "",
    travelOutMinutes: "",
    mobilisationHours: "",
    delayHours: "",
  };
}

function blankDelay(): DelayRow {
  return {
    key: uid(),
    delayKey: "",
    delayLabel: "",
    delayHours: "",
    appliesTo: "entire_crew",
    notes: "",
  };
}

function blankMaterial(): MaterialEventRow {
  return {
    key: uid(),
    eventType: "",
    towerId: "",
    itemReference: "",
    description: "",
    quantity: "1",
    unit: "ea",
    notes: "",
  };
}

function blankPlant(): PlantRow {
  return {
    key: uid(),
    plantName: "",
    plantType: "",
    assetNumber: "",
    timeIn: "",
    timeOut: "",
    totalHours: "",
    delayHours: "",
    notes: "",
  };
}

function blankAllocation(towerId = ""): TowerAllocation {
  return {
    key: uid(),
    towerId,
    towerWeight: 0,
    rawHours: "",
    productionHours: "",
    manualProductionTonnes: "",
    stages: [],
    loading: Boolean(towerId),
  };
}

export default function DailyDocketEditor({
  organisationId,
  projectId,
  towers,
  options,
  progressProfile,
  initialTowerId,
  initialDate,
}: Props) {
  const router = useRouter();

  const [docketDate, setDocketDate] = useState(initialDate);
  const [crewLabel, setCrewLabel] = useState("");
  const [leadingHand, setLeadingHand] =
    useState<EmployeeSearchValue | null>(null);
  const [weatherKey, setWeatherKey] = useState("");
  const [rateType, setRateType] = useState("");

  const [prestartMinutes, setPrestartMinutes] = useState("");
  const [lunchMinutes, setLunchMinutes] = useState("");
  const [travelInMinutes, setTravelInMinutes] = useState("");
  const [travelOutMinutes, setTravelOutMinutes] = useState("");

  const [labour, setLabour] = useState<LabourRow[]>([
    blankLabour(),
  ]);
  const [delays, setDelays] = useState<DelayRow[]>([]);
  const [materials, setMaterials] = useState<MaterialEventRow[]>([]);
  const [plant, setPlant] = useState<PlantRow[]>([]);
  const [incidentOccurred, setIncidentOccurred] = useState(false);
  const [incidentTypeKey, setIncidentTypeKey] = useState("");
  const [incidentNotes, setIncidentNotes] = useState("");
  const [allocations, setAllocations] = useState<TowerAllocation[]>([
    blankAllocation(initialTowerId),
  ]);

  const [dailySiteSummary, setDailySiteSummary] = useState("");
  const [rfiReferences, setRfiReferences] = useState("");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const optionMap = useMemo(() => {
    const map = new Map<string, ProjectOption[]>();

    for (const option of options) {
      const current = map.get(option.option_group) ?? [];
      current.push(option);
      map.set(option.option_group, current);
    }

    return map;
  }, [options]);

  const calculatedLabour = useMemo(
    () =>
      calculateLabourTotals(
        labour
          .filter((row) => row.workerName.trim())
          .map((row) => ({
            workerName: row.workerName,
            timeIn: row.timeIn,
            timeOut: row.timeOut,
            prestartMinutes: Number(
              row.prestartMinutes || prestartMinutes || 0,
            ),
            lunchMinutes: Number(
              row.lunchMinutes || lunchMinutes || 0,
            ),
            travelInMinutes: Number(
              row.travelInMinutes || travelInMinutes || 0,
            ),
            travelOutMinutes: Number(
              row.travelOutMinutes || travelOutMinutes || 0,
            ),
            mobilisationHours: Number(row.mobilisationHours || 0),
            delayHours: Number(row.delayHours || 0),
          })),
      ),
    [
      labour,
      lunchMinutes,
      prestartMinutes,
      travelInMinutes,
      travelOutMinutes,
    ],
  );

  const allocationMetrics = useMemo(() => {
    return allocations.map((allocation) => {
      if (!allocation.towerId || allocation.stages.length === 0) {
        return {
          key: allocation.key,
          earnedTonnes: 0,
          rawHours: Number(allocation.rawHours || 0),
          productionHours: Number(allocation.productionHours || 0),
          rawMhPerTonne: null,
          productionMhPerTonne: null,
          progress: null,
        };
      }

      const progress = calculateTowerProgress({
        stages: allocation.stages.map(
          (stage): ProgressStageInput => ({
            id: stage.id,
            phase: stage.phase,
            weight: stage.weight,
            applicable: stage.applicable,
            percentBefore: stage.percentBefore,
            percentAfter: Number(stage.percentAfter),
          }),
        ),
        profile: {
          assemblyShare: Number(progressProfile.assembly_share ?? 50),
          erectionShare: Number(progressProfile.erection_share ?? 50),
          normalizeApplicableWeights: Boolean(
            progressProfile.normalize_applicable_weights,
          ),
          mhTBasis:
            progressProfile.mh_t_basis === "manual_tonnes"
              ? "manual_tonnes"
              : "progress_earned_tonnes",
        },
        towerWeightTonnes: allocation.towerWeight,
        manualProductionTonnes: Number(
          allocation.manualProductionTonnes || 0,
        ),
      });

      const aggregate = aggregateMhPerTonne([
        {
          rawHours: Number(allocation.rawHours || 0),
          productionHours: Number(allocation.productionHours || 0),
          earnedTonnes: progress.earnedTonnes,
        },
      ]);

      return {
        key: allocation.key,
        earnedTonnes: progress.earnedTonnes,
        rawHours: Number(allocation.rawHours || 0),
        productionHours: Number(allocation.productionHours || 0),
        rawMhPerTonne: aggregate.rawMhPerTonne,
        productionMhPerTonne: aggregate.productionMhPerTonne,
        progress,
      };
    });
  }, [allocations, progressProfile]);

  const totalMhT = useMemo(
    () =>
      aggregateMhPerTonne(
        allocationMetrics.map((row) => ({
          rawHours: row.rawHours,
          productionHours: row.productionHours,
          earnedTonnes: row.earnedTonnes,
        })),
      ),
    [allocationMetrics],
  );

  async function loadTowerState(allocationKey: string, towerId: string) {
    setAllocations((current) =>
      current.map((row) =>
        row.key === allocationKey
          ? {
              ...row,
              towerId,
              loading: Boolean(towerId),
              stages: towerId ? row.stages : [],
            }
          : row,
      ),
    );

    if (!towerId) return;

    const params = new URLSearchParams({
      organisation: organisationId,
      towerId,
    });

    const response = await fetch(
      `/api/projects/${projectId}/daily-dockets/tower-state?${params.toString()}`,
      { cache: "no-store" },
    );

    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Could not load tower progress.");
      return;
    }

    setAllocations((current) =>
      current.map((row) =>
        row.key === allocationKey
          ? {
              ...row,
              towerId,
              towerWeight: Number(payload.tower.tower_weight_t ?? 0),
              stages: payload.stages,
              loading: false,
            }
          : row,
      ),
    );
  }

  useEffect(() => {
    if (!initialTowerId) return;
    const first = allocations[0];
    if (first && first.stages.length === 0) {
      void loadTowerState(first.key, initialTowerId);
    }
    // Initial tower only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTowerId]);

  function updateLabour(key: string, patch: Partial<LabourRow>) {
    setLabour((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function updateAllocation(
    key: string,
    patch: Partial<TowerAllocation>,
  ) {
    setAllocations((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function updateStage(
    allocationKey: string,
    stageId: string,
    patch: Partial<StageState>,
  ) {
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.key === allocationKey
          ? {
              ...allocation,
              stages: allocation.stages.map((stage) =>
                stage.id === stageId ? { ...stage, ...patch } : stage,
              ),
            }
          : allocation,
      ),
    );
  }

  function applyDocketDefaultsToAll() {
    setLabour((current) =>
      current.map((row) => ({
        ...row,
        prestartMinutes:
          row.prestartMinutes || prestartMinutes,
        lunchMinutes:
          row.lunchMinutes || lunchMinutes,
        travelInMinutes:
          row.travelInMinutes || travelInMinutes,
        travelOutMinutes:
          row.travelOutMinutes || travelOutMinutes,
      })),
    );
  }

  function allocateCalculatedHoursToFirstTower() {
    const first = allocations[0];
    if (!first) return;

    updateAllocation(first.key, {
      rawHours: calculatedLabour.rawManhours.toFixed(2),
      productionHours: calculatedLabour.productionManhours.toFixed(2),
    });
  }

  async function save(submit: boolean) {
    if (!docketDate) {
      setMessage("Docket date is required.");
      return;
    }

    if (!leadingHand) {
      setMessage("Select the Leading Hand.");
      return;
    }

    if (labour.filter((row) => row.workerName.trim()).length === 0) {
      setMessage("Add at least one employee.");
      return;
    }

    const allocatedRaw = allocations.reduce(
      (sum, row) => sum + Number(row.rawHours || 0),
      0,
    );

    const allocatedProduction = allocations.reduce(
      (sum, row) => sum + Number(row.productionHours || 0),
      0,
    );

    if (
      allocatedRaw - calculatedLabour.rawManhours > 0.05 ||
      allocatedProduction - calculatedLabour.productionManhours > 0.05
    ) {
      setMessage(
        "Tower allocations cannot exceed the calculated Raw MH or Production MH.",
      );
      return;
    }

    if (
      submit &&
      (Math.abs(allocatedRaw - calculatedLabour.rawManhours) > 0.05 ||
        Math.abs(
          allocatedProduction - calculatedLabour.productionManhours,
        ) > 0.05)
    ) {
      setMessage(
        "Before submitting, allocate all Raw MH and Production MH across the towers worked. Drafts can remain partially allocated.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    const response = await fetch(
      `/api/projects/${projectId}/daily-dockets/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          docketDate,
          primaryTowerId: allocations[0]?.towerId || null,
          crewLabel,
          leadingHandPersonId: leadingHand.id,
          leadingHandName: leadingHand.displayName,
          weatherKey,
          rateType,
          prestartMinutes: Number(prestartMinutes || 0),
          lunchMinutes: Number(lunchMinutes || 0),
          travelInMinutes: Number(travelInMinutes || 0),
          travelOutMinutes: Number(travelOutMinutes || 0),
          dailySiteSummary,
          rfiReferences,
          submit,
          labour: labour
            .filter((row) => row.workerName.trim())
            .map((row) => ({
              personId: row.person?.id ?? null,
              workerName: row.workerName,
              timeIn: row.timeIn,
              timeOut: row.timeOut,
              prestartMinutes: Number(
                row.prestartMinutes || prestartMinutes || 0,
              ),
              lunchMinutes: Number(
                row.lunchMinutes || lunchMinutes || 0,
              ),
              travelInMinutes: Number(
                row.travelInMinutes || travelInMinutes || 0,
              ),
              travelOutMinutes: Number(
                row.travelOutMinutes || travelOutMinutes || 0,
              ),
              mobilisationHours: Number(row.mobilisationHours || 0),
              delayHours: Number(row.delayHours || 0),
            })),
          plant: plant
            .filter((row) => row.plantName.trim())
            .map((row) => ({
              plantName: row.plantName,
              plantType: row.plantType,
              assetNumber: row.assetNumber,
              timeIn: row.timeIn,
              timeOut: row.timeOut,
              totalHours: Number(row.totalHours || 0),
              delayHours: Number(row.delayHours || 0),
              notes: row.notes,
            })),
          incidentOccurred,
          incidentTypeKey,
          incidentNotes,
          delays: delays
            .filter((row) => row.delayKey && Number(row.delayHours || 0) > 0)
            .map((row) => ({
              delayKey: row.delayKey,
              delayLabel: row.delayLabel,
              delayHours: Number(row.delayHours || 0),
              appliesTo: row.appliesTo,
              notes: row.notes,
            })),
          towerAllocations: allocations
            .filter((row) => row.towerId)
            .map((row) => ({
              towerId: row.towerId,
              rawHours: Number(row.rawHours || 0),
              productionHours: Number(row.productionHours || 0),
              manualProductionTonnes:
                row.manualProductionTonnes === ""
                  ? null
                  : Number(row.manualProductionTonnes),
              stages: row.stages.map((stage) => ({
                stageDefinitionId: stage.id,
                isApplicable: stage.applicable,
                percentAfter: Number(stage.percentAfter),
              })),
            })),
          materialEvents: materials
            .filter((row) => row.eventType && row.itemReference.trim())
            .map((row) => ({
              eventType: row.eventType,
              towerId: row.towerId || null,
              itemReference: row.itemReference,
              description: row.description,
              quantity: Number(row.quantity || 1),
              unit: row.unit || "ea",
              notes: row.notes,
            })),
        }),
      },
    );

    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error ?? "Daily Docket could not be saved.");
      return;
    }

    router.push(
      `/workspace/projects/${projectId}/daily-dockets?organisation=${encodeURIComponent(
        organisationId,
      )}`,
    );
    router.refresh();
  }

  return (
    <div className={tt.stack}>
      {progressProfile.requires_review ? (
        <div className={`${tt.notice} ${tt.noticeWarn}`}>
          Project progress weights have not been reviewed yet. The Daily Docket
          can be saved, but review Configuration before relying on MH/t.
        </div>
      ) : null}

      <div className={tt.metricGrid}>
        <MetricCard
          icon={<Clock3 size={18} />}
          label="Raw MH"
          value={calculatedLabour.rawManhours.toFixed(2)}
        />
        <MetricCard
          icon={<Clock3 size={18} />}
          label="Production MH"
          value={calculatedLabour.productionManhours.toFixed(2)}
        />
        <MetricCard
          label="Raw MH/t"
          value={
            totalMhT.rawMhPerTonne === null
              ? "-"
              : totalMhT.rawMhPerTonne.toFixed(2)
          }
          detail={`${totalMhT.earnedTonnes.toFixed(2)} earned t`}
        />
        <MetricCard
          label="Production MH/t"
          value={
            totalMhT.productionMhPerTonne === null
              ? "-"
              : totalMhT.productionMhPerTonne.toFixed(2)
          }
          detail={`${totalMhT.earnedTonnes.toFixed(2)} earned t`}
        />
      </div>

      <Card>
        <h2 className={tt.cardTitle}>Setup</h2>

        <div className={tt.formGrid} style={{ marginTop: 16 }}>
          <label className={tt.field}>
            <span className={tt.label}>Date</span>
            <input
              className="tt-input"
              type="date"
              value={docketDate}
              onChange={(event) => setDocketDate(event.target.value)}
            />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Crew</span>
            <input
              className="tt-input"
              value={crewLabel}
              onChange={(event) => setCrewLabel(event.target.value)}
              placeholder="Crew / work group"
            />
          </label>

          <EmployeeSearch
            organisationId={organisationId}
            projectId={projectId}
            label="Leading Hand"
            value={leadingHand}
            onChange={setLeadingHand}
          />

          <label className={tt.field}>
            <span className={tt.label}>Weather</span>
            <select
              className="tt-select"
              value={weatherKey}
              onChange={(event) => setWeatherKey(event.target.value)}
            >
              <option value="">Select...</option>
              {(optionMap.get("weather") ?? []).map((option) => (
                <option key={option.id} value={option.option_key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Rate type</span>
            <select
              className="tt-select"
              value={rateType}
              onChange={(event) => setRateType(event.target.value)}
            >
              <option value="">Select...</option>
              {(optionMap.get("rate_type") ?? []).map((option) => (
                <option key={option.id} value={option.option_key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>Crew & hours</h2>
            <p className={tt.cardDescription}>
              Raw MH is actual attendance time. Production MH deducts configured
              non-production time per employee.
            </p>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={() => setLabour((current) => [...current, blankLabour()])}
          >
            <Plus size={14} />
            Add employee
          </button>
        </div>

        <div className={tt.formGrid} style={{ marginTop: 16 }}>
          <label className={tt.field}>
            <span className={tt.label}>Default prestart minutes</span>
            <input
              className="tt-input"
              type="number"
              min={0}
              value={prestartMinutes}
              onChange={(event) => setPrestartMinutes(event.target.value)}
            />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Default lunch minutes</span>
            <input
              className="tt-input"
              type="number"
              min={0}
              value={lunchMinutes}
              onChange={(event) => setLunchMinutes(event.target.value)}
            />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Default travel in minutes</span>
            <input
              className="tt-input"
              type="number"
              min={0}
              value={travelInMinutes}
              onChange={(event) => setTravelInMinutes(event.target.value)}
            />
          </label>

          <label className={tt.field}>
            <span className={tt.label}>Default travel out minutes</span>
            <input
              className="tt-input"
              type="number"
              min={0}
              value={travelOutMinutes}
              onChange={(event) => setTravelOutMinutes(event.target.value)}
            />
          </label>
        </div>

        <div className={tt.actions} style={{ marginTop: 12 }}>
          <button
            type="button"
            className={tt.button}
            onClick={applyDocketDefaultsToAll}
          >
            Apply defaults to workers
          </button>
        </div>

        <div className={tt.stack} style={{ marginTop: 16 }}>
          {labour.map((row, index) => (
            <div key={row.key} className={tt.card} style={{ padding: 14 }}>
              <div className={tt.toolbar}>
                <div style={{ fontWeight: 800, color: "#f8fafc" }}>
                  Employee {index + 1}
                </div>

                {labour.length > 1 ? (
                  <button
                    type="button"
                    className={tt.button}
                    onClick={() =>
                      setLabour((current) =>
                        current.filter((item) => item.key !== row.key),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>

              <div className={tt.formGrid} style={{ marginTop: 12 }}>
                <EmployeeSearch
                  organisationId={organisationId}
                  projectId={projectId}
                  value={row.person}
                  onChange={(person) =>
                    updateLabour(row.key, {
                      person,
                      workerName: person?.displayName ?? "",
                    })
                  }
                />

                <label className={tt.field}>
                  <span className={tt.label}>Time in</span>
                  <input
                    className="tt-input"
                    value={row.timeIn}
                    onChange={(event) =>
                      updateLabour(row.key, { timeIn: event.target.value })
                    }
                    placeholder="06:00"
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Time out</span>
                  <input
                    className="tt-input"
                    value={row.timeOut}
                    onChange={(event) =>
                      updateLabour(row.key, { timeOut: event.target.value })
                    }
                    placeholder="18:00"
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Mobilisation hours</span>
                  <input
                    className="tt-input"
                    type="number"
                    min={0}
                    step="0.25"
                    value={row.mobilisationHours}
                    onChange={(event) =>
                      updateLabour(row.key, {
                        mobilisationHours: event.target.value,
                      })
                    }
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Delay hours</span>
                  <input
                    className="tt-input"
                    type="number"
                    min={0}
                    step="0.25"
                    value={row.delayHours}
                    onChange={(event) =>
                      updateLabour(row.key, {
                        delayHours: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>Tower work & progress</h2>
            <p className={tt.cardDescription}>
              Allocate Raw MH and Production MH across one or more towers. Stage
              weights and assembly/erection shares come from Project Configuration.
            </p>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={() =>
              setAllocations((current) => [
                ...current,
                blankAllocation(),
              ])
            }
          >
            <Plus size={14} />
            Add tower
          </button>
        </div>

        <div className={tt.actions} style={{ marginTop: 12 }}>
          <button
            type="button"
            className={tt.button}
            onClick={allocateCalculatedHoursToFirstTower}
          >
            Allocate all hours to first tower
          </button>
        </div>

        <div className={tt.stack} style={{ marginTop: 16 }}>
          {allocations.map((allocation, allocationIndex) => {
            const metric = allocationMetrics.find(
              (row) => row.key === allocation.key,
            );

            return (
              <div
                key={allocation.key}
                className={tt.card}
                style={{ padding: 14 }}
              >
                <div className={tt.toolbar}>
                  <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                    Tower allocation {allocationIndex + 1}
                  </div>

                  {allocations.length > 1 ? (
                    <button
                      type="button"
                      className={tt.button}
                      onClick={() =>
                        setAllocations((current) =>
                          current.filter(
                            (item) => item.key !== allocation.key,
                          ),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>

                <div className={tt.formGrid} style={{ marginTop: 12 }}>
                  <label className={tt.field}>
                    <span className={tt.label}>Tower</span>
                    <select
                      className="tt-select"
                      value={allocation.towerId}
                      onChange={(event) =>
                        void loadTowerState(
                          allocation.key,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">Select tower...</option>
                      {towers.map((tower) => (
                        <option key={tower.id} value={tower.id}>
                          {tower.tower_identifier}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={tt.field}>
                    <span className={tt.label}>Raw MH allocated</span>
                    <input
                      className="tt-input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={allocation.rawHours}
                      onChange={(event) =>
                        updateAllocation(allocation.key, {
                          rawHours: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className={tt.field}>
                    <span className={tt.label}>Production MH allocated</span>
                    <input
                      className="tt-input"
                      type="number"
                      min={0}
                      step="0.01"
                      value={allocation.productionHours}
                      onChange={(event) =>
                        updateAllocation(allocation.key, {
                          productionHours: event.target.value,
                        })
                      }
                    />
                  </label>

                  {progressProfile.mh_t_basis === "manual_tonnes" ? (
                    <label className={tt.field}>
                      <span className={tt.label}>Actual production tonnes</span>
                      <input
                        className="tt-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={allocation.manualProductionTonnes}
                        onChange={(event) =>
                          updateAllocation(allocation.key, {
                            manualProductionTonnes: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                </div>

                {allocation.loading ? (
                  <div className={tt.help} style={{ marginTop: 12 }}>
                    Loading tower progress...
                  </div>
                ) : allocation.stages.length > 0 ? (
                  <div style={{ marginTop: 16 }}>
                    {(["assembly", "erection"] as const).map((phase) => (
                      <div key={phase} style={{ marginTop: 16 }}>
                        <h3 className={tt.sectionTitle}>
                          {phase === "assembly" ? "Assembly" : "Erection"}
                        </h3>

                        <div
                          className={tt.tableWrap}
                          style={{ marginTop: 8 }}
                        >
                          <table className={tt.table}>
                            <thead>
                              <tr>
                                <th>Stage</th>
                                <th>Weight</th>
                                <th>Applicable</th>
                                <th>Before</th>
                                <th>After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allocation.stages
                                .filter((stage) => stage.phase === phase)
                                .map((stage) => (
                                  <tr key={stage.id}>
                                    <td>{stage.label}</td>
                                    <td>{stage.weight}</td>
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={stage.applicable}
                                        onChange={(event) =>
                                          updateStage(
                                            allocation.key,
                                            stage.id,
                                            {
                                              applicable:
                                                event.target.checked,
                                            },
                                          )
                                        }
                                      />
                                    </td>
                                    <td>{stage.percentBefore.toFixed(0)}%</td>
                                    <td>
                                      <input
                                        className="tt-input"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step="1"
                                        disabled={!stage.applicable}
                                        value={stage.percentAfter}
                                        onChange={(event) =>
                                          updateStage(
                                            allocation.key,
                                            stage.id,
                                            {
                                              percentAfter: Number(
                                                event.target.value,
                                              ),
                                            },
                                          )
                                        }
                                      />
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    <div
                      className={tt.metricGrid}
                      style={{
                        gridTemplateColumns:
                          "repeat(3,minmax(0,1fr))",
                        marginTop: 14,
                      }}
                    >
                      <MetricCard
                        label="Earned tonnes"
                        value={(metric?.earnedTonnes ?? 0).toFixed(2)}
                      />
                      <MetricCard
                        label="Raw MH/t"
                        value={
                          metric?.rawMhPerTonne == null
                            ? "-"
                            : metric.rawMhPerTonne.toFixed(2)
                        }
                      />
                      <MetricCard
                        label="Production MH/t"
                        value={
                          metric?.productionMhPerTonne == null
                            ? "-"
                            : metric.productionMhPerTonne.toFixed(2)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>


      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>Plant</h2>
            <p className={tt.cardDescription}>
              Record plant used on the docket. Plant hours remain separate from labour MH/t.
            </p>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={() => setPlant((current) => [...current, blankPlant()])}
          >
            <Plus size={14} />
            Add plant
          </button>
        </div>

        <div className={tt.stack} style={{ marginTop: 14 }}>
          {plant.map((row) => (
            <div key={row.key} className={tt.card} style={{ padding: 14 }}>
              <div className={tt.toolbar}>
                <div style={{ color: "#f8fafc", fontWeight: 800 }}>
                  Plant item
                </div>

                <button
                  type="button"
                  className={tt.button}
                  onClick={() =>
                    setPlant((current) =>
                      current.filter((item) => item.key !== row.key),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className={tt.formGrid} style={{ marginTop: 12 }}>
                <label className={tt.field}>
                  <span className={tt.label}>Plant name</span>
                  <input
                    className="tt-input"
                    value={row.plantName}
                    onChange={(event) =>
                      setPlant((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, plantName: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Plant type</span>
                  <input
                    className="tt-input"
                    value={row.plantType}
                    onChange={(event) =>
                      setPlant((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, plantType: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Asset number</span>
                  <input
                    className="tt-input"
                    value={row.assetNumber}
                    onChange={(event) =>
                      setPlant((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, assetNumber: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Total hours</span>
                  <input
                    className="tt-input"
                    type="number"
                    min={0}
                    step="0.25"
                    value={row.totalHours}
                    onChange={(event) =>
                      setPlant((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, totalHours: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Delay hours</span>
                  <input
                    className="tt-input"
                    type="number"
                    min={0}
                    step="0.25"
                    value={row.delayHours}
                    onChange={(event) =>
                      setPlant((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, delayHours: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}

          {plant.length === 0 ? (
            <div className={tt.help}>No plant recorded.</div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>Delays</h2>
            <p className={tt.cardDescription}>
              Delay types are controlled from Project Configuration.
            </p>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={() => setDelays((current) => [...current, blankDelay()])}
          >
            <Plus size={14} />
            Add delay
          </button>
        </div>

        <div className={tt.stack} style={{ marginTop: 14 }}>
          {delays.map((row) => (
            <div key={row.key} className={tt.mappingRow}>
              <select
                className="tt-select"
                value={row.delayKey}
                onChange={(event) => {
                  const selected = (optionMap.get("delay_type") ?? []).find(
                    (option) => option.option_key === event.target.value,
                  );

                  setDelays((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? {
                            ...item,
                            delayKey: event.target.value,
                            delayLabel: selected?.label ?? event.target.value,
                          }
                        : item,
                    ),
                  );
                }}
              >
                <option value="">Select delay...</option>
                {(optionMap.get("delay_type") ?? []).map((option) => (
                  <option key={option.id} value={option.option_key}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                className="tt-input"
                type="number"
                min={0}
                step="0.25"
                placeholder="Hours"
                value={row.delayHours}
                onChange={(event) =>
                  setDelays((current) =>
                    current.map((item) =>
                      item.key === row.key
                        ? { ...item, delayHours: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}

          {delays.length === 0 ? (
            <div className={tt.help}>No delays recorded.</div>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className={tt.toolbar}>
          <div>
            <h2 className={tt.cardTitle}>Materials</h2>
            <p className={tt.cardDescription}>
              Missing, excess, transfers and other material events feed Materials Control.
            </p>
          </div>

          <button
            type="button"
            className={tt.button}
            onClick={() =>
              setMaterials((current) => [...current, blankMaterial()])
            }
          >
            <Plus size={14} />
            Add material event
          </button>
        </div>

        <div className={tt.stack} style={{ marginTop: 14 }}>
          {materials.map((row) => (
            <div key={row.key} className={tt.card} style={{ padding: 14 }}>
              <div className={tt.formGrid}>
                <label className={tt.field}>
                  <span className={tt.label}>Event type</span>
                  <select
                    className="tt-select"
                    value={row.eventType}
                    onChange={(event) =>
                      setMaterials((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, eventType: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">Select...</option>
                    {(optionMap.get("material_event_type") ?? []).map(
                      (option) => (
                        <option key={option.id} value={option.option_key}>
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Tower</span>
                  <select
                    className="tt-select"
                    value={row.towerId}
                    onChange={(event) =>
                      setMaterials((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, towerId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">Project-wide / not assigned</option>
                    {towers.map((tower) => (
                      <option key={tower.id} value={tower.id}>
                        {tower.tower_identifier}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Item / bundle / bolt reference</span>
                  <input
                    className="tt-input"
                    value={row.itemReference}
                    onChange={(event) =>
                      setMaterials((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, itemReference: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>

                <label className={tt.field}>
                  <span className={tt.label}>Quantity</span>
                  <input
                    className="tt-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.quantity}
                    onChange={(event) =>
                      setMaterials((current) =>
                        current.map((item) =>
                          item.key === row.key
                            ? { ...item, quantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            </div>
          ))}

          {materials.length === 0 ? (
            <div className={tt.help}>No material events recorded.</div>
          ) : null}
        </div>
      </Card>


      <Card>
        <h2 className={tt.cardTitle}>Incident check</h2>
        <p className={tt.cardDescription}>
          Incident types are configured for the project.
        </p>

        <label
          className={tt.notice}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginTop: 14,
          }}
        >
          <input
            type="checkbox"
            checked={incidentOccurred}
            onChange={(event) => setIncidentOccurred(event.target.checked)}
          />
          An incident occurred on this docket
        </label>

        {incidentOccurred ? (
          <div className={tt.formGrid} style={{ marginTop: 14 }}>
            <label className={tt.field}>
              <span className={tt.label}>Incident type</span>
              <select
                className="tt-select"
                value={incidentTypeKey}
                onChange={(event) => setIncidentTypeKey(event.target.value)}
              >
                <option value="">Select...</option>
                {(optionMap.get("incident_type") ?? []).map((option) => (
                  <option key={option.id} value={option.option_key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${tt.field} ${tt.fieldWide}`}>
              <span className={tt.label}>Incident notes</span>
              <textarea
                className="tt-input"
                rows={3}
                value={incidentNotes}
                onChange={(event) => setIncidentNotes(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className={tt.cardTitle}>Daily site summary</h2>

        <div className={tt.formGrid} style={{ marginTop: 14 }}>
          <label className={`${tt.field} ${tt.fieldWide}`}>
            <span className={tt.label}>Site summary</span>
            <textarea
              className="tt-input"
              rows={4}
              value={dailySiteSummary}
              onChange={(event) => setDailySiteSummary(event.target.value)}
            />
          </label>

          <label className={`${tt.field} ${tt.fieldWide}`}>
            <span className={tt.label}>RFI references</span>
            <input
              className="tt-input"
              value={rfiReferences}
              onChange={(event) => setRfiReferences(event.target.value)}
            />
          </label>
        </div>
      </Card>

      {message ? (
        <div className={`${tt.notice} ${tt.noticeWarn}`}>
          <AlertTriangle size={15} style={{ marginRight: 7 }} />
          {message}
        </div>
      ) : null}

      <div className={tt.formActions}>
        <button
          type="button"
          className={tt.button}
          disabled={busy}
          onClick={() => void save(false)}
        >
          <Save size={15} />
          Save draft
        </button>

        <button
          type="button"
          className={`${tt.button} ${tt.buttonPrimary}`}
          disabled={busy}
          onClick={() => void save(true)}
        >
          {busy ? "Saving..." : "Submit docket"}
        </button>
      </div>
    </div>
  );
}
