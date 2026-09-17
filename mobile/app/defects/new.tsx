import { router, type Href } from "expo-router";
import {
  ChevronDown,
  Save,
} from "lucide-react-native";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { QualitySelector } from "@/components/quality/QualitySelector";
import { QualityShell } from "@/components/quality/QualityShell";
import { RevisionMemberFields } from "@/components/quality/RevisionMemberFields";
import { useQuality } from "@/contexts/QualityContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityMemberCatalog,
  refreshQualityMemberCatalog,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import {
  createDefect,
  getDefectAssignees,
  uploadDefectPhoto,
  type DefectAssignee,
  type MobileDefectSeverity,
} from "@/lib/api/defects";
import {
  clearDefectWorkingDraft,
  loadDefectWorkingDraft,
  saveDefectWorkingDraft,
} from "@/lib/offline/defect-drafts";
import { enqueueDefectCreate } from "@/lib/offline/quality-sync";
import type { LocalQualityPhoto } from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

type FormState = {
  towerId: string;
  issueTypeId: string | null;
  memberNumber: string;
  segment: string;
  drawingNumber: string;
  description: string;
  responsibility: string;
  clientReference: string;
  severity: MobileDefectSeverity;
  assignedToUserId: string | null;
  photos: LocalQualityPhoto[];
};

const BLANK: FormState = {
  towerId: "",
  issueTypeId: null,
  memberNumber: "",
  segment: "",
  drawingNumber: "",
  description: "",
  responsibility: "",
  clientReference: "",
  severity: "Minor",
  assignedToUserId: null,
  photos: [],
};

