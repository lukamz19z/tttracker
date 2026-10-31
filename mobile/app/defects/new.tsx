import { QualityLegField } from "@/components/quality/QualityLegField";
import { qualityDisplayName } from "../../../lib/quality/display-name";
import { router } from "expo-router";
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
  getDefectAssignees,
  getDefectWorkflowOptions,
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
  leg:string|null;
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
  notifyUserIds: string[];
  requiredBy: string;
  workImpact: string;
  affectedActivity: string;
  urgencyNote: string;
  photos: LocalQualityPhoto[];
};

const BLANK: FormState = {
  leg:null,
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
  notifyUserIds: [],
  requiredBy: "",
  workImpact: "No Immediate Impact",
  affectedActivity: "",
  urgencyNote: "",
  photos: [],
};

function NewDefectContent() {
  const { data } = useQuality();
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
  const [workflowOptions,setWorkflowOptions]=useState({workImpactOptions:["No Immediate Impact","May Delay Work","Blocks Work"],affectedActivityOptions:["Assembly","Erection","Revision","Stringing","Delivery","Inspection","Other"]});
  const [saving, setSaving] = useState(false);
  const [memberLoading, setMemberLoading] =
    useState(false);

  const [towerPickerOpen, setTowerPickerOpen] =
    useState(false);
  const [issuePickerOpen, setIssuePickerOpen] =
    useState(false);
  const [severityPickerOpen, setSeverityPickerOpen] =
    useState(false);
  const [workImpactPickerOpen,setWorkImpactPickerOpen]=useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] =
    useState(false);
  const [notifyPickerOpen,setNotifyPickerOpen]=useState(false);
  const [activityPickerOpen,setActivityPickerOpen]=useState(false);
  const [customActivity,setCustomActivity]=useState(false);

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
        label: qualityDisplayName(user.name),
        subtitle: [user.role]
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
          leg:saved.leg || null,
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
          notifyUserIds:saved.notifyUserIds||[],requiredBy:saved.requiredBy||"",workImpact:saved.workImpact||"No Immediate Impact",affectedActivity:saved.affectedActivity||"",urgencyNote:saved.urgencyNote||"",
          photos: saved.photos ?? [],
        });
      }

      draftHydrated.current = true;
    })();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(()=>{if(projectId)void getDefectWorkflowOptions(projectId).then(setWorkflowOptions).catch(()=>undefined);},[projectId]);

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
        await enqueueDefectCreate({
          projectId,
          towerId: form.towerId,
          leg:form.leg,
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
          notifyUserIds:form.notifyUserIds,
          requiredBy:form.requiredBy.trim()||null,
          workImpact:form.workImpact||null,
          affectedActivity:form.affectedActivity.trim()||null,
          urgencyNote:form.urgencyNote.trim()||null,
          photos: form.photos,
        });

      await clearDefectWorkingDraft(projectId);
      if(online) await syncNow({manual:false});
      Alert.alert("Defect saved", "Details and evidence are saved locally. Pending changes remain queued until the server confirms them.",[{text:"OK",onPress:()=>router.back()}]);
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

      <QualityPhotoPicker
        context={{timeZone:data?.project?.timezone,project:data?.project?.project_number,kind:"defect",phase:"BEFORE",leg:form.leg,reference:"Pending DEF",tower:towerLabel,segment:form.segment,member:form.memberNumber,drawing:form.drawingNumber,assignedFlag:form.clientReference,issue:issueOptions.find(row=>row.id===form.issueTypeId)?.label}}
        label="Take defect photo"
        photos={form.photos}
        onChange={(photos) => setForm(current => ({ ...current, photos }))}
        prefix="defect"
      />

      <Text style={styles.label}>Work impact</Text>
      <Pressable style={styles.selector} onPress={()=>setWorkImpactPickerOpen(true)}><Text style={styles.selectorText}>{form.workImpact||"No Immediate Impact"}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
      <Text style={styles.label}>Required By · DD/MM/YYYY</Text>
      <TextInput value={form.requiredBy} onChangeText={requiredBy=>setForm(current=>({...current,requiredBy}))} placeholder="Optional · e.g. 01/11/2026" keyboardType="numbers-and-punctuation" style={styles.input}/>
      <Text style={styles.label}>Affected activity</Text>
      <Pressable style={styles.selector} onPress={()=>setActivityPickerOpen(true)}><Text style={styles.selectorText}>{form.affectedActivity||"Optional"}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
      {customActivity?<TextInput value={form.affectedActivity} onChangeText={affectedActivity=>setForm(current=>({...current,affectedActivity}))} placeholder="Enter activity" style={styles.input}/>:null}
      <Text style={styles.label}>Urgency / impact note</Text>
      <TextInput value={form.urgencyNote} onChangeText={urgencyNote=>setForm(current=>({...current,urgencyNote}))} placeholder="What work is at risk?" style={styles.input}/>

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
      <Text style={styles.label}>Also notify (optional)</Text>
      {form.notifyUserIds.map(id=>{const person=assignees.find(user=>user.id===id);return <Pressable key={id} onPress={()=>setForm(current=>({...current,notifyUserIds:current.notifyUserIds.filter(value=>value!==id)}))} style={styles.notifyChip}><Text style={{fontSize:12,fontWeight:"700",color:"#334155"}}>{qualityDisplayName(person?.name)||"Project user"} ×</Text></Pressable>;})}
      <Pressable style={[styles.selector,{minHeight:40}]} onPress={()=>setNotifyPickerOpen(true)}><Text style={styles.selectorText}>Add person to notify</Text><ChevronDown size={18} color="#64748b"/></Pressable>

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

      <QualityLegField value={form.leg} onChange={leg=>setForm(current=>({...current,leg}))} />
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
      <QualitySelector visible={workImpactPickerOpen} title="Work impact" options={[{id:"",label:"Not specified"},...workflowOptions.workImpactOptions.map(value=>({id:value,label:value}))]} onClose={()=>setWorkImpactPickerOpen(false)} onSelect={option=>{setForm(current=>({...current,workImpact:option.id}));setWorkImpactPickerOpen(false);}}/>
      <QualitySelector visible={activityPickerOpen} title="Affected activity" options={[{id:"",label:"Not specified"},...workflowOptions.affectedActivityOptions.map(value=>({id:value,label:value})),{id:"__other__",label:"Other / enter a value"}]} onClose={()=>setActivityPickerOpen(false)} onSelect={option=>{setCustomActivity(option.id==="__other__");setForm(current=>({...current,affectedActivity:option.id==="__other__"?"":option.id}));setActivityPickerOpen(false);}}/>
      <QualitySelector visible={notifyPickerOpen} title="Also notify" options={assignees.filter(person=>person.id!==form.assignedToUserId&&!form.notifyUserIds.includes(person.id)).map(person=>({id:person.id,label:qualityDisplayName(person.name),subtitle:person.role}))} onClose={()=>setNotifyPickerOpen(false)} onSelect={option=>{setForm(current=>({...current,notifyUserIds:[...current.notifyUserIds,option.id]}));setNotifyPickerOpen(false);}}/>
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
  notifyChip: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#f8fafc", paddingHorizontal: 11, paddingVertical: 7, marginBottom: 6 },
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
