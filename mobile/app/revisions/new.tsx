
import { router } from "expo-router";
import { ChevronDown, Save } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QualitySelector } from "@/components/quality/QualitySelector";
import { QualityShell } from "@/components/quality/QualityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import { createQualityRevision } from "@/lib/api/quality";
import {
  blankRevisionDraft,
  clearRevisionWorkingDraft,
  loadRevisionWorkingDraft,
  saveRevisionWorkingDraft,
  type RevisionWorkingDraft,
} from "@/lib/offline/revision-drafts";
import { enqueueRevisionCreate } from "@/lib/offline/quality-sync";
import {
  createLocalRevisionWorkspace,
  saveRevisionWorkspace,
} from "@/lib/offline/revision-workspaces";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isoToAustralianDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatAustralianDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function australianDateToIso(value: string) {
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return "";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function NewRevisionScreen() {
  const { data } = useQuality();
  const { profile } = useAuth();
  const { online } = useSync();

  const projectId = clean(profile?.projectId);
  const [draft, setDraft] = useState<RevisionWorkingDraft | null>(null);
  const [inspectionDateInput, setInspectionDateInput] = useState("");
  const [towerPickerOpen, setTowerPickerOpen] = useState(false);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState("Saved locally");
  const hydrated = useRef(false);

  const towers = useMemo(
    () => (Array.isArray(data?.towers) ? data.towers : []),
    [data?.towers],
  );

  const towerOptions = useMemo(
    () =>
      towers.map((tower) => ({
        id: tower.id,
        label: clean(tower.name) || tower.id,
        subtitle: [clean(tower.line), clean(tower.status)]
          .filter(Boolean)
          .join(" · "),
      })),
    [towers],
  );

  const stageOptions = useMemo(
    () =>
      (data?.workflow?.inspectionStages ?? [
        "Post Assembly",
        "Post Erection",
        "Other",
      ]).map((value) => ({
        id: value,
        label: value,
      })),
    [data?.workflow?.inspectionStages],
  );

  const selectedTower = towers.find(
    (tower) => tower.id === draft?.towerId,
  );

  useEffect(() => {
    if (!projectId) return;

    void (async () => {
      const cached = await loadRevisionWorkingDraft(projectId);
      const next = cached?.value ?? blankRevisionDraft(projectId);

      // Findings belong to the Revision detail screen now.
      next.findings = [];

      setDraft(next);
      setInspectionDateInput(
        isoToAustralianDate(next.inspectionDate),
      );
      hydrated.current = true;
    })();
  }, [projectId]);

  useEffect(() => {
    if (!draft || !hydrated.current) return;

    setSaveState("Saving…");

    const timer = setTimeout(() => {
      void saveRevisionWorkingDraft({
        ...draft,
        findings: [],
      })
        .then(() => setSaveState("Saved locally"))
        .catch(() => setSaveState("Local save failed"));
    }, 250);

    return () => clearTimeout(timer);
  }, [draft]);

  if (!draft) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="New Revision"
      >
        <ActivityIndicator />
      </QualityShell>
    );
  }

  async function createRevision() {
    const current = draft;
    if (!current) return;

    if (!current.towerId) {
      Alert.alert(
        "Tower required",
        "Select the tower for this Revision.",
      );
      return;
    }

    if (!current.inspectionDate) {
      Alert.alert(
        "Inspection date required",
        "Enter the date as DD-MM-YYYY.",
      );
      return;
    }

    setSaving(true);

    try {
      const clientMutationId = `revision-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

      const payload = {
        projectId: current.projectId,
        towerId: current.towerId,
        inspectionStage: current.inspectionStage,
        inspectionDate: current.inspectionDate,
        clientInspector: clean(current.clientInspector) || null,
        clientCompany: clean(current.clientCompany) || null,
        clientReference: clean(current.clientReference) || null,
        notes: clean(current.notes) || null,
        clientMutationId,
      };

      if (online) {
        try {
          const result = await createQualityRevision(payload);

          await clearRevisionWorkingDraft(projectId);

          router.replace(
            `/revisions/${encodeURIComponent(result.revision.id)}`,
          );
          return;
        } catch {
          // Fall through to offline queue. The user can continue
          // working on the Revision immediately.
        }
      }

      const workspace = createLocalRevisionWorkspace({
        ...payload,
      });

      await saveRevisionWorkspace(workspace);

      await enqueueRevisionCreate({
        ...payload,
        findings: [],
      });

      await clearRevisionWorkingDraft(projectId);

      router.replace(
        `/revisions/${encodeURIComponent(workspace.routeKey)}`,
      );
    } catch (error) {
      Alert.alert(
        "Revision could not be created",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <QualityShell
      permission="mobile.rectifications"
      title="New Revision"
      subtitle={`Create the RECT record first. ${saveState}. Findings are added from the Revision after it is created.`}
    >
      <View style={styles.card}>
        <Text style={styles.label}>Tower *</Text>
        <Pressable
          style={styles.selector}
          onPress={() => setTowerPickerOpen(true)}
        >
          <View style={styles.selectorTextWrap}>
            <Text style={styles.selectorTitle}>
              {clean(selectedTower?.name) || "Search / select tower"}
            </Text>
            {selectedTower ? (
              <Text style={styles.selectorSub}>
                {[clean(selectedTower.line), clean(selectedTower.status)]
                  .filter(Boolean)
                  .join(" · ") || selectedTower.id}
              </Text>
            ) : null}
          </View>
          <ChevronDown size={18} color="#64748b" />
        </Pressable>

        <Text style={styles.label}>Inspection stage *</Text>
        <Pressable
          style={styles.selector}
          onPress={() => setStagePickerOpen(true)}
        >
          <Text style={styles.selectorTitle}>
            {currentLabel(currentStage(draft.inspectionStage))}
          </Text>
          <ChevronDown size={18} color="#64748b" />
        </Pressable>

        <Text style={styles.label}>Inspection date *</Text>
        <TextInput
          value={inspectionDateInput}
          onChangeText={(value) => {
            const formatted = formatAustralianDateInput(value);
            setInspectionDateInput(formatted);

            setDraft((current) =>
              current
                ? {
                    ...current,
                    inspectionDate:
                      australianDateToIso(formatted),
                  }
                : current,
            );
          }}
          placeholder="DD-MM-YYYY"
          keyboardType="number-pad"
          maxLength={10}
          style={styles.input}
        />

        <Text style={styles.label}>Client inspector</Text>
        <TextInput
          value={draft.clientInspector}
          onChangeText={(clientInspector) =>
            setDraft({ ...draft, clientInspector })
          }
          style={styles.input}
        />

        <Text style={styles.label}>Client / company</Text>
        <TextInput
          value={draft.clientCompany}
          onChangeText={(clientCompany) =>
            setDraft({ ...draft, clientCompany })
          }
          style={styles.input}
        />

        <Text style={styles.label}>Client reference</Text>
        <TextInput
          value={draft.clientReference}
          onChangeText={(clientReference) =>
            setDraft({ ...draft, clientReference })
          }
          style={styles.input}
        />

        <Text style={styles.label}>Revision notes</Text>
        <TextInput
          multiline
          value={draft.notes}
          onChangeText={(notes) =>
            setDraft({ ...draft, notes })
          }
          style={[styles.input, styles.multiline]}
        />
      </View>

      <Pressable
        style={[styles.primary, saving && styles.disabled]}
        disabled={saving}
        onPress={() => void createRevision()}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Save size={18} color="#fff" />
        )}
        <Text style={styles.primaryText}>
          Create Revision
        </Text>
      </Pressable>

      <Text style={styles.help}>
        No tower list is rendered on this page. Tap the Tower field and
        search by tower name/number. Once created, the Revision opens and
        you can add FLIs, photos and rectifications over multiple visits.
      </Text>

      <QualitySelector
        visible={towerPickerOpen}
        title="Select Tower"
        options={towerOptions}
        onClose={() => setTowerPickerOpen(false)}
        onSelect={(option) =>
          setDraft((current) =>
            current
              ? { ...current, towerId: option.id }
              : current,
          )
        }
      />

      <QualitySelector
        visible={stagePickerOpen}
        title="Inspection Stage"
        options={stageOptions}
        onClose={() => setStagePickerOpen(false)}
        onSelect={(option) =>
          setDraft((current) =>
            current
              ? {
                  ...current,
                  inspectionStage:
                    option.id as RevisionWorkingDraft["inspectionStage"],
                }
              : current,
          )
        }
      />
    </QualityShell>
  );
}

function currentStage(value: string) {
  return value || "Post Erection";
}

function currentLabel(value: string) {
  return value;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 15,
    gap: 8,
  },
  label: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  selector: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorTextWrap: { flex: 1 },
  selectorTitle: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "800",
  },
  selectorSub: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0f172a",
  },
  multiline: {
    minHeight: 90,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  primary: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },
  disabled: { opacity: 0.5 },
  help: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});
