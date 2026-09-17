import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import {
  createDefect,
  getDefectAssignees,
  uploadDefectPhoto,
  type MobileDefectSeverity,
} from "@/lib/api/defects";
import {
  createBlankBundleTransfer,
  createBlankDelayRow,
  createBlankMaterialEvent,
  createBlankMaterialItem,
  DELAY_OPTIONS,
  MATERIAL_EVENT_OPTIONS,
  MITIGATION_OPTIONS,
} from "@/lib/dockets/constants";
import { supabase } from "@/lib/supabase";
import type {
  BundleTransferDraft,
  DailyDocketDraft,
  DailyDocketEditorPayload,
  DelayRow,
  ExistingTowerDefect,
  LinkedDocketDefect,
  MaterialCatalogItem,
  MaterialEventDraft,
  MaterialEventItemDraft,
  MaterialEventPersonDraft,
  MaterialEventPlantDraft,
  MaterialEventType,
  MaterialWorkOutcome,
  MobilisationStatus,
} from "@/types/daily-dockets";
import type { LocalQualityPhoto } from "@/types/quality";

type Props = {
  payload: DailyDocketEditorPayload;
  draft: DailyDocketDraft;
  onChange: (next: DailyDocketDraft) => void;
  disabled?: boolean;
};

type PickerOption = {
  value: string;
  label: string;
  subtitle?: string;
};

type NewDefectForm = {
  issueTypeId: string;
  otherIssueText: string;
  memberNumber: string;
  segment: string;
  drawingNumber: string;
  description: string;
  severity: MobileDefectSeverity;
  assignedToUserId: string;
  photos: LocalQualityPhoto[];
};

const BLANK_DEFECT: NewDefectForm = {
  issueTypeId: "",
  otherIssueText: "",
  memberNumber: "",
  segment: "",
  drawingNumber: "",
  description: "",
  severity: "Minor",
  assignedToUserId: "",
  photos: [],
};

const OUTCOMES: Array<{
  value: MaterialWorkOutcome;
  label: string;
}> = [
  { value: "stopped_work", label: "Stopped" },
  { value: "slowed_down", label: "Slowed" },
  { value: "changed_sequence", label: "Resequenced" },
  { value: "minor_impact", label: "Minor" },
];

const MOB_STATUSES: Array<{
  value: MobilisationStatus;
  label: string;
}> = [
  { value: "planning", label: "Planning" },
  { value: "packing", label: "Packing" },
  { value: "demobilising", label: "Demob" },
  { value: "in_transit", label: "In Transit" },
  { value: "mobilising", label: "Mobilising" },
  { value: "setup", label: "Setup" },
  { value: "complete", label: "Complete" },
];

const INCIDENT_TYPES = [
  { value: "incident", label: "Incident" },
  { value: "near_miss", label: "Near Miss" },
  { value: "first_aid", label: "First Aid" },
  { value: "environmental", label: "Environmental" },
  { value: "property_damage", label: "Property Damage" },
  { value: "safety_observation", label: "Safety Observation" },
  { value: "other", label: "Other" },
] as const;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalise(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
}

