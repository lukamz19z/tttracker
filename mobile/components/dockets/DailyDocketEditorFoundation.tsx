import { Ionicons } from "@expo/vector-icons";

import { DailyDocketReviewSubmit } from "@/components/dockets/DailyDocketReviewSubmit";
import { DailyDocketSiteEvents } from "@/components/dockets/DailyDocketSiteEvents";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import {
  calculateHours,
  calculateLabourTotals,
  calculateProgressTotals,
  normalizeTimeInput,
  toNumber,
} from "@/lib/dockets/calculations";
import {
  createBlankLabourRow,
  createBlankPlantRow,
  createBlankSectionV2Rows,
  DAILY_DOCKET_STEPS,
  docketUiId,
  type DailyDocketStep,
} from "@/lib/dockets/constants";
import type {
  AdditionalTowerWork,
  DailyDocketDraft,
  DailyDocketEditorPayload,
  LabourRow,
  PlantRow,
  ProductionActivity,
  TowerRevisionAllocation,
} from "@/types/daily-dockets";

type DailyDocketEditorFoundationProps = {
  payload: DailyDocketEditorPayload;
  draft: DailyDocketDraft;
  step: DailyDocketStep;
  onChange: (next: DailyDocketDraft) => void;
  onStepChange: (step: DailyDocketStep) => void;
  onCopyPrevious?: () => void;
  copyingPrevious?: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
  saving?: boolean;
  submitting?: boolean;
  disabled?: boolean;
};

type SelectOption = {
  value: string;
  label: string;
  subtitle?: string;
};

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  disabled?: boolean;
  suffix?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedName(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}