function NewDefectContent() {
  const { data, refresh } = useQuality();
  const { profile } = useAuth();
  const { online, syncNow } = useSync();

  const projectId =
    clean(data?.projectId) ||
    clean(profile?.projectId);

  const [form, setForm] = useState<FormState>(BLANK);
  const [members, setMembers] = useState<
    QualityMemberCatalogRow[]
  >([]);
  const [assignees, setAssignees] = useState<
    DefectAssignee[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [memberLoading, setMemberLoading] =
    useState(false);

  const [towerPickerOpen, setTowerPickerOpen] =
    useState(false);
  const [issuePickerOpen, setIssuePickerOpen] =
    useState(false);
  const [severityPickerOpen, setSeverityPickerOpen] =
    useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] =
    useState(false);

  const draftHydrated = useRef(false);

  const towers = useMemo(
    () => (Array.isArray(data?.towers) ? data.towers : []),
    [data?.towers],
  );
  const issueTypes = useMemo(
    () => (Array.isArray(data?.issueTypes) ? data.issueTypes : []),
    [data?.issueTypes],
  );

  const defectIssueTypes = useMemo(() => {
    const seen = new Set<string>();

    return issueTypes.filter((item) => {
      if (item.active === false) return false;
      if (
        !["defect", "both"].includes(
          clean(item.applies_to).toLowerCase(),
        )
      ) {
        return false;
      }

      const key = clean(item.name).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [issueTypes]);

  const towerOptions = useMemo(
    () =>
      towers
        .map((tower) => ({
          id: clean(tower.id),
          label: clean(tower.name) || clean(tower.id),
        }))
        .filter((option) => option.id),
    [towers],
  );

  const issueOptions = useMemo(
    () => [
      {
        id: "",
        label: "Other / not selected",
      },
      ...defectIssueTypes.map((item) => ({
        id: clean(item.id),
        label: clean(item.name),
      })),
    ],
    [defectIssueTypes],
  );

  const severityOptions = [
    { id: "Minor", label: "Minor" },
    { id: "Major", label: "Major" },
    { id: "Critical", label: "Critical" },
  ];

  const assigneeOptions = useMemo(
    () => [
      {
        id: "",
        label: "Unassigned",
      },
      ...assignees.map((user) => ({
        id: user.id,
        label: user.name,
        subtitle: [user.role, user.email]
          .filter(Boolean)
          .join(" · "),
      })),
    ],
    [assignees],
  );

  const towerLabel =
    towerOptions.find(
      (option) => option.id === form.towerId,
    )?.label || "Select tower";

  const issueLabel =
    issueOptions.find(
      (option) => option.id === (form.issueTypeId ?? ""),
    )?.label || "Other / not selected";

  const assigneeLabel =
    assigneeOptions.find(
      (option) =>
        option.id ===
        (form.assignedToUserId ?? ""),
    )?.label || "Unassigned";

  useEffect(() => {
    if (!projectId) return;

    let active = true;

    void (async () => {
      const saved =
        await loadDefectWorkingDraft(projectId);

      if (active && saved) {
        setForm({
          towerId: saved.towerId,
          issueTypeId: saved.issueTypeId,
          memberNumber: saved.memberNumber,
          segment: saved.segment,
          drawingNumber: saved.drawingNumber,
          description: saved.description,
          responsibility: saved.responsibility,
          clientReference: saved.clientReference,
          severity: saved.severity,
          assignedToUserId:
            saved.assignedToUserId,
          photos: saved.photos ?? [],
        });
      }

      draftHydrated.current = true;
    })();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !draftHydrated.current) return;

    const timer = setTimeout(() => {
      void saveDefectWorkingDraft({
        projectId,
        ...form,
        updatedAt: new Date().toISOString(),
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [form, projectId]);

  useEffect(() => {
    if (!projectId) return;

    void getDefectAssignees(projectId)
      .then(setAssignees)
      .catch(() => setAssignees([]));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !form.towerId) {
      setMembers([]);
      setMemberLoading(false);
      return;
    }

    let active = true;
    const towerId = form.towerId;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;

    // Never show member data from the previously selected tower.
    setMembers([]);

    /*
     * Cache and live refresh deliberately run independently.
     * A SQLite/cache problem must never prevent TTTracker from requesting the
     * current tower member register from the server.
     */
    void cachedQualityMemberCatalog(projectId, towerId)
      .then((cached) => {
        if (active && cached?.value?.length) {
          setMembers(cached.value);
        }
      })
      .catch((cacheError) => {
        console.warn(
          "Defect cached member catalogue could not be loaded; using live data",
          cacheError,
        );
      });

    if (!online) {
      setMemberLoading(false);

      return () => {
        active = false;
      };
    }

    setMemberLoading(true);

    // Do not leave the field showing an endless spinner on a slow connection.
    // The request itself is allowed to finish and can still populate the list.
    loadingTimer = setTimeout(() => {
      if (active) {
        setMemberLoading(false);
        console.warn(
          "Defect live member catalogue is taking longer than 12 seconds",
          { projectId, towerId },
        );
      }
    }, 12_000);

    void refreshQualityMemberCatalog(projectId, towerId)
      .then((live) => {
        if (active) {
          setMembers(Array.isArray(live) ? live : []);
        }
      })
      .catch((liveError) => {
        console.warn(
          "Defect live member catalogue could not be loaded; cached data retained",
          liveError,
        );
      })
      .finally(() => {
        if (loadingTimer) clearTimeout(loadingTimer);
        if (active) setMemberLoading(false);
      });

    return () => {
      active = false;
      if (loadingTimer) clearTimeout(loadingTimer);
    };
  }, [form.towerId, online, projectId]);

  function selectTower(towerId: string) {
    setForm((current) => ({
      ...current,
      towerId,
      memberNumber: "",
      segment: "",
      drawingNumber: "",
    }));
  }

  async function save() {
    if (!projectId) {
      Alert.alert(
        "Project required",
        "No active project is available.",
      );
      return;
    }

    if (!form.towerId) {
      Alert.alert(
        "Tower required",
        "Select the tower for this Defect.",
      );
      return;
    }

    if (!form.description.trim()) {
      Alert.alert(
        "Description required",
        "Describe what was identified.",
      );
      return;
    }

    setSaving(true);

    try {
      if (!online) {
        await enqueueDefectCreate({
          projectId,
          towerId: form.towerId,
          issueTypeId:
            clean(form.issueTypeId) || null,
          memberNumber:
            clean(form.memberNumber) || null,
          segment: clean(form.segment) || null,
          drawingNumber:
            clean(form.drawingNumber) || null,
          description: form.description.trim(),
          responsibility:
            clean(form.responsibility) || null,
          clientReference:
            clean(form.clientReference) || null,
          severity: form.severity,
          assignedToUserId:
            clean(form.assignedToUserId) || null,
          photos: form.photos,
        });

        await clearDefectWorkingDraft(projectId);

        Alert.alert(
          "Defect saved offline",
          "The Defect and its photos are queued. TTTracker will create the controlled Defect and upload the evidence when connection returns.",
          [
            {
              text: "OK",
              onPress: () => router.back(),
            },
          ],
        );
        return;
      }

      const payload = await createDefect({
        projectId,
        towerId: form.towerId,
        issueTypeId:
          clean(form.issueTypeId) || null,
        memberNumber:
          clean(form.memberNumber) || null,
        segment: clean(form.segment) || null,
        drawingNumber:
          clean(form.drawingNumber) || null,
        description: form.description.trim(),
        responsibility:
          clean(form.responsibility) || null,
        clientReference:
          clean(form.clientReference) || null,
        severity: form.severity,
        assignedToUserId:
          clean(form.assignedToUserId) || null,
      });

      const defectId = clean(payload.defect?.id);

      if (!defectId) {
        throw new Error(
          "The Defect was created but its ID was not returned.",
        );
      }

      let photoWarning: string | null = null;

      for (const photo of form.photos) {
        try {
          await uploadDefectPhoto({
            projectId,
            towerId: form.towerId,
            defectId,
            photo,
          });
        } catch (error) {
          photoWarning =
            error instanceof Error
              ? error.message
              : "One or more photos could not be uploaded.";
          break;
        }
      }

      await clearDefectWorkingDraft(projectId);
      await refresh();
      void syncNow();

      const defectNumber =
        clean(payload.defect?.defect_number) ||
        "Defect";

      Alert.alert(
        `${defectNumber} created`,
        [
          payload.warning,
          photoWarning
            ? `The Defect exists, but photo upload needs attention: ${photoWarning}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n") ||
          "The Defect is now in the shared register.",
        [
          {
            text: "Open",
            onPress: () =>
              router.replace(
                `/defects/${encodeURIComponent(
                  defectId,
                )}` as Href,
              ),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Could not save Defect",
        error instanceof Error
          ? error.message
          : "Unknown error.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <QualityShell
      permission="mobile.defects"
      title="New Defect"
      subtitle={
        online
          ? "Create directly in the controlled Defect register."
          : "Offline capture is active. Details and photos will queue safely."
      }
    >
      <Text style={styles.label}>Tower *</Text>
      <Pressable
        style={styles.selector}
        onPress={() => setTowerPickerOpen(true)}
      >
        <Text style={styles.selectorText}>
          {towerLabel}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </Pressable>

      <Text style={styles.label}>Common issue</Text>
      <Pressable
        style={styles.selector}
        onPress={() => setIssuePickerOpen(true)}
      >
        <Text style={styles.selectorText}>
          {issueLabel}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </Pressable>

      {form.towerId ? (
        <>
          {memberLoading ? (
            <View style={styles.loadingLine}>
              <ActivityIndicator size="small" />
              <Text style={styles.helper}>
                Loading tower members…
              </Text>
            </View>
          ) : null}

          <RevisionMemberFields
            members={members}
            segment={form.segment}
            memberNumber={form.memberNumber}
            drawingNumber={form.drawingNumber}
            onSegmentChange={(
              segment,
              keepCurrentMember,
            ) =>
              setForm((current) => ({
                ...current,
                segment,
                memberNumber: keepCurrentMember
                  ? current.memberNumber
                  : "",
                drawingNumber: keepCurrentMember
                  ? current.drawingNumber
                  : "",
              }))
            }
            onSelectMember={(member) =>
              setForm((current) => ({
                ...current,
                memberNumber: clean(
                  member.memberNumber,
                ),
                segment:
                  clean(member.towerSegment) ||
                  current.segment,
                drawingNumber: clean(
                  member.drawingNumber,
                ),
              }))
            }
          />
        </>
      ) : (
        <Text style={styles.helper}>
          Select the tower first so TTTracker can
          load the correct steel register.
        </Text>
      )}

      <Text style={styles.label}>Severity *</Text>
      <Pressable
        style={styles.selector}
        onPress={() =>
          setSeverityPickerOpen(true)
        }
      >
        <Text style={styles.selectorText}>
          {form.severity}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </Pressable>

      <Text style={styles.label}>Assigned to</Text>
      <Pressable
        style={styles.selector}
        onPress={() =>
          setAssigneePickerOpen(true)
        }
      >
        <Text style={styles.selectorText}>
          {assigneeLabel}
        </Text>
        <ChevronDown size={18} color="#64748b" />
      </Pressable>

      <Text style={styles.label}>Responsibility</Text>
      <TextInput
        value={form.responsibility}
        onChangeText={(responsibility) =>
          setForm((current) => ({
            ...current,
            responsibility,
          }))
        }
        placeholder="BC / UGL / Supplier / Client"
        style={styles.input}
      />

      <Text style={styles.label}>
        Client / RFI reference
      </Text>
      <TextInput
        value={form.clientReference}
        onChangeText={(clientReference) =>
          setForm((current) => ({
            ...current,
            clientReference,
          }))
        }
        placeholder="Optional"
        style={styles.input}
      />

      <Text style={styles.label}>
        Defect description *
      </Text>
      <TextInput
        multiline
        value={form.description}
        onChangeText={(description) =>
          setForm((current) => ({
            ...current,
            description,
          }))
        }
        placeholder="Describe what was identified and where."
        style={[styles.input, styles.multiline]}
      />

      <QualityPhotoPicker
        label="Defect photos"
        photos={form.photos}
        onChange={(photos) =>
          setForm((current) => ({
            ...current,
            photos,
          }))
        }
        prefix="defect"
      />

      <Pressable
        style={[
          styles.save,
          saving && styles.disabled,
        ]}
        disabled={saving}
        onPress={() => void save()}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Save size={18} color="#fff" />
        )}
        <Text style={styles.saveText}>
          {online
            ? "Create Defect"
            : "Save Defect Offline"}
        </Text>
      </Pressable>

      <QualitySelector
        visible={towerPickerOpen}
        title="Tower"
        options={towerOptions}
        onClose={() => setTowerPickerOpen(false)}
        onSelect={(option) => {
          selectTower(option.id);
          setTowerPickerOpen(false);
        }}
      />

      <QualitySelector
        visible={issuePickerOpen}
        title="Common issue"
        options={issueOptions}
        onClose={() => setIssuePickerOpen(false)}
        onSelect={(option) => {
          setForm((current) => ({
            ...current,
            issueTypeId: option.id || null,
          }));
          setIssuePickerOpen(false);
        }}
      />

      <QualitySelector
        visible={severityPickerOpen}
        title="Severity"
        options={severityOptions}
        onClose={() =>
          setSeverityPickerOpen(false)
        }
        onSelect={(option) => {
          setForm((current) => ({
            ...current,
            severity:
              option.id as MobileDefectSeverity,
          }));
          setSeverityPickerOpen(false);
        }}
      />

      <QualitySelector
        visible={assigneePickerOpen}
        title="Assigned to"
        options={assigneeOptions}
        onClose={() =>
          setAssigneePickerOpen(false)
        }
        onSelect={(option) => {
          setForm((current) => ({
            ...current,
            assignedToUserId:
              option.id || null,
          }));
          setAssigneePickerOpen(false);
        }}
      />
    </QualityShell>
  );
}

export default function NewDefectScreen() {
  return <NewDefectContent />;
}

const styles = StyleSheet.create({
  label: {
    marginTop: 4,
    marginBottom: 5,
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  selector: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectorText: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "800",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 13,
    color: "#0f172a",
  },
  multiline: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  helper: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
  },
  loadingLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  save: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#e11d48",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  saveText: {
    color: "#fff",
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.55,
  },
});