function plantDisplay(row: DailyDocketDraft["plantRows"][number], index: number) {
  const primary =
    clean(row.plant_name) ||
    clean(row.asset_id) ||
    clean(row.plant_type);

  return primary || `Plant ${index + 1}`;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
  disabled = false,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "numeric";
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputFrame,
          multiline && styles.multilineFrame,
          disabled && styles.disabled,
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
          style={[styles.input, multiline && styles.multilineInput]}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        selected && styles.chipActive,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PickerField({
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
  options: PickerOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={[styles.pickerButton, disabled && styles.disabled]}
        >
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={[
                styles.pickerText,
                !selected && styles.placeholder,
              ]}
            >
              {selected?.label || placeholder}
            </Text>
            {selected?.subtitle ? (
              <Text numberOfLines={1} style={styles.pickerSub}>
                {selected.subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-down" size={17} color="#64748b" />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ gap: 7 }}
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
                      styles.option,
                      active && styles.optionActive,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionLabel,
                          active && styles.optionLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {option.subtitle ? (
                        <Text style={styles.optionSub}>
                          {option.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color="#2563eb"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.sheetClose} onPress={() => setOpen(false)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Card({
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
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function DailyDocketSiteEvents({
  payload,
  draft,
  onChange,
  disabled = false,
}: Props) {
  const locked =
    disabled ||
    ["submitted_bc", "client_pending", "final", "legacy_final"].includes(
      clean(draft.approvalStatus),
    );

  const [transferSearch, setTransferSearch] = useState<
    Record<string, string>
  >({});
  const [transferResults, setTransferResults] = useState<
    Record<string, MaterialCatalogItem[]>
  >({});
  const [transferSearching, setTransferSearching] = useState<string>("");

  const [existingDefectPickerOpen, setExistingDefectPickerOpen] =
    useState(false);
  const [newDefectOpen, setNewDefectOpen] = useState(false);
  const [newDefect, setNewDefect] =
    useState<NewDefectForm>(BLANK_DEFECT);
  const [creatingDefect, setCreatingDefect] = useState(false);
  const [defectAssignees, setDefectAssignees] = useState(
    payload.defectAssignees,
  );

  useEffect(() => {
    let active = true;

    void getDefectAssignees(draft.projectId)
      .then((rows) => {
        if (active) setDefectAssignees(rows);
      })
      .catch(() => {
        if (active && payload.defectAssignees.length) {
          setDefectAssignees(payload.defectAssignees);
        }
      });

    return () => {
      active = false;
    };
  }, [draft.projectId, payload.defectAssignees]);

  const towerOptions: PickerOption[] = payload.towers.map((tower) => ({
    value: tower.id,
    label: tower.name,
    subtitle: tower.line || undefined,
  }));

  const workerNames = useMemo(
    () =>
      draft.labourRows
        .map((row) => clean(row.worker_name))
        .filter(Boolean),
    [draft.labourRows],
  );

  const plantNames = useMemo(
    () =>
      draft.plantRows
        .map(plantDisplay)
        .filter(Boolean),
    [draft.plantRows],
  );

  const setDraft = (patch: Partial<DailyDocketDraft>) => {
    if (locked) return;
    onChange({ ...draft, ...patch });
  };

  const updateDelay = (index: number, patch: Partial<DelayRow>) => {
    setDraft({
      delayRows: draft.delayRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  };

  const toggleDelayWorker = (index: number, name: string) => {
    const row = draft.delayRows[index];
    if (!row) return;

    const exists = row.worker_names.some(
      (item) => normalise(item) === normalise(name),
    );

    updateDelay(index, {
      worker_names: exists
        ? row.worker_names.filter(
            (item) => normalise(item) !== normalise(name),
          )
        : [...row.worker_names, name],
    });
  };

  const toggleDelayPlant = (index: number, name: string) => {
    const row = draft.delayRows[index];
    if (!row) return;

    const exists = row.plant_names.some(
      (item) => normalise(item) === normalise(name),
    );

    updateDelay(index, {
      plant_names: exists
        ? row.plant_names.filter(
            (item) => normalise(item) !== normalise(name),
          )
        : [...row.plant_names, name],
    });
  };

  const updateEvent = (
    eventIndex: number,
    patch: Partial<MaterialEventDraft>,
  ) => {
    setDraft({
      materialEvents: draft.materialEvents.map((event, index) =>
        index === eventIndex ? { ...event, ...patch } : event,
      ),
    });
  };

  const updateItem = (
    eventIndex: number,
    itemIndex: number,
    patch: Partial<MaterialEventItemDraft>,
  ) => {
    const materialEvents = draft.materialEvents.map((event, index) => {
      if (index !== eventIndex) return event;

      return {
        ...event,
        items: event.items.map((item, index2) =>
          index2 === itemIndex ? { ...item, ...patch } : item,
        ),
      };
    });

    setDraft({ materialEvents });
  };

  const searchMaterial = async (
    eventIndex: number,
    itemIndex: number,
  ) => {
    const event = draft.materialEvents[eventIndex];
    const item = event?.items[itemIndex];

    if (!event || !item) return;

    const query = clean(item.search_query);
    if (!query) {
      updateItem(eventIndex, itemIndex, { search_results: [] });
      return;
    }

    const searchTowerId =
      event.event_type === "taken_from_another_tower" &&
      event.source_tower_id
        ? event.source_tower_id
        : draft.towerId;

    updateItem(eventIndex, itemIndex, { search_loading: true });

    try {
      const pattern = `%${query.replace(/[,%]/g, " ")}%`;
      const results: MaterialCatalogItem[] = [];

      if (item.search_mode === "member") {
        const { data, error } = await supabase
          .from("tower_material_members")
          .select(
            "id,tower_id,bundle_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section,tower_segment",
          )
          .eq("tower_id", searchTowerId)
          .or(
            [
              `mark_no.ilike.${pattern}`,
              `pn_final.ilike.${pattern}`,
              `bundle_reference.ilike.${pattern}`,
              `drawing_number.ilike.${pattern}`,
              `tower_segment.ilike.${pattern}`,
            ].join(","),
          )
          .limit(25);

        if (error) throw error;

        for (const row of data ?? []) {
          results.push({
            source_table: "tower_material_members",
            source_record_id: clean(row.id),
            bundle_id: clean(row.bundle_id),
            bundle_no: clean(row.bundle_reference),
            bundle_section: clean(row.tower_segment),
            item_reference:
              clean(row.mark_no) ||
              clean(row.pn_final) ||
              clean(row.bundle_reference) ||
              "Member",
            item_description: [
              row.bundle_reference
                ? `Bundle ${row.bundle_reference}`
                : "",
              row.tower_segment
                ? `Segment ${row.tower_segment}`
                : "",
              row.drawing_number
                ? `Drawing ${row.drawing_number}`
                : "",
              row.section ? `Profile ${row.section}` : "",
              row.qty_per_tower != null
                ? `Qty/Tower ${row.qty_per_tower}`
                : "",
            ]
              .filter(Boolean)
              .join(" · "),
            unit: "ea",
            tower_id: clean(row.tower_id),
          });
        }
      } else {
        const { data, error } = await supabase
          .from("tower_required_bundles")
          .select(
            "id,tower_id,bundle_no,section,qty_required,total_weight,member_qty",
          )
          .eq("tower_id", searchTowerId)
          .or(
            [
              `bundle_no.ilike.${pattern}`,
              `section.ilike.${pattern}`,
            ].join(","),
          )
          .limit(25);

        if (error) throw error;

        for (const row of data ?? []) {
          results.push({
            source_table: "tower_required_bundles",
            source_record_id: clean(row.id),
            bundle_id: clean(row.id),
            bundle_no: clean(row.bundle_no),
            bundle_section: clean(row.section),
            item_reference: `Bundle ${clean(row.bundle_no)}`,
            item_description: [
              row.section ? `Section ${row.section}` : "",
              row.qty_required != null
                ? `Required ${row.qty_required}`
                : "",
              row.member_qty != null
                ? `${row.member_qty} members`
                : "",
            ]
              .filter(Boolean)
              .join(" · "),
            unit: "bundle",
            tower_id: clean(row.tower_id),
          });
        }
      }

      updateItem(eventIndex, itemIndex, {
        search_loading: false,
        search_results: results,
      });
    } catch (error) {
      updateItem(eventIndex, itemIndex, {
        search_loading: false,
        search_results: [],
      });
      Alert.alert(
        "Material search failed",
        error instanceof Error ? error.message : "Could not search materials.",
      );
    }
  };

  const chooseMaterial = (
    eventIndex: number,
    itemIndex: number,
    result: MaterialCatalogItem,
  ) => {
    updateItem(eventIndex, itemIndex, {
      source_table: result.source_table,
      source_record_id: result.source_record_id,
      bundle_id: result.bundle_id,
      bundle_no: result.bundle_no,
      bundle_section: result.bundle_section,
      material_kind: "registered",
      manual_category: "",
      bolt_size: "",
      item_reference: result.item_reference,
      item_description: result.item_description,
      quantity: "1",
      unit: result.unit,
      search_query: "",
      search_results: [],
    });
  };

  const toggleEventWorker = (eventIndex: number, name: string) => {
    const event = draft.materialEvents[eventIndex];
    if (!event) return;

    const existing = event.people.find(
      (person) => normalise(person.employee_name) === normalise(name),
    );

    let people: MaterialEventPersonDraft[];

    if (existing) {
      people = event.people.filter(
        (person) => normalise(person.employee_name) !== normalise(name),
      );
    } else {
      const employee = payload.employees.find(
        (row) => normalise(row.full_name) === normalise(name),
      );

      people = [
        ...event.people,
        {
          ui_id: `material-person-${Date.now()}-${Math.random()}`,
          employee_id: employee?.id || "",
          employee_name: name,
          employee_role: employee?.role || "",
          started_at: event.impact_start_time,
          finished_at: event.impact_finish_time,
        },
      ];
    }

    updateEvent(eventIndex, { people });
  };

  const toggleEventPlant = (eventIndex: number, name: string) => {
    const event = draft.materialEvents[eventIndex];
    if (!event) return;

    const existing = event.plant.find(
      (row) => normalise(row.plant_name) === normalise(name),
    );

    let plant: MaterialEventPlantDraft[];

    if (existing) {
      plant = event.plant.filter(
        (row) => normalise(row.plant_name) !== normalise(name),
      );
    } else {
      const sourceIndex = plantNames.findIndex(
        (item) => normalise(item) === normalise(name),
      );
      const source = draft.plantRows[sourceIndex];

      plant = [
        ...event.plant,
        {
          ui_id: `material-plant-${Date.now()}-${Math.random()}`,
          plant_name: name,
          asset_number: source?.asset_id || "",
          started_at: event.impact_start_time,
          finished_at: event.impact_finish_time,
        },
      ];
    }

    updateEvent(eventIndex, { plant });
  };

  const recordOutstandingDelivery = (
    issue: DailyDocketDraft["outstandingMaterials"][number],
  ) => {
    const event = createBlankMaterialEvent("found_received");
    event.occurred_time = currentTime();
    event.notes = `Delivery against missing material first reported ${clean(
      issue.first_reported_at,
    ).slice(0, 10)}`.trim();
    event.items = [
      {
        ...createBlankMaterialItem(),
        search_mode:
          issue.source_table === "tower_required_bundles"
            ? "bundle"
            : "member",
        source_table: issue.source_table,
        source_record_id: issue.source_record_id,
        source_issue_key: issue.issue_key,
        bundle_id: issue.bundle_id,
        bundle_no: issue.bundle_no,
        bundle_section: issue.bundle_section,
        material_kind: issue.source_record_id ? "registered" : "manual",
        item_reference: issue.item_reference,
        item_description: issue.item_description,
        quantity: String(issue.remaining_quantity),
        unit: issue.unit,
      },
    ];

    setDraft({
      materialEvents: [...draft.materialEvents, event],
    });
  };

  const updateTransfer = (
    index: number,
    patch: Partial<BundleTransferDraft>,
  ) => {
    setDraft({
      bundleTransfers: draft.bundleTransfers.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  };

  const searchTransferBundles = async (
    transferIndex: number,
  ) => {
    const transfer = draft.bundleTransfers[transferIndex];
    if (!transfer?.source_tower_id) {
      Alert.alert("Source tower required", "Select a source tower first.");
      return;
    }

    const query = clean(transferSearch[transfer.ui_id]);
    if (!query) return;

    setTransferSearching(transfer.ui_id);

    try {
      const pattern = `%${query.replace(/[,%]/g, " ")}%`;

      const { data, error } = await supabase
        .from("tower_required_bundles")
        .select("id,tower_id,bundle_no,section,qty_required")
        .eq("tower_id", transfer.source_tower_id)
        .or(
          [
            `bundle_no.ilike.${pattern}`,
            `section.ilike.${pattern}`,
          ].join(","),
        )
        .limit(25);

      if (error) throw error;

      const bundleRows = (data ?? []) as Array<{
        id: unknown;
        tower_id: unknown;
        bundle_no: unknown;
        section: unknown;
        qty_required: unknown;
      }>;

      setTransferResults((current) => ({
        ...current,
        [transfer.ui_id]: bundleRows.map((row) => ({
          source_table: "tower_required_bundles",
          source_record_id: clean(row.id),
          bundle_id: clean(row.id),
          bundle_no: clean(row.bundle_no),
          bundle_section: clean(row.section),
          item_reference: `Bundle ${clean(row.bundle_no)}`,
          item_description: [
            row.section ? `Section ${row.section}` : "",
            row.qty_required != null
              ? `Required ${row.qty_required}`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          unit: "bundle",
          tower_id: clean(row.tower_id),
        })),
      }));
    } catch (error) {
      Alert.alert(
        "Bundle search failed",
        error instanceof Error ? error.message : "Could not search bundles.",
      );
    } finally {
      setTransferSearching("");
    }
  };

  const chooseTransferSource = async (
    transferIndex: number,
    result: MaterialCatalogItem,
  ) => {
    const transfer = draft.bundleTransfers[transferIndex];
    if (!transfer) return;

    try {
      const { data, error } = await supabase
        .from("tower_required_bundles")
        .select("id,tower_id,bundle_no,section")
        .eq("tower_id", draft.towerId)
        .eq("bundle_no", result.bundle_no);

      if (error) throw error;

      const destinationRows = (data ?? []) as Array<{
        id: unknown;
        tower_id: unknown;
        bundle_no: unknown;
        section: unknown;
      }>;

      const destination = destinationRows.find(
        (row) =>
          normalise(row.section) === normalise(result.bundle_section),
      );

      if (!destination) {
        Alert.alert(
          "No matching bundle",
          `Bundle ${result.bundle_no}${
            result.bundle_section ? ` · ${result.bundle_section}` : ""
          } is not configured for the current tower.`,
        );
        return;
      }

      updateTransfer(transferIndex, {
        source_bundle_id: result.source_record_id,
        destination_bundle_id: clean(destination.id),
      });

      setTransferSearch((current) => ({
        ...current,
        [transfer.ui_id]: `${result.bundle_no}${
          result.bundle_section ? ` · ${result.bundle_section}` : ""
        }`,
      }));
      setTransferResults((current) => ({
        ...current,
        [transfer.ui_id]: [],
      }));
    } catch (error) {
      Alert.alert(
        "Bundle match failed",
        error instanceof Error
          ? error.message
          : "Could not match the bundle to the current tower.",
      );
    }
  };

  const markIncomingReceived = (
    transferId: string,
  ) => {
    setDraft({
      activeBundleTransfers: draft.activeBundleTransfers.map((transfer) =>
        transfer.id === transferId
          ? {
              ...transfer,
              status: "received",
              received_by_name: draft.leadingHand,
              received_at: new Date().toISOString(),
            }
          : transfer,
      ),
    });
  };

  const linkExistingDefect = (defect: ExistingTowerDefect) => {
    if (
      draft.linkedDefects.some((row) => row.id === defect.id)
    ) {
      setExistingDefectPickerOpen(false);
      return;
    }

    const linked: LinkedDocketDefect = {
      ...defect,
      link_id: `pending-${defect.id}`,
      link_type: "referenced",
    };

    setDraft({
      linkedDefects: [...draft.linkedDefects, linked],
    });
    setExistingDefectPickerOpen(false);
  };

  const createControlledDefect = async () => {
    const description = clean(newDefect.description);
    const otherIssue = clean(newDefect.otherIssueText);

    if (!description && !otherIssue) {
      Alert.alert(
        "Description required",
        "Describe the Defect before creating it.",
      );
      return;
    }

    setCreatingDefect(true);

    try {
      const finalDescription =
        newDefect.issueTypeId === "__other__"
          ? [otherIssue, description].filter(Boolean).join(" — ")
          : description || otherIssue;

      const response = await createDefect({
        projectId: draft.projectId,
        towerId: draft.towerId,
        issueTypeId:
          newDefect.issueTypeId &&
          newDefect.issueTypeId !== "__other__"
            ? newDefect.issueTypeId
            : null,
        memberNumber: clean(newDefect.memberNumber) || null,
        segment: clean(newDefect.segment) || null,
        drawingNumber: clean(newDefect.drawingNumber) || null,
        description: finalDescription,
        responsibility: null,
        clientReference: null,
        severity: newDefect.severity,
        assignedToUserId:
          clean(newDefect.assignedToUserId) || null,
      });

      const raw = (response.defect ?? {}) as Record<string, unknown>;
      const defectId = clean(raw.id);

      if (!defectId) {
        throw new Error(
          "The controlled Defect was created but its ID was not returned.",
        );
      }

      let photoWarning = "";

      for (const photo of newDefect.photos) {
        try {
          await uploadDefectPhoto({
            projectId: draft.projectId,
            towerId: draft.towerId,
            defectId,
            photo,
          });
        } catch (error) {
          photoWarning =
            error instanceof Error
              ? error.message
              : "One or more Defect photos could not be uploaded.";
          break;
        }
      }

      const rawSeverity = clean(raw.severity);
      const rawStatus = clean(raw.status);

      const linked: LinkedDocketDefect = {
        id: defectId,
        defect_number: clean(raw.defect_number) || null,
        issue_type_id: clean(raw.issue_type_id) || null,
        member_number: clean(raw.member_number) || null,
        segment: clean(raw.segment) || null,
        drawing_number: clean(raw.drawing_number) || null,
        description: clean(raw.description) || finalDescription,
        severity:
          rawSeverity === "Major" || rawSeverity === "Critical"
            ? rawSeverity
            : "Minor",
        status:
          rawStatus === "In Progress" ||
          rawStatus === "Fixed" ||
          rawStatus === "Closed"
            ? rawStatus
            : "Open",
        assigned_to_user_id:
          clean(raw.assigned_to_user_id) || null,
        assigned_to_label:
          clean(raw.assigned_to_label) || null,
        created_at:
          clean(raw.created_at) || new Date().toISOString(),
        link_id: `created-${defectId}`,
        link_type: "raised",
      };

      setDraft({
        linkedDefects: [
          ...draft.linkedDefects.filter((row) => row.id !== defectId),
          linked,
        ],
      });

      setNewDefect(BLANK_DEFECT);
      setNewDefectOpen(false);

      Alert.alert(
        `${linked.defect_number || "Defect"} created`,
        [
          response.warning,
          photoWarning
            ? `The Defect exists, but photo upload needs attention: ${photoWarning}`
            : "",
          "It is now linked to this Daily Docket.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    } catch (error) {
      Alert.alert(
        "Defect could not be created",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setCreatingDefect(false);
    }
  };

  const unlinkedDefects = payload.towerDefects.filter(
    (defect) =>
      !draft.linkedDefects.some((linked) => linked.id === defect.id),
  );

  return (
    <View style={styles.stack}>
      <Card
        title="Delays"
        subtitle="Each delay automatically creates or refreshes its linked Daywork when the docket is saved."
        action={
          <Pressable
            disabled={locked}
            onPress={() =>
              setDraft({
                delayRows: [...draft.delayRows, createBlankDelayRow()],
              })
            }
            style={[styles.addButton, locked && styles.disabled]}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        }
      >
        {draft.delayRows.length === 0 ? (
          <Text style={styles.empty}>No delays recorded.</Text>
        ) : (
          draft.delayRows.map((row, index) => (
            <View key={row.ui_id} style={styles.innerCard}>
              <View style={styles.innerHead}>
                <Text style={styles.innerTitle}>Delay {index + 1}</Text>
                <Pressable
                  disabled={locked}
                  onPress={() =>
                    setDraft({
                      delayRows: draft.delayRows.filter(
                        (_, rowIndex) => rowIndex !== index,
                      ),
                    })
                  }
                  style={styles.remove}
                >
                  <Ionicons name="close" size={17} color="#b91c1c" />
                </Pressable>
              </View>

              <PickerField
                label="Delay type"
                value={row.delay_type}
                placeholder="Select type"
                disabled={locked}
                options={DELAY_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onSelect={(value) =>
                  updateDelay(index, {
                    delay_type: value as DelayRow["delay_type"],
                  })
                }
              />

              <View style={styles.twoCol}>
                <View style={styles.col}>
                  <Field
                    label="Duration"
                    value={row.delay_hours}
                    onChangeText={(delay_hours) =>
                      updateDelay(index, { delay_hours })
                    }
                    keyboardType="decimal-pad"
                    suffix="hr"
                    disabled={locked}
                  />
                </View>
                <View style={styles.col}>
                  <PickerField
                    label="Labour"
                    value={row.applies_to}
                    placeholder="Scope"
                    disabled={locked}
                    options={[
                      { value: "entire_crew", label: "Entire crew" },
                      {
                        value: "selected_workers",
                        label: "Selected workers",
                      },
                    ]}
                    onSelect={(value) =>
                      updateDelay(index, {
                        applies_to: value as DelayRow["applies_to"],
                        worker_names:
                          value === "entire_crew"
                            ? []
                            : row.worker_names,
                      })
                    }
                  />
                </View>
              </View>

              <Field
                label="Reason"
                value={row.delay_reason}
                onChangeText={(delay_reason) =>
                  updateDelay(index, { delay_reason })
                }
                multiline
                disabled={locked}
              />

              {row.applies_to === "selected_workers" ? (
                <View style={styles.fieldWrap}>
                  <Text style={styles.label}>Affected workers</Text>
                  <View style={styles.chips}>
                    {workerNames.map((name) => (
                      <Chip
                        key={name}
                        label={name}
                        disabled={locked}
                        selected={row.worker_names.some(
                          (item) => normalise(item) === normalise(name),
                        )}
                        onPress={() => toggleDelayWorker(index, name)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>
                    Plant was also affected
                  </Text>
                  <Text style={styles.helper}>
                    Include plant on the linked Daywork.
                  </Text>
                </View>
                <Switch
                  disabled={locked}
                  value={
                    row.delay_applies_mode === "labour_and_plant"
                  }
                  onValueChange={(value) =>
                    updateDelay(index, {
                      delay_applies_mode: value
                        ? "labour_and_plant"
                        : "labour_only",
                      plant_names: value ? row.plant_names : [],
                    })
                  }
                />
              </View>

              {row.delay_applies_mode === "labour_and_plant" ? (
                <View style={styles.chips}>
                  {plantNames.map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      disabled={locked}
                      selected={row.plant_names.some(
                        (item) => normalise(item) === normalise(name),
                      )}
                      onPress={() => toggleDelayPlant(index, name)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Card
        title="Materials"
        subtitle="Missing, received, excess, damaged and transferred material remain linked to the tower history."
        action={
          <Pressable
            disabled={locked}
            onPress={() => {
              const event = createBlankMaterialEvent("missing");
              event.occurred_time = currentTime();
              setDraft({
                materialEvents: [...draft.materialEvents, event],
              });
            }}
            style={[styles.addButton, locked && styles.disabled]}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        }
      >
        {draft.outstandingMaterials.filter(
          (issue) => issue.remaining_quantity > 0,
        ).length > 0 ? (
          <View style={styles.outstandingWrap}>
            <Text style={styles.subHeading}>Outstanding from prior dockets</Text>
            {draft.outstandingMaterials
              .filter((issue) => issue.remaining_quantity > 0)
              .map((issue) => (
                <View key={issue.issue_key} style={styles.outstandingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.outstandingTitle}>
                      {issue.item_reference}
                    </Text>
                    <Text style={styles.helper}>
                      {issue.remaining_quantity} {issue.unit} remaining
                      {issue.bundle_no ? ` · Bundle ${issue.bundle_no}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    disabled={locked}
                    onPress={() => recordOutstandingDelivery(issue)}
                    style={styles.smallBlue}
                  >
                    <Text style={styles.smallBlueText}>Record Delivery</Text>
                  </Pressable>
                </View>
              ))}
          </View>
        ) : null}

        {draft.materialEvents.length === 0 ? (
          <Text style={styles.empty}>No material events recorded.</Text>
        ) : (
          draft.materialEvents.map((event, eventIndex) => (
            <View key={event.ui_id} style={styles.innerCard}>
              <View style={styles.innerHead}>
                <Text style={styles.innerTitle}>
                  Material Event {eventIndex + 1}
                </Text>
                <Pressable
                  disabled={locked}
                  onPress={() =>
                    setDraft({
                      materialEvents: draft.materialEvents.filter(
                        (_, index) => index !== eventIndex,
                      ),
                    })
                  }
                  style={styles.remove}
                >
                  <Ionicons name="close" size={17} color="#b91c1c" />
                </Pressable>
              </View>

              <PickerField
                label="Event type"
                value={event.event_type}
                placeholder="Select event"
                disabled={locked}
                options={MATERIAL_EVENT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                onSelect={(value) =>
                  updateEvent(eventIndex, {
                    event_type: value as MaterialEventType,
                  })
                }
              />

              <Field
                label="Time"
                value={event.occurred_time}
                onChangeText={(occurred_time) =>
                  updateEvent(eventIndex, { occurred_time })
                }
                placeholder="10:30"
                disabled={locked}
              />

              {event.event_type === "taken_from_another_tower" ? (
                <PickerField
                  label="Source tower"
                  value={event.source_tower_id}
                  placeholder="Select source tower"
                  disabled={locked}
                  options={towerOptions.filter(
                    (option) => option.value !== draft.towerId,
                  )}
                  onSelect={(source_tower_id) =>
                    updateEvent(eventIndex, { source_tower_id })
                  }
                />
              ) : null}

              {event.event_type === "sent_to_another_tower" ? (
                <PickerField
                  label="Destination tower"
                  value={event.destination_tower_id}
                  placeholder="Select destination tower"
                  disabled={locked}
                  options={towerOptions.filter(
                    (option) => option.value !== draft.towerId,
                  )}
                  onSelect={(destination_tower_id) =>
                    updateEvent(eventIndex, { destination_tower_id })
                  }
                />
              ) : null}

              <View style={styles.stackSmall}>
                {event.items.map((item, itemIndex) => (
                  <View key={item.ui_id} style={styles.materialItem}>
                    <View style={styles.innerHead}>
                      <Text style={styles.itemTitle}>
                        Item {itemIndex + 1}
                      </Text>
                      {event.items.length > 1 ? (
                        <Pressable
                          disabled={locked}
                          onPress={() =>
                            updateEvent(eventIndex, {
                              items: event.items.filter(
                                (_, index) => index !== itemIndex,
                              ),
                            })
                          }
                        >
                          <Ionicons
                            name="trash-outline"
                            size={17}
                            color="#b91c1c"
                          />
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={styles.chips}>
                      <Chip
                        label="Member"
                        disabled={locked}
                        selected={
                          item.material_kind === "registered" &&
                          item.search_mode === "member"
                        }
                        onPress={() =>
                          updateItem(eventIndex, itemIndex, {
                            search_mode: "member",
                            material_kind: "registered",
                            source_table: "",
                            source_record_id: "",
                            search_results: [],
                            item_reference: "",
                            item_description: "",
                            unit: "ea",
                          })
                        }
                      />
                      <Chip
                        label="Bundle"
                        disabled={locked}
                        selected={
                          item.material_kind === "registered" &&
                          item.search_mode === "bundle"
                        }
                        onPress={() =>
                          updateItem(eventIndex, itemIndex, {
                            search_mode: "bundle",
                            material_kind: "registered",
                            source_table: "",
                            source_record_id: "",
                            search_results: [],
                            item_reference: "",
                            item_description: "",
                            unit: "bundle",
                          })
                        }
                      />
                      <Chip
                        label="Bolt"
                        disabled={locked}
                        selected={item.material_kind === "manual_bolt"}
                        onPress={() =>
                          updateItem(eventIndex, itemIndex, {
                            material_kind: "manual_bolt",
                            source_table: "",
                            source_record_id: "",
                            bundle_id: "",
                            bundle_no: "",
                            bundle_section: "",
                            item_reference: "",
                            unit: "ea",
                          })
                        }
                      />
                      <Chip
                        label="Unlisted"
                        disabled={locked}
                        selected={item.material_kind === "manual"}
                        onPress={() =>
                          updateItem(eventIndex, itemIndex, {
                            material_kind: "manual",
                            source_table: "",
                            source_record_id: "",
                            bundle_id: "",
                            bundle_no: "",
                            bundle_section: "",
                            item_reference: "",
                            unit: "ea",
                          })
                        }
                      />
                    </View>

                    {item.material_kind === "registered" ? (
                      <>
                        <View style={styles.searchRow}>
                          <View style={{ flex: 1 }}>
                            <Field
                              label={`${item.search_mode === "bundle" ? "Bundle" : "Member"} search`}
                              value={item.search_query}
                              onChangeText={(search_query) =>
                                updateItem(eventIndex, itemIndex, {
                                  search_query,
                                })
                              }
                              placeholder={
                                item.search_mode === "bundle"
                                  ? "Bundle number / section"
                                  : "Member / mark / drawing"
                              }
                              disabled={locked}
                            />
                          </View>
                          <Pressable
                            disabled={locked || item.search_loading}
                            onPress={() =>
                              void searchMaterial(eventIndex, itemIndex)
                            }
                            style={[
                              styles.searchButton,
                              item.search_loading && styles.disabled,
                            ]}
                          >
                            {item.search_loading ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Ionicons name="search" size={18} color="#fff" />
                            )}
                          </Pressable>
                        </View>

                        {item.search_results.length > 0 ? (
                          <View style={styles.resultList}>
                            {item.search_results.map((result) => (
                              <Pressable
                                key={`${result.source_table}:${result.source_record_id}`}
                                onPress={() =>
                                  chooseMaterial(
                                    eventIndex,
                                    itemIndex,
                                    result,
                                  )
                                }
                                style={styles.result}
                              >
                                <Text style={styles.resultTitle}>
                                  {result.item_reference}
                                </Text>
                                <Text style={styles.resultSub}>
                                  {result.item_description}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}

                    {item.material_kind === "manual_bolt" ? (
                      <Field
                        label="Bolt size"
                        value={item.bolt_size}
                        onChangeText={(bolt_size) =>
                          updateItem(eventIndex, itemIndex, {
                            bolt_size,
                          })
                        }
                        placeholder="M16 x 45"
                        disabled={locked}
                      />
                    ) : null}

                    {item.material_kind === "manual" ? (
                      <Field
                        label="Item reference"
                        value={item.item_reference}
                        onChangeText={(item_reference) =>
                          updateItem(eventIndex, itemIndex, {
                            item_reference,
                          })
                        }
                        placeholder="Unlisted item"
                        disabled={locked}
                      />
                    ) : null}

                    {item.item_reference || item.bolt_size ? (
                      <View style={styles.selectedMaterial}>
                        <Text style={styles.selectedMaterialTitle}>
                          {item.item_reference ||
                            `Bolt ${item.bolt_size}`}
                        </Text>
                        {item.item_description ? (
                          <Text style={styles.helper}>
                            {item.item_description}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Field
                          label="Quantity"
                          value={item.quantity}
                          onChangeText={(quantity) =>
                            updateItem(eventIndex, itemIndex, {
                              quantity,
                            })
                          }
                          keyboardType="decimal-pad"
                          disabled={locked}
                        />
                      </View>
                      <View style={styles.col}>
                        <Field
                          label="Unit"
                          value={item.unit}
                          onChangeText={(unit) =>
                            updateItem(eventIndex, itemIndex, { unit })
                          }
                          disabled={locked}
                        />
                      </View>
                    </View>

                    <Field
                      label="Description"
                      value={item.item_description}
                      onChangeText={(item_description) =>
                        updateItem(eventIndex, itemIndex, {
                          item_description,
                        })
                      }
                      disabled={locked}
                    />
                  </View>
                ))}
              </View>

              <Pressable
                disabled={locked}
                onPress={() =>
                  updateEvent(eventIndex, {
                    items: [...event.items, createBlankMaterialItem()],
                  })
                }
                style={styles.outlineButton}
              >
                <Ionicons name="add" size={16} color="#1d4ed8" />
                <Text style={styles.outlineButtonText}>Add another item</Text>
              </Pressable>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>
                    Planned work was affected
                  </Text>
                  <Text style={styles.helper}>
                    Capture the commercial / production impact.
                  </Text>
                </View>
                <Switch
                  disabled={locked}
                  value={event.affected_work}
                  onValueChange={(affected_work) =>
                    updateEvent(eventIndex, { affected_work })
                  }
                />
              </View>

              {event.affected_work ? (
                <>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.label}>Work outcome</Text>
                    <View style={styles.chips}>
                      {OUTCOMES.map((outcome) => (
                        <Chip
                          key={outcome.value}
                          label={outcome.label}
                          disabled={locked}
                          selected={event.work_outcome === outcome.value}
                          onPress={() =>
                            updateEvent(eventIndex, {
                              work_outcome: outcome.value,
                            })
                          }
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.twoCol}>
                    <View style={styles.col}>
                      <Field
                        label="Activity"
                        value={event.affected_activity}
                        onChangeText={(affected_activity) =>
                          updateEvent(eventIndex, { affected_activity })
                        }
                        disabled={locked}
                      />
                    </View>
                    <View style={styles.col}>
                      <Field
                        label="Section"
                        value={event.affected_section}
                        onChangeText={(affected_section) =>
                          updateEvent(eventIndex, { affected_section })
                        }
                        disabled={locked}
                      />
                    </View>
                  </View>

                  {event.work_outcome !== "changed_sequence" ? (
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Field
                          label="Impact start"
                          value={event.impact_start_time}
                          onChangeText={(impact_start_time) =>
                            updateEvent(eventIndex, { impact_start_time })
                          }
                          placeholder="10:30"
                          disabled={locked}
                        />
                      </View>
                      <View style={styles.col}>
                        <Field
                          label="Impact finish"
                          value={event.impact_finish_time}
                          onChangeText={(impact_finish_time) =>
                            updateEvent(eventIndex, { impact_finish_time })
                          }
                          placeholder="11:15"
                          disabled={locked || event.impact_ongoing}
                        />
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.switchRow}>
                    <Text style={styles.switchTitle}>Impact still ongoing</Text>
                    <Switch
                      disabled={locked}
                      value={event.impact_ongoing}
                      onValueChange={(impact_ongoing) =>
                        updateEvent(eventIndex, { impact_ongoing })
                      }
                    />
                  </View>

                  <Field
                    label="Current effect"
                    value={event.current_effect}
                    onChangeText={(current_effect) =>
                      updateEvent(eventIndex, { current_effect })
                    }
                    disabled={locked}
                  />

                  <View style={styles.fieldWrap}>
                    <Text style={styles.label}>Mitigation actions</Text>
                    <View style={styles.chips}>
                      {MITIGATION_OPTIONS.map((action) => {
                        const selected =
                          event.mitigation_actions.includes(action);
                        return (
                          <Chip
                            key={action}
                            label={action}
                            selected={selected}
                            disabled={locked}
                            onPress={() =>
                              updateEvent(eventIndex, {
                                mitigation_actions: selected
                                  ? event.mitigation_actions.filter(
                                      (item) => item !== action,
                                    )
                                  : [...event.mitigation_actions, action],
                              })
                            }
                          />
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.fieldWrap}>
                    <Text style={styles.label}>
                      People involved in search / verification
                    </Text>
                    <View style={styles.chips}>
                      {workerNames.map((name) => (
                        <Chip
                          key={name}
                          label={name}
                          disabled={locked}
                          selected={event.people.some(
                            (person) =>
                              normalise(person.employee_name) ===
                              normalise(name),
                          )}
                          onPress={() =>
                            toggleEventWorker(eventIndex, name)
                          }
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.fieldWrap}>
                    <Text style={styles.label}>Plant affected</Text>
                    <View style={styles.chips}>
                      {plantNames.map((name) => (
                        <Chip
                          key={name}
                          label={name}
                          disabled={locked}
                          selected={event.plant.some(
                            (row) =>
                              normalise(row.plant_name) === normalise(name),
                          )}
                          onPress={() =>
                            toggleEventPlant(eventIndex, name)
                          }
                        />
                      ))}
                    </View>
                  </View>
                </>
              ) : null}

              <Field
                label="Material event notes"
                value={event.notes}
                onChangeText={(notes) =>
                  updateEvent(eventIndex, { notes })
                }
                multiline
                disabled={locked}
              />
            </View>
          ))
        )}
      </Card>

      <Card
        title="Bundles Taken From Other Towers"
        subtitle="The same transfer updates Materials Control, the receiving tower and the replacement requirement at the source tower."
        action={
          <Pressable
            disabled={locked}
            onPress={() => {
              const row = createBlankBundleTransfer();
              row.occurred_time = currentTime();
              setDraft({
                bundleTransfers: [...draft.bundleTransfers, row],
              });
            }}
            style={[styles.addButton, locked && styles.disabled]}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </Pressable>
        }
      >
        {draft.activeBundleTransfers.map((transfer) => {
          const replacement = draft.bundleReplacementStatus.find(
            (row) => row.transfer_id === transfer.id,
          );
          const replacementDraft =
            draft.bundleReplacementDrafts[transfer.id];

          return (
            <View key={transfer.id} style={styles.transferCard}>
              <View style={styles.innerHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.innerTitle}>
                    Bundle {transfer.bundle_no}
                    {transfer.bundle_section
                      ? ` · ${transfer.bundle_section}`
                      : ""}
                  </Text>
                  <Text style={styles.helper}>
                    From{" "}
                    {payload.towers.find(
                      (tower) => tower.id === transfer.source_tower_id,
                    )?.name || "another tower"}{" "}
                    · Qty {transfer.quantity} ·{" "}
                    {transfer.status.replace(/_/g, " ")}
                  </Text>
                </View>
                {transfer.status === "in_transit" ? (
                  <Pressable
                    disabled={locked}
                    onPress={() => markIncomingReceived(transfer.id)}
                    style={styles.smallBlue}
                  >
                    <Text style={styles.smallBlueText}>Receive</Text>
                  </Pressable>
                ) : null}
              </View>

              {replacement && replacement.remaining_quantity > 0 ? (
                <View style={styles.replacementBox}>
                  <Text style={styles.subHeading}>
                    Replacement still required at source
                  </Text>
                  <Text style={styles.helper}>
                    {replacement.remaining_quantity} bundle
                    {replacement.remaining_quantity === 1 ? "" : "s"} remaining
                  </Text>
                  <View style={styles.twoCol}>
                    <View style={styles.col}>
                      <Field
                        label="Replacement qty"
                        value={replacementDraft?.quantity || ""}
                        onChangeText={(quantity) =>
                          setDraft({
                            bundleReplacementDrafts: {
                              ...draft.bundleReplacementDrafts,
                              [transfer.id]: {
                                quantity,
                                occurred_time:
                                  replacementDraft?.occurred_time ||
                                  currentTime(),
                              },
                            },
                          })
                        }
                        keyboardType="numeric"
                        disabled={locked}
                      />
                    </View>
                    <View style={styles.col}>
                      <Field
                        label="Delivery time"
                        value={replacementDraft?.occurred_time || ""}
                        onChangeText={(occurred_time) =>
                          setDraft({
                            bundleReplacementDrafts: {
                              ...draft.bundleReplacementDrafts,
                              [transfer.id]: {
                                quantity:
                                  replacementDraft?.quantity || "",
                                occurred_time,
                              },
                            },
                          })
                        }
                        placeholder="14:30"
                        disabled={locked}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {draft.bundleTransfers.map((transfer, index) => (
          <View key={transfer.ui_id} style={styles.innerCard}>
            <View style={styles.innerHead}>
              <Text style={styles.innerTitle}>
                New transfer {index + 1}
              </Text>
              <Pressable
                disabled={locked}
                onPress={() =>
                  setDraft({
                    bundleTransfers: draft.bundleTransfers.filter(
                      (_, rowIndex) => rowIndex !== index,
                    ),
                  })
                }
                style={styles.remove}
              >
                <Ionicons name="close" size={17} color="#b91c1c" />
              </Pressable>
            </View>

            <PickerField
              label="Source tower"
              value={transfer.source_tower_id}
              placeholder="Select source tower"
              disabled={locked}
              options={towerOptions.filter(
                (option) => option.value !== draft.towerId,
              )}
              onSelect={(source_tower_id) => {
                updateTransfer(index, {
                  source_tower_id,
                  source_bundle_id: "",
                  destination_bundle_id: "",
                });
                setTransferResults((current) => ({
                  ...current,
                  [transfer.ui_id]: [],
                }));
              }}
            />

            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Source bundle"
                  value={transferSearch[transfer.ui_id] || ""}
                  onChangeText={(value) =>
                    setTransferSearch((current) => ({
                      ...current,
                      [transfer.ui_id]: value,
                    }))
                  }
                  placeholder="Bundle number / section"
                  disabled={locked}
                />
              </View>
              <Pressable
                disabled={
                  locked ||
                  !transfer.source_tower_id ||
                  transferSearching === transfer.ui_id
                }
                onPress={() => void searchTransferBundles(index)}
                style={styles.searchButton}
              >
                {transferSearching === transfer.ui_id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="search" size={18} color="#fff" />
                )}
              </Pressable>
            </View>

            {(transferResults[transfer.ui_id] || []).map((result) => (
              <Pressable
                key={result.source_record_id}
                onPress={() => void chooseTransferSource(index, result)}
                style={styles.result}
              >
                <Text style={styles.resultTitle}>
                  {result.item_reference}
                </Text>
                <Text style={styles.resultSub}>
                  {result.item_description}
                </Text>
              </Pressable>
            ))}

            {transfer.source_bundle_id &&
            transfer.destination_bundle_id ? (
              <View style={styles.successBox}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#15803d"
                />
                <Text style={styles.successText}>
                  Matching current-tower bundle found.
                </Text>
              </View>
            ) : null}

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field
                  label="Quantity"
                  value={transfer.quantity}
                  onChangeText={(quantity) =>
                    updateTransfer(index, { quantity })
                  }
                  keyboardType="numeric"
                  disabled={locked}
                />
              </View>
              <View style={styles.col}>
                <Field
                  label="Transfer time"
                  value={transfer.occurred_time}
                  onChangeText={(occurred_time) =>
                    updateTransfer(index, { occurred_time })
                  }
                  placeholder="10:30"
                  disabled={locked}
                />
              </View>
            </View>

            <Text style={styles.subHeading}>
              Optional replacement already returned
            </Text>

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field
                  label="Replacement qty"
                  value={transfer.replacement_quantity}
                  onChangeText={(replacement_quantity) =>
                    updateTransfer(index, { replacement_quantity })
                  }
                  keyboardType="numeric"
                  disabled={locked}
                />
              </View>
              <View style={styles.col}>
                <Field
                  label="Replacement time"
                  value={transfer.replacement_time}
                  onChangeText={(replacement_time) =>
                    updateTransfer(index, { replacement_time })
                  }
                  placeholder="15:00"
                  disabled={locked}
                />
              </View>
            </View>

            <Field
              label="Transfer notes"
              value={transfer.notes}
              onChangeText={(notes) => updateTransfer(index, { notes })}
              multiline
              disabled={locked}
            />
          </View>
        ))}

        {draft.activeBundleTransfers.length === 0 &&
        draft.bundleTransfers.length === 0 ? (
          <Text style={styles.empty}>No bundle transfers for this docket.</Text>
        ) : null}
      </Card>

      <Card
        title="Mobilisation"
        subtitle="Mobilisation time is deducted only from the workers selected below."
        action={
          <Switch
            disabled={locked}
            value={draft.mobilisation.enabled}
            onValueChange={(enabled) =>
              setDraft({
                mobilisation: {
                  ...draft.mobilisation,
                  enabled,
                  to_tower_id:
                    draft.mobilisation.to_tower_id || draft.towerId,
                },
              })
            }
          />
        }
      >
        {draft.mobilisation.enabled ? (
          <>
            <Field
              label="Duration"
              value={draft.mobilisationHours}
              onChangeText={(mobilisationHours) =>
                setDraft({ mobilisationHours })
              }
              keyboardType="decimal-pad"
              suffix="hr"
              disabled={locked}
            />

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <PickerField
                  label="From tower"
                  value={draft.mobilisation.from_tower_id}
                  placeholder="Select tower"
                  options={towerOptions}
                  disabled={locked}
                  onSelect={(from_tower_id) =>
                    setDraft({
                      mobilisation: {
                        ...draft.mobilisation,
                        from_tower_id,
                      },
                    })
                  }
                />
              </View>
              <View style={styles.col}>
                <PickerField
                  label="To tower"
                  value={draft.mobilisation.to_tower_id}
                  placeholder="Select tower"
                  options={towerOptions}
                  disabled={locked}
                  onSelect={(to_tower_id) =>
                    setDraft({
                      mobilisation: {
                        ...draft.mobilisation,
                        to_tower_id,
                      },
                    })
                  }
                />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Stage</Text>
              <View style={styles.chips}>
                {MOB_STATUSES.map((status) => (
                  <Chip
                    key={status.value}
                    label={status.label}
                    disabled={locked}
                    selected={draft.mobilisation.status === status.value}
                    onPress={() =>
                      setDraft({
                        mobilisation: {
                          ...draft.mobilisation,
                          status: status.value,
                        },
                      })
                    }
                  />
                ))}
              </View>
            </View>

            <Field
              label="Percent complete"
              value={draft.mobilisation.percent_complete}
              onChangeText={(percent_complete) =>
                setDraft({
                  mobilisation: {
                    ...draft.mobilisation,
                    percent_complete,
                  },
                })
              }
              keyboardType="decimal-pad"
              suffix="%"
              disabled={locked}
            />

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Workers mobilising</Text>
              <View style={styles.chips}>
                {workerNames.map((name) => {
                  const selected = draft.mobilisation.worker_names.some(
                    (item) => normalise(item) === normalise(name),
                  );

                  return (
                    <Chip
                      key={name}
                      label={name}
                      disabled={locked}
                      selected={selected}
                      onPress={() =>
                        setDraft({
                          mobilisation: {
                            ...draft.mobilisation,
                            worker_names: selected
                              ? draft.mobilisation.worker_names.filter(
                                  (item) =>
                                    normalise(item) !== normalise(name),
                                )
                              : [
                                  ...draft.mobilisation.worker_names,
                                  name,
                                ],
                          },
                        })
                      }
                    />
                  );
                })}
              </View>
            </View>

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field
                  label="Started"
                  value={draft.mobilisation.started_date}
                  onChangeText={(started_date) =>
                    setDraft({
                      mobilisation: {
                        ...draft.mobilisation,
                        started_date,
                      },
                    })
                  }
                  placeholder="YYYY-MM-DD"
                  disabled={locked}
                />
              </View>
              <View style={styles.col}>
                <Field
                  label="Target move"
                  value={draft.mobilisation.target_move_date}
                  onChangeText={(target_move_date) =>
                    setDraft({
                      mobilisation: {
                        ...draft.mobilisation,
                        target_move_date,
                      },
                    })
                  }
                  placeholder="YYYY-MM-DD"
                  disabled={locked}
                />
              </View>
            </View>

            <Field
              label="Completed"
              value={draft.mobilisation.completed_date}
              onChangeText={(completed_date) =>
                setDraft({
                  mobilisation: {
                    ...draft.mobilisation,
                    completed_date,
                  },
                })
              }
              placeholder="YYYY-MM-DD"
              disabled={locked}
            />

            <Field
              label="Mobilisation notes"
              value={draft.mobilisation.notes}
              onChangeText={(notes) =>
                setDraft({
                  mobilisation: {
                    ...draft.mobilisation,
                    notes,
                  },
                })
              }
              multiline
              disabled={locked}
            />
          </>
        ) : (
          <Text style={styles.empty}>No crew mobilisation recorded.</Text>
        )}
      </Card>

      <Card
        title="Defects"
        subtitle="Link an existing controlled DEF or raise a new one with photos. The Defect remains in the shared Quality register."
        action={
          <View style={{ flexDirection: "row", gap: 7 }}>
            <Pressable
              disabled={locked || unlinkedDefects.length === 0}
              onPress={() => setExistingDefectPickerOpen(true)}
              style={[
                styles.outlineSmall,
                (locked || unlinkedDefects.length === 0) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.outlineSmallText}>Link</Text>
            </Pressable>
            <Pressable
              disabled={locked}
              onPress={() => setNewDefectOpen(true)}
              style={[styles.addButton, locked && styles.disabled]}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
        }
      >
        {draft.linkedDefects.length === 0 ? (
          <Text style={styles.empty}>No Defects linked to this docket.</Text>
        ) : (
          draft.linkedDefects.map((defect) => (
            <View key={defect.id} style={styles.defectRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.defectNumber}>
                  {defect.defect_number || "Defect"} · {defect.status}
                </Text>
                <Text style={styles.defectDesc}>
                  {defect.description || "No description"}
                </Text>
                <Text style={styles.helper}>
                  {defect.link_type === "raised"
                    ? "Raised from this Daily Docket"
                    : "Referenced by this Daily Docket"}
                </Text>
              </View>
              <Pressable
                disabled={locked}
                onPress={() =>
                  setDraft({
                    linkedDefects: draft.linkedDefects.filter(
                      (row) => row.id !== defect.id,
                    ),
                  })
                }
                style={styles.remove}
              >
                <Ionicons name="close" size={17} color="#b91c1c" />
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Card
        title="Incident / Safety"
        subtitle="Safety observations are available as a non-incident event type."
        action={
          <Switch
            disabled={locked}
            value={draft.incidentOccurred}
            onValueChange={(incidentOccurred) =>
              setDraft({
                incidentOccurred,
                incidentType: incidentOccurred ? draft.incidentType : "",
                incidentNotes: incidentOccurred ? draft.incidentNotes : "",
              })
            }
          />
        }
      >
        {draft.incidentOccurred ? (
          <>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.chips}>
                {INCIDENT_TYPES.map((item) => (
                  <Chip
                    key={item.value}
                    label={item.label}
                    disabled={locked}
                    selected={draft.incidentType === item.value}
                    onPress={() =>
                      setDraft({ incidentType: item.value })
                    }
                  />
                ))}
              </View>
            </View>

            <Field
              label="Incident / observation notes"
              value={draft.incidentNotes}
              onChangeText={(incidentNotes) =>
                setDraft({ incidentNotes })
              }
              multiline
              disabled={locked}
            />
          </>
        ) : (
          <Text style={styles.empty}>
            No incident, near miss or safety observation recorded.
          </Text>
        )}
      </Card>

      <Modal
        visible={existingDefectPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setExistingDefectPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setExistingDefectPickerOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Link Existing Defect</Text>
            <ScrollView
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ gap: 7 }}
            >
              {unlinkedDefects.map((defect) => (
                <Pressable
                  key={defect.id}
                  onPress={() => linkExistingDefect(defect)}
                  style={styles.option}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>
                      {defect.defect_number || "Defect"} · {defect.status}
                    </Text>
                    <Text style={styles.optionSub}>
                      {defect.description || "No description"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.sheetClose}
              onPress={() => setExistingDefectPickerOpen(false)}
            >
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={newDefectOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewDefectOpen(false)}
      >
        <View style={styles.defectModal}>
          <View style={styles.defectModalHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Raise Controlled Defect</Text>
              <Text style={styles.helper}>
                TTTracker assigns the real DEF number immediately.
              </Text>
            </View>
            <Pressable
              onPress={() => setNewDefectOpen(false)}
              style={styles.remove}
            >
              <Ionicons name="close" size={20} color="#334155" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.defectModalContent}
            keyboardShouldPersistTaps="handled"
          >
            <PickerField
              label="Common issue"
              value={newDefect.issueTypeId}
              placeholder="Other / not selected"
              options={[
                { value: "__other__", label: "Other" },
                ...payload.defectIssueTypes
                  .filter(
                    (row) =>
                      row.active &&
                      ["defect", "both"].includes(row.applies_to),
                  )
                  .map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
              ]}
              onSelect={(issueTypeId) =>
                setNewDefect((current) => ({
                  ...current,
                  issueTypeId,
                }))
              }
            />

            {newDefect.issueTypeId === "__other__" ? (
              <Field
                label="Other issue"
                value={newDefect.otherIssueText}
                onChangeText={(otherIssueText) =>
                  setNewDefect((current) => ({
                    ...current,
                    otherIssueText,
                  }))
                }
              />
            ) : null}

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field
                  label="Member"
                  value={newDefect.memberNumber}
                  onChangeText={(memberNumber) =>
                    setNewDefect((current) => ({
                      ...current,
                      memberNumber,
                    }))
                  }
                />
              </View>
              <View style={styles.col}>
                <Field
                  label="Segment"
                  value={newDefect.segment}
                  onChangeText={(segment) =>
                    setNewDefect((current) => ({
                      ...current,
                      segment,
                    }))
                  }
                />
              </View>
            </View>

            <Field
              label="Drawing"
              value={newDefect.drawingNumber}
              onChangeText={(drawingNumber) =>
                setNewDefect((current) => ({
                  ...current,
                  drawingNumber,
                }))
              }
            />

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Severity</Text>
              <View style={styles.chips}>
                {(["Minor", "Major", "Critical"] as MobileDefectSeverity[]).map(
                  (severity) => (
                    <Chip
                      key={severity}
                      label={severity}
                      selected={newDefect.severity === severity}
                      onPress={() =>
                        setNewDefect((current) => ({
                          ...current,
                          severity,
                        }))
                      }
                    />
                  ),
                )}
              </View>
            </View>

            <PickerField
              label="Assigned to"
              value={newDefect.assignedToUserId}
              placeholder="Unassigned"
              options={[
                { value: "", label: "Unassigned" },
                ...defectAssignees.map((user) => ({
                  value: user.id,
                  label: user.name,
                  subtitle: [user.role, user.email]
                    .filter(Boolean)
                    .join(" · "),
                })),
              ]}
              onSelect={(assignedToUserId) =>
                setNewDefect((current) => ({
                  ...current,
                  assignedToUserId,
                }))
              }
            />

            <Field
              label="Description"
              value={newDefect.description}
              onChangeText={(description) =>
                setNewDefect((current) => ({
                  ...current,
                  description,
                }))
              }
              multiline
              placeholder="Describe what was identified and where."
            />

            <QualityPhotoPicker
              label="Defect photos"
              photos={newDefect.photos}
              onChange={(photos) =>
                setNewDefect((current) => ({
                  ...current,
                  photos,
                }))
              }
              prefix="daily-docket-defect"
            />

            <Pressable
              disabled={creatingDefect}
              onPress={() => void createControlledDefect()}
              style={[
                styles.createDefectButton,
                creatingDefect && styles.disabled,
              ]}
            >
              {creatingDefect ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="shield-checkmark" size={19} color="#fff" />
              )}
              <Text style={styles.createDefectText}>
                Create & Link Defect
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

export default DailyDocketSiteEvents;

const styles = StyleSheet.create({
  stack: { gap: 14 },
  stackSmall: { gap: 9 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 15,
    gap: 14,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  cardSub: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 18,
  },
  innerCard: {
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 15,
    backgroundColor: "#fff",
  },
  innerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  innerTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 14,
  },
  itemTitle: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 12,
  },
  fieldWrap: { gap: 6 },
  label: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  inputFrame: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  multilineFrame: {
    minHeight: 86,
    alignItems: "flex-start",
  },
  input: {
    flex: 1,
    color: "#0f172a",
    fontSize: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  multilineInput: { minHeight: 82 },
  suffix: {
    paddingRight: 10,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
  },
  pickerButton: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  pickerText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  pickerSub: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 2,
  },
  placeholder: { color: "#94a3b8", fontWeight: "500" },
  twoCol: { flexDirection: "row", gap: 9 },
  col: { flex: 1 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  chipText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  chipTextActive: { color: "#fff" },
  addButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#2563eb",
  },
  remove: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#fef2f2",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  switchTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  helper: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
  },
  empty: {
    color: "#64748b",
    textAlign: "center",
    paddingVertical: 16,
    fontSize: 12,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  searchButton: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#0f172a",
  },
  resultList: { gap: 6 },
  result: {
    padding: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
  },
  resultTitle: {
    color: "#1e3a8a",
    fontWeight: "900",
    fontSize: 12,
  },
  resultSub: {
    marginTop: 2,
    color: "#475569",
    fontSize: 10,
    lineHeight: 14,
  },
  materialItem: {
    gap: 9,
    padding: 11,
    borderRadius: 13,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  selectedMaterial: {
    padding: 10,
    borderRadius: 11,
    backgroundColor: "#ecfdf5",
  },
  selectedMaterialTitle: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12,
  },
  outlineButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  outlineButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 11,
  },
  outstandingWrap: {
    gap: 7,
    padding: 11,
    borderRadius: 13,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  outstandingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#fde68a",
  },
  outstandingTitle: {
    color: "#78350f",
    fontWeight: "900",
    fontSize: 12,
  },
  subHeading: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  smallBlue: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "#2563eb",
  },
  smallBlueText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  transferCard: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  replacementBox: {
    gap: 8,
    padding: 10,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 9,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
  },
  successText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "800",
  },
  defectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 13,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  defectNumber: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 12,
  },
  defectDesc: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  outlineSmall: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  outlineSmallText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  sheet: {
    maxHeight: "78%",
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#fff",
  },
  handle: {
    width: 44,
    height: 5,
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
    marginBottom: 13,
  },
  sheetTitle: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 12,
  },
  option: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  optionActive: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  optionLabel: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 13,
  },
  optionLabelActive: { color: "#1d4ed8" },
  optionSub: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
  },
  sheetClose: {
    minHeight: 43,
    marginTop: 13,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#0f172a",
  },
  sheetCloseText: {
    color: "#fff",
    fontWeight: "900",
  },
  defectModal: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingTop: 12,
  },
  defectModalHead: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  defectModalContent: {
    padding: 16,
    paddingBottom: 50,
    gap: 13,
  },
  createDefectButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: "#0f172a",
  },
  createDefectText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  disabled: { opacity: 0.45 },
});