function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  disabled = false,
  suffix,
}: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.inputFrame,
          multiline && styles.inputFrameMultiline,
          disabled && styles.disabledFrame,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          keyboardType={keyboardType}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
          ]}
        />
        {suffix ? (
          <Text style={styles.inputSuffix}>{suffix}</Text>
        ) : null}
      </View>
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  onSelect,
  disabled = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find(
    (option) => option.value === value,
  );

  return (
    <>
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Pressable
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={({ pressed }: { pressed: boolean }) => [
            styles.selectButton,
            disabled && styles.disabledFrame,
            pressed && !disabled && styles.pressed,
          ]}
        >
          <View style={styles.selectTextWrap}>
            <Text
              numberOfLines={1}
              style={[
                styles.selectText,
                !selected && styles.placeholderText,
              ]}
            >
              {selected?.label || placeholder}
            </Text>
            {selected?.subtitle ? (
              <Text
                numberOfLines={1}
                style={styles.selectSubtitle}
              >
                {selected.subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name="chevron-down"
            size={18}
            color="#64748b"
          />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={() => undefined}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{label}</Text>

            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
            >
              {options.map((option) => {
                const active = option.value === value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                    style={[
                      styles.modalOption,
                      active && styles.modalOptionActive,
                    ]}
                  >
                    <View style={styles.modalOptionText}>
                      <Text
                        style={[
                          styles.modalOptionLabel,
                          active &&
                            styles.modalOptionLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {option.subtitle ? (
                        <Text
                          style={styles.modalOptionSubtitle}
                        >
                          {option.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#2563eb"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => setOpen(false)}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {helper ? (
        <Text style={styles.metricHelper}>{helper}</Text>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
  disabled = false,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={15}
          color={selected ? "#ffffff" : "#475569"}
        />
      ) : null}
      <Text
        style={[
          styles.chipText,
          selected && styles.chipTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.cardSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function EmptyCard({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon} size={24} color="#64748b" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function StepStrip({
  current,
  onChange,
}: {
  current: DailyDocketStep;
  onChange: (step: DailyDocketStep) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stepStrip}
    >
      {DAILY_DOCKET_STEPS.map((item, index) => {
        const active = item.key === current;

        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[
              styles.stepPill,
              active && styles.stepPillActive,
            ]}
          >
            <View
              style={[
                styles.stepNumber,
                active && styles.stepNumberActive,
              ]}
            >
              <Text
                style={[
                  styles.stepNumberText,
                  active && styles.stepNumberTextActive,
                ]}
              >
                {index + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                active && styles.stepLabelActive,
              ]}
            >
              {item.shortLabel}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function activityLabel(value: ProductionActivity) {
  switch (value) {
    case "assembly":
      return "Assembly";
    case "erection":
      return "Erection";
    case "rectification":
      return "Rectification";
    case "other":
      return "Other";
    case "mixed":
    default:
      return "Mixed";
  }
}

const ACTIVITIES: ProductionActivity[] = [
  "mixed",
  "assembly",
  "erection",
  "rectification",
  "other",
];

export function DailyDocketEditorFoundation({
  payload,
  draft,
  step,
  onChange,
  onStepChange,
  onCopyPrevious,
  copyingPrevious = false,
  onSaveDraft,
  onSubmit,
  saving = false,
  submitting = false,
  disabled = false,
}: DailyDocketEditorFoundationProps) {
  const [bulkIn, setBulkIn] = useState("");
  const [bulkOut, setBulkOut] = useState("");
  const [employeePickerOpen, setEmployeePickerOpen] =
    useState(false);
  const [expandedAdditional, setExpandedAdditional] =
    useState<Set<string>>(new Set());

  const locked =
    disabled ||
    [
      "submitted_bc",
      "client_pending",
      "final",
      "legacy_final",
    ].includes(clean(draft.approvalStatus));

  const setDraft = (
    patch: Partial<DailyDocketDraft>,
  ) => {
    if (locked) return;
    onChange({ ...draft, ...patch });
  };

  const labourTotals = useMemo(
    () =>
      calculateLabourTotals(
        draft.labourRows,
        draft.delayRows,
        {
          enabled: draft.mobilisation.enabled,
          durationMinutes:
            Math.max(
              0,
              toNumber(draft.mobilisationHours),
            ) * 60,
          workerNames:
            draft.mobilisation.worker_names,
        },
      ),
    [
      draft.labourRows,
      draft.delayRows,
      draft.mobilisation.enabled,
      draft.mobilisation.worker_names,
      draft.mobilisationHours,
    ],
  );

  const progressTotals = useMemo(
    () =>
      calculateProgressTotals({
        progressModel: draft.progressModel,
        sectionV2Rows: draft.sectionV2Rows,
        legacyRows: draft.legacyProgressRows,
        hasBodyExtension: draft.hasBodyExtension,
      }),
    [
      draft.progressModel,
      draft.sectionV2Rows,
      draft.legacyProgressRows,
      draft.hasBodyExtension,
    ],
  );

  const revisionManhours = useMemo(
    () =>
      draft.towerRevisionAllocations.reduce(
        (sum, row) =>
          sum +
          Math.max(0, toNumber(row.hours)) *
            row.worker_names.length,
        0,
      ),
    [draft.towerRevisionAllocations],
  );

  const productionPool = Math.max(
    0,
    labourTotals.productionManhours - revisionManhours,
  );

  const extraShare = draft.additionalTowerWork.reduce(
    (sum, row) =>
      sum + Math.max(0, toNumber(row.allocation_percent)),
    0,
  );

  const primaryShare = Math.max(0, 100 - extraShare);

  const towerName = (towerId: string) =>
    payload.towers.find((tower) => tower.id === towerId)
      ?.name || "Tower";

  const currentTower = payload.towers.find(
    (tower) => tower.id === draft.towerId,
  );

  const crewOptions: SelectOption[] = payload.crews
    .filter((crew) => crew.active !== false)
    .map((crew) => ({
      value: crew.id,
      label: [
        crew.crew_number || "Crew",
        crew.crew_name || "",
      ]
        .filter(Boolean)
        .join(" · "),
      subtitle: crew.leading_hand
        ? `Leading Hand: ${crew.leading_hand}`
        : undefined,
    }));

  const towerOptions: SelectOption[] = payload.towers.map(
    (tower) => ({
      value: tower.id,
      label: tower.name,
      subtitle: tower.line || undefined,
    }),
  );

  const workerNames = labourTotals.rows
    .map((row) => clean(row.worker_name))
    .filter(Boolean);

  const availableEmployees = payload.employees.filter(
    (employee) =>
      employee.active !== false &&
      !draft.labourRows.some(
        (row) =>
          normalizedName(row.worker_name) ===
          normalizedName(employee.full_name),
      ),
  );

  const updateLabourRow = (
    index: number,
    patch: Partial<LabourRow>,
  ) => {
    if (locked) return;

    const labourRows = draft.labourRows.map(
      (row, rowIndex) => {
        if (rowIndex !== index) return row;

        const next = {
          ...row,
          ...patch,
        };

        if (
          patch.time_in !== undefined ||
          patch.time_out !== undefined
        ) {
          next.total_hours = calculateHours(
            next.time_in,
            next.time_out,
          );
        }

        return next;
      },
    );

    setDraft({ labourRows });
  };

  const addEmployee = (name: string) => {
    if (locked) return;

    if (
      draft.labourRows.some(
        (row) =>
          normalizedName(row.worker_name) ===
          normalizedName(name),
      )
    ) {
      return;
    }

    setDraft({
      labourRows: [
        ...draft.labourRows,
        {
          ...createBlankLabourRow({
            prestartMinutes: draft.prestartMinutes,
            lunchMinutes: draft.lunchBreakMinutes,
            travelInMinutes: draft.travelInMinutes,
            travelOutMinutes: draft.travelOutMinutes,
          }),
          worker_name: name,
        },
      ],
    });
  };

  const loadCrewMembers = () => {
    if (locked || !draft.selectedCrewId) return;

    const existing = new Set(
      draft.labourRows.map((row) =>
        normalizedName(row.worker_name),
      ),
    );

    const additions = payload.employees
      .filter(
        (employee) =>
          employee.active !== false &&
          employee.crew_id === draft.selectedCrewId &&
          !existing.has(normalizedName(employee.full_name)),
      )
      .map((employee) => ({
        ...createBlankLabourRow({
          prestartMinutes: draft.prestartMinutes,
          lunchMinutes: draft.lunchBreakMinutes,
          travelInMinutes: draft.travelInMinutes,
          travelOutMinutes: draft.travelOutMinutes,
        }),
        worker_name: employee.full_name,
      }));

    if (additions.length > 0) {
      setDraft({
        labourRows: [...draft.labourRows, ...additions],
      });
    }
  };

  const applyBulkTimes = () => {
    if (locked) return;

    const normalizedIn = bulkIn
      ? normalizeTimeInput(bulkIn)
      : "";
    const normalizedOut = bulkOut
      ? normalizeTimeInput(bulkOut)
      : "";

    setDraft({
      labourRows: draft.labourRows.map((row) => {
        const next = {
          ...row,
          time_in: normalizedIn || row.time_in,
          time_out: normalizedOut || row.time_out,
        };

        return {
          ...next,
          total_hours: calculateHours(
            next.time_in,
            next.time_out,
          ),
        };
      }),
    });
  };

  const applyProductionDefaults = () => {
    if (locked) return;

    setDraft({
      labourRows: draft.labourRows.map((row) => ({
        ...row,
        prestart_minutes: draft.prestartMinutes,
        lunch_minutes: draft.lunchBreakMinutes,
        travel_in_minutes: draft.travelInMinutes,
        travel_out_minutes: draft.travelOutMinutes,
      })),
    });
  };

  const updatePlantRow = (
    index: number,
    patch: Partial<PlantRow>,
  ) => {
    if (locked) return;

    const plantRows = draft.plantRows.map(
      (row, rowIndex) => {
        if (rowIndex !== index) return row;

        const next = {
          ...row,
          ...patch,
        };

        if (
          patch.time_in !== undefined ||
          patch.time_out !== undefined
        ) {
          next.total_hours = calculateHours(
            next.time_in,
            next.time_out,
          );
        }

        return next;
      },
    );

    setDraft({ plantRows });
  };

  const updatePrimaryProgress = (
    index: number,
    key: "assembly_today" | "erection_today",
    value: string,
  ) => {
    if (locked) return;

    const nextValue =
      value === ""
        ? ""
        : String(
            Math.max(
              0,
              Math.min(100, toNumber(value)),
            ),
          );

    setDraft({
      sectionV2Rows: draft.sectionV2Rows.map(
        (row, rowIndex) =>
          rowIndex === index
            ? { ...row, [key]: nextValue }
            : row,
      ),
    });
  };

  const addAdditionalTower = () => {
    if (locked) return;

    const row: AdditionalTowerWork = {
      ui_id: docketUiId("additional-tower"),
      target_tower_id: "",
      allocation_percent: "",
      saved_allocated_mh: 0,
      activity: "mixed",
      notes: "",
      has_body_extension: true,
      progress_rows: createBlankSectionV2Rows(),
    };

    setDraft({
      additionalTowerWork: [
        ...draft.additionalTowerWork,
        row,
      ],
    });

    setExpandedAdditional((current) => {
      const next = new Set(current);
      next.add(row.ui_id);
      return next;
    });
  };

  const updateAdditionalTower = (
    index: number,
    patch: Partial<AdditionalTowerWork>,
  ) => {
    if (locked) return;

    const additionalTowerWork =
      draft.additionalTowerWork.map(
        (row, rowIndex) => {
          if (rowIndex !== index) return row;

          if (patch.target_tower_id !== undefined) {
            const tower = payload.towers.find(
              (item) =>
                item.id === patch.target_tower_id,
            );

            return {
              ...row,
              ...patch,
              has_body_extension:
                tower?.has_body_extension ??
                row.has_body_extension,
            };
          }

          return { ...row, ...patch };
        },
      );

    setDraft({ additionalTowerWork });
  };

  const updateAdditionalProgress = (
    workIndex: number,
    progressIndex: number,
    key: "assembly_today" | "erection_today",
    value: string,
  ) => {
    if (locked) return;

    const nextValue =
      value === ""
        ? ""
        : String(
            Math.max(
              0,
              Math.min(100, toNumber(value)),
            ),
          );

    const additionalTowerWork =
      draft.additionalTowerWork.map(
        (work, index) => {
          if (index !== workIndex) return work;

          return {
            ...work,
            progress_rows: work.progress_rows.map(
              (row, rowIndex) =>
                rowIndex === progressIndex
                  ? {
                      ...row,
                      [key]: nextValue,
                    }
                  : row,
            ),
          };
        },
      );

    setDraft({ additionalTowerWork });
  };

  const addRevisionAllocation = () => {
    if (locked) return;

    const row: TowerRevisionAllocation = {
      ui_id: docketUiId("revision"),
      target_tower_id: draft.towerId,
      hours: "",
      worker_names: [],
      reason: "",
    };

    setDraft({
      towerRevisionAllocations: [
        ...draft.towerRevisionAllocations,
        row,
      ],
    });
  };

  const updateRevisionAllocation = (
    index: number,
    patch: Partial<TowerRevisionAllocation>,
  ) => {
    if (locked) return;

    setDraft({
      towerRevisionAllocations:
        draft.towerRevisionAllocations.map(
          (row, rowIndex) =>
            rowIndex === index
              ? { ...row, ...patch }
              : row,
        ),
    });
  };

  const toggleRevisionWorker = (
    index: number,
    workerName: string,
  ) => {
    const row = draft.towerRevisionAllocations[index];
    if (!row || locked) return;

    const exists = row.worker_names.some(
      (name) =>
        normalizedName(name) ===
        normalizedName(workerName),
    );

    updateRevisionAllocation(index, {
      worker_names: exists
        ? row.worker_names.filter(
            (name) =>
              normalizedName(name) !==
              normalizedName(workerName),
          )
        : [...row.worker_names, workerName],
    });
  };

  const renderSetup = () => (
    <View style={styles.screenStack}>
      <SectionCard
        title="Docket Setup"
        subtitle="Confirm the day, tower and crew before entering production."
        action={
          onCopyPrevious ? (
            <Pressable
              disabled={locked || copyingPrevious}
              onPress={onCopyPrevious}
              style={[
                styles.secondaryButton,
                (locked || copyingPrevious) &&
                  styles.buttonDisabled,
              ]}
            >
              <Ionicons
                name="copy-outline"
                size={16}
                color="#1d4ed8"
              />
              <Text style={styles.secondaryButtonText}>
                {copyingPrevious
                  ? "Loading…"
                  : "Copy Previous"}
              </Text>
            </Pressable>
          ) : null
        }
      >
        <View style={styles.heroTower}>
          <View style={styles.heroIcon}>
            <Ionicons
              name="radio-outline"
              size={22}
              color="#1d4ed8"
            />
          </View>
          <View style={styles.heroTowerText}>
            <Text style={styles.heroTowerName}>
              {currentTower?.name || "Selected Tower"}
            </Text>
            <Text style={styles.heroTowerMeta}>
              {[
                currentTower?.line,
                payload.project.project_number,
              ]
                .filter(Boolean)
                .join(" · ") ||
                payload.project.name}
            </Text>
          </View>
        </View>

        <Field
          label="Docket date"
          value={draft.docketDate}
          onChangeText={(docketDate) =>
            setDraft({ docketDate })
          }
          placeholder="YYYY-MM-DD"
          disabled={locked}
        />

        <SelectField
          label="Crew"
          value={draft.selectedCrewId}
          placeholder="Select crew"
          options={crewOptions}
          disabled={locked}
          onSelect={(selectedCrewId) => {
            const crew = payload.crews.find(
              (item) => item.id === selectedCrewId,
            );

            setDraft({
              selectedCrewId,
              crewName: [
                crew?.crew_number || "",
                crew?.crew_name || "",
              ]
                .filter(Boolean)
                .join(" - "),
              leadingHand:
                clean(crew?.leading_hand) ||
                draft.leadingHand,
            });
          }}
        />

        <Field
          label="Leading Hand"
          value={draft.leadingHand}
          onChangeText={(leadingHand) =>
            setDraft({ leadingHand })
          }
          placeholder="Leading Hand"
          disabled={locked}
        />

        <Field
          label="Weather"
          value={draft.weather}
          onChangeText={(weather) =>
            setDraft({ weather })
          }
          placeholder="Fine, overcast, rain..."
          disabled={locked}
        />

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Rate type</Text>
          <View style={styles.segmentRow}>
            <Chip
              label="Tonnage"
              selected={draft.rateType === "tonnage_rate"}
              disabled={locked}
              onPress={() =>
                setDraft({ rateType: "tonnage_rate" })
              }
            />
            <Chip
              label="Schedule of Rates"
              selected={
                draft.rateType === "schedule_of_rates"
              }
              disabled={locked}
              onPress={() =>
                setDraft({
                  rateType: "schedule_of_rates",
                })
              }
            />
          </View>
        </View>
      </SectionCard>

      {draft.approvalStatus !== "draft" ? (
        <View style={styles.statusBanner}>
          <Ionicons
            name={
              locked
                ? "lock-closed-outline"
                : "information-circle-outline"
            }
            size={20}
            color={locked ? "#9a3412" : "#1d4ed8"}
          />
          <View style={styles.statusTextWrap}>
            <Text style={styles.statusTitle}>
              {locked
                ? "Docket locked"
                : "Approval workflow active"}
            </Text>
            <Text style={styles.statusBody}>
              Status: {draft.approvalStatus.replace(/_/g, " ")}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderCrew = () => (
    <View style={styles.screenStack}>
      <View style={styles.metricRow}>
        <Metric
          label="Workers"
          value={String(labourTotals.workerCount)}
        />
        <Metric
          label="Raw MH"
          value={labourTotals.rawManhours.toFixed(1)}
        />
        <Metric
          label="Production MH"
          value={labourTotals.productionManhours.toFixed(1)}
        />
      </View>

      <SectionCard
        title="Production Defaults"
        subtitle="Apply these deductions to the crew. Individual workers can still be adjusted."
        action={
          <Pressable
            disabled={locked}
            onPress={applyProductionDefaults}
            style={[
              styles.secondaryButton,
              locked && styles.buttonDisabled,
            ]}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color="#1d4ed8"
            />
            <Text style={styles.secondaryButtonText}>
              Apply to Crew
            </Text>
          </Pressable>
        }
      >
        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <Field
              label="Prestart"
              value={draft.prestartMinutes}
              onChangeText={(prestartMinutes) =>
                setDraft({ prestartMinutes })
              }
              keyboardType="decimal-pad"
              suffix="min"
              disabled={locked}
            />
          </View>
          <View style={styles.column}>
            <Field
              label="Lunch"
              value={draft.lunchBreakMinutes}
              onChangeText={(lunchBreakMinutes) =>
                setDraft({ lunchBreakMinutes })
              }
              keyboardType="decimal-pad"
              suffix="min"
              disabled={locked}
            />
          </View>
        </View>
        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <Field
              label="Travel In"
              value={draft.travelInMinutes}
              onChangeText={(travelInMinutes) =>
                setDraft({ travelInMinutes })
              }
              keyboardType="decimal-pad"
              suffix="min"
              disabled={locked}
            />
          </View>
          <View style={styles.column}>
            <Field
              label="Travel Out"
              value={draft.travelOutMinutes}
              onChangeText={(travelOutMinutes) =>
                setDraft({ travelOutMinutes })
              }
              keyboardType="decimal-pad"
              suffix="min"
              disabled={locked}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Crew"
        subtitle="Worker hours feed Raw MH and Production MH automatically."
        action={
          <View style={styles.actionRow}>
            <Pressable
              disabled={locked || !draft.selectedCrewId}
              onPress={loadCrewMembers}
              style={[
                styles.iconButton,
                (locked || !draft.selectedCrewId) &&
                  styles.buttonDisabled,
              ]}
            >
              <Ionicons
                name="people-outline"
                size={18}
                color="#1d4ed8"
              />
            </Pressable>
            <Pressable
              disabled={
                locked || availableEmployees.length === 0
              }
              onPress={() => setEmployeePickerOpen(true)}
              style={[
                styles.primaryIconButton,
                (locked ||
                  availableEmployees.length === 0) &&
                  styles.buttonDisabled,
              ]}
            >
              <Ionicons
                name="add"
                size={20}
                color="#ffffff"
              />
            </Pressable>
          </View>
        }
      >
        <View style={styles.bulkTimeCard}>
          <Text style={styles.miniHeading}>Bulk times</Text>
          <View style={styles.twoColumn}>
            <View style={styles.column}>
              <Field
                label="Time in"
                value={bulkIn}
                onChangeText={setBulkIn}
                placeholder="06:00"
                disabled={locked}
              />
            </View>
            <View style={styles.column}>
              <Field
                label="Time out"
                value={bulkOut}
                onChangeText={setBulkOut}
                placeholder="18:00"
                disabled={locked}
              />
            </View>
          </View>
          <Pressable
            disabled={locked || (!bulkIn && !bulkOut)}
            onPress={applyBulkTimes}
            style={[
              styles.fullSecondaryButton,
              (locked || (!bulkIn && !bulkOut)) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.fullSecondaryButtonText}>
              Apply Times to All Workers
            </Text>
          </Pressable>
        </View>

        {draft.labourRows.length === 0 ? (
          <EmptyCard
            icon="people-outline"
            title="No workers added"
            body="Load the selected crew or add an employee manually."
          />
        ) : (
          <View style={styles.stack}>
            {draft.labourRows.map((row, index) => {
              const calculated =
                labourTotals.rows[index] || row;

              return (
                <View
                  key={`${row.worker_name}-${index}`}
                  style={styles.workerCard}
                >
                  <View style={styles.workerHeader}>
                    <View style={styles.workerIdentity}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {clean(row.worker_name)
                            .slice(0, 1)
                            .toUpperCase() || "?"}
                        </Text>
                      </View>
                      <View style={styles.workerNameWrap}>
                        <Text style={styles.workerName}>
                          {row.worker_name || "Worker"}
                        </Text>
                        <Text style={styles.workerMeta}>
                          Raw {toNumber(calculated.total_hours).toFixed(2)} h ·
                          Production{" "}
                          {toNumber(
                            calculated.production_hours,
                          ).toFixed(2)} h
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      disabled={locked}
                      onPress={() =>
                        setDraft({
                          labourRows:
                            draft.labourRows.filter(
                              (_, rowIndex) =>
                                rowIndex !== index,
                            ),
                        })
                      }
                      style={styles.removeButton}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color="#b91c1c"
                      />
                    </Pressable>
                  </View>

                  <View style={styles.twoColumn}>
                    <View style={styles.column}>
                      <Field
                        label="Time in"
                        value={row.time_in}
                        placeholder="06:00"
                        disabled={locked}
                        onChangeText={(value) =>
                          updateLabourRow(index, {
                            time_in: value,
                          })
                        }
                      />
                    </View>
                    <View style={styles.column}>
                      <Field
                        label="Time out"
                        value={row.time_out}
                        placeholder="18:00"
                        disabled={locked}
                        onChangeText={(value) =>
                          updateLabourRow(index, {
                            time_out: value,
                          })
                        }
                      />
                    </View>
                  </View>

                  <View style={styles.deductionGrid}>
                    {[
                      {
                        label: "Prestart",
                        key: "prestart_minutes" as const,
                        value: row.prestart_minutes,
                      },
                      {
                        label: "Lunch",
                        key: "lunch_minutes" as const,
                        value: row.lunch_minutes,
                      },
                      {
                        label: "Travel In",
                        key: "travel_in_minutes" as const,
                        value: row.travel_in_minutes,
                      },
                      {
                        label: "Travel Out",
                        key: "travel_out_minutes" as const,
                        value: row.travel_out_minutes,
                      },
                    ].map((item) => (
                      <View
                        key={item.key}
                        style={styles.deductionItem}
                      >
                        <Text style={styles.deductionLabel}>
                          {item.label}
                        </Text>
                        <View style={styles.miniInputFrame}>
                          <TextInput
                            value={item.value}
                            editable={!locked}
                            keyboardType="decimal-pad"
                            onChangeText={(value) =>
                              updateLabourRow(index, {
                                [item.key]: value,
                              })
                            }
                            style={styles.miniInput}
                          />
                          <Text style={styles.miniSuffix}>m</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>

      <SectionCard
        title="Plant"
        subtitle={
          draft.rateType === "schedule_of_rates"
            ? "Track plant hours for Schedule of Rates."
            : "Plant can still be added for delay and site-event records."
        }
        action={
          <Pressable
            disabled={locked}
            onPress={() =>
              setDraft({
                plantRows: [
                  ...draft.plantRows,
                  createBlankPlantRow(),
                ],
              })
            }
            style={[
              styles.primaryIconButton,
              locked && styles.buttonDisabled,
            ]}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
          </Pressable>
        }
      >
        {draft.plantRows.length === 0 ? (
          <EmptyCard
            icon="construct-outline"
            title="No plant added"
            body="Add plant when it is required for SoR or site-event tracking."
          />
        ) : (
          <View style={styles.stack}>
            {draft.plantRows.map((row, index) => (
              <View key={index} style={styles.workerCard}>
                <View style={styles.workerHeader}>
                  <Text style={styles.workerName}>
                    {row.plant_name ||
                      row.asset_id ||
                      `Plant ${index + 1}`}
                  </Text>
                  <Pressable
                    disabled={locked}
                    onPress={() =>
                      setDraft({
                        plantRows: draft.plantRows.filter(
                          (_, rowIndex) =>
                            rowIndex !== index,
                        ),
                      })
                    }
                    style={styles.removeButton}
                  >
                    <Ionicons
                      name="close"
                      size={18}
                      color="#b91c1c"
                    />
                  </Pressable>
                </View>

                <Field
                  label="Plant name"
                  value={row.plant_name}
                  onChangeText={(plant_name) =>
                    updatePlantRow(index, { plant_name })
                  }
                  placeholder="Crane, EWP, telehandler..."
                  disabled={locked}
                />

                <View style={styles.twoColumn}>
                  <View style={styles.column}>
                    <Field
                      label="Asset #"
                      value={row.asset_id}
                      onChangeText={(asset_id) =>
                        updatePlantRow(index, { asset_id })
                      }
                      disabled={locked}
                    />
                  </View>
                  <View style={styles.column}>
                    <Field
                      label="Type"
                      value={row.plant_type}
                      onChangeText={(plant_type) =>
                        updatePlantRow(index, {
                          plant_type,
                        })
                      }
                      disabled={locked}
                    />
                  </View>
                </View>

                <View style={styles.twoColumn}>
                  <View style={styles.column}>
                    <Field
                      label="Time in"
                      value={row.time_in}
                      onChangeText={(time_in) =>
                        updatePlantRow(index, { time_in })
                      }
                      placeholder="06:00"
                      disabled={locked}
                    />
                  </View>
                  <View style={styles.column}>
                    <Field
                      label="Time out"
                      value={row.time_out}
                      onChangeText={(time_out) =>
                        updatePlantRow(index, { time_out })
                      }
                      placeholder="18:00"
                      disabled={locked}
                    />
                  </View>
                </View>

                <Field
                  label="Notes"
                  value={row.notes}
                  onChangeText={(notes) =>
                    updatePlantRow(index, { notes })
                  }
                  multiline
                  disabled={locked}
                />
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <Modal
        visible={employeePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEmployeePickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEmployeePickerOpen(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={() => undefined}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add worker</Text>

            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
            >
              {availableEmployees.map((employee) => (
                <Pressable
                  key={employee.id}
                  onPress={() => {
                    addEmployee(employee.full_name);
                    setEmployeePickerOpen(false);
                  }}
                  style={styles.modalOption}
                >
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionLabel}>
                      {employee.full_name}
                    </Text>
                    {employee.role ? (
                      <Text style={styles.modalOptionSubtitle}>
                        {employee.role}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="add-circle-outline"
                    size={22}
                    color="#2563eb"
                  />
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setEmployeePickerOpen(false)}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );

  const renderWork = () => (
    <View style={styles.screenStack}>
      <View style={styles.metricRow}>
        <Metric
          label="Assembly"
          value={`${progressTotals.assemblyPercent}%`}
        />
        <Metric
          label="Erection"
          value={`${progressTotals.erectionPercent}%`}
        />
        <Metric
          label="Overall"
          value={`${progressTotals.totalProgressPercent}%`}
        />
      </View>

      <SectionCard
        title="Primary Tower Work"
        subtitle={`${towerName(draft.towerId)} receives the balance of production MH after revisions and additional tower allocations.`}
      >
        <View style={styles.allocationBanner}>
          <View>
            <Text style={styles.allocationEyebrow}>
              Production pool
            </Text>
            <Text style={styles.allocationValue}>
              {productionPool.toFixed(2)} MH
            </Text>
          </View>
          <View style={styles.allocationDivider} />
          <View>
            <Text style={styles.allocationEyebrow}>
              Primary share
            </Text>
            <Text style={styles.allocationValue}>
              {primaryShare.toFixed(1)}%
            </Text>
          </View>
          <View style={styles.allocationDivider} />
          <View>
            <Text style={styles.allocationEyebrow}>
              Primary MH
            </Text>
            <Text style={styles.allocationValue}>
              {(
                productionPool *
                (primaryShare / 100)
              ).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Activity</Text>
          <View style={styles.segmentRow}>
            {ACTIVITIES.map((activity) => (
              <Chip
                key={activity}
                label={activityLabel(activity)}
                selected={
                  draft.primaryWorkActivity === activity
                }
                disabled={locked}
                onPress={() =>
                  setDraft({
                    primaryWorkActivity: activity,
                  })
                }
              />
            ))}
          </View>
        </View>

        <Field
          label="Work notes"
          value={draft.primaryWorkNotes}
          onChangeText={(primaryWorkNotes) =>
            setDraft({ primaryWorkNotes })
          }
          multiline
          placeholder="Optional notes about today's tower work"
          disabled={locked}
        />
      </SectionCard>

      <SectionCard
        title="Tower Progress"
        subtitle="Section percentages are weighted exactly as the website Daily Docket."
        action={
          <View style={styles.switchWrap}>
            <Text style={styles.switchLabel}>Body Ext</Text>
            <Switch
              value={draft.hasBodyExtension}
              disabled={locked}
              onValueChange={(hasBodyExtension) =>
                setDraft({ hasBodyExtension })
              }
            />
          </View>
        }
      >
        <View style={styles.progressHeader}>
          <Text style={[styles.progressHeaderText, styles.progressSection]}>
            Section
          </Text>
          <Text style={styles.progressHeaderText}>Assembly</Text>
          <Text style={styles.progressHeaderText}>Erection</Text>
        </View>

        {draft.sectionV2Rows.map((row, index) => {
          const hidden =
            !draft.hasBodyExtension &&
            row.section_code === "BE";

          return (
            <View
              key={row.section_code}
              style={[
                styles.progressRow,
                hidden && styles.progressRowDisabled,
              ]}
            >
              <View style={styles.progressSection}>
                <Text style={styles.progressSectionCode}>
                  {row.section_label}
                </Text>
                <Text style={styles.progressWeight}>
                  {row.assembly_weight}% weight
                </Text>
              </View>
              <View style={styles.percentInputFrame}>
                <TextInput
                  value={hidden ? "" : row.assembly_today}
                  editable={!locked && !hidden}
                  keyboardType="decimal-pad"
                  onChangeText={(value) =>
                    updatePrimaryProgress(
                      index,
                      "assembly_today",
                      value,
                    )
                  }
                  style={styles.percentInput}
                />
                <Text style={styles.percentSuffix}>%</Text>
              </View>
              <View style={styles.percentInputFrame}>
                <TextInput
                  value={hidden ? "" : row.erection_today}
                  editable={!locked && !hidden}
                  keyboardType="decimal-pad"
                  onChangeText={(value) =>
                    updatePrimaryProgress(
                      index,
                      "erection_today",
                      value,
                    )
                  }
                  style={styles.percentInput}
                />
                <Text style={styles.percentSuffix}>%</Text>
              </View>
            </View>
          );
        })}
      </SectionCard>

      <SectionCard
        title="Additional Tower Work"
        subtitle="Split part of the production pool to another tower worked on by the same crew."
        action={
          <Pressable
            disabled={locked}
            onPress={addAdditionalTower}
            style={[
              styles.primaryIconButton,
              locked && styles.buttonDisabled,
            ]}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
          </Pressable>
        }
      >
        {draft.additionalTowerWork.length === 0 ? (
          <EmptyCard
            icon="git-branch-outline"
            title="Primary tower only"
            body="Add another tower only when this crew completed production work on more than one tower today."
          />
        ) : (
          <View style={styles.stack}>
            {draft.additionalTowerWork.map(
              (work, index) => {
                const expanded =
                  expandedAdditional.has(work.ui_id);
                const share = Math.max(
                  0,
                  toNumber(work.allocation_percent),
                );
                const allocated =
                  productionPool * (share / 100);

                return (
                  <View
                    key={work.ui_id}
                    style={styles.workerCard}
                  >
                    <View style={styles.workerHeader}>
                      <View>
                        <Text style={styles.workerName}>
                          {work.target_tower_id
                            ? towerName(
                                work.target_tower_id,
                              )
                            : `Additional Tower ${index + 1}`}
                        </Text>
                        <Text style={styles.workerMeta}>
                          {share.toFixed(1)}% ·{" "}
                          {allocated.toFixed(2)} MH
                        </Text>
                      </View>
                      <Pressable
                        disabled={locked}
                        onPress={() =>
                          setDraft({
                            additionalTowerWork:
                              draft.additionalTowerWork.filter(
                                (_, rowIndex) =>
                                  rowIndex !== index,
                              ),
                          })
                        }
                        style={styles.removeButton}
                      >
                        <Ionicons
                          name="close"
                          size={18}
                          color="#b91c1c"
                        />
                      </Pressable>
                    </View>

                    <SelectField
                      label="Target tower"
                      value={work.target_tower_id}
                      placeholder="Select tower"
                      options={towerOptions.filter(
                        (tower) =>
                          tower.value !== draft.towerId,
                      )}
                      disabled={locked}
                      onSelect={(target_tower_id) =>
                        updateAdditionalTower(index, {
                          target_tower_id,
                        })
                      }
                    />

                    <View style={styles.twoColumn}>
                      <View style={styles.column}>
                        <Field
                          label="Production share"
                          value={work.allocation_percent}
                          onChangeText={(allocation_percent) =>
                            updateAdditionalTower(index, {
                              allocation_percent,
                            })
                          }
                          keyboardType="decimal-pad"
                          suffix="%"
                          disabled={locked}
                        />
                      </View>
                      <View style={styles.column}>
                        <SelectField
                          label="Activity"
                          value={work.activity}
                          placeholder="Activity"
                          disabled={locked}
                          options={ACTIVITIES.map(
                            (activity) => ({
                              value: activity,
                              label:
                                activityLabel(activity),
                            }),
                          )}
                          onSelect={(value) =>
                            updateAdditionalTower(index, {
                              activity:
                                value as ProductionActivity,
                            })
                          }
                        />
                      </View>
                    </View>

                    <Field
                      label="Notes"
                      value={work.notes}
                      onChangeText={(notes) =>
                        updateAdditionalTower(index, {
                          notes,
                        })
                      }
                      multiline
                      disabled={locked}
                    />

                    <Pressable
                      onPress={() =>
                        setExpandedAdditional(
                          (current) => {
                            const next = new Set(current);

                            if (next.has(work.ui_id)) {
                              next.delete(work.ui_id);
                            } else {
                              next.add(work.ui_id);
                            }

                            return next;
                          },
                        )
                      }
                      style={styles.expandButton}
                    >
                      <Text style={styles.expandButtonText}>
                        {expanded
                          ? "Hide Tower Progress"
                          : "Enter Tower Progress"}
                      </Text>
                      <Ionicons
                        name={
                          expanded
                            ? "chevron-up"
                            : "chevron-down"
                        }
                        size={17}
                        color="#334155"
                      />
                    </Pressable>

                    {expanded ? (
                      <View style={styles.additionalProgress}>
                        <View style={styles.switchLine}>
                          <Text style={styles.switchLabel}>
                            Body Extension
                          </Text>
                          <Switch
                            value={
                              work.has_body_extension
                            }
                            disabled={locked}
                            onValueChange={(
                              has_body_extension,
                            ) =>
                              updateAdditionalTower(index, {
                                has_body_extension,
                              })
                            }
                          />
                        </View>

                        {work.progress_rows.map(
                          (
                            progressRow,
                            progressIndex,
                          ) => {
                            const hidden =
                              !work.has_body_extension &&
                              progressRow.section_code ===
                                "BE";

                            return (
                              <View
                                key={
                                  progressRow.section_code
                                }
                                style={[
                                  styles.progressRow,
                                  hidden &&
                                    styles.progressRowDisabled,
                                ]}
                              >
                                <View
                                  style={
                                    styles.progressSection
                                  }
                                >
                                  <Text
                                    style={
                                      styles.progressSectionCode
                                    }
                                  >
                                    {
                                      progressRow.section_label
                                    }
                                  </Text>
                                </View>
                                <View
                                  style={
                                    styles.percentInputFrame
                                  }
                                >
                                  <TextInput
                                    value={
                                      hidden
                                        ? ""
                                        : progressRow.assembly_today
                                    }
                                    editable={
                                      !locked && !hidden
                                    }
                                    keyboardType="decimal-pad"
                                    onChangeText={(value) =>
                                      updateAdditionalProgress(
                                        index,
                                        progressIndex,
                                        "assembly_today",
                                        value,
                                      )
                                    }
                                    style={
                                      styles.percentInput
                                    }
                                  />
                                  <Text
                                    style={
                                      styles.percentSuffix
                                    }
                                  >
                                    %
                                  </Text>
                                </View>
                                <View
                                  style={
                                    styles.percentInputFrame
                                  }
                                >
                                  <TextInput
                                    value={
                                      hidden
                                        ? ""
                                        : progressRow.erection_today
                                    }
                                    editable={
                                      !locked && !hidden
                                    }
                                    keyboardType="decimal-pad"
                                    onChangeText={(value) =>
                                      updateAdditionalProgress(
                                        index,
                                        progressIndex,
                                        "erection_today",
                                        value,
                                      )
                                    }
                                    style={
                                      styles.percentInput
                                    }
                                  />
                                  <Text
                                    style={
                                      styles.percentSuffix
                                    }
                                  >
                                    %
                                  </Text>
                                </View>
                              </View>
                            );
                          },
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              },
            )}
          </View>
        )}

        {extraShare > 100 ? (
          <View style={styles.warningBanner}>
            <Ionicons
              name="warning-outline"
              size={18}
              color="#b45309"
            />
            <Text style={styles.warningText}>
              Additional tower shares total{" "}
              {extraShare.toFixed(1)}%. They must not exceed
              100%.
            </Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Revision / Rectification MH"
        subtitle="Revision MH is removed from Production MH before the remaining production pool is split between towers."
        action={
          <Pressable
            disabled={locked}
            onPress={addRevisionAllocation}
            style={[
              styles.primaryIconButton,
              locked && styles.buttonDisabled,
            ]}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
          </Pressable>
        }
      >
        <View style={styles.infoLine}>
          <Ionicons
            name="calculator-outline"
            size={18}
            color="#475569"
          />
          <Text style={styles.infoLineText}>
            Revision allocation: {revisionManhours.toFixed(2)} MH ·
            Remaining production: {productionPool.toFixed(2)} MH
          </Text>
        </View>

        {draft.towerRevisionAllocations.length === 0 ? (
          <EmptyCard
            icon="build-outline"
            title="No revision MH"
            body="Add this only when workers spent time on rectification or revision work."
          />
        ) : (
          <View style={styles.stack}>
            {draft.towerRevisionAllocations.map(
              (row, index) => (
                <View
                  key={row.ui_id}
                  style={styles.workerCard}
                >
                  <View style={styles.workerHeader}>
                    <View>
                      <Text style={styles.workerName}>
                        Revision {index + 1}
                      </Text>
                      <Text style={styles.workerMeta}>
                        {toNumber(row.hours).toFixed(2)} h ×{" "}
                        {row.worker_names.length} worker
                        {row.worker_names.length === 1
                          ? ""
                          : "s"}{" "}
                        ={" "}
                        {(
                          toNumber(row.hours) *
                          row.worker_names.length
                        ).toFixed(2)}{" "}
                        MH
                      </Text>
                    </View>
                    <Pressable
                      disabled={locked}
                      onPress={() =>
                        setDraft({
                          towerRevisionAllocations:
                            draft.towerRevisionAllocations.filter(
                              (_, rowIndex) =>
                                rowIndex !== index,
                            ),
                        })
                      }
                      style={styles.removeButton}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color="#b91c1c"
                      />
                    </Pressable>
                  </View>

                  <SelectField
                    label="Target tower"
                    value={row.target_tower_id}
                    placeholder="Select tower"
                    options={towerOptions}
                    disabled={locked}
                    onSelect={(target_tower_id) =>
                      updateRevisionAllocation(index, {
                        target_tower_id,
                      })
                    }
                  />

                  <Field
                    label="Hours per selected worker"
                    value={row.hours}
                    onChangeText={(hours) =>
                      updateRevisionAllocation(index, {
                        hours,
                      })
                    }
                    keyboardType="decimal-pad"
                    suffix="hr"
                    disabled={locked}
                  />

                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>
                      Workers
                    </Text>
                    <View style={styles.segmentRow}>
                      {workerNames.map((name) => (
                        <Chip
                          key={name}
                          label={name}
                          disabled={locked}
                          selected={row.worker_names.some(
                            (selected) =>
                              normalizedName(selected) ===
                              normalizedName(name),
                          )}
                          onPress={() =>
                            toggleRevisionWorker(
                              index,
                              name,
                            )
                          }
                        />
                      ))}
                    </View>
                  </View>

                  <Field
                    label="Reason / rectification"
                    value={row.reason}
                    onChangeText={(reason) =>
                      updateRevisionAllocation(index, {
                        reason,
                      })
                    }
                    multiline
                    disabled={locked}
                  />
                </View>
              ),
            )}
          </View>
        )}

        {revisionManhours > labourTotals.productionManhours ? (
          <View style={styles.warningBanner}>
            <Ionicons
              name="warning-outline"
              size={18}
              color="#b45309"
            />
            <Text style={styles.warningText}>
              Revision MH exceeds total Production MH.
            </Text>
          </View>
        ) : null}
      </SectionCard>
    </View>
  );


  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.topBarTitleWrap}>
          <Text style={styles.eyebrow}>
            DAILY DOCKET
          </Text>
          <Text style={styles.title}>
            {currentTower?.name || "Tower"}
          </Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>
            {draft.approvalStatus
              .replace(/_/g, " ")
              .toUpperCase()}
          </Text>
        </View>
      </View>

      <StepStrip
        current={step}
        onChange={onStepChange}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {step === "setup"
          ? renderSetup()
          : step === "crew"
            ? renderCrew()
            : step === "work"
              ? renderWork()
              : step === "events"
                ? (
                    <DailyDocketSiteEvents
                      payload={payload}
                      draft={draft}
                      onChange={onChange}
                      disabled={locked}
                    />
                  )
                : (
                    <DailyDocketReviewSubmit
                      payload={payload}
                      draft={draft}
                      onChange={onChange}
                      onSaveDraft={onSaveDraft}
                      onSubmit={onSubmit}
                      saving={saving}
                      submitting={submitting}
                      disabled={locked}
                    />
                  )}
      </ScrollView>
    </View>
  );
}

export default DailyDocketEditorFoundation;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  topBarTitleWrap: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "900",
    color: "#2563eb",
  },
  title: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
  },
  statusChipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  stepStrip: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stepPillActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
  },
  stepNumber: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#e2e8f0",
  },
  stepNumberActive: {
    backgroundColor: "#2563eb",
  },
  stepNumberText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
  },
  stepNumberTextActive: {
    color: "#ffffff",
  },
  stepLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  stepLabelActive: {
    color: "#1d4ed8",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 60,
  },
  screenStack: {
    gap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 15,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  cardSubtitle: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  heroTower: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTowerText: {
    flex: 1,
  },
  heroTowerName: {
    color: "#172554",
    fontSize: 17,
    fontWeight: "900",
  },
  heroTowerMeta: {
    color: "#475569",
    fontSize: 12,
    marginTop: 3,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  inputFrame: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  inputFrameMultiline: {
    minHeight: 92,
    alignItems: "flex-start",
  },
  input: {
    flex: 1,
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMultiline: {
    minHeight: 88,
  },
  inputSuffix: {
    paddingRight: 12,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
  },
  selectButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  selectTextWrap: {
    flex: 1,
  },
  selectText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
  placeholderText: {
    color: "#94a3b8",
    fontWeight: "500",
  },
  selectSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  disabledFrame: {
    opacity: 0.55,
    backgroundColor: "#f8fafc",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
  },
  secondaryButtonText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
  },
  fullSecondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  fullSecondaryButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 7,
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  primaryIconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#2563eb",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  chipSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: "#ffffff",
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metric: {
    flex: 1,
    minHeight: 88,
    padding: 12,
    borderRadius: 15,
    backgroundColor: "#0f172a",
    justifyContent: "center",
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 4,
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metricHelper: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 9,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 10,
  },
  column: {
    flex: 1,
  },
  stack: {
    gap: 10,
  },
  bulkTimeCard: {
    padding: 12,
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  miniHeading: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  workerCard: {
    gap: 12,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  workerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  workerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0e7ff",
  },
  avatarText: {
    color: "#3730a3",
    fontWeight: "900",
  },
  workerNameWrap: {
    flex: 1,
  },
  workerName: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  workerMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  removeButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#fef2f2",
  },
  deductionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  deductionItem: {
    width: "48%",
    gap: 4,
  },
  deductionLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },
  miniInputFrame: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  miniInput: {
    flex: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    color: "#0f172a",
    fontSize: 13,
  },
  miniSuffix: {
    paddingRight: 8,
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "800",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
  },
  statusTextWrap: {
    flex: 1,
  },
  statusTitle: {
    color: "#7c2d12",
    fontWeight: "900",
    fontSize: 13,
  },
  statusBody: {
    marginTop: 2,
    color: "#9a3412",
    fontSize: 11,
  },
  switchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  switchLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
  },
  switchLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    gap: 8,
  },
  progressHeaderText: {
    width: 76,
    textAlign: "center",
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  progressSection: {
    flex: 1,
  },
  progressRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    paddingVertical: 7,
  },
  progressRowDisabled: {
    opacity: 0.35,
  },
  progressSectionCode: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  progressWeight: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 9,
  },
  percentInputFrame: {
    width: 76,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  percentInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    textAlign: "right",
    color: "#0f172a",
    fontWeight: "800",
  },
  percentSuffix: {
    paddingRight: 7,
    color: "#94a3b8",
    fontSize: 10,
  },
  allocationBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    padding: 12,
  },
  allocationDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#cbd5e1",
  },
  allocationEyebrow: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  allocationValue: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  expandButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  expandButtonText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
  },
  additionalProgress: {
    gap: 6,
    paddingTop: 4,
  },
  infoLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  infoLineText: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },
  warningText: {
    flex: 1,
    color: "#92400e",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  emptyCard: {
    alignItems: "center",
    gap: 5,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  emptyTitle: {
    marginTop: 3,
    color: "#334155",
    fontSize: 13,
    fontWeight: "900",
  },
  emptyBody: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  modalSheet: {
    maxHeight: "78%",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#ffffff",
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    marginBottom: 14,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  modalList: {
    maxHeight: 430,
  },
  modalListContent: {
    gap: 7,
  },
  modalOption: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalOptionActive: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  modalOptionText: {
    flex: 1,
  },
  modalOptionLabel: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  modalOptionLabelActive: {
    color: "#1d4ed8",
  },
  modalOptionSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  modalClose: {
    marginTop: 14,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#0f172a",
  },
  modalCloseText: {
    color: "#ffffff",
    fontWeight: "900",
  },
});
